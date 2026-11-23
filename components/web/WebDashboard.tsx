import React, { useState, useMemo, useEffect } from "react";
import { subscribeDashboardPeriod } from "@/services/fiscalYear";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { useFinance, Transaction, Department } from "@/context/FinanceContext";
import { WebDepartmentStaffModal } from "./modals/WebDepartmentStaffModal";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { AreaLineChart } from "@/components/AreaLineChart";
import { WebCashFlowBarChart } from "./WebCashFlowBarChart";
import { DonutChart } from "@/components/DonutChart";
import { HBarChart } from "@/components/HBarChart";
import { RingProgress } from "@/components/RingProgress";
import { openPdfReport, ReportOptions } from "@/services/ReportExportService";
import { LinearGradient } from "expo-linear-gradient";
import { NetBalanceBreakdownModal } from "@/components/NetBalanceBreakdownModal";
import { FinancialStatementViewerModal } from "@/components/FinancialStatementViewerModal";
import { NetOperatingBalanceHealthCard } from "@/components/NetOperatingBalanceHealthCard";
import { FinancialDrillDownModal, DrillDownType } from "@/components/FinancialDrillDownModal";
import {
  NormalizedPeriod,
  getPresetPeriod,
  createCustomDatePeriod,
  aggregateTransactionsByGranularity,
  computeNetOperatingBalanceHealth,
  getBudgetInsight,
  getNobInsight,
  getExpenseDistributionInsight,
} from "@/services/DatePeriodService";
import {
  buildAuthoritativeFinancialModel,
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateBudgetRemaining,
  calculateUnallocatedFunds,
} from "@/services/FinancialCalculationEngine";
import { FinancialAnalyticsSuite } from "@/components/analytics/FinancialAnalyticsSuite";
import { NotificationCenterModal } from "@/components/NotificationCenterModal";
import { Feather } from "@/components/UniversalIcon";
import { WebCountUp } from "./animations/WebCountUp";
import {
  SvgShield,
  SvgEye,
  SvgEyeOff,
  SvgChart,
  SvgTrendingUp,
  SvgTrendingDown,
  SvgPieChart,
  SvgArrowUpRight,
  SvgArrowDownLeft,
  SvgFileText,
  SvgUsers,
  SvgLayers,
  SvgDollar,
  SvgCpu,
  SvgTarget,
  SvgCheckCircle,
} from "./SvgIcons";
import { FitText, splitDescription } from "./FitText";

const EXPENSE_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];

interface WebDashboardProps {
  onNavigate: (route: string) => void;
  onOpenTransactionModal: (type: "income" | "expense") => void;
  onOpenBudgetModal: () => void;
}

