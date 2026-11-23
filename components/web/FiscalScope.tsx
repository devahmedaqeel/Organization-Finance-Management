import React, { createContext, useContext, useMemo } from "react";
import { FinanceContext, useFinance } from "@/context/FinanceContext";
import { useSettings } from "@/context/SettingsContext";
import {
  calculateBudgetAllocation,
  calculateBudgetRemaining,
  calculateBudgetSpentForCategory,
  calculateBudgetUsed,
  calculateDepartmentMetrics,
  calculateNetOperatingResult,
  calculateTotalExpenses,
  calculateTotalIncome,
} from "@/services/FinancialCalculationEngine";
import { FiscalRange, fiscalRange, normalizeStartMonth, parseFiscalStartYear } from "@/services/fiscalYear";

export type FiscalScopeMode = "fiscal" | "all";

interface FiscalScopeInfo {
  mode: FiscalScopeMode;
  range: FiscalRange;
  /** Records inside the scope (transactions only). */
  recordCount: number;
}

const FiscalScopeContext = createContext<FiscalScopeInfo | null>(null);
export const useFiscalScope = () => useContext(FiscalScopeContext);

const STORAGE_KEY = "ofm.web.fiscalScope";
export function loadScopeMode(): FiscalScopeMode {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem(STORAGE_KEY) === "all" ? "all" : "fiscal";
  } catch {
    return "fiscal";
  }
}
export function saveScopeMode(mode: FiscalScopeMode) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, mode);
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

/**
 * Web-only layer: re-provides the finance data limited to the saved fiscal year, so every page
 * (dashboard, ledgers, budgets, payroll, reports, insights) shows that year's figures.
 * Totals are recalculated with the same engine functions FinanceContext uses.
 * Add / edit / delete functions are passed through untouched, so saving data works exactly as before.
 */
export function FiscalScopeProvider({ mode, children }: { mode: FiscalScopeMode; children: React.ReactNode }) {
  const base = useFinance();
  const { settings } = useSettings();
  const startMonth = normalizeStartMonth(settings.fiscalYearStartMonth);
  const range = useMemo(
    () => fiscalRange(parseFiscalStartYear(settings.fiscalYear, startMonth), startMonth),
    [settings.fiscalYear, startMonth]
  );

  const scoped = useMemo(() => {
    if (mode === "all") return { value: base, count: (base.transactions || []).length };

    const inRange = (d?: string) => {
      const x = (d || "").slice(0, 10);
      return x >= range.startYmd && x <= range.endYmd;
    };
    const startM = range.startYmd.slice(0, 7);
    const endM = range.endYmd.slice(0, 7);
    // Records with a month ("YYYY-MM"): keep if the month is inside the fiscal year; keep undated records
    const inMonth = (m?: string) => {
      if (!m || !/^\d{4}-\d{2}/.test(m)) return true;
      const x = m.slice(0, 7);
      return x >= startM && x <= endM;
    };

    const transactions = (base.transactions || []).filter((t) => t && inRange(t.date));
    const payroll = (base.payroll || []).filter((p) => p && inMonth((p as any).month));
    const rawBudgets = (base.budgets || []).filter((b) => b && inMonth(b.period));
    const budgets = rawBudgets.map((b) => ({ ...b, spent: calculateBudgetSpentForCategory(b, transactions) }));
    const departments = base.departments || [];

    const totalIncome = calculateTotalIncome(transactions);
    const totalExpenses = calculateTotalExpenses(transactions);
    const netBalance = calculateNetOperatingResult(transactions);
    const totalLineBudgeted = calculateBudgetAllocation(rawBudgets);
    const totalDeptBudgeted = calculateBudgetAllocation([], departments);
    const totalAllocatedBudget = calculateBudgetAllocation(rawBudgets, departments);
    const totalBudgetSpent = calculateBudgetUsed(transactions, rawBudgets, undefined, departments);
    const totalBudgetRemaining = calculateBudgetRemaining(totalAllocatedBudget, totalBudgetSpent);
    const budgetUtilization = totalAllocatedBudget > 0 ? (totalBudgetSpent / totalAllocatedBudget) * 100 : 0;
    const unallocatedFunds = Math.max(0, netBalance - totalAllocatedBudget);

    return {
      count: transactions.length,
      value: {
        ...base,
        transactions,
        payroll,
        budgets,
        totalIncome,
        totalExpenses,
        netBalance,
        totalBudgeted: totalAllocatedBudget,
        totalLineBudgeted,
        totalDeptBudgeted,
        totalAllocatedBudget,
        totalBudgetSpent,
        totalBudgetRemaining,
        budgetUtilization,
        unallocatedFunds,
        totalAvailableFunds: unallocatedFunds,
        departmentMetrics: calculateDepartmentMetrics(departments, transactions, undefined, rawBudgets),
      },
    };
  }, [base, mode, range.startYmd, range.endYmd]);

  const info = useMemo(() => ({ mode, range, recordCount: scoped.count }), [mode, range, scoped.count]);

  return (
    <FiscalScopeContext.Provider value={info}>
      <FinanceContext.Provider value={scoped.value}>{children}</FinanceContext.Provider>
    </FiscalScopeContext.Provider>
  );
}
