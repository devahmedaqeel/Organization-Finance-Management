import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AreaLineChart } from "@/components/AreaLineChart";
import { DonutChart } from "@/components/DonutChart";
import { HBarChart } from "@/components/HBarChart";
import { RingProgress } from "@/components/RingProgress";
import { DownloadReportModal } from "@/components/DownloadReportModal";
import { DatePeriodSelectorModal } from "@/components/DatePeriodSelectorModal";
import { NetOperatingBalanceHealthCard } from "@/components/NetOperatingBalanceHealthCard";
import { FinancialDrillDownModal, DrillDownType } from "@/components/FinancialDrillDownModal";
import { useFinance } from "@/context/FinanceContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/context/AuthContext";
import {
  NormalizedPeriod,
  Granularity,
  getPresetPeriod,
  filterTransactionsByPeriod,
  computePeriodMetrics,
  computeNetOperatingBalanceHealth,
  aggregateTransactionsByGranularity,
} from "@/services/DatePeriodService";
import {
  buildAuthoritativeFinancialModel,
} from "@/services/FinancialCalculationEngine";
import { FinancialAnalyticsSuite } from "@/components/analytics/FinancialAnalyticsSuite";

const EXPENSE_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];

function fmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return Number(n || 0).toLocaleString();
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chartW, hPad } = useResponsive();
  const { user } = useAuth();
  const { transactions, budgets, payroll, departments } = useFinance();
  const { settings } = useSettings();
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [drillDownModal, setDrillDownModal] = useState<DrillDownType | null>(null);
  const webTop = Platform.OS === "web" ? 67 : 0;
  const chartWidth = chartW;

  // Active Date Period State (Centralized Engine)
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() =>
    getPresetPeriod("last_6m")
  );

  // Filtered transactions for the chosen period
  const periodTransactions = useMemo(
    () => filterTransactionsByPeriod(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Period Metrics (Total Income, Total Expenses, Net Balance, Savings Rate, Record Count)
  const metrics = useMemo(
    () => computePeriodMetrics(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Authoritative Net Operating Balance Health
  const nobHealth = useMemo(
    () => computeNetOperatingBalanceHealth(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Financial Trend Aggregated Points for Chart
  const chartPoints = useMemo(
    () => aggregateTransactionsByGranularity(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Authoritative Single Source of Truth Financial Calculation Pipeline
  const authFinancialModel = useMemo(() => {
    return buildAuthoritativeFinancialModel(
      transactions,
      budgets,
      activePeriod,
      settings.currency
    );
  }, [transactions, budgets, activePeriod, settings.currency]);

  // Expense breakdown by Category
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    periodTransactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });

    const entries = Object.entries(map).map(([k, v]) => ({ label: k, value: v }));
    if (entries.length === 0) {
      return [{ label: "No Expenses in Period", value: 1, color: colors.mutedForeground + "50" }];
    }

    const total = entries.reduce((s, e) => s + e.value, 0);
    return entries.map((e, i) => ({
      label: e.label,
      value: e.value,
      pct: Math.round((e.value / Math.max(total, 1)) * 100),
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
    }));
  }, [periodTransactions, colors]);

  // Income breakdown by Category
  const incomeByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    periodTransactions
      .filter((t) => t.type === "income")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });

    const entries = Object.entries(map).map(([k, v]) => ({ label: k, value: v }));
    if (entries.length === 0) {
      return [{ label: "No Income in Period", value: 1, color: colors.mutedForeground + "50" }];
    }

    const total = entries.reduce((s, e) => s + e.value, 0);
    return entries.map((e, i) => ({
      label: e.label,
      value: e.value,
      pct: Math.round((e.value / Math.max(total, 1)) * 100),
      color: ["#10B981", "#3B82F6", "#F59E0B", "#8B5CF6"][i % 4],
    }));
  }, [periodTransactions, colors]);

  // Department Spend Breakdown
  const deptSpending = useMemo(() => {
    const map: Record<string, number> = {};
    periodTransactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.department] = (map[t.department] || 0) + t.amount;
      });

    const entries = Object.entries(map).map(([k, v]) => ({ label: k, value: v }));
    if (entries.length === 0) {
      return departments.map((d, i) => ({
        label: d.name,
        value: 0,
        color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
      }));
    }
    return entries.map((e, i) => ({
      label: e.label,
      value: e.value,
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
    }));
  }, [periodTransactions, departments]);

  const totalAllocatedBudget = budgets.reduce((s, b) => s + b.allocated, 0);
  const budgetUtilPct =
    totalAllocatedBudget > 0 ? (metrics.totalExpense / totalAllocatedBudget) * 100 : 0;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: webTop + Math.max(insets.top, 20) + 14,
            paddingHorizontal: hPad,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        {/* Row 1: Title & PDF/CSV Export Button */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>Financial Analytics</Text>
            <Text style={[styles.orgText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {settings.organizationName}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.exportBtn,
              { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setExportModalVisible(true);
            }}
            activeOpacity={0.75}
          >
            <Feather name="download" size={13} color={colors.primary} />
            <Text style={[styles.exportBtnText, { color: colors.primary }]} numberOfLines={1}>
              Export PDF
            </Text>
          </TouchableOpacity>
        </View>

        {/* Row 2: Date Period Selector Pill & Quick Preset Pills */}
        <View style={styles.periodRow}>
          <TouchableOpacity
            style={[
              styles.periodBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPeriodModalVisible(true);
            }}
            activeOpacity={0.75}
          >
            <Feather name="calendar" size={13} color={colors.primary} />
            <Text style={[styles.periodBtnText, { color: colors.foreground }]} numberOfLines={1}>
              {activePeriod.label}
            </Text>
            <Feather name="chevron-down" size={12} color={colors.mutedForeground} />
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPresetRow}>
            {[
              { id: "last_30d", label: "1M" },
              { id: "last_3m", label: "3M" },
              { id: "last_6m", label: "6M" },
              { id: "this_year", label: "1Y" },
              { id: "all_time", label: "All" },
            ].map((p) => {
              const isSelected = activePeriod.presetId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.quickPill,
                    {
                      backgroundColor: isSelected ? colors.primary : (colors.cardAlt ?? colors.muted),
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                    setActivePeriod(getPresetPeriod(p.id));
                  }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.quickPillText,
                      { color: isSelected ? "#FFFFFF" : colors.foreground },
                      isSelected && { fontFamily: "Inter_700Bold" },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Live Period Metrics KPI Bar */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>INCOME</Text>
            <Text style={[styles.kpiVal, { color: colors.income }]}>
              {settings.currency} {fmt(metrics.totalIncome)}
            </Text>
            <Text style={{ fontSize: 9.5, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
              {metrics.recordCount} Transactions
            </Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>EXPENSES</Text>
            <Text style={[styles.kpiVal, { color: colors.expense }]}>
              {settings.currency} {fmt(metrics.totalExpense)}
            </Text>
            <Text style={{ fontSize: 9.5, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
              {metrics.durationDays} Days Period
            </Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>NET SURPLUS</Text>
            <Text style={[styles.kpiVal, { color: metrics.netBalance >= 0 ? colors.income : colors.expense }]}>
              {metrics.netBalance >= 0 ? "+" : ""}
              {settings.currency} {fmt(metrics.netBalance)}
            </Text>
            <Text style={{ fontSize: 9.5, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
              {metrics.savingsRate.toFixed(1)}% margin
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: hPad, paddingBottom: Math.max(insets.bottom, 16) + 95 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── 1. Financial Trend Analytics Area Graph ─── */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chartCardHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Financial Trend</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                {activePeriod.label} ({metrics.recordCount} Transactions)
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <View style={[styles.badge, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "33" }]}>
                <Text style={[styles.badgeText, { color: colors.primary, textTransform: "capitalize" }]}>
                  {activePeriod.userGranularityOverride || activePeriod.granularity} View
                </Text>
              </View>
            </View>
          </View>

          <AreaLineChart
            data={chartPoints}
            width={chartWidth - 28}
            height={165}
            currency={settings.currency}
            activePeriod={activePeriod}
            onPeriodSelect={(p) => {
              setActivePeriod(p);
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
            transactions={transactions}
            userId={user?.id || "default"}
          />
        </View>

        {/* ─── Authoritative 3-Card Financial Analytics Suite ─── */}
        <FinancialAnalyticsSuite
          budget={authFinancialModel.budget}
          margin={authFinancialModel.margin}
          distribution={authFinancialModel.distribution}
          currency={settings.currency}
          onOpenDrillDown={(type) => setDrillDownModal(type)}
        />

        {/* ─── 4. Department Spending Breakdown (Horizontal Bar) ─── */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chartCardHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Department Spending</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                Distribution across departments ({activePeriod.label})
              </Text>
            </View>
          </View>

          <HBarChart
            items={deptSpending}
            height={18}
            currency={settings.currency}
          />
        </View>
      </ScrollView>

      {/* ─── Centralized Date Period Selector Modal ─── */}
      <DatePeriodSelectorModal
        visible={periodModalVisible}
        onClose={() => setPeriodModalVisible(false)}
        currentPeriod={activePeriod}
        activePeriod={activePeriod}
        onApply={(p) => {
          setActivePeriod(p);
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onSelectPeriod={(p) => {
          setActivePeriod(p);
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        transactions={transactions}
      />

      {/* ─── Financial Reports PDF & CSV Export Modal ─── */}
      <DownloadReportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        activePeriod={activePeriod}
      />

      {/* ─── Level 3 Comprehensive Financial Drill-Down Modal ─── */}
      <FinancialDrillDownModal
        visible={drillDownModal !== null}
        type={drillDownModal || "budget"}
        onClose={() => setDrillDownModal(null)}
        currency={settings.currency}
        period={activePeriod}
        transactions={transactions}
        budgets={budgets}
        departments={departments}
        nobHealth={nobHealth}
        onNavigate={(route) => router.push(route as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: 6,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  orgText: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  periodBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    flexShrink: 0,
  },
  periodBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  quickPresetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quickPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quickPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    flexShrink: 0,
  },
  exportBtnText: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  aiBtnText: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  kpiLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  kpiVal: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  content: {
    paddingTop: 14,
    gap: 14,
  },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  chartCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  cardSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
  },
  budgetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 6,
  },
  budgetStats: {
    gap: 10,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  statValue: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
});
