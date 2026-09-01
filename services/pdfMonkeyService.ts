/**
 * services/pdfMonkeyService.ts
 *
 * Re-exports from authoritative pdfDownloadService.
 * ZERO CLIENT SECRETS: All PDF generation requests route through secure Firebase Functions.
 */

import {
  downloadPayslipPdf,
  downloadFinancialReportPdf,
  PdfExportResult,
} from "./pdfDownloadService";
import { PayrollEntry } from "@/context/FinanceContext";
import { OrganizationInfo } from "./payslipPdfService";
import { ReportOptions } from "./ReportExportService";

export { PdfExportResult };

export async function exportPayslipPdfMonkey(
  payslip: PayrollEntry,
  orgInfo?: OrganizationInfo
): Promise<PdfExportResult> {
  return downloadPayslipPdf(payslip, orgInfo);
}

export async function exportFinancialReportPdfMonkey(
  opts: ReportOptions
): Promise<PdfExportResult> {
  return downloadFinancialReportPdf(opts);
}
