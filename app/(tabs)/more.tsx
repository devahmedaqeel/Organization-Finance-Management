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
import {
  SvgList, SvgPieChart, SvgLayers, SvgUsers, SvgShield, SvgCpu, SvgActivity, SvgSettings, SvgLogOut, SvgChevronRight,
} from "@/components/web/SvgIcons";
import type { UserRole } from "@/context/AuthContext";

type MenuItem = {
  id: string; section: string; label: string; desc: string; route: string;
  Icon: (p: { size?: number; color?: string }) => React.ReactElement | null;
  color: string; roles: UserRole[]; value?: string; valueColor?: string;
};
const MENU_SECTIONS = ["Finance", "Organization", "Insights", "System"];
const ROLE_LABELS: Record<string, string> = { admin: "Admin", accountant: "Accountant", manager: "Manager", employee: "Employee" };

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



  const webTop = Platform.OS === "web" ? 67 : 0;
  const topSafePad = webTop + insets.top + (Platform.OS === "android" ? 22 : 12);

  const payrollTotal = payroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0);
  const roleLabel = ROLE_LABELS[user?.role || ""] || "Member";
  const initials = (user?.name || "U").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "U";
  const money = (n: number) => `${settings.currency} ${Math.round(Number(n) || 0).toLocaleString()}`;
  const isEmployee = user?.role === "employee";

  // Same sections, names and role rules as the web sidebar (components/web/WebShell.tsx NAV_ITEMS)
  const menu: MenuItem[] = [
    { id: "txs", section: "Finance", label: "Transactions", desc: `${transactions.filter((t) => t.type === "income").length} income · ${transactions.filter((t) => t.type === "expense").length} expenses`, route: "modal:txs", Icon: SvgList, color: colors.info, roles: ["admin", "accountant", "manager"], value: `${transactions.length}` },
    { id: "budgets", section: "Finance", label: "Budgets", desc: "Department limits and spending", route: "/budget", Icon: SvgPieChart, color: colors.warning, roles: ["admin", "accountant", "manager"], value: `${budgets.length}` },
    { id: "departments", section: "Organization", label: "Departments", desc: `${departments.reduce((n, d) => n + (d.headCount || 0), 0)} staff in total`, route: "/departments", Icon: SvgLayers, color: "#0EA5E9", roles: ["admin", "accountant", "manager"], value: `${departments.length}` },
    { id: "payroll", section: "Organization", label: isEmployee ? "My payslips" : "Payroll", desc: isEmployee ? "View and download your payslips" : `${payroll.length} ${payroll.length === 1 ? "payment" : "payments"} · payslips`, route: "/payroll", Icon: SvgUsers, color: "#7C3AED", roles: ["admin", "accountant", "manager", "employee"], value: isEmployee ? undefined : money(payrollTotal) },
    { id: "team", section: "Organization", label: "Team", desc: "Members, roles and invites", route: "/team", Icon: SvgShield, color: colors.primary, roles: ["admin"] },
    { id: "balance", section: "Insights", label: "Net operating balance", desc: `Income ${money(totalIncome)} · Expenses ${money(totalExpenses)}`, route: "modal:balance", Icon: SvgActivity, color: netBalance >= 0 ? colors.income : colors.expense, roles: ["admin", "accountant", "manager"], value: `${netBalance >= 0 ? "+" : "−"}${money(Math.abs(netBalance))}`, valueColor: netBalance >= 0 ? colors.income : colors.expense },
    { id: "ai", section: "Insights", label: "AI Insights", desc: "Smart analysis of your data", route: "/ai-insights", Icon: SvgCpu, color: "#10B981", roles: ["admin", "manager"] },
    { id: "settings", section: "System", label: "Settings", desc: "Company, currency, fiscal year, theme", route: "/settings", Icon: SvgSettings, color: colors.mutedForeground, roles: ["admin"] },
  ];
  const allowed = (m: MenuItem) => !!user && m.roles.includes(user.role);

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
    const item = menu.find((m) => m.route === route);
    if (item && !allowed(item)) {
      Alert.alert("No access", `Your role (${roleLabel}) can't open ${item.label}. Ask an admin if you need access.`);
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


  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: topSafePad,
          paddingBottom: 24, // tab bar is docked and already reserves the bottom inset
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Account ─── */}
      <View style={[styles.mAccount, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.mAvatar, { backgroundColor: settings.organizationLogo ? "#FFFFFF" : colors.primary, borderColor: colors.border, borderWidth: settings.organizationLogo ? 1 : 0 }]}>
          {settings.organizationLogo ? (
            <Image source={{ uri: settings.organizationLogo }} style={styles.mAvatarImg} contentFit="contain" />
          ) : (
            <Text style={styles.mAvatarText}>{initials}</Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.mName, { color: colors.foreground }]} numberOfLines={1}>{user?.name || "Your account"}</Text>
          <Text style={[styles.mEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{user?.email || ""}</Text>
          <View style={styles.mOrgRow}>
            <View style={[styles.mRole, { backgroundColor: colors.primary + "14" }]}>
              <Text style={[styles.mRoleText, { color: colors.primary }]}>{roleLabel}</Text>
            </View>
            <Text style={[styles.mOrg, { color: colors.mutedForeground }]} numberOfLines={2}>
              {settings.organizationName || user?.organization || "Organization"}
            </Text>
          </View>
        </View>
      </View>

      {/* ─── Menu groups (same names, order and role rules as the web sidebar) ─── */}
      {MENU_SECTIONS.map((section) => {
        const items = menu.filter((m) => m.section === section && allowed(m));
        if (!items.length) return null;
        return (
          <View key={section} style={{ gap: 6 }}>
            <Text style={[styles.mSection, { color: colors.mutedForeground }]}>{section}</Text>
            <View style={[styles.mGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {items.map((m, i) => {
                const Icon = m.Icon;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => handleNavigate(m.route)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.label}. ${m.desc}${m.value ? `. ${m.value}` : ""}`}
                    style={[styles.mRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <View style={[styles.mIcon, { backgroundColor: m.color + "14" }]}>
                      <Icon size={18} color={m.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.mLabel, { color: colors.foreground }]} numberOfLines={2}>{m.label}</Text>
                      <Text style={[styles.mDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{m.desc}</Text>
                    </View>
                    {m.value ? (
                      <Text style={[styles.mValue, { color: m.valueColor || colors.mutedForeground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{m.value}</Text>
                    ) : null}
                    <SvgChevronRight size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      {/* ─── Sign out ─── */}
      <View style={[styles.mGroup, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 6 }]}>
        <TouchableOpacity onPress={handleLogout} activeOpacity={0.6} accessibilityRole="button" style={styles.mRow}>
          <View style={[styles.mIcon, { backgroundColor: colors.expense + "12" }]}>
            <SvgLogOut size={18} color={colors.expense} />
          </View>
          <Text style={[styles.mLabel, { color: colors.expense, flex: 1 }]}>Sign out</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.mFoot, { color: colors.mutedForeground }]}>OFM · Organization Finance Management</Text>

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
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
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
  mAccount: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  mAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  mAvatarImg: { width: "100%", height: "100%" },
  mAvatarText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  mName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  mEmail: { fontSize: 12.5, fontFamily: "Inter_400Regular", marginTop: 1 },
  mOrgRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  mRole: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  mRoleText: { fontSize: 11.5, fontFamily: "Inter_600SemiBold" },
  mOrg: { flex: 1, fontSize: 12.5, fontFamily: "Inter_500Medium" },
  mSection: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, textTransform: "uppercase", marginLeft: 4, marginTop: 8 },
  mGroup: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  mRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, minHeight: 60, paddingVertical: 10 },
  mIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  mLabel: { fontSize: 14.5, fontFamily: "Inter_500Medium" },
  mDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  mValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", maxWidth: 130 },
  mFoot: { fontSize: 11.5, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  flex: { flex: 1 },
  container: { paddingHorizontal: 16, gap: 12 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
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
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  profileEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  orgRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  profileOrg: { fontSize: 11, fontFamily: "Inter_500Medium" },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
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
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.7,
  },
  countBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionCountBadge: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  featureCard: {
    width: "48.2%",
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 138,
    justifyContent: "space-between",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  featureCardFull: {
    width: "100%",
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
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
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  featureIconFull: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  cardTagText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  featureLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
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
    width: 26,
    height: 26,
    borderRadius: 13,
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
    borderRadius: 20,
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
  summaryLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  summarySub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
    fontSize: 17,
    fontFamily: "Inter_700Bold",
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
    fontFamily: "Inter_600SemiBold",
  },
});
