import { Feather } from "@/components/UniversalIcon";
import { screenTopPadding } from "@/utils/layout";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState, useEffect } from "react";
import { BackHandler, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AreaLineChart } from "@/components/AreaLineChart";
import { DonutChart } from "@/components/DonutChart";
import { HBarChart } from "@/components/HBarChart";
import { RingProgress } from "@/components/RingProgress";
import { DownloadReportModal } from "@/components/DownloadReportModal";
import { DatePeriodSelectorModal } from "@/components/DatePeriodSelectorModal";
import { NetOperatingBalanceHealthCard } from "@/components/NetOperatingBalanceHealthCard";
import { FinancialDrillDownModal, DrillDownType } from "@/components/FinancialDrillDownModal";
import { useFinance, Department } from "@/context/FinanceContext";
import { WebDepartmentStaffModal } from "@/components/web/modals/WebDepartmentStaffModal";
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
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateUnallocatedFunds,
} from "@/services/FinancialCalculationEngine";
import { FinancialAnalyticsSuite } from "@/components/analytics/FinancialAnalyticsSuite";

const EXPENSE_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];

function fmt(n: number) {
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
  const [drillDownDept, setDrillDownDept] = useState<string | undefined>(undefined);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [insightView, setInsightView] = useState<"budget" | "margin" | "spending">("budget");
  const [selectedStaffDept, setSelectedStaffDept] = useState<Department | null>(null);
  const webTop = Platform.OS === "web" ? 67 : 0;
  const chartWidth = chartW;

  // Active Date Period State (Centralized Engine)
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() =>
    getPresetPeriod("last_6m")
  );

  useEffect(() => {
    const onBackPress = () => {
      if (staffModalVisible) {
        setStaffModalVisible(false);
        setSelectedStaffDept(null);
        return true;
      }
      if (drillDownModal !== null) {
        setDrillDownModal(null);
        setDrillDownDept(undefined);
        return true;
      }
      if (periodModalVisible) {
        setPeriodModalVisible(false);
        return true;
      }
      if (exportModalVisible) {
        setExportModalVisible(false);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [drillDownModal, periodModalVisible, exportModalVisible]);

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
      settings.currency,
      undefined,
      departments
    );
  }, [transactions, budgets, activePeriod, settings.currency, departments]);

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
    (periodTransactions || [])
      .filter((t) => t && t.type === "expense")
      .forEach((t) => {
        const deptKey = t.department || "General";
        map[deptKey] = (map[deptKey] || 0) + (t.amount || 0);
      });

    const entries = Object.entries(map).map(([k, v]) => ({ label: k, value: v }));
    if (entries.length === 0) {
      return (departments || []).map((d, i) => ({
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

  const totalAllocatedBudget = calculateBudgetAllocation(budgets, departments);
  const totalBudgetSpent = calculateBudgetUsed(periodTransactions, budgets, undefined, departments);
  const budgetUtilPct =
    totalAllocatedBudget > 0 ? (totalBudgetSpent / totalAllocatedBudget) * 100 : 0;
  const netCash = (metrics?.totalIncome || 0) - (metrics?.totalExpense || 0);
  const unallocatedFunds = Math.max(0, netCash - totalAllocatedBudget);
  const netCapitalSurplus = netCash;
  const retainedCapitalPct = (metrics?.totalIncome || 0) > 0 ? (Math.max(0, netCash) / (metrics?.totalIncome || 1)) * 100 : 0;

  // Same export sheet on every platform: report type, custom date range, filters, sections → PDF generated on-device
  const handleExportPDF = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExportModalVisible(true);
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: webTop + screenTopPadding(insets.top),
            paddingHorizontal: hPad,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={[styles.headerTitleWrap, { flex: 1, marginRight: 8 }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>Reports</Text>
            <Text style={[styles.orgText, { color: colors.mutedForeground }]} numberOfLines={Platform.OS === "web" ? undefined : 2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {settings.organizationName}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[styles.rIconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={handleExportPDF}
              activeOpacity={0.75}
              accessibilityLabel="Quick PDF of this period"
            >
              <Feather name="file-text" size={16} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rExportBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExportModalVisible(true);
              }}
              activeOpacity={0.85}
              accessibilityLabel="Export report (PDF or CSV)"
            >
              <Feather name="download" size={14} color="#FFFFFF" />
              <Text style={styles.rExportText}>Export</Text>
            </TouchableOpacity>
          </View>
        </View>

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
            <Text style={[styles.periodBtnText, { color: colors.foreground }]}>
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
                      isSelected && { fontFamily: "Inter_600SemiBold" },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: hPad, paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Summary for the selected period ─── */}
        <View style={[styles.rSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rSummaryTitle, { color: colors.foreground }]}>Summary</Text>
          <Text style={[styles.rSummarySub, { color: colors.mutedForeground }]}>{activePeriod.label} · {metrics.recordCount} transactions · {metrics.durationDays} days</Text>
          {[
            { label: "Income", value: `${settings.currency} ${fmt(metrics.totalIncome)}`, color: colors.income },
            { label: "Expenses", value: `${settings.currency} ${fmt(metrics.totalExpense)}`, color: colors.expense, note: totalAllocatedBudget > 0 ? `${budgetUtilPct.toFixed(0)}% of budget` : undefined },
            { label: "Net", value: `${metrics.netBalance >= 0 ? "+" : "−"}${settings.currency} ${fmt(Math.abs(metrics.netBalance))}`, color: metrics.netBalance >= 0 ? colors.income : colors.expense, note: `${metrics.savingsRate.toFixed(0)}% margin` },
            ...(totalAllocatedBudget > 0
              ? [
                  { label: "Department budget", value: `${settings.currency} ${fmt(totalAllocatedBudget)}`, color: colors.foreground, note: `${settings.currency} ${fmt(unallocatedFunds)} unallocated` },
                  { label: "Net cash position", value: `${netCapitalSurplus >= 0 ? "+" : "−"}${settings.currency} ${fmt(Math.abs(netCapitalSurplus))}`, color: netCapitalSurplus >= 0 ? colors.income : colors.expense, note: `${retainedCapitalPct.toFixed(0)}% kept` },
                ]
              : []),
          ].map((r: { label: string; value: string; color: string; note?: string }, i) => (
            <View key={r.label} style={[styles.rRow, { borderTopColor: colors.border }, i === 0 && { borderTopWidth: 0 }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.rRowLabel, { color: colors.foreground }]} numberOfLines={2}>{r.label}</Text>
                {r.note ? <Text style={[styles.rRowNote, { color: colors.mutedForeground }]} numberOfLines={2}>{r.note}</Text> : null}
              </View>
              <Text style={[styles.rRowValue, { color: r.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* ─── 1. Financial Trend Analytics Area Graph ─── */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chartCardHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Trend</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                Income and expenses over time
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <View style={[styles.badge, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "33" }]}>
                <Text style={[styles.badgeText, { color: colors.primary, textTransform: "capitalize" }]}>
                  {activePeriod.userGranularityOverride || activePeriod.granularity}
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

        {/* ─── Analytics: one card at a time ─── */}
        <View style={styles.rTabsRow}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Analytics</Text>
          <View style={[styles.rSeg, { backgroundColor: colors.muted }]}>
            {([["budget", "Budget"], ["margin", "Margin"], ["spending", "Spending"]] as const).map(([k, label]) => (
              <TouchableOpacity key={k} onPress={() => setInsightView(k)} accessibilityRole="tab" accessibilityState={{ selected: insightView === k }}
                style={[styles.rSegBtn, insightView === k && { backgroundColor: colors.card }]}>
                <Text style={[styles.rSegText, { color: insightView === k ? colors.foreground : colors.mutedForeground }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <FinancialAnalyticsSuite
          only={insightView}
          budget={authFinancialModel.budget}
          margin={authFinancialModel.margin}
          distribution={authFinancialModel.distribution}
          currency={settings.currency}
          departments={departments}
          budgets={budgets}
          transactions={periodTransactions}
          onOpenDrillDown={(type, dept) => {
            setDrillDownModal(type);
            setDrillDownDept(dept);
          }}
          onOpenDepartmentStaff={(dept) => {
            if (dept.id === "ALL") {
              setSelectedStaffDept(null);
            } else {
              const matched = departments.find(
                (d) => d.id === dept.id || d.name.trim().toLowerCase() === dept.name.trim().toLowerCase()
              ) || { id: dept.id, name: dept.name, headCount: 0, budgetAllocated: 0 };
              setSelectedStaffDept(matched as Department);
            }
            setStaffModalVisible(true);
          }}
        />

        {/* ─── 4. Department Spending Breakdown (Horizontal Bar) ─── */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chartCardHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Department Spending</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                Where the money went · {activePeriod.label}
              </Text>
            </View>
          </View>

          <HBarChart
            items={deptSpending}
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
        onClose={() => {
          setDrillDownModal(null);
          setDrillDownDept(undefined);
        }}
        initialDepartment={drillDownDept}
        currency={settings.currency}
        period={activePeriod}
        transactions={transactions}
        budgets={budgets}
        departments={departments}
        nobHealth={nobHealth}
        onNavigate={(route) => {
          const target =
            route === "budgets" || route === "/budgets" || route === "budget" || route === "/budget"
              ? "/budget"
              : route === "reports" || route === "/reports"
              ? "/(tabs)/reports"
              : route === "expenses" || route === "/expenses"
              ? "/(tabs)/expenses"
              : route;
          router.push(target as any);
        }}
      />

      {/* ─── Department Staff & Roster Modal ─── */}
      <WebDepartmentStaffModal
        visible={staffModalVisible}
        onClose={() => {
          setStaffModalVisible(false);
          setSelectedStaffDept(null);
        }}
        department={selectedStaffDept}
        onEditDepartment={(dept) => {
          setStaffModalVisible(false);
          router.push("/departments");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rIconBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rExportBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 10 },
  rExportText: { color: "#FFFFFF", fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  rSummary: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 2 },
  rSummaryTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rSummarySub: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 },
  rRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  rRowLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rRowNote: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rRowValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", maxWidth: "55%", textAlign: "right" },
  rTabsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: -4 },
  rSeg: { flexDirection: "row", padding: 3, borderRadius: 8, gap: 2 },
  rSegBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  rSegText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
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
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  orgText: {
    fontSize: 12,
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
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
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
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
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
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  kpiVal: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_600SemiBold",
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
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
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
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  statValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
