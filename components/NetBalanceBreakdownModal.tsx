import React, { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "./UniversalIcon";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Transaction, Department, Budget } from "@/context/FinanceContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { AreaLineChart } from "./AreaLineChart";
import { DonutChart, DonutSegment } from "./DonutChart";
import {
  NormalizedPeriod,
  getPresetPeriod,
  aggregateTransactionsByGranularity,
} from "@/services/DatePeriodService";
import { router } from "expo-router";

interface Props {
  visible: boolean;
  onClose: () => void;
  transactions: Transaction[];
  departments?: Department[];
  budgets?: Budget[];
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  onOpenStatement?: () => void;
}

type TabType = "overview" | "mom" | "income" | "expense" | "departments" | "guide";

const CAT_PALETTE = ["#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];
const EXP_PALETTE = ["#F43F5E", "#FB923C", "#FBBF24", "#A855F7", "#64748B", "#EC4899", "#E11D48"];

export function NetBalanceBreakdownModal({
  visible,
  onClose,
  transactions,
  departments = [],
  budgets = [],
  totalIncome,
  totalExpenses,
  netBalance,
  onOpenStatement,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [modalBalanceMode, setModalBalanceMode] = useState<"budget" | "cashflow">("budget");
  const [expandedFormula, setExpandedFormula] = useState<string | null>("surplus");

  const totalLineBudgeted = budgets.reduce((s, b) => s + (b.allocated || 0), 0);
  const totalDeptBudgeted = departments.reduce((s, d) => s + (d.budgetAllocated || 0), 0);
  const totalBudgeted = totalLineBudgeted > 0 ? totalLineBudgeted : totalDeptBudgeted;
  const netBudgetRemaining = totalBudgeted - totalExpenses;
  const netBudgetUtilization = totalBudgeted > 0 ? (totalExpenses / totalBudgeted) * 100 : 0;
  const currentModalBalance = (modalBalanceMode === "budget" && totalBudgeted > 0) ? netBudgetRemaining : netBalance;
  const isCurrentModalSurplus = currentModalBalance >= 0;

  const [trendRange, setTrendRange] = useState<string>("6M");
  const [customPeriodName, setCustomPeriodName] = useState<string | null>(null);
  const [customSelection, setCustomSelection] = useState<any | null>(null);
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() =>
    getPresetPeriod("last_6m")
  );

  const dynamicChartData = useMemo(() => {
    return aggregateTransactionsByGranularity(transactions, activePeriod);
  }, [transactions, activePeriod]);

  const chartWidth = Math.max(windowWidth - 64, 300);

  const fmt = (n: number) => {
    return Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const fmtShort = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(Math.round(n));
  };

  const isSurplus = netBalance >= 0;
  const statusColor = isSurplus ? colors.income : colors.expense;
  const marginPct = totalIncome > 0 ? (netBalance / totalIncome) * 100 : 0;
  const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
  const coverageRatio = totalExpenses > 0 ? totalIncome / totalExpenses : totalIncome > 0 ? 99 : 0;

  // Month-over-Month (MoM) Financial Data Aggregation & Chart Points
  const { monthlyData, chartPoints, peakSurplusMonth, lowestDeficitMonth, latestMonthData, prevMonthData } = useMemo(() => {
    const map: Record<string, { monthKey: string; monthLabel: string; income: number; expense: number; txCount: number }> = {};

    transactions.forEach((t) => {
      if (!t.date) return;
      const monthKey = t.date.substring(0, 7); // e.g. "2026-05"
      if (!map[monthKey]) {
        const [y, m] = monthKey.split("-");
        const dateObj = new Date(parseInt(y), parseInt(m) - 1, 1);
        const monthLabel = isNaN(dateObj.getTime())
          ? monthKey
          : dateObj.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        map[monthKey] = { monthKey, monthLabel, income: 0, expense: 0, txCount: 0 };
      }
      if (t.type === "income") map[monthKey].income += t.amount;
      else if (t.type === "expense") map[monthKey].expense += t.amount;
      map[monthKey].txCount += 1;
    });

    const sorted = Object.values(map).sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    const processedMonthly = sorted.map((cur, idx) => {
      const net = cur.income - cur.expense;
      const margin = cur.income > 0 ? (net / cur.income) * 100 : 0;
      let momShiftLabel = "Baseline";
      let isPositiveShift = true;
      let diffAmount = 0;

      if (idx > 0) {
        const prev = sorted[idx - 1];
        const prevNet = prev.income - prev.expense;
        diffAmount = net - prevNet;
        isPositiveShift = diffAmount >= 0;
        momShiftLabel = `${diffAmount >= 0 ? "+" : "-"}${settings.currency} ${fmtShort(Math.abs(diffAmount))}`;
      }

      return {
        ...cur,
        net,
        margin,
        diffAmount,
        momShiftLabel,
        isPositiveShift,
        hasPrev: idx > 0,
      };
    });

    const points = processedMonthly.map((m) => ({
      label: m.monthLabel.split(" ")[0] || m.monthLabel,
      income: m.income,
      expense: m.expense,
      fullDate: m.monthLabel,
    }));

    let peak: any = null;
    let lowest: any = null;

    processedMonthly.forEach((m) => {
      if (!peak || m.net > peak.net) peak = m;
      if (!lowest || m.net < lowest.net) lowest = m;
    });

    const latest = processedMonthly.length > 0 ? processedMonthly[processedMonthly.length - 1] : null;
    const prev = processedMonthly.length > 1 ? processedMonthly[processedMonthly.length - 2] : null;

    return {
      monthlyData: processedMonthly,
      chartPoints: points,
      peakSurplusMonth: peak,
      lowestDeficitMonth: lowest,
      latestMonthData: latest,
      prevMonthData: prev,
    };
  }, [transactions, settings.currency]);

  // Largest Single Transactions (High/Low)
  const { largestInflow, largestOutflow } = useMemo(() => {
    let topIn: Transaction | null = null;
    let topOut: Transaction | null = null;

    transactions.forEach((t) => {
      if (t.type === "income") {
        if (!topIn || t.amount > topIn.amount) topIn = t;
      } else if (t.type === "expense") {
        if (!topOut || t.amount > topOut.amount) topOut = t;
      }
    });

    return { largestInflow: topIn, largestOutflow: topOut };
  }, [transactions]);

  // Overall MoM Growth (Comparing latest month to previous month)
  const latestMoMInfo = useMemo(() => {
    if (monthlyData.length < 2) return { text: "Baseline", isPositive: true, sub: "Net Momentum" };
    const latest = monthlyData[monthlyData.length - 1];
    const prev = monthlyData[monthlyData.length - 2];
    const diff = latest.net - prev.net;
    const formattedDiff = `${diff >= 0 ? "+" : "-"}${settings.currency} ${fmtShort(Math.abs(diff))}`;
    return {
      text: formattedDiff,
      isPositive: diff >= 0,
      sub: diff >= 0 ? "Surplus Growth" : "Deficit Shift",
    };
  }, [monthlyData, settings.currency]);

  // Income Breakdown by Category + Donut Segments
  const { incomeCategories, incomeDonutSegments } = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    transactions
      .filter((t) => t.type === "income")
      .forEach((t) => {
        const cat = t.category || "General Income";
        if (!map[cat]) map[cat] = { amount: 0, count: 0 };
        map[cat].amount += t.amount;
        map[cat].count += 1;
      });

    const list = Object.entries(map)
      .map(([category, { amount, count }], idx) => ({
        category,
        amount,
        count,
        pct: totalIncome > 0 ? (amount / totalIncome) * 100 : 0,
        avg: count > 0 ? amount / count : 0,
        color: CAT_PALETTE[idx % CAT_PALETTE.length],
      }))
      .sort((a, b) => b.amount - a.amount);

    const segments: DonutSegment[] = list.map((item) => ({
      label: item.category,
      value: item.amount,
      color: item.color,
    }));

    return { incomeCategories: list, incomeDonutSegments: segments };
  }, [transactions, totalIncome]);

  // Expense Breakdown by Category + Donut Segments
  const { expenseCategories, expenseDonutSegments } = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const cat = t.category || "General Expense";
        if (!map[cat]) map[cat] = { amount: 0, count: 0 };
        map[cat].amount += t.amount;
        map[cat].count += 1;
      });

    const list = Object.entries(map)
      .map(([category, { amount, count }], idx) => ({
        category,
        amount,
        count,
        pct: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
        avg: count > 0 ? amount / count : 0,
        color: EXP_PALETTE[idx % EXP_PALETTE.length],
      }))
      .sort((a, b) => b.amount - a.amount);

    const segments: DonutSegment[] = list.map((item) => ({
      label: item.category,
      value: item.amount,
      color: item.color,
    }));

    return { expenseCategories: list, expenseDonutSegments: segments };
  }, [transactions, totalExpenses]);

  // Department Net Analysis
  const deptAnalysis = useMemo(() => {
    const map: Record<string, { name: string; income: number; expense: number; count: number; allocated: number }> = {};

    departments.forEach((d) => {
      map[d.name] = { name: d.name, income: 0, expense: 0, count: 0, allocated: d.budgetAllocated || 0 };
    });

    transactions.forEach((t) => {
      const deptName = t.department || "General Administration";
      if (!map[deptName]) {
        map[deptName] = { name: deptName, income: 0, expense: 0, count: 0, allocated: 0 };
      }
      if (t.type === "income") map[deptName].income += t.amount;
      else if (t.type === "expense") map[deptName].expense += t.amount;
      map[deptName].count += 1;
    });

    return Object.values(map)
      .map((d) => ({
        ...d,
        net: d.income - d.expense,
        spentPct: totalExpenses > 0 ? (d.expense / totalExpenses) * 100 : 0,
        burnRate: d.allocated > 0 ? (d.expense / d.allocated) * 100 : 0,
      }))
      .sort((a, b) => b.expense - a.expense);
  }, [transactions, departments, totalExpenses]);

  const toggleFormula = (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedFormula(expandedFormula === id ? null : id);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingTop: Platform.OS === "android" ? 14 : 10,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            },
          ]}
        >
          {/* Top Handle */}
          <View style={styles.handle} />

          {/* Modal Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.iconWrap, { backgroundColor: statusColor + "18" }]}>
                <Feather name="trending-up" size={17} color={statusColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.foreground }]}>Net Operating Balance</Text>
                <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  Executive Fiscal Dossier · {settings.organizationName || "OFM"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.muted }]}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
            >
              <Feather name="x" size={17} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Compact Horizontal Filter Chips Bar */}
          <View style={styles.tabBarWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabBar}
            >
              {[
                { id: "overview", label: "Overview", icon: "activity" },
                { id: "guide", label: "Formulas", icon: "book-open" },
                { id: "mom", label: "MoM Growth", icon: "calendar" },
                { id: "income", label: "Revenue", icon: "arrow-down-left" },
                { id: "expense", label: "Expenditures", icon: "arrow-up-right" },
                { id: "departments", label: "Departments", icon: "layers" },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[
                      styles.tabPill,
                      {
                        backgroundColor: isActive ? colors.primary : colors.card,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveTab(tab.id as TabType);
                    }}
                  >
                    <Feather
                      name={tab.icon as any}
                      size={12}
                      color={isActive ? "#FFFFFF" : colors.mutedForeground}
                    />
                    <Text style={[styles.tabPillText, { color: isActive ? "#FFFFFF" : colors.foreground }]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            
            {/* TAB 1: OVERVIEW & SURPLUS HIGHLIGHTS */}
            {activeTab === "overview" && (
              <>
                {/* Primary Net Balance Hero Card */}
                <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {/* Mode Switcher */}
                  {totalBudgeted > 0 && (
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingVertical: 7,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: modalBalanceMode === "budget" ? colors.primary : (colors.cardAlt ?? colors.muted),
                          borderWidth: 1,
                          borderColor: modalBalanceMode === "budget" ? colors.primary : colors.border,
                        }}
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setModalBalanceMode("budget");
                        }}
                      >
                        <Feather name="pie-chart" size={12} color={modalBalanceMode === "budget" ? "#FFFFFF" : colors.mutedForeground} />
                        <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: modalBalanceMode === "budget" ? "#FFFFFF" : colors.mutedForeground }}>
                          Budget Balance ({netBudgetRemaining >= 0 ? "+" : ""}{settings.currency} {fmtShort(netBudgetRemaining)})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingVertical: 7,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: modalBalanceMode === "cashflow" ? colors.primary : (colors.cardAlt ?? colors.muted),
                          borderWidth: 1,
                          borderColor: modalBalanceMode === "cashflow" ? colors.primary : colors.border,
                        }}
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setModalBalanceMode("cashflow");
                        }}
                      >
                        <Feather name="trending-up" size={12} color={modalBalanceMode === "cashflow" ? "#FFFFFF" : colors.mutedForeground} />
                        <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: modalBalanceMode === "cashflow" ? "#FFFFFF" : colors.mutedForeground }}>
                          Cashflow Net ({netBalance >= 0 ? "+" : ""}{settings.currency} {fmtShort(netBalance)})
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={styles.heroTopRow}>
                    <View>
                      <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? "REMAINING OPERATING BUDGET" : "NET OPERATING CASHFLOW"}
                      </Text>
                      <Text style={[styles.heroValue, { color: isCurrentModalSurplus ? colors.income : colors.expense }]}>
                        {isCurrentModalSurplus ? "+" : "-"}
                        {settings.currency} {fmt(Math.abs(currentModalBalance))}
                      </Text>
                      {modalBalanceMode === "budget" && totalBudgeted > 0 && (
                        <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2, fontFamily: "Inter_500Medium" }}>
                          Allocated: {settings.currency} {fmt(totalBudgeted)} · Spend: {settings.currency} {fmt(totalExpenses)}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: (isCurrentModalSurplus ? colors.income : colors.expense) + "18", borderColor: (isCurrentModalSurplus ? colors.income : colors.expense) + "44" }]}>
                      <View style={[styles.statusDot, { backgroundColor: isCurrentModalSurplus ? colors.income : colors.expense }]} />
                      <Text style={[styles.statusPillText, { color: isCurrentModalSurplus ? colors.income : colors.expense }]}>
                        {modalBalanceMode === "budget" && totalBudgeted > 0
                          ? (isCurrentModalSurplus ? "HEALTHY BUDGET BUFFER" : "BUDGET OVERRUN")
                          : (isSurplus ? "HEALTHY SURPLUS" : "OPERATING DEFICIT")}
                      </Text>
                    </View>
                  </View>

                  {/* Operating Metrics Strip */}
                  <View style={styles.metricsStrip}>
                    <View style={[styles.metricBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.metricBlockLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? "Budget Used" : "Operating Margin"}
                      </Text>
                      <Text style={[styles.metricBlockVal, { color: modalBalanceMode === "budget" && totalBudgeted > 0 ? (netBudgetUtilization > 100 ? colors.expense : colors.income) : (marginPct >= 0 ? colors.income : colors.expense) }]} numberOfLines={1} adjustsFontSizeToFit>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? `${netBudgetUtilization.toFixed(1)}%` : `${marginPct.toFixed(1)}%`}
                      </Text>
                      <Text style={[styles.metricBlockSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? `${settings.currency} ${fmtShort(totalExpenses)} Spend` : (marginPct >= 20 ? "High Efficiency" : marginPct >= 5 ? "Healthy Range" : "Tight Buffer")}
                      </Text>
                    </View>
                    <View style={[styles.metricBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.metricBlockLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? "Budget Cap" : "Coverage Ratio"}
                      </Text>
                      <Text style={[styles.metricBlockVal, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? `${settings.currency} ${fmtShort(totalBudgeted)}` : (coverageRatio >= 90 ? "99x" : `${coverageRatio.toFixed(2)}x`)}
                      </Text>
                      <Text style={[styles.metricBlockSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? "Total Allocated" : "Inflows / Outflows"}
                      </Text>
                    </View>
                    <View style={[styles.metricBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.metricBlockLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? "Remaining" : "MoM Shift"}
                      </Text>
                      <Text style={[styles.metricBlockVal, { color: isCurrentModalSurplus ? colors.income : colors.expense }]} numberOfLines={1} adjustsFontSizeToFit>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? `${netBudgetRemaining >= 0 ? "+" : "-"}${settings.currency} ${fmtShort(Math.abs(netBudgetRemaining))}` : latestMoMInfo.text}
                      </Text>
                      <Text style={[styles.metricBlockSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {modalBalanceMode === "budget" && totalBudgeted > 0 ? "Available Buffer" : latestMoMInfo.sub}
                      </Text>
                    </View>
                  </View>

                  {/* Revenue vs Outflow Comparison Bar */}
                  <View style={styles.progressContainer}>
                    <View style={styles.progressLabelRow}>
                      <Text style={{ fontSize: 11, color: colors.income, fontFamily: "Inter_700Bold" }}>
                        Inflows: +{settings.currency} {fmt(totalIncome)} ({totalIncome + totalExpenses > 0 ? ((totalIncome / (totalIncome + totalExpenses)) * 100).toFixed(0) : 0}%)
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.expense, fontFamily: "Inter_700Bold" }}>
                        Outflows: -{settings.currency} {fmt(totalExpenses)} ({totalIncome + totalExpenses > 0 ? ((totalExpenses / (totalIncome + totalExpenses)) * 100).toFixed(0) : 0}%)
                      </Text>
                    </View>
                    <View style={[styles.progressBarTrack, { backgroundColor: colors.expense + "33", overflow: "hidden", flexDirection: "row" }]}>
                      <View
                        style={{
                          height: "100%",
                          width: `${Math.min(
                            Math.max(
                              totalIncome + totalExpenses > 0
                                ? (totalIncome / (totalIncome + totalExpenses)) * 100
                                : 50,
                              5
                            ),
                            95
                          )}%`,
                          backgroundColor: colors.income,
                        }}
                      />
                      <View
                        style={{
                          height: "100%",
                          width: `${Math.min(
                            Math.max(
                              totalIncome + totalExpenses > 0
                                ? (totalExpenses / (totalIncome + totalExpenses)) * 100
                                : 50,
                              5
                            ),
                            95
                          )}%`,
                          backgroundColor: colors.expense,
                        }}
                      />
                    </View>
                  </View>
                </View>

                {/* Educational Banner - Tap to learn formulas */}
                <TouchableOpacity
                  style={[styles.guideBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveTab("guide");
                  }}
                  activeOpacity={0.85}
                >
                  <View style={[styles.guideIconWrap, { backgroundColor: colors.primary + "22" }]}>
                    <Feather name="help-circle" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.guideBannerTitle, { color: colors.foreground }]}>How are Surplus & Margin Calculated?</Text>
                    <Text style={[styles.guideBannerSub, { color: colors.mutedForeground }]}>
                      Step-by-step derivation: Inflows, Outflows, Margin & MoM shift explained.
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.primary} />
                </TouchableOpacity>

                {/* Interactive Monthly Inflow vs Outflow Trend Chart */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.chartHeaderRow}>
                    <View>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]}>Fiscal Velocity & Trend</Text>
                      <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                        {customPeriodName || activePeriod.label} · Inflows vs Outflows
                      </Text>
                    </View>
                    <View style={[styles.legendPill, { backgroundColor: colors.income + "18" }]}>
                      <View style={[styles.legendDot, { backgroundColor: colors.income }]} />
                      <Text style={[styles.legendText, { color: colors.income }]}>Inflows</Text>
                      <View style={[styles.legendDot, { backgroundColor: colors.expense, marginLeft: 6 }]} />
                      <Text style={[styles.legendText, { color: colors.expense }]}>Outflows</Text>
                    </View>
                  </View>
                  <AreaLineChart
                    data={dynamicChartData}
                    width={chartWidth}
                    height={160}
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
                  />
                </View>

                {/* Quick Statement & Reports Action Row */}
                <View style={styles.actionRow}>
                  {onOpenStatement ? (
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onOpenStatement();
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="file-text" size={14} color="#FFFFFF" />
                      <Text style={styles.primaryActionText}>Official Statement</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onClose();
                      router.push("/(tabs)/reports");
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="bar-chart-2" size={14} color={colors.foreground} />
                    <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>Full Reports</Text>
                  </TouchableOpacity>
                </View>

                {/* Quick MoM Highlight Card */}
                <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 13 }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>RECENT MONTHS SURPLUS TREND</Text>
                    <TouchableOpacity onPress={() => setActiveTab("mom")}>
                      <Text style={{ fontSize: 11, color: colors.primary, fontFamily: "Inter_700Bold" }}>See All ({monthlyData.length}) →</Text>
                    </TouchableOpacity>
                  </View>
                  {monthlyData.slice(-3).reverse().map((m) => (
                    <View key={m.monthKey} style={[styles.momMiniRow, { borderTopColor: colors.border }]}>
                      <View>
                        <Text style={[styles.momMonthName, { color: colors.foreground }]}>{m.monthLabel}</Text>
                        <Text style={[styles.momSubInfo, { color: colors.mutedForeground }]}>
                          +{settings.currency} {fmtShort(m.income)} · -{settings.currency} {fmtShort(m.expense)}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.momNetVal, { color: m.net >= 0 ? colors.income : colors.expense }]}>
                          {m.net >= 0 ? "+" : "-"}{settings.currency} {fmt(Math.abs(m.net))}
                        </Text>
                        <View style={[styles.momGrowthBadge, { backgroundColor: (m.isPositiveShift ? colors.income : colors.expense) + "18" }]}>
                          <Text style={[styles.momGrowthText, { color: m.isPositiveShift ? colors.income : colors.expense }]}>
                            {m.momShiftLabel}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* TAB 2: DETAILED FORMULAS, DERIVATIONS & MILESTONES */}
            {activeTab === "guide" && (
              <View style={{ gap: 12 }}>
                
                {/* Institutional Fiscal Derivation Summary Box */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <Feather name="check-circle" size={16} color={statusColor} />
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>Institutional Fiscal Derivation</Text>
                  </View>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                    How total earned revenues and expenditures reconcile into the active balance.
                  </Text>

                  <View style={styles.derivationFlow}>
                    <View style={[styles.derivationStepBox, { backgroundColor: colors.income + "12", borderColor: colors.income + "33" }]}>
                      <Text style={[styles.derivationStepNum, { color: colors.income }]}>STEP 1: TOTAL REVENUES</Text>
                      <Text style={[styles.derivationStepVal, { color: colors.income }]}>+{settings.currency} {fmt(totalIncome)}</Text>
                      <Text style={[styles.derivationStepSub, { color: colors.mutedForeground }]}>
                        {incomeCategories.length} Active Revenue Categories ({transactions.filter(t => t.type === 'income').length} Deposits)
                      </Text>
                    </View>

                    <View style={styles.derivationArrowWrap}>
                      <Feather name="minus" size={16} color={colors.mutedForeground} />
                    </View>

                    <View style={[styles.derivationStepBox, { backgroundColor: colors.expense + "12", borderColor: colors.expense + "33" }]}>
                      <Text style={[styles.derivationStepNum, { color: colors.expense }]}>STEP 2: OPERATING EXPENSES</Text>
                      <Text style={[styles.derivationStepVal, { color: colors.expense }]}>-{settings.currency} {fmt(totalExpenses)}</Text>
                      <Text style={[styles.derivationStepSub, { color: colors.mutedForeground }]}>
                        {expenseCategories.length} Operational Sinks ({transactions.filter(t => t.type === 'expense').length} Payouts)
                      </Text>
                    </View>

                    <View style={styles.derivationArrowWrap}>
                      <Feather name="corner-down-right" size={16} color={statusColor} />
                    </View>

                    <View style={[styles.derivationResultCard, { backgroundColor: statusColor + "18", borderColor: statusColor + "44" }]}>
                      <Text style={[styles.derivationResultHeading, { color: statusColor }]}>
                        FINAL NET BALANCE = {isSurplus ? "+" : "-"}{settings.currency} {fmt(Math.abs(netBalance))} ({isSurplus ? "SURPLUS BUFFER" : "DEFICIT DRAIN"})
                      </Text>
                      <Text style={[styles.derivationResultNote, { color: colors.foreground }]}>
                        {isSurplus
                          ? `The organization holds a positive cash surplus of ${settings.currency} ${fmt(netBalance)}, meaning ${marginPct.toFixed(1)}% of all income is retained as fiscal buffer.`
                          : `The organization has exceeded its revenues by ${settings.currency} ${fmt(Math.abs(netBalance))}. Operational expenditures require immediate budget reallocation.`}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* High & Low Milestones Header Card */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>Fiscal Milestones (High & Low Records)</Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                    Historical records and peak activity summary
                  </Text>

                  <View style={styles.milestoneGrid}>
                    {/* Peak Surplus Month */}
                    <View style={[styles.milestoneBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={[styles.milestoneIcon, { backgroundColor: colors.income + "18" }]}>
                        <Feather name="award" size={14} color={colors.income} />
                      </View>
                      <Text style={[styles.milestoneLabel, { color: colors.mutedForeground }]}>Peak Surplus Month</Text>
                      <Text style={[styles.milestoneVal, { color: colors.income }]}>
                        {peakSurplusMonth ? `+${settings.currency} ${fmt(peakSurplusMonth.net)}` : "None"}
                      </Text>
                      <Text style={[styles.milestoneSub, { color: colors.mutedForeground }]}>
                        {peakSurplusMonth ? peakSurplusMonth.monthLabel : "N/A"}
                      </Text>
                    </View>

                    {/* Lowest / Deficit Month */}
                    <View style={[styles.milestoneBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={[styles.milestoneIcon, { backgroundColor: colors.expense + "18" }]}>
                        <Feather name="alert-circle" size={14} color={colors.expense} />
                      </View>
                      <Text style={[styles.milestoneLabel, { color: colors.mutedForeground }]}>Lowest Fiscal Period</Text>
                      <Text style={[styles.milestoneVal, { color: lowestDeficitMonth && lowestDeficitMonth.net < 0 ? colors.expense : colors.income }]}>
                        {lowestDeficitMonth ? `${lowestDeficitMonth.net >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(lowestDeficitMonth.net))}` : "None"}
                      </Text>
                      <Text style={[styles.milestoneSub, { color: colors.mutedForeground }]}>
                        {lowestDeficitMonth ? lowestDeficitMonth.monthLabel : "N/A"}
                      </Text>
                    </View>

                    {/* Largest Single Inflow */}
                    <View style={[styles.milestoneBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={[styles.milestoneIcon, { backgroundColor: "#38BDF818" }]}>
                        <Feather name="arrow-down-left" size={14} color="#38BDF8" />
                      </View>
                      <Text style={[styles.milestoneLabel, { color: colors.mutedForeground }]}>Largest Single Deposit</Text>
                      <Text style={[styles.milestoneVal, { color: colors.income }]}>
                        {largestInflow ? `+${settings.currency} ${fmt(largestInflow.amount)}` : "None"}
                      </Text>
                      <Text style={[styles.milestoneSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {largestInflow ? largestInflow.title : "N/A"}
                      </Text>
                    </View>

                    {/* Largest Single Outflow */}
                    <View style={[styles.milestoneBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={[styles.milestoneIcon, { backgroundColor: "#F59E0B18" }]}>
                        <Feather name="arrow-up-right" size={14} color="#F59E0B" />
                      </View>
                      <Text style={[styles.milestoneLabel, { color: colors.mutedForeground }]}>Largest Single Expense</Text>
                      <Text style={[styles.milestoneVal, { color: colors.expense }]}>
                        {largestOutflow ? `-${settings.currency} ${fmt(largestOutflow.amount)}` : "None"}
                      </Text>
                      <Text style={[styles.milestoneSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {largestOutflow ? largestOutflow.title : "N/A"}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Educational Formula Cards */}
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 4 }]}>
                  STEP-BY-STEP CALCULATION FORMULAS
                </Text>

                {/* Formula 1: Net Operating Balance */}
                <View style={[styles.formulaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.formulaHeader}
                    onPress={() => toggleFormula("surplus")}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <View style={[styles.formulaNumBadge, { backgroundColor: colors.income + "22" }]}>
                        <Text style={[styles.formulaNumText, { color: colors.income }]}>1</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.formulaTitle, { color: colors.foreground }]}>Net Operating Surplus / Deficit</Text>
                        <Text style={[styles.formulaSub, { color: colors.mutedForeground }]}>Formula: Gross Inflows − Gross Outflows</Text>
                      </View>
                    </View>
                    <Feather name={expandedFormula === "surplus" ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  {expandedFormula === "surplus" && (
                    <View style={[styles.formulaBody, { borderTopColor: colors.border }]}>
                      <Text style={[styles.formulaMath, { color: colors.foreground }]}>
                        Total Revenue ({settings.currency} {fmt(totalIncome)}) − Total Expenses ({settings.currency} {fmt(totalExpenses)})
                      </Text>
                      <View style={[styles.formulaResultBox, { backgroundColor: statusColor + "15", borderColor: statusColor + "33" }]}>
                        <Text style={[styles.formulaResultLabel, { color: colors.mutedForeground }]}>Live Calculation Result:</Text>
                        <Text style={[styles.formulaResultVal, { color: statusColor }]}>
                          {isSurplus ? "+" : "-"}{settings.currency} {fmt(Math.abs(netBalance))} ({isSurplus ? "Operating Surplus" : "Operating Deficit"})
                        </Text>
                      </View>
                      <Text style={[styles.formulaExplanation, { color: colors.mutedForeground }]}>
                        • A positive result indicates that institutional revenue exceeds operating expenses, creating a healthy fiscal surplus.
                        {"\n"}• A negative result means expenditures have exceeded revenue, requiring budget reallocation or cost control.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Formula 2: Operating Profit Margin */}
                <View style={[styles.formulaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.formulaHeader}
                    onPress={() => toggleFormula("margin")}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <View style={[styles.formulaNumBadge, { backgroundColor: "#38BDF822" }]}>
                        <Text style={[styles.formulaNumText, { color: "#38BDF8" }]}>2</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.formulaTitle, { color: colors.foreground }]}>Operating Profit Margin (%)</Text>
                        <Text style={[styles.formulaSub, { color: colors.mutedForeground }]}>Formula: (Net Surplus ÷ Total Inflows) × 100</Text>
                      </View>
                    </View>
                    <Feather name={expandedFormula === "margin" ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  {expandedFormula === "margin" && (
                    <View style={[styles.formulaBody, { borderTopColor: colors.border }]}>
                      <Text style={[styles.formulaMath, { color: colors.foreground }]}>
                        ({settings.currency} {fmt(netBalance)} ÷ {settings.currency} {fmt(totalIncome)}) × 100
                      </Text>
                      <View style={[styles.formulaResultBox, { backgroundColor: (marginPct >= 0 ? colors.income : colors.expense) + "15", borderColor: (marginPct >= 0 ? colors.income : colors.expense) + "33" }]}>
                        <Text style={[styles.formulaResultLabel, { color: colors.mutedForeground }]}>Live Calculation Result:</Text>
                        <Text style={[styles.formulaResultVal, { color: marginPct >= 0 ? colors.income : colors.expense }]}>
                          {marginPct.toFixed(1)}% Operating Profit Margin
                        </Text>
                      </View>
                      <Text style={[styles.formulaExplanation, { color: colors.mutedForeground }]}>
                        • &gt;20%: Excellent fiscal discipline & robust institutional reserve creation.
                        {"\n"}• 5%–20%: Stable operating performance with balanced budget execution.
                        {"\n"}• &lt;0%: Operating at a loss — expenses are consuming more capital than generated.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Formula 3: Revenue Cost Coverage Ratio */}
                <View style={[styles.formulaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.formulaHeader}
                    onPress={() => toggleFormula("coverage")}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <View style={[styles.formulaNumBadge, { backgroundColor: "#F59E0B22" }]}>
                        <Text style={[styles.formulaNumText, { color: "#F59E0B" }]}>3</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.formulaTitle, { color: colors.foreground }]}>Revenue Cost Coverage Ratio</Text>
                        <Text style={[styles.formulaSub, { color: colors.mutedForeground }]}>Formula: Total Revenue ÷ Total Expenses</Text>
                      </View>
                    </View>
                    <Feather name={expandedFormula === "coverage" ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>

                  {expandedFormula === "coverage" && (
                    <View style={[styles.formulaBody, { borderTopColor: colors.border }]}>
                      <Text style={[styles.formulaMath, { color: colors.foreground }]}>
                        {settings.currency} {fmt(totalIncome)} ÷ {settings.currency} {fmt(totalExpenses)}
                      </Text>
                      <View style={[styles.formulaResultBox, { backgroundColor: (coverageRatio >= 1 ? colors.income : colors.expense) + "15", borderColor: (coverageRatio >= 1 ? colors.income : colors.expense) + "33" }]}>
                        <Text style={[styles.formulaResultLabel, { color: colors.mutedForeground }]}>Live Calculation Result:</Text>
                        <Text style={[styles.formulaResultVal, { color: coverageRatio >= 1 ? colors.income : colors.expense }]}>
                          {coverageRatio >= 90 ? "99.0x" : `${coverageRatio.toFixed(2)}x`} Cost Coverage Multiplier
                        </Text>
                      </View>
                      <Text style={[styles.formulaExplanation, { color: colors.mutedForeground }]}>
                        • Measures how many times gross revenue can pay off current operating expenses.
                        {"\n"}• A value of 1.0x means break-even. Values &gt; 1.2x signify high solvency and safety buffer.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Formula 4: Month-over-Month Shift Calculation */}
                {latestMonthData && prevMonthData && (
                  <View style={[styles.formulaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TouchableOpacity
                      style={styles.formulaHeader}
                      onPress={() => toggleFormula("mom_shift")}
                      activeOpacity={0.8}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                        <View style={[styles.formulaNumBadge, { backgroundColor: "#8B5CF622" }]}>
                          <Text style={[styles.formulaNumText, { color: "#8B5CF6" }]}>4</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.formulaTitle, { color: colors.foreground }]}>MoM Fiscal Momentum Shift</Text>
                          <Text style={[styles.formulaSub, { color: colors.mutedForeground }]}>Formula: ((Current Net − Prev Net) ÷ |Prev Net|) × 100</Text>
                        </View>
                      </View>
                      <Feather name={expandedFormula === "mom_shift" ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>

                    {expandedFormula === "mom_shift" && (
                      <View style={[styles.formulaBody, { borderTopColor: colors.border }]}>
                        <Text style={[styles.formulaMath, { color: colors.foreground }]}>
                          (({settings.currency} {fmt(latestMonthData.net)} − {settings.currency} {fmt(prevMonthData.net)}) ÷ |{settings.currency} {fmt(prevMonthData.net)}|) × 100
                        </Text>
                        <View style={[styles.formulaResultBox, { backgroundColor: (latestMonthData.isPositiveShift ? colors.income : colors.expense) + "15", borderColor: (latestMonthData.isPositiveShift ? colors.income : colors.expense) + "33" }]}>
                          <Text style={[styles.formulaResultLabel, { color: colors.mutedForeground }]}>Live Calculation Result:</Text>
                          <Text style={[styles.formulaResultVal, { color: latestMonthData.isPositiveShift ? colors.income : colors.expense }]}>
                            {latestMonthData.momShiftLabel}
                          </Text>
                        </View>
                        <Text style={[styles.formulaExplanation, { color: colors.mutedForeground }]}>
                          • Compares the active month ({latestMonthData.monthLabel}) net surplus against preceding period ({prevMonthData.monthLabel}).
                          {"\n"}• Shows whether the organization has increased profit velocity or experienced cash flow contraction.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

              </View>
            )}

            {/* TAB 3: MONTH-OVER-MONTH (MoM) DEEP DIVE */}
            {activeTab === "mom" && (
              <View style={{ gap: 9 }}>
                <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 13 }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>MONTH-OVER-MONTH FISCAL VELOCITY</Text>
                  <Text style={[styles.cardSubText, { color: colors.mutedForeground }]}>
                    Tracking month-by-month revenue inflows, operational expenditures, and net surplus changes.
                  </Text>
                </View>

                {monthlyData.length === 0 ? (
                  <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Feather name="calendar" size={26} color={colors.mutedForeground} />
                    <Text style={[styles.emptyNotice, { color: colors.mutedForeground }]}>No monthly transaction records found.</Text>
                  </View>
                ) : (
                  monthlyData.slice().reverse().map((m) => (
                    <View key={m.monthKey} style={[styles.momDetailedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.momHeaderRow}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <View style={[styles.monthIconWrap, { backgroundColor: (m.net >= 0 ? colors.income : colors.expense) + "18" }]}>
                            <Feather name={m.net >= 0 ? "trending-up" : "trending-down"} size={15} color={m.net >= 0 ? colors.income : colors.expense} />
                          </View>
                          <View>
                            <Text style={[styles.momFullMonth, { color: colors.foreground }]}>{m.monthLabel}</Text>
                            <Text style={[styles.momTxCount, { color: colors.mutedForeground }]}>{m.txCount} Records registered</Text>
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[styles.momFullNet, { color: m.net >= 0 ? colors.income : colors.expense }]}>
                            {m.net >= 0 ? "+" : "-"}{settings.currency} {fmt(Math.abs(m.net))}
                          </Text>
                          <Text style={[styles.momMarginPill, { color: m.net >= 0 ? colors.income : colors.expense }]}>
                            {m.margin.toFixed(1)}% Operating Margin
                          </Text>
                        </View>
                      </View>

                      {/* Inflows vs Outflows Summary Grid */}
                      <View style={styles.momBarGrid}>
                        <View style={[styles.momBarBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Text style={[styles.momBarBoxLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Inflows</Text>
                          <Text style={[styles.momBarBoxVal, { color: colors.income }]} numberOfLines={1} adjustsFontSizeToFit>
                            +{settings.currency} {fmtShort(m.income)}
                          </Text>
                        </View>
                        <View style={[styles.momBarBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Text style={[styles.momBarBoxLabel, { color: colors.mutedForeground }]} numberOfLines={1}>Outflows</Text>
                          <Text style={[styles.momBarBoxVal, { color: colors.expense }]} numberOfLines={1} adjustsFontSizeToFit>
                            -{settings.currency} {fmtShort(m.expense)}
                          </Text>
                        </View>
                        <View style={[styles.momBarBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Text style={[styles.momBarBoxLabel, { color: colors.mutedForeground }]} numberOfLines={1}>MoM Shift</Text>
                          <Text style={[styles.momBarBoxVal, { color: m.isPositiveShift ? colors.income : colors.expense }]} numberOfLines={1} adjustsFontSizeToFit>
                            {m.hasPrev ? `${m.diffAmount >= 0 ? "+" : "-"}${settings.currency} ${fmtShort(Math.abs(m.diffAmount))}` : "Baseline"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* TAB 4: REVENUE STREAMS (INFLOWS) */}
            {activeTab === "income" && (
              <View style={{ gap: 9 }}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>OPERATING REVENUE STREAMS</Text>
                  <Text style={[styles.sectionTotal, { color: colors.income }]}>
                    +{settings.currency} {fmt(totalIncome)}
                  </Text>
                </View>

                {/* Donut Chart for Inflow Categories */}
                {incomeDonutSegments.length > 0 && (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>Revenue Allocation</Text>
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Proportional distribution of earned income</Text>
                    <DonutChart
                      segments={incomeDonutSegments}
                      size={140}
                      strokeWidth={14}
                      centerLabel={`${settings.currency} ${fmtShort(totalIncome)}`}
                      centerSub="Total Revenue"
                    />
                  </View>
                )}

                <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {incomeCategories.length === 0 ? (
                    <Text style={[styles.emptyNotice, { color: colors.mutedForeground }]}>No revenue records found.</Text>
                  ) : (
                    incomeCategories.map((item, idx) => (
                      <View
                        key={item.category}
                        style={[
                          styles.breakdownRow,
                          {
                            borderBottomColor: colors.border,
                            borderBottomWidth: idx === incomeCategories.length - 1 ? 0 : 1,
                          },
                        ]}
                      >
                        <View style={styles.catLeft}>
                          <View style={[styles.catBullet, { backgroundColor: item.color }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.catName, { color: colors.foreground }]}>{item.category}</Text>
                            <Text style={[styles.catPct, { color: colors.mutedForeground }]}>
                              {item.count} Deposits · Avg: {settings.currency} {fmtShort(item.avg)}
                            </Text>
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[styles.catAmount, { color: colors.income }]}>
                            +{settings.currency} {fmt(item.amount)}
                          </Text>
                          <Text style={[styles.catPctBadge, { color: colors.mutedForeground }]}>
                            {item.pct.toFixed(1)}% of Revenue
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

            {/* TAB 5: OPERATING EXPENDITURES (OUTFLOWS) */}
            {activeTab === "expense" && (
              <View style={{ gap: 9 }}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>OPERATING EXPENDITURES (OUTFLOWS)</Text>
                  <Text style={[styles.sectionTotal, { color: colors.expense }]}>
                    -{settings.currency} {fmt(totalExpenses)}
                  </Text>
                </View>

                {/* Donut Chart for Expense Categories */}
                {expenseDonutSegments.length > 0 && (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>Expense Sinks</Text>
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Where operating funds are consumed</Text>
                    <DonutChart
                      segments={expenseDonutSegments}
                      size={140}
                      strokeWidth={14}
                      centerLabel={`${settings.currency} ${fmtShort(totalExpenses)}`}
                      centerSub="Total Spent"
                    />
                  </View>
                )}

                <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {expenseCategories.length === 0 ? (
                    <Text style={[styles.emptyNotice, { color: colors.mutedForeground }]}>No expense records found.</Text>
                  ) : (
                    expenseCategories.map((item, idx) => (
                      <View
                        key={item.category}
                        style={[
                          styles.breakdownRow,
                          {
                            borderBottomColor: colors.border,
                            borderBottomWidth: idx === expenseCategories.length - 1 ? 0 : 1,
                          },
                        ]}
                      >
                        <View style={styles.catLeft}>
                          <View style={[styles.catBullet, { backgroundColor: item.color }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.catName, { color: colors.foreground }]}>{item.category}</Text>
                            <Text style={[styles.catPct, { color: colors.mutedForeground }]}>
                              {item.count} Payouts · Avg: {settings.currency} {fmtShort(item.avg)}
                            </Text>
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[styles.catAmount, { color: colors.expense }]}>
                            -{settings.currency} {fmt(item.amount)}
                          </Text>
                          <Text style={[styles.catPctBadge, { color: colors.mutedForeground }]}>
                            {item.pct.toFixed(1)}% of Expenses
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

            {/* TAB 6: DEPARTMENTAL NET IMPACT */}
            {activeTab === "departments" && (
              <View style={{ gap: 9 }}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>DEPARTMENT NET CASHFLOW</Text>
                  <Text style={[styles.sectionTotal, { color: colors.primary }]}>
                    {deptAnalysis.length} Monitored Units
                  </Text>
                </View>

                <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {deptAnalysis.length === 0 ? (
                    <Text style={[styles.emptyNotice, { color: colors.mutedForeground }]}>No departmental entries found.</Text>
                  ) : (
                    deptAnalysis.map((d, idx) => (
                      <View
                        key={d.name}
                        style={[
                          styles.breakdownRow,
                          {
                            borderBottomColor: colors.border,
                            borderBottomWidth: idx === deptAnalysis.length - 1 ? 0 : 1,
                          },
                        ]}
                      >
                        <View style={styles.catLeft}>
                          <View style={[styles.catBullet, { backgroundColor: d.net >= 0 ? colors.income : colors.expense }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.catName, { color: colors.foreground }]}>{d.name}</Text>
                            <Text style={[styles.catPct, { color: colors.mutedForeground }]}>
                              In: +{settings.currency} {fmtShort(d.income)} · Out: -{settings.currency} {fmtShort(d.expense)}
                              {d.allocated > 0 ? ` · Cap: ${settings.currency} ${fmtShort(d.allocated)}` : ""}
                            </Text>
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[styles.catAmount, { color: d.net >= 0 ? colors.income : colors.expense }]}>
                            {d.net >= 0 ? "+" : "-"}{settings.currency} {fmt(Math.abs(d.net))}
                          </Text>
                          <Text
                            style={[
                              styles.catPctBadge,
                              {
                                color:
                                  d.allocated > 0
                                    ? d.burnRate > 100
                                      ? colors.expense
                                      : d.burnRate > 75
                                      ? colors.warning
                                      : colors.income
                                    : colors.mutedForeground,
                              },
                            ]}
                          >
                            {d.allocated > 0
                              ? `${d.burnRate.toFixed(1)}% of Budget Cap`
                              : `${d.spentPct.toFixed(1)}% of Outflows`}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    height: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#666",
    alignSelf: "center",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_800ExtraBold",
  },
  sub: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBarWrap: {
    height: 42,
    marginVertical: 8,
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  scrollContent: {
    paddingVertical: 2,
    gap: 12,
  },
  heroCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroSub: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  heroValue: {
    fontSize: 24,
    fontFamily: "Inter_900Black",
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  metricsStrip: {
    flexDirection: "row",
    gap: 7,
  },
  metricBlock: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    gap: 2,
  },
  metricBlockLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_600SemiBold",
  },
  metricBlockVal: {
    fontSize: 14.5,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.3,
  },
  metricBlockSub: {
    fontSize: 8.5,
    fontFamily: "Inter_500Medium",
  },
  progressContainer: {
    gap: 5,
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressBarTrack: {
    height: 7,
    borderRadius: 3.5,
    overflow: "hidden",
    flexDirection: "row",
  },
  progressBarFill: {
    height: "100%",
  },
  guideBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  guideIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  guideBannerTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  guideBannerSub: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  cardSub: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  chartHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  legendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  actionRow: {
    flexDirection: "row",
    gap: 9,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 38,
    borderRadius: 11,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
  },
  secondaryActionText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  sectionTotal: {
    fontSize: 11.5,
    fontFamily: "Inter_800ExtraBold",
  },
  cardSubText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
  },
  breakdownCard: {
    borderRadius: 13,
    borderWidth: 1,
    overflow: "hidden",
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  catLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
    paddingRight: 8,
  },
  catBullet: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  catName: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
  catPct: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  catPctBadge: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
  },
  catAmount: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  emptyWrap: {
    borderRadius: 13,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyNotice: {
    padding: 14,
    textAlign: "center",
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },
  momMiniRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  momMonthName: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  momSubInfo: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  momNetVal: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
  },
  momGrowthBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  momGrowthText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  momDetailedCard: {
    borderRadius: 13,
    borderWidth: 1,
    padding: 12,
    gap: 9,
  },
  momHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monthIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  momFullMonth: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  momTxCount: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  momFullNet: {
    fontSize: 14,
    fontFamily: "Inter_800ExtraBold",
  },
  momMarginPill: {
    fontSize: 9.5,
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
  },
  momBarGrid: {
    flexDirection: "row",
    gap: 7,
  },
  momBarBox: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    padding: 7,
    gap: 2,
  },
  momBarBoxLabel: {
    fontSize: 8.5,
    fontFamily: "Inter_500Medium",
  },
  momBarBoxVal: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },

  /* Milestone Grid */
  milestoneGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    marginTop: 4,
  },
  milestoneBox: {
    width: "48.5%",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  milestoneIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  milestoneLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
  },
  milestoneVal: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
  },
  milestoneSub: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
  },

  /* Derivation Flow Styles */
  derivationFlow: {
    gap: 6,
    marginTop: 4,
  },
  derivationStepBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
  derivationStepNum: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  derivationStepVal: {
    fontSize: 15,
    fontFamily: "Inter_900Black",
  },
  derivationStepSub: {
    fontSize: 9.5,
    fontFamily: "Inter_400Regular",
  },
  derivationArrowWrap: {
    alignItems: "center",
    justifyContent: "center",
    height: 16,
  },
  derivationResultCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    marginTop: 2,
  },
  derivationResultHeading: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
  },
  derivationResultNote: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
  },

  /* Formula Cards */
  formulaCard: {
    borderRadius: 13,
    borderWidth: 1,
    overflow: "hidden",
  },
  formulaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  formulaNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  formulaNumText: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
  },
  formulaTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  formulaSub: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  formulaBody: {
    borderTopWidth: 1,
    padding: 12,
    gap: 8,
  },
  formulaMath: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  formulaResultBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
  },
  formulaResultLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
  },
  formulaResultVal: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
  },
  formulaExplanation: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
});
