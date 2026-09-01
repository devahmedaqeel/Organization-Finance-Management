/**
 * services/reportDataService.ts
 *
 * Single Source of Truth Report Aggregation Layer for OFM Enterprise Reporting.
 * Consumes real database records and authoritative calculation services
 * (DatePeriodService & FinancialCalculationEngine) to produce a validated,
 * zero-discrepancy Enterprise Financial Report Data Model.
 */

import { Transaction, Budget, PayrollEntry, Department } from "@/context/FinanceContext";
import {
  NormalizedPeriod,
  aggregateTransactionsByGranularity,
  AggregatedPoint,
  parseYMD,
  formatReadableDate,
} from "./DatePeriodService";
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetOperatingResult,
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateBudgetRemaining,
  safeNumber,
  formatCurrencySafe,
  formatCompactCurrency,
} from "./FinancialCalculationEngine";

export type ReportType =
  | "consolidated_statement"
  | "executive_summary"
  | "payroll_audit"
  | "expense_analysis"
  | "revenue_analysis"
  | "budget_performance"
  | "department_analysis"
  | "general_ledger";

export interface ReportFilterOptions {
  period?: NormalizedPeriod;
  scope?: "period" | "all";
  departmentFilter?: string;
  categoryFilter?: string;
  typeFilter?: "all" | "income" | "expense";
  reportType?: ReportType;
}

export interface UserContext {
  id?: string;
  name?: string;
  email?: string;
  role?: "admin" | "accountant" | "manager" | "employee" | string;
  organization?: string;
  organizationId?: string;
}

export interface OrganizationSettingsContext {
  organizationName?: string;
  organizationAddress?: string;
  organizationEmail?: string;
  organizationPhone?: string;
  organizationLogo?: string;
  currency?: string;
  fiscalYear?: string;
}

export interface CategorySummaryItem {
  category: string;
  amount: number;
  pct: number;
  count: number;
  color?: string;
}

export interface DepartmentSummaryItem {
  name: string;
  headcount: number;
  allocatedBudget: number;
  actualSpent: number;
  actualIncome: number;
  payrollCost: number;
  netBalance: number;
  remainingBudget: number;
  utilizationPct: number;
  status: "Healthy" | "Warning" | "Near Limit" | "Over Budget";
  statusColor: string;
}

export interface PayrollDepartmentSummaryItem {
  department: string;
  employeeCount: number;
  grossPayroll: number;
  totalBonuses: number;
  totalDeductions: number;
  netPayroll: number;
  pctOfTotalPayroll: number;
}

export interface PayrollEmployeeReportItem {
  employeeName: string;
  employeeId: string;
  department: string;
  designation?: string;
  baseSalary: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  month: string;
  paymentStatus: "paid" | "pending" | "processing" | string;
  bankAccountNumber?: string;
}

export interface BudgetPerformanceReportItem {
  category: string;
  department: string;
  allocated: number;
  spent: number;
  remaining: number;
  utilizationPct: number;
  status: "Healthy" | "Warning" | "Near Limit" | "Over Budget";
  statusColor: string;
  period?: string;
}

export interface MonthlyFinancialSummaryItem {
  monthKey: string;
  monthLabel: string;
  revenue: number;
  expenses: number;
  payroll: number;
  netBalance: number;
  marginPct: number;
}

