import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  useWindowDimensions,
  Platform,
} from "react-native";
import {
  SvgZap,
  SvgCheckCircle,
  SvgAlertTriangle,
  SvgAlertOctagon,
  SvgInfo,
  SvgTrendingUp,
  SvgTrendingDown,
  SvgArrowDownLeft,
  SvgArrowUpRight,
  SvgActivity,
  SvgAward,
  SvgCpu,
} from "@/components/web/SvgIcons";
import { useFinance } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { AreaLineChart } from "@/components/AreaLineChart";
import { DonutChart } from "@/components/DonutChart";
import { HBarChart } from "@/components/HBarChart";
import { RingProgress } from "@/components/RingProgress";
import { AllTransactionsModal } from "@/components/AllTransactionsModal";
import {
  NormalizedPeriod,
  aggregateTransactionsByGranularity,
  getPresetPeriod,
  filterTransactionsByPeriod,
} from "@/services/DatePeriodService";
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateBudgetRemaining,
} from "@/services/FinancialCalculationEngine";
import { calculateFinancialHealth } from "@/services/financialHealthService";
import { generateFinancialInsights } from "@/services/financialInsightsService";

const CAT_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];

const SEV_CONFIG = {
  SUCCESS:  { color: "#10B981", bg: "#10B98122", border: "#10B98144", Icon: SvgCheckCircle },
  WARNING:  { color: "#F59E0B", bg: "#F59E0B22", border: "#F59E0B44", Icon: SvgAlertTriangle },
  INFO:     { color: "#38BDF8", bg: "#38BDF822", border: "#38BDF844", Icon: SvgInfo },
  CRITICAL: { color: "#F43F5E", bg: "#F43F5E22", border: "#F43F5E44", Icon: SvgAlertOctagon },
};

function fmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return Number(n || 0).toLocaleString();
}

interface WebAIInsightsProps {
  onNavigate?: (route: string) => void;
}

