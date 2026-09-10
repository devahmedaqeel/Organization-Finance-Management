/**
 * services/FinancialCalculationEngine.ts
 *
 * Single Authoritative Source of Truth for all Financial Analytics in OFM.
 * Implements strict mathematical validation, date-range filtering, and standardized KPI models
 * across both Web and Mobile platforms.
 *
 * CRITICAL ACCOUNTING PRINCIPLES:
 * 1. A BUDGET IS A PLANNING METRIC, NOT CASH.
 * 2. INCOME = Real Inflows only.
 * 3. EXPENSE = Real Outflows only.
 * 4. NET OPERATING RESULT = Total Income - Total Expenses.
 * 5. BUDGET ALLOCATION = Sum of planned limits.
 * 6. BUDGET UTILIZATION = (Matching Budget-Linked Outflows / Budget Limit) * 100.
 * 7. NEVER ADD BUDGET ALLOCATION TO ACTUAL CASH / REVENUE.
 */

import { NormalizedPeriod } from "./DatePeriodService";

export interface Transaction {
  id: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  date: string;
  department: string;
  title?: string;
  description?: string;
  status?: "completed" | "pending" | "failed" | "reconciled" | string;
  paymentMethod?: string;
  organizationId?: string;
  addedBy?: string;
  createdAt?: string;
  budgetId?: string | null;
  expenseSource?: "manual" | "payroll" | "reimbursement" | "invoice" | string;
  payrollId?: string;
  employeeId?: string;
  employeeName?: string;
  referenceNumber?: string;
}

export interface Budget {
  id: string;
  category: string;
  department: string;
  allocated: number;
  spent?: number;
  period?: string;
  fiscalYear?: string;
  alertThreshold?: number;
}

export interface Department {
  id: string;
  name: string;
  headCount?: number;
  budgetAllocated?: number;
  categories?: string[];
}

export interface PayrollEntry {
  id: string;
  employeeName: string;
  employeeId: string;
  department: string;
  baseSalary: number;
  bonus?: number;
  deductions?: number;
  netSalary?: number;
  month: string;
  paymentStatus?: "paid" | "pending" | "processing";
}

// --- Color Palette for Expense Visualization ---
export const ANALYTICS_PALETTE = [
  "#F43F5E", // Rose / Red
  "#3B82F6", // Blue
  "#10B981", // Emerald Green
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
  "#EC4899", // Pink
  "#6366F1", // Indigo
  "#64748B", // Slate (Other)
];

// ============================================================================
// 1. DATA MODELS & TYPES
// ============================================================================

export type BudgetStatus = "on_track" | "watch" | "near_limit" | "over_budget" | "no_budget";

export interface ValidatedBudgetAnalytics {
  totalAllocated: number;
  actualSpending: number;
  utilizationPct: number | null; // null if no budget limit configured
  rawUtilizationPct: number; // e.g. 125.4
  displayPct: string; // e.g. "125.4%" or "0%" or "N/A"
  clampedRingPct: number; // 0..100 clamped for valid circular visualization
  remainingAmount: number; // Positive if budget left, 0 if equal/negative
  excessAmount: number; // Positive if over budget, 0 if within budget
  status: BudgetStatus;
  statusLabel: "On Track" | "Watch" | "Near Limit" | "Over Budget" | "No Budget Configured";
  statusColor: string;
  remainingText: string;
  isOverBudget: boolean;
  isValid: boolean;
  explanation: string;
}

export type NomStatus = "healthy" | "watch" | "critical" | "no_revenue";

export interface ValidatedOperatingMarginAnalytics {
  operatingRevenue: number;
  operatingExpenses: number;
  operatingIncome: number; // Revenue - Expenses
  operatingMarginPct: number | null; // null if Revenue <= 0
  rawMarginPct: number;
  displayMargin: string;
  expenseRatioPct: number; // (Expenses / Revenue) * 100
  displayExpenseRatio: string;
  status: NomStatus;
  statusLabel: "Healthy Surplus" | "Operating Margin Watch" | "Operating Loss" | "No Operating Revenue";
  statusColor: string;
  isLoss: boolean;
  hasRevenue: boolean;
  explanationText: string;
  previousPeriodRevenue?: number;
  previousPeriodExpenses?: number;
  previousPeriodIncome?: number;
  previousPeriodMarginPct?: number | null;
  marginChangeVsPrevious?: number | null;
  trendDirection?: "up" | "down" | "flat" | "new" | "na";
}

export interface ValidatedExpenseCategoryItem {
  category: string;
  amount: number;
  pct: number;
  displayPct: string;
  count: number;
  color: string;
  previousPeriodAmount?: number;
  changePctVsPrevious?: number | null;
}

export interface ValidatedExpenseDistributionAnalytics {
  totalExpenses: number;
  categories: ValidatedExpenseCategoryItem[];
  chartSegments: ValidatedExpenseCategoryItem[];
  topCategory?: ValidatedExpenseCategoryItem;
  sumPercentages: number;
  hasExpenses: boolean;
  explanation: string;
}

export interface CompleteFinancialAnalyticsModel {
  period: NormalizedPeriod;
  budget: ValidatedBudgetAnalytics;
  margin: ValidatedOperatingMarginAnalytics;
  distribution: ValidatedExpenseDistributionAnalytics;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  transactionCount: number;
  totalAllocatedBudget?: number;
  unallocatedFunds?: number;
  departmentMetrics?: DepartmentMetric[];
}

// ============================================================================
// 2. FINANCIAL VALIDATION HELPERS
// ============================================================================

export function safeNumber(val: any, fallback: number = 0): number {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
    return fallback;
  }
  return Number(val);
}

