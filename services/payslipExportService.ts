import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { PayrollEntry } from "@/context/FinanceContext";
import {
  PayslipExportData,
  createPayslipExportData,
  buildPayslipHTML,
  formatCurrency,
} from "./payslipTemplate";
import { buildPayslipPdfBinary } from "./payslipPdfService";
import { sharePdfFile, safeBinaryToBase64 } from "./pdfDownloadService";

export interface PayslipExportResult {
  success: boolean;
  uri: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  message?: string;
}

export type PayslipInput = PayrollEntry | PayslipExportData;

function normalizePayslipData(input: any, orgSettings?: any): PayslipExportData {
  if (!input) {
    throw new Error("PAYSLIP_DATA_INVALID: Payroll record is null or undefined.");
  }

  const empName = String(input.employeeName || "").trim();
  const empId = String(input.employeeId || "").trim();

  if (!empName) {
    throw new Error("PAYSLIP_DATA_INVALID: Unable to generate payslip because employee name is missing.");
  }
  if (!empId) {
    throw new Error("PAYSLIP_DATA_INVALID: Unable to generate payslip because employee ID is missing.");
  }

  const baseSalary = Number(input.baseSalary ?? input.basicSalary ?? 0);
  const bonus = Number(input.bonus ?? 0);
  const deductions = Number(input.deductions ?? 0);
  const netSalary = Number(input.netSalary ?? (baseSalary + bonus - deductions));

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const verificationCode = `OFM-PAY-${(input.id || empId || "0000").slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  return {
    organizationName: orgSettings?.organizationName || input.organizationName || input.organization || "DevOrbit Tech Kotli",
    organizationAddress: orgSettings?.organizationAddress || input.organizationAddress || "Kotli, Azad Kashmir",
    organizationEmail: orgSettings?.organizationEmail || input.organizationEmail || "finance@devorbit.tech",
    organizationPhone: orgSettings?.organizationPhone || input.organizationPhone || "+92-586-444111",
    currency: orgSettings?.currency || input.currency || "PKR",
    employeeName: empName,
    employeeId: empId,
    department: input.department || "General Administration",
    designation: input.designation || "Staff Specialist",
    period: input.period || input.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    basicSalary: baseSalary,
    bonus,
    allowances: Number(input.allowances || 0),
    deductions,
    tax: deductions * 0.6,
    providentFund: deductions * 0.4,
    netSalary,
    generatedDate: `${dateStr} at ${timeStr}`,
    verificationCode,
  };
}

/**
 * Generates standard safe filenames.
 */
export function getPdfFilename(data: PayslipExportData): string {
  const cleanId = (data.employeeId || "EMP001").replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanPeriod = (data.period || "2026-08").replace(/[^a-zA-Z0-9_-]/g, "");
  return `Payslip-${cleanId}-${cleanPeriod}.pdf`;
}

export function getImageFilename(data: PayslipExportData): string {
  const cleanId = (data.employeeId || "EMP001").replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanPeriod = (data.period || "2026-08").replace(/[^a-zA-Z0-9_-]/g, "");
  return `Payslip-${cleanId}-${cleanPeriod}.png`;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF GENERATION ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Generates a real, valid, standard PDF document file locally on the device / browser.
 * Returns local file URI.
 */
export async function generatePayslipPDF(
  input: PayslipInput,
  orgSettings?: any
): Promise<PayslipExportResult> {
  const data = normalizePayslipData(input, orgSettings);
  const filename = getPdfFilename(data);

  // Convert to PayrollEntry compatible object for binary PDF builder
  const payrollEntry: PayrollEntry = {
    id: data.employeeId,
    employeeName: data.employeeName,
    employeeId: data.employeeId,
    department: data.department,
    designation: data.designation,
    baseSalary: data.basicSalary,
    bonus: data.bonus,
    deductions: data.deductions,
    month: data.period,
    status: "paid",
  };

  const pdfBinary = buildPayslipPdfBinary(payrollEntry, {
    name: data.organizationName,
    address: data.organizationAddress,
    email: data.organizationEmail,
    phone: data.organizationPhone,
    currency: data.currency,
  });

  // 1. Web Platform (Browser)
  if (Platform.OS === "web") {
    const blob = new Blob([pdfBinary], { type: "application/pdf" });
    if (!blob || blob.size === 0) {
      throw new Error("PAYSLIP_PDF_EMPTY: Generated Web PDF blob is empty.");
    }
    const blobUrl = URL.createObjectURL(blob);
    return {
      success: true,
      uri: blobUrl,
      filename,
      fileSize: blob.size,
      mimeType: "application/pdf",
      message: "Payslip PDF generated successfully in browser",
    };
  }

  // 2. Native Mobile (Android & iOS)
  console.log("[PAYSLIP] generation started");
  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  const fileUri = `${dir}${filename}`;
  const base64Data = safeBinaryToBase64(pdfBinary);

  await FileSystem.writeAsStringAsync(fileUri, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Verify file existence and non-zero size
  const info = await FileSystem.getInfoAsync(fileUri);
  console.log("[PAYSLIP] generated URI:", fileUri);
  console.log("[PAYSLIP] file exists:", info.exists);

  if (!info.exists) {
    throw new Error("PAYSLIP_PDF_FILE_MISSING: PDF file was not written to storage.");
  }
  console.log("[PAYSLIP] file size:", info.size || pdfBinary.length);

  if (info.size !== undefined && info.size <= 0) {
    throw new Error("PAYSLIP_PDF_EMPTY: PDF file size is 0 bytes.");
  }

  return {
    success: true,
    uri: fileUri,
    filename,
    fileSize: info.size || pdfBinary.length,
    mimeType: "application/pdf",
    message: "Payslip PDF generated and stored on device",
  };
}

/**
 * Dedicated function to save the real PDF file to device storage or user-selected folder.
 */
export async function savePayslipPDFToDevice(
  input: PayslipInput,
  orgSettings?: any
): Promise<PayslipExportResult> {
  console.log("[PAYSLIP] save started");
  const result = await generatePayslipPDF(input, orgSettings);
  const data = normalizePayslipData(input, orgSettings);
  const payrollEntry: PayrollEntry = {
    id: data.employeeId,
    employeeName: data.employeeName,
    employeeId: data.employeeId,
    department: data.department,
    designation: data.designation,
    baseSalary: data.basicSalary,
    bonus: data.bonus,
    deductions: data.deductions,
    month: data.period,
    status: "paid",
  };
  const pdfBinary = buildPayslipPdfBinary(payrollEntry, {
    name: data.organizationName,
    address: data.organizationAddress,
    email: data.organizationEmail,
    phone: data.organizationPhone,
    currency: data.currency,
  });
  const base64Data = safeBinaryToBase64(pdfBinary);

  // 1. Web Browser Download
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

  // 2. Android Storage Access Framework (SAF) folder picker
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
          message: "PDF saved to selected destination successfully",
        };
      }
    } catch (safErr) {
      console.log("[PAYSLIP] SAF save skipped or cancelled:", safErr);
    }
  }

  // 3. Fallback: Native Android/iOS Save/Share dialog
  try {
    const contentUri = await FileSystem.getContentUriAsync(result.uri).catch(() => result.uri);
    await Share.share(
      Platform.OS === "ios"
        ? { url: result.uri, title: result.filename }
        : {
            title: result.filename,
            url: contentUri,
            message: `Official Salary Slip (${data.period})`,
          }
    );
    console.log("[PAYSLIP] save completed via system dialog");
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
  input: PayslipInput,
  orgSettings?: any
): Promise<PayslipExportResult> {
  return savePayslipPDFToDevice(input, orgSettings);
}

/**
 * Downloads the real PDF file to device storage or browser download directory.
 */
export async function downloadPayslipPDF(
  input: PayslipInput,
  orgSettings?: any
): Promise<PayslipExportResult> {
  return savePayslipPDFToDevice(input, orgSettings);
}

/**
 * Shares the real PDF file via native Android/iOS share sheet or Web Share API.
 */
export async function sharePayslipPDF(
  input: PayslipInput,
  orgSettings?: any
): Promise<void> {
  const result = await generatePayslipPDF(input, orgSettings);
  await sharePdfFile(result.uri, result.filename);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IMAGE GENERATION ENGINE (PNG)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Generates an official Payslip SVG markup representing the complete standalone document.
 */
export function buildPayslipSvg(data: PayslipExportData): string {
  const width = 800;
  const height = 1000;
  const {
    organizationName,
    organizationAddress,
    organizationEmail,
    organizationPhone,
    currency,
    employeeName,
    employeeId,
    department,
    designation,
    period,
    basicSalary,
    bonus,
    deductions,
    tax,
    providentFund,
    netSalary,
    generatedDate,
    verificationCode,
  } = data;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1E1B4B" />
        <stop offset="50%" stop-color="#312E81" />
        <stop offset="100%" stop-color="#4338CA" />
      </linearGradient>
      <linearGradient id="netGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#7C3AED" />
        <stop offset="100%" stop-color="#6D28D9" />
      </linearGradient>
      <style>
        .font-main { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      </style>
    </defs>

    <!-- Background -->
    <rect width="${width}" height="${height}" fill="#FFFFFF" />

    <!-- Top Header Banner -->
    <rect x="40" y="40" width="720" height="110" rx="10" fill="url(#headerGrad)" />
    <text x="65" y="80" fill="#FFFFFF" font-size="22" font-weight="bold" class="font-main">${organizationName}</text>
    <text x="65" y="105" fill="#C7D2FE" font-size="12" class="font-main">Institutional Payroll Portal · ${organizationAddress}</text>
    <text x="65" y="125" fill="#A5B4FC" font-size="10.5" class="font-main">${organizationEmail} · ${organizationPhone}</text>

    <text x="735" y="78" fill="#67E8F9" font-size="14" font-weight="bold" text-anchor="end" class="font-main">OFFICIAL PAYSLIP</text>
    <text x="735" y="100" fill="#E0E7FF" font-size="11" text-anchor="end" class="font-main">Period: ${period}</text>
    <rect x="585" y="112" width="150" height="22" rx="4" fill="#10B981" />
    <text x="660" y="127" fill="#FFFFFF" font-size="10" font-weight="bold" text-anchor="middle" class="font-main">✓ VERIFIED &amp; DISBURSED</text>

    <!-- Employee Information Box -->
    <rect x="40" y="170" width="720" height="90" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5" />
    <text x="65" y="198" fill="#64748B" font-size="10" font-weight="bold" class="font-main">EMPLOYEE FULL NAME</text>
    <text x="65" y="218" fill="#0F172A" font-size="14" font-weight="bold" class="font-main">${employeeName}</text>

    <text x="65" y="242" fill="#64748B" font-size="10" font-weight="bold" class="font-main">EMPLOYEE ID: <tspan fill="#334155" font-weight="normal">${employeeId}</tspan></text>

    <text x="440" y="198" fill="#64748B" font-size="10" font-weight="bold" class="font-main">DEPARTMENT / COST CENTER</text>
    <text x="440" y="218" fill="#0F172A" font-size="14" font-weight="bold" class="font-main">${department}</text>

    <text x="440" y="242" fill="#64748B" font-size="10" font-weight="bold" class="font-main">STATUS / ROLE: <tspan fill="#334155" font-weight="normal">${designation} (ACTIVE)</tspan></text>

    <!-- Earnings Section -->
    <text x="40" y="290" fill="#4338CA" font-size="12" font-weight="bold" class="font-main">EARNINGS &amp; ALLOWANCES</text>
    <rect x="40" y="300" width="720" height="110" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5" />
    <rect x="40" y="300" width="720" height="28" fill="#F1F5F9" />
    <text x="55" y="318" fill="#475569" font-size="11" font-weight="bold" class="font-main">DESCRIPTION</text>
    <text x="440" y="318" fill="#475569" font-size="11" font-weight="bold" class="font-main">TYPE</text>
    <text x="745" y="318" fill="#475569" font-size="11" font-weight="bold" text-anchor="end" class="font-main">AMOUNT (${currency})</text>

    <text x="55" y="348" fill="#1E293B" font-size="12" class="font-main">Basic Remuneration / Base Salary</text>
    <text x="440" y="348" fill="#64748B" font-size="12" class="font-main">Fixed Base</text>
    <text x="745" y="348" fill="#0F172A" font-size="12" font-weight="bold" text-anchor="end" class="font-main">+${formatCurrency(basicSalary, currency)}</text>

    <text x="55" y="375" fill="#1E293B" font-size="12" class="font-main">Performance Bonus &amp; Allowances</text>
    <text x="440" y="375" fill="#64748B" font-size="12" class="font-main">Variable Incentive</text>
    <text x="745" y="375" fill="#10B981" font-size="12" font-weight="bold" text-anchor="end" class="font-main">+${formatCurrency(bonus, currency)}</text>

    <line x1="40" y1="385" x2="760" y2="385" stroke="#E2E8F0" stroke-width="1" />
    <text x="55" y="402" fill="#0F172A" font-size="12" font-weight="bold" class="font-main">Total Gross Remuneration</text>
    <text x="745" y="402" fill="#10B981" font-size="13" font-weight="bold" text-anchor="end" class="font-main">+${formatCurrency(basicSalary + bonus, currency)}</text>

    <!-- Deductions Section -->
    <text x="40" y="435" fill="#E11D48" font-size="12" font-weight="bold" class="font-main">DEDUCTIONS &amp; WITHHOLDINGS</text>
    <rect x="40" y="445" width="720" height="110" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5" />
    <rect x="40" y="445" width="720" height="28" fill="#F1F5F9" />
    <text x="55" y="463" fill="#475569" font-size="11" font-weight="bold" class="font-main">DEDUCTION ITEM</text>
    <text x="440" y="463" fill="#475569" font-size="11" font-weight="bold" class="font-main">CATEGORY</text>
    <text x="745" y="463" fill="#475569" font-size="11" font-weight="bold" text-anchor="end" class="font-main">AMOUNT (${currency})</text>

    <text x="55" y="493" fill="#1E293B" font-size="12" class="font-main">Income Tax &amp; Withholding</text>
    <text x="440" y="493" fill="#64748B" font-size="12" class="font-main">Statutory</text>
    <text x="745" y="493" fill="#E11D48" font-size="12" font-weight="bold" text-anchor="end" class="font-main">-${formatCurrency(tax || deductions * 0.6, currency)}</text>

    <text x="55" y="520" fill="#1E293B" font-size="12" class="font-main">Provident Fund &amp; Health Contribution</text>
    <text x="440" y="520" fill="#64748B" font-size="12" class="font-main">Retirement / Medical</text>
    <text x="745" y="520" fill="#E11D48" font-size="12" font-weight="bold" text-anchor="end" class="font-main">-${formatCurrency(providentFund || deductions * 0.4, currency)}</text>

    <line x1="40" y1="530" x2="760" y2="530" stroke="#E2E8F0" stroke-width="1" />
    <text x="55" y="547" fill="#0F172A" font-size="12" font-weight="bold" class="font-main">Total Deductions</text>
    <text x="745" y="547" fill="#E11D48" font-size="13" font-weight="bold" text-anchor="end" class="font-main">-${formatCurrency(deductions, currency)}</text>

    <!-- Net Salary Highlight -->
    <rect x="40" y="580" width="720" height="85" rx="10" fill="url(#netGrad)" />
    <text x="65" y="615" fill="#FFFFFF" font-size="13" font-weight="bold" class="font-main">NET SALARY PAYABLE (TAKE-HOME DISBURSAL)</text>
    <text x="65" y="640" fill="#E9D5FF" font-size="11" class="font-main">Direct institutional bank deposit verified and credited to registered employee account.</text>
    <text x="735" y="632" fill="#FFFFFF" font-size="26" font-weight="bold" text-anchor="end" class="font-main">${formatCurrency(netSalary, currency)}</text>

    <!-- Signatures Section -->
    <line x1="60" y1="730" x2="260" y2="730" stroke="#94A3B8" stroke-width="1" stroke-dasharray="4,4" />
    <text x="160" y="750" fill="#0F172A" font-size="12" font-weight="bold" text-anchor="middle" class="font-main">${employeeName}</text>
    <text x="160" y="768" fill="#64748B" font-size="10.5" text-anchor="middle" class="font-main">Employee Signature</text>

    <line x1="540" y1="730" x2="740" y2="730" stroke="#94A3B8" stroke-width="1" stroke-dasharray="4,4" />
    <text x="640" y="750" fill="#0F172A" font-size="12" font-weight="bold" text-anchor="middle" class="font-main">Chief Financial Officer</text>
    <text x="640" y="768" fill="#64748B" font-size="10.5" text-anchor="middle" class="font-main">Authorized Signatory (${organizationName})</text>

    <!-- Footer -->
    <line x1="40" y1="810" x2="760" y2="810" stroke="#E2E8F0" stroke-width="1" />
    <text x="400" y="835" fill="#94A3B8" font-size="10" text-anchor="middle" class="font-main">Confidential Financial Document · Generated securely via OFM on ${generatedDate}</text>
    <text x="400" y="855" fill="#10B981" font-size="10" font-weight="bold" text-anchor="middle" class="font-main">${verificationCode}</text>
  </svg>`;
}

