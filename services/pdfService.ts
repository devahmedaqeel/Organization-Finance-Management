/**
 * services/pdfService.ts
 *
 * Universal Authoritative PDF Generation & Download Service for OFM.
 * Re-exports from pdfDownloadService with full backwards compatibility.
 */

import {
  downloadPayslipPdf,
  downloadFinancialReportPdf,
  openPdfFile,
  sharePdfFile,
  PdfExportResult,
  validatePdfBase64,
  validatePdfFile,
  sanitizeFilename,
} from "./pdfDownloadService";
import { PayrollEntry } from "@/context/FinanceContext";
import { OrganizationInfo } from "./payslipPdfService";
import { ReportOptions } from "./ReportExportService";

export {
  PdfExportResult,
  validatePdfBase64,
  validatePdfFile,
  sanitizeFilename,
  openPdfFile,
  sharePdfFile,
};

export async function generatePayslipPdf(
  payslip: PayrollEntry,
  orgInfo?: OrganizationInfo
): Promise<PdfExportResult> {
  return downloadPayslipPdf(payslip, orgInfo);
}

export async function generateFinancialReportPdf(
  opts: ReportOptions
): Promise<PdfExportResult> {
  return downloadFinancialReportPdf(opts);
}

export async function generateExpenseReportPdf(
  opts: ReportOptions
): Promise<PdfExportResult> {
  return downloadFinancialReportPdf({ ...opts, reportMode: "expense" });
}

export async function generateBudgetReportPdf(
  opts: ReportOptions
): Promise<PdfExportResult> {
  return downloadFinancialReportPdf({ ...opts, reportMode: "full" });
}