export function formatCurrencySafe(amount: number, currency: string = "PKR"): string {
  const n = safeNumber(amount, 0);
  const formatted = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "-" : ""}${currency} ${formatted}`;
}

export function formatCompactCurrency(amount: number, currency: string = "PKR"): string {
  const n = safeNumber(amount, 0);
  const abs = Math.abs(n);
  const prefix = n < 0 ? "-" : "";
  return `${prefix}${currency} ${abs.toLocaleString()}`;
}

/**
 * Filter transactions by normalized date period.
 */
export function filterTransactionsByPeriod(
  transactions: Transaction[],
  period?: NormalizedPeriod
): Transaction[] {
  if (!transactions || transactions.length === 0) return [];
  if (!period || !period.startDate || !period.endDate) return transactions;
  const { startDate, endDate } = period;

  return transactions.filter((t) => {
    if (!t || !t.date) return false;
    const txDate = t.date.slice(0, 10);
    return txDate >= startDate && txDate <= endDate;
  });
}

// ============================================================================
// 3. AUTHORITATIVE METRIC CALCULATORS (SINGLE SOURCE OF TRUTH)
// ============================================================================

/**
 * 1. TOTAL INCOME: Strictly sums qualified income transactions.
 */
export function calculateTotalIncome(
  transactions: Transaction[],
  period?: NormalizedPeriod
): number {
  const txs = filterTransactionsByPeriod(transactions, period);
  return txs
    .filter((t) => t.type === "income" && safeNumber(t.amount, 0) > 0 && t.status !== "failed")
    .reduce((sum, t) => sum + safeNumber(t.amount, 0), 0);
}

/**
 * 2. TOTAL EXPENSES: Strictly sums qualified expense transactions.
 */
export function calculateTotalExpenses(
  transactions: Transaction[],
  period?: NormalizedPeriod
): number {
  const txs = filterTransactionsByPeriod(transactions, period);
  return txs
    .filter((t) => t.type === "expense" && safeNumber(t.amount, 0) > 0 && t.status !== "failed")
    .reduce((sum, t) => sum + safeNumber(t.amount, 0), 0);
}

/**
 * 3. NET OPERATING RESULT: Total Income - Total Expenses.
 */
export function calculateNetOperatingResult(
  transactions: Transaction[],
  period?: NormalizedPeriod
): number {
  const inc = calculateTotalIncome(transactions, period);
  const exp = calculateTotalExpenses(transactions, period);
  return inc - exp;
}

/**
 * 4. ACTUAL CASH / LIQUIDITY: Realized cash balance (Inflows - Outflows + Starting Balance).
 * NOTE: Budgets are NEVER added to this number.
 */
export function calculateActualCash(
  transactions: Transaction[],
  startingBalance: number = 0,
  period?: NormalizedPeriod
): number {
  return startingBalance + calculateNetOperatingResult(transactions, period);
}

/**
 * 4b. UNALLOCATED FUNDS / TOTAL AVAILABLE FUNDS:
 * The unallocated portion of institutional income available for department budget allocation.
 * Formula: Math.max(0, Total Income - Total Allocated Department Budget).
 * CRITICAL RULE: NEVER ADD BUDGET TO INCOME (£10k Income + £4k Budget != £14k).
 */
export function calculateTotalAvailableFunds(
  totalIncome: number,
  totalAllocatedBudget: number = 0,
  _totalExpenses?: number
): number {
  const inc = safeNumber(totalIncome, 0);
  const bud = safeNumber(totalAllocatedBudget, 0);
  return Math.max(0, inc - bud);
}

export function calculateUnallocatedFunds(
  totalIncome: number,
  totalAllocatedBudget: number
): number {
  return calculateTotalAvailableFunds(totalIncome, totalAllocatedBudget);
}

/**
 * Helper to determine if a budget's category designation represents an all-category / department-wide pool.
 */
export function isAllCategoryBudget(category?: string | null): boolean {
  if (!category) return true;
  const c = category.trim().toLowerCase();
  return (
    c === "" ||
    c === "all" ||
    c === "all categories" ||
    c === "all categories (department pool)" ||
    c.includes("all categories") ||
    c === "department pool" ||
    c.includes("department pool") ||
    c === "general" ||
    c === "general operations"
  );
}

/**
 * Check if an expense transaction is specifically linked to an active budget.
 * Explicit budgetId takes precedence; if unspecified (legacy), matches active budget by category.
 * Explicitly unbudgeted transactions ("none", "unbudgeted") are never linked.
 */
export function isExpenseBudgetLinked(
  t: Transaction,
  budgets: Budget[]
): boolean {
  if (!t || t.type !== "expense") return false;
  if (!budgets || budgets.length === 0) return false;

  // 1. Explicit budgetId specified
  if (t.budgetId !== undefined && t.budgetId !== null) {
    const bId = t.budgetId.trim();
    if (bId === "" || bId === "none" || bId === "unbudgeted") {
      return false;
    }
    return budgets.some((b) => b && b.id === bId);
  }

  // 2. Unspecified / legacy fallback: match active budget by category & department
  const tCat = (t.category || "").trim().toLowerCase();
  const tDept = (t.department || "").trim().toLowerCase();
  if (!tCat) return false;

  return budgets.some((b) => {
    if (!b) return false;
    const bDept = (b.department || "").trim().toLowerCase();
    const bCat = (b.category || "").trim().toLowerCase();
    const deptMatch = !bDept || bDept === "all" || !tDept || tDept === "all" || tDept === bDept;
    const isAllCat = isAllCategoryBudget(b.category);
    const catMatch = isAllCat || (bCat.length > 0 && tCat === bCat);
    return deptMatch && catMatch;
  });
}

/**
 * 4.5 EFFECTIVE DEPARTMENT BUDGET ALLOCATION:
 * Computes authoritative department budget allocation by checking both:
 * 1. The department document's direct budgetAllocated ceiling (`departments` collection)
 * 2. Sum of allocated line-item budgets for this department in `budgets` collection (from "Department Budget Allocations" tab)
 * Takes the maximum ceiling to guarantee that whether an Admin sets a budget in "Departments" or
 * in "Department Budget Allocations", the system accurately recognizes the budget without false "NO BUDGET ALLOCATED" errors.
 */
export function calculateEffectiveDepartmentBudget(
  departmentName: string,
  departments?: Department[] | null,
  budgets?: Budget[] | null
): {
  allocated: number;
  matchedDept: Department | undefined;
  deptAllocated: number;
  budgetsAllocated: number;
} {
  const cleanName = (departmentName || "").trim().toLowerCase();
  if (!cleanName) {
    return { allocated: 0, matchedDept: undefined, deptAllocated: 0, budgetsAllocated: 0 };
  }

  const matchedDept = (departments || []).find(
    (d) => (d.name || "").trim().toLowerCase() === cleanName
  );
  const deptAllocated = safeNumber(matchedDept?.budgetAllocated, 0);

  const budgetsAllocated = (budgets || [])
    .filter((b) => (b.department || "").trim().toLowerCase() === cleanName)
    .reduce((sum, b) => sum + safeNumber(b.allocated, 0), 0);

  const allocated = Math.max(deptAllocated, budgetsAllocated);

  return { allocated, matchedDept, deptAllocated, budgetsAllocated };
}

/**
 * 5. BUDGET ALLOCATION: Total planned limits across department budgets or line items.
 * If both departments and budgets exist, computes the unified non-duplicated allocation per department
 * (taking the effective maximum ceiling for each department).
 * Deduplicates by ID/Department to guarantee zero double-counting.
 */
export function calculateBudgetAllocation(
  budgets?: Budget[] | null,
  departments?: Department[]
): number {
  if (budgets && (!departments || departments.length === 0)) {
    const seenBudgetIds = new Set<string>();
    return budgets.reduce((s, b) => {
      if (!b || !b.id || seenBudgetIds.has(b.id)) return s;
      seenBudgetIds.add(b.id);
      return s + safeNumber(b.allocated, 0);
    }, 0);
  }

  if (departments && (!budgets || budgets.length === 0)) {
    const seenDeptIds = new Set<string>();
    return departments.reduce((s, d) => {
      if (!d || !d.id || seenDeptIds.has(d.id)) return s;
      seenDeptIds.add(d.id);
      return s + safeNumber(d.budgetAllocated, 0);
    }, 0);
  }

  if (departments && departments.length > 0 && budgets && budgets.length > 0) {
    const seenDepts = new Set<string>();
    let total = 0;
    departments.forEach((d) => {
      const dName = (d.name || "").trim().toLowerCase();
      seenDepts.add(dName);
      const bAlloc = budgets
        .filter((b) => (b.department || "").trim().toLowerCase() === dName)
        .reduce((s, b) => s + safeNumber(b.allocated, 0), 0);
      total += Math.max(safeNumber(d.budgetAllocated, 0), bAlloc);
    });

    budgets.forEach((b) => {
      const bDept = (b.department || "").trim().toLowerCase();
      if (bDept && !seenDepts.has(bDept)) {
        seenDepts.add(bDept);
        const bAlloc = budgets
          .filter((item) => (item.department || "").trim().toLowerCase() === bDept)
          .reduce((s, item) => s + safeNumber(item.allocated, 0), 0);
        total += bAlloc;
      }
    });

    return total;
  }

  return 0;
}

export interface BudgetNetCashValidation {
  isValid: boolean;
  netCash: number;
  currentTotalAllocated: number;
  unallocatedNetCash: number;
  maxAvailableToAllocate: number;
  errorMessage?: string;
}

export interface BudgetNetCashValidationOptions {
  type?: "budget" | "department";
  editingBudgetId?: string;
  editingDepartmentId?: string;
  targetDepartmentName?: string;
  currency?: string;
}

/**
 * Validates whether a proposed budget allocation or edit is permissible against Available Net Cash.
 * 
 * CORE RULES:
 * 1. Available Net Cash = Total Income - Total Expenses.
 * 2. If Available Net Cash <= 0:
 *    - All budget allocation is strictly rejected.
 *    - Message: "Cannot allocate department budget because Available Net Cash is PKR 0 (or in deficit). Please record income before allocating budgets."
 * 3. If Available Net Cash > 0:
 *    - We simulate the resulting organization-wide total budget allocation when applying this change.
 *    - If resultingTotalAllocation > Available Net Cash:
 *      - Rejected!
 *      - Message: "Requested budget (${currency} ${requestedAmount.toLocaleString()}) exceeds Available Net Cash (${currency} ${netCash.toLocaleString()})."
 *    - If resultingTotalAllocation <= Available Net Cash:
 *      - Approved! (isValid: true)
 */
export function validateBudgetAllocationAgainstNetCash(
  requestedAmount: number,
  transactions: Transaction[],
  budgets: Budget[] = [],
  departments: Department[] = [],
  options?: BudgetNetCashValidationOptions
): BudgetNetCashValidation {
  const currency = options?.currency || "PKR";
  const totalIncome = calculateTotalIncome(transactions);
  const totalExpenses = calculateTotalExpenses(transactions);
  const netCash = totalIncome - totalExpenses; // Available Net Cash

  const currentTotalAllocated = calculateBudgetAllocation(budgets, departments);

  // 1. If Net Cash is zero or negative, no department budget can be allocated
  if (netCash <= 0) {
    return {
      isValid: false,
      netCash,
      currentTotalAllocated,
      unallocatedNetCash: 0,
      maxAvailableToAllocate: 0,
      errorMessage: `Cannot allocate department budget because Available Net Cash is ${currency} ${netCash.toLocaleString()}. Please record income before allocating budgets.`,
    };
  }

  const allocType = options?.type || (options?.editingDepartmentId ? "department" : "budget");
  const editingBudgetId = options?.editingBudgetId;
  const editingDeptId = options?.editingDepartmentId;
  const targetDept = (options?.targetDepartmentName || "").trim();

  // Baseline items excluding the record currently being modified
  const otherBudgets = editingBudgetId
    ? (budgets || []).filter((b) => b && b.id !== editingBudgetId)
    : (budgets || []);

  const otherDepts = editingDeptId
    ? (departments || []).filter((d) => d && d.id !== editingDeptId)
    : (departments || []);

  const hypotheticalBudgets = [...otherBudgets];
  const hypotheticalDepartments = [...otherDepts];

  if (allocType === "department") {
    const existingDept = (departments || []).find((d) => d && d.id === editingDeptId);
    hypotheticalDepartments.push({
      id: editingDeptId || "temp_dept_id",
      name: targetDept || existingDept?.name || "Department",
      budgetAllocated: requestedAmount,
    });
  } else {
    const existingBudget = (budgets || []).find((b) => b && b.id === editingBudgetId);
    hypotheticalBudgets.push({
      id: editingBudgetId || "temp_budget_id",
      category: existingBudget?.category || "General",
      department: targetDept || existingBudget?.department || "General",
      allocated: requestedAmount,
    });
  }

  const resultingTotalAllocation = calculateBudgetAllocation(hypotheticalBudgets, hypotheticalDepartments);
  const baselineAllocation = calculateBudgetAllocation(otherBudgets, otherDepts);
  const unallocatedNetCash = Math.max(0, netCash - currentTotalAllocated);
  const maxAvailableToAllocate = Math.max(0, netCash - baselineAllocation);

  if (resultingTotalAllocation > netCash) {
    return {
      isValid: false,
      netCash,
      currentTotalAllocated,
      unallocatedNetCash,
      maxAvailableToAllocate,
      errorMessage: `Requested budget (${currency} ${requestedAmount.toLocaleString()}) exceeds Available Net Cash (${currency} ${netCash.toLocaleString()}). Maximum available to allocate is ${currency} ${maxAvailableToAllocate.toLocaleString()}.`,
    };
  }

  return {
    isValid: true,
    netCash,
    currentTotalAllocated,
    unallocatedNetCash,
    maxAvailableToAllocate,
  };
}

/**
 * 6. BUDGET-LINKED SPENDING FOR A SPECIFIC BUDGET RECORD:
 * Matches strictly expenses linked directly to this budget via budgetId,
 * or legacy transactions with matching category & department.
 */
export function calculateBudgetSpentForCategory(
  budget: Budget,
  transactions: Transaction[],
  period?: NormalizedPeriod
): number {
  if (!budget || !budget.id) return 0;
  const txs = filterTransactionsByPeriod(transactions, period);
  const seenTxIds = new Set<string>();

  const bDept = (budget.department || "").trim().toLowerCase();
  const bCat = (budget.category || "").trim().toLowerCase();

  return txs
    .filter((t) => {
      if (!t || t.type !== "expense" || safeNumber(t.amount, 0) <= 0) return false;
      if (t.status === "failed" || (t as any).status === "deleted" || (t as any).status === "void" || (t as any).status === "cancelled") return false;
      if (seenTxIds.has(t.id)) return false;

      // Explicit budgetId link
      if (t.budgetId !== undefined && t.budgetId !== null) {
        if (t.budgetId === budget.id) {
          seenTxIds.add(t.id);
          return true;
        }
        return false;
      }

      // Legacy fallback: category & department matching
      const tDept = (t.department || "").trim().toLowerCase();
      const tCat = (t.category || "").trim().toLowerCase();
      const deptMatch = !bDept || bDept === "all" || !tDept || tDept === "all" || tDept === bDept;
      const isAllCat = isAllCategoryBudget(budget.category);
      const catMatch =
        isAllCat ||
        (bCat.length > 0 &&
          (tCat === bCat ||
            (tCat === "salaries" && bCat === "payroll") ||
            (tCat === "payroll" && bCat === "salaries")));

      if (deptMatch && catMatch) {
        seenTxIds.add(t.id);
        return true;
      }
      return false;
    })
    .reduce((sum, t) => sum + safeNumber(t.amount, 0), 0);
}

/**
 * 7. TOTAL BUDGET USED: Sum of expenses under budgeted departments (or linked to active budgets).
 * All categories in a budgeted department draw from that department's budget.
 * Deduplicates by transaction ID to ensure no double-counting.
 */
export function calculateBudgetUsed(
  transactions: Transaction[],
  budgets?: Budget[] | null,
  period?: NormalizedPeriod,
  departments?: Department[]
): number {
  const txs = filterTransactionsByPeriod(transactions, period);
  const seenTxIds = new Set<string>();

  const budgetedDepts = new Set<string>();
  if (departments && departments.length > 0) {
    departments.forEach((d) => {
      if (d && d.name && safeNumber(d.budgetAllocated, 0) > 0) {
        budgetedDepts.add(d.name.trim().toLowerCase());
      }
    });
  }

  const validBudgetIds = new Set(
    (budgets || []).map((b) => b && b.id).filter(Boolean)
  );

  return txs
    .filter((t) => {
      if (!t || t.type !== "expense" || safeNumber(t.amount, 0) <= 0) return false;
      if (t.status === "failed" || (t as any).status === "deleted" || (t as any).status === "void" || (t as any).status === "cancelled") return false;
      if (seenTxIds.has(t.id)) return false;

      // 1. Department Budget Pool: Any expense belonging to a department with an allocated budget
      const tDept = (t.department || "").trim().toLowerCase();
      if (budgetedDepts.size > 0 && budgetedDepts.has(tDept)) {
        seenTxIds.add(t.id);
        return true;
      }

      // 2. Explicit budgetId set
      if (t.budgetId !== undefined && t.budgetId !== null) {
        const bId = t.budgetId.trim();
        if (bId !== "" && bId !== "none" && bId !== "unbudgeted" && validBudgetIds.has(bId)) {
          seenTxIds.add(t.id);
          return true;
        }
        return false;
      }

      // 3. Legacy / unspecified budgetId: check if any budget matches category & dept
      if (budgets && budgets.length > 0) {
        const tCat = (t.category || "").trim().toLowerCase();
        if (tCat) {
          const matchesAnyBudget = budgets.some((b) => {
            if (!b) return false;
            const bDept = (b.department || "").trim().toLowerCase();
            const bCat = (b.category || "").trim().toLowerCase();
            const deptMatch = !bDept || bDept === "all" || !tDept || tDept === "all" || tDept === bDept;
            const isAllCat = isAllCategoryBudget(b.category);
            const catMatch =
              isAllCat ||
              (bCat.length > 0 &&
                (tCat === bCat ||
                  (tCat === "salaries" && bCat === "payroll") ||
                  (tCat === "payroll" && bCat === "salaries")));
            return deptMatch && catMatch;
          });

          if (matchesAnyBudget) {
            seenTxIds.add(t.id);
            return true;
          }
        }
      }

      return false;
    })
    .reduce((sum, t) => sum + safeNumber(t.amount, 0), 0);
}

export interface CategorySpendItem {
  category: string;
  amount: number;
  pct: number;
}

export interface DepartmentMetric {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  remaining: number;
  utilizationPct: number;
  status: "healthy" | "warning" | "over" | "no_budget";
  categories: CategorySpendItem[];
  payrollSpending: number;
  otherSpending: number;
}

/**
 * Authoritative Department Metrics:
 * Calculates exact budget allocated, spent, remaining, utilization %, and category breakdown
 * for every department.
 */
export function calculateDepartmentMetrics(
  departments: Department[],
  transactions: Transaction[],
  period?: NormalizedPeriod,
  budgets?: Budget[]
): DepartmentMetric[] {
  const txs = filterTransactionsByPeriod(transactions, period);

  // Map known departments
  const deptMap = new Map<string, Department>();
  (departments || []).forEach((d) => {
    if (d && d.name) {
      deptMap.set(d.name.trim().toLowerCase(), d);
    }
  });

  // If budgets contain departments not in deptMap, synthesize them
  if (budgets && budgets.length > 0) {
    budgets.forEach((b) => {
      const bDept = (b.department || "").trim();
      if (bDept && !deptMap.has(bDept.toLowerCase())) {
        deptMap.set(bDept.toLowerCase(), {
          id: `dept_synth_${bDept.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
          name: bDept,
          headCount: 0,
          budgetAllocated: safeNumber(b.allocated, 0),
        });
      }
    });
  }

  const allDepts = Array.from(deptMap.values());

  return allDepts.map((d) => {
    const dName = (d.name || "").trim().toLowerCase();
    const lineBudgetsAllocated = (budgets || [])
      .filter((b) => (b.department || "").trim().toLowerCase() === dName)
      .reduce((s, b) => s + safeNumber(b.allocated, 0), 0);
    const allocated = Math.max(safeNumber(d.budgetAllocated, 0), lineBudgetsAllocated);

    const deptExpenses = txs.filter(
      (t) =>
        t &&
        t.type === "expense" &&
        safeNumber(t.amount, 0) > 0 &&
        t.status !== "failed" &&
        (t as any).status !== "deleted" &&
        (t.department || "").trim().toLowerCase() === dName
    );

    const spent = deptExpenses.reduce((s, t) => s + safeNumber(t.amount, 0), 0);
    const remaining = Math.max(0, allocated - spent);
    const utilizationPct = allocated > 0 ? (spent / allocated) * 100 : 0;

    const payrollSpending = deptExpenses
      .filter(
        (t) =>
          (t.category || "").trim().toLowerCase() === "salary / payroll" ||
          (t.category || "").trim().toLowerCase() === "salaries" ||
          (t.category || "").trim().toLowerCase() === "salary" ||
          (t.category || "").trim().toLowerCase() === "payroll" ||
          t.expenseSource === "payroll" ||
          (t.id && t.id.startsWith("tx_pay_"))
      )
      .reduce((s, t) => s + safeNumber(t.amount, 0), 0);
    const otherSpending = Math.max(0, spent - payrollSpending);

    let status: "healthy" | "warning" | "over" | "no_budget" = "healthy";
    if (allocated <= 0) {
      status = "no_budget";
    } else if (spent > allocated) {
      status = "over";
    } else if (utilizationPct >= 80) {
      status = "warning";
    }

    const catMap = new Map<string, number>();
    deptExpenses.forEach((t) => {
      const cat = (t.category || "General").trim();
      catMap.set(cat, (catMap.get(cat) || 0) + safeNumber(t.amount, 0));
    });

    const categories: CategorySpendItem[] = Array.from(catMap.entries()).map(([cat, amt]) => ({
      category: cat,
      amount: amt,
      pct: spent > 0 ? (amt / spent) * 100 : 0,
    }));
    categories.sort((a, b) => b.amount - a.amount);

    return {
      id: d.id,
      name: d.name,
      allocated,
      spent,
      remaining,
      utilizationPct,
      status,
      categories,
      payrollSpending,
      otherSpending,
    };
  });
}

