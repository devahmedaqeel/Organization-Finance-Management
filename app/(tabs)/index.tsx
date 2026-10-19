import { Feather } from "@/components/UniversalIcon";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
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
import { useFinance, Department } from "@/context/FinanceContext";
import { WebDepartmentStaffModal } from "@/components/web/modals/WebDepartmentStaffModal";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { can } from "@/services/permissionService";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { WORLD_CURRENCIES } from "@/constants/currencies";
import { useResponsive } from "@/hooks/useResponsive";
import { screenTopPadding } from "@/utils/layout";
import {
  NormalizedPeriod,
  getPresetPeriod,
  aggregateTransactionsByGranularity,
  computeNetOperatingBalanceHealth,
  getBudgetInsight,
  getNobInsight,
  getExpenseDistributionInsight,
  buildMonthlySeries,
} from "@/services/DatePeriodService";
import {
  buildAuthoritativeFinancialModel,
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateBudgetRemaining,
  calculateUnallocatedFunds,
} from "@/services/FinancialCalculationEngine";
import { FinancialAnalyticsSuite } from "@/components/analytics/FinancialAnalyticsSuite";

const SCREEN_W = Dimensions.get("window").width;
const ROLE_COLORS: Record<string, string> = {
  admin: "#2563EB",
  accountant: "#059669",
  manager: "#D97706",
  employee: "#7C3AED",
};

const ROLE_BADGE_STYLES: Record<string, { light: { bg: string; border: string; text: string }; dark: { bg: string; border: string; text: string } }> = {
  admin: {
    light: { bg: "#EFF6FF", border: "#93C5FD", text: "#1D4ED8" },
    dark: { bg: "rgba(59, 130, 246, 0.20)", border: "rgba(96, 165, 250, 0.45)", text: "#60A5FA" },
  },
  accountant: {
    light: { bg: "#ECFDF5", border: "#6EE7B7", text: "#047857" },
    dark: { bg: "rgba(16, 185, 129, 0.20)", border: "rgba(52, 211, 153, 0.45)", text: "#34D399" },
  },
  manager: {
    light: { bg: "#FFFBEB", border: "#FCD34D", text: "#B45309" },
    dark: { bg: "rgba(245, 158, 11, 0.20)", border: "rgba(251, 191, 36, 0.45)", text: "#FBBF24" },
  },
  employee: {
    light: { bg: "#F5F3FF", border: "#C4B5FD", text: "#6D28D9" },
    dark: { bg: "rgba(139, 92, 246, 0.20)", border: "rgba(167, 139, 250, 0.45)", text: "#A78BFA" },
  },
};