export function WebAIInsights({ onNavigate }: WebAIInsightsProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isWide = width >= 992;

  const { user } = useAuth();
  const { settings } = useSettings();
  const { transactions, budgets, payroll, departments } = useFinance();
  const [allTxModal, setAllTxModal] = useState(false);
  const [txModalFilter, setTxModalFilter] = useState<"all" | "income" | "expense">("all");
  const [insightFilter, setInsightFilter] = useState<"all" | "positive" | "critical" | "advisories">("all");

  // Active dynamic timeline period
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() =>
    getPresetPeriod("last_6m")
  );
  const [trendRange, setTrendRange] = useState("6M");
  const [customPeriodName, setCustomPeriodName] = useState<string | null>(null);
  const [customSelection, setCustomSelection] = useState<any>(null);
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);

  // 1. Authoritative Financial Health Calculation
  const healthReport = useMemo(() => {
    return calculateFinancialHealth(transactions, budgets, payroll, activePeriod);
  }, [transactions, budgets, payroll, activePeriod]);

  const { hasData, healthScore, status: healthLabel, statusColor: healthColor } = healthReport;

  // 2. Authoritative Actionable Insights
  const actionableInsights = useMemo(() => {
    return generateFinancialInsights(
      transactions,
      budgets,
      payroll,
      departments,
      activePeriod,
      undefined,
      settings.currency || "PKR",
      user?.organizationId || "default_org"
    );
  }, [transactions, budgets, payroll, departments, activePeriod, settings.currency, user?.organizationId]);

  // Dynamic real-time chart data points
  const chartPoints = useMemo(() => {
    return aggregateTransactionsByGranularity(transactions, activePeriod);
  }, [transactions, activePeriod]);

  // Filter transactions by active period
  const periodTxs = useMemo(() => {
    return filterTransactionsByPeriod(transactions, activePeriod);
  }, [transactions, activePeriod]);

  // If a specific point/month on the chart is touched, isolate transactions to that point
  const displayedTxs = useMemo(() => {
    if (selectedPoint) {
      const key = selectedPoint.key;
      if (key) {
        return transactions.filter((t) => (t.date || "").startsWith(key));
      }
      if (selectedPoint.fullDate) {
        return periodTxs.filter((t) => {
          const tDate = new Date(t.date);
          const tMonthStr = tDate.toLocaleDateString("en-US", { month: "short" });
          return selectedPoint.label === tMonthStr;
        });
      }
    }
    return periodTxs;
  }, [selectedPoint, transactions, periodTxs]);

  // Budget allocations & displayed spend
  const totalAllocatedBudget = useMemo(() => calculateBudgetAllocation(budgets), [budgets]);

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

  // Real expense burn ratio (Outflows as percentage of total funding)
  const expenseRatio = displayedIncome > 0
    ? (displayedExpense / displayedIncome) * 100
    : (displayedExpense > 0 ? 100 : 0);

  // Consolidated unique budgets (aggregating multiple allocations for the same category & department)
  const consolidatedBudgets = useMemo(() => {
    const map = new Map<string, { id: string; category: string; department?: string; allocated: number }>();
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
        });
      }
    });
    return Array.from(map.values());
  }, [budgets]);

  const displayedBudgetSpent = useMemo(() => {
    return calculateBudgetUsed(displayedTxs, budgets, activePeriod);
  }, [displayedTxs, budgets, activePeriod]);

  const displayedBudgetRemaining = useMemo(() => {
    return calculateBudgetRemaining(totalAllocatedBudget, displayedBudgetSpent);
  }, [totalAllocatedBudget, displayedBudgetSpent]);

  const displayedBudgetUtil = totalAllocatedBudget > 0 ? (displayedBudgetSpent / totalAllocatedBudget) * 100 : 0;

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

  // Budget bar items computed from displayed transactions and consolidated budgets, sorted with active spending first
  const budgetItems = useMemo(() =>
    consolidatedBudgets
      .map((b) => {
        const spent = displayedTxs
          .filter(
            (t) =>
              t.type === "expense" &&
              (t.category || "").toLowerCase() === (b.category || "").toLowerCase() &&
              (!b.department || b.department === "All" || b.department === "General" || (t.department || "").toLowerCase() === (b.department || "").toLowerCase())
          )
          .reduce((s, t) => s + Number(t.amount || 0), 0);
        const label = b.department && b.department !== "All" && b.department !== "General"
          ? `${b.category} · ${b.department}`
          : b.category;
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
      .sort((a, b) => b.value - a.value || (a.label || "").localeCompare(b.label || "")),
  [consolidatedBudgets, displayedTxs, settings.currency]);

  // Dynamic growth metrics computed strictly from current vs baseline active points
  const { periodGrowth, periodGrowthLabel } = useMemo(() => {
    if (chartPoints.length === 0) {
      return { periodGrowth: 0, periodGrowthLabel: "0.0% Balanced" };
    }
    const targetPoints = selectedPoint ? [selectedPoint] : chartPoints;
    const activeInc = targetPoints.reduce((s, p) => s + (p.income || 0), 0);
    const activeExp = targetPoints.reduce((s, p) => s + (p.expense || 0), 0);
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
  const { incomeGrowth, hasMoMComparison } = useMemo(() => {
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
      return { incomeGrowth: growth, hasMoMComparison: true };
    }
    return { incomeGrowth: 0, hasMoMComparison: false };
  }, [transactions]);

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

  const chartCanvasWidth = isMobile ? width - 44 : isWide ? width - 340 : width - 100;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: "#10B98122" }]}>
              <SvgZap size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 20 : 23 }]}>
                AI Insights & Financial Intelligence
              </Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                {settings.organizationName || "Smart Institutional Financial Diagnostics"} · Real-time data synchronization
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ─── Health Score Card (Exact Mobile Parity) ─── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Financial Health Score</Text>
        <View style={[styles.healthRow, isMobile && { flexDirection: "column", alignItems: "center", gap: 16 }]}>
          <RingProgress
            percentage={healthScore ?? 0}
            centerLabel={healthScore !== null ? `${healthScore}%` : "N/A"}
            size={126}
            strokeWidth={12}
            color={healthColor}
            label={hasData ? healthLabel : "NO DATA"}
            sublabel={
              !hasData
                ? "INACTIVE"
                : healthScore! >= 80
                ? "Optimal"
                : healthScore! >= 60
                ? "Stable"
                : "Watch"
            }
          />
          <View style={[styles.healthRight, isMobile && { alignItems: "center", width: "100%" }]}>
            <Text style={[styles.healthScore, { color: healthColor }]}>
              {healthScore !== null ? (
                <>
                  {healthScore}<Text style={styles.healthScoreMax}>/100</Text>
                </>
              ) : (
                "N/A"
              )}
            </Text>
            <Text style={[styles.healthLabel, { color: healthColor }]}>
              {hasData ? healthLabel : "No Financial Data"}
            </Text>

            <View style={[styles.healthStats, isMobile && { justifyContent: "center" }]}>
              {[
                {
                  label: "Net Balance",
                  value: displayedTxs.length > 0 || displayedNet !== 0
                    ? `${displayedNet >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(displayedNet))}`
                    : `${settings.currency} 0`,
                  color: displayedNet >= 0 ? "#10B981" : "#F43F5E",
                },
                {
                  label: "Profit Margin",
                  value: (displayedIncome > 0 || displayedExpense > 0)
                    ? `${profitMargin >= 0 ? "+" : ""}${profitMargin.toFixed(1)}%`
                    : "N/A",
                  color: (displayedIncome > 0 || displayedExpense > 0)
                    ? (profitMargin > 10 ? "#10B981" : profitMargin >= 0 ? "#38BDF8" : "#F43F5E")
                    : "#94A3B8",
                },
                {
                  label: "Budget Used",
                  value: totalAllocatedBudget > 0
                    ? `${displayedBudgetUtil.toFixed(0)}%`
                    : "N/A",
                  color: totalAllocatedBudget > 0
                    ? (displayedBudgetUtil <= 75 ? "#10B981" : displayedBudgetUtil <= 100 ? "#F59E0B" : "#F43F5E")
                    : "#94A3B8",
                },
                hasMoMComparison
                  ? {
                      label: "MoM Growth",
                      value: `${incomeGrowth >= 0 ? "+" : ""}${incomeGrowth.toFixed(1)}%`,
                      color: incomeGrowth >= 0 ? "#10B981" : "#F43F5E",
                    }
                  : {
                      label: "Burn Rate",
                      value: (displayedIncome > 0 || displayedExpense > 0)
                        ? `${expenseRatio.toFixed(1)}%`
                        : "N/A",
                      color: (displayedIncome > 0 || displayedExpense > 0)
                        ? (expenseRatio <= 65 ? "#10B981" : expenseRatio <= 85 ? "#F59E0B" : "#F43F5E")
                        : "#94A3B8",
                    },
              ].map((s, i) => (
                <View key={i} style={[styles.healthStat, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.healthStatValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={[styles.healthStatLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Insight summary badges */}
        <View style={styles.badgeRow}>
          <TouchableOpacity
            style={[
              styles.badge,
              {
                backgroundColor: "#10B98122",
                borderColor: insightFilter === "positive" ? "#10B981" : "#10B98144",
                borderWidth: insightFilter === "positive" ? 1.5 : 1,
              },
            ]}
            onPress={() => setInsightFilter(f => f === "positive" ? "all" : "positive")}
            activeOpacity={0.7}
          >
            <SvgCheckCircle size={12} color="#10B981" />
            <Text style={[styles.badgeText, { color: "#10B981", fontFamily: insightFilter === "positive" ? "Inter_700Bold" : "Inter_600SemiBold" }]}>
              {positiveCount} Positive
            </Text>
          </TouchableOpacity>

          {criticalCount > 0 && (
            <TouchableOpacity
              style={[
                styles.badge,
                {
                  backgroundColor: "#F43F5E22",
                  borderColor: insightFilter === "critical" ? "#F43F5E" : "#F43F5E44",
                  borderWidth: insightFilter === "critical" ? 1.5 : 1,
                },
              ]}
              onPress={() => setInsightFilter(f => f === "critical" ? "all" : "critical")}
              activeOpacity={0.7}
            >
              <SvgAlertTriangle size={12} color="#F43F5E" />
              <Text style={[styles.badgeText, { color: "#F43F5E", fontFamily: insightFilter === "critical" ? "Inter_700Bold" : "Inter_600SemiBold" }]}>
                {criticalCount} Critical
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.badge,
              {
                backgroundColor: "#F59E0B22",
                borderColor: insightFilter === "advisories" ? "#F59E0B" : "#F59E0B44",
                borderWidth: insightFilter === "advisories" ? 1.5 : 1,
              },
            ]}
            onPress={() => setInsightFilter(f => f === "advisories" ? "all" : "advisories")}
            activeOpacity={0.7}
          >
            <SvgZap size={12} color="#F59E0B" />
            <Text style={[styles.badgeText, { color: "#F59E0B", fontFamily: insightFilter === "advisories" ? "Inter_700Bold" : "Inter_600SemiBold" }]}>
              {advisoryCount} Advisories
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.badge,
              {
                backgroundColor: "#3B82F622",
                borderColor: insightFilter === "all" ? "#3B82F6" : "#3B82F644",
                borderWidth: insightFilter === "all" ? 1.5 : 1,
              },
            ]}
            onPress={() => setInsightFilter("all")}
            activeOpacity={0.7}
          >
            <SvgInfo size={12} color="#3B82F6" />
            <Text style={[styles.badgeText, { color: "#3B82F6", fontFamily: insightFilter === "all" ? "Inter_700Bold" : "Inter_600SemiBold" }]}>
              {actionableInsights.length} Total
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Financial Trend Card ─── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Financial Trend</Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              Income vs Expenses · {activePeriod.label}
            </Text>
          </View>
          <View
            style={[
              styles.growthBadge,
              {
                backgroundColor: periodGrowth >= 0 ? "#10B98122" : "#F43F5E22",
                borderColor: periodGrowth >= 0 ? "#10B98144" : "#F43F5E44",
              },
            ]}
          >
            {periodGrowth >= 0 ? (
              <SvgTrendingUp size={12} color="#10B981" />
            ) : (
              <SvgTrendingDown size={12} color="#F43F5E" />
            )}
            <Text style={[styles.growthText, { color: periodGrowth >= 0 ? "#10B981" : "#F43F5E" }]}>
              {periodGrowthLabel}
            </Text>
          </View>
        </View>

        <AreaLineChart
          data={chartPoints}
          width={chartCanvasWidth}
          height={180}
          currency={settings.currency}
          activeRange={customSelection ? undefined : trendRange}
          activePeriod={activePeriod}
          onPointSelect={(pt) => {
            setSelectedPoint(pt);
          }}
          onPeriodSelect={(p) => {
            setActivePeriod(p);
            setCustomPeriodName(p.label);
            setSelectedPoint(null);
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
          ranges={["1W", "2W", "1M", "3M", "6M", "1Y"]}
          transactions={transactions}
          userId={user?.id || "default"}
        />
      </View>

      {/* ─── 2-Column Section: 3 Key Rings & Expense Breakdown ─── */}
      <View style={[styles.twoColSection, isMobile && { flexDirection: "column" }]}>
        {/* 3 Key Rings */}
        <View style={[styles.card, { flex: 1.2, backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Key Metrics</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                {selectedPoint ? `Inspecting ${selectedPoint.fullDate || selectedPoint.label}` : `Financial performance indicators · ${activePeriod.label}`}
              </Text>
            </View>
            {selectedPoint && (
              <TouchableOpacity
                style={[styles.smBtn, { borderColor: colors.primary + "44", backgroundColor: colors.primary + "15" }]}
                onPress={() => setSelectedPoint(null)}
              >
                <Text style={[styles.smBtnText, { color: colors.primary }]}>Reset Focus ✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.ringsRow}>
            {/* Ring 1: Operating Surplus / Margin */}
            <View style={styles.ringItem}>
              <RingProgress
                percentage={displayedIncome === 0 && displayedExpense === 0 ? 0 : Math.min(Math.max(profitMargin >= 0 ? profitMargin : Math.abs(profitMargin), 0), 100)}
                centerLabel={`${profitMargin >= 0 ? "+" : "-"}${Math.abs(profitMargin).toFixed(0)}%`}
                size={98}
                strokeWidth={9}
                color={displayedIncome === 0 && displayedExpense === 0 ? "#64748B" : profitMargin >= 20 ? "#10B981" : profitMargin >= 0 ? "#0EA5E9" : "#F43F5E"}
                label="Operating"
                sublabel={profitMargin >= 0 ? "SURPLUS" : "DEFICIT"}
              />
              <View
                style={[
                  styles.ringStatusPill,
                  {
                    backgroundColor: (displayedIncome === 0 && displayedExpense === 0 ? "#64748B" : profitMargin >= 20 ? "#10B981" : profitMargin >= 0 ? "#0EA5E9" : "#F43F5E") + "18",
                    borderColor: (displayedIncome === 0 && displayedExpense === 0 ? "#64748B" : profitMargin >= 20 ? "#10B981" : profitMargin >= 0 ? "#0EA5E9" : "#F43F5E") + "44",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.ringStatusText,
                    { color: displayedIncome === 0 && displayedExpense === 0 ? "#64748B" : profitMargin >= 20 ? "#10B981" : profitMargin >= 0 ? "#0EA5E9" : "#F43F5E" },
                  ]}
                >
                  {displayedIncome === 0 && displayedExpense === 0
                    ? "No Activity"
                    : profitMargin >= 25
                    ? "Healthy Surplus"
                    : profitMargin > 0
                    ? "Surplus Margin"
                    : profitMargin === 0
                    ? "Balanced"
                    : "Operating Deficit"}
                </Text>
              </View>
              <Text style={styles.ringValueSub}>
                {profitMargin >= 0 ? "+" : "-"}{settings.currency} {fmt(Math.abs(displayedNet))}
              </Text>
            </View>

            {/* Ring 2: Budget Execution / Utilization */}
            <View style={styles.ringItem}>
              <RingProgress
                percentage={Math.min(displayedBudgetUtil, 100)}
                centerLabel={`${displayedBudgetUtil.toFixed(0)}%`}
                size={98}
                strokeWidth={9}
                color={displayedBudgetUtil === 0 ? "#64748B" : displayedBudgetUtil <= 75 ? "#3B82F6" : displayedBudgetUtil <= 95 ? "#F59E0B" : "#F43F5E"}
                label="Budget"
                sublabel="UTILIZED"
              />
              <View
                style={[
                  styles.ringStatusPill,
                  {
                    backgroundColor: (displayedBudgetUtil === 0 ? "#64748B" : displayedBudgetUtil <= 75 ? "#3B82F6" : displayedBudgetUtil <= 95 ? "#F59E0B" : "#F43F5E") + "18",
                    borderColor: (displayedBudgetUtil === 0 ? "#64748B" : displayedBudgetUtil <= 75 ? "#3B82F6" : displayedBudgetUtil <= 95 ? "#F59E0B" : "#F43F5E") + "44",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.ringStatusText,
                    { color: displayedBudgetUtil === 0 ? "#64748B" : displayedBudgetUtil <= 75 ? "#3B82F6" : displayedBudgetUtil <= 95 ? "#F59E0B" : "#F43F5E" },
                  ]}
                >
                  {displayedBudgetUtil === 0
                    ? "Unspent"
                    : displayedBudgetUtil <= 75
                    ? "On Track"
                    : displayedBudgetUtil <= 95
                    ? "Near Limit"
                    : "Over Budget"}
                </Text>
              </View>
              <Text style={styles.ringValueSub}>
                {settings.currency} {fmt(displayedBudgetSpent)} of {fmt(totalAllocatedBudget)}
              </Text>
            </View>

            {/* Ring 3: Operational Expense Burn Rate */}
            <View style={styles.ringItem}>
              <RingProgress
                percentage={Math.min(expenseRatio, 100)}
                centerLabel={`${expenseRatio.toFixed(0)}%`}
                size={98}
                strokeWidth={9}
                color={expenseRatio === 0 ? "#64748B" : expenseRatio <= 40 ? "#8B5CF6" : expenseRatio <= 75 ? "#F59E0B" : "#F43F5E"}
                label="Outflow"
                sublabel="BURN RATE"
              />
              <View
                style={[
                  styles.ringStatusPill,
                  {
                    backgroundColor: (expenseRatio === 0 ? "#64748B" : expenseRatio <= 40 ? "#8B5CF6" : expenseRatio <= 75 ? "#F59E0B" : "#F43F5E") + "18",
                    borderColor: (expenseRatio === 0 ? "#64748B" : expenseRatio <= 40 ? "#8B5CF6" : expenseRatio <= 75 ? "#F59E0B" : "#F43F5E") + "44",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.ringStatusText,
                    { color: expenseRatio === 0 ? "#64748B" : expenseRatio <= 40 ? "#8B5CF6" : expenseRatio <= 75 ? "#F59E0B" : "#F43F5E" },
                  ]}
                >
                  {expenseRatio === 0
                    ? "Zero Outflow"
                    : expenseRatio <= 25
                    ? "Low Burn (Safe)"
                    : expenseRatio <= 60
                    ? "Optimal Burn"
                    : expenseRatio <= 85
                    ? "Moderate Outflow"
                    : "High Burn Alert"}
                </Text>
              </View>
              <Text style={styles.ringValueSub}>
                {settings.currency} {fmt(displayedExpense)} spent
              </Text>
            </View>
          </View>
        </View>

        {/* Expense Category Donut */}
        <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Expense Breakdown</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {selectedPoint ? `Disbursements in ${selectedPoint.fullDate || selectedPoint.label}` : `Where your money is going · ${activePeriod.label}`}
          </Text>

          {displayedExpense > 0 && expenseByCategory.length > 0 ? (
            <DonutChart
              segments={expenseByCategory}
              size={134}
              strokeWidth={11}
              currency={settings.currency}
              centerLabel={`${settings.currency} ${fmt(displayedExpense)}`}
              centerSub="total spent"
            />
          ) : (
            <View style={{ paddingVertical: 28, alignItems: "center", justifyContent: "center" }}>
              <SvgCheckCircle size={28} color="#10B981" />
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>
                Zero expenditures recorded for this specific period.
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ─── 2-Column Section: Department Spending & Budget vs Actual ─── */}
      <View style={[styles.twoColSection, isMobile && { flexDirection: "column" }]}>
        {/* Department Spending Bars */}
        <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, justifyContent: "space-between" }]}>
          <View>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Department Spending</Text>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                  {selectedPoint ? `Allocations in ${selectedPoint.fullDate || selectedPoint.label}` : "Expense allocation by unit"}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.smBtn, { borderColor: colors.border }]}
                onPress={() => onNavigate ? onNavigate("departments") : null}
              >
                <Text style={[styles.smBtnText, { color: colors.primary }]}>Details</Text>
              </TouchableOpacity>
            </View>

            {deptSpend.length > 0 ? (
              <View style={{ paddingVertical: 4 }}>
                <HBarChart items={deptSpend} formatValue={v => `${settings.currency} ${fmt(v)}`} />
              </View>
            ) : (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>No departmental disbursements recorded.</Text>
              </View>
            )}

            {/* Department Allocation & Cost Concentration Highlights */}
            {deptSpend.length > 0 && (
              <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 11.5, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Cost Center Distribution</Text>
                  <Text style={{ fontSize: 10.5, fontFamily: "Inter_500Medium", color: colors.primary }}>{deptSpend.length} Monitored Units</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 9.5, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Primary Driver</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 2 }} numberOfLines={1}>{deptSpend[0]?.label || "N/A"}</Text>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.expense, marginTop: 2 }}>{settings.currency} {fmt(deptSpend[0]?.value || 0)}</Text>
                  </View>
                  <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 9.5, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Secondary Driver</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 2 }} numberOfLines={1}>{deptSpend[1]?.label || "N/A"}</Text>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.expense, marginTop: 2 }}>{settings.currency} {fmt(deptSpend[1]?.value || 0)}</Text>
                  </View>
                  <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 9.5, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Other Units ({Math.max(deptSpend.length - 2, 0)})</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 2 }}>Combined</Text>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.income, marginTop: 2 }}>{settings.currency} {fmt(deptSpend.slice(2).reduce((s, d) => s + d.value, 0))}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Department spending summary */}
          <View style={[styles.budgetSummaryRow, { marginTop: 14 }]}>
            {[
              { label: "Total Disbursed", value: `${settings.currency} ${fmt(deptSpend.reduce((s, d) => s + d.value, 0))}`, color: colors.primary },
              { label: "Active Units", value: `${deptSpend.length} Units`, color: colors.income },
              { label: "Top Cost Center", value: deptSpend[0]?.label || "None", color: colors.expense },
            ].map((s, i) => (
              <View key={i} style={[styles.budgetSumCard, { backgroundColor: s.color + "15", borderColor: s.color + "33" }]}>
                <Text style={[styles.budgetSumValue, { color: s.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{s.value}</Text>
                <Text style={[styles.budgetSumLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Budget Utilization Bars */}
        <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, justifyContent: "space-between" }]}>
          <View>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Budget vs Actual</Text>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                  {selectedPoint ? `Spending during ${selectedPoint.fullDate || selectedPoint.label}` : "Spending per budget category"}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.smBtn, { borderColor: colors.border }]}
                onPress={() => onNavigate ? onNavigate("budget") : null}
              >
                <Text style={[styles.smBtnText, { color: colors.primary }]}>Manage</Text>
              </TouchableOpacity>
            </View>

            {budgetItems.length > 0 ? (
              <View style={{ paddingVertical: 4 }}>
                <HBarChart items={budgetItems} formatValue={v => `${settings.currency} ${fmt(v)}`} />
              </View>
            ) : (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>No active budgets configured.</Text>
              </View>
            )}
          </View>

          {/* Budget progress summary */}
          <View style={[styles.budgetSummaryRow, { marginTop: 14 }]}>
            {[
              { label: "Total Allocated", value: `${settings.currency} ${fmt(totalAllocatedBudget)}`, color: colors.primary },
              { label: "Total Spent", value: `${settings.currency} ${fmt(displayedBudgetSpent)}`, color: colors.expense },
              { label: "Remaining", value: `${settings.currency} ${fmt(Math.max(totalAllocatedBudget - displayedBudgetSpent, 0))}`, color: colors.income },
            ].map((s, i) => (
              <View key={i} style={[styles.budgetSumCard, { backgroundColor: s.color + "15", borderColor: s.color + "33" }]}>
                <Text style={[styles.budgetSumValue, { color: s.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{s.value}</Text>
                <Text style={[styles.budgetSumLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ─── Total Transactions Analytics & Ledger Overview Card ─── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Total Transactions</Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              {txStats.totalCount} Records · {txStats.inflowCount} Inflows · {txStats.outflowCount} Outflows · Net: {txStats.netFlow >= 0 ? "+" : "-"}{settings.currency} {fmt(Math.abs(txStats.netFlow))}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.smBtn, { borderColor: colors.primary + "44", backgroundColor: colors.primary + "15" }]}
            onPress={() => {
              setTxModalFilter("all");
              setAllTxModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.smBtnText, { color: colors.primary }]}>View All ({txStats.totalCount})</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.txStatsGrid}>
          {/* Box 1: Inflows */}
          <TouchableOpacity
            style={[styles.txStatBox, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => {
              setTxModalFilter("income");
              setAllTxModal(true);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={[styles.txStatIcon, { backgroundColor: colors.income + "18" }]}>
                <SvgArrowDownLeft size={13} color={colors.income} />
              </View>
              <Text style={{ fontSize: 9.5, color: colors.income, fontFamily: "Inter_600SemiBold" }}>View Inflows →</Text>
            </View>
            <Text style={[styles.txStatLabel, { color: colors.mutedForeground }]}>Inflows ({txStats.inflowCount})</Text>
            <Text style={[styles.txStatVal, { color: colors.income }]}>+{settings.currency} {fmt(txStats.inflowTotal)}</Text>
            <Text style={{ fontSize: 9.5, color: colors.mutedForeground }}>
              {txStats.inflowCount > 0 ? `${settings.currency} ${fmt(txStats.avgInflow)} avg` : "No inflows"}
            </Text>
          </TouchableOpacity>

          {/* Box 2: Outflows */}
          <TouchableOpacity
            style={[styles.txStatBox, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => {
              setTxModalFilter("expense");
              setAllTxModal(true);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={[styles.txStatIcon, { backgroundColor: colors.expense + "18" }]}>
                <SvgArrowUpRight size={13} color={colors.expense} />
              </View>
              <Text style={{ fontSize: 9.5, color: colors.expense, fontFamily: "Inter_600SemiBold" }}>View Outflows →</Text>
            </View>
            <Text style={[styles.txStatLabel, { color: colors.mutedForeground }]}>Outflows ({txStats.outflowCount})</Text>
            <Text style={[styles.txStatVal, { color: colors.expense }]}>-{settings.currency} {fmt(txStats.outflowTotal)}</Text>
            <Text style={{ fontSize: 9.5, color: colors.mutedForeground }}>
              {txStats.outflowCount > 0 ? `${settings.currency} ${fmt(txStats.avgOutflow)} avg` : "No outflows"}
            </Text>
          </TouchableOpacity>

          {/* Box 3: Net Cash Flow & Average Ticket */}
          <TouchableOpacity
            style={[styles.txStatBox, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => {
              setTxModalFilter("all");
              setAllTxModal(true);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={[styles.txStatIcon, { backgroundColor: (txStats.netFlow >= 0 ? colors.income : colors.expense) + "18" }]}>
                <SvgActivity size={13} color={txStats.netFlow >= 0 ? colors.income : colors.expense} />
              </View>
              <Text style={{ fontSize: 9.5, color: txStats.netFlow >= 0 ? colors.income : colors.expense, fontFamily: "Inter_600SemiBold" }}>
                {txStats.netFlow >= 0 ? "Surplus" : "Deficit"}
              </Text>
            </View>
            <Text style={[styles.txStatLabel, { color: colors.mutedForeground }]}>Net Cash Flow</Text>
            <Text style={[styles.txStatVal, { color: txStats.netFlow >= 0 ? colors.income : colors.expense }]}>
              {txStats.netFlow >= 0 ? "+" : "-"}{settings.currency} {fmt(Math.abs(txStats.netFlow))}
            </Text>
            <Text style={{ fontSize: 9.5, color: colors.mutedForeground }}>
              Avg Ticket: {settings.currency} {fmt(txStats.avgTx)}
            </Text>
          </TouchableOpacity>

          {/* Box 4: Max Transaction */}
          <TouchableOpacity
            style={[styles.txStatBox, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => {
              setTxModalFilter(txStats.maxTx?.type === "expense" ? "expense" : "income");
              setAllTxModal(true);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={[styles.txStatIcon, { backgroundColor: "#F59E0B18" }]}>
                <SvgAward size={13} color="#F59E0B" />
              </View>
              <Text style={{ fontSize: 9.5, color: "#F59E0B", fontFamily: "Inter_600SemiBold" }}>
                {txStats.maxTx?.type === "expense" ? "Outflow" : "Inflow"}
              </Text>
            </View>
            <Text style={[styles.txStatLabel, { color: colors.mutedForeground }]}>Max Transaction</Text>
            <Text style={[styles.txStatVal, { color: "#F59E0B" }]} numberOfLines={1}>
              {txStats.maxTx ? `${settings.currency} ${fmt(txStats.maxTx.amount)}` : "None"}
            </Text>
            <Text style={{ fontSize: 9.5, color: colors.mutedForeground }} numberOfLines={1}>
              {txStats.maxTx ? `${txStats.maxTx.category || txStats.maxTx.title || "Transaction"}` : "No records"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── AI Insight Cards ─── */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {displayedInsights.length} Actionable Intelligence Insights {insightFilter !== "all" ? `(${insightFilter === "positive" ? "Positive Only" : "Alerts Only"})` : ""}
      </Text>

      {displayedInsights.length === 0 ? (
        <View style={[styles.disclaimerBox, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 20 }]}>
          {hasData ? (
            <SvgCheckCircle size={24} color="#10B981" />
          ) : (
            <SvgInfo size={24} color="#94A3B8" />
          )}
          <Text style={[styles.disclaimerText, { color: colors.foreground, fontSize: 13, marginTop: 6 }]}>
            {!hasData
              ? "No financial data available yet. Add income, expenses, or budgets to generate real-time AI financial intelligence."
              : insightFilter === "critical" || insightFilter === "advisories"
              ? "No critical alerts or warnings found in this period."
              : insightFilter === "positive"
              ? "No positive insights recorded in this period."
              : "No anomalies or critical alerts detected. All financial metrics are within standard operational limits."}
          </Text>
        </View>
      ) : (
        displayedInsights.map((insight) => {
          const conf = SEV_CONFIG[insight.severity] || SEV_CONFIG.INFO;
          return (
            <View
              key={insight.id}
              style={[
                styles.insightCard,
                {
                  backgroundColor: colors.card,
                  borderColor: conf.border,
                  borderLeftColor: conf.color,
                  borderLeftWidth: 4,
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 8,
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <View style={[styles.insightIcon, { backgroundColor: conf.bg }]}>
                    <conf.Icon size={15} color={conf.color} />
                  </View>
                  <Text style={[styles.insightTitle, { color: colors.foreground, flex: 1 }]}>{insight.title}</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: conf.bg }]}>
                  <Text style={[styles.typeBadgeText, { color: conf.color }]}>{insight.severity}</Text>
                </View>
              </View>

              {/* WHAT */}
              <Text style={[styles.insightDetail, { color: colors.foreground, lineHeight: 18 }]}>
                {insight.summary || (insight as any).description}
              </Text>

              {/* WHY IT MATTERS */}
              <View style={{ backgroundColor: colors.background, padding: 10, borderRadius: 8, borderLeftWidth: 2, borderLeftColor: conf.color }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, marginBottom: 2 }}>
                  WHY THIS MATTERS
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 17 }}>
                  {insight.whyItMatters}
                </Text>
              </View>

              {/* ACTION */}
              {insight.isActionable && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: conf.color, flex: 1 }}>
                    👉 {insight.recommendedAction}
                  </Text>
                  {insight.actionRoute && onNavigate && (
                    <TouchableOpacity onPress={() => onNavigate(insight.actionRoute?.replace("/(tabs)/", "") || "overview")}>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary }}>
                        Resolve →
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      {/* Disclaimer */}
      <View style={[styles.disclaimerBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <SvgCpu size={14} color={colors.mutedForeground} />
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
  content: {
    padding: 24,
    gap: 16,
    paddingBottom: 60,
    minWidth: 0,
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  titleIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  healthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  healthRight: {
    flex: 1,
  },
  healthScore: {
    fontSize: 34,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -1,
  },
  healthScoreMax: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#64748B",
  },
  healthLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
    marginBottom: 10,
  },
  healthStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  healthStat: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 110,
  },
  healthStatValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  healthStatLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  growthBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  growthText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  twoColSection: {
    flexDirection: "row",
    gap: 16,
  },
  ringsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    paddingVertical: 6,
  },
  ringItem: {
    alignItems: "center",
    gap: 8,
  },
  ringStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  ringStatusText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  ringValueSub: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
    color: "#64748B",
    textAlign: "center",
    marginTop: 2,
  },
  smBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  smBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  budgetSummaryRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  budgetSumCard: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  budgetSumValue: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  budgetSumLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  txStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  txStatBox: {
    flex: 1,
    minWidth: 120,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  txStatIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  txStatLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  txStatVal: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    marginTop: 4,
  },
  insightCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  insightIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitle: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  insightDetail: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
  },
  disclaimerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  disclaimerText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
});
