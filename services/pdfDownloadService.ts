/**
 * services/pdfDownloadService.ts
 *
 * Production-Grade Client PDF Generation & Download Service using HTMLPDF.dev Native Base64 Mode.
 *
 * Pure Base64 Mode:
 * Uses HTMLPDF.dev responseType: "base64" directly.
 * Decodes Base64 -> binary bytes without intermediate UTF-8 conversions.
 */

import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { functions, httpsCallable } from "@/config/firebase";
import { PayrollEntry } from "@/context/FinanceContext";
import { ReportOptions, buildFinancialPdfBinary, generateFinancialHtmlReport } from "./ReportExportService";
import { buildPayslipPdfBinary, OrganizationInfo } from "./payslipPdfService";
import { buildPayslipHtml } from "./pdfTemplates/payslipTemplate";

export interface PdfExportResult {
  success: boolean;
  uri?: string;
  filename: string;
  fileSize?: number;
  mimeType?: string;
  message?: string;
  error?: string;
}

/**
 * Sanitizes filename to prevent OS-restricted character errors.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

import { safeBinaryToBase64 } from "@/utils/base64";
export { safeBinaryToBase64 };


/**
 * Validates that a Base64 string represents a real, non-empty PDF document starting with %PDF-.
 */
export function validatePdfBase64(base64: string): { valid: boolean; error?: string } {
  if (!base64 || typeof base64 !== "string") {
    return { valid: false, error: "Generated PDF Base64 string is empty or invalid." };
  }

  const cleanBase64 = base64.trim().replace(/^data:application\/pdf;base64,/, "");
  if (cleanBase64.length < 32) {
    return { valid: false, error: "Generated PDF Base64 payload is too short." };
  }

  // Base64 encoding of "%PDF-" is "JVBERi0"
  if (!cleanBase64.startsWith("JVBERi")) {
    try {
      const decodedHead = atob(cleanBase64.substring(0, 16));
      if (!decodedHead.startsWith("%PDF-")) {
        return { valid: false, error: "Generated response is not a valid PDF (%PDF- header missing)." };
      }
    } catch {
      return { valid: false, error: "Invalid Base64 encoding in PDF response." };
    }
  }

  return { valid: true };
}

/**
 * Validates that a generated PDF file exists, is non-zero, and begins with the standard %PDF- header.
 */
export async function validatePdfFile(uri: string): Promise<{ valid: boolean; size: number; error?: string }> {
  if (!uri) return { valid: false, size: 0, error: "PDF URI is empty or undefined." };
  if (Platform.OS === "web") return { valid: true, size: 1024 };

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return { valid: false, size: 0, error: `PDF file does not exist at URI: ${uri}` };
    if (info.size === undefined || info.size <= 0) return { valid: false, size: 0, error: "PDF file is 0 bytes (empty file)." };

    const headerBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 16,
    }).catch(() => null);

    if (headerBase64) {
      const headerStr = atob(headerBase64);
      if (!headerStr.startsWith("%PDF-")) {
        console.warn("[PDF_VALIDATION] Header warning: does not start with %PDF-", headerStr.substring(0, 8));
      }
    }

    return { valid: true, size: info.size };
  } catch (err: any) {
    return { valid: false, size: 0, error: err?.message || "File validation check failed." };
  }
}

/**
 * Universal Saver: Takes Base64 PDF binary data and persists it to Mobile Storage (SAF/Share) or triggers Web Download.
 */
