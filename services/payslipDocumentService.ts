/**
 * services/payslipDocumentService.ts
 *
 * Template-aware payslip printing & PDF generation for web and mobile.
 * Every output is produced from renderPayslipDocument(), the same HTML used by
 * the on-screen previews, so preview, print and PDF always match.
 *
 *  Web    → PDF via the existing secure cloud HTML→PDF function; if unavailable,
 *           the browser print dialog ("Save as PDF") renders the same HTML.
 *  Mobile → expo-print renders the HTML to a PDF file on the device, which can be
 *           opened, saved or shared.
 */

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { functions, httpsCallable } from "@/config/firebase";
import { PayslipTemplate } from "./payslipTemplateConfig";
import {
  PayslipOrganizationProfile,
  PayslipRenderData,
  isSafeLogoSrc,
  pageDimensionsMm,
  renderPayslipDocument,
} from "./payslipTemplateRenderer";
import { sanitizeFilename, saveBase64PdfToDevice, sharePdfFile, validatePdfBase64 } from "./pdfDownloadService";

export interface PayslipPdfResult {
  /** "file" = a PDF was produced; "print-dialog" = the browser print dialog was opened instead. */
  method: "file" | "print-dialog";
  uri?: string;
  filename: string;
  message: string;
}

const MM_TO_PT = 72 / 25.4;

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Returns the organization profile with its logo converted to an embeddable data URI,
 * so PDF engines never have to fetch it (avoids missing logos in generated files).
 * Unsupported or unreachable logos are dropped and the header falls back to text.
 */
