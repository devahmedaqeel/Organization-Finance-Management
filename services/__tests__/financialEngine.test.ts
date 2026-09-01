/**
 * services/__tests__/financialEngine.test.ts
 *
 * Automated verification suite for Authoritative Financial Calculation Engine.
 * Tests exact scenarios from MASTER PROMPT matrix.
 */

import {
  Transaction,
  Budget,
  Department,
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetOperatingResult,
  calculateActualCash,
  calculateBudgetAllocation,
  calculateBudgetSpentForCategory,
  calculateBudgetUsed,
  calculateBudgetRemaining,
  calculateBudgetUtilization,
  calculateNetOperatingMargin,
  calculateExpenseDistribution,
} from "../FinancialCalculationEngine";

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${testName}`);
  }
}

console.log("\n=======================================================");
console.log("RUNNING AUTHORITATIVE FINANCIAL ENGINE TEST MATRIX");
console.log("=======================================================\n");

// State containers simulating real ledger
let transactions: Transaction[] = [];
let budgets: Budget[] = [];
let departments: Department[] = [];

// 1. Initial State
assert(calculateTotalIncome(transactions) === 0, "Initial Income is 0");
assert(calculateTotalExpenses(transactions) === 0, "Initial Expenses is 0");
assert(calculateNetOperatingResult(transactions) === 0, "Initial Net Operating Result is 0");
assert(calculateBudgetAllocation(budgets) === 0, "Initial Budget Allocation is 0");

// 2. Add Income = 100,000
transactions.push({
  id: "tx-inc-1",
  type: "income",
  category: "Client Contract",
  amount: 100000,
  date: "2026-08-01",
  department: "Administration",
  status: "completed",
});
assert(calculateTotalIncome(transactions) === 100000, "Add Income 100,000 -> Total Income is 100,000");
assert(calculateTotalExpenses(transactions) === 0, "Add Income -> Total Expenses remains 0");
assert(calculateNetOperatingResult(transactions) === 100000, "Add Income -> Net Operating Result is 100,000");
assert(calculateBudgetAllocation(budgets) === 0, "Add Income -> Budget Allocation remains 0");

// 3. Add Expense = 20,000
transactions.push({
  id: "tx-exp-1",
  type: "expense",
  category: "Office Rent",
  amount: 20000,
  date: "2026-08-02",
  department: "Administration",
  status: "completed",
});
assert(calculateTotalIncome(transactions) === 100000, "Add Expense -> Total Income remains 100,000");
assert(calculateTotalExpenses(transactions) === 20000, "Add Expense 20,000 -> Total Expenses is 20,000");
assert(calculateNetOperatingResult(transactions) === 80000, "Add Expense -> Net Operating Result is 80,000");

// 4. Add Budget = 50,000 (Marketing)
budgets.push({
  id: "b-mkt-1",
  category: "Marketing",
  department: "Software Engineering",
  allocated: 50000,
  period: "2026-08",
});
assert(calculateBudgetAllocation(budgets) === 50000, "Add Budget 50,000 -> Budget Allocation is 50,000");
assert(calculateTotalIncome(transactions) === 100000, "Add Budget -> Income MUST NOT increase (remains 100,000)");
assert(calculateNetOperatingResult(transactions) === 80000, "Add Budget -> Net Operating Result MUST NOT increase (remains 80,000)");

// 5. Add Budget-Linked Expense = 10,000 (Marketing)
transactions.push({
  id: "tx-exp-2",
  type: "expense",
  category: "Marketing",
  amount: 10000,
  date: "2026-08-03",
  department: "Software Engineering",
  status: "completed",
});
const mktBudgetSpent = calculateBudgetSpentForCategory(budgets[0], transactions);
assert(mktBudgetSpent === 10000, "Budget-Linked Expense -> Category Spent is 10,000");
assert(calculateBudgetRemaining(budgets[0].allocated, mktBudgetSpent) === 40000, "Budget Remaining is 40,000");
const mktUtil = calculateBudgetUtilization(mktBudgetSpent, budgets[0].allocated);
assert(mktUtil.rawUtilizationPct === 20, "Budget Utilization is 20%");
assert(calculateTotalExpenses(transactions) === 30000, "Total Expenses is 30,000 (20k Rent + 10k Marketing)");
assert(calculateNetOperatingResult(transactions) === 70000, "Net Operating Result is 70,000");

// 6. Edit Expense: tx-exp-1 from 20,000 to 40,000 (Simulating ID-based immutable edit)
transactions = transactions.map((t) => (t.id === "tx-exp-1" ? { ...t, amount: 40000 } : t));
assert(calculateTotalExpenses(transactions) === 50000, "Edit Expense 20k -> 40k: Total Expense is 50,000 (NO double counting to 70k)");
assert(calculateNetOperatingResult(transactions) === 50000, "Net Operating Result is 50,000");

// 7. Delete 40,000 Expense (tx-exp-1)
transactions = transactions.filter((t) => t.id !== "tx-exp-1");
assert(calculateTotalExpenses(transactions) === 10000, "Delete 40k Expense -> Total Expense returns to 10,000");
assert(calculateNetOperatingResult(transactions) === 90000, "Net Operating Result recalculates to 90,000");

// 8. Edit Income: tx-inc-1 from 100,000 to 150,000
transactions = transactions.map((t) => (t.id === "tx-inc-1" ? { ...t, amount: 150000 } : t));
assert(calculateTotalIncome(transactions) === 150000, "Edit Income 100k -> 150k: Total Income is 150,000 (NO double counting to 250k)");
assert(calculateNetOperatingResult(transactions) === 140000, "Net Operating Result is 140,000 (150k - 10k)");

// 9. Delete Income (tx-inc-1)
transactions = transactions.filter((t) => t.id !== "tx-inc-1");
assert(calculateTotalIncome(transactions) === 0, "Delete Income -> Total Income is 0");
assert(calculateNetOperatingResult(transactions) === -10000, "Net Operating Result is -10,000 (Deficit)");

// 10. Edit Budget: b-mkt-1 from 50,000 to 75,000
budgets = budgets.map((b) => (b.id === "b-mkt-1" ? { ...b, allocated: 75000 } : b));
assert(calculateBudgetAllocation(budgets) === 75000, "Edit Budget 50k -> 75k: Budget Allocation is 75,000");
assert(calculateTotalIncome(transactions) === 0, "Edit Budget -> Income remains 0");
assert(calculateNetOperatingResult(transactions) === -10000, "Edit Budget -> Net Result remains -10,000");
const updatedUtil = calculateBudgetUtilization(mktBudgetSpent, 75000);
assert(Math.round(updatedUtil.rawUtilizationPct * 10) / 10 === 13.3, "Budget Utilization adjusted to 13.3% (10k / 75k)");

// 11. Delete Budget (b-mkt-1)
budgets = budgets.filter((b) => b.id !== "b-mkt-1");
assert(calculateBudgetAllocation(budgets) === 0, "Delete Budget -> Budget Allocation is 0");
assert(calculateTotalExpenses(transactions) === 10000, "Delete Budget -> Historical expenses (10k) PRESERVED");

// 12. Strict Category Budget Accuracy Test
const catBudget: Budget = {
  id: "b-mkt-2",
  category: "Marketing",
  department: "All",
  allocated: 100000,
};
const mixedTxs: Transaction[] = [
  { id: "t-mkt", type: "expense", category: "Marketing", amount: 20000, date: "2026-08-01", department: "Growth" },
  { id: "t-trv", type: "expense", category: "Travel", amount: 30000, date: "2026-08-01", department: "Growth" },
];
const mktCategorySpent = calculateBudgetSpentForCategory(catBudget, mixedTxs);
assert(mktCategorySpent === 20000, "Marketing Expense 20k against 100k Budget -> Spent is 20,000");
const mktCategoryUtil = calculateBudgetUtilization(mktCategorySpent, catBudget.allocated);
assert(mktCategoryUtil.rawUtilizationPct === 20, "Marketing Budget Utilization is exactly 20% (NOT 50%)");

console.log("\n=======================================================");
console.log("ALL 12 PRODUCTION FINANCIAL ENGINE TESTS PASSED 100% ✅");
console.log("=======================================================\n");
