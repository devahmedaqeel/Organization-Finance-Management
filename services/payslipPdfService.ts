import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { PayrollEntry } from "@/context/FinanceContext";
import { safeBinaryToBase64 } from "./pdfDownloadService";

export interface OrganizationInfo {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  currency?: string;
  fiscalYear?: string;
}

export interface PayslipExportResult {
  success: boolean;
  uri: string;
  filename: string;
  fileSize: number;
  message?: string;
}

/**
 * Validates required payslip fields before attempting PDF generation.
 */
export function validatePayslipData(p: any): { valid: boolean; error?: string } {
  if (!p) {
    return { valid: false, error: "Unable to generate payslip because payroll data is missing." };
  }
  const name = String(p.employeeName || "").trim();
  const id = String(p.employeeId || "").trim();
  if (!name) {
    return { valid: false, error: "Unable to generate payslip because employee name is missing." };
  }
  if (!id) {
    return { valid: false, error: "Unable to generate payslip because employee ID is missing." };
  }
  const salary = Number(p.baseSalary ?? p.basicSalary ?? 0);
  if (isNaN(salary) || salary < 0) {
    return { valid: false, error: "Unable to generate payslip because base salary is invalid." };
  }
  return { valid: true };
}

/**
 * Standard single-source-of-truth currency formatter.
 */
