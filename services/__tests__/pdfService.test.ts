/**
 * services/__tests__/pdfService.test.ts
 *
 * Automated verification test suite for HTMLPDF.dev Native Base64 PDF Pipeline.
 */

import { buildPayslipPdfBinary } from "../payslipPdfService";
import type { ReportOptions } from "../ReportExportService";
import { sanitizeFilename, validatePdfBase64 } from "../pdfDownloadService";
import { buildPayslipHtml } from "../pdfTemplates/payslipTemplate";
import { buildFinancialReportHtml } from "../pdfTemplates/financialReportTemplate";
import type { PayrollEntry } from "@/context/FinanceContext";

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${testName}`);
  }
}

console.log("\n=======================================================");
console.log("RUNNING HTMLPDF.DEV NATIVE BASE64 PDF TEST SUITE");
console.log("=======================================================\n");

// 1. Filename Sanitization Test
const dirtyFilename = 'Payslip/Ahmed:Khan*September?"2026<test>|file.pdf';
const cleanFilename = sanitizeFilename(dirtyFilename);
assert(!cleanFilename.includes("/") && !cleanFilename.includes(":") && !cleanFilename.includes("*"), "Test 1: Sanitizes OS-forbidden characters from filename");
assert(cleanFilename.endsWith(".pdf"), "Test 1b: Preserves .pdf extension");

// 2. Native Base64 Validation Test
const validBase64Pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");
const validation = validatePdfBase64(validBase64Pdf);
assert(validation.valid === true, "Test 2: validatePdfBase64 confirms valid %PDF- Base64 payload");

const invalidBase64 = Buffer.from("<html>Error 404</html>").toString("base64");
const invalidValidation = validatePdfBase64(invalidBase64);
assert(invalidValidation.valid === false, "Test 2b: validatePdfBase64 rejects non-PDF HTML error payloads");

// 3. Real Payslip PDF Binary Generation Test
const samplePayslip: PayrollEntry = {
  id: "pay-1001",
  employeeName: "Muhammad Ahmed",
  employeeId: "EMP-042",
  department: "Software Engineering",
  baseSalary: 150000,
  bonus: 25000,
  deductions: 5000,
  netSalary: 170000,
  month: "2026-08",
  paymentStatus: "paid",
};

const payslipPdf = buildPayslipPdfBinary(samplePayslip, {
  name: "DevOrbit Tech Kotli",
  address: "Kotli, Azad Kashmir",
  currency: "PKR",
});

assert(payslipPdf.startsWith("%PDF-1.4"), "Test 3: Payslip PDF starts with standard %PDF-1.4 header");
assert(payslipPdf.includes("%%EOF"), "Test 3b: Payslip PDF terminates with %%EOF marker");
assert(payslipPdf.includes("Muhammad Ahmed"), "Test 3c: Payslip PDF contains exact real employee name");
assert(payslipPdf.includes("170,000.00"), "Test 3d: Payslip PDF contains exact net salary calculation");
assert(payslipPdf.length > 500, `Test 3e: Payslip PDF has valid non-zero byte size (${payslipPdf.length} bytes)`);

// 4. HTMLPDF.dev Payslip Template Test
const payslipHtml = buildPayslipHtml(samplePayslip, {
  name: "DevOrbit Tech Kotli",
  address: "Kotli, Azad Kashmir",
  currency: "PKR",
});
assert(payslipHtml.includes("@page"), "Test 4: Payslip HTML includes print CSS @page rule");
assert(payslipHtml.includes("Muhammad Ahmed"), "Test 4b: Payslip HTML includes employee name");
assert(payslipHtml.includes("170,000.00"), "Test 4c: Payslip HTML includes net salary");

// 5. HTMLPDF.dev Financial Report Template Test
const sampleReportOpts: ReportOptions = {
  organizationName: "DevOrbit Tech Kotli",
  currency: "PKR",
  periodLabel: "August 2026",
  generatedBy: "Chief Financial Officer",
  totalIncome: 500000,
  totalExpenses: 320000,
  netBalance: 180000,
  budgetUtilization: 64.0,
  transactions: [
    { id: "t1", type: "income", category: "Client Contract", amount: 500000, date: "2026-08-01", department: "Growth", description: "Client Contract" },
    { id: "t2", type: "expense", category: "Cloud Infrastructure", amount: 320000, date: "2026-08-05", department: "Engineering", description: "Cloud Infrastructure" },
  ],
  departments: [
    { id: "d1", name: "Engineering", budgetAllocated: 500000, headCount: 5 },
  ],
  payroll: [samplePayslip],
  budgets: [
    { id: "b1", category: "Cloud Infrastructure", department: "Engineering", allocated: 500000, spent: 320000, period: "2026-08" },
  ],
};

const financialReportHtml = buildFinancialReportHtml(sampleReportOpts);
assert(financialReportHtml.includes("@page"), "Test 5: Financial Report HTML includes print CSS @page rule");
assert(financialReportHtml.includes("500,000.00"), "Test 5b: Financial Report HTML contains total revenue");
assert(financialReportHtml.includes("180,000.00"), "Test 5c: Financial Report HTML contains net operating balance");

console.log("\n=======================================================");
console.log("ALL HTMLPDF.DEV NATIVE BASE64 PDF TESTS PASSED 100% ✅");
console.log("=======================================================\n");
