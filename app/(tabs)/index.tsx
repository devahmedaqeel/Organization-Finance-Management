import { Feather } from "@/components/UniversalIcon";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  TextInput,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AreaLineChart } from "@/components/AreaLineChart";
import { DonutChart } from "@/components/DonutChart";
import { HBarChart } from "@/components/HBarChart";
import { RingProgress } from "@/components/RingProgress";
import { TransactionItem } from "@/components/TransactionItem";
import { DownloadReportModal } from "@/components/DownloadReportModal";
import { NotificationCenterModal } from "@/components/NotificationCenterModal";
import { NetBalanceBreakdownModal } from "@/components/NetBalanceBreakdownModal";
import { NetOperatingBalanceHealthCard } from "@/components/NetOperatingBalanceHealthCard";
import { FinancialDrillDownModal, DrillDownType } from "@/components/FinancialDrillDownModal";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { WORLD_CURRENCIES } from "@/constants/currencies";
import { useResponsive } from "@/hooks/useResponsive";
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
  calculateBudgetUsed,
  calculateBudgetRemaining,
} from "@/services/FinancialCalculationEngine";
import { FinancialAnalyticsSuite } from "@/components/analytics/FinancialAnalyticsSuite";

const SCREEN_W = Dimensions.get("window").width;
const ROLE_COLORS: Record<string, string> = {
  admin: "#3B82F6",
  accountant: "#10B981",
  manager: "#F59E0B",
};

function fmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return Number(n || 0).toLocaleString();
}
function fmtCur(n: number, cur: string) {
  return `${cur} ${fmt(n)}`;
}

