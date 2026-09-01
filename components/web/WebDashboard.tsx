import React, { useState, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { useFinance, Transaction } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { AreaLineChart } from "@/components/AreaLineChart";
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
  aggregateTransactionsByGranularity,
  computeNetOperatingBalanceHealth,
  getBudgetInsight,
  getNobInsight,
  getExpenseDistributionInsight,
} from "@/services/DatePeriodService";
import {
  buildAuthoritativeFinancialModel,
  calculateBudgetAllocation,
  calculateBudgetRemaining,
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
  const [drillDownType, setDrillDownType] = useState<DrillDownType | null>(null);

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

  const [balanceViewMode, setBalanceViewMode] = useState<"cashflow" | "expenses" | "budget">("cashflow");
  const isDeficit = netBalance < 0;
  const netMargin = totalIncome > 0 ? ((netBalance / totalIncome) * 100) : (totalExpenses > 0 ? -100 : 0);
  const rawSpendRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : (totalExpenses > 0 ? 100 : 0);
  const clampedSpendRatio = Math.min(Math.round(rawSpendRatio), 100);
  const retainedSurplusPct = Math.max(0, Math.round(100 - rawSpendRatio));

  const totalLineBudgeted = calculateBudgetAllocation(budgets);
  const totalDeptBudgeted = calculateBudgetAllocation([], departments);
  const totalBudgeted = totalLineBudgeted > 0 ? totalLineBudgeted : totalDeptBudgeted;
  const netBudgetRemaining = calculateBudgetRemaining(totalBudgeted, totalExpenses);
  const netBudgetUtilization = totalBudgeted > 0 ? (totalExpenses / totalBudgeted) * 100 : 0;
  
  // Real-time authoritative display balance (Net Surplus vs Total Outflows vs Allocated Budget)
  const currentHeroBalance =
    balanceViewMode === "cashflow"
      ? netBalance
      : balanceViewMode === "budget"
      ? totalBudgeted
      : -totalExpenses;
  const currentHeroIsDeficit = currentHeroBalance < 0;

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

  const fmt = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return Number(n || 0).toLocaleString();
  };

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
  }, [transactions, departments]);

  // Recent 6 transactions
  const recentTransactions = useMemo(() => transactions.slice(0, 6), [transactions]);

  const canEdit = user?.role === "admin" || user?.role === "accountant";

  return (
    <ScrollView style={[styles.container, { width: "100%" }]} contentContainerStyle={[styles.content, isMobile && { padding: 12, gap: 12 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Executive Welcome & Quick Action Bar ─── */}
      <View style={[styles.topActionRow, isMobile && { flexDirection: "column", alignItems: "flex-start", gap: 12 }]}>
        <View style={{ maxWidth: "100%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={[styles.welcomeTitle, { color: colors.foreground, fontSize: isMobile ? 18 : 22 }]}>
              Executive Financial Overview
            </Text>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: syncStatus === "synced" ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: syncStatus === "synced" ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)",
            }}>
              <View style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: syncStatus === "synced" ? "#10B981" : "#F59E0B",
              }} />
              <Text style={{
                fontSize: 11,
                fontWeight: "600",
                color: syncStatus === "synced" ? "#10B981" : "#F59E0B",
              }}>
                {syncStatus === "synced" ? "Live Cloud Synchronized" : "Syncing..."}
              </Text>
            </View>
          </View>
          <Text style={[styles.welcomeSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 11.5 : 13, marginTop: 2 }]} numberOfLines={1}>
            {settings.organizationName || user?.organization || "Organization Finance Management"} · Real-Time Institutional Ledger
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxWidth: "100%", width: "100%", flexGrow: 0 }}
          contentContainerStyle={[styles.actionButtonsGroup, { paddingBottom: 4 }]}
        >
          {canEdit && (
            <>
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: colors.income, flexShrink: 0 }]}
                onPress={() => onOpenTransactionModal("income")}
                activeOpacity={0.8}
              >
                <SvgArrowUpRight size={14} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>+ Inflow (Income)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: colors.expense, flexShrink: 0 }]}
                onPress={() => onOpenTransactionModal("expense")}
                activeOpacity={0.8}
              >
                <SvgArrowDownLeft size={14} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>+ Outflow (Expense)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.outlineActionBtn, { borderColor: colors.border, backgroundColor: colors.card, flexShrink: 0 }]}
                onPress={onOpenBudgetModal}
                activeOpacity={0.8}
              >
                <SvgPieChart size={14} color={colors.primary} />
                <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>Allocate Budget</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={[styles.outlineActionBtn, { borderColor: colors.border, backgroundColor: colors.card, flexShrink: 0 }]}
            onPress={() => {
              const totalAlloc = budgets.reduce((s, b) => s + b.allocated, 0) || departments.reduce((s, d) => s + (d.budgetAllocated || 0), 0);
              const utilPct = totalAlloc > 0 ? (totalExpenses / totalAlloc) * 100 : 0;
              const opts: ReportOptions = {
                organizationName: settings.organizationName || "Organization Finance Management",
                organizationAddress: settings.organizationAddress || "Enterprise Financial Center",
                organizationEmail: settings.organizationEmail || "finance@ofm-cloud.com",
                organizationPhone: settings.organizationPhone || "+1 (800) 555-0199",
                organizationLogo: settings.organizationLogo || "",
                currency: settings.currency || "PKR",
                fiscalYear: settings.fiscalYear || "2025-2026",
                periodLabel: activePeriod?.label || "Consolidated Fiscal Ledger",
                generatedBy: user?.name || user?.email || "Chief Financial Officer",
                totalIncome,
                totalExpenses,
                netBalance: totalIncome - totalExpenses,
                budgetUtilization: utilPct,
                transactions,
                departments,
                payroll,
                budgets,
                chartPoints: chartPoints.map((p) => ({
                  label: p.label,
                  income: p.income,
                  expense: p.expense,
                })),
                includeSummary: true,
                includeCharts: true,
                includeCategories: true,
                includeDepartments: true,
                includePayroll: true,
                includeTransactions: true,
                includeReconciliation: true,
              };
              setStatementReportOpts(opts);
              setStatementModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <SvgFileText size={14} color={colors.primary} />
            <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>Export Statement (PDF)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.outlineActionBtn,
              {
                borderColor: unreadNotificationCount > 0 ? "#EF444466" : colors.border,
                backgroundColor: unreadNotificationCount > 0 ? "#EF444410" : colors.card,
                flexShrink: 0,
              },
            ]}
            onPress={() => setNotificationModalVisible(true)}
            activeOpacity={0.8}
          >
            <Feather name="bell" size={14} color={unreadNotificationCount > 0 ? "#EF4444" : colors.foreground} />
            <Text style={[styles.outlineBtnText, { color: unreadNotificationCount > 0 ? "#EF4444" : colors.foreground }]}>
              Alerts {unreadNotificationCount > 0 ? `(${unreadNotificationCount})` : ""}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ─── Net Operating Balance Hero Card (Exact Mobile Parity) ─── */}
      <LinearGradient
        colors={["#0B1936", "#102554", "#0A1B3F"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.heroBalanceCard,
          {
            borderRadius: 24,
            padding: isMobile ? 16 : 22,
            borderWidth: 1.5,
            borderColor: "rgba(59, 130, 246, 0.35)",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.4,
            shadowRadius: 24,
            elevation: 12,
            overflow: "hidden",
            position: "relative",
          },
        ]}
      >
        {/* Ambient Decorative Background Glows */}
        <View style={styles.ambientGlowTopRight} pointerEvents="none" />
        <View style={styles.ambientGlowBottomLeft} pointerEvents="none" />

        {/* Top Row: Title + Privacy Eye + Fiscal Dossier Button */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(56, 189, 248, 0.18)", alignItems: "center", justifyContent: "center" }}>
              <SvgShield size={13} color="#38BDF8" />
            </View>
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_800ExtraBold", letterSpacing: 1.2 }}>
              {balanceViewMode === "cashflow"
                ? "OPERATING RESULT"
                : balanceViewMode === "budget"
                ? "ALLOCATED BUDGET CAP"
                : "TOTAL DISBURSEMENTS"}
            </Text>
            <TouchableOpacity
              onPress={() => setHideBalance(!hideBalance)}
              style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255, 255, 255, 0.12)", alignItems: "center", justifyContent: "center" }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              {hideBalance ? (
                <SvgEyeOff size={13} color="#FFFFFF" />
              ) : (
                <SvgEye size={13} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* Direct Trigger to Open Net Operating Balance Dossier */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(255, 255, 255, 0.10)",
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.22)",
            }}
            onPress={() => setNetModalVisible(true)}
            activeOpacity={0.8}
          >
            <SvgChart size={13} color="#38BDF8" />
            <Text style={{ color: "#FFFFFF", fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.3 }}>
              Fiscal Dossier →
            </Text>
          </TouchableOpacity>
        </View>

        {/* View Mode Switcher Pills (Net Operating Result vs Total Outflows) */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 14,
              backgroundColor: balanceViewMode === "cashflow" ? "rgba(59, 130, 246, 0.25)" : "rgba(255, 255, 255, 0.08)",
              borderWidth: 1.5,
              borderColor: balanceViewMode === "cashflow" ? "#3B82F6" : "rgba(255, 255, 255, 0.14)",
              cursor: "pointer" as any,
            }}
            onPress={() => setBalanceViewMode("cashflow")}
            activeOpacity={0.8}
          >
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#10B981" }} />
            <Text style={{ color: balanceViewMode === "cashflow" ? "#FFFFFF" : "rgba(255, 255, 255, 0.75)", fontSize: 12, fontFamily: "Inter_700Bold" }}>
              Net Surplus ({netBalance >= 0 ? "+" : "-"}{settings.currency} {fmt(Math.abs(netBalance))})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 14,
              backgroundColor: balanceViewMode === "expenses" ? "rgba(244, 63, 94, 0.25)" : "rgba(255, 255, 255, 0.08)",
              borderWidth: 1.5,
              borderColor: balanceViewMode === "expenses" ? "#F43F5E" : "rgba(255, 255, 255, 0.14)",
              cursor: "pointer" as any,
            }}
            onPress={() => setBalanceViewMode("expenses")}
            activeOpacity={0.8}
          >
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#F43F5E" }} />
            <Text style={{ color: balanceViewMode === "expenses" ? "#FFFFFF" : "rgba(255, 255, 255, 0.75)", fontSize: 12, fontFamily: "Inter_700Bold" }}>
              Total Outflows (-{settings.currency} {fmt(totalExpenses)})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Balance Hero Amount Display + Growth Metric Pill */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => setNetModalVisible(true)}
            activeOpacity={0.85}
            style={{ flex: 1 }}
          >
            {hideBalance ? (
              <Text style={styles.heroAmountText} numberOfLines={1}>
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
                    fontSize: isMobile ? 26 : 34,
                    color: balanceViewMode === "expenses" ? "#FB7185" : "#FFFFFF",
                    fontFamily: "Inter_800ExtraBold",
                  },
                ]}
              />
            )}
          </TouchableOpacity>

          {/* Growth Pill Badge (Matching Screenshot) */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 20,
              backgroundColor: currentHeroIsDeficit ? "rgba(244, 63, 94, 0.20)" : "rgba(16, 185, 129, 0.20)",
              borderWidth: 1.5,
              borderColor: currentHeroIsDeficit ? "rgba(244, 63, 94, 0.50)" : "rgba(16, 185, 129, 0.50)",
            }}
            onPress={() => setGrowthMode((m) => (m + 1) % 4)}
            activeOpacity={0.8}
          >
            {currentHeroIsDeficit ? (
              <SvgTrendingDown size={13} color="#FB7185" />
            ) : (
              <SvgTrendingUp size={13} color="#34D399" />
            )}
            <Text style={{ color: currentHeroIsDeficit ? "#FB7185" : "#34D399", fontSize: 12, fontFamily: "Inter_700Bold" }}>
              {balanceViewMode === "expenses"
                ? `${clampedSpendRatio}% Outflow Ratio`
                : `${netMargin >= 0 ? "+" : ""}${netMargin.toFixed(1)}% Operating Margin`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Dynamic Cash Flow / Budget Retention Progress Bar & Labels */}
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#E2E8F0", fontSize: 11.5, fontFamily: "Inter_500Medium" }}>
              {clampedSpendRatio}% Spent of Inflows
            </Text>
            <Text style={{ color: currentHeroIsDeficit ? "#FB7185" : "#34D399", fontSize: 11.5, fontFamily: "Inter_700Bold" }}>
              {retainedSurplusPct}% Retained Surplus
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255, 255, 255, 0.15)", overflow: "hidden" }}>
            <View
              style={{
                height: "100%",
                borderRadius: 3,
                width: `${isDeficit ? 100 : clampedSpendRatio}%`,
                backgroundColor: currentHeroIsDeficit ? "#FB7185" : "#38BDF8",
              }}
            />
          </View>
        </View>
      </LinearGradient>

      {/* ─── 4 Multi-Metric KPI Cards Row ─── */}
      <View style={styles.kpiGrid}>
        {/* Card 1: Inflows */}
        <TouchableOpacity
          style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => onNavigate("income")}
          activeOpacity={0.8}
        >
          <View style={styles.kpiCardHeader}>
            <View style={[styles.kpiIconSquare, { backgroundColor: colors.income + "18" }]}>
              <SvgArrowUpRight size={18} color={colors.income} />
            </View>
            <View style={[styles.kpiTag, { backgroundColor: colors.income + "15" }]}>
              <Text style={[styles.kpiTagText, { color: colors.income }]}>Inflows</Text>
            </View>
          </View>
          <WebCountUp
            value={totalIncome}
            prefix={`${settings.currency} `}
            formatter={fmt}
            style={[styles.kpiBigNumber, { color: colors.foreground }]}
          />
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Institutional Revenue</Text>
        </TouchableOpacity>

        {/* Card 2: Outflows */}
        <TouchableOpacity
          style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => onNavigate("expenses")}
          activeOpacity={0.8}
        >
          <View style={styles.kpiCardHeader}>
            <View style={[styles.kpiIconSquare, { backgroundColor: colors.expense + "18" }]}>
              <SvgArrowDownLeft size={18} color={colors.expense} />
            </View>
            <View style={[styles.kpiTag, { backgroundColor: colors.expense + "15" }]}>
              <Text style={[styles.kpiTagText, { color: colors.expense }]}>Outflows</Text>
            </View>
          </View>
          <WebCountUp
            value={totalExpenses}
            prefix={`${settings.currency} `}
            formatter={fmt}
            style={[styles.kpiBigNumber, { color: colors.foreground }]}
          />
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Operational Expenses</Text>
        </TouchableOpacity>

        {/* Card 3: Total Budget Allocated */}
        <TouchableOpacity
          style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => onNavigate("budgets")}
          activeOpacity={0.8}
        >
          <View style={styles.kpiCardHeader}>
            <View style={[styles.kpiIconSquare, { backgroundColor: "#3B82F618" }]}>
              <SvgPieChart size={18} color="#3B82F6" />
            </View>
            <View style={[styles.kpiTag, { backgroundColor: "#3B82F615" }]}>
              <Text style={[styles.kpiTagText, { color: "#3B82F6" }]}>{budgetUtilization.toFixed(0)}% Used</Text>
            </View>
          </View>
          <WebCountUp
            value={totalBudgeted}
            prefix={`${settings.currency} `}
            formatter={fmt}
            style={[styles.kpiBigNumber, { color: colors.foreground }]}
          />
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Total Budget Allocated</Text>
        </TouchableOpacity>

        {/* Card 4: Monitored Units */}
        <TouchableOpacity
          style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => onNavigate("departments")}
          activeOpacity={0.8}
        >
          <View style={styles.kpiCardHeader}>
            <View style={[styles.kpiIconSquare, { backgroundColor: "#8B5CF618" }]}>
              <SvgLayers size={18} color="#8B5CF6" />
            </View>
            <View style={[styles.kpiTag, { backgroundColor: "#8B5CF615" }]}>
              <Text style={[styles.kpiTagText, { color: "#8B5CF6" }]}>{departments.length} Units</Text>
            </View>
          </View>
          <Text style={[styles.kpiBigNumber, { color: colors.foreground }]}>{departments.length} Depts</Text>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>Monitored Cost Centers</Text>
        </TouchableOpacity>
      </View>

      {/* ─── 1. FULL FINANCIAL TREND ANALYTICS GRAPH (AreaLineChart) ─── */}
      <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>Financial Trend Analysis</Text>
            <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
              Inflows vs Outflows historical timeline ({activePeriod.label})
            </Text>
          </View>
          <TouchableOpacity onPress={() => onNavigate("reports")}>
            <Text style={[styles.panelLink, { color: colors.primary }]}>Detailed Analytics →</Text>
          </TouchableOpacity>
        </View>

        <AreaLineChart
          data={chartPoints}
          width={isMobile ? width - 40 : 880}
          height={185}
          currency={settings.currency}
          activePeriod={activePeriod}
          onPeriodSelect={(p) => setActivePeriod(p)}
          transactions={transactions}
          userId={user?.id || "default"}
        />
      </View>

      {/* ─── Authoritative 3-Card Financial Analytics Suite (Budget, NOM, Distribution) ─── */}
      <FinancialAnalyticsSuite
        budget={authFinancialModel.budget}
        margin={authFinancialModel.margin}
        distribution={authFinancialModel.distribution}
        currency={settings.currency}
        onOpenDrillDown={(type) => setDrillDownType(type)}
      />

      {/* ─── Department Spending Horizontal Bars (HBarChart) ─── */}
      <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>Department Cost Center Outflows</Text>
            <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
              {deptSpendingItems.length} Monitored Institutional Units
            </Text>
          </View>
          <TouchableOpacity onPress={() => onNavigate("departments")}>
            <Text style={[styles.panelLink, { color: colors.primary }]}>View All Departments →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingVertical: 6 }}>
          <HBarChart
            items={deptSpendingItems}
            currency={settings.currency}
            labelWidth={isMobile ? 120 : 210}
          />
        </View>
      </View>

      {/* ─── Recent General Ledger Transactions Table ─── */}
      <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>Recent General Ledger Transactions</Text>
            <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
              Live synchronized General Ledger records
            </Text>
          </View>
          <TouchableOpacity onPress={() => onNavigate("transactions")}>
            <Text style={[styles.panelLink, { color: colors.primary }]}>View General Ledger →</Text>
          </TouchableOpacity>
        </View>

        {recentTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <SvgFileText size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No transactions recorded yet.</Text>
          </View>
        ) : (
          <View style={styles.tableContainer}>
            {/* Table Header */}
            <View style={[styles.tableHeaderRow, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.th, { flex: 2, color: colors.mutedForeground }]}>TRANSACTION / MEMO</Text>
              {!isMobile && <Text style={[styles.th, { flex: 1.2, color: colors.mutedForeground }]}>CATEGORY</Text>}
              {!isMobile && <Text style={[styles.th, { flex: 1.2, color: colors.mutedForeground }]}>DEPARTMENT</Text>}
              <Text style={[styles.th, { flex: 1, color: colors.mutedForeground }]}>DATE</Text>
              <Text style={[styles.th, { flex: 1.2, color: colors.mutedForeground, textAlign: "right" }]}>AMOUNT</Text>
            </View>

            {/* Table Rows */}
            {recentTransactions.map((tx) => (
              <View key={tx.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={[
                      styles.txIconBadge,
                      {
                        backgroundColor: tx.type === "income" ? colors.income + "18" : colors.expense + "18",
                      },
                    ]}
                  >
                    {tx.type === "income" ? (
                      <SvgArrowUpRight size={13} color={colors.income} />
                    ) : (
                      <SvgArrowDownLeft size={13} color={colors.expense} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txDesc, { color: colors.foreground }]} numberOfLines={1}>
                      {tx.description || tx.category}
                    </Text>
                    <Text style={[styles.txRef, { color: colors.mutedForeground }]}>
                      {tx.referenceNumber || `TXN-${tx.id.slice(-6).toUpperCase()}`}
                    </Text>
                  </View>
                </View>

                {!isMobile && (
                  <View style={{ flex: 1.2 }}>
                    <Text style={[styles.tableCellText, { color: colors.foreground }]} numberOfLines={1}>
                      {tx.category}
                    </Text>
                  </View>
                )}

                {!isMobile && (
                  <View style={{ flex: 1.2 }}>
                    <Text style={[styles.tableCellText, { color: colors.foreground }]} numberOfLines={1}>
                      {tx.department}
                    </Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={[styles.tableCellText, { color: colors.mutedForeground }]}>
                    {tx.date}
                  </Text>
                </View>

                <View style={{ flex: 1.2, alignItems: "flex-end" }}>
                  <Text
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
        )}
      </View>

      {/* ─── Net Operating Balance Breakdown Modal ─── */}
      <NetBalanceBreakdownModal
        visible={netModalVisible}
        onClose={() => setNetModalVisible(false)}
        transactions={transactions}
        departments={departments}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        netBalance={netBalance}
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
        onClose={() => setDrillDownType(null)}
        currency={settings.currency}
        period={activePeriod}
        transactions={transactions}
        budgets={budgets}
        nobHealth={nobHealth}
        onNavigate={onNavigate}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 20,
    paddingBottom: 60,
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
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 2,
  },
  actionButtonsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "nowrap",
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  outlineActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
  },
  outlineBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
  heroBalanceCard: {
    borderRadius: 22,
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
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  ambientGlowBottomLeft: {
    position: "absolute",
    bottom: -50,
    left: -30,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(37, 99, 235, 0.3)",
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
    borderRadius: 14,
    borderWidth: 1.2,
  },
  heroGrowthText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  heroGrowthSub: {
    color: "#FFFFFF",
    fontSize: 10,
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
    fontSize: 10.5,
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
    borderRadius: 14,
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
    fontSize: 9,
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
    gap: 14,
    flexWrap: "wrap",
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  kpiCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kpiIconSquare: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  kpiTagText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  kpiBigNumber: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
  },
  kpiLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
  },
  twoColumnSection: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  panelCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
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
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  panelSubtitle: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 2,
  },
  panelLink: {
    fontSize: 12,
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
    fontSize: 10.5,
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
    fontSize: 10.5,
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
    fontSize: 8.5,
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
    borderRadius: 14,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 10.5,
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
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  txIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  txDesc: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  txRef: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  tableCellText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.1,
  },
  txAmount: {
    fontSize: 13,
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
