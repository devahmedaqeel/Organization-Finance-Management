import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
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
} from "./SvgIcons";

import { WebDashboard } from "./WebDashboard";
import { WebAuth } from "./WebAuth";
import { OpenInAppBanner } from "./OpenInAppBanner";

// Code-split secondary tabs so startup only parses the Dashboard shell
const WebIncome = lazy(() => import("./WebIncome").then((m) => ({ default: m.WebIncome })));
const WebExpenses = lazy(() => import("./WebExpenses").then((m) => ({ default: m.WebExpenses })));
const WebTransactions = lazy(() => import("./WebTransactions").then((m) => ({ default: m.WebTransactions })));
const WebBudgets = lazy(() => import("./WebBudgets").then((m) => ({ default: m.WebBudgets })));
const WebDepartments = lazy(() => import("./WebDepartments").then((m) => ({ default: m.WebDepartments })));
const WebPayroll = lazy(() => import("./WebPayroll").then((m) => ({ default: m.WebPayroll })));
const WebTeam = lazy(() => import("./WebTeam").then((m) => ({ default: m.WebTeam })));
const WebReports = lazy(() => import("./WebReports").then((m) => ({ default: m.WebReports })));
const WebAIInsights = lazy(() => import("./WebAIInsights").then((m) => ({ default: m.WebAIInsights })));
const WebSettings = lazy(() => import("./WebSettings").then((m) => ({ default: m.WebSettings })));

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

import { WebTransactionModal } from "./modals/WebTransactionModal";
import { WebBudgetModal } from "./modals/WebBudgetModal";
import { WebPageTransition } from "./animations/WebPageTransition";
import { injectWebMicroAnimations } from "./animations/webStyles";
import { useEdgeSwipeBack } from "./navigation/useEdgeSwipeBack";
import { EdgeSwipeVisualIndicator } from "./navigation/EdgeSwipeVisualIndicator";

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
  const lower = raw.toLowerCase().trim();
  if (TAB_ALIASES[lower]) return TAB_ALIASES[lower];
  if (VALID_TABS.includes(lower as WebTabKey)) return lower as WebTabKey;
  return "dashboard";
}