/**
 * 8. REMAINING BUDGET: Math.max(0, Allocated - Used).
 * Returns 0 if totalAllocated is 0.
 */
export function calculateBudgetRemaining(
  totalAllocated: number,
  totalUsed: number
): number {
  const alloc = safeNumber(totalAllocated, 0);
  const used = safeNumber(totalUsed, 0);
  if (alloc <= 0) return 0;
  return Math.max(0, alloc - used);
}

/**
 * 9. TOTAL PAYROLL COST: Net disbursals for a period.
 */
export function calculatePayrollCost(
  payroll: PayrollEntry[],
  periodMonth?: string
): number {
  const filtered = periodMonth
    ? payroll.filter((p) => p.month === periodMonth)
    : payroll;

  return filtered.reduce((sum, p) => {
    const base = safeNumber(p.baseSalary, 0);
    const bonus = safeNumber(p.bonus, 0);
    const deductions = safeNumber(p.deductions, 0);
    return sum + (base + bonus - deductions);
  }, 0);
}

/**
 * 10. RECEIVABLES & PAYABLES
 */
export function calculateReceivables(invoices: any[] = []): number {
  return invoices
    .filter((inv) => inv.type === "receivable" && inv.status !== "paid")
    .reduce((s, inv) => s + safeNumber(inv.amount, 0), 0);
}

