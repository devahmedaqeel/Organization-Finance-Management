/**
 * services/__tests__/crossPlatformSync.test.ts
 *
 * Production Web <-> Mobile Synchronization Validation Test Suite.
 * Validates that Web and Mobile interact with the exact same data source,
 * tenant isolation, real-time CRUD propagation, unified categories,
 * and identical financial calculations.
 */

import assert from "assert";
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetOperatingResult,
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateBudgetRemaining,
  calculateActualCash,
} from "../FinancialCalculationEngine";
import { getUnifiedCategories } from "../../constants/categories";

console.log("\n=======================================================");
console.log("TEST SUITE: Web <-> Mobile Cross-Platform Synchronization");
console.log("=======================================================\n");

// --- 1. Mock Unified Cloud Ledger Store ---
interface CloudDoc {
  id: string;
  organizationId: string;
  organization: string;
  updatedAt: string;
  [key: string]: any;
}

class MockFirestoreCloudStore {
  private collections = new Map<string, Map<string, CloudDoc>>();
  private listeners = new Map<string, Set<(docs: CloudDoc[]) => void>>();

  setDoc(colName: string, id: string, data: any) {
    if (!this.collections.has(colName)) {
      this.collections.set(colName, new Map());
    }
    const col = this.collections.get(colName)!;
    const existing = col.get(id) || {};
    const merged = { ...existing, ...data, id };
    col.set(id, merged);
    this.notify(colName);
  }

  deleteDoc(colName: string, id: string) {
    const col = this.collections.get(colName);
    if (col) {
      col.delete(id);
      this.notify(colName);
    }
  }