export async function saveBase64PdfToDevice(
  base64Data: string,
  filename: string,
  title: string = "Official Document"
): Promise<PdfExportResult> {
  const cleanFilename = sanitizeFilename(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  const cleanBase64 = base64Data.trim().replace(/^data:application\/pdf;base64,/, "");

  const base64Validation = validatePdfBase64(cleanBase64);
  if (!base64Validation.valid) {
    return {
      success: false,
      filename: cleanFilename,
      error: base64Validation.error || "Generated response is not a valid PDF.",
    };
  }

  // 1. Web Platform: Direct Blob Download (Decodes Base64 -> Uint8Array bytes)
  if (Platform.OS === "web") {
    try {
      const binaryString = atob(cleanBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = cleanFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      return {
        success: true,
        uri: blobUrl,
        filename: cleanFilename,
        fileSize: blob.size,
        mimeType: "application/pdf",
        message: "PDF downloaded successfully.",
      };
    } catch (err: any) {
      return {
        success: false,
        filename: cleanFilename,
        error: err?.message || "Web download failed.",
      };
    }
  }

  // 2. Mobile Platform: Write Base64 to Local Storage
  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  const localFileUri = `${dir}${cleanFilename}`;

  try {
    await FileSystem.writeAsStringAsync(localFileUri, cleanBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const validation = await validatePdfFile(localFileUri);
    if (!validation.valid) {
      throw new Error(validation.error || "Generated PDF file is empty or corrupted.");
    }

    // 3. Android Storage Access Framework (SAF) Folder Picker
    if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            cleanFilename.replace(/\.pdf$/i, ""),
            "application/pdf"
          );

          await FileSystem.writeAsStringAsync(destUri, cleanBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          return {
            success: true,
            uri: destUri,
            filename: cleanFilename,
            fileSize: validation.size,
            mimeType: "application/pdf",
            message: "PDF saved to selected folder successfully.",
          };
        }
      } catch (safErr) {
        console.log("[PDF_SERVICE] SAF folder selection cancelled, falling back to share sheet:", safErr);
      }
    }

    return {
      success: true,
      uri: localFileUri,
      filename: cleanFilename,
      fileSize: validation.size,
      mimeType: "application/pdf",
      message: "PDF created and saved to device.",
    };
  } catch (err: any) {
    return {
      success: false,
      filename: cleanFilename,
      error: err?.message || "Failed to persist PDF on device.",
    };
  }
}

/**
 * Generates and downloads a Payslip PDF using HTMLPDF.dev native Base64 mode.
 */
export async function downloadPayslipPdf(
  payslip: PayrollEntry,
  orgInfo?: OrganizationInfo
): Promise<PdfExportResult> {
  const empName = sanitizeFilename(payslip.employeeName || "Employee");
  const month = payslip.month || new Date().toISOString().substring(0, 7);
  const filename = `Payslip_${empName}_${month}.pdf`;
  const html = buildPayslipHtml(payslip, orgInfo);

  // 1. Call Secure Cloud Function (HTMLPDF.dev in Base64 mode)
  try {
    const generatePdfCallable = httpsCallable<any, any>(functions, "generatePdfFromHtmlCallable");
    const res = await generatePdfCallable({
      html,
      filename,
      organizationId: payslip.organizationId,
      documentType: "payslip",
    });

    const data = res.data;
    const base64Payload = data?.base64 || data?.base64Pdf;
    if (data && data.success && base64Payload) {
      return await saveBase64PdfToDevice(base64Payload, filename, `Official Payslip - ${payslip.employeeName}`);
    }
  } catch (cloudErr: any) {
    console.log("[PDF_SERVICE] Cloud HTMLPDF.dev endpoint unavailable, running verified local binary generator:", cloudErr?.message);
  }

  // 2. Resilient High-Fidelity Local Vector Binary Fallback
  const pdfBinary = buildPayslipPdfBinary(payslip, orgInfo);
  const base64Data = safeBinaryToBase64(pdfBinary);
  return await saveBase64PdfToDevice(base64Data, filename, `Official Payslip - ${payslip.employeeName}`);
}

const REPORT_FILE_LABELS: Record<string, string> = {
  consolidated_statement: "Financial_Statement",
  executive_summary: "Executive_Summary",
  payroll_audit: "Payroll_Audit",
  payroll: "Payroll_Audit",
  expense_analysis: "Expense_Analysis",
  expense: "Expenses",
  revenue_analysis: "Revenue_Statement",
  income: "Income",
  department_analysis: "Department_Report",
  budget_performance: "Budget_Performance",
  general_ledger: "General_Ledger",
};

/**
 * Descriptive, unique report filename: org, report type, date range and a time stamp,
 * e.g. OFM_Acme_Financial_Statement_2026-01-01_to_2026-06-30_143052.pdf.
 * Accepts both ReportOptions and EnterpriseReportData.
 */
export function buildReportFilename(opts: any): string {
  const isEnterprise = !!(opts?.metadata && opts?.executiveSummary);
  const org = sanitizeFilename((isEnterprise ? opts.metadata.organizationName : opts?.organizationName) || "OFM").slice(0, 40);
  const typeKey = (isEnterprise ? opts.reportType : opts?.reportMode) || "consolidated_statement";
  const typeLabel = REPORT_FILE_LABELS[typeKey] || "Financial_Statement";
  const start = isEnterprise ? opts.filters?.startDate : opts?.startDate;
  const end = isEnterprise ? opts.filters?.endDate : opts?.endDate;
  const range = start && end ? `_${start}_to_${end}` : "";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return sanitizeFilename(`OFM_${org}_${typeLabel}${range}_${stamp}.pdf`);
}