const EXPENSE_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];
const ALL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function AnimatedQuickAction({
  label,
  sub,
  badge,
  icon,
  color,
  onPress,
}: {
  label: string;
  sub: string;
  badge?: string;
  icon: any;
  color: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 8,
    }).start();
  };

  return (
    <Animated.View style={{ width: "48.5%", marginBottom: 10, transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          styles.actionCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        activeOpacity={0.88}
      >
        <View style={styles.actionTopRow}>
          <View style={[styles.actionIconWrap, { backgroundColor: color + "20" }]}>
            <Feather name={icon} size={18} color={color} />
          </View>
          {badge && (
            <View style={[styles.actionBadge, { backgroundColor: color + "18", borderColor: color + "35" }]}>
              <Text style={[styles.actionBadgeText, { color }]}>{badge}</Text>
            </View>
          )}
        </View>
        <View style={{ gap: 2 }}>
          <Text style={[styles.actionTitleText, { color: colors.foreground }]}>
            {label}
          </Text>
          <Text style={[styles.actionSubText, { color: colors.mutedForeground }]}>
            {sub}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chartW, statCardW, hPad } = useResponsive();
  const { user, logout } = useAuth();
  const {
    transactions,
    totalIncome,
    totalExpenses,
    netBalance,
    budgetUtilization,
    budgets,
    payroll,
    departments,
    notifications,
    unreadNotificationCount,
    deleteTransaction,
    syncStatus,
    refreshData,
  } = useFinance();
  const { settings } = useSettings();
  const keyboardHeight = useKeyboardHeight();
  const [hideBalance, setHideBalance] = useState<boolean>(false);
  const [growthMode, setGrowthMode] = useState<number>(0);
  const [txModalVisible, setTxModalVisible] = useState<boolean>(false);
  const [exportModalVisible, setExportModalVisible] = useState<boolean>(false);
  const [netModalVisible, setNetModalVisible] = useState<boolean>(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState<boolean>(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const handleConfirmLogout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLogoutModalVisible(false);
      await logout();
      router.replace("/login");
    } catch {
      setIsLoggingOut(false);
    }
  }, [logout]);
  const [txSearchQuery, setTxSearchQuery] = useState<string>("");
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "income" | "expense">("all");
  const selectedCurrency = useMemo(() => WORLD_CURRENCIES.find(c => c.code === settings.currency), [settings.currency]);
  const orgDisplayName = settings.organizationName || user?.organization || "Organization Finance Management";
  const dynamicOrgFontSize = useMemo(() => {
    const len = orgDisplayName.length;
    if (len <= 14) return 12.5;
    if (len <= 20) return 11.5;
    if (len <= 28) return 10.5;
    if (len <= 38) return 9.5;
    return 8.5;
  }, [orgDisplayName]);
  const webTop = Platform.OS === "web" ? 67 : 0;
  const roleColor = ROLE_COLORS[user?.role ?? "admin"];
  const [balanceViewMode, setBalanceViewMode] = useState<"cashflow" | "expenses" | "budget">("cashflow");
  const totalLineBudgeted = calculateBudgetAllocation(budgets);
  const totalDeptBudgeted = calculateBudgetAllocation([], departments);
  const totalBudgeted = totalLineBudgeted > 0 ? totalLineBudgeted : totalDeptBudgeted;
  const totalBudgetSpent = calculateBudgetUsed(transactions, budgets);
  const netBudgetRemaining = calculateBudgetRemaining(totalBudgeted, totalBudgetSpent);
  const netBudgetUtilization = totalBudgeted > 0 ? (totalBudgetSpent / totalBudgeted) * 100 : 0;

  // Net Surplus incorporates Institutional Income and Budget Allocated minus Outflows
  const netSurplus = (totalIncome + totalBudgeted) - totalExpenses;
  const totalFundingPool = totalIncome + totalBudgeted;
  const realNetOperatingResult = netSurplus;
  const isDeficit = realNetOperatingResult < 0;
  const netMargin = totalFundingPool > 0 ? (realNetOperatingResult / totalFundingPool) * 100 : (totalExpenses > 0 ? -100 : 0);
  const rawSpendRatio = totalFundingPool > 0 ? (totalExpenses / totalFundingPool) * 100 : (totalExpenses > 0 ? 100 : 0);
  const clampedSpendRatio = Math.min(Math.round(rawSpendRatio), 100);
  const retainedSurplusPct = Math.max(0, Math.round(100 - rawSpendRatio));
  
  // Real-time authoritative display balance (Net Surplus vs Total Outflows vs Allocated Budget)
  const currentHeroBalance =
    balanceViewMode === "cashflow"
      ? netSurplus
      : balanceViewMode === "budget"
      ? totalBudgeted
      : -totalExpenses;
  const currentHeroIsDeficit = currentHeroBalance < 0;

  // Filtered transactions for the modal viewer
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchType = txTypeFilter === "all" || t.type === txTypeFilter;
      const q = txSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (t.category || "").toLowerCase().includes(q) ||
        (t.department || "").toLowerCase().includes(q) ||
        (t.description && (t.description || "").toLowerCase().includes(q)) ||
        (t.amount !== undefined && t.amount !== null && t.amount.toString().includes(q));
      return matchType && matchSearch;
    });
  }, [transactions, txTypeFilter, txSearchQuery]);

  const [trendRange, setTrendRange] = useState<string>("6M");
  const [customPeriodName, setCustomPeriodName] = useState<string | null>(null);
  const [mobileBudgetMode, setMobileBudgetMode] = useState<"used" | "spent" | "remaining">("used");
  const [mobileNobMode, setMobileNobMode] = useState<"margin" | "inflows" | "net">("margin");
  const [mobileDrillDown, setMobileDrillDown] = useState<DrillDownType | null>(null);
  const [customSelection, setCustomSelection] = useState<any | null>(null);
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() =>
    getPresetPeriod("last_6m")
  );

  // Hardware Back button handling on Android
  useEffect(() => {
    const onBackPress = () => {
      if (mobileDrillDown !== null) {
        setMobileDrillDown(null);
        return true;
      }
      if (txModalVisible) {
        setTxModalVisible(false);
        return true;
      }
      if (exportModalVisible) {
        setExportModalVisible(false);
        return true;
      }
      if (netModalVisible) {
        setNetModalVisible(false);
        return true;
      }
      if (notificationModalVisible) {
        setNotificationModalVisible(false);
        return true;
      }
      return false; // allow native Android app exit
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [mobileDrillDown, txModalVisible, exportModalVisible, netModalVisible, notificationModalVisible]);

  // Auto-sync authoritative cloud data once on mount
  useEffect(() => {
    refreshData().catch(() => {});
  }, []);

  const currentGranularity = activePeriod.userGranularityOverride || activePeriod.granularity;
  const granularityLabel =
    currentGranularity === "day"
      ? "Daily View"
      : currentGranularity === "week"
      ? "Weekly View"
      : currentGranularity === "month"
      ? "Monthly View"
      : "Yearly View";

  const trendRangeSub = useMemo(() => {
    const baseLabel =
      customSelection?.presetName ||
      (customSelection?.from && customSelection?.to
        ? `${customSelection.from} – ${customSelection.to}`
        : activePeriod.label);
    return `${baseLabel} · ${granularityLabel}`;
  }, [activePeriod, customSelection, granularityLabel]);

  // Compute trend data  // Dynamic period-filtered chart points from the centralized engine
  const chartData = useMemo(() => {
    return aggregateTransactionsByGranularity(transactions, activePeriod);
  }, [transactions, activePeriod]);

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

  // Authoritative Net Operating Balance Health
  const nobHealth = useMemo(
    () => computeNetOperatingBalanceHealth(transactions, activePeriod),
    [transactions, activePeriod]
  );

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.filter(t => t.type === "expense").forEach(t => {
      map[t.category] = (map[t.category] ?? 0) + t.amount;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value], i) => ({ label, value, color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }));
  }, [transactions]);

  const expenseByDept = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.filter(t => t.type === "expense").forEach(t => {
      map[t.department] = (map[t.department] ?? 0) + t.amount;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([department, total], i) => ({
        department,
        total,
        label: department,
        value: total,
        color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
      }));
  }, [transactions]);

  const deptSpend = expenseByDept;

  const recentTransactions = transactions.slice(0, 4);
  const totalPayroll = payroll.reduce((s, p) => s + p.baseSalary + p.bonus - p.deductions, 0);
  const effectiveUtilization = useMemo(() => {
    if (totalBudgeted <= 0) return 0;
    const spentSum = budgets.reduce((s, b) => s + (b.spent || 0), 0);
    const effective = spentSum > 0 ? spentSum : totalExpenses;
    return Math.min((effective / totalBudgeted) * 100, 100);
  }, [totalBudgeted, budgets, totalExpenses]);

  const now = new Date();
  const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYm = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const prevMonthIncome = transactions.filter(t => t.type === "income" && t.date.startsWith(prevYm)).reduce((s, t) => s + t.amount, 0);
  const curMonthIncome = transactions.filter(t => t.type === "income" && t.date.startsWith(curYm)).reduce((s, t) => s + t.amount, 0);
  const incomeGrowth = prevMonthIncome > 0 ? ((curMonthIncome - prevMonthIncome) / prevMonthIncome) * 100 : (curMonthIncome > 0 ? 100 : 0);
  const chartWidth = chartW;

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 67 + insets.top + 12 : Math.max(insets.top, 20) + 14,
          paddingBottom: Math.max(insets.bottom, 16) + 95,
          paddingHorizontal: hPad,
        },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={syncStatus === "syncing"}
          onRefresh={refreshData}
          tintColor="#3B82F6"
          colors={["#3B82F6"]}
        />
      }
    >
      {/* ─── Executive 2-Tier Header ─── */}
      <View style={styles.headerContainer}>
        {/* Tier 1: Brand / Organization & Action Controls */}
        <View style={styles.headerTopBar}>
          <View style={[styles.orgBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 13, transform: [{ translateY: Platform.OS === 'ios' ? 0.5 : 0 }] }}>{selectedCurrency?.flag ?? "🌐"}</Text>
            <Text
              style={[
                styles.orgName,
                {
                  color: colors.mutedForeground,
                  fontSize: dynamicOrgFontSize,
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {orgDisplayName}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setNotificationModalVisible(true);
              }}
              style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card, position: "relative" }]}
              activeOpacity={0.7}
              accessibilityLabel="Notifications"
            >
              <Feather name="bell" size={15} color={colors.foreground} />
              {unreadNotificationCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={[styles.roleBadge, { backgroundColor: roleColor + "18", borderColor: roleColor + "45" }]}>
              <Text style={[styles.roleText, { color: roleColor }]}>{user?.role?.toUpperCase()}</Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setLogoutModalVisible(true);
              }}
              style={[styles.iconBtn, styles.logoutIconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              activeOpacity={0.7}
              accessibilityLabel="Log Out"
            >
              <Feather name="log-out" size={15} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tier 2: User Identity & Live Sync Status */}
        <View style={styles.headerUserBar}>
          <View style={styles.userNameWrap}>
            <Text
              style={[styles.name, { color: colors.foreground }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {user?.name ?? "User"}
            </Text>
          </View>

          <View
            style={[
              styles.syncBadge,
              {
                backgroundColor: syncStatus === "synced" ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
                borderColor: syncStatus === "synced" ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)",
              },
            ]}
          >
            <View
              style={[
                styles.syncDot,
                { backgroundColor: syncStatus === "synced" ? "#10B981" : "#F59E0B" },
              ]}
            />
            <Text
              style={[
                styles.syncText,
                { color: syncStatus === "synced" ? "#10B981" : "#F59E0B" },
              ]}
              numberOfLines={1}
            >
              {syncStatus === "synced" ? "Cloud Sync" : "Syncing..."}
            </Text>
          </View>
        </View>
      </View>

      {/* ─── Premium Hero Balance Card (Matching Web Exactly) ─── */}
      <LinearGradient
        colors={["#081229", "#112D6F", "#1D4ED8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.heroBalanceCard,
          {
            borderRadius: 22,
            padding: 18,
            borderWidth: 1.2,
            borderColor: "rgba(255, 255, 255, 0.18)",
            shadowColor: "#1d4ed8",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.35,
            shadowRadius: 18,
            elevation: 10,
            overflow: "hidden",
            position: "relative",
            marginBottom: 16,
          },
        ]}
      >
        {/* Ambient Decorative Background Glow */}
        <View style={styles.ambientGlowTopRight} pointerEvents="none" />
        <View style={styles.ambientGlowBottomLeft} pointerEvents="none" />

        {/* Top Row: Title + Privacy Eye + Fiscal Dossier Button */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0, marginRight: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(56, 189, 248, 0.18)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Feather name="shield" size={11} color="#38BDF8" />
            </View>
            <Text
              style={{ color: "#FFFFFF", fontSize: 11.5, fontFamily: "Inter_800ExtraBold", letterSpacing: 0.6, flexShrink: 1 }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {balanceViewMode === "cashflow"
                ? "OPERATING RESULT"
                : balanceViewMode === "budget"
                ? "BUDGET CAP"
                : "OUTFLOW AUDIT"}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setHideBalance(!hideBalance);
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255, 255, 255, 0.12)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Feather name={hideBalance ? "eye-off" : "eye"} size={11} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Direct Trigger to Open Net Operating Balance Dossier */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "rgba(255, 255, 255, 0.10)",
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.22)",
              flexShrink: 0,
            }}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setNetModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Feather name="bar-chart-2" size={10} color="#38BDF8" />
            <Text style={{ color: "#FFFFFF", fontSize: 10.5, fontFamily: "Inter_700Bold", letterSpacing: 0.2 }}>
              Fiscal Dossier →
            </Text>
          </TouchableOpacity>
        </View>

        {/* View Mode Switcher Pills (Symmetrical Side-by-Side Flex, 10px Gap, Zero Touch) */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4.5,
              paddingHorizontal: 6,
              paddingVertical: 5.5,
              borderRadius: 10,
              backgroundColor: balanceViewMode === "cashflow" ? "rgba(59, 130, 246, 0.30)" : "rgba(255, 255, 255, 0.08)",
              borderWidth: 1.2,
              borderColor: balanceViewMode === "cashflow" ? "#60A5FA" : "rgba(255, 255, 255, 0.15)",
            }}
            onPress={() => {
              setBalanceViewMode("cashflow");
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            activeOpacity={0.8}
          >
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#10B981", flexShrink: 0 }} />
            <Text
              style={{
                color: balanceViewMode === "cashflow" ? "#FFFFFF" : "rgba(255, 255, 255, 0.75)",
                fontSize: 9.5,
                fontFamily: "Inter_700Bold",
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              Surplus ({netSurplus >= 0 ? "+" : "-"}{settings.currency} {fmt(Math.abs(netSurplus))})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4.5,
              paddingHorizontal: 6,
              paddingVertical: 5.5,
              borderRadius: 10,
              backgroundColor: balanceViewMode === "expenses" ? "rgba(244, 63, 94, 0.30)" : "rgba(255, 255, 255, 0.08)",
              borderWidth: 1.2,
              borderColor: balanceViewMode === "expenses" ? "#F43F5E" : "rgba(255, 255, 255, 0.15)",
            }}
            onPress={() => {
              setBalanceViewMode("expenses");
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            activeOpacity={0.8}
          >
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#F43F5E", flexShrink: 0 }} />
            <Text
              style={{
                color: balanceViewMode === "expenses" ? "#FFFFFF" : "rgba(255, 255, 255, 0.75)",
                fontSize: 9.5,
                fontFamily: "Inter_700Bold",
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              Outflows (-{settings.currency} {fmt(totalExpenses)})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Balance Hero Amount Display + Margin Pill (Matching Web Exactly) */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setNetModalVisible(true);
            }}
            activeOpacity={0.85}
            style={{ flex: 1, marginRight: 8 }}
          >
            {hideBalance ? (
              <Text style={styles.heroAmountText} numberOfLines={1}>
                {settings.currency} ••••••
              </Text>
            ) : (
              <Text
                style={[
                  styles.heroAmountText,
                  {
                    fontSize: 30,
                    color: balanceViewMode === "expenses" ? "#FB7185" : "#FFFFFF",
                    fontFamily: "Inter_800ExtraBold",
                    letterSpacing: -0.8,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {`${currentHeroBalance >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(currentHeroBalance))}`}
              </Text>
            )}
          </TouchableOpacity>

          {/* Growth Pill Badge Matching Web */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 11,
              paddingVertical: 6,
              borderRadius: 18,
              backgroundColor: currentHeroIsDeficit ? "rgba(244, 63, 94, 0.20)" : "rgba(16, 185, 129, 0.20)",
              borderWidth: 1.5,
              borderColor: currentHeroIsDeficit ? "rgba(244, 63, 94, 0.50)" : "rgba(16, 185, 129, 0.50)",
              flexShrink: 0,
            }}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNetModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Feather
              name={currentHeroIsDeficit ? "trending-down" : "trending-up"}
              size={12}
              color={currentHeroIsDeficit ? "#FB7185" : "#34D399"}
            />
            <Text style={{ color: currentHeroIsDeficit ? "#FB7185" : "#34D399", fontSize: 12, fontFamily: "Inter_700Bold" }}>
              {balanceViewMode === "expenses"
                ? `${clampedSpendRatio}% Outflow`
                : `${netMargin >= 0 ? "+" : ""}${netMargin.toFixed(1)}% Margin`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Dynamic Cash Flow / Budget Retention Progress Bar & Labels (Matching Web Exactly) */}
        <View style={{ gap: 7, marginTop: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#CBD5E1", fontSize: 11, fontFamily: "Inter_500Medium" }}>
              {isDeficit
                ? `${Math.round(rawSpendRatio)}% Overspent`
                : `${clampedSpendRatio}% Total Spent`}
            </Text>
            <Text style={{ color: currentHeroIsDeficit ? "#FB7185" : "#34D399", fontSize: 11, fontFamily: "Inter_700Bold" }}>
              {isDeficit
                ? "Operating Deficit"
                : `${retainedSurplusPct}% Net Surplus`}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255, 255, 255, 0.12)", overflow: "hidden" }}>
            <View
              style={{
                height: "100%",
                width: `${Math.min(Math.max(clampedSpendRatio, 2), 100)}%`,
                backgroundColor: currentHeroIsDeficit ? "#FB7185" : "#38BDF8",
                borderRadius: 3,
              }}
            />
          </View>
        </View>
      </LinearGradient>

      {/* ─── Horizontal Quick KPI Stats Bar ─── */}
      <View style={styles.statsScrollWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScroll}
        >
          {/* Card 1: Total Income */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                width: Math.max(statCardW, 140),
              },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/income");
            }}
            activeOpacity={0.75}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: colors.income + "20" }]}>
                <Feather name="arrow-up-circle" size={17} color={colors.income} />
              </View>
              <View style={[styles.kpiTag, { backgroundColor: colors.income + "18" }]}>
                <Text style={[styles.kpiTagText, { color: colors.income }]}>
                  Inflow
                </Text>
              </View>
            </View>
            <Text style={[styles.kpiValueText, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
              +{settings.currency} {fmt(totalIncome)}
            </Text>
            <Text style={[styles.kpiLabelText, { color: colors.mutedForeground }]}>Total Income</Text>
            <Text
              style={{
                fontSize: 9.5,
                color: isDeficit ? colors.expense : colors.income,
                fontFamily: "Inter_600SemiBold",
                marginTop: -2,
              }}
            >
              {totalIncome > 0
                ? isDeficit
                  ? `Deficit: -${settings.currency} ${fmt(Math.abs(netBalance))}`
                  : `${retainedSurplusPct}% Retained`
                : "No Income"}
            </Text>
            <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
              <View
                style={{
                  height: "100%",
                  width: `${totalIncome === 0 ? 0 : Math.min(Math.max(!isDeficit ? retainedSurplusPct : 10, 6), 100)}%`,
                  backgroundColor: isDeficit ? colors.expense : colors.income,
                  borderRadius: 2,
                }}
              />
            </View>
          </TouchableOpacity>

          {/* Card 2: Total Expenses */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                width: Math.max(statCardW, 140),
              },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/expenses");
            }}
            activeOpacity={0.75}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: colors.expense + "20" }]}>
                <Feather name="arrow-down-circle" size={17} color={colors.expense} />
              </View>
              <View
                style={[
                  styles.kpiTag,
                  { backgroundColor: (totalExpenses === 0 ? colors.income : isDeficit ? colors.expense : colors.warning) + "18" },
                ]}
              >
                <Text style={[styles.kpiTagText, { color: totalExpenses === 0 ? colors.income : isDeficit ? colors.expense : colors.warning }]}>
                  {totalExpenses === 0 ? "No Expenses" : isDeficit ? "Over Budget" : "Expenses"}
                </Text>
              </View>
            </View>
            <Text style={[styles.kpiValueText, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
              -{settings.currency} {fmt(totalExpenses)}
            </Text>
            <Text style={[styles.kpiLabelText, { color: colors.mutedForeground }]}>Total Expenses</Text>
            <Text
              style={{
                fontSize: 9.5,
                color: totalExpenses === 0 ? colors.income : isDeficit ? colors.expense : colors.foreground,
                fontFamily: "Inter_600SemiBold",
                marginTop: -2,
              }}
            >
              {totalExpenses === 0
                ? "No Expenses (0%)"
                : totalIncome > 0
                ? `${Math.round(rawSpendRatio)}% Total Spent`
                : "100% Spent"}
            </Text>
            <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
              <View
                style={{
                  height: "100%",
                  width: `${totalExpenses === 0 ? 0 : Math.min(Math.max(totalIncome > 0 ? rawSpendRatio : 100, 6), 100)}%`,
                  backgroundColor: totalExpenses === 0 ? colors.income : isDeficit ? colors.expense : rawSpendRatio > 80 ? colors.warning : colors.income,
                  borderRadius: 2,
                }}
              />
            </View>
          </TouchableOpacity>

          {/* Card 3: Budget Used */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                width: Math.max(statCardW, 140),
              },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/budget");
            }}
            activeOpacity={0.75}
          >
            <View style={styles.kpiTopRow}>
              <View
                style={[
                  styles.kpiIconWrap,
                  {
                    backgroundColor:
                      (budgetUtilization > 100
                        ? colors.expense
                        : budgetUtilization > 80
                        ? colors.warning
                        : colors.income) + "20",
                  },
                ]}
              >
                <Feather
                  name="pie-chart"
                  size={17}
                  color={
                    budgetUtilization > 100
                      ? colors.expense
                      : budgetUtilization > 80
                      ? colors.warning
                      : "#3B82F6"
                  }
                />
              </View>
              <View
                style={[
                  styles.kpiTag,
                  {
                    backgroundColor:
                      (budgetUtilization > 100
                        ? colors.expense
                        : budgetUtilization > 80
                        ? colors.warning
                        : "#3B82F6") + "18",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.kpiTagText,
                    {
                      color:
                        budgetUtilization > 100
                          ? colors.expense
                          : budgetUtilization > 80
                          ? colors.warning
                          : "#3B82F6",
                    },
                  ]}
                >
                  {budgetUtilization > 100 ? "Over Limit" : `${budgetUtilization.toFixed(0)}% Used`}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.kpiValueText,
                {
                  color: colors.foreground,
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {settings.currency} {fmt(totalBudgeted)}
            </Text>
            <Text style={[styles.kpiLabelText, { color: colors.mutedForeground }]}>
              Total Budget
            </Text>
            <Text
              style={{
                fontSize: 9.5,
                color: totalBudgeted === 0 ? colors.mutedForeground : totalExpenses > totalBudgeted ? colors.expense : colors.income,
                fontFamily: "Inter_600SemiBold",
                marginTop: -2,
              }}
            >
              {totalBudgeted === 0
                ? "No Budget Set"
                : totalExpenses > totalBudgeted
                ? `${settings.currency} ${fmt(totalExpenses - totalBudgeted)} Over Limit`
                : `${settings.currency} ${fmt(Math.max(totalBudgeted - totalExpenses, 0))} Left`}
            </Text>
            <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
              <View
                style={{
                  height: "100%",
                  width: `${totalBudgeted === 0 ? 0 : Math.min(Math.max(budgetUtilization, 4), 100)}%`,
                  backgroundColor:
                    budgetUtilization > 100
                      ? colors.expense
                      : budgetUtilization > 80
                      ? colors.warning
                      : "#3B82F6",
                  borderRadius: 2,
                }}
              />
            </View>
          </TouchableOpacity>

          {/* Card 4: Transactions */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                width: Math.max(statCardW, 140),
              },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTxModalVisible(true);
            }}
            activeOpacity={0.75}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: colors.primary + "20" }]}>
                <Feather name="list" size={17} color={colors.primary} />
              </View>
              <View style={[styles.kpiTag, { backgroundColor: (transactions.length > 0 ? colors.primary : colors.muted) + "18" }]}>
                <Text style={[styles.kpiTagText, { color: transactions.length > 0 ? colors.primary : colors.mutedForeground }]}>
                  {transactions.length > 0 ? "Active" : "Empty"}
                </Text>
              </View>
            </View>
            <Text style={[styles.kpiValueText, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
              {transactions.length}
            </Text>
            <Text style={[styles.kpiLabelText, { color: colors.mutedForeground }]}>Transactions</Text>
            <Text style={{ fontSize: 9.5, color: transactions.length > 0 ? colors.primary : colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginTop: -2 }}>
              {transactions.length > 0
                ? `${transactions.filter(t => t.type === 'income').length} In · ${transactions.filter(t => t.type === 'expense').length} Out`
                : "No Transactions"}
            </Text>
            <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: "hidden", flexDirection: "row" }}>
              {transactions.length > 0 ? (
                <>
                  <View
                    style={{
                      height: "100%",
                      width: `${(transactions.filter(t => t.type === 'income').length / transactions.length) * 100}%`,
                      backgroundColor: colors.income,
                    }}
                  />
                  <View
                    style={{
                      height: "100%",
                      width: `${(transactions.filter(t => t.type === 'expense').length / transactions.length) * 100}%`,
                      backgroundColor: colors.expense,
                    }}
                  />
                </>
              ) : null}
            </View>
          </TouchableOpacity>

          {/* Card 5: Payroll */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                width: Math.max(statCardW, 140),
              },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/payroll");
            }}
            activeOpacity={0.75}
          >
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconWrap, { backgroundColor: "#8B5CF625" }]}>
                <Feather name="users" size={17} color="#8B5CF6" />
              </View>
              <View style={[styles.kpiTag, { backgroundColor: (payroll.length > 0 ? "#8B5CF6" : colors.muted) + "18" }]}>
                <Text style={[styles.kpiTagText, { color: payroll.length > 0 ? "#8B5CF6" : colors.mutedForeground }]}>
                  {payroll.length} Staff
                </Text>
              </View>
            </View>
            <Text style={[styles.kpiValueText, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
              {settings.currency} {fmt(payroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0))}
            </Text>
            <Text style={[styles.kpiLabelText, { color: colors.mutedForeground }]}>Staff Payroll</Text>
            <Text style={{ fontSize: 9.5, color: payroll.length > 0 ? "#8B5CF6" : colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginTop: -2 }}>
              {payroll.length === 0
                ? "No Staff Added"
                : totalExpenses > 0
                ? `${Math.round((payroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0) / totalExpenses) * 100)}% of Outflows`
                : "Monthly Pay"}
            </Text>
            <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
              <View
                style={{
                  height: "100%",
                  width: `${payroll.length === 0 ? 0 : Math.min(Math.max(totalExpenses > 0 ? (payroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0) / totalExpenses) * 100 : 0, 6), 100)}%`,
                  backgroundColor: "#8B5CF6",
                  borderRadius: 2,
                }}
              />
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Monthly Trend Chart */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Financial Trend</Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{trendRangeSub}</Text>
          </View>
          <TouchableOpacity
            style={[styles.seeAllBtn, { borderColor: colors.border }]}
            onPress={() => router.push("/(tabs)/reports")}
          >
            <Text style={[styles.seeAllText, { color: colors.primary }]}>Full Report</Text>
            <Feather name="arrow-right" size={12} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <AreaLineChart
          data={chartData}
          width={chartWidth - 28}
          height={160}
          currency={settings.currency}
          activeRange={customSelection ? undefined : trendRange}
          activePeriod={activePeriod}
          onGranularityChange={(g) => {
            setActivePeriod((prev) => ({
              ...prev,
              userGranularityOverride: g,
            }));
          }}
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

      {/* ─── Authoritative 3-Card Financial Analytics Suite (Budget, NOM, Distribution) ─── */}
      <FinancialAnalyticsSuite
        budget={authFinancialModel.budget}
        margin={authFinancialModel.margin}
        distribution={authFinancialModel.distribution}
        currency={settings.currency}
        onOpenDrillDown={(type) => setMobileDrillDown(type)}
      />

      {/* Top Department Cost Centers Card */}
      {expenseByDept.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Departments</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground, fontSize: 11 }]}>
                {expenseByDept.length} Active Cost Centers
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.miniViewPill, { backgroundColor: colors.primary + "16", borderColor: colors.primary + "30" }]}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/departments");
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.miniViewPillText, { color: colors.primary }]}>View All →</Text>
            </TouchableOpacity>
          </View>

          <View style={{ gap: 12, marginVertical: 6 }}>
            {expenseByDept.slice(0, 3).map((dept, idx) => {
              const deptColors = ["#EC4899", "#3B82F6", "#8B5CF6", "#F59E0B"];
              const itemColor = deptColors[idx % deptColors.length];
              const pct = totalExpenses > 0 ? Math.round((dept.total / totalExpenses) * 100) : 0;
              const cleanName = dept.department || "General";

              return (
                <View key={dept.department} style={{ gap: 5 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, marginRight: 6 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: itemColor }} />
                      <Text style={{ fontSize: 11.5, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 }}>
                        {cleanName}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11.5, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                      {settings.currency} {fmt(dept.total)}
                    </Text>
                  </View>

                  {/* Clean rounded progress track */}
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
                    <View
                      style={{
                        height: "100%",
                        borderRadius: 3,
                        backgroundColor: itemColor,
                        width: `${Math.min(Math.max(pct, 6), 100)}%`,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Quick Actions Section */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Quick Actions</Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>1-tap financial workflows</Text>
          </View>
          <View style={[styles.actionSectionPill, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "30" }]}>
            <Feather name="zap" size={12} color={colors.primary} />
            <Text style={[styles.actionSectionPillText, { color: colors.primary }]}>Active</Text>
          </View>
        </View>

        <View style={styles.actionsGrid}>
          <AnimatedQuickAction
            label="Add Income"
            sub="Deposit & grant"
            badge="+ Inflow"
            icon="plus-circle"
            color={colors.income}
            onPress={() => router.push("/(tabs)/income")}
          />
          <AnimatedQuickAction
            label="Add Expense"
            sub="Bills & supplies"
            badge="- Outflow"
            icon="minus-circle"
            color={colors.expense}
            onPress={() => router.push("/(tabs)/expenses")}
          />
          <AnimatedQuickAction
            label="Reports"
            sub="Charts & Export"
            badge="PDF Export"
            icon="bar-chart-2"
            color={colors.primary}
            onPress={() => router.push("/(tabs)/reports")}
          />
          <AnimatedQuickAction
            label="AI Insights"
            sub="Smart burn audit"
            badge="AI Scan"
            icon="zap"
            color="#10B981"
            onPress={() => router.push("/ai-insights")}
          />
          <AnimatedQuickAction
            label="Staff Payroll"
            sub="Salaries & bonus"
            badge={`${payroll.length} Staff`}
            icon="users"
            color="#8B5CF6"
            onPress={() => router.push("/payroll")}
          />
          <AnimatedQuickAction
            label="Budget Plan"
            sub="Dept allocations"
            badge={`${budgets.length} Targets`}
            icon="pie-chart"
            color={colors.warning}
            onPress={() => router.push("/budget")}
          />
        </View>
      </View>

      {/* Recent Transactions */}
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Recent Transactions</Text>
        <TouchableOpacity
          style={[styles.seeAllBtn, { borderColor: colors.border }]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTxModalVisible(true);
          }}
        >
          <Text style={[styles.seeAllText, { color: colors.primary }]}>See All</Text>
          <Feather name="arrow-right" size={12} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {recentTransactions.map((t) => (
        <TransactionItem
          key={t.id}
          item={t}
          canDelete={user?.role === "admin"}
          onDelete={deleteTransaction}
        />
      ))}
      {recentTransactions.length === 0 && (
        <View style={styles.empty}>
          <Feather name="inbox" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No transactions yet</Text>
        </View>
      )}

      {/* ─── Dedicated All Transactions History Modal ─── */}
      <Modal
        visible={txModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTxModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={[styles.txModalBackdrop, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <View style={[styles.txModalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.txModalHandle} />

            {/* Header */}
            <View style={styles.txModalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.txModalIconWrap, { backgroundColor: colors.primary + "20" }]}>
                  <Feather name="file-text" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.txModalTitle, { color: colors.foreground }]}>All Transactions</Text>
                  <Text style={[styles.txModalSub, { color: colors.mutedForeground }]}>
                    {filteredTransactions.length} of {transactions.length} records
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.txModalCloseBtn, { backgroundColor: colors.cardAlt ?? colors.muted }]}
                onPress={() => setTxModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Quick Financial Summary Banner */}
            <View style={[styles.txSummaryBanner, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}>
              <View style={styles.txSummaryCol}>
                <Text style={[styles.txSummaryLabel, { color: colors.income }]}>▲ Income</Text>
                <Text style={[styles.txSummaryVal, { color: colors.income }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {settings.currency} {fmt(totalIncome)}
                </Text>
              </View>
              <View style={[styles.txSummaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.txSummaryCol}>
                <Text style={[styles.txSummaryLabel, { color: colors.expense }]}>▼ Expenses</Text>
                <Text style={[styles.txSummaryVal, { color: colors.expense }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {settings.currency} {fmt(totalExpenses)}
                </Text>
              </View>
              <View style={[styles.txSummaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.txSummaryCol}>
                <Text style={[styles.txSummaryLabel, { color: colors.primary }]}>Net Flow</Text>
                <Text style={[styles.txSummaryVal, { color: netBalance >= 0 ? colors.income : colors.expense }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {settings.currency} {fmt(Math.abs(netBalance))}
                </Text>
              </View>
            </View>

            {/* Search Bar */}
            <View style={[styles.txSearchBar, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}>
              <Feather name="search" size={15} color={colors.mutedForeground} />
              <TextInput
                style={[styles.txSearchInput, { color: colors.foreground }]}
                placeholder="Search category, department, note..."
                placeholderTextColor={colors.mutedForeground}
                value={txSearchQuery}
                onChangeText={setTxSearchQuery}
              />
              {txSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setTxSearchQuery("")}>
                  <Feather name="x-circle" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            {/* Type Filters */}
            <View style={styles.txFilterRow}>
              {[
                { key: "all", label: `All (${transactions.length})` },
                { key: "income", label: `Income (${transactions.filter(t => t.type === "income").length})` },
                { key: "expense", label: `Expenses (${transactions.filter(t => t.type === "expense").length})` },
              ].map((f) => {
                const isSelected = txTypeFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[
                      styles.txFilterPill,
                      {
                        backgroundColor: isSelected ? colors.primary : (colors.cardAlt ?? colors.muted),
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                      setTxTypeFilter(f.key as any);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.txFilterText,
                        { color: isSelected ? "#FFFFFF" : colors.mutedForeground },
                        isSelected && { fontFamily: "Inter_700Bold" },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Scrollable Transactions List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.txListContent, { paddingBottom: 100 }]}
            >
              {filteredTransactions.map((t) => (
                <TransactionItem
                  key={t.id}
                  item={t}
                  canDelete={user?.role === "admin"}
                  onDelete={deleteTransaction}
                />
              ))}

              {filteredTransactions.length === 0 && (
                <View style={styles.txEmptyBox}>
                  <Feather name="file-text" size={38} color={colors.mutedForeground} />
                  <Text style={[styles.txEmptyTitle, { color: colors.foreground }]}>No matching transactions</Text>
                  <Text style={[styles.txEmptySub, { color: colors.mutedForeground }]}>
                    Try adjusting your search query or filter tab
                  </Text>
                  {txSearchQuery.length > 0 && (
                    <TouchableOpacity
                      style={[styles.txClearBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        setTxSearchQuery("");
                        setTxTypeFilter("all");
                      }}
                    >
                      <Text style={styles.txClearBtnText}>Reset Filter</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Real-Time Notification Center Modal ─── */}
      <NotificationCenterModal
        visible={notificationModalVisible}
        onClose={() => setNotificationModalVisible(false)}
        notifications={notifications}
      />

      {/* ─── Financial Reports PDF & CSV Export Modal ─── */}
      <DownloadReportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        activePeriod={activePeriod}
      />

      {/* ─── Net Operating Balance Breakdown Modal ─── */}
      <NetBalanceBreakdownModal
        visible={netModalVisible}
        onClose={() => setNetModalVisible(false)}
        transactions={transactions}
        departments={departments}
        budgets={budgets}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        netBalance={netSurplus}
        onOpenStatement={() => {
          setNetModalVisible(false);
          setExportModalVisible(true);
        }}
      />

      {/* ─── Level 3 Comprehensive Financial Drill-Down Modal ─── */}
      <FinancialDrillDownModal
        visible={mobileDrillDown !== null}
        type={mobileDrillDown || "budget"}
        onClose={() => setMobileDrillDown(null)}
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

      {/* ─── Logout Confirmation Modal ─── */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setLogoutModalVisible(false)}
          />
          <View
            style={[
              styles.logoutModalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Red Alert Icon Halo */}
            <View style={styles.logoutIconHalo}>
              <View style={styles.logoutIconInner}>
                <Feather name="log-out" size={24} color="#EF4444" />
              </View>
            </View>

            {/* Title & Message */}
            <Text style={[styles.logoutModalTitle, { color: colors.foreground }]}>
              Sign Out
            </Text>
            <Text style={[styles.logoutModalMsg, { color: colors.mutedForeground }]}>
              Are you sure you want to log out of{"\n"}
              <Text style={{ fontFamily: "Inter_700Bold", color: colors.foreground }}>
                {settings.organizationName || user?.organization || "OFM"}
              </Text>?
            </Text>

            {/* Action Buttons Row */}
            <View style={styles.logoutModalBtnRow}>
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setLogoutModalVisible(false);
                }}
                style={[
                  styles.logoutModalBtn,
                  styles.logoutCancelBtn,
                  {
                    backgroundColor: colors.muted + "35",
                    borderColor: colors.border,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text style={[styles.logoutCancelText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmLogout}
                disabled={isLoggingOut}
                style={[styles.logoutModalBtn, styles.logoutConfirmBtn]}
                activeOpacity={0.85}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="log-out" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.logoutConfirmText}>
                      Yes, Log Out
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: 16, gap: 12 },

  // Executive 2-Tier Header System
  headerContainer: {
    marginBottom: 6,
    gap: 8,
  },
  headerTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  orgBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 12,
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: "56%",
  },
  orgName: {
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
  },
  headerUserBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  userNameWrap: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 21,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.4,
  },
  syncBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    flexShrink: 0,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  roleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 14,
    borderWidth: 1.2,
  },
  roleText: {
    fontSize: 10,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.6,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutIconBtn: {
    borderColor: "rgba(239, 68, 68, 0.25)",
    backgroundColor: "rgba(239, 68, 68, 0.06)",
  },
  notifBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  notifBadgeText: {
    fontSize: 8.5,
    fontFamily: "Inter_800ExtraBold",
    color: "#FFFFFF",
  },

  // Legacy header aliases for safety
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 },
  headerLeft: { gap: 2, flex: 1, marginRight: 12 },
  greeting: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },

  // Logout Confirmation Modal
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 99999,
  },
  logoutModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    borderWidth: 1.2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  logoutIconHalo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  logoutIconInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutModalTitle: {
    fontSize: 19,
    fontFamily: "Inter_800ExtraBold",
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  logoutModalMsg: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
  },
  logoutModalBtnRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  logoutModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  logoutCancelBtn: {
    borderWidth: 1.2,
  },
  logoutCancelText: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },
  logoutConfirmBtn: {
    backgroundColor: "#EF4444",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutConfirmText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },

  // Hero Net Balance Card (Senior UI Design)
  heroBalanceCard: {
    borderRadius: 22,
    padding: 18,
    gap: 12,
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
    marginBottom: 4,
  },
  heroLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    marginRight: 8,
  },
  heroLabel: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.8,
  },
  heroEyeBtn: {
    padding: 3.5,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 10,
    marginLeft: 2,
  },
  heroGrowthPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4.5,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1.2,
  },
  heroGrowthText: {
    fontSize: 11.5,
    fontFamily: "Inter_800ExtraBold",
  },
  heroGrowthSub: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontFamily: "Inter_600SemiBold",
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
    marginTop: -1,
  },
  heroAmountText: {
    color: "#FFFFFF",
    fontSize: 34,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.8,
    textShadowColor: "rgba(0, 0, 0, 0.25)",
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 4,
    flex: 1,
  },
  heroDossierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4.5,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 9.5,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: "rgba(255, 255, 255, 0.28)",
  },
  heroDossierText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
  },
  heroStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statusDotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroStatusText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },

  // Retention ratio track
  retentionContainer: {
    gap: 4.5,
    marginTop: -2,
    marginBottom: 2,
  },
  retentionLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  retentionText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    opacity: 0.95,
  },
  retentionTrack: {
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    overflow: "hidden",
  },
  retentionFill: {
    height: "100%",
    borderRadius: 2.5,
    backgroundColor: "#60a5fa",
  },

  // Frosted Glass Metric Cards
  glassCardsRow: {
    flexDirection: "row",
    gap: 5,
  },
  glassCard: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2.5,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 12,
    paddingVertical: 6.5,
    paddingHorizontal: 2,
  },
  glassIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  glassCardContent: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  glassCardLabel: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 8,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  glassCardValue: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 0.5,
    textAlign: "center",
  },

  statsScrollWrapper: { marginHorizontal: -16 },
  statsScroll: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
  kpiCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  kpiTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kpiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiTag: {
    paddingHorizontal: 7.5,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  kpiTagText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  kpiValueText: {
    fontSize: 15.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  kpiLabelText: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
  },

  statCard: { width: 125, borderRadius: 14, borderWidth: 1, padding: 12, gap: 4, alignItems: "center" },
  statIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  statCardValue: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  statCardLabel: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },

  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  seeAllText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  miniViewPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  miniViewPillText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
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
  twoCol: { flexDirection: "row", gap: 10 },
  halfCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
    minHeight: 204,
    justifyContent: "space-between",
  },
  halfCardFooter: {
    paddingVertical: 4.5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  halfCardFooterText: {
    fontSize: 9.5,
    fontFamily: "Inter_600SemiBold",
  },
  ringsRow: { alignItems: "center", justifyContent: "center" },
  miniModePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  miniBtn: { borderRadius: 10, borderWidth: 1, padding: 8, alignItems: "center" },
  miniBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  actionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    gap: 10,
  },
  actionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBadgeText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  actionTitleText: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  actionSubText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  actionSectionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionSectionPillText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
  },

  empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  // Dedicated Transactions Modal Styles
  txModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  txModalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: "88%",
  },
  txModalHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#94a3b8",
    alignSelf: "center",
    marginBottom: 12,
  },
  txModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  txModalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txModalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  txModalSub: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
  },
  txModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  txSummaryBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  txSummaryCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  txSummaryLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_600SemiBold",
  },
  txSummaryVal: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  txSummaryDivider: {
    width: 1,
    height: 24,
  },
  txSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  txSearchInput: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    padding: 0,
  },
  txFilterRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  txFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  txFilterText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  txListContent: {
    gap: 6,
    paddingBottom: 24,
  },
  txEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  txEmptyTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  txEmptySub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  txClearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    marginTop: 6,
  },
  txClearBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
});
