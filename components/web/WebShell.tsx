import { WebLayoutContext } from "@/hooks/useWebLayout";
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
// WebShell: Master desktop/tablet/mobile responsive shell for OFM with real-time notification center
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions, Modal, Image, ActivityIndicator } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import {
  SvgGrid,
  SvgArrowUpRight,
  SvgArrowDownLeft,
  SvgList,
  SvgPieChart,
  SvgLayers,
  SvgUsers,
  SvgShield,
  SvgFileText,
  SvgCpu,
  SvgSettings,
  SvgMenu,
  SvgX,
  SvgLogOut,
  SvgChevronLeft,
  SvgChevronRight,
  SvgSun,
  SvgMoon,
  SvgPlus,
  SvgBell,
  SvgCalendar,
  SvgCheckCircle,
  SvgChevronDown,
} from "./SvgIcons";

import { WebDashboard } from "./WebDashboard";
import { BrandMark } from "./BrandMark";
import { FitText } from "./FitText";
import { FiscalScopeMode, FiscalScopeProvider, loadScopeMode, saveScopeMode } from "./FiscalScope";
import { MONTH_NAMES, fiscalMonthIndex, fiscalRange, fiscalStartYearFor, fiscalStatus, normalizeStartMonth, parseFiscalStartYear } from "@/services/fiscalYear";
import { WebAuth } from "./WebAuth";
import { OpenInAppBanner } from "./OpenInAppBanner";

// Direct static imports to eliminate Metro web code-splitting chunk mismatches and missing module errors in production
import { WebIncome } from "./WebIncome";
import { WebExpenses } from "./WebExpenses";
import { WebTransactions } from "./WebTransactions";
import { WebBudgets } from "./WebBudgets";
import { WebDepartments } from "./WebDepartments";
import { WebPayroll } from "./WebPayroll";
import { WebTeam } from "./WebTeam";
import { WebReports } from "./WebReports";
import { WebAIInsights } from "./WebAIInsights";
import { WebSettings } from "./WebSettings";