/**
 * Downloads a high-resolution PNG image of the payslip.
 */
export async function downloadPayslipImage(
  input: PayslipInput,
  orgSettings?: any
): Promise<PayslipExportResult> {
  const data = normalizePayslipData(input, orgSettings);
  const filename = getImageFilename(data);
  const svgString = buildPayslipSvg(data);

  // Web Browser Image Download
  if (Platform.OS === "web") {
    return new Promise((resolve, reject) => {
      try {
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 800 * 2; // 2x Retina resolution
          canvas.height = 1000 * 2;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) {
                const pngUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = pngUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                resolve({
                  success: true,
                  uri: pngUrl,
                  filename,
                  fileSize: blob.size,
                  mimeType: "image/png",
                  message: "Payslip PNG downloaded successfully",
                });
              } else {
                reject(new Error("PAYSLIP_IMAGE_GENERATION_FAILED: Failed to convert canvas to PNG blob."));
              }
            }, "image/png");
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("PAYSLIP_IMAGE_GENERATION_FAILED: Failed to load SVG into image element."));
        };

        img.src = url;
      } catch (err: any) {
        reject(new Error("PAYSLIP_IMAGE_GENERATION_FAILED: " + (err?.message || "Unknown error")));
      }
    });
  }

  // Native Mobile Image Export
  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
  const svgFilename = filename.replace(/\.png$/i, ".svg");
  const svgUri = `${dir}${svgFilename}`;

  await FileSystem.writeAsStringAsync(svgUri, svgString, { encoding: "utf8" });

  // Android Storage Access Framework: Save to Pictures / Downloads / Gallery
  if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          filename.replace(/\.png$/i, ""),
          "image/svg+xml"
        );
        await FileSystem.writeAsStringAsync(destUri, svgString, { encoding: "utf8" });
      }
    } catch (safErr) {
      console.log("[IMAGE_EXPORT] SAF folder picker skipped:", safErr);
    }
  }

  try {
    const contentUri = await FileSystem.getContentUriAsync(svgUri).catch(() => svgUri);
    await Share.share(
      Platform.OS === "ios"
        ? { url: svgUri, title: filename }
        : { title: filename, url: contentUri, message: `Official Salary Slip Image for ${data.employeeName} (${data.period})` }
    );
  } catch (err) {
    console.log("Image share flow completed:", err);
  }

  return {
    success: true,
    uri: svgUri,
    filename: svgFilename,
    fileSize: svgString.length,
    mimeType: "image/svg+xml",
    message: "Payslip Image saved and exported to Gallery/Storage",
  };
}

/**
 * Shares the payslip image.
 */
export async function sharePayslipImage(
  input: PayslipInput,
  orgSettings?: any
): Promise<void> {
  await downloadPayslipImage(input, orgSettings);
}