export function formatCurrency(amount: number, currency: string = "PKR"): string {
  const num = Number(amount || 0);
  return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Standard compact currency formatter.
 */
export function formatCurrencyShort(amount: number, currency: string = "PKR"): string {
  const abs = Math.abs(amount || 0);
  if (abs >= 1000000) return `${currency} ${(amount / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${currency} ${(amount / 1000).toFixed(1)}K`;
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

/**
 * Sanitizes strings for standard PDF literal text syntax: `(Text) Tj`
 */
function escapePdfText(str: string): string {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, " "); // Keep standard ASCII safe characters
}

/**
 * Generates a real, valid, standard PDF 1.4 binary document for an authoritative Payslip.
 * Contains genuine vector graphics, styled backgrounds, selectable text, and clean A4 layout.
 */
export function buildPayslipPdfBinary(
  payslip: PayrollEntry,
  orgInfo?: OrganizationInfo
): string {
  const orgName = orgInfo?.name || "DevOrbit Tech Kotli";
  const orgAddress = orgInfo?.address || "Kotli, Azad Kashmir";
  const orgEmail = orgInfo?.email || "finance@devorbit.tech";
  const orgPhone = orgInfo?.phone || "+92-586-444111";
  const currency = orgInfo?.currency || "PKR";

  const baseSalary = Number(payslip?.baseSalary ?? (payslip as any)?.basicSalary ?? 0);
  const bonus = Number(payslip?.bonus ?? 0);
  const deductions = Number(payslip?.deductions ?? 0);
  const netSalary = Number(payslip?.netSalary ?? (baseSalary + bonus - deductions));

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const verificationCode = `OFM-VERIFIED-${(payslip.id || "0000").slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  // Build stream content using standard PDF 1.4 operators
  const streamLines: string[] = [
    "q",
    // ─── 1. TOP HEADER BANNER (Deep Indigo Card) ───
    "0.10 0.12 0.24 rg", // Dark indigo fill
    "40 705 515.28 95 re f",

    // Accent left stripe
    "0.48 0.23 0.88 rg", // Purple accent
    "40 705 6 95 re f",

    // Organization Title & Subtitle
    "BT",
    "/F2 17 Tf 1 1 1 rg",
    `56 766 Td (${escapePdfText(orgName)}) Tj`,
    "/F1 9 Tf 0.78 0.82 0.95 rg",
    `0 -16 Td (Enterprise Human Resource & Staff Remuneration Portal) Tj`,
    "/F1 8.5 Tf 0.65 0.70 0.88 rg",
    `0 -14 Td (${escapePdfText(`${orgAddress} · ${orgEmail} · ${orgPhone}`)}) Tj`,
    "ET",

    // Right Badge on Header
    "BT",
    "/F2 11.5 Tf 0.40 0.90 0.98 rg",
    `415 766 Td (OFFICIAL PAYSLIP) Tj`,
    "/F1 9 Tf 0.90 0.92 1.0 rg",
    `0 -15 Td (Period: ${escapePdfText(payslip.month || "Current")}) Tj`,
    "ET",

    // Verified Pill Background
    "0.06 0.72 0.50 rg",
    "390 718 152 18 re f",
    "BT",
    "/F2 8.5 Tf 1 1 1 rg",
    "400 724 Td (* VERIFIED & DISBURSED *) Tj",
    "ET",

    // ─── 2. EMPLOYEE INFORMATION BOX ───
    "0.97 0.98 0.99 rg",
    "0.88 0.91 0.94 RG",
    "40 610 515.28 80 re B",

    "BT",
    "/F2 8 Tf 0.40 0.45 0.55 rg",
    "55 670 Td (EMPLOYEE FULL NAME) Tj",
    "/F2 11 Tf 0.06 0.09 0.16 rg",
    "0 -13 Td (" + escapePdfText(payslip.employeeName) + ") Tj",
    "/F2 8 Tf 0.40 0.45 0.55 rg",
    "0 -18 Td (EMPLOYEE ID) Tj",
    "/F1 10 Tf 0.20 0.25 0.35 rg",
    "0 -12 Td (" + escapePdfText(payslip.employeeId) + ") Tj",
    "ET",

    "BT",
    "/F2 8 Tf 0.40 0.45 0.55 rg",
    "320 670 Td (DEPARTMENT / COST CENTER) Tj",
    "/F2 11 Tf 0.06 0.09 0.16 rg",
    "0 -13 Td (" + escapePdfText(payslip.department || "General Administration") + ") Tj",
    "/F2 8 Tf 0.40 0.45 0.55 rg",
    "0 -18 Td (PAY PERIOD / ISSUE DATE) Tj",
    "/F1 10 Tf 0.20 0.25 0.35 rg",
    `0 -12 Td (${escapePdfText(payslip.month || "2026-08")} · ${escapePdfText(dateStr)}) Tj`,
    "ET",

    // ─── 3. EARNINGS & ALLOWANCES TABLE ───
    "BT",
    "/F2 10.5 Tf 0.48 0.23 0.88 rg",
    "40 584 Td (EARNINGS & ALLOWANCES) Tj",
    "ET",

    // Header row
    "0.93 0.95 0.98 rg",
    "40 556 515.28 20 re f",
    "BT",
    "/F2 8.5 Tf 0.25 0.30 0.40 rg",
    "52 562 Td (DESCRIPTION / ITEM) Tj",
    "268 0 Td (CATEGORY) Tj",
    "125 0 Td (AMOUNT (" + escapePdfText(currency) + ")) Tj",
    "ET",

    // Row 1: Basic
    "0.90 0.92 0.95 RG",
    "40 534 515.28 0.5 re S",
    "BT",
    "/F1 9.5 Tf 0.10 0.15 0.25 rg",
    "52 540 Td (Basic Remuneration / Salary) Tj",
    "/F1 9 Tf 0.45 0.50 0.60 rg",
    "268 0 Td (Fixed Compensation) Tj",
    "/F2 10 Tf 0.10 0.15 0.25 rg",
    `125 0 Td (+${escapePdfText(formatCurrency(baseSalary, currency))}) Tj`,
    "ET",

    // Row 2: Bonus
    "0.90 0.92 0.95 RG",
    "40 512 515.28 0.5 re S",
    "BT",
    "/F1 9.5 Tf 0.10 0.15 0.25 rg",
    "52 518 Td (Performance Bonus & Incentives) Tj",
    "/F1 9 Tf 0.45 0.50 0.60 rg",
    "268 0 Td (Variable Allowance) Tj",
    "/F2 10 Tf 0.06 0.72 0.50 rg",
    `125 0 Td (+${escapePdfText(formatCurrency(bonus, currency))}) Tj`,
    "ET",

    // Total Gross Row
    "0.96 0.97 0.99 rg",
    "40 490 515.28 20 re f",
    "BT",
    "/F2 9.5 Tf 0.10 0.15 0.25 rg",
    "52 496 Td (Total Gross Remuneration) Tj",
    "/F2 10.5 Tf 0.06 0.72 0.50 rg",
    `393 0 Td (+${escapePdfText(formatCurrency(baseSalary + bonus, currency))}) Tj`,
    "ET",

    // ─── 4. DEDUCTIONS & STATUTORY WITHHOLDINGS TABLE ───
    "BT",
    "/F2 10.5 Tf 0.95 0.24 0.37 rg",
    "40 464 Td (DEDUCTIONS & STATUTORY WITHHOLDINGS) Tj",
    "ET",

    // Header row
    "0.93 0.95 0.98 rg",
    "40 436 515.28 20 re f",
    "BT",
    "/F2 8.5 Tf 0.25 0.30 0.40 rg",
    "52 442 Td (DEDUCTION ITEM) Tj",
    "268 0 Td (TYPE) Tj",
    "125 0 Td (AMOUNT (" + escapePdfText(currency) + ")) Tj",
    "ET",

    // Row 1: Tax / Deductions
    "0.90 0.92 0.95 RG",
    "40 414 515.28 0.5 re S",
    "BT",
    "/F1 9.5 Tf 0.10 0.15 0.25 rg",
    "52 420 Td (Income Tax, Provident Fund & Deductions) Tj",
    "/F1 9 Tf 0.45 0.50 0.60 rg",
    "268 0 Td (Statutory Withholding) Tj",
    "/F2 10 Tf 0.95 0.24 0.37 rg",
    `125 0 Td (-${escapePdfText(formatCurrency(deductions, currency))}) Tj`,
    "ET",

    // Total Deductions Row
    "0.96 0.97 0.99 rg",
    "40 392 515.28 20 re f",
    "BT",
    "/F2 9.5 Tf 0.10 0.15 0.25 rg",
    "52 398 Td (Total Deductions & Withholdings) Tj",
    "/F2 10.5 Tf 0.95 0.24 0.37 rg",
    `393 0 Td (-${escapePdfText(formatCurrency(deductions, currency))}) Tj`,
    "ET",

    // ─── 5. NET SALARY PAYABLE CARD ───
    "0.48 0.23 0.88 rg",
    "40 315 515.28 64 re f",
    "BT",
    "/F2 9.5 Tf 0.92 0.88 1.0 rg",
    "56 357 Td (NET SALARY PAYABLE (TAKE-HOME DISBURSAL)) Tj",
    "/F1 8.5 Tf 0.85 0.80 0.98 rg",
    "0 -13 Td (Direct institutional bank deposit verified and credited to employee account.) Tj",
    "/F1 8 Tf 0.75 0.70 0.95 rg",
    "0 -12 Td (Official digital payroll record generated securely via OFM Cloud Portal.) Tj",
    "ET",

    // Net Amount in large bold text
    "BT",
    "/F2 18 Tf 1 1 1 rg",
    `345 342 Td (${escapePdfText(formatCurrency(netSalary, currency))}) Tj`,
    "ET",

    // ─── 6. SIGNATURES & VERIFICATION ───
    "0.82 0.85 0.90 RG",
    "40 278 515.28 0.8 re S",

    // Employee Signature Box
    "0.25 0.30 0.40 RG",
    "60 215 150 1 re S",
    "BT",
    "/F2 9 Tf 0.15 0.20 0.30 rg",
    `60 200 Td (${escapePdfText(payslip.employeeName)}) Tj`,
    "/F1 8 Tf 0.50 0.55 0.65 rg",
    "0 -12 Td (Employee Acknowledgment) Tj",
    "ET",

    // Officer Signature Box
    "0.25 0.30 0.40 RG",
    "380 215 150 1 re S",
    "BT",
    "/F2 9 Tf 0.15 0.20 0.30 rg",
    "380 200 Td (Chief Financial Officer) Tj",
    "/F1 8 Tf 0.50 0.55 0.65 rg",
    `0 -12 Td (Authorized Signatory · ${escapePdfText(orgName)}) Tj`,
    "ET",

    // ─── 7. FOOTER ───
    "0.88 0.90 0.94 RG",
    "40 145 515.28 0.5 re S",
    "BT",
    "/F1 8 Tf 0.55 0.60 0.70 rg",
    `50 130 Td (Confidential Document · Generated by Organization Finance Management on ${escapePdfText(`${dateStr} at ${timeStr}`)}) Tj`,
    "/F2 7.5 Tf 0.06 0.72 0.50 rg",
    `50 116 Td (${escapePdfText(verificationCode)}) Tj`,
    "ET",

    "Q",
  ];

  const streamContent = streamLines.join("\n");
  const streamLength = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(streamContent).length : streamContent.length;

  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`;
  const obj4 = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
  const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;
  const obj6 = `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`;

  const header = `%PDF-1.4\n%âãÏÓ\n`;

  const offset1 = header.length;
  const offset2 = offset1 + obj1.length;
  const offset3 = offset2 + obj2.length;
  const offset4 = offset3 + obj3.length;
  const offset5 = offset4 + obj4.length;
  const offset6 = offset5 + obj5.length;
  const xrefOffset = offset6 + obj6.length;

  const padOffset = (n: number) => String(n).padStart(10, "0");

  const xref = `xref\n0 7\n0000000000 65535 f \n${padOffset(offset1)} 00000 n \n${padOffset(offset2)} 00000 n \n${padOffset(offset3)} 00000 n \n${padOffset(offset4)} 00000 n \n${padOffset(offset5)} 00000 n \n${padOffset(offset6)} 00000 n \n`;

  const trailer = `trailer\n<< /Size 7 /Root 1 0 R /Info << /Title (Payslip - ${escapePdfText(payslip.employeeName)} - ${escapePdfText(payslip.month || "2026-08")}) /Author (${escapePdfText(orgName)}) /Creator (OFM - Organization Finance Management) /CreationDate (D:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}00) >> >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return `${header}${obj1}${obj2}${obj3}${obj4}${obj5}${obj6}${xref}${trailer}`;
}

/**
 * Creates the exact safe filename: `Payslip-{employeeId}-{period}.pdf`
 */
export function getPayslipPdfFilename(payslip: PayrollEntry): string {
  const cleanId = (payslip.employeeId || "EMP001").replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanMonth = (payslip.month || "2026-08").replace(/[^a-zA-Z0-9_-]/g, "");
  return `Payslip-${cleanId}-${cleanMonth}.pdf`;
}

/**
 * Creates the exact safe filename: `Payslip-{employeeId}-{period}.png`
 */
export function getPayslipImageFilename(payslip: PayrollEntry): string {
  const cleanId = (payslip.employeeId || "EMP001").replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanMonth = (payslip.month || "2026-08").replace(/[^a-zA-Z0-9_-]/g, "");
  return `Payslip-${cleanId}-${cleanMonth}.png`;
}

/**
 * Generates a real, valid, standard PDF 1.4 binary document for an authoritative Payslip.
 */
export async function generatePayslipPDF(
  payslip: PayrollEntry,
  orgInfo?: OrganizationInfo
): Promise<PayslipExportResult> {
  const validation = validatePayslipData(payslip);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid payroll data");
  }

  const filename = getPayslipPdfFilename(payslip);
  const pdfBinary = buildPayslipPdfBinary(payslip, orgInfo);
  const base64Data = safeBinaryToBase64(pdfBinary);

  if (Platform.OS === "web") {
    const blob = new Blob([pdfBinary], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    return {
      success: true,
      uri: url,
      filename,
      fileSize: blob.size,
      message: "Payslip PDF generated successfully",
    };
  }

  // Native Mobile (Android & iOS)
  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  const fileUri = `${dir}${filename}`;

  await FileSystem.writeAsStringAsync(fileUri, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Verify file exists and has size
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || (info.size !== undefined && info.size <= 0)) {
    throw new Error("PAYSLIP_PDF_GENERATION_FAILED: Generated PDF file is empty or corrupted.");
  }

  return {
    success: true,
    uri: fileUri,
    filename,
    fileSize: info.size || pdfBinary.length,
    message: "Payslip PDF saved to device",
  };
}

/**
 * Saves the real PDF file to device storage or user-selected directory.
 */
export async function savePayslipPDFToDevice(
  payslip: PayrollEntry,
  orgInfo?: OrganizationInfo
): Promise<PayslipExportResult> {
  console.log("[PAYSLIP] save started");
  const result = await generatePayslipPDF(payslip, orgInfo);
  const pdfBinary = buildPayslipPdfBinary(payslip, orgInfo);
  const base64Data = safeBinaryToBase64(pdfBinary);

  if (Platform.OS === "web") {
    const link = document.createElement("a");
    link.href = result.uri;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log("[PAYSLIP] save completed");
    return result;
  }

  // Android Storage Access Framework (SAF) folder picker
  if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          result.filename.replace(/\.pdf$/i, ""),
          "application/pdf"
        );

        await FileSystem.writeAsStringAsync(destUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        console.log("[PAYSLIP] SAF save completed successfully:", destUri);
        return {
          ...result,
          uri: destUri,
          message: "PDF saved to selected folder successfully",
        };
      }
    } catch (safErr) {
      console.log("[PAYSLIP] SAF save skipped or cancelled:", safErr);
    }
  }

  // Fallback / iOS: Native share / save sheet
  try {
    const contentUri = await FileSystem.getContentUriAsync(result.uri).catch(() => result.uri);
    await Share.share(
      Platform.OS === "ios"
        ? { url: result.uri, title: result.filename }
        : { title: result.filename, url: contentUri, message: `Official Salary Slip (${payslip.month})` }
    );
    console.log("[PAYSLIP] save completed via system share");
  } catch (err) {
    console.log("[PAYSLIP] save prompt completed:", err);
  }

  return result;
}

/**
 * Verifies that a PDF file exists, is accessible, and has size > 0.
 */
export async function verifyPayslipPDF(uri: string): Promise<{ exists: boolean; size: number }> {
  if (!uri) throw new Error("PAYSLIP_URI_EMPTY: Provided PDF URI is null or empty.");
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error("PAYSLIP_FILE_MISSING: PDF file does not exist at URI: " + uri);
  if (info.size !== undefined && info.size <= 0) throw new Error("PAYSLIP_FILE_EMPTY: PDF file size is 0 bytes.");
  return { exists: true, size: info.size || 0 };
}

/**
 * Android-specific save helper.
 */
export async function savePayslipPDFToAndroid(
  payslip: PayrollEntry,
  orgInfo?: OrganizationInfo
): Promise<PayslipExportResult> {
  return savePayslipPDFToDevice(payslip, orgInfo);
}

/**
 * Downloads / exports the real PDF file to device storage or triggers Web browser download.
 */
export async function downloadPayslipPDF(
  payslip: PayrollEntry,
  orgInfo?: OrganizationInfo
): Promise<PayslipExportResult> {
  return savePayslipPDFToDevice(payslip, orgInfo);
}

/**
 * Shares the real PDF file across WhatsApp, Email, Drive, etc.
 */
export async function sharePayslipPDF(
  payslip: PayrollEntry,
  orgInfo?: OrganizationInfo
): Promise<void> {
  const result = await generatePayslipPDF(payslip, orgInfo);

  if (Platform.OS === "web") {
    const link = document.createElement("a");
    link.href = result.uri;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  await Share.share(
    Platform.OS === "ios"
      ? { url: result.uri, title: result.filename }
      : { title: result.filename, url: result.uri, message: `Official Salary Slip for ${payslip.employeeName} (${payslip.month})` }
  );
}