export function WebDashboard({
  onNavigate,
  onOpenTransactionModal,
  onOpenBudgetModal,
}: WebDashboardProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const {
    transactions,
    budgets,
    payroll,
    departments,
    totalIncome,
    totalExpenses,
    netBalance,
    budgetUtilization,
    notifications,
    unreadNotificationCount,
    syncStatus,
  } = useFinance();

  const [hideBalance, setHideBalance] = useState<boolean>(false);
  const [netModalVisible, setNetModalVisible] = useState<boolean>(false);
  const [statementModalVisible, setStatementModalVisible] = useState<boolean>(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState<boolean>(false);
  const [statementReportOpts, setStatementReportOpts] = useState<ReportOptions | null>(null);
  const [growthMode, setGrowthMode] = useState<number>(0);
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() => getPresetPeriod("last_6m"));

  // Fiscal-year picker in the top bar can ask the dashboard to show a whole fiscal year
  useEffect(() => {
    return subscribeDashboardPeriod((p) => setActivePeriod(createCustomDatePeriod(p.startDate, p.endDate, p.label)));
  }, []);
  const [drillDownType, setDrillDownType] = useState<DrillDownType | null>(null);
  const [drillDownDept, setDrillDownDept] = useState<string | undefined>(undefined);
  const [staffModalDept, setStaffModalDept] = useState<Department | null>(null);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [chartContainerWidth, setChartContainerWidth] = useState<number>(0);

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
  }, [transactions, budgets, departments, activePeriod, settings.currency]);

  const [balanceViewMode, setBalanceViewMode] = useState<"cashflow" | "expenses">("cashflow");
  const totalLineBudgeted = calculateBudgetAllocation(budgets);
  const totalDeptBudgeted = calculateBudgetAllocation([], departments);
  const totalAllocatedBudget = calculateBudgetAllocation(budgets, departments);
  const totalBudgeted = totalAllocatedBudget;
  const totalBudgetSpent = calculateBudgetUsed(transactions, budgets, undefined, departments);
  const netBudgetRemaining = calculateBudgetRemaining(totalAllocatedBudget, totalBudgetSpent);
  const netBudgetUtilization = totalAllocatedBudget > 0 ? (totalBudgetSpent / totalAllocatedBudget) * 100 : 0;

  // Authoritative Core Financial Flow:
  // Income -> Available Funds -> Department Budget -> Expense -> Remaining Budget
  // NEVER ADD BUDGET TO INCOME!
  const netCash = totalIncome - totalExpenses;
  const netSurplus = netCash;
  const realNetOperatingResult = netCash;
  const isDeficit = totalExpenses > totalIncome;
  const isFundingDeficit = netCash < 0;
  const isEffectiveDeficit = isDeficit;

  // Section 8 & Master Calculation Engine: Available to Allocate is strictly gated by Available Net Cash!
  const unspentBudgetCommitments = Math.max(0, totalAllocatedBudget - totalBudgetSpent);
  const unallocatedRevFunds = Math.max(0, totalIncome - totalAllocatedBudget);
  const availableToAllocate = Math.max(0, netCash - totalAllocatedBudget);
  const unallocatedFunds = availableToAllocate;

  // 1. Kitni Income Retain: percentage of actual income retained after operating expenses
  const incomeRetainedAmount = netCash;
  const incomeRetainedPct = totalIncome > 0
    ? Math.max(0, Math.round((incomeRetainedAmount / totalIncome) * 100))
    : 0;

  // 2. Kitna Percent Expense: percentage of income consumed by expenses
  const expensePctOfIncome = totalIncome > 0
    ? Math.round((totalExpenses / totalIncome) * 100)
    : (totalExpenses > 0 ? 100 : 0);

  // 3. Kitna Percent Budget Used: authoritative budget utilization percentage
  const budgetUsedPct = Math.round(netBudgetUtilization);

  // 4. Budget-integrated Expense Ratios
  const budgetExpensePct = totalAllocatedBudget > 0
    ? Math.round((totalBudgetSpent / totalAllocatedBudget) * 100)
    : expensePctOfIncome;
  const budgetRemainingAmount = netBudgetRemaining;

  // Operating Margin on Inflows (Revenue)
  const operatingMargin = totalIncome > 0
    ? ((incomeRetainedAmount / totalIncome) * 100)
    : (totalExpenses > 0 ? -100 : 0);

  // Real-time authoritative display balance
  const currentHeroBalance =
    balanceViewMode === "cashflow"
      ? netCash
      : -totalExpenses;

  const fmt = (n: number) => {
    return Number(n || 0).toLocaleString();
  };

  const isHeroExpenseDeficit = totalAllocatedBudget > 0 ? totalBudgetSpent > totalAllocatedBudget : totalExpenses > totalIncome;
  const currentHeroIsDeficit = balanceViewMode === "cashflow" ? isEffectiveDeficit : isHeroExpenseDeficit;

  const heroBadgeColor = currentHeroIsDeficit ? "#FB7185" : "#34D399";
  const heroBadgeBg = currentHeroIsDeficit ? "rgba(244, 63, 94, 0.20)" : "rgba(16, 185, 129, 0.20)";
  const heroBadgeBorder = currentHeroIsDeficit ? "rgba(244, 63, 94, 0.50)" : "rgba(16, 185, 129, 0.50)";
  const heroBadgeIcon = balanceViewMode === "expenses"
    ? (currentHeroIsDeficit ? "alert-circle" : "shield")
    : (currentHeroIsDeficit ? "trending-down" : "trending-up");

  const heroBadgeText = balanceViewMode === "expenses"
    ? null
    : `${operatingMargin >= 0 ? "+" : ""}${operatingMargin.toFixed(1)}% Margin`;

  const now = new Date();
  const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const prevMonthIncome = useMemo(
    () => transactions.filter(t => t.type === "income" && t.date.startsWith(prevYm)).reduce((s, t) => s + t.amount, 0),
    [transactions, prevYm]
  );
  const curMonthIncome = useMemo(
    () => transactions.filter(t => t.type === "income" && t.date.startsWith(curYm)).reduce((s, t) => s + t.amount, 0),
    [transactions, curYm]
  );
  const incomeGrowth = prevMonthIncome > 0 ? ((curMonthIncome - prevMonthIncome) / prevMonthIncome) * 100 : (curMonthIncome > 0 ? 100 : 0);

  const totalPayroll = useMemo(
    () => payroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0),
    [payroll]
  );

  // Chart aggregated data points for the trend graph
  const chartPoints = useMemo(
    () => aggregateTransactionsByGranularity(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Authoritative Net Operating Balance Health
  const nobHealth = useMemo(
    () => computeNetOperatingBalanceHealth(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Expense by Category Donut Segments
  const expenseByCategorySegments = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });

    const entries = Object.entries(map).map(([k, v]) => ({ label: k, value: v }));
    if (entries.length === 0) {
      return [{ label: "General Outflows", value: totalExpenses || 1, color: colors.expense }];
    }

    return entries.map((e, i) => ({
      label: e.label,
      value: e.value,
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
    }));
  }, [transactions, totalExpenses, colors]);

  // Department Spending Breakdown
  const deptSpendingItems = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const d = t.department || "General";
        map[d] = (map[d] || 0) + t.amount;
      });

    const entries = Object.entries(map).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value);
    if (entries.length === 0) {
      return departments.map((d) => ({ label: d.name, value: 0, color: colors.info, sublabel: "No spending yet" }));
    }
    const total = entries.reduce((x, e) => x + e.value, 0);
    // One calm colour family; the biggest spender is the strongest shade
    return entries.map((e, i) => ({
      label: e.label,
      value: e.value,
      color: i === 0 ? colors.info : colors.info + (i === 1 ? "CC" : i === 2 ? "A6" : "80"),
      sublabel: `${total > 0 ? ((e.value / total) * 100).toFixed(1) : "0"}% of department spending`,
    }));
  }, [transactions, departments, colors.info]);
  const deptSpendingTotal = deptSpendingItems.reduce((x, d) => x + (d.value || 0), 0);

  // Recent 6 transactions
  const recentTransactions = useMemo(() => transactions.slice(0, 6), [transactions]);

  const canEdit = user?.role === "admin" || user?.role === "accountant";

  return (
    <ScrollView style={[styles.container, { width: "100%" }]} contentContainerStyle={[styles.content, isMobile && { padding: 12, gap: 12 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Page title & quick actions ─── */}
      <View style={[styles.topActionRow, { alignItems: "center" }, isMobile && { flexDirection: "column", alignItems: "stretch", gap: 12 }]}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={[styles.welcomeTitle, { color: colors.foreground, fontSize: isMobile ? 18 : 20 }]}>Dashboard</Text>
          <Text style={[styles.welcomeSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12.5 : 13, marginTop: 2 }]}>
            {settings.organizationName || user?.organization || "Organization Finance Management"} · Overview of your money right now
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[{ flexGrow: 0 }, isMobile && { width: "100%" }]}
          contentContainerStyle={styles.actionButtonsGroup}
        >
          {canEdit && (
            <View style={[styles.qaGroup, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {[
                { key: "income", label: "Add income", icon: "plus", tint: colors.income, onPress: () => onOpenTransactionModal("income") },
                { key: "expense", label: "Add expense", icon: "minus", tint: colors.expense, onPress: () => onOpenTransactionModal("expense") },
                { key: "budget", label: "Set budget", icon: "pie-chart", tint: colors.info, onPress: onOpenBudgetModal },
              ].map((a, i) => (
                <TouchableOpacity
                  key={a.key}
                  style={[styles.qaBtn, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border }]}
                  onPress={a.onPress}
                  activeOpacity={0.75}
                  accessibilityLabel={a.label}
                >
                  <View style={[styles.qaIcon, { backgroundColor: a.tint + "18" }]}>
                    <Feather name={a.icon as any} size={13} color={a.tint} />
                  </View>
                  <Text numberOfLines={1} style={[styles.qaText, { color: colors.foreground }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.qaAlert, { borderColor: unreadNotificationCount > 0 ? colors.expense + "55" : colors.border, backgroundColor: colors.card }]}
            onPress={() => setNotificationModalVisible(true)}
            activeOpacity={0.75}
            accessibilityLabel={unreadNotificationCount > 0 ? `Alerts, ${unreadNotificationCount} unread` : "Alerts"}
          >
            <Feather name="bell" size={16} color={unreadNotificationCount > 0 ? colors.expense : colors.foreground} />
            <Text numberOfLines={1} style={[styles.qaText, { color: colors.foreground }]}>Alerts</Text>
            {unreadNotificationCount > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ─── Net Operating Balance Hero Card (Exact Mobile App Parity - Matching Pic 1) ─── */}
      <LinearGradient
        colors={["#1A1C20", "#1D2722", "#183A1E", "#1B4D22"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.heroBalanceCard,
          {
            borderRadius: 10,
            padding: isMobile ? 16 : 22,
            borderWidth: 1.2,
            borderColor: "rgba(255, 255, 255, 0.18)",
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 10,
            overflow: "hidden",
            position: "relative",
          },
        ]}
      >


        {/* Top Row: Title + Privacy Eye + Fiscal Dossier Button */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0, marginRight: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(56, 189, 248, 0.18)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <SvgShield size={15} color="#38BDF8" />
            </View>
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: isMobile ? 13 : 14,
                fontFamily: "Inter_600SemiBold",
                letterSpacing: 0.1,
                flexShrink: 1,
              }}
            >
              {balanceViewMode === "cashflow"
                ? "Available cash"
                : "Total spending"}
            </Text>
            <TouchableOpacity
              onPress={() => setHideBalance(!hideBalance)}
              style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255, 255, 255, 0.12)", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" as any }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              {hideBalance ? (
                <SvgEyeOff size={15} color="#FFFFFF" />
              ) : (
                <SvgEye size={15} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* Direct Trigger to Open Net Operating Balance Dossier */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: "rgba(255, 255, 255, 0.12)",
              paddingHorizontal: isMobile ? 12 : 14,
              paddingVertical: isMobile ? 5.5 : 7,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.25)",
              cursor: "pointer" as any,
              flexShrink: 0,
            }}
            onPress={() => setNetModalVisible(true)}
            activeOpacity={0.8}
          >
            <SvgChart size={14} color="#38BDF8" />
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
              Breakdown
            </Text>
            <Feather name="arrow-right" size={14} color="#FFFFFF" style={{ marginLeft: 1 }} />
          </TouchableOpacity>
        </View>

        {/* View Mode Switcher Pills (Net Operating Result vs Total Outflows) - Side-by-side on Mobile */}
        {/* View Mode Switcher Pills */}
        <View style={{ flexDirection: "row", gap: isMobile ? 6 : 10, marginTop: -2, marginBottom: 14, flexWrap: isMobile ? "nowrap" : "wrap" }}>
          <TouchableOpacity
            style={{
              flex: isMobile ? 1 : undefined,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: isMobile ? 5 : 7,
              paddingHorizontal: isMobile ? 8 : 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: balanceViewMode === "cashflow" ? "rgba(59, 130, 246, 0.30)" : "rgba(255, 255, 255, 0.08)",
              borderWidth: 1.2,
              borderColor: balanceViewMode === "cashflow" ? "#60A5FA" : "rgba(255, 255, 255, 0.15)",
              cursor: "pointer" as any,
            }}
            onPress={() => setBalanceViewMode("cashflow")}
            activeOpacity={0.8}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" }} />
            <Text
              style={{ color: balanceViewMode === "cashflow" ? "#FFFFFF" : "rgba(255, 255, 255, 0.88)", fontSize: isMobile ? 12 : 13, fontFamily: "Inter_600SemiBold" }}
            >
              Net cash
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: isMobile ? 1 : undefined,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: isMobile ? 5 : 7,
              paddingHorizontal: isMobile ? 8 : 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: balanceViewMode === "expenses" ? "rgba(244, 63, 94, 0.30)" : "rgba(255, 255, 255, 0.08)",
              borderWidth: 1.2,
              borderColor: balanceViewMode === "expenses" ? "#F43F5E" : "rgba(255, 255, 255, 0.15)",
              cursor: "pointer" as any,
            }}
            onPress={() => setBalanceViewMode("expenses")}
            activeOpacity={0.8}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F43F5E" }} />
            <Text
              style={{ color: balanceViewMode === "expenses" ? "#FFFFFF" : "rgba(255, 255, 255, 0.88)", fontSize: isMobile ? 12 : 13, fontFamily: "Inter_600SemiBold" }}
            >
              Spending
            </Text>
          </TouchableOpacity>
        </View>

        {/* Balance Hero Amount Display + Growth Metric Pill */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => setNetModalVisible(true)}
            activeOpacity={0.85}
            style={{ flex: 1, marginRight: 8 }}
          >
            {hideBalance ? (
              <Text style={styles.heroAmountText}>
                {settings.currency} ••••••
              </Text>
            ) : (
              <WebCountUp
                value={currentHeroBalance}
                prefix={`${currentHeroBalance >= 0 ? "+" : "-"}${settings.currency} `}
                formatter={(v) => fmt(Math.abs(v))}
                style={[
                  styles.heroAmountText,
                  {
                    fontSize: isMobile ? 28 : 34,
                    color: balanceViewMode === "expenses" ? "#FB7185" : "#FFFFFF",
                    fontFamily: "Inter_800ExtraBold",
                    letterSpacing: -0.8,
                  },
                ]}
              />
            )}
          </TouchableOpacity>

          {/* Growth Pill Badge */}
          {heroBadgeText ? (
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: isMobile ? 10 : 12,
                paddingVertical: isMobile ? 5 : 7,
                borderRadius: isMobile ? 8 : 10,
                backgroundColor: heroBadgeBg,
                borderWidth: 1.5,
                borderColor: heroBadgeBorder,
                cursor: "pointer" as any,
              }}
              onPress={() => setGrowthMode((m) => (m + 1) % 4)}
              activeOpacity={0.8}
            >
              <Feather
                name={heroBadgeIcon as any}
                size={12}
                color={heroBadgeColor}
              />
              <Text style={{ color: heroBadgeColor, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                {heroBadgeText}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Dynamic Cash Flow / Budget Status Bar & Labels */}
        <View style={{ gap: 7, marginTop: 2 }}>
          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "flex-start" : "center",
              gap: isMobile ? 4 : 8,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: isMobile ? "100%" : undefined }}>
              <Text
                style={{
                  color: "#E5E7EB",
                  fontSize: 13,
                  fontFamily: "Inter_500Medium",
                }}
              >
                {totalAllocatedBudget > 0
                  ? `Unallocated: ${settings.currency} ${fmt(availableToAllocate)}`
                  : totalExpenses === 0
                  ? "Nothing spent yet"
                  : `${expensePctOfIncome}% of income spent`}
              </Text>
              {isMobile && totalAllocatedBudget > 0 && (
                <Text
                  style={{
                    color: isEffectiveDeficit || budgetUsedPct > 100 ? "#FCA5A5" : "#86EFAC",
                    fontSize: 13,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  {budgetUsedPct}% used
                </Text>
              )}
            </View>

            <Text
              style={{
                color: isEffectiveDeficit ? "#FCA5A5" : "#86EFAC",
                fontSize: 13,
                fontFamily: "Inter_600SemiBold",
                textAlign: isMobile ? "left" : "right",
              }}
            >
              {totalAllocatedBudget > 0
                ? (isMobile
                    ? `${settings.currency} ${fmt(netBudgetRemaining)} budget left`
                    : `${settings.currency} ${fmt(netBudgetRemaining)} budget left · ${budgetUsedPct}% used`)
                : isDeficit
                ? `Deficit -${settings.currency} ${fmt(totalExpenses - totalIncome)}`
                : `${incomeRetainedPct}% saved`}
            </Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(255, 255, 255, 0.18)", overflow: "hidden" }}>
            <View
              style={{
                height: "100%",
                borderRadius: 3,
                width: `${totalAllocatedBudget > 0 ? Math.min(Math.max(budgetUsedPct, 2.5), 100) : (totalIncome > 0 ? Math.min(Math.max(expensePctOfIncome, 2.5), 100) : (totalExpenses > 0 ? 100 : 0))}%`,
                backgroundColor: isEffectiveDeficit || (totalAllocatedBudget > 0 && budgetUsedPct > 100) ? "#F87171" : "#4ADE80",
                shadowColor: isEffectiveDeficit ? "#FB7185" : "#38BDF8",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius: 8,
              }}
            />
          </View>
        </View>
      </LinearGradient>

      {/* ─── Summary cards: Income · Expenses · Budget · Transactions · Payroll ─── */}
      {(() => {
        const inCount = transactions.filter((t) => t.type === "income").length;
        const outCount = transactions.length - inCount;
        const hasBudget = totalAllocatedBudget > 0;
        const overBudget = hasBudget && totalBudgetSpent > totalAllocatedBudget;
        const budgetTone = !hasBudget ? colors.mutedForeground : overBudget ? colors.expense : budgetUsedPct > 80 ? colors.warning : colors.info;
        const cards = [
          {
            key: "income",
            label: "Income",
            icon: "trending-up",
            tone: colors.income,
            value: totalIncome,
            prefix: `${settings.currency} `,
            count: false,
            status: totalIncome === 0 ? "No income yet" : isDeficit ? "Less than expenses" : `${incomeRetainedPct}% kept after expenses`,
            statusTone: totalIncome === 0 ? colors.mutedForeground : isDeficit ? colors.expense : colors.income,
            bar: totalIncome === 0 ? 0 : isDeficit ? 0 : incomeRetainedPct,
            barTone: colors.income,
            route: "income",
            link: "View income",
          },
          {
            key: "expenses",
            label: "Expenses",
            icon: "trending-down",
            tone: colors.expense,
            value: totalExpenses,
            prefix: `${settings.currency} `,
            count: false,
            status: totalExpenses === 0 ? "Nothing spent yet" : `${expensePctOfIncome}% of income`,
            statusTone: totalExpenses === 0 ? colors.mutedForeground : isDeficit ? colors.expense : colors.mutedForeground,
            bar: totalExpenses === 0 ? 0 : Math.min(100, expensePctOfIncome),
            barTone: isDeficit ? colors.expense : expensePctOfIncome > 85 ? colors.warning : colors.expense,
            route: "expenses",
            link: "View expenses",
          },
          {
            key: "budget",
            label: "Budget",
            icon: "pie-chart",
            tone: budgetTone,
            value: totalAllocatedBudget,
            prefix: `${settings.currency} `,
            count: false,
            status: !hasBudget ? "No budget set" : overBudget ? `${settings.currency} ${fmt(totalBudgetSpent - totalAllocatedBudget)} over budget` : `${settings.currency} ${fmt(netBudgetRemaining)} left · ${budgetUsedPct}% used`,
            statusTone: !hasBudget ? colors.mutedForeground : overBudget ? colors.expense : colors.mutedForeground,
            bar: hasBudget ? Math.min(100, budgetUsedPct) : 0,
            barTone: budgetTone,
            route: "budgets",
            link: "View budgets",
          },
          {
            key: "tx",
            label: "Transactions",
            icon: "repeat",
            tone: colors.foreground,
            value: transactions.length,
            prefix: "",
            count: true,
            status: transactions.length === 0 ? "No transactions yet" : `${inCount} income · ${outCount} expenses`,
            statusTone: colors.mutedForeground,
            bar: transactions.length > 0 ? (inCount / transactions.length) * 100 : 0,
            barTone: colors.income,
            barRest: transactions.length > 0 ? colors.expense : undefined,
            route: "transactions",
            link: "View all",
          },
          {
            key: "payroll",
            label: "Staff payroll",
            icon: "users",
            tone: "#7C3AED",
            value: totalPayroll,
            prefix: `${settings.currency} `,
            count: false,
            status: payroll.length === 0 ? "No payroll yet" : `${payroll.length} ${payroll.length === 1 ? "payment" : "payments"} · ${totalExpenses > 0 ? Math.round((totalPayroll / totalExpenses) * 100) : 0}% of expenses`,
            statusTone: colors.mutedForeground,
            bar: totalExpenses > 0 ? Math.min(100, (totalPayroll / totalExpenses) * 100) : 0,
            barTone: "#7C3AED",
            route: "payroll",
            link: "View payroll",
          },
        ];

        return (
          <View style={[styles.kpiGrid, isMobile && { gap: 10 }]}>
            {cards.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[
                  styles.kpi2Card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  isMobile && { minWidth: "47%", flexBasis: "47%" },
                  isMobile && c.key === "payroll" && { minWidth: "100%", flexBasis: "100%" },
                ]}
                onPress={() => onNavigate(c.route)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`${c.label}: ${c.count ? c.value : `${settings.currency} ${fmt(c.value)}`}. ${c.status}. Open ${c.label}`}
              >
                {/* Label row */}
                <View style={styles.kpi2Head}>
                  <View style={[styles.kpi2Icon, { backgroundColor: c.tone + "16" }]}>
                    <Feather name={c.icon as any} size={15} color={c.tone} />
                  </View>
                  <Text numberOfLines={1} style={[styles.kpi2Label, { color: colors.mutedForeground }]}>{c.label}</Text>
                </View>

                {/* Amount */}
                {c.count ? (
                  <Text numberOfLines={1} style={[styles.kpi2Value, { color: colors.foreground }]}>{c.value.toLocaleString()}</Text>
                ) : (
                  <WebCountUp value={c.value} prefix={c.prefix} formatter={fmt} style={[styles.kpi2Value, { color: colors.foreground }]} />
                )}

                {/* Status + bar */}
                <View style={{ gap: 6 }}>
                  <Text numberOfLines={1} style={[styles.kpi2Status, { color: c.statusTone }]}>{c.status}</Text>
                  <View style={[styles.kpi2Track, { backgroundColor: c.barRest && c.bar > 0 ? c.barRest : colors.muted }]}>
                    <View style={{ width: `${Math.max(c.bar > 0 ? 2 : 0, Math.min(100, c.bar))}%`, height: "100%", backgroundColor: c.barTone }} />
                  </View>
                </View>

                {/* Link */}
                <View style={[styles.kpi2Foot, { borderTopColor: colors.border }]}>
                  <Text style={[styles.kpi2Link, { color: colors.primary }]}>{c.link}</Text>
                  <Feather name="chevron-right" size={14} color={colors.primary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        );
      })()}

      {/* ─── 1. FULL FINANCIAL TREND ANALYTICS GRAPH (AreaLineChart) ─── */}
      <View
        style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onLayout={(e) => setChartContainerWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.panelHeader}>
          <View>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>Cash Flow</Text>
            <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
              Income vs expenses · {activePeriod.label}
            </Text>
          </View>
          <TouchableOpacity onPress={() => onNavigate("reports")}>
            <Text numberOfLines={1} style={[styles.panelLink, { color: colors.primary }]}>Reports →</Text>
          </TouchableOpacity>
        </View>

        <AreaLineChart
          data={chartPoints}
          width={
            chartContainerWidth > 40
              ? chartContainerWidth - 36
              : isMobile
              ? width - 40
              : Math.min(width - (width >= 1024 ? 320 : 64), 960)
          }
          height={185}
          currency={settings.currency}
          activePeriod={activePeriod}
          onPeriodSelect={(p) => setActivePeriod(p)}
          transactions={transactions}
          userId={user?.id || "default"}
        />
      </View>

      <WebCashFlowBarChart transactions={transactions} period={activePeriod} currency={settings.currency} hideAmounts={hideBalance} />

      {/* ─── Authoritative 3-Card Financial Analytics Suite (Budget, NOM, Distribution) ─── */}
      <FinancialAnalyticsSuite
        budget={authFinancialModel.budget}
        margin={authFinancialModel.margin}
        distribution={authFinancialModel.distribution}
        currency={settings.currency}
        departments={departments}
        budgets={budgets}
        transactions={transactions}
        onOpenDrillDown={(type, dept) => {
          setDrillDownType(type);
          setDrillDownDept(dept);
        }}
        onOpenDepartmentStaff={(dept) => {
          if (dept.id === "ALL") {
            setStaffModalDept(null);
          } else {
            const matched = departments.find(
              (d) => d.id === dept.id || d.name.trim().toLowerCase() === dept.name.trim().toLowerCase()
            ) || { id: dept.id, name: dept.name, headCount: 0, budgetAllocated: 0 };
            setStaffModalDept(matched as Department);
          }
          setStaffModalVisible(true);
        }}
      />

      {/* ─── Department Spending Horizontal Bars (HBarChart) ─── */}
      <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>Department spending</Text>
            <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
              {deptSpendingItems.length} {deptSpendingItems.length === 1 ? "department" : "departments"} · {settings.currency} {deptSpendingTotal.toLocaleString()} total, highest first
            </Text>
          </View>
          <TouchableOpacity onPress={() => onNavigate("departments")}>
            <Text numberOfLines={1} style={[styles.panelLink, { color: colors.primary }]}>All departments →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingVertical: 6 }}>
          <HBarChart
            items={deptSpendingItems}
            currency={settings.currency}
            formatValue={(v) => `${settings.currency} ${Number(v || 0).toLocaleString()}`}
            labelWidth={isMobile ? 120 : 210}
          />
        </View>
      </View>

      {/* ─── Recent General Ledger Transactions Table ─── */}
      <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>Recent Transactions</Text>
            <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
              Latest activity
            </Text>
          </View>
          <TouchableOpacity onPress={() => onNavigate("transactions")}>
            <Text numberOfLines={1} style={[styles.panelLink, { color: colors.primary }]}>View all →</Text>
          </TouchableOpacity>
        </View>

        {recentTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <SvgFileText size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No transactions yet</Text>
          </View>
        ) : isMobile ? (
          <View style={{ gap: 8 }}>
            {recentTransactions.map((tx) => (
              <View
                key={tx.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <View
                      style={[
                        styles.txIconBadge,
                        {
                          backgroundColor: tx.type === "income" ? colors.income + "18" : colors.expense + "18",
                          flexShrink: 0,
                        },
                      ]}
                    >
                      {tx.type === "income" ? (
                        <SvgArrowUpRight size={16} color={colors.income} />
                      ) : (
                        <SvgArrowDownLeft size={16} color={colors.expense} />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.txDesc, { color: colors.foreground, fontSize: 13, lineHeight: 18 }]}>
                        {tx.description || tx.category}
                      </Text>
                      <Text numberOfLines={1} style={[styles.txRef, { color: colors.mutedForeground, marginTop: 2 }]}>
                        {tx.category} · {tx.department}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
                    <Text numberOfLines={1}
                      style={[
                        styles.txAmount,
                        { color: tx.type === "income" ? colors.income : colors.expense, fontSize: 13.5 },
                      ]}
                    >
                      {tx.type === "income" ? "+" : "-"}
                      {settings.currency} {tx.amount.toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2 }}>
                      {tx.date}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: "100%" }}>
          <View style={[styles.tableContainer, { minWidth: 840, width: "100%" }]}>
            {/* Table Header */}
            <View style={[styles.tableHeaderRow, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <Text numberOfLines={1} style={[styles.th, { flex: 2.6, minWidth: 260, paddingRight: 14, color: colors.mutedForeground }]}>Description</Text>
              <Text numberOfLines={1} style={[styles.th, { width: 170, paddingRight: 12, color: colors.mutedForeground }]}>Category</Text>
              <Text numberOfLines={1} style={[styles.th, { width: 140, paddingRight: 12, color: colors.mutedForeground }]}>Department</Text>
              <Text numberOfLines={1} style={[styles.th, { width: 112, paddingRight: 10, color: colors.mutedForeground }]}>Date</Text>
              <Text numberOfLines={1} style={[styles.th, { width: 130, color: colors.mutedForeground, textAlign: "right" }]}>Amount</Text>
            </View>

            {/* Table Rows */}
            {recentTransactions.map((tx) => (
              <View key={tx.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 2.6, minWidth: 260, flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 14 }}>
                  <View
                    style={[
                      styles.txIconBadge,
                      {
                        backgroundColor: tx.type === "income" ? colors.income + "18" : colors.expense + "18",
                      },
                    ]}
                  >
                    {tx.type === "income" ? (
                      <SvgArrowUpRight size={16} color={colors.income} />
                    ) : (
                      <SvgArrowDownLeft size={16} color={colors.expense} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {(() => {
                      const p = splitDescription(tx.description || tx.category);
                      const ref = tx.referenceNumber || `TXN-${tx.id.slice(-6).toUpperCase()}`;
                      return (
                        <>
                          {p.detail ? (
                            <FitText style={[styles.txDesc, { color: colors.foreground }]}>{p.title}</FitText>
                          ) : (
                            <Text style={[styles.txDesc, { color: colors.foreground }]}>{p.title}</Text>
                          )}
                          <FitText style={[styles.txRef, { color: colors.mutedForeground }]}>{p.detail ? `${ref} · ${p.detail}` : ref}</FitText>
                        </>
                      );
                    })()}
                  </View>
                </View>

                <View style={{ width: 170, paddingRight: 12, justifyContent: "center" }}>
                  <FitText style={[styles.tableCellText, { color: colors.foreground }]}>
                    {tx.category}
                  </FitText>
                </View>

                <View style={{ width: 140, paddingRight: 12, justifyContent: "center" }}>
                  <FitText style={[styles.tableCellText, { color: colors.foreground }]}>
                    {tx.department}
                  </FitText>
                </View>

                <View style={{ width: 112, paddingRight: 10, justifyContent: "center" }}>
                  <FitText style={[styles.tableCellText, { color: colors.mutedForeground }]}>
                    {tx.date}
                  </FitText>
                </View>

                <View style={{ width: 130, alignItems: "flex-end", justifyContent: "center" }}>
                  <Text numberOfLines={1}
                    style={[
                      styles.txAmount,
                      { color: tx.type === "income" ? colors.income : colors.expense },
                    ]}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {settings.currency} {tx.amount.toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          </ScrollView>
        )}
      </View>

      {/* ─── Net Operating Balance Breakdown Modal ─── */}
      <NetBalanceBreakdownModal
        visible={netModalVisible}
        onClose={() => setNetModalVisible(false)}
        transactions={transactions}
        departments={departments}
        budgets={budgets}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        netBalance={netBalance}
        netSurplus={netSurplus}
        currency={settings.currency}
      />

      {/* ─── Real-Time Notification Center Modal ─── */}
      <NotificationCenterModal
        visible={notificationModalVisible}
        onClose={() => setNotificationModalVisible(false)}
        notifications={notifications}
      />

      {/* ─── Consolidated Financial Statement Viewer Modal ─── */}
      <FinancialStatementViewerModal
        visible={statementModalVisible}
        onClose={() => setStatementModalVisible(false)}
        reportOpts={statementReportOpts}
      />

      {/* ─── Level 3 Comprehensive Financial Drill-Down Modal ─── */}
      <FinancialDrillDownModal
        visible={drillDownType !== null}
        type={drillDownType || "budget"}
        onClose={() => {
          setDrillDownType(null);
          setDrillDownDept(undefined);
        }}
        initialDepartment={drillDownDept}
        currency={settings.currency}
        period={activePeriod}
        transactions={transactions}
        budgets={budgets}
        departments={departments}
        nobHealth={nobHealth}
        onNavigate={onNavigate}
      />

      {/* ─── Department Staff & Roster Modal ─── */}
      <WebDepartmentStaffModal
        visible={staffModalVisible}
        onClose={() => {
          setStaffModalVisible(false);
          setStaffModalDept(null);
        }}
        department={staffModalDept}
        onEditDepartment={(dept) => {
          setStaffModalVisible(false);
          onNavigate?.("departments");
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  kpi2Card: { flex: 1, minWidth: 190, borderWidth: 1, borderRadius: 10, padding: 16, gap: 10, cursor: "pointer" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  kpi2Head: { flexDirection: "row", alignItems: "center", gap: 8 },
  kpi2Icon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  kpi2Label: { fontSize: 13, fontFamily: "Inter_500Medium", flexShrink: 1 },
  kpi2Value: { fontSize: 22, fontFamily: "Inter_600SemiBold", letterSpacing: -0.4 },
  kpi2Status: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
  kpi2Track: { height: 5, borderRadius: 3, overflow: "hidden", flexDirection: "row" },
  kpi2Foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, paddingTop: 10, marginTop: 2 },
  kpi2Link: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  qaGroup: { flexDirection: "row", alignItems: "stretch", borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  qaBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 38, paddingHorizontal: 14, cursor: "pointer" as any },
  qaIcon: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  qaText: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  qaAlert: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 14, borderWidth: 1, borderRadius: 8, cursor: "pointer" as any },
  container: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
  content: {
    padding: 20,
    gap: 20,
    paddingBottom: 60,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
  topActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 14,
  },
  welcomeTitle: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
  },
  welcomeSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 2,
  },
  actionButtonsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "nowrap",
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    cursor: "pointer" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  outlineActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    cursor: "pointer" as any,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
  outlineBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
  heroBalanceCard: {
    borderRadius: 10,
    padding: 20,
    gap: 14,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#1d4ed8",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  ambientGlowTopRight: {
    position: "absolute",
    top: -50,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(56, 189, 248, 0.22)",
    pointerEvents: "none",
  },
  ambientGlowBottomLeft: {
    position: "absolute",
    bottom: -60,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(37, 99, 235, 0.32)",
    pointerEvents: "none",
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  heroLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroLabel: {
    color: "#E2E8F0",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.1,
  },
  heroEyeBtn: {
    padding: 4,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 8,
  },
  heroGrowthPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1.2,
  },
  heroGrowthText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  heroGrowthSub: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
    opacity: 0.9,
  },
  heroStatusDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.5,
  },
  heroAmountSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  heroAmountText: {
    color: "#FFFFFF",
    fontSize: 32,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -1,
    textShadowColor: "rgba(0, 0, 0, 0.25)",
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 4,
  },
  balanceSubtext: {
    color: "#94A3B8",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 4,
  },
  heroDossierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  heroDossierText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  retentionContainer: {
    gap: 6,
    marginTop: -1,
    marginBottom: 2,
  },
  retentionLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  retentionText: {
    color: "#E2E8F0",
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
  },
  retentionTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    overflow: "hidden",
  },
  retentionFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#60a5fa",
  },
  glassCardsRow: {
    flexDirection: "row",
    gap: 10,
  },
  glassCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1.2,
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  glassCardMobile: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  glassIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  glassCardContent: {
    flex: 1,
    minWidth: 0,
  },
  glassCardLabel: {
    color: "#CBD5E1",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  glassCardValue: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    marginTop: 1,
  },
  kpiGrid: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    width: "100%",
  },
  kpiCard: {
    flex: 1,
    minWidth: 180,
    minHeight: 150,
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 6,
    cursor: "pointer" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  kpiCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kpiIconSquare: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  kpiTagText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
  kpiBigNumber: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
  },
  kpiLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },
  twoColumnSection: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  panelCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 20,
    gap: 16,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  titleIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  panelTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  panelSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 2,
  },
  panelLink: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
  miniInsightStrip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 4,
  },
  miniInsightText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 14.5,
  },
  ringCenterWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badgePillText: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  panelBentoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  panelBentoCol: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 2,
  },
  panelBentoLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  panelBentoVal: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 2,
  },
  panelBentoDivider: {
    width: 1,
    height: 22,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 6,
    marginVertical: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
  panelFooterCapsule: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  panelFooterText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
  tableContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  th: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  txIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txDesc: {
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.1,
    lineHeight: 19,
  },
  txRef: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  tableCellText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.1,
  },
  txAmount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  emptyState: {
    padding: 30,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
