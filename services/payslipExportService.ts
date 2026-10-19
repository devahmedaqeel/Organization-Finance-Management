/**
 * services/payslipExportService.ts
 *
 * Backward-compatible payslip export API. All PDF output is produced by the
 * template-aware pipeline (payslipTemplateRenderer + payslipDocumentService), so
 * every entry point uses the same layout, figures and organization-profile logo.
 */

import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { PayrollEntry } from "@/context/FinanceContext";
import { PayslipTemplate, createBuiltInTemplate } from "./payslipTemplateConfig";
import {
  PayslipOrganizationProfile,
  PayslipRenderData,
  buildPayslipRenderData,
  escapeHtml,
  formatAmount,
} from "./payslipTemplateRenderer";
import { generatePayslipsPdf, preparePayslipProfile } from "./payslipDocumentService";
import { sharePdfFile } from "./pdfDownloadService";

export interface PayslipExportResult {
  success: boolean;
  uri: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  message?: string;
}

export type PayslipInput = PayrollEntry;

export interface PayslipExportOptions {
  /** Template to use; defaults to the built-in government template. */
  template?: PayslipTemplate;
  canViewSensitive?: boolean;
}

/** Accepts both settings-shaped ({organizationName}) and org-info-shaped ({name}) objects. */
function toProfile(orgSettings: any): PayslipOrganizationProfile {
  const o = orgSettings || {};
  return {
    organizationId: o.organizationId,
    name: o.organizationName || o.name || "",
    address: o.organizationAddress || o.address || "",
    email: o.organizationEmail || o.email || "",
    phone: o.organizationPhone || o.phone || "",
    logo: o.organizationLogo || o.logo || "",
    currency: o.currency || "PKR",
  };
}

function normalizePayslipData(input: any, orgSettings?: any, canViewSensitive = false): PayslipRenderData {
  if (!input) throw new Error("PAYSLIP_DATA_INVALID: Payroll record is null or undefined.");
  if (!String(input.employeeName || "").trim()) {
    throw new Error("PAYSLIP_DATA_INVALID: Unable to generate payslip because employee name is missing.");
  }
  if (!String(input.employeeId || "").trim()) {
    throw new Error("PAYSLIP_DATA_INVALID: Unable to generate payslip because employee ID is missing.");
  }
  return buildPayslipRenderData(input, toProfile(orgSettings), { canViewSensitive });
}

function fileStem(data: PayslipRenderData): string {
  const id = (data.employee.employeeId || "EMP").replace(/[^a-zA-Z0-9_-]/g, "");
  const period = (data.meta.period || "period").replace(/[^a-zA-Z0-9_-]/g, "");
  return `Payslip-${id}-${period}`;
}

export function getPdfFilename(data: PayslipRenderData): string {
  return `${fileStem(data)}.pdf`;
}

export function getImageFilename(data: PayslipRenderData): string {
  return `${fileStem(data)}.png`;
}

/** Generates a template-based PDF (web: download or print-to-PDF; mobile: file on device). */
export async function generatePayslipPDF(
  input: PayslipInput,
  orgSettings?: any,
  opts: PayslipExportOptions = {}
): Promise<PayslipExportResult> {
  normalizePayslipData(input, orgSettings, opts.canViewSensitive);
  const profile = await preparePayslipProfile(toProfile(orgSettings));
  const data = buildPayslipRenderData(input, profile, { canViewSensitive: Boolean(opts.canViewSensitive) });
  const template = opts.template || createBuiltInTemplate("government");
  const result = await generatePayslipsPdf(template, [data], { organizationId: profile.organizationId });
  let size = 0;
  if (result.uri && Platform.OS !== "web") {
    const info = await FileSystem.getInfoAsync(result.uri).catch(() => null);
    size = (info as any)?.size || 0;
  }
  return {
    success: true,
    uri: result.uri || "",
    filename: result.filename,
    fileSize: size,
    mimeType: "application/pdf",
    message: result.message,
  };
}

export async function savePayslipPDFToDevice(input: PayslipInput, orgSettings?: any, opts?: PayslipExportOptions) {
  return generatePayslipPDF(input, orgSettings, opts);
}

export async function verifyPayslipPDF(uri: string): Promise<{ exists: boolean; size: number }> {
  if (!uri) throw new Error("PAYSLIP_URI_EMPTY: Provided PDF URI is null or empty.");
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error("PAYSLIP_FILE_MISSING: PDF file does not exist at URI: " + uri);
  const size = (info as any).size;
  if (size !== undefined && size <= 0) throw new Error("PAYSLIP_FILE_EMPTY: PDF file size is 0 bytes.");
  return { exists: true, size: size || 0 };
}

export async function savePayslipPDFToAndroid(input: PayslipInput, orgSettings?: any, opts?: PayslipExportOptions) {
  return generatePayslipPDF(input, orgSettings, opts);
}

export async function downloadPayslipPDF(input: PayslipInput, orgSettings?: any, opts?: PayslipExportOptions) {
  return generatePayslipPDF(input, orgSettings, opts);
}

export async function sharePayslipPDF(input: PayslipInput, orgSettings?: any, opts?: PayslipExportOptions): Promise<void> {
  const result = await generatePayslipPDF(input, orgSettings, opts);
  if (result.uri && Platform.OS !== "web") await sharePdfFile(result.uri, result.filename);
}

/**
 * Compact payslip summary image (SVG) built from the same render data as the PDF.
 */