export function calculatePayables(invoices: any[] = []): number {
  return invoices
    .filter((inv) => inv.type === "payable" && inv.status !== "paid")
    .reduce((s, inv) => s + safeNumber(inv.amount, 0), 0);
}

// ============================================================================
// 4. ADVANCED ANALYTICAL PIPELINE ENGINES
// ============================================================================

/**
 * Validates and computes Authoritative Budget Utilization.
 */
export function calculateBudgetUtilization(
  actualSpendingRaw: number,
  budgetLimitRaw: number,
  currency: string = "PKR"
): ValidatedBudgetAnalytics {
  const actualSpending = Math.max(0, safeNumber(actualSpendingRaw, 0));
  const budgetLimit = Math.max(0, safeNumber(budgetLimitRaw, 0));

  if (budgetLimit <= 0) {
    return {
      totalAllocated: 0,
      actualSpending,
      utilizationPct: null,
      rawUtilizationPct: 0,
      displayPct: "N/A",
      clampedRingPct: 0,
      remainingAmount: 0,
      excessAmount: actualSpending,
      status: "no_budget",
      statusLabel: "No Budget Configured",
      statusColor: "#94A3B8",
      remainingText: "No Budget Configured",
      isOverBudget: false,
      isValid: false,
      explanation: "No budget cap configured for the selected scope.",
    };
  }

  const rawUtilization = (actualSpending / budgetLimit) * 100;
  const isOverBudget = actualSpending > budgetLimit;
  const remainingAmount = Math.max(0, budgetLimit - actualSpending);
  const excessAmount = Math.max(0, actualSpending - budgetLimit);
  const clampedRingPct = Math.min(100, Math.max(0, rawUtilization));
  const displayPct =
    rawUtilization === 0
      ? "0%"
      : rawUtilization < 0.1 && rawUtilization > 0
      ? "<0.1%"
      : `${rawUtilization.toFixed(1)}%`;

  let status: BudgetStatus = "on_track";
  let statusLabel: "On Track" | "Watch" | "Near Limit" | "Over Budget" = "On Track";
  let statusColor = "#10B981"; // Emerald green

  if (isOverBudget) {
    status = "over_budget";
    statusLabel = "Over Budget";
    statusColor = "#F43F5E"; // Rose Red
  } else if (rawUtilization >= 90) {
    status = "near_limit";
    statusLabel = "Near Limit";
    statusColor = "#F97316"; // Orange
  } else if (rawUtilization >= 70) {
    status = "watch";
    statusLabel = "Watch";
    statusColor = "#F59E0B"; // Amber
  }

  let remainingText = "";
  if (isOverBudget) {
    remainingText = `${formatCompactCurrency(excessAmount, currency)} Over Budget`;
  } else if (remainingAmount === 0) {
    remainingText = "Budget Fully Used";
  } else {
    remainingText = `${formatCompactCurrency(remainingAmount, currency)} Remaining`;
  }

  return {
    totalAllocated: budgetLimit,
    actualSpending,
    utilizationPct: rawUtilization,
    rawUtilizationPct: rawUtilization,
    displayPct: `${rawUtilization.toFixed(1)}%`,
    clampedRingPct,
    remainingAmount,
    excessAmount,
    status,
    statusLabel,
    statusColor,
    remainingText,
    isOverBudget,
    isValid: true,
    explanation: isOverBudget
      ? `Disbursements exceed authorized limit by ${formatCurrencySafe(excessAmount, currency)}.`
      : `${formatCurrencySafe(remainingAmount, currency)} remaining of authorized allocation.`,
  };
}