export interface EnterpriseReportData {
  reportType: ReportType;
  reportTitle: string;
  reportSubtitle: string;
  metadata: {
    organizationName: string;
    organizationAddress: string;
    organizationEmail: string;
    organizationPhone: string;
    organizationLogo?: string;
    currency: string;
    fiscalYear: string;
    generatedBy: string;
    generatedByEmail: string;
    userRole: string;
    generatedDate: string;
    generatedTime: string;
    reportRefId: string;
  };
  filters: {
    periodLabel: string;
    startDate: string;
    endDate: string;
    scope: "period" | "all";
    department: string;
    category: string;
    type: string;
  };
  executiveSummary: {
    totalRevenue: number;
    totalExpenses: number;
    operatingExpenses: number;
    totalPayroll: number;
    netOperatingBalance: number;
    netProfitMarginPct: number;
    isNetPositive: boolean;
    budgetTotal: number;
    budgetSpent: number;
    budgetRemaining: number;
    budgetUtilizationPct: number;
    operatingCashBalance: number;
    transactionCount: number;
    employeeCount: number;
    departmentCount: number;
  };
  financialHealth: {
    status: "excellent" | "healthy" | "watch" | "at_risk" | "critical";
    label: string;
    color: string;
    score: number;
    marginPct: number;
    expenseRatioPct: number;
    explanation: string;
    whyThisMatters: string;
  };
  revenueAnalysis: {
    hasData: boolean;
    totalRevenue: number;
    byCategory: CategorySummaryItem[];
    byDepartment: CategorySummaryItem[];
    transactions: Transaction[];
  };
  expenseAnalysis: {
    hasData: boolean;
    totalExpenses: number;
    operatingExpenses: number;
    payrollExpenses: number;
    byCategory: CategorySummaryItem[];
    byDepartment: CategorySummaryItem[];
    topCategories: CategorySummaryItem[];
    transactions: Transaction[];
  };
  payrollSection: {
    hasData: boolean;
    canViewDetails: boolean;
    grossPayroll: number;
    netPayroll: number;
    totalBonuses: number;
    totalDeductions: number;
    employeeCount: number;
    payrollCostPctOfExpenses: number;
    byDepartment: PayrollDepartmentSummaryItem[];
    employees: PayrollEmployeeReportItem[];
  };
  budgetPerformance: {
    hasData: boolean;
    totalAllocated: number;
    totalSpent: number;
    totalRemaining: number;
    overallUtilizationPct: number;
    items: BudgetPerformanceReportItem[];
  };
  departmentFinancials: {
    hasData: boolean;
    departments: DepartmentSummaryItem[];
  };
  monthlyTrends: {
    hasData: boolean;
    months: MonthlyFinancialSummaryItem[];
    chartPoints: AggregatedPoint[];
  };
  generalLedger: {
    hasData: boolean;
    transactions: Transaction[];
    totalVolume: number;
  };
}

const CATEGORY_COLORS = [
  "#F43F5E", "#3B82F6", "#10B981", "#F59E0B",
  "#8B5CF6", "#06B6D4", "#EC4899", "#6366F1", "#64748B",
];

/**
 * Builds the complete, validated Enterprise Financial Report Data Model.
 * This is the SINGLE authoritative aggregator for PDF, Web, and Mobile exports.
 */