function TabLoadingSkeleton() {
  return (
    <View style={{ flex: 1, minHeight: 380, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text style={{ marginTop: 12, color: "#94A3B8", fontSize: 13, fontFamily: "Inter_500Medium" }}>
        Loading module...
      </Text>
    </View>
  );
}

class TabErrorBoundary extends React.Component<
  { children: React.ReactNode; tabKey: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Tab render error in [", this.props.tabKey, "]:", error, errorInfo);
  }

  componentDidUpdate(prevProps: any) {
    if (prevProps.tabKey !== this.props.tabKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, minHeight: 340, justifyContent: "center", alignItems: "center", padding: 24, gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#F43F5E18", alignItems: "center", justifyContent: "center" }}>
            <SvgX size={24} color="#F43F5E" />
          </View>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#F43F5E", textAlign: "center" }}>
            Unable to display this tab
          </Text>
          <Text style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", maxWidth: 460 }}>
            {this.state.error?.message || "A temporary rendering issue occurred in this section."}
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              } else {
                this.setState({ hasError: false, error: null });
              }
            }}
            style={{ backgroundColor: "#3B82F6", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 6 }}
          >
            <Text style={{ color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 13 }}>Reload Section</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

import { WebTransactionModal } from "./modals/WebTransactionModal";
import { WebBudgetModal } from "./modals/WebBudgetModal";
import { NotificationCenterModal } from "@/components/NotificationCenterModal";
import { WebPageTransition } from "./animations/WebPageTransition";
import { injectWebMicroAnimations } from "./animations/webStyles";
import { useEdgeSwipeBack } from "./navigation/useEdgeSwipeBack";
import { EdgeSwipeVisualIndicator } from "./navigation/EdgeSwipeVisualIndicator";

// RN-Web maps `dataSet` to data-* attributes; webStyles.ts targets these for hover/transition polish
const ofm = (key: string) => ({ dataSet: { [key]: "" } } as any);

export type WebTabKey =
  | "dashboard"
  | "income"
  | "expenses"
  | "transactions"
  | "budgets"
  | "departments"
  | "payroll"
  | "team"
  | "reports"
  | "ai-insights"
  | "settings";

interface NavItem {
  id: WebTabKey;
  label: string;
  icon: string;
  badge?: number | string;
  badgeColor?: string;
  section: string;
  roleRestriction?: ("admin" | "accountant" | "manager" | "employee")[];
}

const VALID_TABS: WebTabKey[] = [
  "dashboard",
  "income",
  "expenses",
  "transactions",
  "budgets",
  "departments",
  "payroll",
  "team",
  "reports",
  "ai-insights",
  "settings",
];

const TAB_ALIASES: Record<string, WebTabKey> = {
  ledger: "transactions",
  transaction: "transactions",
  budget: "budgets",
  department: "departments",
  report: "reports",
  insight: "ai-insights",
  insights: "ai-insights",
  setting: "settings",
  salary: "payroll",
};

export function normalizeWebTab(raw: string | null | undefined): WebTabKey {
  if (!raw) return "dashboard";
  const lower = raw
    .toLowerCase()
    .trim()
    .replace(/^\/+/, "")
    .replace(/^(\(tabs\)\/)?/, "");
  if (TAB_ALIASES[lower]) return TAB_ALIASES[lower];
  if (VALID_TABS.includes(lower as WebTabKey)) return lower as WebTabKey;
  return "dashboard";
}

export function WebShell() {
  const colors = useColors();
  // Dark charcoal navigation rail (same in light & dark themes)
  const SB = { bg: "#1F2125", border: "#33363C", text: "#D9DBDF", muted: "#8E9198", accent: "#53B700", activeBg: "#2E3137", badgeBg: "#33363C" };
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1080;

  const { user, logout, isLoading } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { transactions, budgets, departments, payroll, notifications, unreadNotificationCount } = useFinance();

  const [activeTab, setActiveTab] = useState<WebTabKey>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isTablet);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const availableWidth = Math.max(0, width - (isMobile ? 0 : sidebarCollapsed ? 76 : 260));
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [fyOpen, setFyOpen] = useState(false);
  const fyAnchorRef = useRef<React.ComponentRef<typeof View>>(null);
  const [fyAnchor, setFyAnchor] = useState({ bottom: 68, right: 16 });
  const [fyViewYear, setFyViewYear] = useState<number | null>(null); // year being looked at in the picker
  const [fyDraftMonth, setFyDraftMonth] = useState<number | null>(null); // start month being tried out
  const [fyMsg, setFyMsg] = useState<string | null>(null);
  const [scopeMode, setScopeModeState] = useState<FiscalScopeMode>(() => loadScopeMode());
  const setScopeMode = (m: FiscalScopeMode) => {
    setScopeModeState(m);
    saveScopeMode(m);
  };

  // Global Quick Modals
  const [txModalVisible, setTxModalVisible] = useState(false);
  const [txModalType, setTxModalType] = useState<"income" | "expense">("income");
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);

  const [tabHistory, setTabHistory] = useState<WebTabKey[]>(["dashboard"]);

  const navigateToTab = useCallback((tab: WebTabKey) => {
    const valid = normalizeWebTab(tab);
    setActiveTab((prev) => {
      if (prev === valid) return prev;
      setTabHistory((h) => [...h, valid]);
      if (typeof window !== "undefined" && window.history) {
        window.history.pushState({ tab: valid }, "", "?tab=" + valid);
      }
      return valid;
    });
  }, []);

  const handleGoBack = useCallback(() => {
    // 1. Intelligent Modal Priority: Close drawer or modals first
    if (mobileDrawerOpen) {
      setMobileDrawerOpen(false);
      return true;
    }
    if (notificationModalVisible) {
      setNotificationModalVisible(false);
      return true;
    }
    if (txModalVisible) {
      setTxModalVisible(false);
      return true;
    }
    if (budgetModalVisible) {
      setBudgetModalVisible(false);
      return true;
    }

    // 2. Navigation Stack Awareness: Pop previous tab if available
    let handled = false;
    setTabHistory((prevHistory) => {
      if (prevHistory.length > 1) {
        const nextHistory = [...prevHistory];
        nextHistory.pop();
        const targetTab = normalizeWebTab(nextHistory[nextHistory.length - 1]);
        setActiveTab(targetTab);
        if (typeof window !== "undefined" && window.history) {
          window.history.replaceState({ tab: targetTab }, "", "?tab=" + targetTab);
        }
        handled = true;
        return nextHistory;
      }
      return prevHistory;
    });

    return handled;
  }, [mobileDrawerOpen, txModalVisible, budgetModalVisible]);

  const canGoBack = mobileDrawerOpen || txModalVisible || budgetModalVisible || tabHistory.length > 1;

  const { isSwiping, swipeProgress } = useEdgeSwipeBack({
    enabled: isMobile,
    edgeZone: 30,
    thresholdDistance: 65,
    thresholdVelocity: 0.3,
    onBack: handleGoBack,
    canGoBack,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const rawTab = params.get("tab");
      const exportType = params.get("export");
      if (rawTab) {
        const normalized = normalizeWebTab(rawTab);
        setActiveTab(normalized);
        setTabHistory(["dashboard", normalized]);
      } else if (exportType === "payslip" || exportType === "slip" || params.get("payrollId") || params.get("empId")) {
        setActiveTab("payroll");
        setTabHistory(["dashboard", "payroll"]);
      } else if (exportType === "dossier" || params.get("auto") === "pdf" || params.get("reportType")) {
        setActiveTab("reports");
        setTabHistory(["dashboard", "reports"]);
      }

      const handlePopState = (e: PopStateEvent) => {
        if (e.state && e.state.tab) {
          const target = normalizeWebTab(e.state.tab);
          setActiveTab(target);
          setTabHistory((prev) => {
            if (prev.length > 1 && prev[prev.length - 2] === target) {
              return prev.slice(0, -1);
            }
            return [...prev, target];
          });
        }
      };
      window.addEventListener("popstate", handlePopState);
      return () => window.removeEventListener("popstate", handlePopState);
    }
  }, []);

  useEffect(() => {
    injectWebMicroAnimations();
  }, []);

  useEffect(() => {
    if (isTablet) {
      setSidebarCollapsed(true);
    } else if (!isMobile) {
      setSidebarCollapsed(false);
    }
  }, [isTablet, isMobile]);

  // Elegant non-blocking loader while restoring session on refresh
  if (isLoading && !user) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // If unauthenticated or after logout on Web, present the Web Sign In & Create Account screen
  if (!user) {
    return <WebAuth />;
  }

  const canEdit = user?.role === "admin" || user?.role === "accountant";
  const userInitials = (user?.name || user?.email?.split("@")[0] || "U").trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "U";
  // ── Fiscal year: saved in Settings (label + start month); the picker can browse other years ──
  const fyStartMonthSaved = normalizeStartMonth(settings.fiscalYearStartMonth);
  const fySavedYear = parseFiscalStartYear(settings.fiscalYear, fyStartMonthSaved);
  const fyMonth = fyDraftMonth ?? fyStartMonthSaved;
  const fyYear = fyViewYear ?? fySavedYear;
  const fyThisYear = fiscalStartYearFor(new Date(), fyMonth);
  const fyRangeSaved = fiscalRange(fySavedYear, fyStartMonthSaved);
  const fyRangeView = fiscalRange(fyYear, fyMonth);
  const fyFigures = (() => {
    const inFy = (transactions || []).filter((t) => {
      const d = (t.date || "").slice(0, 10);
      return d >= fyRangeView.startYmd && d <= fyRangeView.endYmd && (t as any).status !== "failed" && (t as any).status !== "deleted";
    });
    const income = inFy.filter((t) => t.type === "income").reduce((x, t) => x + (Number(t.amount) || 0), 0);
    const expenses = inFy.filter((t) => t.type === "expense").reduce((x, t) => x + (Number(t.amount) || 0), 0);
    return { income, expenses, net: income - expenses, count: inFy.length };
  })();
  const fyViewStatus = fiscalStatus(fyRangeView);
  const fySavedStatus = fiscalStatus(fyRangeSaved);
  const fyViewPct = fyViewStatus === "active"
    ? Math.min(100, ((Date.now() - fyRangeView.start.getTime()) / (fyRangeView.end.getTime() - fyRangeView.start.getTime())) * 100)
    : fyViewStatus === "ended" ? 100 : 0;
  const fyIsSaved = fyYear === fySavedYear && fyMonth === fyStartMonthSaved;
  const fySavedCount = (transactions || []).filter((t) => {
    const d = (t.date || "").slice(0, 10);
    return d >= fyRangeSaved.startYmd && d <= fyRangeSaved.endYmd;
  }).length;
  const fyCurrentYear = fiscalStartYearFor(new Date(), fyStartMonthSaved);
  const fyDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const fyPanelWidth = Math.min(352, Math.max(0, width - 24));
  const fyPanelTop = isMobile ? 12 : Math.min(fyAnchor.bottom + 8, Math.max(12, height - 480 - 12));
  const fyPanelRight = Math.max(12, Math.min(fyAnchor.right, width - fyPanelWidth - 12));
  const fyPanelMaxHeight = Math.min(480, Math.max(0, height - fyPanelTop - 12));
  const closeFy = () => {
    setFyOpen(false);
    setFyViewYear(null);
    setFyDraftMonth(null);
    setFyMsg(null);
  };
  const userRoleLabel = (user?.role || "admin").charAt(0).toUpperCase() + (user?.role || "admin").slice(1);
  const hasCustomLogo = Boolean(settings?.organizationLogo && settings.organizationLogo.trim());

  const incomeCount = transactions.filter((t) => t.type === "income").length;
  const expenseCount = transactions.filter((t) => t.type === "expense").length;

  const NAV_ITEMS: NavItem[] = [
    { id: "dashboard", section: "Overview", label: "Dashboard", icon: "grid", roleRestriction: ["admin", "accountant", "manager"] },
    { id: "income", section: "Finance", label: "Income", icon: "arrow-up-right", badge: incomeCount, roleRestriction: ["admin", "accountant"] },
    { id: "expenses", section: "Finance", label: "Expenses", icon: "arrow-down-left", badge: expenseCount, roleRestriction: ["admin", "accountant", "manager"] },
    { id: "transactions", section: "Finance", label: "Transactions", icon: "list", roleRestriction: ["admin", "accountant", "manager"] },
    { id: "budgets", section: "Finance", label: "Budgets", icon: "pie-chart", badge: budgets.length, roleRestriction: ["admin", "accountant", "manager"] },
    { id: "departments", section: "Organization", label: "Departments", icon: "layers", badge: departments.length, roleRestriction: ["admin", "accountant", "manager"] },
    { id: "payroll", section: "Organization", label: user?.role === "employee" ? "My payslips" : "Payroll", icon: "users", badge: user?.role === "employee" ? undefined : payroll.length, roleRestriction: ["admin", "accountant", "manager", "employee"] },
    { id: "team", section: "Organization", label: "Team", icon: "shield", roleRestriction: ["admin"] },
    { id: "reports", section: "Insights", label: "Reports", icon: "file-text", roleRestriction: ["admin", "accountant", "manager"] },
    { id: "ai-insights", section: "Insights", label: "AI Insights", icon: "cpu", roleRestriction: ["admin", "manager"] },
    { id: "settings", section: "System", label: "Settings", icon: "settings", roleRestriction: ["admin"] },
  ];

  // ── Role-based page access: pages are blocked, not just hidden from the menu ──
  const allowedTabs = new Set<WebTabKey>(
    NAV_ITEMS.filter((i) => !i.roleRestriction || (user && i.roleRestriction.includes(user.role))).map((i) => i.id)
  );
  const homeTab: WebTabKey = allowedTabs.has("dashboard") ? "dashboard" : "payroll";
  const requestedTab: WebTabKey = VALID_TABS.includes(activeTab) ? activeTab : "dashboard";
  // Landing on "dashboard" (default / unknown tab) quietly goes to this role's home page
  const shownTab: WebTabKey | null = allowedTabs.has(requestedTab) ? requestedTab : requestedTab === "dashboard" ? homeTab : null;
  const requestedLabel = NAV_ITEMS.find((n) => n.id === requestedTab)?.label || "This page";

  const handleOpenTx = (type: "income" | "expense") => {
    setTxModalType(type);
    setTxModalVisible(true);
  };

  const toggleTheme = () => {
    const nextTheme = settings.theme === "dark" ? "light" : "dark";
    updateSettings({ theme: nextTheme });
  };

  const renderNavIcon = (icon: string, size = 16, color = "#94A3B8") => {
    switch (icon) {
      case "grid": return <SvgGrid size={size} color={color} />;
      case "arrow-up-right": return <SvgArrowUpRight size={size} color={color} />;
      case "arrow-down-left": return <SvgArrowDownLeft size={size} color={color} />;
      case "list": return <SvgList size={size} color={color} />;
      case "pie-chart": return <SvgPieChart size={size} color={color} />;
      case "layers": return <SvgLayers size={size} color={color} />;
      case "users": return <SvgUsers size={size} color={color} />;
      case "shield": return <SvgShield size={size} color={color} />;
      case "file-text": return <SvgFileText size={size} color={color} />;
      case "cpu": return <SvgCpu size={size} color={color} />;
      case "settings": return <SvgSettings size={size} color={color} />;
      default: return <SvgGrid size={size} color={color} />;
    }
  };

  const renderNavLinks = (isDrawer = false) => (
    <ScrollView style={styles.navScroll} contentContainerStyle={styles.navContent} showsVerticalScrollIndicator={false}>
      <View style={{ gap: 2 }}>
        {NAV_ITEMS.filter((item) => !item.roleRestriction || (user && item.roleRestriction.includes(user.role))).map((item, idx, visible) => {
          const isActive = activeTab === item.id;
          const isCollapsed = !isDrawer && sidebarCollapsed;
          const startsSection = idx === 0 || visible[idx - 1].section !== item.section;

          return (
            <React.Fragment key={item.id}>
            {startsSection && (
              isCollapsed ? (
                idx > 0 && <View style={[styles.navSectionDivider, { backgroundColor: SB.border }]} />
              ) : (
                <Text numberOfLines={1} style={[styles.navSectionLabel, { color: SB.muted }, idx === 0 && { marginTop: 2 }]}>
                  {item.section}
                </Text>
              )
            )}
            <TouchableOpacity
              {...ofm("ofmNav")}
              style={[
                styles.navItem,
                (!isDrawer && sidebarCollapsed) && {
                  justifyContent: "center",
                  paddingHorizontal: 0,
                  alignItems: "center",
                  borderRadius: 12,
                  height: 44,
                },
                isActive && {
                  backgroundColor: SB.activeBg,
                  borderLeftColor: (!isDrawer && sidebarCollapsed) ? "transparent" : SB.accent,
                },
              ]}
              onPress={() => {
                navigateToTab(item.id);
                if (isDrawer) setMobileDrawerOpen(false);
              }}
              accessibilityLabel={(!isDrawer && sidebarCollapsed) ? item.label : undefined}
              activeOpacity={0.7}
            >
              {renderNavIcon(item.icon, 18, isActive ? SB.accent : SB.muted)}
              {(isDrawer || !sidebarCollapsed) && (
                <Text numberOfLines={1}
                  style={[
                    styles.navLabel,
                    {
                      color: isActive ? "#FFFFFF" : SB.text,
                      fontFamily: isActive ? "Inter_600SemiBold" : "Inter_500Medium",
                    },
                  ]}
                >
                  {item.label}
                </Text>
              )}

              {Boolean(item.badge) && (!isDrawer && sidebarCollapsed ? null : (
                <View style={[styles.navBadge, { backgroundColor: isActive ? SB.accent + "33" : SB.badgeBg }]}>
                  <Text style={[styles.navBadgeText, { color: isActive ? "#FFFFFF" : SB.muted }]}>{item.badge}</Text>
                </View>
              ))}
            </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} {...({ dataSet: { ofmAppBg: colors.isDark ? "dark" : "light" } } as any)}>
      {/* Mobile Edge Swipe Back Visual Indicator */}
      <EdgeSwipeVisualIndicator isSwiping={isSwiping} progress={swipeProgress} />

      {/* ─── DESKTOP / TABLET SIDEBAR ─── */}
      {!isMobile && (
        <View
          {...ofm("ofmSidebar")}
          style={[
            styles.sidebar,
            {
              width: sidebarCollapsed ? 76 : 260,
              backgroundColor: SB.bg,
              borderRightColor: SB.border,
            },
          ]}
        >
          {/* Brand Header */}
          <View
            style={[
              styles.brandHeader,
              { borderBottomColor: SB.border },
              sidebarCollapsed && { paddingHorizontal: 8, paddingVertical: 14, flexDirection: "column", gap: 10, alignItems: "center" },
            ]}
          >
            <TouchableOpacity
              style={{ flexDirection: sidebarCollapsed ? "column" : "row", alignItems: "center", gap: sidebarCollapsed ? 0 : 12, flex: 1, minWidth: 0 }}
              onPress={() => navigateToTab("dashboard")}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.brandLogoWrap,
                  {
                    backgroundColor: hasCustomLogo ? "#FFFFFF" : "transparent",
                    borderWidth: hasCustomLogo ? 1 : 0,
                    borderColor: SB.border,
                    padding: hasCustomLogo ? 2 : 0,
                  },
                ]}
              >
                {hasCustomLogo ? (
                  <Image
                    key={settings.organizationLogo}
                    source={{ uri: settings.organizationLogo }}
                    style={styles.brandLogoImg}
                    resizeMode="contain"
                  />
                ) : (
                  <BrandMark size={38} />
                )}
              </View>

              {!sidebarCollapsed && (
                <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                  <Text numberOfLines={1} style={[styles.brandTitle, { color: "#FFFFFF" }]}>
                    OFM Cloud
                  </Text>
                  <Text style={[styles.brandSubtitle, { color: SB.muted }]}>
                    {settings.organizationName || "Financial Management"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {!isTablet && (
              <TouchableOpacity
                {...ofm("ofmIconbtn")} style={[styles.collapseBtn, { borderColor: SB.border }]}
                onPress={() => setSidebarCollapsed(!sidebarCollapsed)}
                accessibilityLabel={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                activeOpacity={0.7}
              >
                {sidebarCollapsed ? (
                  <SvgChevronRight size={14} color={SB.muted} />
                ) : (
                  <SvgChevronLeft size={14} color={SB.muted} />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Navigation Links */}
          {renderNavLinks(false)}

          {/* User Profile Footer */}
          <View
            style={[
              styles.userFooter,
              { borderTopColor: SB.border },
              sidebarCollapsed && { paddingVertical: 14, paddingHorizontal: 4, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 },
            ]}
          >
            {sidebarCollapsed ? (
              <>
                <View
                  style={[styles.userAvatar, { backgroundColor: SB.accent + "20" }]}
                  accessibilityLabel={`Signed in as ${user?.name || "User"} (${userRoleLabel})`}
                >
                  <Text style={[styles.userAvatarText, { color: SB.accent }]}>
                    {userInitials}
                  </Text>
                </View>
                <TouchableOpacity
                  {...ofm("ofmIconbtn")} style={[styles.logoutBtn, { borderColor: SB.border, padding: 8, borderRadius: 8 }]}
                  onPress={logout}
                  accessibilityLabel="Sign out"
                  activeOpacity={0.75}
                >
                  <SvgLogOut size={15} color="#F87171" />
                </TouchableOpacity>
              </>
            ) : (
              <View style={[styles.accountCard, { backgroundColor: SB.activeBg, borderColor: SB.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={[styles.userAvatar, { backgroundColor: SB.accent }]}>
                    <Text style={[styles.userAvatarText, { color: "#FFFFFF" }]}>{userInitials}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <FitText minSize={11} style={[styles.userName, { color: "#FFFFFF", flexShrink: 1 }]}>
                        {user?.name || user?.email?.split("@")[0] || "User"}
                      </FitText>
                      <View style={[styles.roleChip, { backgroundColor: SB.accent + "26" }]}>
                        <Text numberOfLines={1} style={[styles.roleChipText, { color: "#A7E08A" }]}>{userRoleLabel}</Text>
                      </View>
                    </View>
                    <FitText minSize={10} style={[styles.userEmail, { color: SB.muted }]}>
                      {user?.email || ""}
                    </FitText>
                  </View>
                </View>
                <TouchableOpacity
                  {...ofm("ofmIconbtn")}
                  style={[styles.signOutBtn, { borderTopColor: SB.border }]}
                  onPress={logout}
                  accessibilityLabel="Sign out"
                  activeOpacity={0.75}
                >
                  <SvgLogOut size={15} color="#F87171" />
                  <Text style={styles.signOutText}>Sign out</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ─── MOBILE DRAWER MODAL (<768px) ─── */}
      {isMobile && (
        <Modal visible={mobileDrawerOpen} transparent animationType="fade" onRequestClose={() => setMobileDrawerOpen(false)}>
          <View style={styles.drawerBackdrop} {...ofm("ofmDrawerBackdrop")}>
            <View {...ofm("ofmDrawer")} style={[styles.drawerContent, { backgroundColor: SB.bg, borderRightColor: SB.border }]}>
              {/* Drawer Brand Header */}
              <View style={[styles.brandHeader, { borderBottomColor: SB.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                  <View
                    style={[
                      styles.brandLogoWrap,
                      {
                        backgroundColor: hasCustomLogo ? "#FFFFFF" : "transparent",
                        borderWidth: hasCustomLogo ? 1 : 0,
                        borderColor: SB.border,
                        padding: hasCustomLogo ? 2 : 0,
                      },
                    ]}
                  >
                    {hasCustomLogo ? (
                      <Image
                        key={settings.organizationLogo}
                        source={{ uri: settings.organizationLogo }}
                        style={styles.brandLogoImg}
                        resizeMode="contain"
                      />
                    ) : (
                      <BrandMark size={38} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.brandTitle, { color: "#FFFFFF" }]}>
                      OFM Cloud
                    </Text>
                    <Text style={[styles.brandSubtitle, { color: SB.muted }]}>
                      {settings.organizationName || "Enterprise Financial System"}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity {...ofm("ofmIconbtn")} style={[styles.collapseBtn, { borderColor: SB.border }]} onPress={() => setMobileDrawerOpen(false)}>
                  <SvgX size={16} color={SB.text} />
                </TouchableOpacity>
              </View>

              {/* Drawer Links */}
              {renderNavLinks(true)}

              {/* Drawer Footer */}
              <View style={[styles.userFooter, { borderTopColor: SB.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <View style={[styles.userAvatar, { backgroundColor: SB.accent + "20" }]}>
                    <Text style={[styles.userAvatarText, { color: SB.accent }]}>
                      {userInitials}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.userName, { color: "#FFFFFF" }]}>
                      {user?.name || "User"}
                    </Text>
                    <FitText minSize={10} style={[styles.userEmail, { color: SB.muted }]}>
                      {user?.email || ""}
                    </FitText>
                    <Text numberOfLines={1} style={[styles.userRole, { color: SB.accent }]}>
                      {(user?.role || "admin").charAt(0).toUpperCase() + (user?.role || "admin").slice(1)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity {...ofm("ofmIconbtn")} style={[styles.logoutBtn, { borderColor: SB.border }]} onPress={logout}>
                  <SvgLogOut size={16} color="#F87171" />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setMobileDrawerOpen(false)}
              accessibilityLabel="Close Menu"
            />
          </View>
        </Modal>
      )}

      {/* ─── MAIN APP WORKSPACE ─── */}
      <View style={styles.workspace} onLayout={(event) => setWorkspaceWidth(Math.round(event.nativeEvent.layout.width))}>
        {/* Open In Native App Banner for Mobile Browsers */}
        <OpenInAppBanner />

        {/* Top Header Bar */}
        <View {...ofm("ofmTopbar")} style={[styles.topBar, { backgroundColor: colors.card, borderBottomColor: colors.border }, isMobile && { paddingHorizontal: 12, height: 56 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            {/* Mobile Brand / Current Tab Title */}
            {isMobile ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                {tabHistory.length > 1 && (
                  <TouchableOpacity
                    onPress={handleGoBack}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: colors.primary + "18",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 2,
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel="Back"
                  >
                    <SvgChevronLeft size={16} color={colors.primary} />
                  </TouchableOpacity>
                )}
                <View
                  style={[
                    styles.brandLogoWrap,
                    {
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      backgroundColor: hasCustomLogo ? "#FFFFFF" : "transparent",
                      borderWidth: hasCustomLogo ? 1 : 0,
                      borderColor: colors.border,
                      padding: hasCustomLogo ? 2 : 0,
                    },
                  ]}
                >
                  {hasCustomLogo ? (
                    <Image
                      key={settings.organizationLogo}
                      source={{ uri: settings.organizationLogo }}
                      style={styles.brandLogoImg}
                      resizeMode="contain"
                    />
                  ) : (
                    <BrandMark size={30} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.breadcrumbCurrent, { color: colors.foreground, fontSize: 15 }]}>
                    {NAV_ITEMS.find((n) => n.id === (shownTab || requestedTab))?.label || "Overview"}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>
                    {settings.organizationName || "OFM Cloud"}
                  </Text>
                </View>
              </View>
            ) : (
              /* Desktop Breadcrumb Info */
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.pageTitle, { color: colors.foreground }]}>
                  {NAV_ITEMS.find((n) => n.id === (shownTab || requestedTab))?.label || "Overview"}
                </Text>
                <Text style={[styles.breadcrumbRoot, { color: colors.mutedForeground }]}>
                  {settings.organizationName || "OFM Cloud"}
                </Text>
              </View>
            )}
          </View>

          {/* Quick Header Right Actions */}
          <View style={[styles.topRightActions, isMobile && { gap: 4 }]}>
            {/* Fiscal year picker */}
              <View ref={fyAnchorRef}>
                <TouchableOpacity
                  {...ofm("ofmIconbtn")}
                  onPress={() => {
                    if (fyOpen) { closeFy(); return; }
                    fyAnchorRef.current?.measureInWindow((x, y, w, h) => {
                      setFyAnchor({ bottom: y + h, right: width - x - w });
                    });
                    setFyOpen(true);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: fyOpen }}
                  accessibilityLabel={`Fiscal year ${fyRangeSaved.label}. Open fiscal year picker`}
                  style={[
                    styles.infoChip,
                    isMobile && { width: 36, height: 36, paddingHorizontal: 0, marginLeft: 0, justifyContent: "center" },
                    {
                      borderColor: fySavedStatus === "ended" ? colors.warning + "66" : fyOpen ? colors.primary : colors.border,
                      backgroundColor: fySavedStatus === "ended" ? colors.warning + "12" : colors.background,
                    },
                  ]}
                >
                  <SvgCalendar size={15} color={fySavedStatus === "ended" ? colors.warning : colors.mutedForeground} />
                  {!isMobile && (
                    <>
                  <Text numberOfLines={1} style={[styles.syncText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{scopeMode === "all" ? "All time" : `FY ${fyRangeSaved.label}`}</Text>
                  {width >= 1200 && (
                  <Text numberOfLines={1} style={[styles.syncText, { color: fySavedStatus === "ended" ? colors.warning : colors.mutedForeground }]}>
                    · {fySavedStatus === "active" ? `Month ${fiscalMonthIndex(fyRangeSaved)} of 12` : fySavedStatus === "ended" ? "Ended — update" : "Not started"}
                  </Text>
                  )}
                  <SvgChevronDown size={13} color={colors.mutedForeground} />
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <Modal visible={fyOpen} transparent animationType="fade" onRequestClose={closeFy}>
                <View style={[styles.fyOverlay, isMobile && { justifyContent: "center", alignItems: "center" }]}>
                  <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeFy} accessibilityRole="button" accessibilityLabel="Close fiscal year picker" />
                  <View accessibilityViewIsModal style={[
                    styles.fyPanel,
                    { width: fyPanelWidth, maxHeight: fyPanelMaxHeight, backgroundColor: colors.card, borderColor: colors.border },
                    !isMobile && { position: "absolute", top: fyPanelTop, right: fyPanelRight },
                  ]}>
                    {/* Header */}
                    <View style={[styles.fyHead, { borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text accessibilityRole="header" style={[styles.fyTitle, { color: colors.foreground }]}>Fiscal year</Text>
                        <Text style={[styles.fySub, { color: colors.mutedForeground }]}>Choose a year for all pages.</Text>
                      </View>
                      <TouchableOpacity onPress={closeFy} accessibilityRole="button" accessibilityLabel="Close fiscal year picker" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.fyClose}>
                        <SvgX size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.fyScroll} contentContainerStyle={styles.fyBody} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
                      {/* 1. Year */}
                      <View style={[styles.fyCard, { borderColor: colors.border }]}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <TouchableOpacity style={[styles.fyStepBtn, { borderColor: colors.border }]} onPress={() => { setFyViewYear(fyYear - 1); setFyMsg(null); }} accessibilityLabel="Previous fiscal year">
                            <SvgChevronLeft size={16} color={colors.foreground} />
                          </TouchableOpacity>
                          <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
                            <Text style={[styles.fyYearText, { color: colors.foreground }]}>FY {fyRangeView.label}</Text>
                            <Text style={[styles.fyDate, { color: colors.mutedForeground }]}>{fyDate(fyRangeView.start)} – {fyDate(fyRangeView.end)}</Text>
                          </View>
                          <TouchableOpacity style={[styles.fyStepBtn, { borderColor: colors.border }]} onPress={() => { setFyViewYear(fyYear + 1); setFyMsg(null); }} accessibilityLabel="Next fiscal year">
                            <SvgChevronRight size={16} color={colors.foreground} />
                          </TouchableOpacity>
                        </View>

                        <View style={[styles.fySeg, { backgroundColor: colors.muted }]}>
                          {[
                            { label: "Last year", y: fyThisYear - 1 },
                            { label: "This year", y: fyThisYear },
                            { label: "Next year", y: fyThisYear + 1 },
                          ].map((q) => {
                            const on = fyYear === q.y;
                            return (
                              <TouchableOpacity
                                key={q.label}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                onPress={() => { setFyViewYear(q.y); setFyMsg(null); }}
                                style={[styles.fySegBtn, on && { backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
                              >
                                <Text style={[styles.fyQuickText, { color: on ? colors.foreground : colors.mutedForeground }]}>{q.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        <View style={{ gap: 6 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
                            <Text style={[styles.fySub, { color: colors.mutedForeground }]}>
                              {fyViewStatus === "active" ? `Month ${fiscalMonthIndex(fyRangeView)} of 12` : fyViewStatus === "ended" ? "Completed" : "Not started yet"}
                            </Text>
                            <Text style={[styles.fySub, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{fyViewPct.toFixed(0)}%</Text>
                          </View>
                          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
                            <View style={{ width: `${fyViewPct}%`, height: "100%", backgroundColor: fyViewStatus === "ended" ? colors.mutedForeground : colors.primary }} />
                          </View>
                        </View>
                      </View>

                      {/* 2. Figures */}
                      <View style={{ gap: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 4 }}>
                          <Text style={[styles.fySection, { color: colors.foreground }]}>Year summary</Text>
                          <Text style={[styles.fySub, { color: colors.mutedForeground }]}>
                            {fyFigures.count === 0 ? "No transactions yet" : `${fyFigures.count} ${fyFigures.count === 1 ? "transaction" : "transactions"}`}
                          </Text>
                        </View>
                        <View style={[styles.fyStats, { borderColor: colors.border }]}>
                          {[
                            { label: "Income", value: `${settings.currency || "PKR"} ${fyFigures.income.toLocaleString()}`, color: colors.income },
                            { label: "Expenses", value: `${settings.currency || "PKR"} ${fyFigures.expenses.toLocaleString()}`, color: colors.expense },
                            { label: "Net", value: `${fyFigures.net >= 0 ? "+" : "-"}${settings.currency || "PKR"} ${Math.abs(fyFigures.net).toLocaleString()}`, color: fyFigures.net >= 0 ? colors.income : colors.expense },
                          ].map((r, i) => (
                            <View key={r.label} style={[styles.fyStat, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
                              <Text style={[styles.fySub, { color: colors.mutedForeground }]}>{r.label}</Text>
                              <FitText minSize={10} style={[styles.fyVal, { color: i === 2 ? r.color : colors.foreground }]}>{r.value}</FitText>
                            </View>
                          ))}
                        </View>
                      </View>

                      {/* 3. Start month */}
                      <View style={{ gap: 4 }}>
                        <View style={styles.fyControlRow}>
                        <Text style={[styles.fySection, { color: colors.foreground }]}>Year starts in</Text>
                        <select
                          aria-label="Fiscal year start month"
                          disabled={user?.role !== "admin"}
                          value={fyMonth}
                          onChange={(event) => {
                            const month = Number(event.target.value);
                            setFyDraftMonth(month);
                            setFyViewYear(fiscalStartYearFor(new Date(), month));
                            setFyMsg(null);
                          }}
                          style={{ flex: 1, minWidth: 0, maxWidth: 160, height: 34, padding: "0 8px", borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.card, color: colors.foreground, fontFamily: "Inter, sans-serif", fontSize: 12, cursor: user?.role === "admin" ? "pointer" : "default" }}
                        >
                          {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                        </select>
                        </View>
                        <Text style={[styles.fyHint, { color: colors.mutedForeground }]}>
                          {fyMonth === 1 ? "January–December (calendar year)." : `${MONTH_NAMES[fyMonth - 1]}–${MONTH_NAMES[(fyMonth + 10) % 12]}${fyMonth === 7 ? " (Pakistan standard)" : ""}.`}
                        </Text>
                      </View>

                      <View style={styles.fyControlRow}>
                        <Text style={[styles.fySub, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Pages show</Text>
                        <View style={[styles.fySeg, { backgroundColor: colors.muted, flex: 1, maxWidth: 230 }]}>
                          {([["fiscal", "Saved year"], ["all", "All time"]] as const).map(([k, label]) => {
                            const on = scopeMode === k;
                            return (
                              <TouchableOpacity
                                key={k}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                onPress={() => setScopeMode(k)}
                                style={[styles.fySegBtn, on && { backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
                              >
                                <Text numberOfLines={1} style={[styles.fyQuickText, { color: on ? colors.foreground : colors.mutedForeground }]}>{label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                      <Text style={[styles.fyHint, { color: colors.mutedForeground }]}>Saved year applies across pages, reports and payslips.</Text>
                    </ScrollView>

                    {/* Keep Save visible while the controls scroll on short screens. */}
                    <View style={[styles.fyFoot, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                      {fyMsg ? <Text accessibilityLiveRegion="polite" style={[styles.fySub, { color: colors.income, fontFamily: "Inter_600SemiBold" }]}>✓ {fyMsg}</Text> : null}
                      {user?.role === "admin" ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          disabled={fyIsSaved}
                          style={[styles.fySave, { backgroundColor: fyIsSaved ? "transparent" : colors.primary, borderColor: colors.primary, opacity: fyIsSaved ? 0.8 : 1 }]}
                          onPress={async () => {
                            await updateSettings({ fiscalYear: fyRangeView.label, fiscalYearStartMonth: fyMonth });
                            setScopeMode("fiscal");
                            setFyViewYear(null);
                            setFyDraftMonth(null);
                            setFyMsg(`FY ${fyRangeView.label} saved for all pages.`);
                          }}
                        >
                          <Text style={[styles.fyBtnText, { color: fyIsSaved ? colors.primary : "#FFFFFF" }]}>
                            {fyIsSaved ? `✓ FY ${fyRangeView.label} saved` : `Save & apply FY ${fyRangeView.label}`}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={[styles.fyHint, { color: colors.mutedForeground }]}>Only an admin can change the saved fiscal year.</Text>
                      )}
                    </View>
                  </View>
                </View>
              </Modal>

            {/* Connection status */}
            <View style={[styles.infoChip, { borderColor: colors.income + "40", backgroundColor: colors.income + "0F" }]} accessibilityLabel="Online — your data is saved to the cloud automatically">
              <SvgCheckCircle size={15} color={colors.income} />
              {width >= 700 && (
                <Text numberOfLines={1} style={[styles.syncText, { color: colors.income, fontFamily: "Inter_600SemiBold" }]}>Online</Text>
              )}
            </View>

            <View style={[styles.topDivider, { backgroundColor: colors.border }]} />

            {/* Notifications */}
            <TouchableOpacity
              {...ofm("ofmIconbtn")}
              style={[styles.topIconBtn, { position: "relative" }]}
              onPress={() => setNotificationModalVisible(true)}
              accessibilityLabel={unreadNotificationCount > 0 ? `Notifications, ${unreadNotificationCount} unread` : "Notifications"}
              activeOpacity={0.75}
            >
              <SvgBell size={19} color={colors.foreground} />
              {unreadNotificationCount > 0 && (
                <View style={[styles.bellBadge, { borderColor: colors.card }]}>
                  <Text style={styles.bellBadgeText}>{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Theme */}
            <TouchableOpacity
              {...ofm("ofmIconbtn")}
              style={styles.topIconBtn}
              onPress={toggleTheme}
              accessibilityLabel={settings.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {settings.theme === "dark" ? <SvgSun size={19} color={colors.foreground} /> : <SvgMoon size={19} color={colors.foreground} />}
            </TouchableOpacity>

            {/* Profile: avatar + name + role */}
            {width >= 480 && (
              <>
                <View style={[styles.topDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.profileWrap}
                  onPress={() => user?.role === "admin" && navigateToTab("settings")}
                  activeOpacity={user?.role === "admin" ? 0.75 : 1}
                  accessibilityLabel={`Signed in as ${user?.name || user?.email || "user"}, ${user?.role || "admin"}`}
                >
                  <View style={[styles.profileAvatar, { backgroundColor: colors.primary + "1F" }]}>
                    <Text style={[styles.profileAvatarText, { color: colors.primary }]}>
                      {(user?.name || user?.email || "U").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </Text>
                  </View>
                  {width >= 1024 && (
                    <View style={{ maxWidth: 170 }}>
                      <Text numberOfLines={1} style={[styles.profileName, { color: colors.foreground }]}>
                        {user?.name || user?.email?.split("@")[0] || "User"}
                      </Text>
                      <Text numberOfLines={1} style={[styles.profileRole, { color: colors.mutedForeground }]}>
                        {(user?.role || "admin").charAt(0).toUpperCase() + (user?.role || "admin").slice(1)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Dynamic Main Content Tab */}
        {/* What period the pages are showing */}
        {scopeMode === "fiscal" && activeTab !== "settings" && activeTab !== "team" && (
          <View {...ofm("ofmScopeBar")} style={[styles.scopeBar, { backgroundColor: fySavedCount === 0 ? colors.warning + "14" : colors.primary + "0C", borderBottomColor: colors.border }]}>
            <SvgCalendar size={14} color={fySavedCount === 0 ? colors.warning : colors.primary} />
            <Text style={[styles.scopeText, { color: colors.foreground, flexShrink: 1 }]}>
              Showing <Text style={{ fontFamily: "Inter_600SemiBold" }}>FY {fyRangeSaved.label}</Text>
              <Text style={{ color: colors.mutedForeground }}> · {fyDate(fyRangeSaved.start)} – {fyDate(fyRangeSaved.end)}</Text>
              {fySavedCount === 0 ? <Text style={{ color: colors.warning }}> · no records in this fiscal year yet</Text> : <Text style={{ color: colors.mutedForeground }}> · {fySavedCount} {fySavedCount === 1 ? "transaction" : "transactions"}</Text>}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginLeft: "auto", maxWidth: "100%" }}>
              {fySavedYear !== fyCurrentYear && user?.role === "admin" && (
                <TouchableOpacity
                  style={[styles.scopeBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
                  onPress={() => updateSettings({ fiscalYear: fiscalRange(fyCurrentYear, fyStartMonthSaved).label, fiscalYearStartMonth: fyStartMonthSaved })}
                >
                  <Text style={[styles.scopeBtnText, { color: "#FFFFFF" }]}>Go to this year ({fiscalRange(fyCurrentYear, fyStartMonthSaved).label})</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.scopeBtn, { borderColor: colors.border }]} onPress={() => setScopeMode("all")}>
                <Text style={[styles.scopeBtnText, { color: colors.foreground }]}>Show all time</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.scopeBtn, { borderColor: colors.border }]} onPress={() => setFyOpen(true)}>
                <Text style={[styles.scopeBtnText, { color: colors.primary }]}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {scopeMode === "all" && activeTab !== "settings" && activeTab !== "team" && (
          <View {...ofm("ofmScopeBar")} style={[styles.scopeBar, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
            <SvgCalendar size={14} color={colors.mutedForeground} />
            <Text style={[styles.scopeText, { color: colors.foreground, flexShrink: 1 }]}>
              Showing <Text style={{ fontFamily: "Inter_600SemiBold" }}>all time</Text>
              <Text style={{ color: colors.mutedForeground }}> · every record, not limited to a fiscal year</Text>
            </Text>
            <TouchableOpacity style={[styles.scopeBtn, { borderColor: colors.border, marginLeft: "auto" }]} onPress={() => setScopeMode("fiscal")}>
              <Text style={[styles.scopeBtnText, { color: colors.primary }]}>Show FY {fyRangeSaved.label} only</Text>
            </TouchableOpacity>
          </View>
        )}

        <View {...ofm("ofmContentArea")} style={[styles.tabContentArea, isMobile && { paddingBottom: 84 }]}>
          <WebLayoutContext.Provider value={Math.min(workspaceWidth || availableWidth, availableWidth)}>
          <FiscalScopeProvider mode={scopeMode}>
          <WebPageTransition pageKey={activeTab}>
            <TabErrorBoundary tabKey={activeTab}>
              {shownTab === "dashboard" && (
                <WebDashboard
                  onNavigate={(route) => navigateToTab(route as WebTabKey)}
                  onOpenTransactionModal={handleOpenTx}
                  onOpenBudgetModal={() => setBudgetModalVisible(true)}
                />
              )}
              {shownTab === "income" && (
                <WebIncome onOpenReport={() => navigateToTab("reports")} />
              )}
              {shownTab === "expenses" && (
                <WebExpenses onOpenReport={() => navigateToTab("reports")} />
              )}
              {shownTab === "transactions" && (
                <WebTransactions />
              )}
              {shownTab === "budgets" && (
                <WebBudgets />
              )}
              {shownTab === "departments" && (
                <WebDepartments />
              )}
              {shownTab === "payroll" && (
                <WebPayroll />
              )}
              {shownTab === "team" && (
                <WebTeam />
              )}
              {shownTab === "reports" && (
                <WebReports onNavigate={(route) => navigateToTab(route as WebTabKey)} />
              )}
              {shownTab === "ai-insights" && (
                <WebAIInsights onNavigate={(route) => navigateToTab(route as WebTabKey)} />
              )}
              {shownTab === "settings" && (
                <WebSettings />
              )}
              {shownTab === null && (
                <View style={styles.noAccessWrap}>
                  <View style={[styles.noAccessIcon, { backgroundColor: colors.warning + "18" }]}>
                    <SvgShield size={26} color={colors.warning} />
                  </View>
                  <Text style={[styles.noAccessTitle, { color: colors.foreground }]}>You don't have access to {requestedLabel}</Text>
                  <Text style={[styles.noAccessText, { color: colors.mutedForeground }]}>
                    Your role ({userRoleLabel}) can't open this page. Ask an admin if you need access.
                  </Text>
                  <TouchableOpacity style={[styles.noAccessBtn, { backgroundColor: colors.primary }]} onPress={() => navigateToTab(homeTab)}>
                    <Text style={styles.noAccessBtnText}>Go to {NAV_ITEMS.find((n) => n.id === homeTab)?.label || "home"}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TabErrorBoundary>
          </WebPageTransition>
          </FiscalScopeProvider>
          </WebLayoutContext.Provider>
        </View>

        {/* ─── NATIVE-APP-STYLE MOBILE BOTTOM NAVIGATION (<768px) ─── */}
        {isMobile && (
          <View
            {...ofm("ofmBottomnav")}
            style={[
              styles.mobileBottomNav,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
              },
            ]}
          >
            {/* 1. Home / Dashboard */}
            {allowedTabs.has("dashboard") && (
            <TouchableOpacity
              {...ofm("ofmBottomnavItem")}
              style={styles.mobileBottomNavItem}
              onPress={() => navigateToTab("dashboard")}
              activeOpacity={0.7}
            >
              <View {...ofm("ofmBottomnavIcon")} style={[styles.bottomNavIconWrap, activeTab === "dashboard" && { backgroundColor: colors.primary + "18" }]}>
                <SvgGrid size={19} color={activeTab === "dashboard" ? colors.primary : colors.mutedForeground} />
              </View>
              <Text
                style={[
                  styles.mobileBottomNavLabel,
                  {
                    color: activeTab === "dashboard" ? colors.primary : colors.mutedForeground,
                    fontFamily: activeTab === "dashboard" ? "Inter_700Bold" : "Inter_500Medium",
                  },
                ]}
              >
                Home
              </Text>
            </TouchableOpacity>
            )}

            {/* 2. Ledger / Transactions */}
            {allowedTabs.has("transactions") && (
            <TouchableOpacity
              {...ofm("ofmBottomnavItem")}
              style={styles.mobileBottomNavItem}
              onPress={() => navigateToTab("transactions")}
              activeOpacity={0.7}
            >
              <View {...ofm("ofmBottomnavIcon")} style={[styles.bottomNavIconWrap, (activeTab === "transactions" || activeTab === "income" || activeTab === "expenses") && { backgroundColor: colors.primary + "18" }]}>
                <SvgList size={19} color={(activeTab === "transactions" || activeTab === "income" || activeTab === "expenses") ? colors.primary : colors.mutedForeground} />
              </View>
              <Text
                style={[
                  styles.mobileBottomNavLabel,
                  {
                    color: (activeTab === "transactions" || activeTab === "income" || activeTab === "expenses") ? colors.primary : colors.mutedForeground,
                    fontFamily: (activeTab === "transactions" || activeTab === "income" || activeTab === "expenses") ? "Inter_700Bold" : "Inter_500Medium",
                  },
                ]}
              >
                Ledger
              </Text>
            </TouchableOpacity>
            )}

            {/* 3. Reports */}
            {allowedTabs.has("reports") && (
            <TouchableOpacity
              {...ofm("ofmBottomnavItem")}
              style={styles.mobileBottomNavItem}
              onPress={() => navigateToTab("reports")}
              activeOpacity={0.7}
            >
              <View {...ofm("ofmBottomnavIcon")} style={[styles.bottomNavIconWrap, activeTab === "reports" && { backgroundColor: colors.primary + "18" }]}>
                <SvgFileText size={19} color={activeTab === "reports" ? colors.primary : colors.mutedForeground} />
              </View>
              <Text
                style={[
                  styles.mobileBottomNavLabel,
                  {
                    color: activeTab === "reports" ? colors.primary : colors.mutedForeground,
                    fontFamily: activeTab === "reports" ? "Inter_700Bold" : "Inter_500Medium",
                  },
                ]}
              >
                Reports
              </Text>
            </TouchableOpacity>
            )}

            {/* 4. Payroll */}
            <TouchableOpacity
              {...ofm("ofmBottomnavItem")}
              style={styles.mobileBottomNavItem}
              onPress={() => navigateToTab("payroll")}
              activeOpacity={0.7}
            >
              <View {...ofm("ofmBottomnavIcon")} style={[styles.bottomNavIconWrap, activeTab === "payroll" && { backgroundColor: colors.primary + "18" }]}>
                <SvgUsers size={19} color={activeTab === "payroll" ? colors.primary : colors.mutedForeground} />
              </View>
              <Text
                style={[
                  styles.mobileBottomNavLabel,
                  {
                    color: activeTab === "payroll" ? colors.primary : colors.mutedForeground,
                    fontFamily: activeTab === "payroll" ? "Inter_700Bold" : "Inter_500Medium",
                  },
                ]}
              >
                {user?.role === "employee" ? "Salary" : "Payroll"}
              </Text>
            </TouchableOpacity>

            {/* 5. More (Opens Mobile Drawer with Budgets, Departments, Team, AI Insights, Settings) */}
            <TouchableOpacity
              {...ofm("ofmBottomnavItem")}
              style={styles.mobileBottomNavItem}
              onPress={() => setMobileDrawerOpen(true)}
              activeOpacity={0.7}
            >
              <View {...ofm("ofmBottomnavIcon")} style={[styles.bottomNavIconWrap, (activeTab !== "dashboard" && activeTab !== "transactions" && activeTab !== "income" && activeTab !== "expenses" && activeTab !== "reports" && activeTab !== "payroll") && { backgroundColor: colors.primary + "18" }]}>
                <SvgLayers size={19} color={(activeTab !== "dashboard" && activeTab !== "transactions" && activeTab !== "income" && activeTab !== "expenses" && activeTab !== "reports" && activeTab !== "payroll") ? colors.primary : colors.mutedForeground} />
              </View>
              <Text
                style={[
                  styles.mobileBottomNavLabel,
                  {
                    color: (activeTab !== "dashboard" && activeTab !== "transactions" && activeTab !== "income" && activeTab !== "expenses" && activeTab !== "reports" && activeTab !== "payroll") ? colors.primary : colors.mutedForeground,
                    fontFamily: (activeTab !== "dashboard" && activeTab !== "transactions" && activeTab !== "income" && activeTab !== "expenses" && activeTab !== "reports" && activeTab !== "payroll") ? "Inter_700Bold" : "Inter_500Medium",
                  },
                ]}
              >
                More
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FiscalScopeProvider mode={scopeMode}>
      {/* Global Quick Transaction Modal */}
      <WebTransactionModal
        visible={txModalVisible}
        onClose={() => setTxModalVisible(false)}
        initialType={txModalType}
      />

      {/* Global Budget Modal */}
      <WebBudgetModal
        visible={budgetModalVisible}
        onClose={() => setBudgetModalVisible(false)}
      />

      </FiscalScopeProvider>

      {/* Global Real-Time Notification Center Modal */}
      {notificationModalVisible && (
        <NotificationCenterModal
          visible={notificationModalVisible}
          onClose={() => setNotificationModalVisible(false)}
          notifications={notifications}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  noAccessWrap: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  noAccessIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  noAccessTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  noAccessText: { fontSize: 13.5, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 420, lineHeight: 20 },
  noAccessBtn: { marginTop: 6, height: 38, paddingHorizontal: 18, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  noAccessBtnText: { color: "#FFFFFF", fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  fyOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.12)" },
  fyHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, flexShrink: 0 },
  fyClose: { width: 36, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  fyScroll: { flexShrink: 1, minHeight: 0 },
  fyBody: { padding: 12, gap: 12 },
  fyControlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  fyCard: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 8 },
  fySeg: { flexDirection: "row", borderRadius: 8, padding: 3, gap: 3 },
  fySegBtn: { flex: 1, height: 30, borderRadius: 6, alignItems: "center", justifyContent: "center", cursor: "pointer" as any },
  fySection: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  fyStats: { flexDirection: "row", borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  fyStat: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 8, gap: 2 },
  fyFoot: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderTopWidth: 1, flexShrink: 0 },
  fySave: { height: 38, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center", cursor: "pointer" as any },
  scopeBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 7, borderBottomWidth: 1, flexWrap: "wrap" },
  scopeText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  scopeBtn: { height: 28, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, justifyContent: "center", cursor: "pointer" as any },
  scopeBtnText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  fyPanel: { borderWidth: 1, borderRadius: 12, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 14 },
  fyDate: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, textAlign: "center" },
  fyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fyStepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingVertical: 8 },
  fyStepBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center", cursor: "pointer" as any },
  fyYearText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  fyQuick: { height: 30, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, justifyContent: "center" },
  fyQuickText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  fyHint: { fontSize: 11.5, fontFamily: "Inter_400Regular", lineHeight: 16 },
  fySub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  fyNotice: { padding: 10, borderRadius: 6 },
  fyTable: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  fyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9 },
  fyVal: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fyBtn: { flex: 1, height: 34, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  fyBtnText: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  accountCard: { flex: 1, borderWidth: 1, borderRadius: 10, overflow: "hidden", paddingTop: 12, paddingHorizontal: 12, gap: 10 },
  roleChip: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, flexShrink: 0 },
  roleChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 38, marginHorizontal: -12, borderTopWidth: 1, cursor: "pointer" as any },
  signOutText: { color: "#F87171", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  root: {
    flex: 1,
    flexDirection: "row",
    height: "100%",
    width: "100%",
    maxWidth: "100vw" as any,
    overflow: "hidden",
  },
  sidebar: {
    height: "100%",
    borderRightWidth: 1,
    display: "flex",
    flexDirection: "column",
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    flexDirection: "row",
  },
  drawerContent: {
    width: 280,
    maxWidth: "90%",
    height: "100%",
    borderRightWidth: 1,
    display: "flex",
    flexDirection: "column",
  },
  brandHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 68,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  brandLogoWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  brandLogoImg: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  brandLogoInitials: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.5,
  },
  brandTitle: {
    fontSize: 15.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  brandSubtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.1,
    marginTop: 1,
  },
  collapseBtn: {
    padding: 6.5,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  navScroll: {
    flex: 1,
  },
  navContent: {
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 12,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
    marginBottom: 2,
    cursor: "pointer" as any,
  },
  navSectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    paddingHorizontal: 15,
    marginTop: 20,
    marginBottom: 6,
    opacity: 0.75,
  },
  navSectionDivider: {
    height: 1,
    marginHorizontal: 14,
    marginVertical: 8,
  },
  navLabel: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  navBadge: {
    minWidth: 24,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  navBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  userFooter: {
    padding: 12,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  userName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  userEmail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  userRole: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  workspace: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  topBar: {
    height: 68,
    zIndex: 40,
    borderBottomWidth: 1,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    minWidth: 0,
  },
  breadcrumbRoot: {
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
  },
  pageTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  breadcrumbSep: {
    fontSize: 13,
    opacity: 0.6,
  },
  breadcrumbCurrent: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  topRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  quickAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
  },
  quickAddText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
  },
  topIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer" as any,
  },
  topDivider: { width: 1, height: 24, marginHorizontal: 6 },
  syncWrap: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 6 },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  infoChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, marginLeft: 4 },
  syncText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  bellBadge: { position: "absolute", top: 3, right: 3, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, backgroundColor: "#D52B1E", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  bellBadgeText: { fontSize: 10.5, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  profileWrap: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8 },
  profileAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  profileName: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  profileRole: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tabContentArea: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  mobileBottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopWidth: 1,
    paddingHorizontal: 4,
    paddingBottom: 2,
    zIndex: 999,
  },
  mobileBottomNavItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 2,
  },
  bottomNavIconWrap: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
  },
  mobileBottomNavLabel: {
    fontSize: 11.5,
  },
});