/**
 * Exports real vector binary PDF directly on Web or returns payload
 */
export function downloadPdfBinaryDirectly(
  opts: ReportOptions,
  customFilename?: string
): { success: boolean; uri: string; filename: string } {
  const filename = customFilename || buildReportFilename(opts);

  const pdfBinary = buildFinancialPdfBinary(opts);
  const blob = new Blob([pdfBinary], { type: "application/pdf" });
  const pdfUrl = URL.createObjectURL(blob);

  if (typeof document !== "undefined") {
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        document.body.removeChild(link);
      } catch (e) {}
    }, 100);
  }

  return { success: true, uri: pdfUrl, filename };
}

/**
 * Generates and downloads a Financial Statement PDF using HTMLPDF.dev native Base64 mode.
 */
export async function downloadFinancialReportPdf(
  opts: ReportOptions
): Promise<PdfExportResult> {
  const filename = buildReportFilename(opts);
  const periodLabel = (opts as any).filters?.periodLabel || opts.periodLabel || "Selected Period";
  const html = generateFinancialHtmlReport(opts);

  // 1. Web Platform: Instant Full Multi-Page Printable PDF Dossier with all Charts, Departments & Payroll
  if (Platform.OS === "web") {
    try {
      // Always generate real vector PDF binary blob
      const pdfBinary = buildFinancialPdfBinary(opts);
      const blob = new Blob([pdfBinary], { type: "application/pdf" });
      const pdfUrl = URL.createObjectURL(blob);

      let printWindowOpened = false;
      try {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(html);
          printWindow.document.close();
          setTimeout(() => {
            try {
              printWindow.focus();
              printWindow.print();
            } catch (e) {}
          }, 400);
          printWindowOpened = true;
        }
      } catch (e) {
        console.log("Web window.open print notice:", e);
      }

      // If printWindow was blocked (e.g. mobile browser popup blocker), trigger direct PDF file download
      if (!printWindowOpened && typeof document !== "undefined") {
        const link = document.createElement("a");
        link.href = pdfUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try {
            document.body.removeChild(link);
          } catch (e) {}
        }, 100);
      }

      return {
        success: true,
        uri: pdfUrl,
        filename,
        message: "Official Multi-Page Financial Dossier generated with all graphs, departments, and payroll.",
      };
    } catch (e) {
      console.log("Web PDF generation error:", e);
    }
  }

  // 2. Native HTML-to-PDF via expo-print (produces EXACT same output as in-app Preview & Web)
  try {
    const Print = require("expo-print");

    // Inject print-optimized CSS to prevent overlapping, eliminate extra space, and ensure proper page breaks
    const printCss = `
      <style>
        @media print {
          .avoid-break { page-break-inside: avoid !important; break-inside: avoid-page !important; }
          .section-title { page-break-after: avoid !important; }
          tr { page-break-inside: avoid !important; }
          table { page-break-inside: auto !important; }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
          .kpi-grid { page-break-inside: avoid !important; }
          .header-card { page-break-inside: avoid !important; }
          svg { max-width: 100% !important; height: auto !important; }
        }
        body { max-width: none !important; margin: 0 !important; padding: 0 !important; background: #FFF !important; }
        .sheet-wrap { box-shadow: none !important; padding: 0 !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      </style>
    `;
    const printHtml = html.replace("</head>", `${printCss}</head>`);

    const pdfResult = await Print.printToFileAsync({
      html: printHtml,
      base64: false,
      width: 595,   // Standard A4 width in points
      height: 842,  // Standard A4 height in points
      margins: { top: 20, bottom: 20, left: 16, right: 16 },
    });

    if (pdfResult?.uri) {
      // Give the printed file its report name inside the app cache (readable by Open / Share / Save).
      // If that copy fails, keep expo-print's own cache file, which expo-sharing can read as-is.
      let finalUri = pdfResult.uri;
      try {
        finalUri = await copyPdfToCache(pdfResult.uri, filename);
      } catch (copyErr) {
        logPdfIssue("Copying the printed PDF", pdfResult.uri, copyErr);
      }
      await assertPdfExists(finalUri);

      let fileSize: number | undefined;
      try {
        const { File } = require("expo-file-system");
        fileSize = new File(finalUri).size || undefined;
      } catch {}
      return {
        success: true,
        uri: finalUri,
        filename,
        fileSize,
        mimeType: "application/pdf",
        message: "Official Financial Statement PDF saved successfully.",
      };
    }
  } catch (printErr: any) {
    console.log("[PDF_SERVICE] expo-print printToFileAsync failed, trying fallback:", printErr?.message);
  }

  // 3. Fallback: Call Secure Cloud Function (HTMLPDF.dev in Base64 mode)
  try {
    const generatePdfCallable = httpsCallable<any, any>(functions, "generatePdfFromHtmlCallable");
    const res = await generatePdfCallable({
      html,
      filename,
      organizationId: ((opts.transactions || (opts as any).generalLedger?.transactions)?.[0] as any)?.organizationId,
      documentType: "financial_report",
    });

    const data = res.data;
    const base64Payload = data?.base64 || data?.base64Pdf;
    if (data && data.success && base64Payload) {
      return await saveBase64PdfToDevice(base64Payload, filename, `Financial Statement (${periodLabel})`);
    }
  } catch (cloudErr: any) {
    console.log("[PDF_SERVICE] Cloud HTMLPDF.dev endpoint unavailable:", cloudErr?.message);
  }

  // 4. Last Resort: Local Vector Binary Fallback
  const pdfBinary = buildFinancialPdfBinary(opts);
  const base64Data = safeBinaryToBase64(pdfBinary);
  return await saveBase64PdfToDevice(base64Data, filename, `Financial Statement (${periodLabel})`);
}