/**
 * Validates and computes Authoritative Net Operating Margin (NOM).
 */
export function calculateNetOperatingMargin(
  revenueRaw: number,
  expensesRaw: number,
  currency: string = "PKR",
  previousRevenueRaw?: number,
  previousExpensesRaw?: number,
  totalBudgetCapRaw?: number
): ValidatedOperatingMarginAnalytics {
  const operatingRevenue = Math.max(0, safeNumber(revenueRaw, 0));
  const operatingExpenses = Math.max(0, safeNumber(expensesRaw, 0));
  const budgetCap = Math.max(0, safeNumber(totalBudgetCapRaw, 0));
  const operatingIncome = operatingRevenue - operatingExpenses;
  const totalFundingCap = operatingRevenue + budgetCap;
  const totalSurplus = totalFundingCap - operatingExpenses;
  const isCoveredByBudget = budgetCap > 0 && totalSurplus >= 0;
  const isLoss = isCoveredByBudget ? false : (budgetCap > 0 ? totalSurplus < 0 : operatingIncome < 0);
  const hasRevenue = operatingRevenue > 0;

  if (!hasRevenue) {
    if (budgetCap > 0) {
      const budgetSurplus = budgetCap - operatingExpenses;
      const isBudgetLoss = budgetSurplus < 0;
      return {
        operatingRevenue: 0,
        operatingExpenses,
        operatingIncome: budgetSurplus,
        operatingMarginPct: null,
        rawMarginPct: budgetCap > 0 ? ((budgetSurplus / budgetCap) * 100) : 0,
        displayMargin: isBudgetLoss ? "-100%" : `${Math.round((budgetSurplus / budgetCap) * 100)}%`,
        expenseRatioPct: budgetCap > 0 ? (operatingExpenses / budgetCap) * 100 : 0,
        displayExpenseRatio: `${Math.round(budgetCap > 0 ? (operatingExpenses / budgetCap) * 100 : 0)}%`,
        status: isBudgetLoss ? "critical" : "healthy",
        statusLabel: isBudgetLoss ? "Operating Loss" : "Healthy Surplus",
        statusColor: isBudgetLoss ? "#F43F5E" : "#10B981",
        isLoss: isBudgetLoss,
        hasRevenue: false,
        explanationText: isBudgetLoss
          ? `Disbursements exceed budget capital by ${formatCurrencySafe(Math.abs(budgetSurplus), currency)}.`
          : `Disbursements fully covered by approved budget capital (${formatCurrencySafe(budgetSurplus, currency)} remaining).`,
      };
    }
    return {
      operatingRevenue: 0,
      operatingExpenses,
      operatingIncome,
      operatingMarginPct: null,
      rawMarginPct: 0,
      displayMargin: "N/A",
      expenseRatioPct: operatingExpenses > 0 ? 100 : 0,
      displayExpenseRatio: operatingExpenses > 0 ? "100.0%" : "0%",
      status: "no_revenue",
      statusLabel: "No Operating Revenue",
      statusColor: operatingExpenses > 0 ? "#F43F5E" : "#94A3B8",
      isLoss: operatingExpenses > 0,
      hasRevenue: false,
      explanationText: operatingExpenses > 0
        ? `Deficit of ${formatCurrencySafe(operatingExpenses, currency)} with zero recognized inflows.`
        : "No financial transactions recorded for this period.",
    };
  }

  const rawMarginPct = (operatingIncome / operatingRevenue) * 100;
  const expenseRatioPct = (operatingExpenses / operatingRevenue) * 100;

  let status: NomStatus = "healthy";
  let statusLabel: "Healthy Surplus" | "Operating Margin Watch" | "Operating Loss" = "Healthy Surplus";
  let statusColor = "#10B981";

  if (isCoveredByBudget) {
    status = "healthy";
    statusLabel = "Healthy Surplus";
    statusColor = "#10B981";
  } else if (isLoss) {
    status = "critical";
    statusLabel = "Operating Loss";
    statusColor = "#F43F5E";
  } else if (rawMarginPct < 15) {
    status = "watch";
    statusLabel = "Operating Margin Watch";
    statusColor = "#F59E0B";
  }

  let previousPeriodRevenue: number | undefined;
  let previousPeriodExpenses: number | undefined;
  let previousPeriodIncome: number | undefined;
  let previousPeriodMarginPct: number | null | undefined;
  let marginChangeVsPrevious: number | null | undefined;
  let trendDirection: "up" | "down" | "flat" | "new" | "na" | undefined;

  if (previousRevenueRaw !== undefined && previousExpensesRaw !== undefined) {
    previousPeriodRevenue = Math.max(0, safeNumber(previousRevenueRaw, 0));
    previousPeriodExpenses = Math.max(0, safeNumber(previousExpensesRaw, 0));
    previousPeriodIncome = previousPeriodRevenue - previousPeriodExpenses;

    if (previousPeriodRevenue > 0) {
      previousPeriodMarginPct = (previousPeriodIncome / previousPeriodRevenue) * 100;
      marginChangeVsPrevious = rawMarginPct - previousPeriodMarginPct;
      if (marginChangeVsPrevious > 0.1) {
        trendDirection = "up";
      } else if (marginChangeVsPrevious < -0.1) {
        trendDirection = "down";
      } else {
        trendDirection = "flat";
      }
    } else {
      previousPeriodMarginPct = null;
      marginChangeVsPrevious = null;
      trendDirection = "new";
    }
  }

  return {
    operatingRevenue,
    operatingExpenses,
    operatingIncome,
    operatingMarginPct: rawMarginPct,
    rawMarginPct,
    displayMargin: `${rawMarginPct > 0 ? "+" : ""}${rawMarginPct.toFixed(1)}%`,
    expenseRatioPct,
    displayExpenseRatio: `${expenseRatioPct.toFixed(1)}%`,
    status,
    statusLabel,
    statusColor,
    isLoss,
    hasRevenue: true,
    explanationText: isCoveredByBudget
      ? `Operating disbursements fully covered by approved budget capital pool (${formatCurrencySafe(totalSurplus, currency)} surplus).`
      : isLoss
      ? `Operational shortfall of ${formatCurrencySafe(Math.abs(operatingIncome), currency)}.`
      : `Operating surplus of ${formatCurrencySafe(operatingIncome, currency)} (${rawMarginPct.toFixed(1)}% margin).`,
    previousPeriodRevenue,
    previousPeriodExpenses,
    previousPeriodIncome,
    previousPeriodMarginPct,
    marginChangeVsPrevious,
    trendDirection,
  };
}

