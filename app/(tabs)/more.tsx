import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
  const { totalIncome, totalExpenses, netBalance, transactions, payroll, departments } = useFinance();
  const { settings } = useSettings();
  const [allTxModal, setAllTxModal] = useState(false);
  const [netBalanceModal, setNetBalanceModal] = useState(false);
  const [statementModal, setStatementModal] = useState(false);
  const selectedCurrency = React.useMemo(
    () => WORLD_CURRENCIES.find((c) => c.code === settings.currency),
    [settings.currency]
  );
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
    Alert.alert("Sign Out", "Are you sure you want to sign out of your organization?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
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
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {user?.name || "Administrator"}
            </Text>
            <View style={[styles.rolePill, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" }]}>
              <Text style={[styles.roleText, { color: colors.primary }]}>{user?.role?.toUpperCase() || "ADMIN"}</Text>
            </View>
          </View>
          <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>
            {user?.email || "admin@ofm.com"}
          </Text>
          <View style={styles.orgRow}>
            <Text style={{ fontSize: 13 }}>{selectedCurrency?.flag ?? "🌐"}</Text>
            <Text style={[styles.profileOrg, { color: colors.mutedForeground }]}>
              {settings.organizationName || "Organization"}
            </Text>
          </View>
        </View>
      </View>

      {/* Feature Modules Grid */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>MANAGEMENT FEATURES</Text>
        <Text style={[styles.sectionCountBadge, { color: colors.mutedForeground }]}>6 Active Modules</Text>
      </View>

      <View style={styles.grid}>
        {FEATURES.filter((f) => {
          if ((f.id === "team" || f.id === "settings") && user?.role !== "admin") return false;
          if ((f.id === "txs" || f.id === "budget" || f.id === "departments" || f.id === "ai") && user?.role === "employee") return false;
          return true;
        }).map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleNavigate(f.route)}
            activeOpacity={0.72}
          >
            <View style={styles.cardTopRow}>
              <View style={[styles.featureIcon, { backgroundColor: f.color + "18" }]}>
                <Feather name={f.icon} size={20} color={f.color} />
              </View>
              <Feather name="arrow-up-right" size={14} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
            </View>
            <Text style={[styles.featureLabel, { color: colors.foreground }]}>{f.label}</Text>
            <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>
              {f.desc}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Interactive Quick Summary Actions (Hidden for Employee) */}
      {user?.role !== "employee" && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FINANCIAL SUMMARY & LEDGERS</Text>
            <Text style={[styles.sectionCountBadge, { color: colors.mutedForeground }]}>Tap row to open</Text>
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
                <View style={[styles.summaryIcon, { backgroundColor: stat.color + "18" }]}>
                  <Feather name={stat.icon} size={16} color={stat.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.summaryLabel, { color: colors.foreground }]}>{stat.label}</Text>
                  <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
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
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        netBalance={netBalance}
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
    marginTop: 6,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  sectionCountBadge: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  featureCard: {
    width: "48.2%",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: { fontSize: 14.5, fontFamily: "Inter_700Bold" },
  featureDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },
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
    width: 36,
    height: 36,
    borderRadius: 10,
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
});