function fmt(n: number) {
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
      toValue: 0.97,
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
    <Animated.View style={{ width: "48.5%", marginBottom: 12, transform: [{ scale }] }}>
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
          <View style={[styles.actionIconWrap, { backgroundColor: color + (colors.isDark ? "2A" : "16") }]}>
            <Feather name={icon} size={18} color={color} />
          </View>
          {badge && (
            <View style={[styles.actionBadge, { backgroundColor: color + (colors.isDark ? "26" : "14") }]}>
              <Text style={[styles.actionBadgeText, { color }]} numberOfLines={1}>
                {badge}
              </Text>
            </View>
          )}
        </View>
        <View style={{ gap: 2 }}>
          <Text style={[styles.actionTitleText, { color: colors.foreground }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.actionSubText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

type KpiSegment = { pct: number; color: string };

/** Bar width for a real percentage: exact, clamped to 0–100, with a hairline minimum only when the value is non-zero. */
function barWidth(pct: number): number {
  if (!isFinite(pct) || pct <= 0) return 0;
  return Math.min(Math.max(pct, 1.5), 100);
}

/** Area sparkline (react-native-svg) with optional month labels; flat baseline when every value is zero. */
function Sparkline({
  data,
  color,
  labels,
  height = 44,
}: {
  data: number[];
  color: string;
  labels?: string[];
  height?: number;
}) {
  const colors = useColors();
  const [w, setW] = useState(0);
  const gradId = `spark${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const max = Math.max(...data, 0);
  const n = data.length;
  const inset = 4; // keep the end dots inside the drawing area
  const pts = data.map((v, i) => ({
    x: n > 1 ? inset + (i / (n - 1)) * (w - inset * 2) : w / 2,
    y: max > 0 ? height - 4 - (v / max) * (height - 10) : height - 4,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${height} L${pts[0].x.toFixed(1)},${height} Z` : "";
  const last = pts[pts.length - 1];

  return (
    <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      <View style={{ height }}>
        {w > 0 && pts.length > 0 ? (
          <Svg width={w} height={height}>
            <Defs>
              <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.3} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </SvgLinearGradient>
            </Defs>
            <Path d={area} fill={`url(#${gradId})`} />
            <Path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 3.5 : 1.8} fill={i === pts.length - 1 ? color : colors.card} stroke={color} strokeWidth={1.4} />
            ))}
            {last ? <Circle cx={last.x} cy={last.y} r={7} fill={color} opacity={0.15} /> : null}
          </Svg>
        ) : null}
      </View>
      {labels && labels.length === n ? (
        <View style={styles.sparkLabels}>
          {labels.map((l, i) => (
            <Text
              key={`${l}-${i}`}
              style={[
                styles.sparkLabel,
                { color: i === n - 1 ? color : colors.mutedForeground, fontFamily: i === n - 1 ? "Inter_700Bold" : "Inter_500Medium" },
              ]}
            >
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Dashboard KPI box.
 *  "wide"    → full-width: amount + this-month figures on the left, labelled 6-month chart on the right.
 *  "compact" → half-width: amount, exact progress bar and a wrapping caption (no truncated text).
 */
function KpiCard({
  layout = "compact",
  icon,
  color,
  label,
  prefix,
  value,
  subValue,
  valueColor,
  tag,
  tagColor,
  spark,
  segments,
  footLeft,
  footLeftColor,
  footRight,
  footRightColor,
  footStats,
  onPress,
}: {
  layout?: "wide" | "compact";
  icon: any;
  color: string;
  label: string;
  /** Small text before the amount, e.g. "+PKR" */
  prefix?: string;
  value: string;
  /** Small explanatory line under the amount */
  subValue?: string;
  valueColor?: string;
  tag?: string | null;
  tagColor?: string;
  spark?: { data: number[]; labels?: string[]; caption: string; change?: string | null; changeColor?: string };
  segments: KpiSegment[];
  footLeft: string;
  footLeftColor?: string;
  footRight?: string | null;
  footRightColor?: string;
  /** Optional labelled figures shown under the bar instead of the single caption row; an empty value shows the label alone */
  footStats?: Array<{ value: string; label: string; color?: string }>;
  onPress: () => void;
}) {
  const colors = useColors();
  const scale = React.useRef(new Animated.Value(1)).current;
  const spring = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 50, bounciness: 5 }).start();
  const statusColor = tagColor ?? color;
  const wide = layout === "wide";

  const amount = (
    <Text
      style={[styles.kpiValueText, wide && styles.kpiValueWide, { color: valueColor ?? colors.foreground }]}
      numberOfLines={Platform.OS === "web" ? undefined : 1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {prefix ? <Text style={[styles.kpiValuePrefix, { color: colors.mutedForeground }]}>{prefix} </Text> : null}
      {value}
    </Text>
  );

  return (
    <Animated.View style={[styles.kpiCell, { transform: [{ scale }] }]}>
      <TouchableOpacity
        style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPressIn={() => spring(0.98)}
        onPressOut={() => spring(1)}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${prefix ? prefix + " " : ""}${value}`}
      >
        {/* Soft accent glow in the corner */}
        <LinearGradient
          colors={[color + (colors.isDark ? "26" : "14"), color + "00"]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.25, y: 0.85 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Icon · label · status */}
        <View style={styles.kpiTopRow}>
          <View style={[styles.kpiIconWrap, { backgroundColor: color + (colors.isDark ? "2E" : "1A") }]}>
            <Feather name={icon} size={17} color={color} />
          </View>
          {wide ? (
            <Text style={[styles.kpiLabelText, { color: colors.foreground }]} numberOfLines={2}>
              {label}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {tag ? (
            <View style={[styles.kpiTag, { backgroundColor: statusColor + (colors.isDark ? "2A" : "16") }]}>
              <Text style={[styles.kpiTagText, { color: statusColor }]}>{tag}</Text>
            </View>
          ) : (
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          )}
        </View>

        {wide && spark ? (
          <View style={styles.kpiWideBody}>
            <View style={styles.kpiWideLeft}>
              {amount}
              <Text style={[styles.kpiMonthText, { color: colors.mutedForeground }]}>{spark.caption}</Text>
              {spark.change ? (
                <View style={[styles.kpiChangePill, { backgroundColor: (spark.changeColor ?? colors.mutedForeground) + "16" }]}>
                  <Text style={[styles.kpiChangeText, { color: spark.changeColor ?? colors.mutedForeground }]}>{spark.change}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.kpiWideChart}>
              <Sparkline data={spark.data} labels={spark.labels} color={color} />
            </View>
          </View>
        ) : (
          <View style={styles.kpiCompactBody}>
            <Text style={[styles.kpiLabelText, { color: colors.foreground }]}>{label}</Text>
            {amount}
            {subValue ? <Text style={[styles.kpiSubValue, { color: colors.mutedForeground }]}>{subValue}</Text> : null}
          </View>
        )}

        <View style={styles.kpiFooter}>
          <View style={[styles.kpiTrack, { backgroundColor: colors.muted }]}>
            {segments.map((s, i) => (
              <View
                key={i}
                style={{
                  height: "100%",
                  width: `${barWidth(s.pct)}%`,
                  backgroundColor: s.color,
                  borderTopLeftRadius: i === 0 ? 4 : 0,
                  borderBottomLeftRadius: i === 0 ? 4 : 0,
                  borderTopRightRadius: i === segments.length - 1 ? 4 : 0,
                  borderBottomRightRadius: i === segments.length - 1 ? 4 : 0,
                }}
              />
            ))}
          </View>
          {footStats && footStats.length > 0 ? (
            <View style={styles.kpiStatList}>
              {footStats.map((s) => (
                <View key={s.label} style={styles.kpiStatRow}>
                  {s.value ? <Text style={[styles.kpiStatValue, { color: s.color ?? colors.foreground }]}>{s.value}</Text> : null}
                  <Text style={[styles.kpiStatLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.kpiFootRow}>
              <Text style={[styles.kpiCaption, { color: footLeftColor ?? colors.mutedForeground }]}>{footLeft}</Text>
              {footRight ? (
                <Text style={[styles.kpiFootRight, { color: footRightColor ?? colors.foreground }]}>{footRight}</Text>
              ) : null}
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, isTablet, isSmall, chartW, statCardW, hPad } = useResponsive();
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

  // First name and a time-of-day greeting for the header
  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "there";
  // Greeting follows the phone's clock: re-checked every minute and whenever the app comes back to the foreground
  const [clockHour, setClockHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const tick = () => setClockHour(new Date().getHours());
    const timer = setInterval(tick, 60_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  const greetingText =
    clockHour >= 5 && clockHour < 12
      ? "Good morning"
      : clockHour >= 12 && clockHour < 17
      ? "Good afternoon"
      : clockHour >= 17 && clockHour < 21
      ? "Good evening"
      : "Good night";
  const webTop = Platform.OS === "web" ? 67 : 0;
  const isDark = colors.background === "#0B1120" || (settings.theme === "dark");
  const roleKey = (user?.role || "admin").toLowerCase();
  // Role chip next to the bell: readable title + matching icon
  const roleTitle = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
  const roleIcon = ({ admin: "shield", accountant: "edit-3", manager: "briefcase", employee: "user" } as Record<string, string>)[roleKey] ?? "user";
  const activeRoleBadgeStyle = (ROLE_BADGE_STYLES[roleKey] ?? ROLE_BADGE_STYLES.admin)[isDark ? "dark" : "light"];
  const roleColor = activeRoleBadgeStyle.text;
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

  // Real, live counts for Quick Actions
  const incomeCount = useMemo(() => transactions.filter((t) => t.type === "income").length, [transactions]);
  const expenseCount = useMemo(() => transactions.filter((t) => t.type === "expense").length, [transactions]);
  const budgetPlanCount = useMemo(() => budgets.length > 0 ? budgets.length : departments.filter((d) => (d.budgetAllocated || 0) > 0).length, [budgets, departments]);

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
  const [mobileDrillDownDept, setMobileDrillDownDept] = useState<string | undefined>(undefined);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [selectedStaffDept, setSelectedStaffDept] = useState<Department | null>(null);
  const [customSelection, setCustomSelection] = useState<any | null>(null);
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() =>
    getPresetPeriod("last_6m")
  );

  // Hardware Back button handling on Android
  useEffect(() => {
    const onBackPress = () => {
      if (staffModalVisible) {
        setStaffModalVisible(false);
        setSelectedStaffDept(null);
        return true;
      }
      if (mobileDrillDown !== null) {
        setMobileDrillDown(null);
        setMobileDrillDownDept(undefined);
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

  // ─── KPI box values (status rules unchanged; bars use the exact percentages they describe) ───
  const overBudget = totalBudgetSpent > totalAllocatedBudget;

  // Inflow bar = share of inflow still available (unallocated when budgets exist, otherwise retained)
  const inflowKeptPct = totalIncome === 0 || isEffectiveDeficit
    ? 0
    : totalAllocatedBudget > 0
    ? (unallocatedFunds / totalIncome) * 100
    : incomeRetainedPct;

  const expenseStatusColor = totalExpenses === 0
    ? colors.income
    : totalAllocatedBudget > 0
    ? overBudget ? colors.expense : colors.primary
    : isDeficit
    ? colors.expense
    : totalExpenses === totalIncome
    ? colors.warning
    : colors.primary;
  const expenseStatusText = totalExpenses === 0
    ? "No Outflow"
    : totalAllocatedBudget > 0
    ? overBudget ? "Over Budget" : "Within Budget"
    : isDeficit
    ? "Over Inflow"
    : totalExpenses === totalIncome
    ? "Break-even"
    : null;
  // Expense bar = total expenses as a share of total inflow (exactly what the box amount relates to).
  // Budget usage has its own box, so it is not mixed in here. No inflow → no percentage is invented.
  const expenseOfInflowPct = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
  const expenseBarPct = totalExpenses === 0 ? 0 : totalIncome > 0 ? expenseOfInflowPct : 100;
  const expenseBarColor = totalExpenses === 0
    ? colors.income
    : isEffectiveDeficit || expenseBarPct > 100
    ? colors.expense
    : expenseBarPct > 85
    ? colors.warning
    : colors.income;

  // What the budget covers: departments with a budget, or budget lines when no department has one
  const budgetedDeptCount = departments.filter((d) => (d.budgetAllocated || 0) > 0).length;
  const budgetScopeLabel = budgetedDeptCount > 0
    ? `${budgetedDeptCount} ${budgetedDeptCount === 1 ? "department" : "departments"}`
    : budgets.length > 0
    ? `${budgets.length} budget ${budgets.length === 1 ? "line" : "lines"}`
    : "";

  const budgetColor = totalAllocatedBudget === 0
    ? colors.mutedForeground
    : netBudgetUtilization > 100
    ? colors.expense
    : netBudgetUtilization > 80
    ? colors.warning
    : "#3B82F6";

  // Payroll counted exactly as the ledger books it (FinanceContext): skip failed payments,
  // use the saved net salary when present, and ignore non-positive amounts.
  const activePayroll = payroll.filter((p) => p && (p as any).paymentStatus !== "failed");
  const payrollNet = (p: (typeof payroll)[number]) => {
    const saved = p.netSalary == null ? NaN : Number(p.netSalary);
    return Number.isFinite(saved) ? saved : (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0);
  };
  const payrollTotal = activePayroll.reduce((s, p) => s + Math.max(payrollNet(p), 0), 0);
  // Unique people, not payroll entries (one employee paid for 6 months is 1 staff member)
  const staffCount = new Set(activePayroll.map((p) => (p.employeeId || p.employeeName || p.id).trim().toLowerCase())).size;
  // Payroll to date as a share of total inflow (same all-time basis on both sides).
  // null = no base to compare with, so nothing is invented (no NaN / Infinity).
  const payrollShareOf = (base: number): number | null =>
    base > 0 && Number.isFinite(payrollTotal) ? (payrollTotal / base) * 100 : null;
  const payrollOfInflowPct = payrollShareOf(totalIncome);
  // Average net salary per payslip, and the most recent payroll month (YYYY-MM → "Oct 2026")
  const avgNetSalary = activePayroll.length > 0 ? payrollTotal / activePayroll.length : 0;
  const lastPayrollKey = activePayroll.reduce((latest, p) => {
    const k = (p.month || p.createdAt || "").slice(0, 7);
    return /^\d{4}-\d{2}$/.test(k) && k > latest ? k : latest;
  }, "");
  const lastPayrollLabel = lastPayrollKey
    ? `${ALL_MONTHS[Number(lastPayrollKey.slice(5, 7)) - 1]} ${lastPayrollKey.slice(0, 4)}`
    : "";
  /** Percentage text that never rounds a near value onto 100% or 0% (99.6% stays 99.6%, not 100%). */
  const exactPctText = (p: number): string => {
    if (Number.isInteger(p)) return `${p}%`;
    let digits = p < 1 || (p > 99 && p < 101) ? 1 : 0;
    let text = p.toFixed(digits);
    while (digits < 4 && /^(100|0)(\.0+)?$/.test(text)) {
      digits++;
      text = p.toFixed(digits);
    }
    return `${text}%`;
  };

  // Last 6 calendar months (oldest → current) for the trend lines — same counting rules as the totals
  const sixMonths = useMemo(() => buildMonthlySeries(transactions, 6), [transactions]);

  /** "▲ 12% vs last month" style label comparing the current month with the previous one. */
  const monthChange = (series: number[], goodWhenUp: boolean) => {
    const cur = series[series.length - 1];
    const prev = series[series.length - 2];
    if (prev <= 0) return cur > 0 ? { text: "New this month", color: colors.mutedForeground } : null;
    const pct = ((cur - prev) / prev) * 100;
    if (Math.abs(pct) < 0.5) return { text: "Same as last month", color: colors.mutedForeground };
    const up = pct > 0;
    return {
      text: `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% vs last month`,
      color: up === goodWhenUp ? colors.income : colors.expense,
    };
  };
  const thisMonthIncome = sixMonths.income[sixMonths.income.length - 1];
  const thisMonthExpense = sixMonths.expense[sixMonths.expense.length - 1];
  const thisMonthCount = sixMonths.count[sixMonths.count.length - 1];
  const inflowChange = monthChange(sixMonths.income, true);
  const expenseChange = monthChange(sixMonths.expense, false);
  const txChange = monthChange(sixMonths.count, true);
  const fmtPct = (p: number) => `${p > 0 && p < 1 ? p.toFixed(1) : Math.round(p)}%`;

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 67 + insets.top + 12 : screenTopPadding(insets.top),
          paddingBottom: 24, // tab bar is docked and already reserves the bottom inset
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
      {/* ─── Header: greeting · organization + role · notifications · logout ─── */}
      <View style={styles.headerContainer}>
        <View style={styles.identityRow}>
          <View style={styles.identityText}>
            <View style={styles.greetingRow}>
              <View
                style={[styles.syncDot, { backgroundColor: syncStatus === "synced" ? "#10B981" : "#F59E0B" }]}
                accessibilityLabel={syncStatus === "synced" ? "Cloud sync up to date" : "Syncing"}
              />
              <Text style={[styles.greeting, { color: colors.mutedForeground }]} numberOfLines={1}>
                {greetingText}, {firstName}
              </Text>
            </View>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
              {orgDisplayName}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <View
              style={[styles.roleChip, { backgroundColor: activeRoleBadgeStyle.bg, borderColor: activeRoleBadgeStyle.border }]}
              accessibilityLabel={`Your role: ${roleTitle}`}
            >
              <Feather name={roleIcon as any} size={14} color={activeRoleBadgeStyle.text} />
              <Text style={[styles.roleChipText, { color: activeRoleBadgeStyle.text }]} numberOfLines={1}>
                {roleTitle}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setNotificationModalVisible(true);
              }}
              style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              activeOpacity={0.7}
              accessibilityLabel={unreadNotificationCount > 0 ? `Notifications, ${unreadNotificationCount} unread` : "Notifications"}
            >
              <Feather name="bell" size={18} color={colors.foreground} />
              {unreadNotificationCount > 0 && (
                <View style={[styles.notifBadge, { borderColor: colors.background }]}>
                  <Text style={styles.notifBadgeText}>
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setLogoutModalVisible(true);
              }}
              style={[styles.iconBtn, styles.logoutIconBtn]}
              activeOpacity={0.7}
              accessibilityLabel="Log Out"
            >
              <Feather name="log-out" size={17} color="#EF4444" />
            </TouchableOpacity>
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
            gap: 16,
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.18)",
            shadowColor: "#1d4ed8",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.35,
            shadowRadius: 18,
            elevation: 10,
            overflow: "hidden",
            position: "relative",
            marginBottom: 4,
          },
        ]}
      >
        {/* Ambient Decorative Background Glow */}
        <View style={styles.ambientGlowTopRight} pointerEvents="none" />
        <View style={styles.ambientGlowBottomLeft} pointerEvents="none" />

        {/* Top Row: Title + Privacy Eye + Fiscal Dossier Button */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroLabelWrap}>
            <View style={styles.heroLabelIcon}>
              <Feather name="shield" size={12} color="#7DD3FC" />
            </View>
            <Text style={styles.heroLabel} numberOfLines={1}>
              {balanceViewMode === "cashflow" ? "Net Cash Available" : "Total Disbursements"}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setHideBalance(!hideBalance);
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={styles.heroEyeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
              accessibilityLabel={hideBalance ? "Show balance" : "Hide balance"}
            >
              <Feather name={hideBalance ? "eye-off" : "eye"} size={13} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Direct Trigger to Open Net Operating Balance Dossier */}
          <TouchableOpacity
            style={styles.heroDossierPill}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setNetModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Feather name="bar-chart-2" size={12} color="#7DD3FC" />
            <Text style={styles.heroDossierText} numberOfLines={1}>Fiscal Dossier</Text>
            <Feather name="chevron-right" size={13} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Balance Hero Amount Display + Margin Pill */}
        <View style={styles.heroAmountSection}>
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setNetModalVisible(true);
            }}
            activeOpacity={0.85}
            style={{ flex: 1, minWidth: 0, marginRight: 10 }}
          >
            <Text
              style={[styles.heroAmountText, { color: !hideBalance && balanceViewMode === "expenses" ? "#FDA4AF" : "#FFFFFF" }]}
              numberOfLines={Platform.OS === "web" ? undefined : 1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {hideBalance
                ? `${settings.currency} ••••••`
                : `${currentHeroBalance >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(currentHeroBalance))}`}
            </Text>
          </TouchableOpacity>

          {heroBadgeText ? (
            <TouchableOpacity
              style={[styles.heroGrowthPill, { backgroundColor: heroBadgeBg, borderColor: heroBadgeBorder }]}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setNetModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Feather name={heroBadgeIcon as any} size={12} color={heroBadgeColor} />
              <Text style={[styles.heroGrowthText, { color: heroBadgeColor }]}>{heroBadgeText}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Dynamic Cash Flow / Budget Status Bar & Labels */}
        <View style={styles.retentionContainer}>
          <View style={styles.retentionTrack}>
            <View
              style={[
                styles.retentionFill,
                {
                  width: `${barWidth(totalAllocatedBudget > 0 ? netBudgetUtilization : totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : totalExpenses > 0 ? 100 : 0)}%`,
                  backgroundColor: isEffectiveDeficit || (totalAllocatedBudget > 0 && budgetUsedPct > 100) ? "#FB7185" : "#38BDF8",
                },
              ]}
            />
          </View>
          <View style={styles.retentionLabels}>
            <Text style={[styles.retentionText, { flexShrink: 1 }]} numberOfLines={Platform.OS === "web" ? undefined : 1}>
              {totalAllocatedBudget > 0
                ? `Available to allocate: ${settings.currency} ${fmt(availableToAllocate)}`
                : totalExpenses === 0
                ? "Nothing spent yet"
                : totalIncome === 0
                ? "No inflow recorded yet"
                : `${expensePctOfIncome}% of inflow spent`}
            </Text>
            <Text
              style={[styles.retentionText, styles.retentionStatus, { color: isEffectiveDeficit ? "#FDA4AF" : "#6EE7B7" }]}
              numberOfLines={1}
            >
              {totalAllocatedBudget > 0
                ? `${budgetUsedPct}% of budget used`
                : isDeficit
                ? `Deficit -${settings.currency} ${fmt(totalExpenses - totalIncome)}`
                : `${incomeRetainedPct}% retained`}
            </Text>
          </View>
        </View>

        {/* Budget breakdown (only when department budgets exist) */}
        {totalAllocatedBudget > 0 && (
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Allocated</Text>
              <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {settings.currency} {fmt(totalAllocatedBudget)}
              </Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Remaining</Text>
              <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {settings.currency} {fmt(netBudgetRemaining)}
              </Text>
            </View>
          </View>
        )}

        {/* View Mode Switcher (segmented control) */}
        <View style={styles.heroSegment}>
          {([
            { key: "cashflow", label: "Net Cash", amount: `${netCash >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(netCash))}`, dot: "#34D399" },
            { key: "expenses", label: "Outflows", amount: `-${settings.currency} ${fmt(totalExpenses)}`, dot: "#FB7185" },
          ] as const).map((opt) => {
            const active = balanceViewMode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.heroSegmentBtn, active && styles.heroSegmentBtnActive]}
                onPress={() => {
                  setBalanceViewMode(opt.key);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.8}
                accessibilityState={{ selected: active }}
              >
                <View style={styles.heroSegmentLabelRow}>
                  <View style={[styles.heroStatusDot, { backgroundColor: opt.dot }]} />
                  <Text style={[styles.heroSegmentLabel, { color: active ? "#FFFFFF" : "rgba(255,255,255,0.7)" }]}>{opt.label}</Text>
                </View>
                <Text
                  style={[styles.heroSegmentAmount, { color: active ? "#FFFFFF" : "rgba(255,255,255,0.75)" }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {hideBalance ? `${settings.currency} ••••` : opt.amount}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {/* ─── KPI Overview Grid ─── */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Overview</Text>
        <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Tap a card for details</Text>
      </View>
      <View style={styles.kpiGrid}>
        <View style={styles.kpiRow}>
          <KpiCard
            layout="wide"
            icon="arrow-down-left"
            color={colors.income}
            label="Total Inflow"
            prefix={`+${settings.currency}`}
            value={fmt(totalIncome)}
            spark={{
              data: sixMonths.income,
              labels: sixMonths.labels,
              caption: thisMonthIncome > 0 ? `This month: ${settings.currency} ${fmt(thisMonthIncome)}` : "Nothing received this month",
              change: inflowChange?.text,
              changeColor: inflowChange?.color,
            }}
            segments={[{ pct: inflowKeptPct, color: isEffectiveDeficit ? colors.expense : colors.income }]}
            footLeft={
              totalIncome === 0
                ? "No inflow recorded yet"
                : totalAllocatedBudget > 0
                ? `${settings.currency} ${fmt(availableToAllocate)} unallocated`
                : isDeficit
                ? "Deficit · nothing retained"
                : "Retained after expenses"
            }
            footLeftColor={totalIncome === 0 ? undefined : isEffectiveDeficit ? colors.expense : undefined}
            footRight={totalIncome > 0 ? fmtPct(inflowKeptPct) : null}
            footRightColor={isEffectiveDeficit ? colors.expense : colors.income}
            onPress={() => router.push("/(tabs)/income")}
          />
        </View>

        <View style={styles.kpiRow}>
          <KpiCard
            layout="wide"
            icon="arrow-up-right"
            color={colors.expense}
            label="Total Expenses"
            prefix={`-${settings.currency}`}
            value={fmt(totalExpenses)}
            tag={expenseStatusText}
            tagColor={expenseStatusColor}
            spark={{
              data: sixMonths.expense,
              labels: sixMonths.labels,
              caption: thisMonthExpense > 0 ? `This month: ${settings.currency} ${fmt(thisMonthExpense)}` : "Nothing spent this month",
              change: expenseChange?.text,
              changeColor: expenseChange?.color,
            }}
            segments={[{ pct: expenseBarPct, color: expenseBarColor }]}
            footLeft={
              totalExpenses === 0
                ? "Nothing spent yet"
                : totalIncome === 0
                ? "No inflow recorded to cover this"
                : expenseOfInflowPct > 100
                ? "of total inflow · spending exceeds inflow"
                : "of total inflow spent"
            }
            footLeftColor={totalExpenses > 0 && (totalIncome === 0 || expenseOfInflowPct > 100) ? colors.expense : undefined}
            footRight={totalExpenses > 0 && totalIncome > 0 ? fmtPct(expenseOfInflowPct) : null}
            footRightColor={expenseBarColor}
            onPress={() => router.push("/(tabs)/expenses")}
          />
        </View>

        <View style={styles.kpiRow}>
          <KpiCard
            icon="pie-chart"
            color={budgetColor}
            label="Department Budget"
            prefix={settings.currency}
            value={fmt(totalAllocatedBudget)}
            tag={
              totalAllocatedBudget === 0
                ? "No budget"
                : netBudgetUtilization > 100
                ? "Over limit"
                : netBudgetUtilization > 80
                ? "Near limit"
                : "On track"
            }
            segments={[{ pct: totalAllocatedBudget === 0 ? 0 : netBudgetUtilization, color: budgetColor }]}
            subValue={budgetScopeLabel ? `Across ${budgetScopeLabel}` : undefined}
            footLeft={totalAllocatedBudget > 0 ? "" : "No budget set yet"}
            footStats={
              totalAllocatedBudget > 0
                ? [
                    // Same number-led style as the Total Payroll box
                    { value: fmtPct(netBudgetUtilization), label: "of budget used", color: budgetColor },
                    overBudget
                      ? {
                          value: `${settings.currency} ${fmt(totalBudgetSpent - totalAllocatedBudget)}`,
                          label: "over budget",
                          color: colors.expense,
                        }
                      : { value: `${settings.currency} ${fmt(netBudgetRemaining)}`, label: "left to spend" },
                  ]
                : undefined
            }
            onPress={() => router.push("/budget")}
          />
          <KpiCard
            icon="users"
            color="#8B5CF6"
            label="Total Payroll"
            prefix={settings.currency}
            value={fmt(payrollTotal)}
            subValue={activePayroll.length > 0 ? `Avg salary ${settings.currency} ${fmt(Math.round(avgNetSalary))}` : undefined}
            tag={`${staffCount} Staff`}
            tagColor={staffCount > 0 ? "#8B5CF6" : colors.mutedForeground}
            segments={[
              {
                pct: payrollOfInflowPct ?? 0,
                color: (payrollOfInflowPct ?? 0) > 100 ? colors.expense : "#8B5CF6",
              },
            ]}
            footLeft={payrollTotal > 0 ? "" : "No payroll yet"}
            footStats={
              payrollTotal > 0
                ? [
                    // Short, number-led lines: "16% of total income", "Oct 2026 last payroll run"
                    payrollOfInflowPct === null
                      ? { value: "", label: "No income recorded yet" }
                      : {
                          value: exactPctText(payrollOfInflowPct),
                          label: "of total income",
                          color: payrollOfInflowPct > 100 ? colors.expense : "#8B5CF6",
                        },
                    ...(lastPayrollLabel ? [{ value: lastPayrollLabel, label: "last payroll run" }] : []),
                  ]
                : undefined
            }
            onPress={() => router.push("/payroll")}
          />
        </View>

        <View style={styles.kpiRow}>
          <KpiCard
            layout="wide"
            icon="list"
            color={colors.primary}
            label="Transactions"
            value={`${transactions.length} ${transactions.length === 1 ? "record" : "records"}`}
            tag={transactions.length > 0 ? "Active" : "Empty"}
            tagColor={transactions.length > 0 ? colors.primary : colors.mutedForeground}
            spark={{
              data: sixMonths.count,
              labels: sixMonths.labels,
              caption: thisMonthCount > 0 ? `This month: ${thisMonthCount} ${thisMonthCount === 1 ? "record" : "records"}` : "No records this month",
              change: txChange?.text,
              changeColor: txChange?.color,
            }}
            segments={
              transactions.length > 0
                ? [
                    { pct: (incomeCount / transactions.length) * 100, color: colors.income },
                    { pct: (expenseCount / transactions.length) * 100, color: colors.expense },
                  ]
                : []
            }
            footLeft={transactions.length > 0 ? `${incomeCount} inflow · ${expenseCount} expense records` : "No transactions yet"}
            footRight={
              transactions.length > 0
                ? `${Math.round((incomeCount / transactions.length) * 100)}% in · ${Math.round((expenseCount / transactions.length) * 100)}% out`
                : null
            }
            onPress={() => setTxModalVisible(true)}
          />
        </View>
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
          width={chartWidth - 32}
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
          ranges={["1W", "2W", "1M", "3M", "6M", "1Y", "ALL"]}
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
        departments={departments}
        budgets={budgets}
        transactions={transactions}
        onOpenDrillDown={(type, dept) => {
          setMobileDrillDown(type);
          setMobileDrillDownDept(dept);
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

      {/* Top Department Cost Centers Card */}
      {expenseByDept.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Departments</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
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
              <Text style={[styles.miniViewPillText, { color: colors.primary }]}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={{ gap: 16, marginTop: 2 }}>
            {expenseByDept.slice(0, 3).map((dept, idx) => {
              const deptColors = ["#EC4899", "#3B82F6", "#8B5CF6", "#F59E0B"];
              const itemColor = deptColors[idx % deptColors.length];
              const pct = totalExpenses > 0 ? Math.round((dept.total / totalExpenses) * 100) : 0;
              const cleanName = dept.department || "General";

              return (
                <TouchableOpacity
                  key={dept.department}
                  style={{ gap: 8 }}
                  activeOpacity={0.75}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const matched = departments.find(
                      (d) => d.name.trim().toLowerCase() === cleanName.trim().toLowerCase()
                    ) || { id: cleanName, name: cleanName, headCount: 0, budgetAllocated: 0 };
                    setSelectedStaffDept(matched as Department);
                    setStaffModalVisible(true);
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0, marginRight: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: itemColor }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }} numberOfLines={1}>
                          {cleanName}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                          {pct}% of expenses · <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium" }}>View roster</Text>
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }}>
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
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Quick Actions Section */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={Platform.OS === "web" ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7}>
              Quick Actions
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={Platform.OS === "web" ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7}>
              Instant financial shortcuts
            </Text>
          </View>
          <View style={[styles.actionSectionPill, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "30", flexShrink: 0, paddingHorizontal: 9, paddingVertical: 3.5 }]}>
            <Feather name="zap" size={12} color={colors.primary} />
            <Text style={[styles.actionSectionPillText, { color: colors.primary, includeFontPadding: false }]}>
              Active
            </Text>
          </View>
        </View>

        <View style={styles.actionsGrid}>
          <AnimatedQuickAction
            label="Add Inflow"
            sub="Deposit & grant"
            badge={`${incomeCount} ${incomeCount === 1 ? "Record" : "Records"}`}
            icon="plus-circle"
            color={colors.income}
            onPress={() => router.push("/(tabs)/income")}
          />
          <AnimatedQuickAction
            label="Add Expense"
            sub="Bills & supplies"
            badge={`${expenseCount} ${expenseCount === 1 ? "Record" : "Records"}`}
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
            badge="AI Active"
            icon="zap"
            color="#10B981"
            onPress={() => router.push("/ai-insights")}
          />
          <AnimatedQuickAction
            label="Staff Payroll"
            sub="Salaries & bonus"
            badge={`${staffCount} Staff`}
            icon="users"
            color="#8B5CF6"
            onPress={() => router.push("/payroll")}
          />
          <AnimatedQuickAction
            label="Budget Plan"
            sub="Dept allocations"
            badge={`${budgetPlanCount} ${budgetPlanCount === 1 ? "Plan" : "Plans"}`}
            icon="pie-chart"
            color={colors.warning}
            onPress={() => router.push("/budget")}
          />
        </View>
      </View>

      {/* Recent Transactions */}
      <View style={[styles.cardHeader, { marginTop: 4, marginBottom: -4 }]}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={Platform.OS === "web" ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7}>
            Recent Transactions
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.seeAllBtn, { borderColor: colors.border, flexShrink: 0, paddingHorizontal: 8 }]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTxModalVisible(true);
          }}
        >
          <Text style={[styles.seeAllText, { color: colors.primary }]} numberOfLines={Platform.OS === "web" ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7}>
            See All
          </Text>
          <Feather name="arrow-right" size={12} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {recentTransactions.map((t) => (
        <TransactionItem
          key={t.id}
          item={t}
          canDelete={can(user, "delete_transaction")}
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
                <Text style={[styles.txSummaryLabel, { color: colors.income }]}>▲ Inflow</Text>
                <Text style={[styles.txSummaryVal, { color: colors.income }]} numberOfLines={Platform.OS === "web" ? undefined : 2} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {settings.currency} {fmt(totalIncome)}
                </Text>
              </View>
              <View style={[styles.txSummaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.txSummaryCol}>
                <Text style={[styles.txSummaryLabel, { color: colors.expense }]}>▼ Expenses</Text>
                <Text style={[styles.txSummaryVal, { color: colors.expense }]} numberOfLines={Platform.OS === "web" ? undefined : 2} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {settings.currency} {fmt(totalExpenses)}
                </Text>
              </View>
              <View style={[styles.txSummaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.txSummaryCol}>
                <Text style={[styles.txSummaryLabel, { color: colors.primary }]}>Net Flow</Text>
                <Text style={[styles.txSummaryVal, { color: netBalance >= 0 ? colors.income : colors.expense }]} numberOfLines={Platform.OS === "web" ? undefined : 2} adjustsFontSizeToFit minimumFontScale={0.7}>
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
                { key: "income", label: `Inflow (${transactions.filter(t => t.type === "income").length})` },
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
                  canDelete={can(user, "delete_transaction")}
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
        netBalance={netBalance}
        netSurplus={netSurplus}
        onOpenStatement={() => {
          setNetModalVisible(false);
          setExportModalVisible(true);
        }}
      />

      {/* ─── Level 3 Comprehensive Financial Drill-Down Modal ─── */}
      <FinancialDrillDownModal
        visible={mobileDrillDown !== null}
        type={mobileDrillDown || "budget"}
        onClose={() => {
          setMobileDrillDown(null);
          setMobileDrillDownDept(undefined);
        }}
        initialDepartment={mobileDrillDownDept}
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
  container: { paddingHorizontal: 16, gap: 16 },

  // Header: avatar + identity on the left, actions on the right
  headerContainer: {
    marginBottom: 2,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    flexShrink: 0,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarFill: {
    flex: 1,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarStatus: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2.5,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  greetingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  syncDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    flexShrink: 0,
  },
  roleChipText: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
    includeFontPadding: false,
  },
  greeting: { fontSize: 13, lineHeight: 17, fontFamily: "Inter_500Medium", includeFontPadding: false },
  name: {
    marginTop: 2,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
  orgLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 18,
    marginTop: 3,
  },
  orgFlag: { fontSize: 12, lineHeight: 16, includeFontPadding: false },
  orgName: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
    includeFontPadding: false,
  },
  roleBadge: {
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: "center",
  },
  roleText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutIconBtn: {
    borderColor: "rgba(239, 68, 68, 0.28)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  notifBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    borderRadius: 9.5,
    borderWidth: 2,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: "Inter_800ExtraBold",
    color: "#FFFFFF",
    includeFontPadding: false,
  },

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
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  logoutModalMsg: {
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 14,
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
    gap: 8,
  },
  heroLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  heroLabelIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(56, 189, 248, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroLabel: {
    color: "rgba(255, 255, 255, 0.88)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  heroEyeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroDossierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    paddingLeft: 10,
    paddingRight: 8,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    flexShrink: 0,
  },
  heroDossierText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  heroAmountSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroAmountText: {
    color: "#FFFFFF",
    fontSize: 32,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.8,
  },
  heroGrowthPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
  },
  heroGrowthText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  heroStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },

  // Spend / retention progress inside the hero card
  retentionContainer: {
    gap: 8,
  },
  retentionLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  retentionText: {
    color: "rgba(226, 232, 240, 0.9)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  retentionStatus: {
    fontFamily: "Inter_700Bold",
    textAlign: "right",
    flexShrink: 0,
  },
  retentionTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    overflow: "hidden",
  },
  retentionFill: {
    height: "100%",
    borderRadius: 3,
  },

  // Allocated / Remaining budget figures
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  heroStat: { flex: 1, minWidth: 0, gap: 2 },
  heroStatLabel: {
    color: "rgba(203, 213, 225, 0.85)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  heroStatValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  heroStatDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    marginHorizontal: 12,
  },

  // Net Cash / Outflows segmented control
  heroSegment: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.18)",
  },
  heroSegmentBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  heroSegmentBtnActive: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  heroSegmentLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroSegmentLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  heroSegmentAmount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
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
    fontSize: 10,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  glassCardValue: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 0.5,
    textAlign: "center",
  },

  // Section label above the KPI grid
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 4,
    marginBottom: -2,
  },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  sectionHint: { fontSize: 12, fontFamily: "Inter_500Medium" },

  // KPI grid: two equal columns per row, cards stretch to the tallest neighbour
  kpiGrid: { gap: 12 },
  kpiRow: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  kpiCell: { flex: 1, minWidth: 0 },
  kpiCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  kpiTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kpiLabelText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
  },
  kpiTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 0,
  },
  kpiTagText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    includeFontPadding: false,
  },
  kpiValueText: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.5,
  },
  kpiValueWide: { fontSize: 24, letterSpacing: -0.7 },
  kpiCompactBody: { gap: 4 },
  kpiSubValue: { fontSize: 12, lineHeight: 16, fontFamily: "Inter_500Medium" },
  kpiStatList: { gap: 4 },
  kpiStatRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 6 },
  kpiStatValue: { fontSize: 14, lineHeight: 19, fontFamily: "Inter_800ExtraBold" },
  kpiStatLabel: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_500Medium" },
  kpiValuePrefix: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0,
  },
  // Wide card: figures (left) + 6-month chart (right)
  kpiWideBody: { flexDirection: "row", alignItems: "flex-end", gap: 14 },
  kpiWideLeft: { flex: 1.1, minWidth: 0, gap: 6 },
  kpiWideChart: { flex: 1, minWidth: 0 },
  kpiMonthText: { fontSize: 13, lineHeight: 17, fontFamily: "Inter_500Medium" },
  kpiChangePill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  kpiChangeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  sparkLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  sparkLabel: { fontSize: 11, textAlign: "center" },
  kpiFooter: { gap: 8, marginTop: "auto" },
  /** Progress track at the bottom of each KPI box */
  kpiTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
  },
  kpiFootRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  kpiCaption: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Inter_500Medium",
  },
  kpiFootRight: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: "Inter_800ExtraBold",
    flexShrink: 0,
    textAlign: "right",
  },

  statCard: { width: 125, borderRadius: 14, borderWidth: 1, padding: 12, gap: 4, alignItems: "center" },
  statIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  statCardValue: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  statCardLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },

  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 30, borderRadius: 15, borderWidth: 1, flexShrink: 0 },
  seeAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  miniViewPill: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: "center",
  },
  miniViewPillText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  miniInsightStrip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 4,
  },
  miniInsightText: {
    fontSize: 11,
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
    fontSize: 10,
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
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 1,
    marginLeft: 8,
  },
  actionBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    includeFontPadding: false,
  },
  actionTitleText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  actionSubText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
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
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  txSummaryVal: {
    fontSize: 14,
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
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  txSearchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    padding: 0,
  },
  txFilterRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  txFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  txFilterText: {
    fontSize: 13,
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
    fontSize: 13,
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
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
