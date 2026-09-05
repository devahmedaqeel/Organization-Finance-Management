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

console.log("\n=======================================================");
console.log("ALL FINANCIAL INSIGHTS ENGINE TESTS PASSED 100% ✅");
console.log("=======================================================\n");
