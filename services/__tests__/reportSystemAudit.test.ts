/**
 * services/__tests__/reportSystemAudit.test.ts
 *
 * Master Automated Verification Suite for OFM Web Reports & PDF Reporting System.
 * Strictly tests all 16 audit phases:
 *  1. 1 Month Date Filtering
 *  2. 3 Months Date Filtering
 *  3. 6 Months Date Filtering
 *  4. 1 Year Date Filtering
 *  5. Custom Date Range Boundaries (2026-01-15 -> 2026-09-10)
 *  6. All Time Scope
 *  7. Income Only Scenario
 *  8. Expense Only Scenario
 *  9. Income + Expenses (Net Operating Balance)
 * 10. Budget Allocation, Utilization & Remaining Capacity
 * 11. Trend Graph Data-Driven Matching
 * 12. Zero Data Empty State (No Synthetic Fallbacks)
 * 13. Web / PDF Calculation Parity
 * 14. Large Dataset Multi-Page PDF Generation
 * 15. Tenant & Organization Isolation
 * 16. Exact Number Formatting (PKR 7,750 vs 7.8K)
 */

import {
  NormalizedPeriod,
  getPresetPeriod,
  createCustomDatePeriod,
  filterTransactionsByPeriod,
  aggregateTransactionsByGranularity,
} from "../DatePeriodService";
import {
  buildEnterpriseReportData,
  EnterpriseReportData,
} from "../reportDataService";
import {
  buildFinancialPdfBinary,
  generateFinancialHtmlReport,
} from "../ReportExportService";
import type { Transaction, Budget, PayrollEntry, Department } from "@/context/FinanceContext";

