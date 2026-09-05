/**
 * services/__tests__/financialInsights.test.ts
 *
 * Automated verification test suite for the Intelligent Financial Insights Engine.
 */

import { generateFinancialInsights, ActionableInsight } from "../financialInsightsService";
import { Transaction, Budget, PayrollEntry, Department } from "@/context/FinanceContext";
import { NormalizedPeriod } from "../DatePeriodService";

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${testName}`);
  }
}

console.log("\n=======================================================");
console.log("RUNNING FINANCIAL INSIGHTS ENGINE TEST MATRIX");
console.log("=======================================================\n");

const currentPeriod: NormalizedPeriod = {
  id: "this_month",
  mode: "presets",
  label: "August 2026",
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  granularity: "week",
};

const previousPeriod: NormalizedPeriod = {
  id: "last_month",
  mode: "presets",
  label: "July 2026",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  granularity: "week",
};

// 1. Clean state test (New user with no data)
const emptyInsights = generateFinancialInsights([], [], [], [], currentPeriod);
assert(emptyInsights.length === 0, "Test 1: New user with 0 records produces ZERO fake insights");

// 2. Net Operating Deficit Test
const deficitTxs: Transaction[] = [
  { id: "t1", type: "income", category: "Grant", amount: 10000, date: "2026-08-05", department: "Admin", description: "Grant" },
  { id: "t2", type: "expense", category: "Rent", amount: 25000, date: "2026-08-10", department: "Admin", description: "Rent" },
];
const deficitInsights = generateFinancialInsights(deficitTxs, [], [], [], currentPeriod);
const deficitAlert = deficitInsights.find((i) => i.type === "OPERATING_DEFICIT");
assert(!!deficitAlert, "Test 2: Net deficit triggers OPERATING_DEFICIT insight");
assert(deficitAlert?.severity === "CRITICAL", "Test 2b: Deficit severity is CRITICAL");

// 3. Revenue Expansion Test (MoM Growth > 15%)
const growthTxs: Transaction[] = [
  { id: "p1", type: "income", category: "Sales", amount: 50000, date: "2026-07-15", department: "Sales", description: "Sales" },
  { id: "c1", type: "income", category: "Sales", amount: 80000, date: "2026-08-15", department: "Sales", description: "Sales" },
];
const growthInsights = generateFinancialInsights(growthTxs, [], [], [], currentPeriod, previousPeriod);
const incGrowth = growthInsights.find((i) => i.type === "INCOME_GROWTH");
assert(!!incGrowth, "Test 3: MoM revenue surge (+60%) triggers INCOME_GROWTH insight");
assert(incGrowth?.severity === "SUCCESS", "Test 3b: Income growth severity is SUCCESS");

// 4. Budget Warning & Overrun Tests
const budgets: Budget[] = [
  { id: "b-mkt", category: "Marketing", department: "Growth", allocated: 100000, spent: 88000, period: "2026-08" },
  { id: "b-ops", category: "Operations", department: "Operations", allocated: 50000, spent: 65000, period: "2026-08" },
];
const budgetTxs: Transaction[] = [
  { id: "tx-m1", type: "expense", category: "Marketing", amount: 88000, date: "2026-08-10", department: "Growth", description: "Marketing" },
  { id: "tx-o1", type: "expense", category: "Operations", amount: 65000, date: "2026-08-12", department: "Operations", description: "Operations" },
];
const budgetInsights = generateFinancialInsights(budgetTxs, budgets, [], [], currentPeriod);
const bWarn = budgetInsights.find((i) => i.type === "BUDGET_WARNING");
const bOver = budgetInsights.find((i) => i.type === "BUDGET_OVERRUN");
assert(!!bWarn && bWarn.severity === "WARNING", "Test 4: Budget at 88% triggers BUDGET_WARNING");
assert(!!bOver && bOver.severity === "CRITICAL", "Test 5: Budget at 130% triggers BUDGET_OVERRUN (CRITICAL)");

// 5. Transaction Anomaly Outlier Detection
const anomalyTxs: Transaction[] = [
  { id: "a1", type: "expense", category: "Office Supplies", amount: 2000, date: "2026-08-01", department: "Admin", description: "Office Supplies" },
  { id: "a2", type: "expense", category: "Office Supplies", amount: 2500, date: "2026-08-03", department: "Admin", description: "Office Supplies" },
  { id: "a3", type: "expense", category: "Office Supplies", amount: 1800, date: "2026-08-07", department: "Admin", description: "Office Supplies" },
  { id: "a4", type: "expense", category: "Office Supplies", amount: 2200, date: "2026-08-10", department: "Admin", description: "Office Supplies" },
  { id: "a5", type: "expense", category: "Office Supplies", amount: 45000, date: "2026-08-15", department: "Admin", description: "Office Supplies" }, // Outlier!
];
const anomalyInsights = generateFinancialInsights(anomalyTxs, [], [], [], currentPeriod);
const anomalyAlert = anomalyInsights.find((i) => i.type === "TRANSACTION_ANOMALY");
assert(!!anomalyAlert, "Test 6: Outlier transaction (45,000 vs avg 10,700) triggers TRANSACTION_ANOMALY");

// 6. Duplicate Transaction Detection
const duplicateTxs: Transaction[] = [
  { id: "d1", type: "expense", category: "Software Subscription", amount: 12000, date: "2026-08-10", department: "Engineering", description: "Software Subscription" },
  { id: "d2", type: "expense", category: "Software Subscription", amount: 12000, date: "2026-08-11", department: "Engineering", description: "Software Subscription" },
  { id: "d3", type: "expense", category: "Travel", amount: 5000, date: "2026-08-15", department: "Sales", description: "Travel" },
  { id: "d4", type: "expense", category: "Meals", amount: 3000, date: "2026-08-18", department: "Sales", description: "Meals" },
];
const dupInsights = generateFinancialInsights(duplicateTxs, [], [], [], currentPeriod);
const dupAlert = dupInsights.find((i) => i.type === "POTENTIAL_DUPLICATE");
assert(!!dupAlert, "Test 7: Identical entries within 24h triggers POTENTIAL_DUPLICATE");

// 7. Severity Sorting Order Verification
const allCombined = [...deficitTxs, ...anomalyTxs, ...duplicateTxs];
const sortedInsights = generateFinancialInsights(allCombined, budgets, [], [], currentPeriod);
assert(sortedInsights[0].severity === "CRITICAL", "Test 8: CRITICAL insights always ranked #1 in display order");

// ──────────────────────────────────────────────────────────────────────────
// 8. LIFECYCLE & ZERO-DATA HEALTH SCORE ACCURACY (NO 66 BUG)
// ──────────────────────────────────────────────────────────────────────────
import { calculateFinancialHealth } from "../financialHealthService";

// STEP 1: Zero Data State (Complete Database Deletion)
const emptyHealth = calculateFinancialHealth([], [], [], currentPeriod);
assert(emptyHealth.hasData === false, "Test 9a: Empty database hasData is false");
assert(emptyHealth.healthScore === null, "Test 9b: Empty database healthScore is null (NEVER 66)");
assert(emptyHealth.displayScore === "N/A", "Test 9c: Empty database displayScore is 'N/A' (NEVER '66')");
assert(emptyHealth.status === "No Data", "Test 9d: Empty database status is 'No Data' (NEVER 'Healthy')");
assert(emptyHealth.statusColor === "#94A3B8", "Test 9e: Empty database statusColor is neutral slate gray");
assert(emptyHealth.metrics.operatingMargin.displayValue === "N/A", "Test 9f: Metric displayValue is N/A when zero data");

// STEP 2: Add Income = £10,000
const step2Txs: Transaction[] = [
  { id: "inc-1", type: "income", category: "Grants", amount: 10000, date: "2026-08-05", department: "Finance", description: "Grant Inflow" },
];
const step2Health = calculateFinancialHealth(step2Txs, [], [], currentPeriod);
assert(step2Health.hasData === true, "Test 10a: Income £10,000 hasData is true");
assert(step2Health.healthScore !== null && step2Health.healthScore >= 90, "Test 10b: Income £10,000 healthScore is >= 90 (Excellent)");
assert(step2Health.status === "Excellent", "Test 10c: Status is Excellent");

// STEP 3: Add Expense = £4,000
const step3Txs: Transaction[] = [
  ...step2Txs,
  { id: "exp-1", type: "expense", category: "Operations", amount: 4000, date: "2026-08-10", department: "Ops", description: "Operations Cost" },
];
const step3Health = calculateFinancialHealth(step3Txs, [], [], currentPeriod);
assert(step3Health.hasData === true, "Test 11a: Inflow £10k + Outflow £4k hasData is true");
assert(step3Health.metrics.operatingMargin.value === 60, "Test 11b: Margin is exactly 60%");
assert(step3Health.metrics.operatingMargin.score === 100, "Test 11c: Margin score is 100 for >=25% margin");

// STEP 4: Edit Expense = £4,000 -> £8,000 (No double counting)
const step4Txs: Transaction[] = [
  ...step2Txs,
  { id: "exp-1", type: "expense", category: "Operations", amount: 8000, date: "2026-08-10", department: "Ops", description: "Updated Operations Cost" },
];
const step4Health = calculateFinancialHealth(step4Txs, [], [], currentPeriod);
assert(step4Health.metrics.operatingMargin.value === 20, "Test 12a: Updated margin is strictly 20% (no accumulation)");
assert(step4Health.metrics.cashFlowStability.value === 2000, "Test 12b: Net balance is strictly 2,000");

// STEP 5: Add Budget = £10,000
const step5Budgets: Budget[] = [
  { id: "b-1", category: "Operations", department: "Ops", allocated: 10000, spent: 8000, period: "2026-08" },
];
const step5Health = calculateFinancialHealth(step4Txs, step5Budgets, [], currentPeriod);
assert(step5Health.metrics.budgetAdherence.value === 80, "Test 13a: Budget utilization is 80%");
assert(step5Health.metrics.budgetAdherence.weight === 25, "Test 13b: Budget metric dynamically included with weight 25");

// STEP 6: Delete Budget
const step6Health = calculateFinancialHealth(step4Txs, [], [], currentPeriod);
assert(step6Health.metrics.budgetAdherence.weight === 0, "Test 14a: Deleted budget weight is 0");
assert(step6Health.metrics.budgetAdherence.displayValue === "N/A", "Test 14b: Deleted budget display is N/A (no division by zero)");

// STEP 7: Delete Expense £8,000
const step7Txs = step4Txs.filter((t) => t.type !== "expense");
const step7Health = calculateFinancialHealth(step7Txs, [], [], currentPeriod);
assert(step7Health.metrics.operatingMargin.value === 100, "Test 15a: Reverts back to 100% margin on expense delete");

// STEP 8: Delete Income £10,000 -> Complete Deletion
const step8Txs: Transaction[] = [];
const step8Health = calculateFinancialHealth(step8Txs, [], [], currentPeriod);
assert(step8Health.hasData === false, "Test 16a: Full deletion returns hasData: false");
assert(step8Health.healthScore === null, "Test 16b: Full deletion returns healthScore: null (NEVER 66)");
assert(step8Health.displayScore === "N/A", "Test 16c: Full deletion returns displayScore: 'N/A'");
assert(step8Health.status === "No Data", "Test 16d: Full deletion returns status: 'No Data'");

// STEP 9: Soft-deleted records are ignored
const softDeletedTxs: any[] = [
  { id: "del-1", type: "income", amount: 50000, date: "2026-08-01", status: "deleted" },
  { id: "void-1", type: "expense", amount: 25000, date: "2026-08-02", status: "void" },
];
const softDelHealth = calculateFinancialHealth(softDeletedTxs as any, [], [], currentPeriod);
assert(softDelHealth.hasData === false, "Test 17a: Soft-deleted records produce hasData: false");
assert(softDelHealth.healthScore === null, "Test 17b: Soft-deleted records produce healthScore: null");

console.log("\n=======================================================");
console.log("ALL FINANCIAL INSIGHTS & HEALTH ENGINE TESTS PASSED 100% ✅");
console.log("=======================================================\n");
