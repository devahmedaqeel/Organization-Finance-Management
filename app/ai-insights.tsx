import { Feather } from "@expo/vector-icons";
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
import { useResponsive } from "@/hooks/useResponsive";
import {
  NormalizedPeriod,
  aggregateTransactionsByGranularity,
  getPresetPeriod,
} from "@/services/DatePeriodService";
import { calculateFinancialHealth } from "@/services/financialHealthService";
import { generateFinancialInsights, ActionableInsight } from "@/services/financialInsightsService";

const CAT_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];

function fmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
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
  const insets = useSafeAreaInsets();
  const { chartW, hPad } = useResponsive();
  const { transactions, budgets, payroll, departments, totalIncome, totalExpenses, netBalance, budgetUtilization } = useFinance();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [allTxModal, setAllTxModal] = useState(false);
  const webTop = Platform.OS === "web" ? 67 : 0;
  const chartWidth = chartW;

  // Active dynamic timeline period
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() =>
    getPresetPeriod("last_6m")
  );
  const [trendRange, setTrendRange] = useState("6M");
  const [customPeriodName, setCustomPeriodName] = useState<string | null>(null);
  const [customSelection, setCustomSelection] = useState<any>(null);

  const profitMargin = totalIncome > 0 ? (netBalance / totalIncome) * 100 : 0;
  const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  // 1. Authoritative Financial Health Calculation
  const healthReport = useMemo(() => {
    return calculateFinancialHealth(transactions, budgets, payroll, activePeriod);
  }, [transactions, budgets, payroll, activePeriod]);

  const { healthScore, status: healthLabel, statusColor: healthColor, metrics: healthMetrics } = healthReport;

  // 2. Authoritative Actionable Insights
  const actionableInsights = useMemo(() => {
    return generateFinancialInsights(
      transactions,
      budgets,
      payroll,
      departments,
      activePeriod,
      undefined,
      settings.currency || "PKR"
    );
  }, [transactions, budgets, payroll, departments, activePeriod, settings.currency]);

  // Dynamic real-time chart data points
  const chartPoints = useMemo(() => {
    return aggregateTransactionsByGranularity(transactions, activePeriod);
  }, [transactions, activePeriod]);

  // Transaction Metrics
  const txStats = useMemo(() => {
    const totalCount = transactions.length;
    const inflows = transactions.filter(t => t.type === "income");
    const outflows = transactions.filter(t => t.type === "expense");
    const inflowTotal = inflows.reduce((s, t) => s + t.amount, 0);
    const outflowTotal = outflows.reduce((s, t) => s + t.amount, 0);
    const avgTx = totalCount > 0 ? (inflowTotal + outflowTotal) / totalCount : 0;
    
    let maxTx: any = null;
    transactions.forEach(t => {
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
  }, [transactions]);

  // Expense by category
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.filter(t => t.type === "expense").forEach(t => {
      map[t.category] = (map[t.category] ?? 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([label, value], i) => ({ label, value, color: CAT_COLORS[i] }));
  }, [transactions]);

  // Department spending
  const deptSpend = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.filter(t => t.type === "expense").forEach(t => {
      const dept = t.department || "General";
      map[dept] = (map[dept] ?? 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: CAT_COLORS[i % CAT_COLORS.length] }));
  }, [transactions]);

  // Budget bar items
  const budgetItems = useMemo(() =>
    budgets.map((b) => {
      const spent = b.spent ?? 0;
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
  [budgets, settings.currency]);

  // Real-time period growth and margin computed directly from active chart timeline data
  const { periodGrowth, periodGrowthLabel } = useMemo(() => {
    if (!chartPoints || chartPoints.length === 0) {
      return { periodGrowth: 0, periodGrowthLabel: "0.0%" };
    }

    // If multi-point timeline, compare second half trajectory to first half trajectory
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
  const { incomeGrowth, lastMonthLabel, prevMonthLabel } = useMemo(() => {
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
        lastMonthLabel: formatMonthName(latestKey),
        prevMonthLabel: formatMonthName(prevKey),
      };
    }
    return { incomeGrowth: 0, lastMonthLabel: "", prevMonthLabel: "" };
  }, [transactions]);

  // Payroll
  const totalPayroll = payroll.reduce((s, p) => s + p.baseSalary + p.bonus - p.deductions, 0);
  const avgSalary = payroll.length > 0 ? payroll.reduce((s, p) => s + p.baseSalary, 0) / payroll.length : 0;

  // Insights list
  const insights = useMemo((): Insight[] => {
    const list: Insight[] = [];
    if (netBalance > 0) {
      list.push({ title: "Positive Net Balance", detail: `Surplus of ${settings.currency} ${fmt(netBalance)} — healthy financial position.`, type: "positive", icon: "trending-up", value: `+${settings.currency} ${fmt(netBalance)}` });
    } else {
      list.push({ title: "Deficit Detected", detail: `Expenses exceed income by ${settings.currency} ${fmt(Math.abs(netBalance))}. Review non-essential spending.`, type: "alert", icon: "alert-triangle", value: `-${settings.currency} ${fmt(Math.abs(netBalance))}` });
    }
    if (profitMargin > 20) {
      list.push({ title: "Strong Profit Margin", detail: `${profitMargin.toFixed(1)}% margin indicates efficient financial management.`, type: "positive", icon: "award", value: `${profitMargin.toFixed(1)}%` });
    } else if (profitMargin < 10) {
      list.push({ title: "Low Profit Margin", detail: `${profitMargin.toFixed(1)}% margin is below healthy levels. Consider revenue diversification.`, type: "warning", icon: "bar-chart-2", value: `${profitMargin.toFixed(1)}%` });
    }
    if (budgetUtilization > 85) {
      list.push({ title: "Budget Overrun Risk", detail: `${budgetUtilization.toFixed(0)}% of budget consumed. Immediate review recommended.`, type: "alert", icon: "alert-circle", value: `${budgetUtilization.toFixed(0)}%` });
    } else if (budgetUtilization > 60) {
      list.push({ title: "Budget Progressing Normally", detail: `${budgetUtilization.toFixed(0)}% of budget used — on track for current period.`, type: "info", icon: "pie-chart", value: `${budgetUtilization.toFixed(0)}%` });
    } else {
      list.push({ title: "Budget Well Within Limits", detail: `Only ${budgetUtilization.toFixed(0)}% of budget spent. Excellent fiscal discipline.`, type: "positive", icon: "check-circle", value: `${budgetUtilization.toFixed(0)}%` });
    }
    const salaryTotal = transactions.filter(t => t.type === "expense" && t.category === "Salaries").reduce((s, t) => s + t.amount, 0);
    const salaryPct = totalExpenses > 0 ? (salaryTotal / totalExpenses) * 100 : 0;
    list.push(salaryPct > 60
      ? { title: "High Salary Ratio", detail: `Salaries = ${salaryPct.toFixed(0)}% of expenses. Consider staffing cost optimization.`, type: "warning", icon: "users", value: `${salaryPct.toFixed(0)}%` }
      : { title: "Balanced Expense Distribution", detail: `Salary expenses at ${salaryPct.toFixed(0)}% — within recommended range.`, type: "positive", icon: "check-circle", value: `${salaryPct.toFixed(0)}%` });
    const topDept = deptSpend[0];
    if (topDept) {
      list.push({ title: "Highest Spending Department", detail: `${topDept.label} has the highest expense: ${settings.currency} ${fmt(topDept.value)}. Review optimization opportunities.`, type: "info", icon: "layers", value: `${settings.currency} ${fmt(topDept.value)}` });
    }
    list.push({ title: "Payroll Summary", detail: `${payroll.length} employees · avg base salary ${settings.currency} ${fmt(avgSalary)}/month · total ${settings.currency} ${fmt(totalPayroll)}.`, type: "info", icon: "dollar-sign", value: `${settings.currency} ${fmt(totalPayroll)}` });
    
    if (lastMonthLabel && prevMonthLabel) {
      list.push({
        title: "MoM Revenue Growth",
        detail: `Revenue shifted ${incomeGrowth >= 0 ? "+" : ""}${incomeGrowth.toFixed(1)}% between ${prevMonthLabel} and ${lastMonthLabel}.`,
        type: incomeGrowth >= 0 ? "positive" : "warning",
        icon: incomeGrowth >= 0 ? "trending-up" : "trending-down",
        value: `${incomeGrowth >= 0 ? "+" : ""}${incomeGrowth.toFixed(1)}%`,
      });
    }

    return list;
  }, [netBalance, profitMargin, budgetUtilization, totalExpenses, transactions, deptSpend, payroll, avgSalary, totalPayroll, settings.currency, lastMonthLabel, prevMonthLabel, incomeGrowth]);

  const positiveCount = insights.filter(i => i.type === "positive").length;
  const warningCount = insights.filter(i => i.type === "warning" || i.type === "alert").length;

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

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Fixed Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: webTop + insets.top + (Platform.OS === "android" ? 20 : 12),
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={handleGoBack}
            style={[styles.backBtn, { borderColor: colors.border }]}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.titleRow}>
            <View style={[styles.aiIcon, { backgroundColor: "#10B98122" }]}>
              <Feather name="zap" size={16} color="#10B981" />
            </View>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>AI Insights</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {settings.organizationName || "Smart Financial Intelligence"}
              </Text>
            </View>
          </View>
          <View style={{ width: 38 }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: 14, paddingBottom: Math.max(insets.bottom, 16) + 60, paddingHorizontal: hPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Health Score Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Financial Health Score</Text>
          <View style={styles.healthRow}>
            <RingProgress
              percentage={healthScore}
              size={120}
              strokeWidth={11}
              color={healthColor}
              label={healthLabel}
            />
            <View style={styles.healthRight}>
              <Text style={[styles.healthScore, { color: healthColor }]}>{healthScore}<Text style={styles.healthScoreMax}>/100</Text></Text>
              <Text style={[styles.healthLabel, { color: healthColor }]}>{healthLabel}</Text>
            <View style={styles.healthStats}>
              {[
                { label: "Net Balance", value: `${netBalance >= 0 ? "+" : ""}${settings.currency} ${fmt(netBalance)}`, color: netBalance >= 0 ? "#10B981" : "#F43F5E" },
                { label: "Profit Margin", value: `${profitMargin.toFixed(1)}%`, color: profitMargin > 10 ? "#10B981" : "#F59E0B" },
                { label: "Budget Used", value: `${budgetUtilization.toFixed(0)}%`, color: budgetUtilization < 75 ? "#10B981" : "#F43F5E" },
                { label: "MoM Growth", value: `${incomeGrowth >= 0 ? "+" : ""}${incomeGrowth.toFixed(1)}%`, color: incomeGrowth >= 0 ? "#10B981" : "#F43F5E" },
              ].map((s, i) => (
                <View key={i} style={styles.healthStat}>
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
            <Text style={[styles.badgeText, { color: "#3B82F6" }]}>{insights.length} Total</Text>
          </View>
        </View>
      </View>

      {/* Monthly Trend */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Financial Trend</Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              Income vs Expenses · {activePeriod.label}
            </Text>
          </View>
          <View style={[styles.growthBadge, { backgroundColor: periodGrowth >= 0 ? "#10B98122" : "#F43F5E22", borderColor: periodGrowth >= 0 ? "#10B98144" : "#F43F5E44" }]}>
            <Feather name={periodGrowth >= 0 ? "trending-up" : "trending-down"} size={12} color={periodGrowth >= 0 ? "#10B981" : "#F43F5E"} />
            <Text style={[styles.growthText, { color: periodGrowth >= 0 ? "#10B981" : "#F43F5E" }]}>
              {periodGrowthLabel}
            </Text>
          </View>
        </View>
        <AreaLineChart
          data={chartPoints}
          width={chartWidth - 28}
          height={165}
          currency={settings.currency}
          activeRange={customSelection ? undefined : trendRange}
          activePeriod={activePeriod}
          onPeriodSelect={(p) => {
            setActivePeriod(p);
            setCustomPeriodName(p.label);
          }}
          onRangeSelect={(range) => {
            setTrendRange(range);
            setCustomPeriodName(null);
            setCustomSelection(null);
          }}
          onCustomDateSelect={(selection) => {
            setCustomSelection(selection);
            if (selection.presetName) setCustomPeriodName(selection.presetName);
          }}
          ranges={["1W", "2W", "1M", "3M", "6M", "1Y"]}
          transactions={transactions}
          userId={user?.id || "default"}
        />
      </View>

      {/* 3 Key Rings */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Key Metrics</Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Financial performance indicators</Text>
          </View>
        </View>
        <View style={styles.ringsRow}>
          {/* Ring 1: Profit Margin */}
          <View style={styles.ringItem}>
            <RingProgress
              percentage={Math.min(Math.max(profitMargin, 0), 100)}
              centerLabel={`${profitMargin.toFixed(0)}%`}
              size={98}
              strokeWidth={9}
              color={profitMargin > 15 ? "#10B981" : profitMargin > 5 ? "#F59E0B" : "#F43F5E"}
              label="Profit"
              sublabel="MARGIN"
            />
            <View
              style={[
                styles.ringStatusPill,
                {
                  backgroundColor: (profitMargin > 15 ? "#10B981" : profitMargin > 5 ? "#F59E0B" : "#F43F5E") + "18",
                  borderColor: (profitMargin > 15 ? "#10B981" : profitMargin > 5 ? "#F59E0B" : "#F43F5E") + "44",
                },
              ]}
            >
              <Text
                style={[
                  styles.ringStatusText,
                  { color: profitMargin > 15 ? "#10B981" : profitMargin > 5 ? "#F59E0B" : "#F43F5E" },
                ]}
              >
                {profitMargin > 20 ? "High Surplus" : profitMargin > 10 ? "Moderate" : "Low Margin"}
              </Text>
            </View>
          </View>

          {/* Ring 2: Budget Utilization */}
          <View style={styles.ringItem}>
            <RingProgress
              percentage={budgetUtilization}
              centerLabel={`${budgetUtilization.toFixed(0)}%`}
              size={98}
              strokeWidth={9}
              color={budgetUtilization <= 75 ? "#10B981" : budgetUtilization <= 95 ? "#F59E0B" : "#F43F5E"}
              label="Budget"
              sublabel="USED"
            />
            <View
              style={[
                styles.ringStatusPill,
                {
                  backgroundColor: (budgetUtilization <= 75 ? "#10B981" : budgetUtilization <= 95 ? "#F59E0B" : "#F43F5E") + "18",
                  borderColor: (budgetUtilization <= 75 ? "#10B981" : budgetUtilization <= 95 ? "#F59E0B" : "#F43F5E") + "44",
                },
              ]}
            >
              <Text
                style={[
                  styles.ringStatusText,
                  { color: budgetUtilization <= 75 ? "#10B981" : budgetUtilization <= 95 ? "#F59E0B" : "#F43F5E" },
                ]}
              >
                {budgetUtilization <= 75 ? "On Track" : budgetUtilization <= 95 ? "Near Limit" : "Over Budget"}
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
              color={expenseRatio < 70 ? "#10B981" : "#F43F5E"}
              label="Expense"
              sublabel="RATIO"
            />
            <View
              style={[
                styles.ringStatusPill,
                {
                  backgroundColor: (expenseRatio < 70 ? "#10B981" : "#F43F5E") + "18",
                  borderColor: (expenseRatio < 70 ? "#10B981" : "#F43F5E") + "44",
                },
              ]}
            >
              <Text
                style={[
                  styles.ringStatusText,
                  { color: expenseRatio < 70 ? "#10B981" : "#F43F5E" },
                ]}
              >
                {expenseRatio < 60 ? "Low Burn" : expenseRatio < 80 ? "Moderate" : "High Outflow"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Expense Category Donut */}
      {expenseByCategory.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Expense Breakdown</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Where your money is going</Text>
          <DonutChart
            segments={expenseByCategory}
            size={146}
            strokeWidth={14}
            currency={settings.currency}
            centerLabel={`${settings.currency} ${fmt(totalExpenses)}`}
            centerSub="total spent"
          />
        </View>
      )}

      {/* Department Spending Bars */}
      {deptSpend.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Department Spending</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Expense allocation by unit</Text>
            </View>
            <TouchableOpacity
              style={[styles.smBtn, { borderColor: colors.border }]}
              onPress={() => router.push("/departments")}
            >
              <Text style={[styles.smBtnText, { color: colors.primary }]}>Details</Text>
            </TouchableOpacity>
          </View>
          <HBarChart items={deptSpend} formatValue={v => `${settings.currency} ${fmt(v)}`} />
        </View>
      )}

      {/* Budget Utilization Bars */}
      {budgetItems.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Budget vs Actual</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Spending per budget category</Text>
            </View>
            <TouchableOpacity
              style={[styles.smBtn, { borderColor: colors.border }]}
              onPress={() => router.push("/budget")}
            >
              <Text style={[styles.smBtnText, { color: colors.primary }]}>Manage</Text>
            </TouchableOpacity>
          </View>
          <HBarChart items={budgetItems} formatValue={v => `${settings.currency} ${fmt(v)}`} />
          {/* Budget progress summary */}
          <View style={styles.budgetSummaryRow}>
            {[
              { label: "Total Allocated", value: `${settings.currency} ${fmt(budgets.reduce((s, b) => s + b.allocated, 0))}`, color: colors.primary },
              { label: "Total Spent", value: `${settings.currency} ${fmt(budgets.reduce((s, b) => s + (b.spent ?? 0), 0))}`, color: colors.expense },
              { label: "Remaining", value: `${settings.currency} ${fmt(Math.max(budgets.reduce((s, b) => s + b.allocated - (b.spent ?? 0), 0), 0))}`, color: colors.income },
            ].map((s, i) => (
              <View key={i} style={[styles.budgetSumCard, { backgroundColor: s.color + "15", borderColor: s.color + "33" }]}>
                <Text style={[styles.budgetSumValue, { color: s.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{s.value}</Text>
                <Text style={[styles.budgetSumLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Total Transactions Analytics & Ledger Overview Card */}
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

      {/* AI Insight Cards */}
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
            <TouchableOpacity
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
              onPress={() => {
                if (insight.actionRoute) router.push(insight.actionRoute as any);
              }}
              activeOpacity={insight.actionRoute ? 0.85 : 1}
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
              <View style={{ backgroundColor: colors.background, padding: 8, borderRadius: 8, borderLeftWidth: 2, borderLeftColor: conf.color }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, marginBottom: 2 }}>
                  WHY THIS MATTERS
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 16 }}>
                  {insight.whyItMatters}
                </Text>
              </View>

              {/* ACTION */}
              {insight.isActionable && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: conf.color, flex: 1 }}>
                    👉 {insight.recommendedAction}
                  </Text>
                  {insight.actionRoute && (
                    <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary }}>
                      Resolve →
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}

      {/* Disclaimer */}
      <View style={[styles.disclaimerBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  container: { paddingHorizontal: 16, gap: 12 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontSize: 15.5, fontFamily: "Inter_700Bold" },
  cardSub: { fontSize: 11.5, fontFamily: "Inter_400Regular", marginTop: -2 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },

  healthRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  healthRight: { flex: 1, gap: 5 },
  healthScore: { fontSize: 34, fontFamily: "Inter_800ExtraBold" },
  healthScoreMax: { fontSize: 16, fontFamily: "Inter_500Medium" },
  healthLabel: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  healthStats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  healthStat: { gap: 2 },
  healthStatValue: { fontSize: 12.5, fontFamily: "Inter_700Bold" },
  healthStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },

  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4.5, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11.5, fontFamily: "Inter_600SemiBold" },

  growthBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4.5, borderRadius: 20, borderWidth: 1 },
  growthText: { fontSize: 11.5, fontFamily: "Inter_700Bold" },

  ringsRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 4 },
  ringItem: { alignItems: "center", gap: 6 },
  ringStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  ringStatusText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },

  smBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  smBtnText: { fontSize: 11.5, fontFamily: "Inter_600SemiBold" },

  budgetSummaryRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  budgetSumCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 9, alignItems: "center", gap: 2 },
  budgetSumValue: { fontSize: 12.5, fontFamily: "Inter_800ExtraBold", textAlign: "center" },
  budgetSumLabel: { fontSize: 9.5, fontFamily: "Inter_500Medium", textAlign: "center" },

  sectionTitle: { fontSize: 16.5, fontFamily: "Inter_700Bold", marginTop: 4 },
  insightCard: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, padding: 13, flexDirection: "row", gap: 12 },
  insightIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  insightContent: { flex: 1, gap: 5 },
  insightHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  insightTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  insightValue: { fontSize: 12.5, fontFamily: "Inter_700Bold", flexShrink: 0 },
  typeBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 20, marginTop: 2 },
  typeBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  insightDetail: { fontSize: 11.5, fontFamily: "Inter_400Regular", lineHeight: 16.5 },

  disclaimerBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  disclaimerText: { flex: 1, fontSize: 10.5, fontFamily: "Inter_400Regular", lineHeight: 15 },

  /* Transaction Statistics Grid */
  txStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    marginTop: 2,
  },
  txStatBox: {
    width: "48.5%",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
  },
  txStatIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  txStatLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  txStatVal: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
  },
});