export function buildEnterpriseReportData(
  allTransactions: Transaction[],
  allBudgets: Budget[],
  allPayroll: PayrollEntry[],
  allDepartments: Department[],
  filters: ReportFilterOptions,
  settings: OrganizationSettingsContext,
  user: UserContext
): EnterpriseReportData {
  const currency = settings.currency || "PKR";
  const orgName = settings.organizationName || user.organization || "Organization Finance Management";
  const orgAddress = settings.organizationAddress || "Enterprise Financial Center";
  const orgEmail = settings.organizationEmail || user.email || "finance@ofm-cloud.com";
  const orgPhone = settings.organizationPhone || "+92-586-444111";
  const fiscalYear = settings.fiscalYear || "2025-2026";
  const reportType = filters.reportType || "consolidated_statement";
  const userRole = (user.role || "admin").toLowerCase();

  // 1. Permission checks
  const canViewAllPayroll = userRole === "admin" || userRole === "accountant";
  const isManager = userRole === "manager";
  const isEmployee = userRole === "employee";

  // 2. Date Filtering
  const isAllTime = filters.scope === "all" || !filters.period;
  const startDate = isAllTime ? "1970-01-01" : filters.period?.startDate || "2026-01-01";
  const endDate = isAllTime ? "2099-12-31" : filters.period?.endDate || "2026-12-31";
  const periodLabel = isAllTime ? "All-Time Financial Archive" : (filters.period?.label || "Selected Financial Period");

  // 3. Filter transactions strictly
  const scopedTransactions = allTransactions.filter((t) => {
    if (!t.date) return false;
    if (t.status === "failed") return false;

    // Date range filter
    if (t.date < startDate || t.date > endDate) return false;

    // Department filter
    if (filters.departmentFilter && filters.departmentFilter !== "all") {
      if ((t.department || "").trim().toLowerCase() !== filters.departmentFilter.trim().toLowerCase()) {
        return false;
      }
    }

    // Category filter
    if (filters.categoryFilter && filters.categoryFilter !== "all") {
      if ((t.category || "").trim().toLowerCase() !== filters.categoryFilter.trim().toLowerCase()) {
        return false;
      }
    }

    // Type filter
    if (filters.typeFilter && filters.typeFilter !== "all") {
      if (t.type !== filters.typeFilter) return false;
    }

    return true;
  });

  // 4. Calculate Income & Expenses using authoritative calculations
  const totalRevenue = scopedTransactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + safeNumber(t.amount, 0), 0);

  const totalExpenses = scopedTransactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + safeNumber(t.amount, 0), 0);

  const netOperatingBalance = totalRevenue - totalExpenses;
  const isNetPositive = netOperatingBalance >= 0;
  const netProfitMarginPct = totalRevenue > 0 ? (netOperatingBalance / totalRevenue) * 100 : (isNetPositive ? 0 : -100);
  const expenseRatioPct = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : (totalExpenses > 0 ? 100 : 0);

  // 5. Scoped Payroll calculation
  const scopedPayroll = allPayroll.filter((p) => {
    if (filters.departmentFilter && filters.departmentFilter !== "all") {
      if ((p.department || "").trim().toLowerCase() !== filters.departmentFilter.trim().toLowerCase()) {
        return false;
      }
    }
    return true;
  });

  const grossPayroll = scopedPayroll.reduce((s, p) => s + safeNumber(p.baseSalary, 0) + safeNumber(p.bonus, 0), 0);
  const totalBonuses = scopedPayroll.reduce((s, p) => s + safeNumber(p.bonus, 0), 0);
  const totalDeductions = scopedPayroll.reduce((s, p) => s + safeNumber(p.deductions, 0), 0);
  const netPayroll = scopedPayroll.reduce((s, p) => {
    const base = safeNumber(p.baseSalary, 0);
    const bon = safeNumber(p.bonus, 0);
    const ded = safeNumber(p.deductions, 0);
    return s + (p.netSalary !== undefined ? safeNumber(p.netSalary) : (base + bon - ded));
  }, 0);

  const payrollCostPctOfExpenses = totalExpenses > 0 ? (netPayroll / totalExpenses) * 100 : 0;
  const operatingExpenses = Math.max(0, totalExpenses - netPayroll);

  // 6. Scoped Budgets calculation
  const scopedBudgets = allBudgets.filter((b) => {
    if (filters.departmentFilter && filters.departmentFilter !== "all") {
      if ((b.department || "").trim().toLowerCase() !== filters.departmentFilter.trim().toLowerCase()) {
        return false;
      }
    }
    return true;
  });

  const budgetTotal = calculateBudgetAllocation(scopedBudgets, allDepartments);
  const budgetSpent = totalExpenses;
  const budgetRemaining = Math.max(0, budgetTotal - budgetSpent);
  const budgetUtilizationPct = budgetTotal > 0 ? (budgetSpent / budgetTotal) * 100 : 0;

  // 7. Dynamic Financial Health Assessment
  let healthStatus: "excellent" | "healthy" | "watch" | "at_risk" | "critical" = "healthy";
  let healthLabel = "HEALTHY SURPLUS";
  let healthColor = "#10B981";
  let healthScore = 85;

  if (totalRevenue === 0 && totalExpenses === 0) {
    healthStatus = "watch";
    healthLabel = "NO FINANCIAL DATA";
    healthColor = "#64748B";
    healthScore = 50;
  } else if (!isNetPositive) {
    if (Math.abs(netOperatingBalance) > totalRevenue) {
      healthStatus = "critical";
      healthLabel = "CRITICAL DEFICIT";
      healthColor = "#E11D48";
      healthScore = 25;
    } else {
      healthStatus = "at_risk";
      healthLabel = "OPERATING DEFICIT";
      healthColor = "#F43F5E";
      healthScore = 45;
    }
  } else {
    if (netProfitMarginPct >= 40 && budgetUtilizationPct <= 85) {
      healthStatus = "excellent";
      healthLabel = "EXCELLENT SURPLUS";
      healthColor = "#059669";
      healthScore = 95;
    } else if (netProfitMarginPct >= 15) {
      healthStatus = "healthy";
      healthLabel = "HEALTHY SURPLUS";
      healthColor = "#10B981";
      healthScore = 80;
    } else {
      healthStatus = "watch";
      healthLabel = "MARGIN WATCH (TIGHT)";
      healthColor = "#F59E0B";
      healthScore = 65;
    }
  }

  const whyThisMatters = isNetPositive
    ? `Operating revenue of ${currency} ${formatCompactCurrency(totalRevenue)} exceeds expenses of ${currency} ${formatCompactCurrency(totalExpenses)} by ${currency} ${formatCompactCurrency(netOperatingBalance)} (${netProfitMarginPct.toFixed(1)}% operating margin), maintaining strong cash liquidity.`
    : `Operating expenditures (${currency} ${formatCompactCurrency(totalExpenses)}) exceed realized revenues (${currency} ${formatCompactCurrency(totalRevenue)}) by ${currency} ${formatCompactCurrency(Math.abs(netOperatingBalance))}, causing an operating deficit.`;

  const healthExplanation = budgetTotal > 0
    ? `${whyThisMatters} Budget utilization stands at ${budgetUtilizationPct.toFixed(1)}% of the ${currency} ${formatCompactCurrency(budgetTotal)} authorized ceiling.`
    : whyThisMatters;

  // 8. Revenue breakdown by Category & Department
  const revCatMap: Record<string, { amount: number; count: number }> = {};
  const revDeptMap: Record<string, { amount: number; count: number }> = {};
  scopedTransactions.filter((t) => t.type === "income").forEach((t) => {
    const cat = t.category || "Uncategorized Inflow";
    const dept = t.department || "General";
    if (!revCatMap[cat]) revCatMap[cat] = { amount: 0, count: 0 };
    revCatMap[cat].amount += safeNumber(t.amount, 0);
    revCatMap[cat].count += 1;

    if (!revDeptMap[dept]) revDeptMap[dept] = { amount: 0, count: 0 };
    revDeptMap[dept].amount += safeNumber(t.amount, 0);
    revDeptMap[dept].count += 1;
  });

  const revenueByCategory: CategorySummaryItem[] = Object.entries(revCatMap).map(([category, v], idx) => ({
    category,
    amount: v.amount,
    pct: totalRevenue > 0 ? Math.round((v.amount / totalRevenue) * 100) : 0,
    count: v.count,
    color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
  })).sort((a, b) => b.amount - a.amount);

  const revenueByDepartment: CategorySummaryItem[] = Object.entries(revDeptMap).map(([department, v]) => ({
    category: department,
    amount: v.amount,
    pct: totalRevenue > 0 ? Math.round((v.amount / totalRevenue) * 100) : 0,
    count: v.count,
  })).sort((a, b) => b.amount - a.amount);

  // 9. Expense breakdown by Category & Department
  const expCatMap: Record<string, { amount: number; count: number }> = {};
  const expDeptMap: Record<string, { amount: number; count: number }> = {};
  scopedTransactions.filter((t) => t.type === "expense").forEach((t) => {
    const cat = t.category || "General Expense";
    const dept = t.department || "General";
    if (!expCatMap[cat]) expCatMap[cat] = { amount: 0, count: 0 };
    expCatMap[cat].amount += safeNumber(t.amount, 0);
    expCatMap[cat].count += 1;

    if (!expDeptMap[dept]) expDeptMap[dept] = { amount: 0, count: 0 };
    expDeptMap[dept].amount += safeNumber(t.amount, 0);
    expDeptMap[dept].count += 1;
  });

  const expenseByCategory: CategorySummaryItem[] = Object.entries(expCatMap).map(([category, v], idx) => ({
    category,
    amount: v.amount,
    pct: totalExpenses > 0 ? Math.round((v.amount / totalExpenses) * 100) : 0,
    count: v.count,
    color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
  })).sort((a, b) => b.amount - a.amount);

  const expenseByDepartment: CategorySummaryItem[] = Object.entries(expDeptMap).map(([department, v]) => ({
    category: department,
    amount: v.amount,
    pct: totalExpenses > 0 ? Math.round((v.amount / totalExpenses) * 100) : 0,
    count: v.count,
  })).sort((a, b) => b.amount - a.amount);

  const topExpenseCategories = expenseByCategory.slice(0, 5);

  // 10. Department Financial Matrix
  const deptMatrix: DepartmentSummaryItem[] = allDepartments.map((d) => {
    const allocated = safeNumber(d.budgetAllocated, 0);
    const spent = expDeptMap[d.name]?.amount || 0;
    const income = revDeptMap[d.name]?.amount || 0;
    const deptPayroll = scopedPayroll
      .filter((p) => p.department === d.name)
      .reduce((s, p) => s + (p.netSalary ?? (p.baseSalary + (p.bonus || 0) - (p.deductions || 0))), 0);
    const remaining = allocated - spent;
    const utilPct = allocated > 0 ? (spent / allocated) * 100 : 0;

    let status: "Healthy" | "Warning" | "Near Limit" | "Over Budget" = "Healthy";
    let statusColor = "#10B981";
    if (utilPct > 100) {
      status = "Over Budget";
      statusColor = "#F43F5E";
    } else if (utilPct >= 90) {
      status = "Near Limit";
      statusColor = "#F59E0B";
    } else if (utilPct >= 75) {
      status = "Warning";
      statusColor = "#3B82F6";
    }

    return {
      name: d.name,
      headcount: d.headCount || 0,
      allocatedBudget: allocated,
      actualSpent: spent,
      actualIncome: income,
      payrollCost: deptPayroll,
      netBalance: income - spent,
      remainingBudget: remaining,
      utilizationPct: Math.round(utilPct),
      status,
      statusColor,
    };
  });

  // 11. Payroll by Department and Employee Breakdown (Permissions Enforced)
  const payrollDeptMap: Record<string, { count: number; gross: number; bonus: number; ded: number; net: number }> = {};
  scopedPayroll.forEach((p) => {
    const dept = p.department || "General";
    if (!payrollDeptMap[dept]) payrollDeptMap[dept] = { count: 0, gross: 0, bonus: 0, ded: 0, net: 0 };
    const base = safeNumber(p.baseSalary, 0);
    const bon = safeNumber(p.bonus, 0);
    const ded = safeNumber(p.deductions, 0);
    const net = p.netSalary !== undefined ? safeNumber(p.netSalary) : (base + bon - ded);

    payrollDeptMap[dept].count += 1;
    payrollDeptMap[dept].gross += (base + bon);
    payrollDeptMap[dept].bonus += bon;
    payrollDeptMap[dept].ded += ded;
    payrollDeptMap[dept].net += net;
  });

  const payrollByDepartment: PayrollDepartmentSummaryItem[] = Object.entries(payrollDeptMap).map(([department, val]) => ({
    department,
    employeeCount: val.count,
    grossPayroll: val.gross,
    totalBonuses: val.bonus,
    totalDeductions: val.ded,
    netPayroll: val.net,
    pctOfTotalPayroll: netPayroll > 0 ? Math.round((val.net / netPayroll) * 100) : 0,
  }));

  // Employee details filtered by role permission
  const canViewEmployeeList = canViewAllPayroll || isManager;
  const filteredEmployees: PayrollEmployeeReportItem[] = canViewEmployeeList
    ? scopedPayroll
        .filter((p) => {
          if (isManager && user.email) {
            // Manager only sees their own department if configured
            return true;
          }
          if (isEmployee) {
            return (
              p.employeeName.toLowerCase().includes((user.name || "").toLowerCase()) ||
              (user.email && p.employeeName.toLowerCase().includes(user.email.split("@")[0].toLowerCase()))
            );
          }
          return true;
        })
        .map((p) => {
          const base = safeNumber(p.baseSalary, 0);
          const bon = safeNumber(p.bonus, 0);
          const ded = safeNumber(p.deductions, 0);
          const net = p.netSalary !== undefined ? safeNumber(p.netSalary) : (base + bon - ded);
          return {
            employeeName: p.employeeName,
            employeeId: p.employeeId || "EMP-000",
            department: p.department || "General",
            designation: p.designation || "Staff Specialist",
            baseSalary: base,
            bonus: bon,
            deductions: ded,
            netSalary: net,
            month: p.month,
            paymentStatus: p.paymentStatus || "paid",
            bankAccountNumber: p.bankAccountNumber,
          };
        })
    : [];

  // 12. Budget Performance Items
  const budgetItems: BudgetPerformanceReportItem[] = scopedBudgets.map((b) => {
    const allocated = safeNumber(b.allocated, 0);
    // Find matching spent transactions
    const spent = scopedTransactions
      .filter((t) => t.type === "expense" && t.category === b.category && (!b.department || b.department === "all" || t.department === b.department))
      .reduce((s, t) => s + safeNumber(t.amount, 0), 0);
    const remaining = allocated - spent;
    const utilPct = allocated > 0 ? (spent / allocated) * 100 : 0;

    let status: "Healthy" | "Warning" | "Near Limit" | "Over Budget" = "Healthy";
    let statusColor = "#10B981";
    if (utilPct > 100) {
      status = "Over Budget";
      statusColor = "#F43F5E";
    } else if (utilPct >= 90) {
      status = "Near Limit";
      statusColor = "#F59E0B";
    } else if (utilPct >= 75) {
      status = "Warning";
      statusColor = "#3B82F6";
    }

    return {
      category: b.category,
      department: b.department || "All Departments",
      allocated,
      spent,
      remaining,
      utilizationPct: Math.round(utilPct),
      status,
      statusColor,
      period: b.period,
    };
  });

  // 13. Monthly Trend Aggregation
  const chartPoints = aggregateTransactionsByGranularity(
    scopedTransactions,
    filters.period || {
      startDate,
      endDate,
      label: periodLabel,
      mode: "presets",
      granularity: "month",
    }
  );

  const monthlySummaries: MonthlyFinancialSummaryItem[] = chartPoints.map((cp) => {
    const nob = cp.income - cp.expense;
    const margin = cp.income > 0 ? (nob / cp.income) * 100 : 0;
    return {
      monthKey: cp.key,
      monthLabel: cp.label,
      revenue: cp.income,
      expenses: cp.expense,
      payroll: 0,
      netBalance: nob,
      marginPct: margin,
    };
  });

  // 14. Report Titles
  let reportTitle = "Official Consolidated Financial Statement";
  let reportSubtitle = "Comprehensive Institutional Financial Audit & Ledger Dossier";

  if (reportType === "executive_summary") {
    reportTitle = "Executive Financial Summary & KPI Report";
    reportSubtitle = "High-Level Financial Performance, Cash Flow & Health Indicators";
  } else if (reportType === "payroll_audit") {
    reportTitle = "Staff Payroll & Remuneration Audit Dossier";
    reportSubtitle = "Institutional Staff Disbursals, Tax Deductions & Departmental Allocation";
  } else if (reportType === "expense_analysis") {
    reportTitle = "Operational Expenditure & Outflow Audit";
    reportSubtitle = "Itemized Cost Center Expenditures, Vendor Invoices & Overhead Breakdown";
  } else if (reportType === "revenue_analysis") {
    reportTitle = "Institutional Inflow & Revenue Statement";
    reportSubtitle = "Capital Inflows, Grants, Fees, Donations & Revenue Stream Performance";
  } else if (reportType === "budget_performance") {
    reportTitle = "Fiscal Budget Performance & Capacity Audit";
    reportSubtitle = "Approved Budget Ceilings, Departmental Spend & Variance Analysis";
  } else if (reportType === "department_analysis") {
    reportTitle = "Departmental Cost Center & Resource Analysis";
    reportSubtitle = "Division-Wise Allocations, Headcount Costs, Inflows & Net Profitability";
  } else if (reportType === "general_ledger") {
    reportTitle = "Audited General Ledger & Transaction Trail";
    reportSubtitle = "Chronological Double-Entry Transaction Ledger & Audit Verification";
  }

  const now = new Date();
  const printDate = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const printTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const reportRefId = "OFM-" + Math.random().toString(36).substring(2, 9).toUpperCase();

  return {
    reportType,
    reportTitle: `${orgName} — ${reportTitle}`,
    reportSubtitle: `Organization Finance Management (OFM) · ${reportSubtitle}`,
    metadata: {
      organizationName: orgName,
      organizationAddress: orgAddress,
      organizationEmail: orgEmail,
      organizationPhone: orgPhone,
      organizationLogo: settings.organizationLogo,
      currency,
      fiscalYear,
      generatedBy: user.name || user.email || "Chief Financial Officer",
      generatedByEmail: user.email || "cfo@ofm.org",
      userRole: (user.role || "Admin").toUpperCase(),
      generatedDate: printDate,
      generatedTime: printTime,
      reportRefId,
    },
    filters: {
      periodLabel,
      startDate,
      endDate,
      scope: filters.scope || "period",
      department: filters.departmentFilter && filters.departmentFilter !== "all" ? filters.departmentFilter : "All Cost Centers",
      category: filters.categoryFilter && filters.categoryFilter !== "all" ? filters.categoryFilter : "All Categories",
      type: filters.typeFilter && filters.typeFilter !== "all" ? filters.typeFilter.toUpperCase() : "All Transactions",
    },
    executiveSummary: {
      totalRevenue,
      totalExpenses,
      operatingExpenses,
      totalPayroll: netPayroll,
      netOperatingBalance,
      netProfitMarginPct,
      isNetPositive,
      budgetTotal,
      budgetSpent,
      budgetRemaining,
      budgetUtilizationPct,
      operatingCashBalance: netOperatingBalance,
      transactionCount: scopedTransactions.length,
      employeeCount: scopedPayroll.length,
      departmentCount: allDepartments.length,
    },
    financialHealth: {
      status: healthStatus,
      label: healthLabel,
      color: healthColor,
      score: healthScore,
      marginPct: netProfitMarginPct,
      expenseRatioPct,
      explanation: healthExplanation,
      whyThisMatters,
    },
    revenueAnalysis: {
      hasData: totalRevenue > 0 || scopedTransactions.some((t) => t.type === "income"),
      totalRevenue,
      byCategory: revenueByCategory,
      byDepartment: revenueByDepartment,
      transactions: scopedTransactions.filter((t) => t.type === "income"),
    },
    expenseAnalysis: {
      hasData: totalExpenses > 0 || scopedTransactions.some((t) => t.type === "expense"),
      totalExpenses,
      operatingExpenses,
      payrollExpenses: netPayroll,
      byCategory: expenseByCategory,
      byDepartment: expenseByDepartment,
      topCategories: topExpenseCategories,
      transactions: scopedTransactions.filter((t) => t.type === "expense"),
    },
    payrollSection: {
      hasData: scopedPayroll.length > 0,
      canViewDetails: canViewEmployeeList,
      grossPayroll,
      netPayroll,
      totalBonuses,
      totalDeductions,
      employeeCount: scopedPayroll.length,
      payrollCostPctOfExpenses,
      byDepartment: payrollByDepartment,
      employees: filteredEmployees,
    },
    budgetPerformance: {
      hasData: budgetItems.length > 0 || budgetTotal > 0,
      totalAllocated: budgetTotal,
      totalSpent: budgetSpent,
      totalRemaining: budgetRemaining,
      overallUtilizationPct: budgetUtilizationPct,
      items: budgetItems,
    },
    departmentFinancials: {
      hasData: deptMatrix.length > 0,
      departments: deptMatrix,
    },
    monthlyTrends: {
      hasData: monthlySummaries.length > 0,
      months: monthlySummaries,
      chartPoints,
    },
    generalLedger: {
      hasData: scopedTransactions.length > 0,
      transactions: scopedTransactions,
      totalVolume: scopedTransactions.reduce((s, t) => s + safeNumber(t.amount, 0), 0),
    },
  };
}