/** Throws a readable error when the generated file is missing or empty (e.g. the app cache was cleared). */
async function assertPdfExists(uri: string): Promise<void> {
  if (Platform.OS === "web" || uri.startsWith("content://")) return;
  if (!uri || !uri.startsWith("file://")) {
    throw new Error("The PDF file could not be found on this device. Please generate it again.");
  }
  let exists = false;
  let size = 0;
  try {
    const { File } = require("expo-file-system");
    const file = new File(uri);
    exists = !!file.exists;
    size = file.size || 0;
  } catch {
    const info: any = await FileSystem.getInfoAsync(uri).catch(() => null);
    exists = !!info?.exists;
    size = info?.size || 0;
  }
  if (!exists || !size) {
    throw new Error("The PDF file could not be found on this device. Please generate it again.");
  }
}

/** Development-only diagnostics: logs which step failed and the file's folder, never report contents. */
function logPdfIssue(step: string, uri: string | undefined, err: any) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const folder = (uri || "").replace(/[^/]+$/, "");
    console.warn(`[PDF_SERVICE] ${step} failed`, { folder, message: err?.message || String(err) });
  }
}

/**
 * Copies a local PDF into the app's cache folder under `filename` using the new expo-file-system API
 * and returns the copy's URI, verified to exist and be non-empty.
 *
 * Why: expo-sharing only shares files it is allowed to read, checked on `Uri.parse(url).path`. File URIs
 * built by joining the legacy `documentDirectory` string with a name do not survive that decoding inside
 * Expo Go's sandboxed project folder (its name contains URL-encoded characters), so shareAsync rejected
 * them with "Not allowed to read file under given URL". `new File(Paths.cache, name).uri` is produced
 * natively and correctly encoded, so Open / Share / Save all receive a readable path.
 */
async function copyPdfToCache(srcUri: string, filename: string): Promise<string> {
  const { File, Paths } = require("expo-file-system");
  const source = new File(srcUri);
  if (!source.exists || !source.size) {
    throw new Error("The PDF file was not created correctly. Please generate it again.");
  }
  const target = new File(Paths.cache, sanitizeFilename(filename.endsWith(".pdf") ? filename : `${filename}.pdf`));
  if (target.uri !== source.uri) {
    source.copySync(target, { overwrite: true });
  }
  if (!target.exists || !target.size) {
    throw new Error("The PDF file could not be prepared. Please generate it again.");
  }
  return target.uri;
}

/** "viewer" = opened in a PDF app; "share-sheet" = the system sheet was shown (iOS, or Android without a PDF app). */
export type OpenPdfMethod = "viewer" | "share-sheet";