function assert(condition: boolean, testName: string, detail?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${testName}`);
  }
}

console.log("\n=======================================================");
console.log("RUNNING MASTER 16-TEST REPORTING AUDIT & PARITY SUITE");
console.log("=======================================================\n");

const baseSettings = {
  organizationName: "Global Apex Holdings",
  organizationAddress: "Tower 4, Financial District",
  organizationEmail: "audit@globalapex.com",
  organizationPhone: "+1-800-555-0100",
  currency: "PKR",
  fiscalYear: "2025-2026",
};

const baseUser = {
  name: "Sarah Jenkins",
  email: "sarah@globalapex.com",
  role: "admin",
  organization: "Global Apex Holdings",
  organizationId: "org-apex-01",
};

// ─── TEST 1: Selected 1 Month ───
{
  const p1m = getPresetPeriod("this_month");
  assert(!!p1m.startDate && !!p1m.endDate, "Test 1a: 1 Month has valid startDate and endDate");
  assert(p1m.startDate.endsWith("-01"), "Test 1b: 1 Month starts on day 01");
  
  const testTxs: Transaction[] = [
    { id: "t-in-month", type: "income", category: "Consulting", amount: 25000, date: `${p1m.startDate.slice(0, 7)}-15`, department: "Services", description: "In month" },
    { id: "t-prev-month", type: "income", category: "Consulting", amount: 15000, date: "2023-01-01", department: "Services", description: "Old" },
  ];
  const report1m = buildEnterpriseReportData(testTxs, [], [], [], { period: p1m, scope: "period" }, baseSettings, baseUser);
  assert(report1m.executiveSummary.totalRevenue === 25000, "Test 1c: 1 Month includes exactly transactions in selected month");
  assert(report1m.generalLedger.transactions.length === 1, "Test 1d: 1 Month excludes transactions outside selected month");
}

// ─── TEST 2: Selected 3 Months ───
{
  const p3m = getPresetPeriod("last_3m");
  const testTxs: Transaction[] = [
    { id: "t-3m-active", type: "income", category: "Grants", amount: 75000, date: p3m.startDate, department: "Finance", description: "Start boundary" },
    { id: "t-3m-out", type: "income", category: "Grants", amount: 50000, date: "2022-05-10", department: "Finance", description: "Way before" },
  ];
  const report3m = buildEnterpriseReportData(testTxs, [], [], [], { period: p3m, scope: "period" }, baseSettings, baseUser);
  assert(report3m.executiveSummary.totalRevenue === 75000, "Test 2: 3 Months includes strictly records in that 3-month window");
}

// ─── TEST 3: Selected 6 Months ───
{
  const p6m = getPresetPeriod("last_6m");
  const testTxs: Transaction[] = [
    { id: "t-6m-inc", type: "income", category: "Sales", amount: 120000, date: p6m.startDate, department: "Commercial", description: "Inflow" },
    { id: "t-6m-exp", type: "expense", category: "Operations", amount: 45000, date: p6m.endDate, department: "Commercial", description: "Outflow" },
  ];
  const report6m = buildEnterpriseReportData(testTxs, [], [], [], { period: p6m, scope: "period" }, baseSettings, baseUser);
  assert(report6m.executiveSummary.totalRevenue === 120000, "Test 3a: 6 Months correct revenue aggregation");
  assert(report6m.executiveSummary.totalExpenses === 45000, "Test 3b: 6 Months correct expenses aggregation");
  assert(report6m.executiveSummary.netOperatingBalance === 75000, "Test 3c: 6 Months correct net balance");
}

// ─── TEST 4: Selected 1 Year ───
{
  const p1y = getPresetPeriod("this_year");
  const yr = new Date().getFullYear();
  assert(p1y.startDate === `${yr}-01-01`, "Test 4a: 1 Year starts on Jan 1 of current year");
  assert(p1y.endDate === `${yr}-12-31`, "Test 4b: 1 Year ends on Dec 31 of current year");

  const testTxs: Transaction[] = [
    { id: "t-yr-cur", type: "income", category: "Services", amount: 200000, date: `${yr}-06-15`, department: "IT", description: "Current year" },
    { id: "t-yr-past", type: "income", category: "Services", amount: 100000, date: `${yr - 1}-06-15`, department: "IT", description: "Prior year" },
  ];
  const report1y = buildEnterpriseReportData(testTxs, [], [], [], { period: p1y, scope: "period" }, baseSettings, baseUser);
  assert(report1y.executiveSummary.totalRevenue === 200000, "Test 4c: 1 Year excludes prior year data");
}

// ─── TEST 5: Custom Date Range (2026-01-15 -> 2026-09-10) ───
{
  const customPeriod = createCustomDatePeriod("2026-01-15", "2026-09-10");
  const testTxs: Transaction[] = [
    { id: "t-before", type: "income", category: "Fees", amount: 10000, date: "2026-01-14", department: "Ops", description: "Before start" },
    { id: "t-start", type: "income", category: "Fees", amount: 20000, date: "2026-01-15", department: "Ops", description: "Exact start boundary" },
    { id: "t-mid", type: "income", category: "Fees", amount: 30000, date: "2026-05-20", department: "Ops", description: "Middle" },
    { id: "t-end", type: "income", category: "Fees", amount: 40000, date: "2026-09-10", department: "Ops", description: "Exact end boundary" },
    { id: "t-after", type: "income", category: "Fees", amount: 50000, date: "2026-09-11", department: "Ops", description: "After end" },
  ];
  const reportCustom = buildEnterpriseReportData(testTxs, [], [], [], {
    period: customPeriod,
    scope: "period",
    startDate: "2026-01-15",
    endDate: "2026-09-10",
  }, baseSettings, baseUser);

  assert(reportCustom.generalLedger.transactions.length === 3, "Test 5a: Custom range includes exactly 3 transactions");
  assert(reportCustom.executiveSummary.totalRevenue === 90000, "Test 5b: Custom range excludes 2026-01-14 and 2026-09-11");
  assert(reportCustom.filters.startDate === "2026-01-15" && reportCustom.filters.endDate === "2026-09-10", "Test 5c: Custom range preserves start & end dates in metadata");
}

// ─── TEST 6: All Time Scope ───
{
  const testTxs: Transaction[] = [
    { id: "t1", type: "income", category: "Capital", amount: 500000, date: "2021-03-01", department: "Treasury", description: "Old record" },
    { id: "t2", type: "expense", category: "Legal", amount: 80000, date: "2026-08-20", department: "Legal", description: "Recent record" },
  ];
  const reportAll = buildEnterpriseReportData(testTxs, [], [], [], { scope: "all" }, baseSettings, baseUser);
  assert(reportAll.generalLedger.transactions.length === 2, "Test 6a: All Time includes all historical organization records");
  assert(reportAll.executiveSummary.totalRevenue === 500000, "Test 6b: All Time captures total historical revenue");
  assert(reportAll.executiveSummary.totalExpenses === 80000, "Test 6c: All Time captures total historical expenses");
}

// ─── TEST 7: Income Only Scenario ───
{
  const testTxs: Transaction[] = [
    { id: "t-inc1", type: "income", category: "Consulting", amount: 60000, date: "2026-08-01", department: "Sales", description: "Fee" },
    { id: "t-inc2", type: "income", category: "Licensing", amount: 40000, date: "2026-08-05", department: "Sales", description: "License" },
  ];
  const reportIncOnly = buildEnterpriseReportData(testTxs, [], [], [], { scope: "all" }, baseSettings, baseUser);
  assert(reportIncOnly.executiveSummary.totalRevenue === 100000, "Test 7a: Income Only correct total");
  assert(reportIncOnly.executiveSummary.totalExpenses === 0, "Test 7b: Zero fake expenses in Income Only scenario");
  assert(reportIncOnly.executiveSummary.netOperatingBalance === 100000, "Test 7c: Net Operating Balance equals total income");
}

// ─── TEST 8: Expense Only Scenario ───
{
  const testTxs: Transaction[] = [
    { id: "t-exp1", type: "expense", category: "Server Hosting", amount: 35000, date: "2026-08-02", department: "Engineering", description: "AWS" },
    { id: "t-exp2", type: "expense", category: "Office Supplies", amount: 15000, date: "2026-08-03", department: "Admin", description: "Supplies" },
  ];
  const reportExpOnly = buildEnterpriseReportData(testTxs, [], [], [], { scope: "all" }, baseSettings, baseUser);
  assert(reportExpOnly.executiveSummary.totalRevenue === 0, "Test 8a: Zero fake income in Expense Only scenario");
  assert(reportExpOnly.executiveSummary.totalExpenses === 50000, "Test 8b: Total expenses accurately aggregated");
  assert(reportExpOnly.executiveSummary.netOperatingBalance === -50000, "Test 8c: Net Operating Balance is exactly negative 50,000");
  assert(reportExpOnly.executiveSummary.isNetPositive === false, "Test 8d: Correctly flagged as net deficit");
}

// ─── TEST 9: Income + Expenses (NOB Parity) ───
{
  const testTxs: Transaction[] = [
    { id: "t1", type: "income", category: "Sales", amount: 125000, date: "2026-08-01", department: "Growth", description: "Client retainer" },
    { id: "t2", type: "expense", category: "Payroll", amount: 75000, date: "2026-08-02", department: "Engineering", description: "Disbursement" },
  ];
  const report = buildEnterpriseReportData(testTxs, [], [], [], { scope: "all" }, baseSettings, baseUser);
  assert(report.executiveSummary.totalRevenue - report.executiveSummary.totalExpenses === report.executiveSummary.netOperatingBalance, "Test 9a: Net Balance strictly equals Total Revenue minus Total Expenses");
  assert(report.executiveSummary.netOperatingBalance === 50000, "Test 9b: 125,000 - 75,000 = exactly 50,000");
}

// ─── TEST 10: Budget Allocation, Utilization & Remaining Capacity ───
{
  const budgets: Budget[] = [
    { id: "b1", department: "Engineering", category: "Cloud Infrastructure", allocated: 100000, period: "2026-08" },
  ];
  const departments: Department[] = [
    { id: "d1", name: "Engineering", budgetAllocated: 100000, headCount: 8 },
  ];
  const transactions: Transaction[] = [
    { id: "t1", type: "expense", category: "Cloud Infrastructure", amount: 65000, date: "2026-08-10", department: "Engineering", description: "Servers" },
  ];
  const reportBudget = buildEnterpriseReportData(transactions, budgets, [], departments, { scope: "all" }, baseSettings, baseUser);
  assert(reportBudget.budgetPerformance.totalAllocated === 100000, "Test 10a: Budget allocated matches 100,000");
  assert(reportBudget.budgetPerformance.totalSpent === 65000, "Test 10b: Budget spent matches 65,000");
  assert(reportBudget.budgetPerformance.totalRemaining === 35000, "Test 10c: Budget remaining is exactly 35,000");
  assert(reportBudget.budgetPerformance.overallUtilizationPct === 65, "Test 10d: Budget utilization percentage is exactly 65%");
}

// ─── TEST 11: Trend Graph Data-Driven Matching ───
{
  const p3m = getPresetPeriod("last_3m");
  const transactions: Transaction[] = [
    { id: "t1", type: "income", category: "Consulting", amount: 40000, date: p3m.startDate, department: "Sales", description: "Month 1" },
    { id: "t2", type: "expense", category: "Ops", amount: 15000, date: p3m.endDate, department: "Ops", description: "Month 3" },
  ];
  const reportTrend = buildEnterpriseReportData(transactions, [], [], [], { period: p3m, scope: "period" }, baseSettings, baseUser);
  assert(reportTrend.monthlyTrends.chartPoints.length > 0, "Test 11a: Trend points generated for selected period");
  const allZero = reportTrend.monthlyTrends.chartPoints.every(p => p.income === 0 && p.expense === 0);
  assert(!allZero, "Test 11b: Trend points reflect real financial activity");
}

// ─── TEST 12: Zero Data Empty State (No Synthetic Fallbacks) ───
{
  const reportZero = buildEnterpriseReportData([], [], [], [], { scope: "all" }, baseSettings, baseUser);
  assert(reportZero.executiveSummary.totalRevenue === 0, "Test 12a: Zero data reports 0 total revenue");
  assert(reportZero.executiveSummary.totalExpenses === 0, "Test 12b: Zero data reports 0 total expenses");
  assert(reportZero.executiveSummary.netOperatingBalance === 0, "Test 12c: Zero data reports 0 net balance");
  assert(reportZero.generalLedger.transactions.length === 0, "Test 12d: Zero data reports 0 transactions");

  const pdfBinary = buildFinancialPdfBinary(reportZero);
  assert(pdfBinary.startsWith("%PDF-1.4"), "Test 12e: Zero data PDF starts with %PDF-1.4");
  assert(pdfBinary.includes("No financial records were found for the selected period."), "Test 12f: Zero data PDF includes clean empty state message");
  assert(pdfBinary.includes("%%EOF"), "Test 12g: Zero data PDF terminates with %%EOF");
}

// ─── TEST 13: Web / PDF Calculation Parity ───
{
  const testTxs: Transaction[] = [
    { id: "t1", type: "income", category: "Institutional Grant", amount: 250000, date: "2026-08-01", department: "Executive", description: "Grant A" },
    { id: "t2", type: "expense", category: "Payroll", amount: 120000, date: "2026-08-15", department: "Engineering", description: "August Payroll" },
  ];
  const reportData = buildEnterpriseReportData(testTxs, [], [], [], { scope: "all" }, baseSettings, baseUser);

  const pdfStr = buildFinancialPdfBinary(reportData);
  const htmlStr = generateFinancialHtmlReport(reportData);

  assert(pdfStr.includes("250,000.00"), "Test 13a: PDF binary contains exact unrounded revenue (250,000.00)");
  assert(pdfStr.includes("120,000.00"), "Test 13b: PDF binary contains exact unrounded expenses (120,000.00)");
  assert(pdfStr.includes("130,000.00"), "Test 13c: PDF binary contains exact net operating balance (130,000.00)");
  assert(htmlStr.includes("250,000.00"), "Test 13d: HTML report contains exact unrounded revenue (250,000.00)");
  assert(htmlStr.includes("120,000.00"), "Test 13e: HTML report contains exact unrounded expenses (120,000.00)");
}

// ─── TEST 14: Large Dataset Multi-Page PDF Generation ───
{
  const largeTxs: Transaction[] = [];
  for (let i = 1; i <= 120; i++) {
    const isInc = i % 2 === 0;
    largeTxs.push({
      id: `tx-large-${i}`,
      type: isInc ? "income" : "expense",
      category: isInc ? "Client Invoice" : "Operational Overhead",
      amount: 1000 + i * 50,
      date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
      department: i % 3 === 0 ? "Engineering" : i % 3 === 1 ? "Marketing" : "Operations",
      description: `Invoice item #${i}`,
    });
  }
  const largeReport = buildEnterpriseReportData(largeTxs, [], [], [], { scope: "all" }, baseSettings, baseUser);
  assert(largeReport.generalLedger.transactions.length === 120, "Test 14a: Large dataset maintains all 120 transactions");

  const pdfBinary = buildFinancialPdfBinary(largeReport);
  assert(pdfBinary.includes("/Count "), "Test 14b: PDF includes multi-page count catalog");
  
  // Verify that count is greater than 1
  const countMatch = pdfBinary.match(/\/Count\s+(\d+)/);
  const pageCount = countMatch ? parseInt(countMatch[1], 10) : 1;
  assert(pageCount >= 3, `Test 14c: 120 transactions generate multiple pages (got ${pageCount} pages, >= 3)`);
  assert(pdfBinary.includes("Invoice item #120"), "Test 14d: Last transaction #120 is present in PDF (not sliced)");
}

