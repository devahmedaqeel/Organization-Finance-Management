import { Feather } from "@/components/UniversalIcon";
import { screenTopPadding } from "@/utils/layout";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { BackHandler, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AreaLineChart } from "@/components/AreaLineChart";
import { DonutChart } from "@/components/DonutChart";
import { HBarChart } from "@/components/HBarChart";
import { RingProgress } from "@/components/RingProgress";
import { AllTransactionsModal } from "@/components/AllTransactionsModal";
import { useFinance } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { useRequirePermission } from "@/hooks/useRequirePermission";
import { useResponsive } from "@/hooks/useResponsive";
import {
  NormalizedPeriod,
  aggregateTransactionsByGranularity,
  getPresetPeriod,
  getPreviousPeriod,
  filterTransactionsByPeriod,
  filterTransactionsForPoint,
} from "@/services/DatePeriodService";
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetOperatingResult,
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateBudgetRemaining,
  calculateUnallocatedFunds,
  isAllCategoryBudget,
} from "@/services/FinancialCalculationEngine";
import { calculateFinancialHealth } from "@/services/financialHealthService";
import { generateFinancialInsights, ActionableInsight } from "@/services/financialInsightsService";
import { dispatchNotification } from "@/services/notificationService";

const CAT_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];

function fmt(n: number) {
  return Number(n || 0).toLocaleString();
}

const SEV_CONFIG = {
  SUCCESS:  { color: "#10B981", bg: "#10B98122", border: "#10B98144", icon: "check-circle" as const },
  WARNING:  { color: "#F59E0B", bg: "#F59E0B22", border: "#F59E0B44", icon: "alert-triangle" as const },
  INFO:     { color: "#38BDF8", bg: "#38BDF822", border: "#38BDF844", icon: "info" as const },
  CRITICAL: { color: "#F43F5E", bg: "#F43F5E22", border: "#F43F5E44", icon: "alert-octagon" as const },
};