export function buildPayslipSvg(data: PayslipRenderData): string {
  const t = createBuiltInTemplate("corporate");
  const cur = data.org.currency || "PKR";
  const money = (n: number, neg = false) => escapeHtml(formatAmount(n, t, cur, neg));
  const rows = [
    ...data.earnings.map((l) => ({ label: l.name, value: money(l.amount), color: "#0F172A" })),
    ...data.deductions.map((l) => ({ label: l.name, value: money(l.amount, true), color: "#E11D48" })),
    ...data.loans.map((l) => ({ label: l.description, value: money(l.installment, true), color: "#E11D48" })),
    ...(data.totals.totalTaxDeductions
      ? [{ label: "Income Tax", value: money(data.totals.totalTaxDeductions, true), color: "#E11D48" }]
      : []),
  ].slice(0, 18);
  const height = 330 + rows.length * 26 + 120;
  const lines = rows
    .map(
      (r, i) =>
        `<text x="60" y="${300 + i * 26}" font-size="13" fill="#334155">${escapeHtml(r.label)}</text>` +
        `<text x="740" y="${300 + i * 26}" font-size="13" fill="${r.color}" text-anchor="end" font-weight="bold">${r.value}</text>`
    )
    .join("");
  const y = 300 + rows.length * 26 + 10;
  const sub = [data.employee.employeeId, data.employee.designation, data.employee.department].filter(Boolean).join(" · ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" font-family="Arial, Helvetica, sans-serif">
  <rect width="800" height="${height}" fill="#FFFFFF"/>
  <rect x="40" y="40" width="720" height="100" rx="10" fill="#1E3A8A"/>
  <text x="64" y="82" fill="#FFFFFF" font-size="22" font-weight="bold">${escapeHtml(data.org.name)}</text>
  <text x="64" y="110" fill="#C7D2FE" font-size="13">${escapeHtml(data.org.address || "")}</text>
  <text x="736" y="82" fill="#FFFFFF" font-size="14" font-weight="bold" text-anchor="end">PAYSLIP</text>
  <text x="736" y="108" fill="#E0E7FF" font-size="12" text-anchor="end">${escapeHtml(data.meta.periodLabel)}</text>
  <text x="60" y="185" fill="#0F172A" font-size="16" font-weight="bold">${escapeHtml(data.employee.employeeName || "")}</text>
  <text x="60" y="208" fill="#64748B" font-size="12">${escapeHtml(sub)}</text>
  <line x1="40" y1="240" x2="760" y2="240" stroke="#E2E8F0"/>
  <text x="60" y="268" fill="#475569" font-size="11" font-weight="bold">COMPONENT</text>
  <text x="740" y="268" fill="#475569" font-size="11" font-weight="bold" text-anchor="end">AMOUNT</text>
  ${lines}
  <line x1="40" y1="${y}" x2="760" y2="${y}" stroke="#E2E8F0"/>
  <text x="60" y="${y + 30}" fill="#0F172A" font-size="13">Gross: ${money(data.totals.grossSalary)}   Deductions: ${money(data.totals.totalEmployeeDeductions, true)}</text>
  <text x="60" y="${y + 66}" fill="#1E3A8A" font-size="20" font-weight="bold">Net Salary: ${money(data.totals.netSalary)}</text>
  <text x="60" y="${y + 92}" fill="#94A3B8" font-size="10">Verification: ${escapeHtml(data.meta.verificationCode)}</text>
</svg>`;
}

export async function downloadPayslipImage(input: PayslipInput, orgSettings?: any): Promise<PayslipExportResult> {
  const data = normalizePayslipData(input, orgSettings);
  const filename = getImageFilename(data);
  const svgString = buildPayslipSvg(data);
  const height = Number(/height="(\d+)"/.exec(svgString)?.[1] || 1000);

  if (Platform.OS === "web") {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = height * 2;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("PAYSLIP_IMAGE_GENERATION_FAILED: Canvas unavailable."));
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error("PAYSLIP_IMAGE_GENERATION_FAILED: Failed to convert canvas to PNG blob."));
          const pngUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = pngUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          resolve({ success: true, uri: pngUrl, filename, fileSize: blob.size, mimeType: "image/png", message: "Payslip PNG downloaded successfully" });
        }, "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("PAYSLIP_IMAGE_GENERATION_FAILED: Failed to load SVG into image element."));
      };
      img.src = url;
    });
  }

  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  const svgFilename = filename.replace(/\.png$/i, ".svg");
  const svgUri = `${dir}${svgFilename}`;
  await FileSystem.writeAsStringAsync(svgUri, svgString, { encoding: "utf8" });
  try {
    const contentUri = await FileSystem.getContentUriAsync(svgUri).catch(() => svgUri);
    await Share.share(
      Platform.OS === "ios"
        ? { url: svgUri, title: svgFilename }
        : { title: svgFilename, url: contentUri, message: `Salary slip image for ${data.employee.employeeName} (${data.meta.periodLabel})` }
    );
  } catch (err) {
    console.log("Image share flow completed:", err);
  }
  return { success: true, uri: svgUri, filename: svgFilename, fileSize: svgString.length, mimeType: "image/svg+xml", message: "Payslip image exported" };
}

export async function sharePayslipImage(input: PayslipInput, orgSettings?: any): Promise<void> {
  await downloadPayslipImage(input, orgSettings);
}