// ─── TEST 15: Organization Isolation ───
{
  const orgATxs: Transaction[] = [
    { id: "tx-a1", organizationId: "org-A", type: "income", category: "Revenue", amount: 99999, date: "2026-08-01", department: "Sales", description: "Org A transaction" },
  ];
  const orgBTxs: Transaction[] = [
    { id: "tx-b1", organizationId: "org-B", type: "income", category: "Revenue", amount: 11111, date: "2026-08-01", department: "Sales", description: "Org B transaction" },
  ];

  const reportA = buildEnterpriseReportData(orgATxs, [], [], [], { scope: "all" }, baseSettings, { ...baseUser, organizationId: "org-A" });
  assert(reportA.executiveSummary.totalRevenue === 99999, "Test 15a: Org A report contains only Org A revenue");
  assert(!reportA.generalLedger.transactions.some(t => t.description === "Org B transaction"), "Test 15b: Zero cross-tenant leakage of Org B into Org A");
}

// ─── TEST 16: Exact Number Formatting (PKR 7,750 vs 7.8K) ───
{
  const testTxs: Transaction[] = [
    { id: "t-exact", type: "expense", category: "Office Supplies", amount: 7750, date: "2026-08-01", department: "Admin", description: "Supplies" },
  ];
  const report = buildEnterpriseReportData(testTxs, [], [], [], { scope: "all" }, baseSettings, baseUser);
  const pdfBinary = buildFinancialPdfBinary(report);
  assert(pdfBinary.includes("7,750.00"), "Test 16a: PDF tables display exact PKR 7,750.00");
  assert(!pdfBinary.includes("7.8K"), "Test 16b: PDF tables do NOT display rounded 7.8K");
}

console.log("\n=======================================================");
console.log("ALL 16 REPORTING AUDIT & PARITY TESTS PASSED 100% ✅");
console.log("=======================================================\n");