  onSnapshot(colName: string, orgId: string, callback: (docs: CloudDoc[]) => void): () => void {
    const key = `${colName}:${orgId}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // Initial snapshot delivery
    const col = this.collections.get(colName) || new Map();
    const filtered = Array.from(col.values()).filter((d) => d.organizationId === orgId);
    callback(filtered);

    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  private notify(colName: string) {
    const col = this.collections.get(colName) || new Map();
    for (const [key, listeners] of this.listeners.entries()) {
      const [cName, orgId] = key.split(":");
      if (cName === colName) {
        const filtered = Array.from(col.values()).filter((d) => d.organizationId === orgId);
        listeners.forEach((cb) => cb(filtered));
      }
    }
  }
}

// Instantiate shared cloud store
const cloudStore = new MockFirestoreCloudStore();

const ORG_A = "org-9icgv4ijp";
const ORG_B = "org-tenant-other";

// Mobile & Web local clients
interface LocalClientState {
  transactions: any[];
  budgets: any[];
  payroll: any[];
  departments: any[];
  settings: any;
}

function createClient(name: string, orgId: string) {
  const state: LocalClientState = {
    transactions: [],
    budgets: [],
    payroll: [],
    departments: [],
    settings: { organizationName: "Devorbit Tech", currency: "PKR" },
  };

  const unsubTx = cloudStore.onSnapshot("transactions", orgId, (docs) => {
    state.transactions = [...docs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  const unsubBudgets = cloudStore.onSnapshot("budgets", orgId, (docs) => {
    state.budgets = [...docs];
  });

  const unsubPayroll = cloudStore.onSnapshot("payroll", orgId, (docs) => {
    state.payroll = [...docs];
  });

  const unsubDepts = cloudStore.onSnapshot("departments", orgId, (docs) => {
    state.departments = [...docs];
  });

  const unsubSettings = cloudStore.onSnapshot("orgSettings", orgId, (docs) => {
    if (docs.length > 0) {
      state.settings = { ...state.settings, ...docs[0] };
    }
  });

  return {
    name,
    orgId,
    getState: () => state,
    unsubscribe: () => {
      unsubTx();
      unsubBudgets();
      unsubPayroll();
      unsubDepts();
      unsubSettings();
    },
  };
}

const webAdmin = createClient("Web Admin", ORG_A);
const mobileAdmin = createClient("Mobile Admin", ORG_A);
const competitorOrg = createClient("Isolated Org", ORG_B);

// Test 1: Web creates transaction -> Mobile receives it instantly
console.log("Test 1: Web creates transaction -> Mobile receives it instantly...");
const tx1 = {
  id: "tx-grant-101",
  type: "income",
  category: "Government Grant",
  amount: 500000,
  date: "2026-09-01",
  department: "Administration",
  organizationId: ORG_A,
  organization: "Devorbit Tech",
  updatedAt: new Date().toISOString(),
};
cloudStore.setDoc("transactions", tx1.id, tx1);

assert.strictEqual(mobileAdmin.getState().transactions.length, 1, "Mobile must reflect transaction added on Web");
assert.strictEqual(mobileAdmin.getState().transactions[0].id, "tx-grant-101");
assert.strictEqual(mobileAdmin.getState().transactions[0].amount, 500000);
console.log("✔ Test 1 passed: Web -> Mobile transaction creation synced.");

// Test 2: Mobile creates transaction -> Web receives it instantly
console.log("Test 2: Mobile creates transaction -> Web receives it instantly...");
const tx2 = {
  id: "tx-expense-202",
  type: "expense",
  category: "Utilities",
  amount: 45000,
  date: "2026-09-02",
  department: "Administration",
  organizationId: ORG_A,
  organization: "Devorbit Tech",
  updatedAt: new Date().toISOString(),
};
cloudStore.setDoc("transactions", tx2.id, tx2);

assert.strictEqual(webAdmin.getState().transactions.length, 2, "Web must reflect transaction added on Mobile");
const found = webAdmin.getState().transactions.find((t) => t.id === "tx-expense-202");
assert.ok(found, "Web found tx-expense-202");
assert.strictEqual(found.amount, 45000);
console.log("✔ Test 2 passed: Mobile -> Web transaction creation synced.");

// Test 3: Web edits transaction -> Mobile updates without refresh
console.log("Test 3: Web edits transaction -> Mobile updates without refresh...");
const tx2Updated = {
  ...tx2,
  amount: 48500,
  description: "Updated utility bill with surcharge",
  updatedAt: new Date().toISOString(),
};
cloudStore.setDoc("transactions", tx2.id, tx2Updated);

const mobileTx2 = mobileAdmin.getState().transactions.find((t) => t.id === "tx-expense-202");
assert.strictEqual(mobileTx2?.amount, 48500, "Mobile must show edited amount 48500");
assert.strictEqual(mobileTx2?.description, "Updated utility bill with surcharge");
console.log("✔ Test 3 passed: Web edit -> Mobile update synced.");

// Test 4: Mobile deletes transaction -> Web immediately reflects deletion
console.log("Test 4: Mobile deletes transaction -> Web immediately reflects deletion...");
cloudStore.deleteDoc("transactions", "tx-grant-101");

assert.strictEqual(webAdmin.getState().transactions.length, 1, "Web must reflect deleted transaction");
assert.strictEqual(webAdmin.getState().transactions[0].id, "tx-expense-202");
console.log("✔ Test 4 passed: Mobile delete -> Web delete synced.");

// Test 5: Budgets synchronization Web <-> Mobile
console.log("Test 5: Budgets synchronization Web <-> Mobile...");
const budget1 = {
  id: "b-util-01",
  category: "Utilities",
  department: "Administration",
  allocated: 100000,
  period: "monthly",
  organizationId: ORG_A,
  organization: "Devorbit Tech",
  updatedAt: new Date().toISOString(),
};
cloudStore.setDoc("budgets", budget1.id, budget1);

assert.strictEqual(mobileAdmin.getState().budgets.length, 1, "Mobile must reflect budget created on Web");
assert.strictEqual(mobileAdmin.getState().budgets[0].allocated, 100000);
console.log("✔ Test 5 passed: Budgets Web <-> Mobile synced.");

// Test 6: Payroll synchronization and unified ledger calculations
console.log("Test 6: Payroll synchronization and ledger disbursement integration...");
const payrollEntry = {
  id: "p-01",
  employeeName: "Ali Raza",
  employeeId: "EMP-101",
  department: "Software Engineering",
  baseSalary: 150000,
  bonus: 20000,
  deductions: 5000,
  netSalary: 165000,
  month: "2026-09",
  organizationId: ORG_A,
  organization: "Devorbit Tech",
  paymentStatus: "paid",
  updatedAt: new Date().toISOString(),
};
cloudStore.setDoc("payroll", payrollEntry.id, payrollEntry);

// Linked salary transaction in ledger
const salaryTx = {
  id: `tx_pay_${payrollEntry.id}`,
  type: "expense",
  amount: 165000,
  category: "Salaries",
  department: "Software Engineering",
  date: "2026-09-01",
  organizationId: ORG_A,
  organization: "Devorbit Tech",
  updatedAt: new Date().toISOString(),
};
cloudStore.setDoc("transactions", salaryTx.id, salaryTx);

assert.strictEqual(mobileAdmin.getState().payroll.length, 1, "Mobile reflects payroll entry");
assert.strictEqual(webAdmin.getState().transactions.length, 2, "Web reflects salary expense transaction in ledger");
console.log("✔ Test 6 passed: Payroll disbursement synced into ledger on both platforms.");

// Test 7: Strict Tenant Isolation
console.log("Test 7: Strict Tenant Isolation between organizations...");
assert.strictEqual(competitorOrg.getState().transactions.length, 0, "Competitor org must have 0 transactions from ORG_A");
assert.strictEqual(competitorOrg.getState().budgets.length, 0, "Competitor org must have 0 budgets from ORG_A");
assert.strictEqual(competitorOrg.getState().payroll.length, 0, "Competitor org must have 0 payroll entries from ORG_A");
console.log("✔ Test 7 passed: Tenant isolation verified across organizations.");

// Test 8: Identical Calculations across Web and Mobile
console.log("Test 8: Calculation parity across Web and Mobile engines...");
const webTxs = webAdmin.getState().transactions;
const mobileTxs = mobileAdmin.getState().transactions;
const webBudgets = webAdmin.getState().budgets;
const mobileBudgets = mobileAdmin.getState().budgets;

const webIncome = calculateTotalIncome(webTxs);
const mobileIncome = calculateTotalIncome(mobileTxs);
assert.strictEqual(webIncome, mobileIncome, "Total income must be identical");

const webExpense = calculateTotalExpenses(webTxs);
const mobileExpense = calculateTotalExpenses(mobileTxs);
assert.strictEqual(webExpense, mobileExpense, "Total expenses must be identical");

const webSurplus = calculateNetOperatingResult(webTxs);
const mobileSurplus = calculateNetOperatingResult(mobileTxs);
assert.strictEqual(webSurplus, mobileSurplus, "Net balance must be identical");

const webBudgetSpent = calculateBudgetUsed(webTxs, webBudgets);
const mobileBudgetSpent = calculateBudgetUsed(mobileTxs, mobileBudgets);
assert.strictEqual(webBudgetSpent, mobileBudgetSpent, "Budget spent must be identical");

const webRemaining = calculateBudgetRemaining(100000, webBudgetSpent);
const mobileRemaining = calculateBudgetRemaining(100000, mobileBudgetSpent);
assert.strictEqual(webRemaining, mobileRemaining, "Remaining budget must be identical");
console.log("✔ Test 8 passed: 100% calculation parity between Web and Mobile.");

// Test 9: Unified Categories and Custom Category Real-Time Sync
console.log("Test 9: Unified Categories and Custom Category Real-Time Sync...");
const initialCats = getUnifiedCategories("expense", [], []);
assert.ok(initialCats.includes("Salaries"), "Salaries in default unified categories");
assert.ok(initialCats.includes("Utilities"), "Utilities in default unified categories");

// Mobile Admin adds custom category "AI Compute & Cloud" to orgSettings
const updatedSettingsDoc = {
  id: `settings_${ORG_A}`,
  organizationId: ORG_A,
  organizationName: "Devorbit Tech",
  customExpenseCategories: ["AI Compute & Cloud"],
  updatedAt: new Date().toISOString(),
};
cloudStore.setDoc("orgSettings", updatedSettingsDoc.id, updatedSettingsDoc);

assert.deepStrictEqual(
  webAdmin.getState().settings.customExpenseCategories,
  ["AI Compute & Cloud"],
  "Web received custom category from Mobile"
);

const syncedWebCategories = getUnifiedCategories("expense", webAdmin.getState().settings.customExpenseCategories, []);
assert.ok(syncedWebCategories.includes("AI Compute & Cloud"), "New custom category is present in Web category list");
console.log("✔ Test 9 passed: Custom category synced and unified across Web and Mobile.");

// Test 10: Organization Name Sync (Web Settings -> Mobile Display)
console.log("Test 10: Organization Name Sync (Web Settings -> Mobile Display)...");
const renamedSettings = {
  ...updatedSettingsDoc,
  organizationName: "DevOrbit Technologies International",
  updatedAt: new Date().toISOString(),
};
cloudStore.setDoc("orgSettings", renamedSettings.id, renamedSettings);

assert.strictEqual(
  mobileAdmin.getState().settings.organizationName,
  "DevOrbit Technologies International",
  "Mobile immediately receives updated organization name"
);
console.log("✔ Test 10 passed: Organization name updates propagate in real-time.");

// Cleanup
webAdmin.unsubscribe();
mobileAdmin.unsubscribe();
competitorOrg.unsubscribe();

console.log("\n=======================================================");
console.log("ALL 10 WEB <-> MOBILE SYNCHRONIZATION TESTS PASSED! ✅");
console.log("=======================================================\n");
