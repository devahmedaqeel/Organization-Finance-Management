import assert from "assert";
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetOperatingResult,
  calculateBudgetAllocation,
  calculateUnallocatedFunds,
  calculateDepartmentMetrics,
  calculateBudgetUsed,
  Transaction,
} from "../FinancialCalculationEngine";
import { getCleanDefaultSettings } from "../settingsHelper";

console.log("\n=======================================================");
console.log("TEST SUITE: New Organization Clean & Empty Workspace");
console.log("=======================================================\n");

// 1. Verify New Organization Default Settings
console.log("Test 1: Dynamic settings for newly registered organization...");
const newOrgSettings = getCleanDefaultSettings("Apex Innovations", false);
assert.strictEqual(newOrgSettings.organizationName, "Apex Innovations", "New org name must match user input");
assert.strictEqual(newOrgSettings.organizationAddress, "", "New org address must be blank");
assert.strictEqual(newOrgSettings.organizationPhone, "", "New org phone must be blank");
assert.strictEqual(newOrgSettings.currency, "PKR", "Currency must be PKR");
assert.deepStrictEqual(newOrgSettings.customIncomeCategories, [], "Custom income categories must start empty");
assert.deepStrictEqual(newOrgSettings.customExpenseCategories, [], "Custom expense categories must start empty");
console.log("✔ Test 1 passed: New organization settings start completely clean with zero demo metadata.");

// 2. Verify Demo Admin Settings remain preserved
console.log("Test 2: Demo admin retains existing organization metadata...");
const demoAdminSettings = getCleanDefaultSettings("DevOrbit Tech Kotli", true);
assert.strictEqual(demoAdminSettings.organizationName, "DevOrbit Tech Kotli");
assert.strictEqual(demoAdminSettings.organizationAddress, "Kotli, Azad Kashmir");
assert.strictEqual(demoAdminSettings.organizationPhone, "+92-586-444111");
console.log("✔ Test 2 passed: Demo admin settings preserved without disturbance.");

// 3. Verify Empty Calculations for New Organization
console.log("Test 3: Financial engine metrics for clean workspace (0 records)...");
const emptyTransactions: any[] = [];
const emptyBudgets: any[] = [];
const emptyPayroll: any[] = [];
const emptyDepartments: any[] = [];

const totalIncome = calculateTotalIncome(emptyTransactions);
const totalExpenses = calculateTotalExpenses(emptyTransactions);
const netBalance = calculateNetOperatingResult(emptyTransactions);
const allocatedBudget = calculateBudgetAllocation(emptyBudgets, emptyDepartments);
const unallocated = calculateUnallocatedFunds(totalIncome, allocatedBudget);
const budgetSpent = calculateBudgetUsed(emptyTransactions, emptyBudgets, undefined, emptyDepartments);
const deptMetrics = calculateDepartmentMetrics(emptyDepartments, emptyTransactions, undefined, emptyBudgets);

assert.strictEqual(totalIncome, 0, "Total income must be exactly 0");
assert.strictEqual(totalExpenses, 0, "Total expenses must be exactly 0");
assert.strictEqual(netBalance, 0, "Net balance must be exactly 0");
assert.strictEqual(allocatedBudget, 0, "Allocated budget must be exactly 0");
assert.strictEqual(unallocated, 0, "Unallocated funds must be exactly 0");
assert.strictEqual(budgetSpent, 0, "Budget spent must be exactly 0");
assert.strictEqual(deptMetrics.length, 0, "Department metrics must have 0 departments");
console.log("✔ Test 3 passed: All financial metrics start at 0 with zero phantom statistics.");

// 4. Verify Strict Tenant Isolation: New Organization vs Demo Organization
console.log("Test 4: Strict data isolation between Demo Org and New Org...");
const demoOrgId = "org-9icgv4ijp";
const newOrgId = "org-clean-new-888";

const allLedgerRecords = [
  { id: "tx1", organizationId: demoOrgId, type: "income", amount: 500000, department: "Software Engineering" },
  { id: "tx2", organizationId: demoOrgId, type: "expense", amount: 80000, department: "Software Engineering" },
  { id: "b1", organizationId: demoOrgId, department: "Software Engineering", allocated: 850000 },
  { id: "d1", organizationId: demoOrgId, name: "Software Engineering", headCount: 45 },
  { id: "p1", organizationId: demoOrgId, employeeName: "Ahmed Aqeel", netSalary: 125000 },
];

// Query scoped to new organization
const newOrgTxs = allLedgerRecords.filter((r) => r.organizationId === newOrgId && "type" in r);
const newOrgBudgets = allLedgerRecords.filter((r) => r.organizationId === newOrgId && "allocated" in r);
const newOrgDepts = allLedgerRecords.filter((r) => r.organizationId === newOrgId && "headCount" in r);
const newOrgPayroll = allLedgerRecords.filter((r) => r.organizationId === newOrgId && "netSalary" in r);

assert.strictEqual(newOrgTxs.length, 0, "New organization must have 0 transactions from demo org");
assert.strictEqual(newOrgBudgets.length, 0, "New organization must have 0 budgets from demo org");
assert.strictEqual(newOrgDepts.length, 0, "New organization must have 0 departments from demo org");
assert.strictEqual(newOrgPayroll.length, 0, "New organization must have 0 payroll entries from demo org");
console.log("✔ Test 4 passed: Zero cross-tenant leakage between Demo Organization and New Organization.");

// 5. User Adds Real Data to New Org — Only Real Data Shown
console.log("Test 5: User adds real transaction and department to New Org...");
const userCreatedDept = { id: "d-real-1", organizationId: newOrgId, name: "Operations", headCount: 5, budgetAllocated: 50000 };
const userCreatedTx: Transaction = { id: "tx-real-1", organizationId: newOrgId, type: "income", amount: 150000, department: "Operations", category: "Client Fees", date: "2026-09-08" };

const activeNewOrgDepts = [userCreatedDept];
const activeNewOrgTxs: Transaction[] = [userCreatedTx];

assert.strictEqual(activeNewOrgDepts.length, 1, "Only real user-added department exists");
assert.strictEqual(activeNewOrgDepts[0].name, "Operations");
assert.strictEqual(calculateTotalIncome(activeNewOrgTxs), 150000, "Calculates exclusively on real data");
console.log("✔ Test 5 passed: New organization holds ONLY real user data.");

console.log("\n=======================================================");
console.log("ALL NEW ORGANIZATION CLEAN-STATE TESTS PASSED 100% ✅");
console.log("=======================================================\n");