/**
 * Validates and computes Authoritative Expense Distribution by Category.
 */
export function calculateExpenseDistribution(
  transactions: Transaction[],
  previousPeriodTransactions?: Transaction[],
  palette: string[] = ANALYTICS_PALETTE
): ValidatedExpenseDistributionAnalytics {
  const currentExpenses = transactions.filter(
    (t) => t.type === "expense" && safeNumber(t.amount, 0) > 0 && t.status !== "failed"
  );

  const totalExpenses = currentExpenses.reduce((sum, t) => sum + safeNumber(t.amount, 0), 0);

  if (totalExpenses <= 0 || currentExpenses.length === 0) {
    return {
      totalExpenses: 0,
      categories: [],
      chartSegments: [],
      sumPercentages: 0,
      hasExpenses: false,
      explanation: "No expense disbursements recorded in this period.",
    };
  }

  const catMap: Record<string, { amount: number; count: number }> = {};
  currentExpenses.forEach((t) => {
    const cat = (t.category || "General").trim();
    if (!catMap[cat]) catMap[cat] = { amount: 0, count: 0 };
    catMap[cat].amount += safeNumber(t.amount, 0);
    catMap[cat].count += 1;
  });

  const sortedCats = Object.entries(catMap).sort((a, b) => b[1].amount - a[1].amount);

  const fullCategories: ValidatedExpenseCategoryItem[] = sortedCats.map(([category, data], idx) => {
    const pct = (data.amount / totalExpenses) * 100;
    return {
      category,
      amount: data.amount,
      pct,
      displayPct: `${pct.toFixed(1)}%`,
      count: data.count,
      color: palette[idx % palette.length],
    };
  });

  let chartSegments: ValidatedExpenseCategoryItem[] = [];
  if (fullCategories.length <= 5) {
    chartSegments = [...fullCategories];
  } else {
    const top4 = fullCategories.slice(0, 4);
    const rest = fullCategories.slice(4);
    const otherAmount = rest.reduce((s, c) => s + c.amount, 0);
    const otherCount = rest.reduce((s, c) => s + c.count, 0);
    const otherPct = (otherAmount / totalExpenses) * 100;

    chartSegments = [
      ...top4,
      {
        category: "Other",
        amount: otherAmount,
        pct: otherPct,
        displayPct: `${otherPct.toFixed(1)}%`,
        count: otherCount,
        color: palette[palette.length - 1],
      },
    ];
  }

  const sumPercentages = Math.round(fullCategories.reduce((s, c) => s + c.pct, 0));
  const topCategory = fullCategories[0];

  return {
    totalExpenses,
    categories: fullCategories,
    chartSegments,
    topCategory,
    sumPercentages,
    hasExpenses: true,
    explanation: topCategory
      ? `${topCategory.category} is the dominant cost driver, accounting for ${topCategory.displayPct} of all disbursements.`
      : "Expense disbursements categorized by cost driver.",
  };
}