export function WebShell() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1080;

  const { user, logout } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { transactions, budgets, departments, payroll } = useFinance();

  const [activeTab, setActiveTab] = useState<WebTabKey>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isTablet);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

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
      if (rawTab) {
        const normalized = normalizeWebTab(rawTab);
        setActiveTab(normalized);
        setTabHistory(["dashboard", normalized]);
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

  // If unauthenticated or after logout on Web, present the Web Sign In & Create Account screen
  if (!user) {
    return <WebAuth />;
  }

  const canEdit = user?.role === "admin" || user?.role === "accountant";
  const hasCustomLogo = Boolean(settings?.organizationLogo && settings.organizationLogo.trim());

  const incomeCount = transactions.filter((t) => t.type === "income").length;
  const expenseCount = transactions.filter((t) => t.type === "expense").length;

  const NAV_ITEMS: NavItem[] = [
    { id: "dashboard", label: user?.role === "employee" ? "Employee Portal" : "Dashboard", icon: "grid" },
    { id: "income", label: "Income & Grants", icon: "arrow-up-right", badge: incomeCount, badgeColor: colors.income, roleRestriction: ["admin", "accountant"] },
    { id: "expenses", label: "Expenses", icon: "arrow-down-left", badge: expenseCount, badgeColor: colors.expense, roleRestriction: ["admin", "accountant", "manager"] },
    { id: "transactions", label: "Transactions", icon: "list", roleRestriction: ["admin", "accountant", "manager"] },
    { id: "budgets", label: "Budget Allocations", icon: "pie-chart", badge: budgets.length, roleRestriction: ["admin", "accountant", "manager"] },
    { id: "departments", label: "Departments", icon: "layers", badge: departments.length, roleRestriction: ["admin", "accountant", "manager"] },
    { id: "payroll", label: user?.role === "employee" ? "My Salary Slip" : "Staff Payroll", icon: "users", badge: user?.role === "employee" ? undefined : payroll.length, roleRestriction: ["admin", "accountant", "manager", "employee"] },
    { id: "team", label: "Team & Permissions", icon: "shield", roleRestriction: ["admin"] },
    { id: "reports", label: "Financial Reports", icon: "file-text", roleRestriction: ["admin", "accountant", "manager"] },
    { id: "ai-insights", label: "AI Insights", icon: "cpu", roleRestriction: ["admin", "manager"] },
    { id: "settings", label: "Settings", icon: "settings", roleRestriction: ["admin"] },
  ];

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
      <View style={{ gap: 4 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const isAllowed = !item.roleRestriction || (user && item.roleRestriction.includes(user.role));
          if (!isAllowed) return null;

          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.navItem,
                (!isDrawer && sidebarCollapsed) && {
                  justifyContent: "center",
                  paddingHorizontal: 0,
                  alignItems: "center",
                  borderLeftWidth: 0,
                  borderRadius: 10,
                  height: 42,
                },
                isActive && {
                  backgroundColor: colors.primary + "16",
                  borderLeftColor: (!isDrawer && sidebarCollapsed) ? "transparent" : colors.primary,
                },
              ]}
              onPress={() => {
                navigateToTab(item.id);
                if (isDrawer) setMobileDrawerOpen(false);
              }}
              title={(!isDrawer && sidebarCollapsed) ? item.label : undefined}
              activeOpacity={0.7}
            >
              {renderNavIcon(item.icon, 16, isActive ? colors.primary : colors.mutedForeground)}
              {(isDrawer || !sidebarCollapsed) && (
                <Text
                  style={[
                    styles.navLabel,
                    {
                      color: isActive ? colors.primary : colors.foreground,
                      fontFamily: isActive ? "Inter_700Bold" : "Inter_500Medium",
                    },
                  ]}
                >
                  {item.label}
                </Text>
              )}

              {Boolean(item.badge) && (!isDrawer && sidebarCollapsed ? null : (
                <View style={[styles.navBadge, { backgroundColor: item.badgeColor || colors.muted }]}>
                  <Text style={styles.navBadgeText}>{item.badge}</Text>
                </View>
              ))}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Mobile Edge Swipe Back Visual Indicator */}
      <EdgeSwipeVisualIndicator isSwiping={isSwiping} progress={swipeProgress} />

      {/* ─── DESKTOP / TABLET SIDEBAR ─── */}
      {!isMobile && (
        <View
          style={[
            styles.sidebar,
            {
              width: sidebarCollapsed ? 76 : 260,
              backgroundColor: colors.card,
              borderRightColor: colors.border,
            },
          ]}
        >
          {/* Brand Header */}
          <View
            style={[
              styles.brandHeader,
              { borderBottomColor: colors.border },
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
                    backgroundColor: hasCustomLogo ? "#FFFFFF" : colors.primary,
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
                  <Image
                    source={require("@/assets/images/icon.png")}
                    style={styles.brandLogoImg}
                    resizeMode="cover"
                  />
                )}
              </View>

              {!sidebarCollapsed && (
                <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                  <Text style={[styles.brandTitle, { color: colors.foreground }]} numberOfLines={1}>
                    OFM Cloud
                  </Text>
                  <Text style={[styles.brandSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {settings.organizationName || "Financial Management"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {!isTablet && (
              <TouchableOpacity
                style={[styles.collapseBtn, { borderColor: colors.border }]}
                onPress={() => setSidebarCollapsed(!sidebarCollapsed)}
                title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                activeOpacity={0.7}
              >
                {sidebarCollapsed ? (
                  <SvgChevronRight size={14} color={colors.mutedForeground} />
                ) : (
                  <SvgChevronLeft size={14} color={colors.mutedForeground} />
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
              { borderTopColor: colors.border },
              sidebarCollapsed && { paddingVertical: 14, paddingHorizontal: 4, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 },
            ]}
          >
            {sidebarCollapsed ? (
              <>
                <View
                  style={[styles.userAvatar, { backgroundColor: colors.primary + "20" }]}
                  title={`Logged in as ${user?.name || "User"} (${(user?.role || "admin").toUpperCase()})`}
                >
                  <Text style={[styles.userAvatarText, { color: colors.primary }]}>
                    {(user?.name || "User").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.logoutBtn, { borderColor: colors.border, padding: 8, borderRadius: 8 }]}
                  onPress={logout}
                  title="Log Out"
                  activeOpacity={0.75}
                >
                  <SvgLogOut size={14} color={colors.expense} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <View style={[styles.userAvatar, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={[styles.userAvatarText, { color: colors.primary }]}>
                      {(user?.name || "User").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
                      {user?.name || "Admin"}
                    </Text>
                    <Text style={[styles.userRole, { color: colors.mutedForeground }]}>
                      {(user?.role || "admin").toUpperCase()}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.logoutBtn, { borderColor: colors.border }]}
                  onPress={logout}
                  title="Log Out"
                  activeOpacity={0.75}
                >
                  <SvgLogOut size={15} color={colors.expense} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {/* ─── MOBILE DRAWER MODAL (<768px) ─── */}
      {isMobile && (
        <Modal visible={mobileDrawerOpen} transparent animationType="fade" onRequestClose={() => setMobileDrawerOpen(false)}>
          <View style={styles.drawerBackdrop}>
            <View style={[styles.drawerContent, { backgroundColor: colors.card, borderRightColor: colors.border }]}>
              {/* Drawer Brand Header */}
              <View style={[styles.brandHeader, { borderBottomColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                  <View
                    style={[
                      styles.brandLogoWrap,
                      {
                        backgroundColor: hasCustomLogo ? "#FFFFFF" : colors.primary,
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
                      <Text style={styles.brandLogoInitials}>
                        {(settings.organizationName || "OFM")
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((w) => w[0] || "")
                          .join("")
                          .toUpperCase() || "OFM"}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.brandTitle, { color: colors.foreground }]}>
                      Organization Finance Management
                    </Text>
                    <Text style={[styles.brandSubtitle, { color: colors.mutedForeground }]}>
                      {settings.organizationName || "Enterprise Financial System"}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={[styles.collapseBtn, { borderColor: colors.border }]} onPress={() => setMobileDrawerOpen(false)}>
                  <SvgX size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              {/* Drawer Links */}
              {renderNavLinks(true)}

              {/* Drawer Footer */}
              <View style={[styles.userFooter, { borderTopColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <View style={[styles.userAvatar, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={[styles.userAvatarText, { color: colors.primary }]}>
                      {(user?.name || "User").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userName, { color: colors.foreground }]}>
                      {user?.name || "Admin"}
                    </Text>
                    <Text style={[styles.userRole, { color: colors.mutedForeground }]}>
                      {(user?.role || "admin").toUpperCase()}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.border }]} onPress={logout}>
                  <SvgLogOut size={15} color={colors.expense} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ─── MAIN APP WORKSPACE ─── */}
      <View style={styles.workspace}>
        {/* Open In Native App Banner for Mobile Browsers */}
        <OpenInAppBanner />

        {/* Top Header Bar */}
        <View style={[styles.topBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
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
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: hasCustomLogo ? "#FFFFFF" : colors.primary,
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
                    <Image
                      source={require("@/assets/images/icon.png")}
                      style={styles.brandLogoImg}
                      resizeMode="cover"
                    />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.breadcrumbCurrent, { color: colors.foreground, fontSize: 14 }]} numberOfLines={1}>
                    {NAV_ITEMS.find((n) => n.id === activeTab)?.label || "Overview"}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 9.5, fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                    {settings.organizationName || "OFM Cloud"}
                  </Text>
                </View>
              </View>
            ) : (
              /* Desktop Breadcrumb Info */
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                <Text style={[styles.breadcrumbRoot, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {settings.organizationName || "OFM"}
                </Text>
                <Text style={[styles.breadcrumbSep, { color: colors.mutedForeground }]}>/</Text>
                <Text style={[styles.breadcrumbCurrent, { color: colors.foreground, flexShrink: 1 }]} numberOfLines={1}>
                  {NAV_ITEMS.find((n) => n.id === activeTab)?.label || "Overview"}
                </Text>
              </View>
            )}
          </View>

          {/* Quick Header Right Actions */}
          <View style={styles.topRightActions}>
            {/* Live 2-Way Cloud Sync Indicator */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: "rgba(16, 185, 129, 0.12)",
                borderColor: "rgba(16, 185, 129, 0.35)",
                borderWidth: 1,
                paddingHorizontal: isMobile ? 7 : 8,
                paddingVertical: 4,
                borderRadius: 14,
                marginRight: isMobile ? 4 : 6,
                flexShrink: 0,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#10B981",
                }}
              />
              <Text
                style={{
                  fontSize: 10.5,
                  fontFamily: "Inter_600SemiBold",
                  color: "#10B981",
                  letterSpacing: 0.2,
                }}
              >
                {isMobile ? "Live" : "Live Cloud"}
              </Text>
            </View>



            {/* Theme Toggle */}
            <TouchableOpacity
              style={[styles.topIconBtn, { borderColor: colors.border }]}
              onPress={toggleTheme}
              title="Toggle Theme"
            >
              {settings.theme === "dark" ? (
                <SvgSun size={16} color={colors.foreground} />
              ) : (
                <SvgMoon size={16} color={colors.foreground} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Dynamic Main Content Tab */}
        <View style={[styles.tabContentArea, isMobile && { paddingBottom: 84 }]}>
          <WebPageTransition pageKey={activeTab}>
            {activeTab === "dashboard" && (
              <WebDashboard
                onNavigate={(route) => navigateToTab(route as WebTabKey)}
                onOpenTransactionModal={handleOpenTx}
                onOpenBudgetModal={() => setBudgetModalVisible(true)}
              />
            )}
            {activeTab === "income" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebIncome onOpenReport={() => navigateToTab("reports")} />
              </Suspense>
            )}
            {activeTab === "expenses" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebExpenses onOpenReport={() => navigateToTab("reports")} />
              </Suspense>
            )}
            {activeTab === "transactions" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebTransactions />
              </Suspense>
            )}
            {activeTab === "budgets" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebBudgets />
              </Suspense>
            )}
            {activeTab === "departments" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebDepartments />
              </Suspense>
            )}
            {activeTab === "payroll" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebPayroll />
              </Suspense>
            )}
            {activeTab === "team" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebTeam />
              </Suspense>
            )}
            {activeTab === "reports" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebReports onNavigate={(route) => navigateToTab(route as WebTabKey)} />
              </Suspense>
            )}
            {activeTab === "ai-insights" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebAIInsights onNavigate={(route) => navigateToTab(route as WebTabKey)} />
              </Suspense>
            )}
            {activeTab === "settings" && (
              <Suspense fallback={<TabLoadingSkeleton />}>
                <WebSettings />
              </Suspense>
            )}
            {!VALID_TABS.includes(activeTab) && (
              <WebDashboard
                onNavigate={(route) => navigateToTab(route as WebTabKey)}
                onOpenTransactionModal={handleOpenTx}
                onOpenBudgetModal={() => setBudgetModalVisible(true)}
              />
            )}
          </WebPageTransition>
        </View>

        {/* ─── NATIVE-APP-STYLE MOBILE BOTTOM NAVIGATION (<768px) ─── */}
        {isMobile && (
          <View
            style={[
              styles.mobileBottomNav,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
              },
            ]}
          >
            {/* 1. Home / Dashboard */}
            <TouchableOpacity
              style={styles.mobileBottomNavItem}
              onPress={() => navigateToTab("dashboard")}
              activeOpacity={0.7}
            >
              <View style={[styles.bottomNavIconWrap, activeTab === "dashboard" && { backgroundColor: colors.primary + "18" }]}>
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

            {/* 2. Ledger / Transactions */}
            <TouchableOpacity
              style={styles.mobileBottomNavItem}
              onPress={() => navigateToTab("transactions")}
              activeOpacity={0.7}
            >
              <View style={[styles.bottomNavIconWrap, (activeTab === "transactions" || activeTab === "income" || activeTab === "expenses") && { backgroundColor: colors.primary + "18" }]}>
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

            {/* 3. Reports */}
            <TouchableOpacity
              style={styles.mobileBottomNavItem}
              onPress={() => navigateToTab("reports")}
              activeOpacity={0.7}
            >
              <View style={[styles.bottomNavIconWrap, activeTab === "reports" && { backgroundColor: colors.primary + "18" }]}>
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

            {/* 4. Payroll */}
            <TouchableOpacity
              style={styles.mobileBottomNavItem}
              onPress={() => navigateToTab("payroll")}
              activeOpacity={0.7}
            >
              <View style={[styles.bottomNavIconWrap, activeTab === "payroll" && { backgroundColor: colors.primary + "18" }]}>
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
              style={styles.mobileBottomNavItem}
              onPress={() => setMobileDrawerOpen(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.bottomNavIconWrap, (activeTab !== "dashboard" && activeTab !== "transactions" && activeTab !== "income" && activeTab !== "expenses" && activeTab !== "reports" && activeTab !== "payroll") && { backgroundColor: colors.primary + "18" }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
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
    height: "100%",
    borderRightWidth: 1,
    display: "flex",
    flexDirection: "column",
  },
  brandHeader: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  brandLogoWrap: {
    width: 36,
    height: 36,
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
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  brandSubtitle: {
    fontSize: 11,
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
    paddingTop: 10,
    paddingBottom: 28,
    paddingHorizontal: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  navLabel: {
    flex: 1,
    fontSize: 13.5,
    letterSpacing: -0.15,
  },
  navBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  navBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
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
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontSize: 14,
    fontFamily: "Inter_800ExtraBold",
  },
  userName: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  userRole: {
    fontSize: 9.5,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginTop: 1,
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
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
    height: 60,
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    minWidth: 0,
  },
  breadcrumbRoot: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.1,
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
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
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
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopWidth: 1,
    paddingHorizontal: 4,
    paddingBottom: 2,
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 16,
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
    fontSize: 10,
    letterSpacing: 0.1,
  },
});
