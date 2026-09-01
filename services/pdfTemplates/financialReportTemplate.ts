/**
 * services/pdfTemplates/financialReportTemplate.ts
 *
 * Authoritative Comprehensive HTML Template for Mobile & Web PDF Generation.
 * Produces full multi-page executive statements matching the Web application.
 */

import { ReportOptions, generateFinancialHtmlReport } from "@/services/ReportExportService";

export function buildFinancialReportHtml(opts: ReportOptions): string {
  return generateFinancialHtmlReport(opts);
}
