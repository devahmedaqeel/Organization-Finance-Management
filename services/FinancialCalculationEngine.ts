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
  if (abs >= 1000000) {
    return `${prefix}${currency} ${(abs / 1000000).toFixed(2)}M`;
  }
  if (abs >= 1000) {
    return `${prefix}${currency} ${(abs / 1000).toFixed(1)}K`;
  }
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
 * 5. BUDGET ALLOCATION: Total planned limits across line items or department caps.
 */
export function calculateBudgetAllocation(
  budgets: Budget[],
  departments?: Department[]
): number {
  const lineTotal = (budgets || []).reduce((s, b) => s + safeNumber(b.allocated, 0), 0);
  if (lineTotal > 0) return lineTotal;
  return (departments || []).reduce((s, d) => s + safeNumber(d.budgetAllocated, 0), 0);
}

/**
 * 6. BUDGET-LINKED SPENDING FOR A SPECIFIC BUDGET RECORD:
 * Matches strictly on department AND category.
 */
export function calculateBudgetSpentForCategory(
  budget: Budget,
  transactions: Transaction[],
  period?: NormalizedPeriod
): number {
  const txs = filterTransactionsByPeriod(transactions, period);
  const bDept = (budget.department || "").trim().toLowerCase();
  const bCat = (budget.category || "").trim().toLowerCase();

  return txs
    .filter((t) => {
      if (t.type !== "expense" || safeNumber(t.amount, 0) <= 0 || t.status === "failed") return false;
      const tDept = (t.department || "").trim().toLowerCase();
      const tCat = (t.category || "").trim().toLowerCase();

      const deptMatch = !bDept || bDept === "all" || tDept === bDept;
      const catMatch = !bCat || bCat === "all" || tCat === bCat;
      return deptMatch && catMatch;
    })
    .reduce((sum, t) => sum + safeNumber(t.amount, 0), 0);
}

/**
 * 7. TOTAL BUDGET USED: Total actual expenses against configured budgets.
 */
export function calculateBudgetUsed(
  transactions: Transaction[],
  budgets: Budget[],
  period?: NormalizedPeriod
): number {
  return calculateTotalExpenses(transactions, period);
}

/**
 * 8. REMAINING BUDGET: Math.max(0, Allocated - Used).
 */
export function calculateBudgetRemaining(
  totalAllocated: number,
  totalUsed: number
): number {
  return Math.max(0, safeNumber(totalAllocated, 0) - safeNumber(totalUsed, 0));
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
  previousExpensesRaw?: number
): ValidatedOperatingMarginAnalytics {
  const operatingRevenue = Math.max(0, safeNumber(revenueRaw, 0));
  const operatingExpenses = Math.max(0, safeNumber(expensesRaw, 0));
  const operatingIncome = operatingRevenue - operatingExpenses;
  const isLoss = operatingIncome < 0;
  const hasRevenue = operatingRevenue > 0;

  if (!hasRevenue) {
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

  if (isLoss) {
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
    explanationText: isLoss
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
  const actualBudgetSpending = (budgets && budgets.length > 0)
    ? budgets.reduce((sum, b) => sum + calculateBudgetSpentForCategory(b, filteredTxs, period), 0)
    : (totalBudgetCap > 0 ? totalExpenses : 0);

  const budget = calculateBudgetUtilization(actualBudgetSpending, totalBudgetCap, currency);
  const margin = calculateNetOperatingMargin(totalIncome, totalExpenses, currency);
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
  };
}