/**
 * Master Pipeline: Computes all Authoritative Analytics Models for a filtered period.
 */
export function buildAuthoritativeFinancialModel(
  transactions: Transaction[],
  budgets: Budget[],
  period?: NormalizedPeriod,
  currency: string = "PKR",
  previousPeriodTransactions?: Transaction[],
  departments?: Department[]
): CompleteFinancialAnalyticsModel {
  const filteredTxs = filterTransactionsByPeriod(transactions, period);
  const totalIncome = calculateTotalIncome(filteredTxs);
  const totalExpenses = calculateTotalExpenses(filteredTxs);
  const netBalance = calculateNetOperatingResult(filteredTxs);
  const totalBudgetCap = calculateBudgetAllocation(budgets, departments);
  const actualBudgetSpending = calculateBudgetUsed(filteredTxs, budgets, period, departments);
  const budget = calculateBudgetUtilization(actualBudgetSpending, totalBudgetCap, currency);
  const unallocatedFunds = calculateUnallocatedFunds(totalIncome, totalBudgetCap);
  const departmentMetrics = departments ? calculateDepartmentMetrics(departments, filteredTxs, period, budgets) : [];
  const prevIncome = previousPeriodTransactions ? calculateTotalIncome(filterTransactionsByPeriod(previousPeriodTransactions, period)) : undefined;
  const prevExpenses = previousPeriodTransactions ? calculateTotalExpenses(filterTransactionsByPeriod(previousPeriodTransactions, period)) : undefined;
  const margin = calculateNetOperatingMargin(totalIncome, totalExpenses, currency, prevIncome, prevExpenses, totalBudgetCap);
  const distribution = calculateExpenseDistribution(filteredTxs, previousPeriodTransactions);

  const resolvedPeriod: NormalizedPeriod = period || {
    mode: "presets",
    startDate: "",
    endDate: "",
    label: "All Time",
    granularity: "month",
  };

  return {
    period: resolvedPeriod,
    budget,
    margin,
    distribution,
    totalIncome,
    totalExpenses,
    netBalance,
    transactionCount: filteredTxs.length,
    totalAllocatedBudget: totalBudgetCap,
    unallocatedFunds,
    departmentMetrics,
  };
}
