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
import { Feather } from "@expo/vector-icons";
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
} from "@/services/FinancialCalculationEngine";
import { calculateFinancialHealth } from "@/services/financialHealthService";
import { generateFinancialInsights } from "@/services/financialInsightsService";

const CAT_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];

const SEV_CONFIG = {
  SUCCESS:  { color: "#10B981", bg: "#10B98122", border: "#10B98144", icon: "check-circle" as const },
  WARNING:  { color: "#F59E0B", bg: "#F59E0B22", border: "#F59E0B44", icon: "alert-triangle" as const },
  INFO:     { color: "#38BDF8", bg: "#38BDF822", border: "#38BDF844", icon: "info" as const },
  CRITICAL: { color: "#F43F5E", bg: "#F43F5E22", border: "#F43F5E44", icon: "alert-octagon" as const },
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

  const { healthScore, status: healthLabel, statusColor: healthColor } = healthReport;

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

  // Authoritative real calculation for the displayed scope
  const displayedIncome = useMemo(() => calculateTotalIncome(displayedTxs), [displayedTxs]);
  const displayedExpense = useMemo(() => calculateTotalExpenses(displayedTxs), [displayedTxs]);
  const displayedNet = displayedIncome - displayedExpense;

  // Real profit margin (strictly real Inflows minus real Outflows, never inflated)
  const profitMargin = displayedIncome > 0
    ? (displayedNet / displayedIncome) * 100
    : (displayedExpense > 0 ? -100 : 0);

  // Real expense ratio (Outflows as percentage of Inflows)
  const expenseRatio = displayedIncome > 0
    ? (displayedExpense / displayedIncome) * 100
    : (displayedExpense > 0 ? 100 : 0);

  // Budget allocations & displayed spend
  const totalAllocatedBudget = useMemo(() => budgets.reduce((s, b) => s + Number(b.allocated || 0), 0), [budgets]);
  const displayedBudgetSpent = useMemo(() => {
    return budgets.reduce((sum, b) => {
      const catSpent = displayedTxs
        .filter(
          (t) =>
            t.type === "expense" &&
            t.category?.toLowerCase() === b.category?.toLowerCase() &&
            (!b.department || b.department === "All" || b.department === "General" || t.department?.toLowerCase() === b.department.toLowerCase())
        )
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      return sum + catSpent;
    }, 0);
  }, [budgets, displayedTxs]);
  const displayedBudgetUtil = totalAllocatedBudget > 0 ? (displayedBudgetSpent / totalAllocatedBudget) * 100 : 0;

  // Transaction Metrics computed strictly from displayed transactions
  const txStats = useMemo(() => {
    const totalCount = displayedTxs.length;
    const inflows = displayedTxs.filter(t => t.type === "income");
    const outflows = displayedTxs.filter(t => t.type === "expense");
    const inflowTotal = inflows.reduce((s, t) => s + t.amount, 0);
    const outflowTotal = outflows.reduce((s, t) => s + t.amount, 0);
    const avgTx = totalCount > 0 ? (inflowTotal + outflowTotal) / totalCount : 0;
    
    let maxTx: any = null;
    displayedTxs.forEach(t => {
      if (!maxTx || t.amount > maxTx.amount) maxTx = t;
    });

    return {
      totalCount,
      inflowCount: inflows.length,
      outflowCount: outflows.length,
      inflowTotal,
      outflowTotal,
      avgTx,
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
    return Object.entries(map).sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: CAT_COLORS[i % CAT_COLORS.length] }));
  }, [displayedTxs]);

  // Budget bar items computed from displayed transactions
  const budgetItems = useMemo(() =>
    budgets.map((b) => {
      const spent = displayedTxs
        .filter(
          (t) =>
            t.type === "expense" &&
            t.category?.toLowerCase() === b.category?.toLowerCase() &&
            (!b.department || b.department === "All" || b.department === "General" || t.department?.toLowerCase() === b.department.toLowerCase())
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
    }),
  [budgets, displayedTxs, settings.currency]);

  // Real-time period growth and margin computed directly from active chart timeline data
  const { periodGrowth, periodGrowthLabel } = useMemo(() => {
    if (!chartPoints || chartPoints.length === 0) {
      return { periodGrowth: 0, periodGrowthLabel: "0.0%" };
    }

    if (chartPoints.length >= 2) {
      const half = Math.floor(chartPoints.length / 2);
      const firstHalf = chartPoints.slice(0, half);
      const secondHalf = chartPoints.slice(half);

      const firstInc = firstHalf.reduce((s, p) => s + (p.income || 0), 0);
      const secondInc = secondHalf.reduce((s, p) => s + (p.income || 0), 0);

      let growth = 0;
      if (firstInc > 0) {
        growth = ((secondInc - firstInc) / firstInc) * 100;
      } else if (secondInc > 0) {
        growth = 100;
      } else {
        const firstExp = firstHalf.reduce((s, p) => s + (p.expense || 0), 0);
        const secondExp = secondHalf.reduce((s, p) => s + (p.expense || 0), 0);
        if (firstExp > 0) {
          growth = -(((secondExp - firstExp) / firstExp) * 100);
        }
      }

      return {
        periodGrowth: growth,
        periodGrowthLabel: `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`,
      };
    }

    const totalInc = chartPoints.reduce((s, p) => s + (p.income || 0), 0);
    const totalExp = chartPoints.reduce((s, p) => s + (p.expense || 0), 0);
    const net = totalInc - totalExp;
    const margin = totalInc > 0 ? (net / totalInc) * 100 : 0;

    return {
      periodGrowth: margin,
      periodGrowthLabel: `${margin >= 0 ? "+" : ""}${margin.toFixed(1)}%`,
    };
  }, [chartPoints]);

  // Dynamic MoM growth computed from active sorted monthly ledger
  const { incomeGrowth } = useMemo(() => {
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
      return { incomeGrowth: growth };
    }
    return { incomeGrowth: 0 };
  }, [transactions]);

  const positiveCount = useMemo(
    () => actionableInsights.filter(i => i.severity === "SUCCESS").length,
    [actionableInsights]
  );
  const warningCount = useMemo(
    () => actionableInsights.filter(i => i.severity === "CRITICAL" || i.severity === "WARNING").length,
    [actionableInsights]
  );

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
              <Feather name="zap" size={20} color="#10B981" />
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
            percentage={healthScore}
            size={126}
            strokeWidth={12}
            color={healthColor}
            label={healthLabel}
          />
          <View style={[styles.healthRight, isMobile && { alignItems: "center", width: "100%" }]}>
            <Text style={[styles.healthScore, { color: healthColor }]}>
              {healthScore}<Text style={styles.healthScoreMax}>/100</Text>
            </Text>
            <Text style={[styles.healthLabel, { color: healthColor }]}>{healthLabel}</Text>

            <View style={[styles.healthStats, isMobile && { justifyContent: "center" }]}>
              {[
                {
                  label: "Net Balance",
                  value: `${displayedNet >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(displayedNet))}`,
                  color: displayedNet >= 0 ? "#10B981" : "#F43F5E",
                },
                {
                  label: "Profit Margin",
                  value: `${profitMargin >= 0 ? "+" : ""}${profitMargin.toFixed(1)}%`,
                  color: profitMargin > 10 ? "#10B981" : profitMargin >= 0 ? "#38BDF8" : "#F43F5E",
                },
                {
                  label: "Budget Used",
                  value: `${displayedBudgetUtil.toFixed(0)}%`,
                  color: displayedBudgetUtil <= 75 ? "#10B981" : displayedBudgetUtil <= 100 ? "#F59E0B" : "#F43F5E",
                },
                {
                  label: "MoM Growth",
                  value: `${incomeGrowth >= 0 ? "+" : ""}${incomeGrowth.toFixed(1)}%`,
                  color: incomeGrowth >= 0 ? "#10B981" : "#F43F5E",
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
          <View style={[styles.badge, { backgroundColor: "#10B98122", borderColor: "#10B98144" }]}>
            <Feather name="check-circle" size={12} color="#10B981" />
            <Text style={[styles.badgeText, { color: "#10B981" }]}>{positiveCount} Positive</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: "#F43F5E22", borderColor: "#F43F5E44" }]}>
            <Feather name="alert-triangle" size={12} color="#F43F5E" />
            <Text style={[styles.badgeText, { color: "#F43F5E" }]}>{warningCount} Alerts</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: "#3B82F622", borderColor: "#3B82F644" }]}>
            <Feather name="info" size={12} color="#3B82F6" />
            <Text style={[styles.badgeText, { color: "#3B82F6" }]}>{actionableInsights.length} Total</Text>
          </View>
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
            <Feather
              name={periodGrowth >= 0 ? "trending-up" : "trending-down"}
              size={12}
              color={periodGrowth >= 0 ? "#10B981" : "#F43F5E"}
            />
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
            {/* Ring 1: Profit Margin */}
            <View style={styles.ringItem}>
              <RingProgress
                percentage={displayedIncome === 0 && displayedExpense === 0 ? 0 : Math.min(Math.max(profitMargin, 0), 100)}
                centerLabel={`${profitMargin >= 0 ? "+" : ""}${profitMargin.toFixed(0)}%`}
                size={98}
                strokeWidth={9}
                color={displayedIncome === 0 && displayedExpense === 0 ? "#64748B" : profitMargin > 15 ? "#10B981" : profitMargin >= 0 ? "#38BDF8" : "#F43F5E"}
                label="Profit"
                sublabel="MARGIN"
              />
              <View
                style={[
                  styles.ringStatusPill,
                  {
                    backgroundColor: (displayedIncome === 0 && displayedExpense === 0 ? "#64748B" : profitMargin > 15 ? "#10B981" : profitMargin >= 0 ? "#38BDF8" : "#F43F5E") + "18",
                    borderColor: (displayedIncome === 0 && displayedExpense === 0 ? "#64748B" : profitMargin > 15 ? "#10B981" : profitMargin >= 0 ? "#38BDF8" : "#F43F5E") + "44",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.ringStatusText,
                    { color: displayedIncome === 0 && displayedExpense === 0 ? "#64748B" : profitMargin > 15 ? "#10B981" : profitMargin >= 0 ? "#38BDF8" : "#F43F5E" },
                  ]}
                >
                  {displayedIncome === 0 && displayedExpense === 0
                    ? "No Activity"
                    : profitMargin > 20
                    ? "High Surplus"
                    : profitMargin > 0
                    ? "Surplus"
                    : profitMargin === 0
                    ? "Balanced"
                    : "Operating Deficit"}
                </Text>
              </View>
            </View>

            {/* Ring 2: Budget Utilization */}
            <View style={styles.ringItem}>
              <RingProgress
                percentage={Math.min(displayedBudgetUtil, 100)}
                centerLabel={`${displayedBudgetUtil.toFixed(0)}%`}
                size={98}
                strokeWidth={9}
                color={displayedBudgetUtil === 0 ? "#64748B" : displayedBudgetUtil <= 75 ? "#10B981" : displayedBudgetUtil <= 95 ? "#F59E0B" : "#F43F5E"}
                label="Budget"
                sublabel="USED"
              />
              <View
                style={[
                  styles.ringStatusPill,
                  {
                    backgroundColor: (displayedBudgetUtil === 0 ? "#64748B" : displayedBudgetUtil <= 75 ? "#10B981" : displayedBudgetUtil <= 95 ? "#F59E0B" : "#F43F5E") + "18",
                    borderColor: (displayedBudgetUtil === 0 ? "#64748B" : displayedBudgetUtil <= 75 ? "#10B981" : displayedBudgetUtil <= 95 ? "#F59E0B" : "#F43F5E") + "44",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.ringStatusText,
                    { color: displayedBudgetUtil === 0 ? "#64748B" : displayedBudgetUtil <= 75 ? "#10B981" : displayedBudgetUtil <= 95 ? "#F59E0B" : "#F43F5E" },
                  ]}
                >
                  {displayedBudgetUtil === 0
                    ? "No Spend"
                    : displayedBudgetUtil <= 75
                    ? "On Track"
                    : displayedBudgetUtil <= 100
                    ? "Near Limit"
                    : "Over Budget"}
                </Text>
              </View>
            </View>

            {/* Ring 3: Expense Ratio */}
            <View style={styles.ringItem}>
              <RingProgress
                percentage={Math.min(expenseRatio, 100)}
                centerLabel={`${expenseRatio.toFixed(0)}%`}
                size={98}
                strokeWidth={9}
                color={expenseRatio === 0 ? "#64748B" : expenseRatio <= 60 ? "#10B981" : expenseRatio <= 85 ? "#F59E0B" : "#F43F5E"}
                label="Expense"
                sublabel="RATIO"
              />
              <View
                style={[
                  styles.ringStatusPill,
                  {
                    backgroundColor: (expenseRatio === 0 ? "#64748B" : expenseRatio <= 60 ? "#10B981" : expenseRatio <= 85 ? "#F59E0B" : "#F43F5E") + "18",
                    borderColor: (expenseRatio === 0 ? "#64748B" : expenseRatio <= 60 ? "#10B981" : expenseRatio <= 85 ? "#F59E0B" : "#F43F5E") + "44",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.ringStatusText,
                    { color: expenseRatio === 0 ? "#64748B" : expenseRatio <= 60 ? "#10B981" : expenseRatio <= 85 ? "#F59E0B" : "#F43F5E" },
                  ]}
                >
                  {expenseRatio === 0
                    ? "Zero Outflow"
                    : expenseRatio <= 60
                    ? "Low Burn"
                    : expenseRatio <= 85
                    ? "Moderate"
                    : "High Outflow"}
                </Text>
              </View>
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
              size={146}
              strokeWidth={14}
              currency={settings.currency}
              centerLabel={`${settings.currency} ${fmt(displayedExpense)}`}
              centerSub="total spent"
            />
          ) : (
            <View style={{ paddingVertical: 28, alignItems: "center", justifyContent: "center" }}>
              <Feather name="check-circle" size={28} color="#10B981" />
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
        <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
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
            <HBarChart items={deptSpend} formatValue={v => `${settings.currency} ${fmt(v)}`} />
          ) : (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No departmental disbursements recorded.</Text>
            </View>
          )}
        </View>

        {/* Budget Utilization Bars */}
        <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
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
            <HBarChart items={budgetItems} formatValue={v => `${settings.currency} ${fmt(v)}`} />
          ) : (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No active budgets configured.</Text>
            </View>
          )}

          {/* Budget progress summary */}
          <View style={styles.budgetSummaryRow}>
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
              {txStats.totalCount} Records · {txStats.inflowCount} Inflows · {txStats.outflowCount} Outflows
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.smBtn, { borderColor: colors.primary + "44", backgroundColor: colors.primary + "15" }]}
            onPress={() => setAllTxModal(true)}
          >
            <Text style={[styles.smBtnText, { color: colors.primary }]}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.txStatsGrid}>
          <View style={[styles.txStatBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.txStatIcon, { backgroundColor: colors.income + "18" }]}>
              <Feather name="arrow-down-left" size={13} color={colors.income} />
            </View>
            <Text style={[styles.txStatLabel, { color: colors.mutedForeground }]}>Inflows ({txStats.inflowCount})</Text>
            <Text style={[styles.txStatVal, { color: colors.income }]}>+{settings.currency} {fmt(txStats.inflowTotal)}</Text>
          </View>

          <View style={[styles.txStatBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.txStatIcon, { backgroundColor: colors.expense + "18" }]}>
              <Feather name="arrow-up-right" size={13} color={colors.expense} />
            </View>
            <Text style={[styles.txStatLabel, { color: colors.mutedForeground }]}>Outflows ({txStats.outflowCount})</Text>
            <Text style={[styles.txStatVal, { color: colors.expense }]}>-{settings.currency} {fmt(txStats.outflowTotal)}</Text>
          </View>

          <View style={[styles.txStatBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.txStatIcon, { backgroundColor: "#38BDF818" }]}>
              <Feather name="activity" size={13} color="#38BDF8" />
            </View>
            <Text style={[styles.txStatLabel, { color: colors.mutedForeground }]}>Avg Ticket</Text>
            <Text style={[styles.txStatVal, { color: colors.foreground }]}>{settings.currency} {fmt(txStats.avgTx)}</Text>
          </View>

          <View style={[styles.txStatBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.txStatIcon, { backgroundColor: "#F59E0B18" }]}>
              <Feather name="award" size={13} color="#F59E0B" />
            </View>
            <Text style={[styles.txStatLabel, { color: colors.mutedForeground }]}>Max Transaction</Text>
            <Text style={[styles.txStatVal, { color: "#F59E0B" }]} numberOfLines={1}>
              {txStats.maxTx ? `${settings.currency} ${fmt(txStats.maxTx.amount)}` : "None"}
            </Text>
          </View>
        </View>
      </View>

      {/* ─── AI Insight Cards ─── */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {actionableInsights.length} Actionable Intelligence Insights
      </Text>

      {actionableInsights.length === 0 ? (
        <View style={[styles.disclaimerBox, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 20 }]}>
          <Feather name="check-circle" size={24} color="#10B981" />
          <Text style={[styles.disclaimerText, { color: colors.foreground, fontSize: 13, marginTop: 6 }]}>
            No anomalies or critical alerts detected. All financial metrics are within standard operational limits.
          </Text>
        </View>
      ) : (
        actionableInsights.map((insight) => {
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
                    <Feather name={conf.icon} size={15} color={conf.color} />
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
        <Feather name="cpu" size={14} color={colors.mutedForeground} />
        <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
          Insights are generated from your financial data using rule-based analytics. Data refreshes as you add records.
        </Text>
      </View>

      <AllTransactionsModal
        visible={allTxModal}
        onClose={() => setAllTxModal(false)}
        transactions={transactions}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 16,
    paddingBottom: 60,
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
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