export async function preparePayslipProfile(org: PayslipOrganizationProfile): Promise<PayslipOrganizationProfile> {
  const logo = (org.logo || "").trim();
  if (!logo) return { ...org, logo: undefined };
  if (/^data:image\//i.test(logo)) return { ...org, logo: isSafeLogoSrc(logo) ? logo : undefined };
  try {
    if (/^https?:\/\//i.test(logo)) {
      // Never let a slow network block PDF generation/sharing — fall back to the text header after 8s
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
      const res = await fetch(logo, controller ? { signal: controller.signal } : undefined).finally(() => {
        if (timer) clearTimeout(timer);
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!/^image\//.test(blob.type)) throw new Error("Not an image");
      const dataUri = await blobToDataUri(blob);
      return { ...org, logo: isSafeLogoSrc(dataUri) ? dataUri : logo };
    }
    if (Platform.OS !== "web" && /^(file|content):\/\//i.test(logo)) {
      const base64 = await FileSystem.readAsStringAsync(logo, { encoding: FileSystem.EncodingType.Base64 });
      const mime = /\.png$/i.test(logo) ? "image/png" : /\.webp$/i.test(logo) ? "image/webp" : "image/jpeg";
      return { ...org, logo: `data:${mime};base64,${base64}` };
    }
  } catch (err) {
    console.log("[PAYSLIP] Organization logo could not be loaded; rendering text header.", err);
    // Keep an http(s) URL — the renderer hides it gracefully if it fails to load.
    // A timed-out logo is dropped so the PDF engine doesn't wait on the same slow network.
    if (/^https?:\/\//i.test(logo) && (err as any)?.name !== "AbortError") return org;
  }
  return { ...org, logo: undefined };
}

export function payslipFilename(slips: PayslipRenderData[]): string {
  if (slips.length === 1) {
    const s = slips[0];
    const who = sanitizeFilename(s.employee.employeeId || s.employee.employeeName || "Employee");
    return `Payslip_${who}_${sanitizeFilename(s.meta.period || "period")}.pdf`;
  }
  const periods = Array.from(new Set(slips.map((s) => s.meta.period).filter(Boolean)));
  return `Payslips_${periods.length === 1 ? sanitizeFilename(periods[0]) : "bulk"}_${slips.length}.pdf`;
}

function openPrintDialogWeb(html: string): boolean {
  if (typeof document === "undefined") return false;
  // A hidden iframe avoids pop-up blockers and keeps the user on the page.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const frameDoc = iframe.contentWindow?.document;
  if (!frameDoc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return false;
  }
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();
  const win = iframe.contentWindow;
  const doPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      setTimeout(() => iframe.parentNode && iframe.parentNode.removeChild(iframe), 60_000);
    }
  };
  // Wait for images (logo) before printing so they are never missing.
  const imgs = Array.from(frameDoc.images || []);
  const pending = imgs.filter((img) => !img.complete);
  if (pending.length === 0) setTimeout(doPrint, 150);
  else {
    let left = pending.length;
    const done = () => {
      left -= 1;
      if (left <= 0) setTimeout(doPrint, 100);
    };
    pending.forEach((img) => {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
    setTimeout(doPrint, 4000); // safety net
  }
  return true;
}

/** Opens the system print dialog for one or more payslips. */
export async function printPayslips(template: PayslipTemplate, slips: PayslipRenderData[]): Promise<void> {
  if (slips.length === 0) throw new Error("No payslips selected.");
  const html = renderPayslipDocument(template, slips, { mode: "print" });
  if (Platform.OS === "web") {
    if (!openPrintDialogWeb(html)) throw new Error("Unable to open the print dialog in this browser.");
    return;
  }
  const Print = require("expo-print");
  await Print.printAsync({ html, orientation: template.page.orientation === "landscape" ? "landscape" : "portrait" });
}

/**
 * Produces a PDF for one or more payslips (bulk = one document, one slip per page).
 */
export async function generatePayslipsPdf(
  template: PayslipTemplate,
  slips: PayslipRenderData[],
  opts: { organizationId?: string } = {}
): Promise<PayslipPdfResult> {
  if (slips.length === 0) throw new Error("No payslips selected.");
  const filename = payslipFilename(slips);
  const html = renderPayslipDocument(template, slips, { mode: "print" });

  if (Platform.OS === "web") {
    try {
      const callable = httpsCallable<any, any>(functions, "generatePdfFromHtmlCallable");
      const res = await callable({
        html,
        filename,
        organizationId: opts.organizationId,
        documentType: "payslip",
        format: template.page.size,
        landscape: template.page.orientation === "landscape",
        margin: { top: `${template.page.marginMm}mm`, bottom: `${template.page.marginMm}mm`, left: `${template.page.marginMm}mm`, right: `${template.page.marginMm}mm` },
      });
      const base64 = res.data?.base64 || res.data?.base64Pdf;
      if (res.data?.success && base64) {
        const saved = await saveBase64PdfToDevice(base64, filename, "Payslip");
        if (saved.success) {
          return { method: "file", uri: saved.uri, filename: saved.filename, message: "Payslip PDF downloaded." };
        }
      }
    } catch (err: any) {
      console.log("[PAYSLIP] Cloud PDF unavailable, using browser print-to-PDF:", err?.message);
    }
    if (!openPrintDialogWeb(html)) throw new Error("Unable to open the print dialog in this browser.");
    return {
      method: "print-dialog",
      filename,
      message: 'Print dialog opened — choose "Save as PDF" as the destination to download the file.',
    };
  }

  // Native: render HTML to a PDF file with the template's page size.
  const Print = require("expo-print");
  const { widthMm, heightMm } = pageDimensionsMm(template);
  const margin = template.page.marginMm * MM_TO_PT;
  const out = await Print.printToFileAsync({
    html,
    // expo-print writes into the raw Android cache dir, which expo-file-system / expo-sharing may not be
    // allowed to read (e.g. in Expo Go: "Not allowed to read file under given URL"). Taking the bytes as
    // base64 lets us write the PDF ourselves into the app's own document directory, which they can read.
    base64: true,
    width: Math.round(widthMm * MM_TO_PT),
    height: Math.round(heightMm * MM_TO_PT),
    // iOS uses explicit margins; Android honours the template's CSS @page margin.
    margins: Platform.OS === "ios" ? { top: margin, bottom: margin, left: margin, right: margin } : undefined,
  });
  if (!out?.uri && !out?.base64) throw new Error("PDF generation failed on this device.");

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  const dir = `${baseDir}payslips/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${filename}`;

  if (out.base64) {
    const check = validatePdfBase64(out.base64);
    if (!check.valid) throw new Error(check.error || "Generated PDF is not valid.");
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.writeAsStringAsync(dest, out.base64, { encoding: FileSystem.EncodingType.Base64 });
    // Best effort: remove expo-print's temporary copy (may not be accessible, which is fine)
    if (out.uri) FileSystem.deleteAsync(out.uri, { idempotent: true }).catch(() => {});
  } else {
    // No base64 returned: move the file instead, and fail loudly if that is not possible
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.moveAsync({ from: out.uri, to: dest });
  }

  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists || !(info as any).size) throw new Error("Generated PDF file is missing or empty.");
  if (__DEV__) console.log(`[PAYSLIP] PDF ready (${Math.round(((info as any).size || 0) / 1024)} KB)`);
  return { method: "file", uri: dest, filename, message: "Payslip PDF saved on this device." };
}

/** Generates and opens the share sheet (mobile) or downloads (web). */
export async function sharePayslipsPdf(
  template: PayslipTemplate,
  slips: PayslipRenderData[],
  opts: { organizationId?: string } = {}
): Promise<PayslipPdfResult> {
  const result = await generatePayslipsPdf(template, slips, opts);
  if (result.method === "file" && result.uri && Platform.OS !== "web") {
    await sharePdfFile(result.uri, result.filename);
  }
  return result;
}
