import { Feather } from "@/components/UniversalIcon";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { WORLD_CURRENCIES } from "@/constants/currencies";
import { AllTransactionsModal } from "@/components/AllTransactionsModal";
import { NetBalanceBreakdownModal } from "@/components/NetBalanceBreakdownModal";
import { FinancialStatementViewerModal } from "@/components/FinancialStatementViewerModal";
import { ReportOptions } from "@/services/ReportExportService";

const FEATURES = [
  {
    id: "txs",
    label: "All Transactions",
    icon: "list" as const,
    route: "modal:txs",
    color: "#3B82F6",
    desc: "Master general ledger",
    tag: "Ledger",
  },
  {
    id: "budget",
    label: "Budget",
    icon: "pie-chart" as const,
    route: "/budget",
    color: "#F59E0B",
    desc: "Track allocations",
    tag: "Allocations",
  },
  {
    id: "payroll",
    label: "Payroll",
    icon: "dollar-sign" as const,
    route: "/payroll",
    color: "#8B5CF6",
    desc: "Salary management",
    tag: "Salaries",
  },
  {
    id: "departments",
    label: "Departments",
    icon: "layers" as const,
    route: "/departments",
    color: "#0EA5E9",
    desc: "Org structure",
    tag: "Structure",
  },
  {
    id: "team",
    label: "Team Members",
    icon: "users" as const,
    route: "/team",
    color: "#EC4899",
    desc: "Manage staff & roles",
    tag: "Staff",
  },
  {
    id: "ai",
    label: "AI Insights",
    icon: "zap" as const,
    route: "/ai-insights",
    color: "#10B981",
    desc: "Smart analytics",
    tag: "AI Smart",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings" as const,
    route: "/settings",
    color: "#64748B",
    desc: "Org configuration",
    tag: "Config",
  },
];

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { totalIncome, totalExpenses, netBalance, transactions, payroll, departments, budgets, totalAvailableFunds } = useFinance();
  const { settings } = useSettings();
  const [allTxModal, setAllTxModal] = useState(false);
  const [netBalanceModal, setNetBalanceModal] = useState(false);
  const [statementModal, setStatementModal] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const selectedCurrency = React.useMemo(
    () => WORLD_CURRENCIES.find((c) => c.code === settings.currency),
    [settings.currency]
  );

  const visibleFeatures = React.useMemo(() => {
    return FEATURES.filter((f) => {
      if ((f.id === "team" || f.id === "settings") && user?.role !== "admin") return false;
      if ((f.id === "txs" || f.id === "budget" || f.id === "departments" || f.id === "ai") && user?.role === "employee") return false;
      return true;
    });
  }, [user?.role]);

  const webTop = Platform.OS === "web" ? 67 : 0;
  const topSafePad = webTop + insets.top + (Platform.OS === "android" ? 22 : 12);

  const payrollTotal = payroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0);

  const reportOpts: ReportOptions = React.useMemo(() => ({
    organizationName: settings.organizationName || user?.organization || "Organization Finance Management",
    organizationAddress: settings.organizationAddress || "Enterprise Financial Center",
    organizationEmail: settings.organizationEmail || user?.email || "finance@ofm-cloud.com",
    organizationPhone: settings.organizationPhone || "+1 (800) 555-0199",
    organizationLogo: settings.organizationLogo,
    currency: settings.currency,
    fiscalYear: settings.fiscalYear || "2025-2026",
    periodLabel: "Full Fiscal Year Ledger",
    generatedBy: user?.name || user?.email || "Finance Administrator",
    userRole: user?.role,
    totalIncome,
    totalExpenses,
    netBalance,
    budgetUtilization: 0,
    transactions,
    departments,
    payroll,
    budgets: [],
  }), [settings, user, totalIncome, totalExpenses, netBalance, transactions, departments, payroll]);

  const handleLogout = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLogoutModalVisible(true);
  };

  const handleConfirmLogout = async () => {
    try {
      setIsLoggingOut(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLogoutModalVisible(false);
      await logout();
      router.replace("/login");
    } catch {
      setIsLoggingOut(false);
    }
  };

  const handleNavigate = (route: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if ((route === "/team" || route === "/settings") && user?.role !== "admin") {
      Alert.alert("Access Restricted", "Only Organization Administrators have permission to access this module.");
      return;
    }
    if ((route === "/budget" || route === "/departments" || route === "/ai-insights") && user?.role === "employee") {
      Alert.alert("Access Restricted", "Your account clearance level does not include this module.");
      return;
    }
    if (route === "modal:txs") {
      setAllTxModal(true);
      return;
    }
    if (route === "modal:balance") {
      setNetBalanceModal(true);
      return;
    }
    router.push(route as any);
  };

  const summaryStats = [
    {
      id: "txs",
      label: "Total Transactions",
      sub: `${transactions.filter(t => t.type === 'income').length} Inflows · ${transactions.filter(t => t.type === 'expense').length} Outflows`,
      value: `${transactions.length} Records`,
      icon: "list" as const,
      color: colors.primary,
      route: "modal:txs",
    },
    {
      id: "payroll",
      label: "Payroll (This Month)",
      sub: `${payroll.length} Staff members active`,
      value: `${settings.currency} ${(payrollTotal / 1000).toFixed(0)}K`,
      icon: "dollar-sign" as const,
      color: "#8B5CF6",
      route: "/payroll",
    },
    {
      id: "departments",
      label: "Monitored Departments",
      sub: `${departments.reduce((s, d) => s + (d.headCount || 0), 0)} Total employees registered`,
      value: `${departments.length} Depts`,
      icon: "layers" as const,
      color: "#0EA5E9",
      route: "/departments",
    },
    {
      id: "balance",
      label: "Net Operating Balance",
      sub: `Revenue: ${settings.currency} ${(totalIncome / 1000).toFixed(0)}K · Expense: ${settings.currency} ${(totalExpenses / 1000).toFixed(0)}K`,
      value: netBalance >= 0 ? `+${settings.currency} ${(netBalance / 1000).toFixed(0)}K` : `-${settings.currency} ${(Math.abs(netBalance) / 1000).toFixed(0)}K`,
      icon: "trending-up" as const,
      color: netBalance >= 0 ? colors.income : colors.expense,
      route: "modal:balance",
    },
  ];

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: topSafePad,
          paddingBottom: Math.max(insets.bottom, 16) + 100,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* User Institutional Profile Header Card */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: settings.organizationLogo ? "#FFFFFF" : colors.primary,
              borderWidth: settings.organizationLogo ? 1.5 : 0,
              borderColor: colors.border,
              padding: settings.organizationLogo ? 2 : 0,
            },
          ]}
        >
          {settings.organizationLogo ? (
            <Image
              source={{ uri: settings.organizationLogo }}
              style={styles.logoImg}
              contentFit="contain"
            />
          ) : (
            <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() ?? "U"}</Text>
          )}
        </View>
        <View style={styles.profileInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>
              {user?.name || "Administrator"}
            </Text>
            <View style={[styles.rolePill, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" }]}>
              <Text style={[styles.roleText, { color: colors.primary }]}>{user?.role?.toUpperCase() || "ADMIN"}</Text>
            </View>
          </View>
          <Text style={[styles.profileEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
            {user?.email || "admin@ofm.com"}
          </Text>
          <View style={styles.orgRow}>
            <Text style={{ fontSize: 13 }}>{selectedCurrency?.flag ?? "🌐"}</Text>
            <Text style={[styles.profileOrg, { color: colors.mutedForeground, flex: 1 }]} numberOfLines={1}>
              {settings.organizationName || "Organization"}
            </Text>
          </View>
        </View>
      </View>

      {/* Feature Modules Grid */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderTitleWrap}>
          <View style={[styles.sectionAccentDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>MANAGEMENT FEATURES</Text>
        </View>
        <View style={[styles.countBadgePill, { backgroundColor: colors.primary + "16", borderColor: colors.primary + "30" }]}>
          <Text style={[styles.sectionCountBadge, { color: colors.primary }]}>{visibleFeatures.length} Active Modules</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {visibleFeatures.map((f, index) => {
          const isLastOdd = index === visibleFeatures.length - 1 && visibleFeatures.length % 2 === 1;

          if (isLastOdd) {
            return (
              <TouchableOpacity
                key={f.id}
                style={[
                  styles.featureCardFull,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => handleNavigate(f.route)}
                activeOpacity={0.75}
              >
                <View style={styles.cardFullLeft}>
                  <View style={[styles.featureIconFull, { backgroundColor: f.color + "18", borderColor: f.color + "32" }]}>
                    <Feather name={f.icon} size={20} color={f.color} />
                  </View>
                  <View style={styles.cardFullTextWrap}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={[styles.featureLabel, { color: colors.foreground }]}>{f.label}</Text>
                      <View style={[styles.cardTagPill, { backgroundColor: f.color + "16", borderColor: f.color + "32" }]}>
                        <Text style={[styles.cardTagText, { color: f.color }]}>{f.tag}</Text>
                      </View>
                    </View>
                    <Text style={[styles.featureDesc, { color: colors.mutedForeground, marginTop: 2 }]} numberOfLines={1}>
                      {f.id === "settings" ? "Organization configuration, currency & security preferences" : f.desc}
                    </Text>
                  </View>
                </View>
                <View style={[styles.cardFullActionCircle, { backgroundColor: colors.muted + "25" }]}>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={f.id}
              style={[
                styles.featureCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => handleNavigate(f.route)}
              activeOpacity={0.75}
            >
              {/* Top Row: Squircle Icon + Tag Pill */}
              <View style={styles.cardTopRow}>
                <View style={[styles.featureIcon, { backgroundColor: f.color + "18", borderColor: f.color + "30" }]}>
                  <Feather name={f.icon} size={18} color={f.color} />
                </View>
                <View style={[styles.cardTagPill, { backgroundColor: f.color + "16", borderColor: f.color + "30" }]}>
                  <Text style={[styles.cardTagText, { color: f.color }]}>{f.tag}</Text>
                </View>
              </View>

              {/* Title */}
              <Text style={[styles.featureLabel, { color: colors.foreground }]} numberOfLines={1}>
                {f.label}
              </Text>

              {/* Bottom Row: Description + Arrow */}
              <View style={styles.cardBottomRow}>
                <Text style={[styles.featureDesc, { color: colors.mutedForeground, flex: 1 }]} numberOfLines={2}>
                  {f.desc}
                </Text>
                <View style={[styles.cardArrowWrap, { backgroundColor: f.color + "12" }]}>
                  <Feather name="arrow-up-right" size={12} color={f.color} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Interactive Quick Summary Actions (Hidden for Employee) */}
      {user?.role !== "employee" && (
        <>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderTitleWrap}>
              <View style={[styles.sectionAccentDot, { backgroundColor: "#8B5CF6" }]} />
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FINANCIAL SUMMARY & LEDGERS</Text>
            </View>
            <View style={[styles.countBadgePill, { backgroundColor: colors.muted + "20", borderColor: colors.border }]}>
              <Text style={[styles.sectionCountBadge, { color: colors.mutedForeground }]}>Tap row to open</Text>
            </View>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {summaryStats.map((stat, idx) => (
              <TouchableOpacity
                key={stat.id}
                style={[
                  styles.summaryRow,
                  {
                    borderBottomColor: colors.border,
                    borderBottomWidth: idx === summaryStats.length - 1 ? 0 : 1,
                  },
                ]}
                onPress={() => handleNavigate(stat.route)}
                activeOpacity={0.72}
              >
                <View style={[styles.summaryIcon, { backgroundColor: stat.color + "18", borderColor: stat.color + "30" }]}>
                  <Feather name={stat.icon} size={16} color={stat.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.summaryLabel, { color: colors.foreground }]} numberOfLines={1}>{stat.label}</Text>
                  <Text style={[styles.summarySub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {stat.sub}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 3 }}>
                  <Text style={[styles.summaryValue, { color: stat.color }]}>{stat.value}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground }}>View</Text>
                    <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Logout Action Button */}
      <TouchableOpacity
        style={[
          styles.logoutBtn,
          {
            borderColor: colors.expense + "40",
            backgroundColor: colors.expense + "12",
          },
        ]}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Feather name="log-out" size={17} color={colors.expense} />
        <Text style={[styles.logoutText, { color: colors.expense }]}>Sign Out Organization Account</Text>
      </TouchableOpacity>

      <AllTransactionsModal
        visible={allTxModal}
        onClose={() => setAllTxModal(false)}
        transactions={transactions}
      />

      <NetBalanceBreakdownModal
        visible={netBalanceModal}
        onClose={() => setNetBalanceModal(false)}
        transactions={transactions}
        departments={departments}
        budgets={budgets}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        netBalance={netBalance}
        netSurplus={totalAvailableFunds}
        onOpenStatement={() => {
          setNetBalanceModal(false);
          setStatementModal(true);
        }}
      />

      <FinancialStatementViewerModal
        visible={statementModal}
        onClose={() => setStatementModal(false)}
        reportOpts={reportOpts}
      />

      {/* ─── Modern Logout Confirmation Modal ─── */}
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
              Are you sure you want to sign out of{"\n"}
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
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  profileEmail: { fontSize: 11.5, fontFamily: "Inter_400Regular" },
  orgRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  profileOrg: { fontSize: 11, fontFamily: "Inter_500Medium" },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  sectionHeaderTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  sectionAccentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionLabel: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.7,
  },
  countBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionCountBadge: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  featureCard: {
    width: "48.2%",
    padding: 13,
    borderRadius: 16,
    borderWidth: 1.2,
    minHeight: 126,
    justifyContent: "space-between",
  },
  featureCardFull: {
    width: "100%",
    padding: 13,
    borderRadius: 16,
    borderWidth: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  featureIconFull: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTagPill: {
    paddingHorizontal: 6.5,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardTagText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  featureLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 6,
  },
  featureDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
  },
  cardArrowWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFullLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  cardFullTextWrap: {
    flex: 1,
    gap: 2,
  },
  cardFullActionCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    gap: 12,
  },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  summarySub: { fontSize: 10.5, fontFamily: "Inter_400Regular", marginTop: 1 },
  summaryValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
  },
  logoutText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // Modern Logout Confirmation Modal
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
});