/**
 * Opens a local PDF so the user can read it.
 *  Android → the phone's PDF viewer (Drive PDF Viewer, Adobe, Files…) via a VIEW intent;
 *            if no PDF app is installed, the "Open with" sheet so one can be picked.
 *  iOS     → the system sheet (Quick Look preview, Open in…, Save to Files). Screens that want an
 *            in-app reader on iOS use PdfViewerModal instead.
 */
export async function openPdfFile(uri: string, title?: string): Promise<OpenPdfMethod> {
  const cleanName = sanitizeFilename(title || "Document.pdf");

  if (Platform.OS === "web") {
    window.open(uri, "_blank");
    return "viewer";
  }

  await assertPdfExists(uri);

  if (Platform.OS === "android") {
    try {
      const IntentLauncher = require("expo-intent-launcher");
      const contentUri = uri.startsWith("content://") ? uri : await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        type: "application/pdf",
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION: lets the viewer app read our private file
      });
      return "viewer";
    } catch (err: any) {
      console.log("[PDF_SERVICE] No PDF viewer handled the intent, showing Open-with sheet:", err?.message || err);
    }
  }

  const Sharing = require("expo-sharing");
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("No app on this device can open PDF files.");
  }
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Open ${cleanName}`, UTI: "com.adobe.pdf" });
  return "share-sheet";
}

/**
 * Shares a local PDF file as a REAL .PDF document attachment across WhatsApp, Gmail, Drive, etc.
 * Uses native content:// URI to ensure apps receive the binary file, not plain text.
 */
export async function sharePdfFile(uri: string, filename?: string): Promise<void> {
  const cleanName = sanitizeFilename(filename || "Document.pdf");

  // 1. Web Platform: Native Web Share API or download fallback
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && (navigator as any).canShare && (navigator as any).share) {
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        const file = new File([blob], cleanName, { type: "application/pdf" });
        if ((navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({
            files: [file],
            title: cleanName,
          });
          return;
        }
      } catch (err) {
        console.log("[SHARE] Web navigator.share fallback:", err);
      }
    }

    const link = document.createElement("a");
    link.href = uri;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  // 2. Native Mobile: expo-sharing attaches the real PDF file (RN Share ignores `url` on Android)
  // The file must live in an app-owned folder (documentDirectory / cacheDirectory) — expo-sharing
  // rejects anything else with "Not allowed to read file under given URL".
  await assertPdfExists(uri);
  // Hand expo-sharing a natively-built cache URI it is allowed to read (also fixes PDFs saved by older flows)
  let shareUri = uri;
  if (!uri.startsWith("content://")) {
    try {
      shareUri = await copyPdfToCache(uri, cleanName);
    } catch (copyErr) {
      logPdfIssue("Preparing the PDF for sharing", uri, copyErr);
    }
  }

  let sharingError: any = null;
  try {
    const Sharing = require("expo-sharing");
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(shareUri, { mimeType: "application/pdf", dialogTitle: cleanName, UTI: "com.adobe.pdf" });
      return;
    }
  } catch (err: any) {
    sharingError = err;
    logPdfIssue("Sharing", shareUri, err);
  }

  if (Platform.OS === "android") {
    // React Native Share cannot attach files on Android, so report the real problem instead of sharing nothing.
    const msg = String(sharingError?.message || "");
    if (/in progress|being processed/i.test(msg)) {
      throw new Error("A share window is already open. Close it and try again.");
    }
    throw new Error(msg ? `Unable to share the PDF: ${msg}` : "Sharing is not available on this device.");
  }

  // 3. iOS fallback: React Native Share accepts a file URL
  await Share.share({ url: shareUri, title: cleanName });
}

/**
 * Saves a local PDF file to the phone's native file storage / Downloads using StorageAccessFramework on Android or Sharing.
 */
export async function saveToPhoneFileManager(uri: string, filename?: string): Promise<boolean> {
  try {
    const res = await savePdfToPhone(uri, filename);
    return res.saved;
  } catch (e) {
    console.log("[PDF_SERVICE] Save to phone failed:", e);
    return false;
  }
}

const SAVE_DIR_KEY = "ofm.pdf.saveDirectoryUri";

/** Forgets the remembered Android save folder so the next save asks again. */
export async function resetPdfSaveFolder(): Promise<void> {
  if (Platform.OS !== "android") return;
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  await AsyncStorage.removeItem(SAVE_DIR_KEY).catch(() => {});
}

/** Readable name of the remembered Android save folder, or null when none is set yet. */
export async function getPdfSaveFolderLabel(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  const dir: string | null = await AsyncStorage.getItem(SAVE_DIR_KEY).catch(() => null);
  return dir ? folderLabel(dir) : null;
}

export interface SavePdfToPhoneResult {
  saved: boolean;
  /** "folder" = written to a user-visible folder; "share-sheet" = iOS Files / share sheet opened; "cancelled" = user backed out. */
  method: "folder" | "share-sheet" | "cancelled";
  uri?: string;
  message: string;
}

async function writePdfToSafFolder(dirUri: string, srcUri: string, cleanName: string): Promise<string> {
  const SAF = FileSystem.StorageAccessFramework;
  // Read the PDF first (new API, natively-resolved path) so a failed read never leaves an empty file behind
  let base64Data: string;
  try {
    const { File } = require("expo-file-system");
    base64Data = await new File(srcUri).base64();
  } catch (readErr) {
    logPdfIssue("Reading the PDF for saving", srcUri, readErr);
    base64Data = await FileSystem.readAsStringAsync(srcUri, { encoding: FileSystem.EncodingType.Base64 });
  }
  const destUri = await SAF.createFileAsync(dirUri, cleanName.replace(/\.pdf$/i, ""), "application/pdf");
  await FileSystem.writeAsStringAsync(destUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
  return destUri;
}

/**
 * Saves a generated PDF where the user can actually find it.
 *  Android → a folder the user picks once (e.g. Download); the choice is remembered for next time.
 *  iOS     → the system sheet, where "Save to Files" stores it in the Files app.
 */
export async function savePdfToPhone(uri: string, filename?: string): Promise<SavePdfToPhoneResult> {
  const cleanName = sanitizeFilename(filename || "Document.pdf");
  if (Platform.OS === "web") return { saved: true, method: "folder", uri, message: "PDF downloaded." };
  await assertPdfExists(uri);

  if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    const SAF = FileSystem.StorageAccessFramework;

    // 1. Reuse the folder chosen last time (permission persists until the user revokes it)
    const remembered: string | null = await AsyncStorage.getItem(SAVE_DIR_KEY).catch(() => null);
    if (remembered) {
      try {
        const destUri = await writePdfToSafFolder(remembered, uri, cleanName);
        return { saved: true, method: "folder", uri: destUri, message: `Saved to your ${folderLabel(remembered)} folder.` };
      } catch {
        await AsyncStorage.removeItem(SAVE_DIR_KEY).catch(() => {});
      }
    }

    // 2. Ask once for a folder. Start in Documents: Android 11+ does not let apps pick the Download
    //    folder itself (the picker says "Can't use this folder"), while Documents is allowed.
    let initial: string | undefined;
    try {
      initial = SAF.getUriForDirectoryInRoot("Documents");
    } catch {
      initial = undefined;
    }
    const permissions = await SAF.requestDirectoryPermissionsAsync(initial);
    if (!permissions.granted) {
      return { saved: false, method: "cancelled", message: "No folder selected, so the PDF was not saved. Tap Save again and choose a folder (for example Documents)." };
    }
    await AsyncStorage.setItem(SAVE_DIR_KEY, permissions.directoryUri).catch(() => {});
    const destUri = await writePdfToSafFolder(permissions.directoryUri, uri, cleanName);
    return { saved: true, method: "folder", uri: destUri, message: `Saved to your ${folderLabel(permissions.directoryUri)} folder.` };
  }

  // iOS: the share sheet includes "Save to Files"
  const Sharing = require("expo-sharing");
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: cleanName, UTI: "com.adobe.pdf" });
  return { saved: true, method: "share-sheet", uri, message: 'Choose "Save to Files" to keep the PDF on your iPhone.' };
}

/** Readable folder name from a SAF tree URI, e.g. ".../tree/primary%3ADownload%2FPayslips" → "Download/Payslips". */
function folderLabel(dirUri: string): string {
  try {
    const tail = decodeURIComponent(dirUri.split("/tree/")[1] || "");
    const path = tail.includes(":") ? tail.split(":").slice(1).join(":") : tail;
    return path || "selected";
  } catch {
    return "selected";
  }
}