export default function AIInsightsScreen() {
  const colors = useColors();
  // Role guard: leave if this role can't use this screen (e.g. opened via deep link)
  useRequirePermission("view_insights");
  const insets = useSafeAreaInsets();
  const { chartW, hPad } = useResponsive();
  const {
    transactions,
    budgets,
    payroll,
    departments,
    totalBudgeted: contextTotalBudgeted,
    totalBudgetSpent: contextBudgetSpent,
    totalBudgetRemaining: contextBudgetRemaining,
    budgetUtilization: contextBudgetUtilization,
    unallocatedFunds: contextUnallocatedFunds,
    totalIncome: contextTotalIncome,
    totalExpenses: contextTotalExpenses,
    netBalance: contextNetBalance,
  } = useFinance();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [allTxModal, setAllTxModal] = useState(false);
  const [txModalFilter, setTxModalFilter] = useState<"all" | "income" | "expense">("all");
  const [insightFilter, setInsightFilter] = useState<"all" | "positive" | "critical" | "advisories">("all");
  const webTop = Platform.OS === "web" ? 67 : 0;
  const chartWidth = chartW;

  // Active dynamic timeline period
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() =>
    getPresetPeriod("last_6m")
  );
  const [trendRange, setTrendRange] = useState("6M");
  const [customPeriodName, setCustomPeriodName] = useState<string | null>(null);
  const [customSelection, setCustomSelection] = useState<any>(null);
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);
  const [chartContainerWidth, setChartContainerWidth] = useState<number>(0);

  // Derive previous period for verified historical comparisons
  const previousPeriod = useMemo(() => {
    return getPreviousPeriod(activePeriod);
  }, [activePeriod]);

  // Intelligent active period auto-alignment: if default Last 6 Months has zero transactions but others exist, align to All Time
  useEffect(() => {
    if (transactions.length > 0 && activePeriod.presetId === "last_6m") {
      const txsIn6M = filterTransactionsByPeriod(transactions, activePeriod);
      if (txsIn6M.length === 0) {
        const allTimePeriod = getPresetPeriod("all_time", transactions);
        const txsInAll = filterTransactionsByPeriod(transactions, allTimePeriod);
        if (txsInAll.length > 0) {
          setActivePeriod(allTimePeriod);
          setTrendRange("ALL");
        }
      }
    }
  }, [transactions.length]);

  const handlePointSelect = (pt: any) => {
    if (selectedPoint && (selectedPoint.key === pt.key || selectedPoint.label === pt.label)) {
      setSelectedPoint(null);
    } else {
      setSelectedPoint(pt);
    }
  };

  // 1. Authoritative Financial Health Calculation
  const healthReport = useMemo(() => {
    return calculateFinancialHealth(transactions, budgets, payroll, activePeriod, previousPeriod, departments);
  }, [transactions, budgets, payroll, activePeriod, previousPeriod, departments]);

  const { hasData, healthScore, status: healthLabel, statusColor: healthColor, metrics: healthMetrics } = healthReport;

  // 2. Authoritative Actionable Insights
  const actionableInsights = useMemo(() => {
    return generateFinancialInsights(
      transactions,
      budgets,
      payroll,
      departments,
      activePeriod,
      previousPeriod,
      settings.currency || "PKR",
      user?.organizationId || "default_org"
    );
  }, [transactions, budgets, payroll, departments, activePeriod, previousPeriod, settings.currency, user?.organizationId]);

  // Dispatch critical/warning AI insight alerts & recommendations to Notification Center
  useEffect(() => {
    const orgId = user?.organizationId || "default_org";
    if (actionableInsights && actionableInsights.length > 0) {
      actionableInsights.forEach((insight) => {
        if (insight.isActionable || insight.severity === "CRITICAL" || insight.severity === "WARNING") {
          const aiNotifKey = `ai_insight_${orgId}_${insight.id}`;
          dispatchNotification(
            {
              type: insight.severity === "CRITICAL" ? "BUDGET_CRITICAL" : insight.severity === "WARNING" ? "BUDGET_WARNING" : "SYSTEM_ALERT",
              title: `AI Recommendation: ${insight.title}`,
              message: `${insight.summary} Action: ${insight.recommendedAction}`,
              severity: insight.severity === "CRITICAL" ? "CRITICAL" : insight.severity === "WARNING" ? "WARNING" : "INFO",
              actionRoute: insight.actionRoute || "/ai-insights",
              entityId: insight.id,
              idempotencyKey: aiNotifKey,
            },
            orgId,
            user?.id
          ).catch(() => {});
        }
      });
    }
  }, [actionableInsights, user?.organizationId, user?.id]);

  // Dynamic real-time chart data points
  const chartPoints = useMemo(() => {
    return aggregateTransactionsByGranularity(transactions, activePeriod);
  }, [transactions, activePeriod]);

  // Filter transactions by active period
  const periodTxs = useMemo(() => {
    return filterTransactionsByPeriod(transactions, activePeriod);
  }, [transactions, activePeriod]);

  // If a specific point/month on the chart is touched, isolate transactions to that point
  // Same transaction set the chart aggregated for that point, so totals below match the point
  const displayedTxs = useMemo(() => {
    if (selectedPoint) return filterTransactionsForPoint(periodTxs, selectedPoint);
    return periodTxs;
  }, [selectedPoint, periodTxs]);

  // ─── Authoritative Institutional Budget & Cash Metrics (Single Source of Truth) ───
  const institutionalTotalBudget = useMemo(() => {
    if (contextTotalBudgeted !== undefined && contextTotalBudgeted > 0) return contextTotalBudgeted;
    return calculateBudgetAllocation(budgets, departments);
  }, [contextTotalBudgeted, budgets, departments]);

  const institutionalBudgetSpent = useMemo(() => {
    if (contextBudgetSpent !== undefined && contextBudgetSpent > 0) return contextBudgetSpent;
    return calculateBudgetUsed(transactions, budgets, undefined, departments);
  }, [contextBudgetSpent, transactions, budgets, departments]);

  const institutionalBudgetRemaining = useMemo(() => {
    if (contextBudgetRemaining !== undefined && contextBudgetRemaining >= 0) return contextBudgetRemaining;
    return calculateBudgetRemaining(institutionalTotalBudget, institutionalBudgetSpent);
  }, [contextBudgetRemaining, institutionalTotalBudget, institutionalBudgetSpent]);

  const institutionalBudgetUtil = useMemo(() => {
    if (contextBudgetUtilization !== undefined && contextBudgetUtilization >= 0) return contextBudgetUtilization;
    return institutionalTotalBudget > 0 ? (institutionalBudgetSpent / institutionalTotalBudget) * 100 : 0;
  }, [contextBudgetUtilization, institutionalTotalBudget, institutionalBudgetSpent]);

  const institutionalTotalIncome = useMemo(() => {
    if (contextTotalIncome !== undefined && contextTotalIncome > 0) return contextTotalIncome;
    return calculateTotalIncome(transactions);
  }, [contextTotalIncome, transactions]);

  const institutionalTotalExpenses = useMemo(() => {
    if (contextTotalExpenses !== undefined && contextTotalExpenses > 0) return contextTotalExpenses;
    return calculateTotalExpenses(transactions);
  }, [contextTotalExpenses, transactions]);

  const institutionalNetCash = useMemo(() => {
    if (contextNetBalance !== undefined) return contextNetBalance;
    return institutionalTotalIncome - institutionalTotalExpenses;
  }, [contextNetBalance, institutionalTotalIncome, institutionalTotalExpenses]);

  const institutionalUnallocated = useMemo(() => {
    return Math.max(0, institutionalNetCash - institutionalTotalBudget);
  }, [institutionalNetCash, institutionalTotalBudget]);

  const totalAllocatedBudget = institutionalTotalBudget;

  // Authoritative real calculation for the displayed scope
  const displayedTxIncome = useMemo(() => calculateTotalIncome(displayedTxs), [displayedTxs]);
  const displayedIncome = useMemo(() => {
    if (selectedPoint && displayedTxs.length === 0) return 0;
    return displayedTxIncome;
  }, [selectedPoint, displayedTxs, displayedTxIncome]);

  const displayedExpense = useMemo(() => calculateTotalExpenses(displayedTxs), [displayedTxs]);
  const displayedNet = displayedIncome - displayedExpense;

  // Real operating surplus margin
  const profitMargin = displayedIncome > 0
    ? (displayedNet / displayedIncome) * 100
    : (displayedExpense > 0 ? -100 : 0);

  // Real expense burn ratio (Outflows as percentage of incoming revenue)
  const expenseRatio = displayedIncome > 0
    ? (displayedExpense / displayedIncome) * 100
    : (displayedExpense > 0 ? 100 : 0);

  const displayedSurplusPct = profitMargin;
  // Real ratio (can exceed 100% when spending outpaces inflow); the ring itself is clamped at render
  const displayedOutflowPct = Math.round(expenseRatio);

  // Consolidated unique budgets (aggregating line-item budgets and active department-level allocations)
  const consolidatedBudgets = useMemo(() => {
    const map = new Map<string, { id: string; category: string; department?: string; allocated: number; isDepartmentPool?: boolean }>();

    // 1. Ingest explicit category budgets from `budgets` collection
    budgets.forEach((b) => {
      const cat = (b.category || "General").trim();
      const dept = (b.department && b.department !== "All" && b.department !== "General") ? b.department.trim() : "All";
      const key = `${cat.toLowerCase()}:::${dept.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.allocated += Number(b.allocated || 0);
      } else {
        map.set(key, {
          id: key,
          category: cat,
          department: dept === "All" ? undefined : dept,
          allocated: Number(b.allocated || 0),
          isDepartmentPool: false,
        });
      }
    });

    // 2. Ingest department-level budget ceilings from `departments` collection
    departments.forEach((d) => {
      const dName = (d.name || "").trim();
      const dAlloc = Number(d.budgetAllocated || 0);
      if (dAlloc <= 0 || !dName) return;

      const dNameLower = dName.toLowerCase();
      let lineItemSum = 0;
      for (const item of map.values()) {
        if (item.department && item.department.toLowerCase() === dNameLower) {
          lineItemSum += item.allocated;
        }
      }

      if (lineItemSum === 0) {
        map.set(`dept:::${dNameLower}`, {
          id: `dept_${d.id || dNameLower}`,
          category: dName,
          department: dName,
          allocated: dAlloc,
          isDepartmentPool: true,
        });
      } else if (dAlloc > lineItemSum) {
        map.set(`dept_pool:::${dNameLower}`, {
          id: `dept_pool_${d.id || dNameLower}`,
          category: "General Pool",
          department: dName,
          allocated: dAlloc - lineItemSum,
          isDepartmentPool: true,
        });
      }
    });

    return Array.from(map.values());
  }, [budgets, departments]);

  // Raw budget spent matching explicitly assigned budget line-items + departments
  const rawBudgetSpent = useMemo(() => {
    return calculateBudgetUsed(displayedTxs, budgets, undefined, departments);
  }, [displayedTxs, budgets, departments]);

  // Authoritative displayed budget spent: when inspecting a single month/point, shows that point's budget spend; otherwise shows total institutional spend
  const displayedBudgetSpent = useMemo(() => {
    if (selectedPoint) return rawBudgetSpent;
    return institutionalBudgetSpent;
  }, [selectedPoint, rawBudgetSpent, institutionalBudgetSpent]);

  const displayedBudgetRemaining = useMemo(() => {
    if (selectedPoint) {
      return calculateBudgetRemaining(institutionalTotalBudget, displayedBudgetSpent);
    }
    return institutionalBudgetRemaining;
  }, [selectedPoint, institutionalTotalBudget, displayedBudgetSpent, institutionalBudgetRemaining]);

  const displayedBudgetUtil = institutionalTotalBudget > 0 ? (displayedBudgetSpent / institutionalTotalBudget) * 100 : 0;
  // Net result for the same scope as the Operating ring (period, or the inspected point)
  const authoritativeNetBalance = displayedNet;
  const unallocatedFunds = institutionalUnallocated;

  // Transaction Metrics computed strictly from displayed transactions
  const txStats = useMemo(() => {
    const totalCount = displayedTxs.length;
    const inflows = displayedTxs.filter(t => t.type === "income");
    const outflows = displayedTxs.filter(t => t.type === "expense");
    const inflowTotal = inflows.reduce((s, t) => s + Number(t.amount || 0), 0);
    const outflowTotal = outflows.reduce((s, t) => s + Number(t.amount || 0), 0);
    const netFlow = inflowTotal - outflowTotal;
    const avgTx = totalCount > 0 ? (inflowTotal + outflowTotal) / totalCount : 0;
    const avgInflow = inflows.length > 0 ? inflowTotal / inflows.length : 0;
    const avgOutflow = outflows.length > 0 ? outflowTotal / outflows.length : 0;
    
    let maxTx: any = null;
    displayedTxs.forEach(t => {
      if (!maxTx || Number(t.amount || 0) > Number(maxTx.amount || 0)) maxTx = t;
    });

    return {
      totalCount,
      inflowCount: inflows.length,
      outflowCount: outflows.length,
      inflowTotal,
      outflowTotal,
      netFlow,
      avgTx,
      avgInflow,
      avgOutflow,
      maxTx,
    };
  }, [displayedTxs]);

  // Expense by category computed from displayed transactions
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    displayedTxs.filter(t => t.type === "expense").forEach(t => {
      map[t.category] = (map[t.category] ?? 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([label, value], i) => ({ label, value, color: CAT_COLORS[i] }));
  }, [displayedTxs]);

  // Department spending computed from displayed transactions
  const deptSpend = useMemo(() => {
    const map: Record<string, number> = {};
    displayedTxs.filter(t => t.type === "expense").forEach(t => {
      const dept = t.department || "General";
      map[dept] = (map[dept] ?? 0) + t.amount;
    });
    const totalDept = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map).sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => {
        const pct = totalDept > 0 ? ((value / totalDept) * 100).toFixed(1) : "0.0";
        return {
          label,
          value,
          color: CAT_COLORS[i % CAT_COLORS.length],
          sublabel: `${pct}% of departmental outflows`,
        };
      });
  }, [displayedTxs]);

  // Budget bar items computed from displayed transactions and consolidated budgets, sorted by active spend
  const budgetItems = useMemo(() => {
    const targetTxs = selectedPoint ? displayedTxs : (displayedTxs.length > 0 ? displayedTxs : transactions);
    return consolidatedBudgets
      .map((b) => {
        const spent = targetTxs
          .filter((t) => {
            if (!t || t.type !== "expense" || Number(t.amount || 0) <= 0) return false;
            if (t.status === "failed" || (t as any).status === "deleted" || (t as any).status === "void" || (t as any).status === "cancelled") return false;

            const tDept = (t.department || "").trim().toLowerCase();
            const bDept = (b.department || "").trim().toLowerCase();
            const tCat = (t.category || "").trim().toLowerCase();
            const bCat = (b.category || "").trim().toLowerCase();

            if (b.isDepartmentPool) {
              return bDept.length > 0 && tDept === bDept;
            }

            const deptMatch = !bDept || bDept === "all" || !tDept || tDept === "all" || tDept === bDept;
            const isAllCat = isAllCategoryBudget(b.category);
            const catMatch = isAllCat || (bCat.length > 0 && (
              tCat === bCat ||
              (tCat === "salaries" && bCat === "payroll") ||
              (tCat === "payroll" && bCat === "salaries")
            ));

            return deptMatch && catMatch;
          })
          .reduce((s, t) => s + Number(t.amount || 0), 0);

        const label = b.isDepartmentPool
          ? (b.department || b.category)
          : (b.department && b.department !== "All" && b.department !== "General"
              ? `${b.category} · ${b.department}`
              : b.category);

        return {
          label,
          value: spent,
          color: b.allocated > 0 && (spent / b.allocated) > 0.85
            ? "#F43F5E"
            : b.allocated > 0 && (spent / b.allocated) > 0.6
            ? "#F59E0B"
            : "#10B981",
          sublabel: `Budget: ${settings.currency} ${fmt(b.allocated)}`,
        };
      })
      .sort((a, b) => b.value - a.value || (a.label || "").localeCompare(b.label || ""));
  }, [consolidatedBudgets, selectedPoint, displayedTxs, transactions, settings.currency]);

  // Real-time period growth and margin computed directly from active chart timeline data
  const { periodGrowth, periodGrowthLabel } = useMemo(() => {
    const activeInc = selectedPoint
      ? Number(selectedPoint.income || 0)
      : chartPoints.reduce((s, p) => s + Number(p.income || 0), 0);
    const activeExp = selectedPoint
      ? Number(selectedPoint.expense || 0)
      : chartPoints.reduce((s, p) => s + Number(p.expense || 0), 0);
    const activeNet = activeInc - activeExp;

    if (activeInc === 0 && activeExp === 0) {
      return { periodGrowth: 0, periodGrowthLabel: "0.0% Balanced" };
    }

    if (activeInc > 0) {
      const margin = (activeNet / activeInc) * 100;
      const label = margin >= 0
        ? `+${margin.toFixed(1)}% Surplus`
        : `${margin.toFixed(1)}% Deficit`;
      return {
        periodGrowth: margin,
        periodGrowthLabel: label,
      };
    }

    return {
      periodGrowth: -100,
      periodGrowthLabel: "-100% Deficit",
    };
  }, [chartPoints, selectedPoint]);

  // Dynamic MoM growth computed from active sorted monthly ledger
  const { incomeGrowth, hasMoMComparison, lastMonthLabel, prevMonthLabel } = useMemo(() => {
    const monthlyNet: Record<string, { inc: number; exp: number; net: number }> = {};
    transactions.forEach(t => {
      const m = t.date?.substring(0, 7);
      if (m) {
        if (!monthlyNet[m]) monthlyNet[m] = { inc: 0, exp: 0, net: 0 };
        if (t.type === "income") monthlyNet[m].inc += t.amount;
        else monthlyNet[m].exp += t.amount;
        monthlyNet[m].net = monthlyNet[m].inc - monthlyNet[m].exp;
      }
    });
    const sortedMonths = Object.keys(monthlyNet).sort();
    if (sortedMonths.length >= 2) {
      const latestKey = sortedMonths[sortedMonths.length - 1];
      const prevKey = sortedMonths[sortedMonths.length - 2];
      const lastVal = monthlyNet[latestKey].inc;
      const prevVal = monthlyNet[prevKey].inc;
      const growth = prevVal > 0 ? ((lastVal - prevVal) / prevVal) * 100 : lastVal > 0 ? 100 : 0;
      
      const formatMonthName = (key: string) => {
        const [y, m] = key.split("-");
        const date = new Date(Number(y), Number(m) - 1, 1);
        return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      };
      
      return {
        incomeGrowth: growth,
        hasMoMComparison: true,
        lastMonthLabel: formatMonthName(latestKey),
        prevMonthLabel: formatMonthName(prevKey),
      };
    }
    return { incomeGrowth: 0, hasMoMComparison: false, lastMonthLabel: "", prevMonthLabel: "" };
  }, [transactions]);

  // Payroll
  const totalPayroll = payroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0);
  const avgSalary = payroll.length > 0 ? payroll.reduce((s, p) => s + (p.baseSalary || 0), 0) / payroll.length : 0;

  const positiveCount = useMemo(
    () => actionableInsights.filter(i => i.severity === "SUCCESS").length,
    [actionableInsights]
  );
  const criticalCount = useMemo(
    () => actionableInsights.filter(i => i.severity === "CRITICAL").length,
    [actionableInsights]
  );
  const advisoryCount = useMemo(
    () => actionableInsights.filter(i => i.severity === "WARNING" || i.severity === "INFO").length,
    [actionableInsights]
  );

  const displayedInsights = useMemo(() => {
    if (insightFilter === "positive") return actionableInsights.filter(i => i.severity === "SUCCESS");
    if (insightFilter === "critical") return actionableInsights.filter(i => i.severity === "CRITICAL");
    if (insightFilter === "advisories") return actionableInsights.filter(i => i.severity === "WARNING" || i.severity === "INFO");
    return actionableInsights;
  }, [actionableInsights, insightFilter]);

  useEffect(() => {
    const onBackPress = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, []);

  const handleGoBack = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  // ─── Presentation helpers (colours/labels only; no data logic) ───
  const isIdle = displayedIncome === 0 && displayedExpense === 0;
  const surplusTone = isIdle ? "#64748B" : displayedSurplusPct >= 20 ? "#10B981" : displayedSurplusPct >= 0 ? "#0EA5E9" : "#F43F5E";
  const budgetTone = displayedBudgetUtil === 0 ? "#64748B" : displayedBudgetUtil <= 75 ? "#3B82F6" : displayedBudgetUtil <= 95 ? "#F59E0B" : "#F43F5E";
  const outflowTone = displayedOutflowPct === 0 ? "#64748B" : displayedOutflowPct <= 40 ? "#8B5CF6" : displayedOutflowPct <= 75 ? "#F59E0B" : "#F43F5E";
  const fmtPct = (v: number) => `${v < 10 && v > 0 ? v.toFixed(1) : v.toFixed(0)}%`;
  const scopeLabel = selectedPoint ? (selectedPoint.fullDate || selectedPoint.label) : activePeriod.label;
  const SEV_LABEL: Record<string, string> = { SUCCESS: "Positive", WARNING: "Warning", INFO: "Info", CRITICAL: "Critical" };

  const healthStats = [
    { label: "Allocated budget", value: `${settings.currency} ${fmt(institutionalTotalBudget)}`, color: "#0EA5E9" },
    { label: "Budget spent", value: `${settings.currency} ${fmt(institutionalBudgetSpent)}`, color: "#F43F5E" },
    {
      label: "Remaining budget",
      value: `${settings.currency} ${fmt(institutionalBudgetRemaining)}`,
      color: institutionalBudgetRemaining > 0 ? "#10B981" : "#F43F5E",
    },
    {
      label: "Budget used",
      value: institutionalTotalBudget > 0 ? fmtPct(institutionalBudgetUtil) : "0%",
      color: institutionalTotalBudget > 0
        ? (institutionalBudgetUtil <= 75 ? "#10B981" : institutionalBudgetUtil <= 100 ? "#F59E0B" : "#F43F5E")
        : "#94A3B8",
    },
    {
      label: "Net cash (all time)",
      value: `${institutionalNetCash >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(institutionalNetCash))}`,
      color: institutionalNetCash >= 0 ? "#10B981" : "#F43F5E",
    },
    {
      label: "Unallocated",
      value: `${settings.currency} ${fmt(institutionalUnallocated)}`,
      color: institutionalUnallocated > 0 ? "#10B981" : "#F59E0B",
    },
  ];

  const insightFilters = [
    { key: "all" as const, label: "All", count: actionableInsights.length, color: "#3B82F6", icon: "layers" },
    { key: "critical" as const, label: "Critical", count: criticalCount, color: "#F43F5E", icon: "alert-octagon" },
    { key: "advisories" as const, label: "Advisories", count: advisoryCount, color: "#F59E0B", icon: "alert-triangle" },
    { key: "positive" as const, label: "Positive", count: positiveCount, color: "#10B981", icon: "check-circle" },
  ];
  const activeFilterLabel = insightFilters.find((f) => f.key === insightFilter)?.label ?? "All";

  const keyMetrics = [
    {
      key: "operating",
      tone: surplusTone,
      percentage: isIdle ? 0 : Math.min(Math.abs(displayedSurplusPct), 100),
      center: `${displayedSurplusPct >= 0 ? "+" : "-"}${Math.abs(displayedSurplusPct).toFixed(0)}%`,
      ringLabel: "Operating",
      ringSub: displayedSurplusPct >= 0 ? "SURPLUS" : "DEFICIT",
      status: isIdle
        ? "No activity"
        : displayedSurplusPct >= 25
        ? "Healthy surplus"
        : displayedSurplusPct > 0
        ? "Surplus margin"
        : displayedSurplusPct === 0
        ? "Balanced"
        : "Operating deficit",
      value: `${authoritativeNetBalance >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(authoritativeNetBalance))}`,
      caption: "Net result",
    },
    {
      key: "budget",
      tone: budgetTone,
      percentage: Math.min(displayedBudgetUtil, 100),
      center: fmtPct(displayedBudgetUtil),
      ringLabel: "Budget",
      ringSub: "UTILIZED",
      status: displayedBudgetUtil === 0
        ? "Unspent"
        : displayedBudgetUtil <= 75
        ? "On track"
        : displayedBudgetUtil <= 95
        ? "Near limit"
        : "Over budget",
      value: `${settings.currency} ${fmt(displayedBudgetSpent)} of ${fmt(totalAllocatedBudget)}`,
      caption: `${settings.currency} ${fmt(displayedBudgetRemaining)} left`,
    },
    {
      key: "outflow",
      tone: outflowTone,
      percentage: Math.min(displayedOutflowPct, 100),
      center: `${displayedOutflowPct}%`,
      ringLabel: "Outflow",
      ringSub: "BURN RATE",
      status: displayedOutflowPct === 0
        ? "Zero outflow"
        : displayedOutflowPct <= 25
        ? "Low burn (safe)"
        : displayedOutflowPct <= 60
        ? "Optimal burn"
        : displayedOutflowPct <= 85
        ? "Moderate outflow"
        : displayedOutflowPct <= 100
        ? "High burn alert"
        : "Exceeds inflow",
      value: `${settings.currency} ${fmt(displayedExpense)} of ${fmt(displayedIncome)}`,
      caption: "Spent of inflow",
    },
  ];

  const txTiles = [
    {
      key: "in",
      icon: "arrow-down-left",
      color: colors.income,
      action: "View",
      label: `Inflows (${txStats.inflowCount})`,
      value: `+${settings.currency} ${fmt(txStats.inflowTotal)}`,
      caption: txStats.inflowCount > 0 ? `Avg ${settings.currency} ${fmt(Math.round(txStats.avgInflow))}` : "No inflows",
      onPress: () => { setTxModalFilter("income"); setAllTxModal(true); },
    },
    {
      key: "out",
      icon: "arrow-up-right",
      color: colors.expense,
      action: "View",
      label: `Outflows (${txStats.outflowCount})`,
      value: `-${settings.currency} ${fmt(txStats.outflowTotal)}`,
      caption: txStats.outflowCount > 0 ? `Avg ${settings.currency} ${fmt(Math.round(txStats.avgOutflow))}` : "No outflows",
      onPress: () => { setTxModalFilter("expense"); setAllTxModal(true); },
    },
    {
      key: "net",
      icon: "activity",
      color: txStats.netFlow >= 0 ? colors.income : colors.expense,
      action: txStats.netFlow >= 0 ? "Surplus" : "Deficit",
      label: "Net cash flow",
      value: `${txStats.netFlow >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(txStats.netFlow))}`,
      caption: `Avg ticket ${settings.currency} ${fmt(Math.round(txStats.avgTx))}`,
      onPress: () => { setTxModalFilter("all"); setAllTxModal(true); },
    },
    {
      key: "max",
      icon: "award",
      color: "#F59E0B",
      action: txStats.maxTx ? (txStats.maxTx.type === "expense" ? "Outflow" : "Inflow") : "",
      label: "Largest transaction",
      value: txStats.maxTx ? `${settings.currency} ${fmt(txStats.maxTx.amount)}` : "None",
      caption: txStats.maxTx ? `${txStats.maxTx.category || txStats.maxTx.title || "Transaction"}` : "No records",
      onPress: () => { setTxModalFilter(txStats.maxTx?.type === "expense" ? "expense" : "income"); setAllTxModal(true); },
    },
  ];

  const tint = (c: string) => c + (colors.isDark ? "26" : "14");

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Fixed Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: webTop + screenTopPadding(insets.top),
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={handleGoBack}
            style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            accessibilityLabel="Go back"
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.titleRow}>
            <View style={[styles.aiIcon, { backgroundColor: tint("#10B981") }]}>
              <Feather name="zap" size={17} color="#10B981" />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>AI Insights</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                {settings.organizationName || "Smart Financial Intelligence"}
              </Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: 16, paddingBottom: Math.max(insets.bottom, 16) + 60, paddingHorizontal: hPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Health Score ─── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.healthRow}>
            <RingProgress
              percentage={healthScore ?? 0}
              centerLabel={healthScore !== null ? `${healthScore}%` : "N/A"}
              size={112}
              strokeWidth={10}
              color={healthColor}
              label={hasData ? healthLabel : "NO DATA"}
              sublabel={!hasData ? "INACTIVE" : healthScore! >= 80 ? "Optimal" : healthScore! >= 60 ? "Stable" : "Watch"}
            />
            <View style={styles.healthRight}>
              <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>FINANCIAL HEALTH</Text>
              <Text style={[styles.healthScore, { color: healthColor }]}>
                {healthScore !== null ? (
                  <>
                    {healthScore}
                    <Text style={[styles.healthScoreMax, { color: colors.mutedForeground }]}> / 100</Text>
                  </>
                ) : (
                  "N/A"
                )}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: tint(healthColor) }]}>
                <View style={[styles.statusDot, { backgroundColor: healthColor }]} />
                <Text style={[styles.statusPillText, { color: healthColor }]} numberOfLines={1}>
                  {hasData ? healthLabel : "No financial data"}
                </Text>
              </View>
              <Text style={[styles.healthPeriod, { color: colors.mutedForeground }]} numberOfLines={1}>
                {activePeriod.label}
              </Text>
            </View>
          </View>

          <View style={styles.statGrid}>
            {healthStats.map((s) => (
              <View key={s.label} style={[styles.statTile, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.statTileLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{s.label}</Text>
                <Text
                  style={[styles.statTileValue, { color: s.color }]}
                  numberOfLines={Platform.OS === "web" ? undefined : 1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {s.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ─── Financial Trend ─── */}
        <View
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 40 && Math.abs(w - chartContainerWidth) > 2) {
              setChartContainerWidth(w);
            }
          }}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Financial Trend</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                Income vs expenses · {activePeriod.label}
              </Text>
            </View>
            <View style={[styles.growthBadge, { backgroundColor: tint(periodGrowth >= 0 ? "#10B981" : "#F43F5E") }]}>
              <Feather name={periodGrowth >= 0 ? "trending-up" : "trending-down"} size={13} color={periodGrowth >= 0 ? "#10B981" : "#F43F5E"} />
              <Text style={[styles.growthText, { color: periodGrowth >= 0 ? "#10B981" : "#F43F5E" }]}>{periodGrowthLabel}</Text>
            </View>
          </View>

          {selectedPoint && (
            <View style={[styles.inspectBanner, { backgroundColor: tint(colors.primary), borderColor: colors.primary + "40" }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[styles.inspectTitle, { color: colors.foreground }]} numberOfLines={1}>
                  Inspecting <Text style={{ color: colors.primary }}>{selectedPoint.fullDate || selectedPoint.label}</Text>
                </Text>
                <Text style={[styles.inspectSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  In {settings.currency} {fmt(displayedIncome)} · Out {settings.currency} {fmt(displayedExpense)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedPoint(null)}
                style={[styles.inspectClear, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
              >
                <Feather name="x" size={13} color="#FFFFFF" />
                <Text style={styles.inspectClearText}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          <AreaLineChart
            data={chartPoints}
            width={chartContainerWidth > 40 ? chartContainerWidth - 34 : chartWidth - 34}
            height={170}
            currency={settings.currency}
            activeRange={customSelection ? undefined : trendRange}
            activePeriod={activePeriod}
            onPointSelect={handlePointSelect}
            onPeriodSelect={(p) => {
              setActivePeriod(p);
              setCustomPeriodName(p.label);
              setSelectedPoint(null);
            }}
            onGranularityChange={(g) => {
              setActivePeriod((prev) => ({
                ...prev,
                userGranularityOverride: g,
              }));
            }}
            onRangeSelect={(range) => {
              setTrendRange(range);
              setCustomPeriodName(null);
              setCustomSelection(null);
              setSelectedPoint(null);
            }}
            onCustomDateSelect={(selection) => {
              setCustomSelection(selection);
              if (selection.presetName) setCustomPeriodName(selection.presetName);
              setSelectedPoint(null);
            }}
            ranges={["1W", "2W", "1M", "3M", "6M", "1Y", "ALL"]}
            transactions={transactions}
            userId={user?.id || "default"}
          />
        </View>

        {/* ─── Key Metrics (3 rings) ─── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Key Metrics</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {selectedPoint ? `Inspecting ${scopeLabel}` : `Performance indicators · ${activePeriod.label}`}
              </Text>
            </View>
            {selectedPoint && (
              <TouchableOpacity
                style={[styles.smBtn, { borderColor: colors.primary + "40", backgroundColor: tint(colors.primary) }]}
                onPress={() => setSelectedPoint(null)}
              >
                <Text style={[styles.smBtnText, { color: colors.primary }]}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.ringsRow}>
            {keyMetrics.map((m) => (
              <View key={m.key} style={styles.ringItem}>
                <RingProgress
                  percentage={m.percentage}
                  centerLabel={m.center}
                  size={94}
                  strokeWidth={9}
                  color={m.tone}
                  label={m.ringLabel}
                  sublabel={m.ringSub}
                />
                <View style={[styles.ringStatusPill, { backgroundColor: tint(m.tone) }]}>
                  <Text style={[styles.ringStatusText, { color: m.tone }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {m.status}
                  </Text>
                </View>
                <Text
                  style={[styles.ringValue, { color: colors.foreground }]}
                  numberOfLines={Platform.OS === "web" ? undefined : 2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {m.value}
                </Text>
                <Text style={[styles.ringCaption, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {m.caption}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ─── Expense Breakdown ─── */}
        {displayedExpense > 0 && expenseByCategory.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Expense Breakdown</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {selectedPoint ? `Spending in ${scopeLabel}` : `Where your money goes · ${activePeriod.label}`}
              </Text>
            </View>
            <DonutChart
              segments={expenseByCategory}
              size={140}
              strokeWidth={12}
              currency={settings.currency}
              centerLabel={`${settings.currency} ${fmt(displayedExpense)}`}
              centerSub="total spent"
            />
          </View>
        ) : selectedPoint ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Expense Breakdown</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>Spending in {scopeLabel}</Text>
            </View>
            <View style={styles.emptyInline}>
              <View style={[styles.emptyIcon, { backgroundColor: tint("#10B981") }]}>
                <Feather name="check-circle" size={20} color="#10B981" />
              </View>
              <Text style={[styles.emptyInlineText, { color: colors.mutedForeground }]}>
                No expenses recorded in this period.
              </Text>
            </View>
          </View>
        ) : null}

        {/* ─── Department Spending ─── */}
        {deptSpend.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderText}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Department Spending</Text>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {selectedPoint ? `Spending in ${scopeLabel}` : "Expenses by department"}
                </Text>
              </View>
              <TouchableOpacity style={[styles.smBtn, { borderColor: colors.border }]} onPress={() => router.push("/departments")}>
                <Text style={[styles.smBtnText, { color: colors.primary }]}>Details</Text>
                <Feather name="chevron-right" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <HBarChart items={deptSpend} formatValue={(v) => `${settings.currency} ${fmt(v)}`} />
          </View>
        )}

        {/* ─── Budget vs Actual ─── */}
        {budgetItems.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderText}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Budget vs Actual</Text>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {selectedPoint ? `Spending during ${scopeLabel}` : "Spending per budget line"}
                </Text>
              </View>
              <TouchableOpacity style={[styles.smBtn, { borderColor: colors.border }]} onPress={() => router.push("/budget")}>
                <Text style={[styles.smBtnText, { color: colors.primary }]}>Manage</Text>
                <Feather name="chevron-right" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <HBarChart items={budgetItems} formatValue={(v) => `${settings.currency} ${fmt(v)}`} />
            <View style={styles.budgetSummaryRow}>
              {[
                { label: "Allocated", value: `${settings.currency} ${fmt(institutionalTotalBudget)}`, color: colors.primary },
                { label: selectedPoint ? `Spent (${selectedPoint.label})` : "Spent", value: `${settings.currency} ${fmt(displayedBudgetSpent)}`, color: colors.expense },
                { label: "Remaining", value: `${settings.currency} ${fmt(displayedBudgetRemaining)}`, color: colors.income },
              ].map((s) => (
                <View key={s.label} style={[styles.budgetSumCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.budgetSumLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{s.label}</Text>
                  <Text
                    style={[styles.budgetSumValue, { color: s.color }]}
                    numberOfLines={Platform.OS === "web" ? undefined : 1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {s.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ─── Transactions overview ─── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Transactions</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={2}>
                {txStats.totalCount} records · {txStats.inflowCount} in · {txStats.outflowCount} out
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.smBtn, { borderColor: colors.primary + "40", backgroundColor: tint(colors.primary) }]}
              onPress={() => {
                setTxModalFilter("all");
                setAllTxModal(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.smBtnText, { color: colors.primary }]}>View all</Text>
              <Feather name="chevron-right" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.txStatsGrid}>
            {txTiles.map((tile) => (
              <TouchableOpacity
                key={tile.key}
                style={[styles.txStatBox, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={tile.onPress}
                activeOpacity={0.75}
              >
                <View style={styles.txStatTop}>
                  <View style={[styles.txStatIcon, { backgroundColor: tint(tile.color) }]}>
                    <Feather name={tile.icon as any} size={15} color={tile.color} />
                  </View>
                  {tile.action ? (
                    <Text style={[styles.txStatAction, { color: tile.color }]} numberOfLines={1}>{tile.action}</Text>
                  ) : null}
                </View>
                <Text style={[styles.txStatLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{tile.label}</Text>
                <Text
                  style={[styles.txStatVal, { color: tile.color }]}
                  numberOfLines={Platform.OS === "web" ? undefined : 1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {tile.value}
                </Text>
                <Text style={[styles.txStatCaption, { color: colors.mutedForeground }]} numberOfLines={1}>{tile.caption}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ─── AI Insight Cards ─── */}
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Actionable Insights</Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              {displayedInsights.length} {displayedInsights.length === 1 ? "insight" : "insights"}
              {insightFilter !== "all" ? ` · ${activeFilterLabel} only` : ""}
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {insightFilters.map((f) => {
            const active = insightFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? f.color : colors.card,
                    borderColor: active ? f.color : colors.border,
                  },
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                  setInsightFilter((cur) => (cur === f.key && f.key !== "all" ? "all" : f.key));
                }}
                activeOpacity={0.8}
              >
                <Feather name={f.icon as any} size={13} color={active ? "#FFFFFF" : f.color} />
                <Text style={[styles.filterChipText, { color: active ? "#FFFFFF" : colors.foreground }]}>{f.label}</Text>
                <View style={[styles.filterCount, { backgroundColor: active ? "rgba(255,255,255,0.25)" : tint(f.color) }]}>
                  <Text style={[styles.filterCountText, { color: active ? "#FFFFFF" : f.color }]}>{f.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {displayedInsights.length === 0 ? (
          <View style={[styles.card, styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: tint(hasData ? "#10B981" : "#94A3B8") }]}>
              <Feather name={hasData ? "check-circle" : "info"} size={22} color={hasData ? "#10B981" : "#94A3B8"} />
            </View>
            <Text style={[styles.emptyCardText, { color: colors.foreground }]}>
              {!hasData
                ? "More financial data is required to generate meaningful insights. Add income, expenses, or budgets to activate real-time intelligence."
                : insightFilter === "critical"
                ? "No critical alerts found in this period."
                : insightFilter === "advisories"
                ? "No warnings or advisories found in this period."
                : insightFilter === "positive"
                ? "No positive insights recorded in this period."
                : "No anomalies or critical alerts detected. All financial metrics are within standard operational limits."}
            </Text>
          </View>
        ) : (
          displayedInsights.map((insight) => {
            const conf = SEV_CONFIG[insight.severity] || SEV_CONFIG.INFO;
            return (
              <TouchableOpacity
                key={insight.id}
                style={[styles.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  if (insight.actionRoute) router.push(insight.actionRoute as any);
                }}
                activeOpacity={insight.actionRoute ? 0.85 : 1}
              >
                <View style={[styles.insightAccent, { backgroundColor: conf.color }]} pointerEvents="none" />

                <View style={styles.insightHeader}>
                  <View style={[styles.insightIcon, { backgroundColor: tint(conf.color) }]}>
                    <Feather name={conf.icon} size={17} color={conf.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <View style={styles.insightTitleRow}>
                      <Text style={[styles.insightTitle, { color: colors.foreground }]}>{insight.title}</Text>
                      <View style={[styles.typeBadge, { backgroundColor: tint(conf.color) }]}>
                        <Text style={[styles.typeBadgeText, { color: conf.color }]}>{SEV_LABEL[insight.severity] ?? insight.severity}</Text>
                      </View>
                    </View>
                    {insight.metric ? (
                      <View style={styles.metricRow}>
                        <View style={[styles.metricChip, { backgroundColor: tint(conf.color) }]}>
                          <Text style={[styles.metricChipText, { color: conf.color }]}>{insight.metric}</Text>
                        </View>
                        {insight.sourceReference ? (
                          <Text style={[styles.metricSource, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {insight.sourceReference}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>

                <Text style={[styles.insightDetail, { color: colors.foreground }]}>
                  {insight.summary || (insight as any).description}
                </Text>

                {insight.whyItMatters ? (
                  <View style={[styles.whyBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.whyTitle, { color: colors.mutedForeground }]}>WHY THIS MATTERS</Text>
                    <Text style={[styles.whyText, { color: colors.foreground }]}>{insight.whyItMatters}</Text>
                  </View>
                ) : null}

                {insight.isActionable && (
                  <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
                    <Feather name="corner-down-right" size={15} color={conf.color} style={{ marginTop: 1 }} />
                    <Text style={[styles.actionText, { color: colors.foreground }]}>{insight.recommendedAction}</Text>
                    {insight.actionRoute && (
                      <View style={[styles.resolveBtn, { backgroundColor: colors.primary }]}>
                        <Text style={styles.resolveText}>Resolve</Text>
                        <Feather name="arrow-right" size={13} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        {/* Disclaimer */}
        <View style={[styles.disclaimerBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="cpu" size={15} color={colors.mutedForeground} />
          <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
            Insights are generated from your financial data using rule-based analytics. Data refreshes as you add records.
          </Text>
        </View>

        <AllTransactionsModal
          visible={allTxModal}
          onClose={() => setAllTxModal(false)}
          transactions={displayedTxs}
          initialFilter={txModalFilter}
          title={selectedPoint ? `Transactions in ${selectedPoint.label}` : `Transactions · ${activePeriod.label}`}
          subtitle={`${displayedTxs.length} Records (${txStats.inflowCount} Inflows, ${txStats.outflowCount} Outflows) · Net: ${txStats.netFlow >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(txStats.netFlow))}`}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  container: { paddingHorizontal: 16, gap: 16 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  aiIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  cardSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  cardHeaderText: { flex: 1, minWidth: 0 },

  // Health score
  healthRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  healthRight: { flex: 1, minWidth: 0, gap: 6, alignItems: "flex-start" },
  eyebrow: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  healthScore: { fontSize: 36, fontFamily: "Inter_800ExtraBold", letterSpacing: -1, lineHeight: 44 },
  healthScoreMax: { fontSize: 16, fontFamily: "Inter_500Medium", letterSpacing: 0 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, maxWidth: "100%" },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusPillText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  healthPeriod: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  statTile: { width: "48.5%", borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  statTileLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  statTileValue: { fontSize: 15, fontFamily: "Inter_700Bold" },

  // Trend
  growthBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 14, flexShrink: 0 },
  growthText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  inspectBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  inspectTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  inspectSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  inspectClear: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 15, flexShrink: 0 },
  inspectClearText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Key metric rings
  ringsRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  ringItem: { flex: 1, minWidth: 0, alignItems: "center", gap: 8 },
  ringStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, maxWidth: "100%" },
  ringStatusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  ringValue: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 17 },
  ringCaption: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: -4 },

  smBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 12, paddingRight: 9, height: 30, borderRadius: 15, borderWidth: 1, flexShrink: 0 },
  smBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  emptyInline: { alignItems: "center", gap: 10, paddingVertical: 12 },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emptyInlineText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  budgetSummaryRow: { flexDirection: "row", gap: 8 },
  budgetSumCard: { flex: 1, minWidth: 0, borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center", gap: 4 },
  budgetSumValue: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "center" },
  budgetSumLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },

  // Transactions tiles
  txStatsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  txStatBox: { width: "48.5%", padding: 12, borderRadius: 14, borderWidth: 1, gap: 4 },
  txStatTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 6 },
  txStatIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txStatAction: { fontSize: 12, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  txStatLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  txStatVal: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  txStatCaption: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Insights
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", marginTop: 4, marginBottom: -6 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 12, paddingRight: 6, height: 36, borderRadius: 18, borderWidth: 1 },
  filterChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filterCount: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  filterCountText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  emptyCard: { alignItems: "center", paddingVertical: 24 },
  emptyCardText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center" },

  insightCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    paddingLeft: 20,
    gap: 12,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1.5,
  },
  insightAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  insightHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  insightIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  insightTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  insightTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20, letterSpacing: -0.1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexShrink: 0, marginTop: 1 },
  typeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  metricRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metricChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  metricChipText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  metricSource: { fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 1 },
  insightDetail: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  whyBox: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
  whyTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  whyText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, opacity: 0.85 },
  actionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderTopWidth: 1, paddingTop: 12 },
  actionText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  resolveBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 30, borderRadius: 15, flexShrink: 0 },
  resolveText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  disclaimerBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  disclaimerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
});
