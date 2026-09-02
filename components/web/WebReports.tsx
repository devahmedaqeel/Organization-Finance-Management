import React, { useState, useMemo, useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions, Modal, TextInput, Platform } from "react-native";
import { useFinance } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { AreaLineChart } from "@/components/AreaLineChart";
import { DonutChart } from "@/components/DonutChart";
import { HBarChart } from "@/components/HBarChart";
import { RingProgress } from "@/components/RingProgress";
import { NetOperatingBalanceHealthCard } from "@/components/NetOperatingBalanceHealthCard";
import { FinancialDrillDownModal, DrillDownType } from "@/components/FinancialDrillDownModal";
import { DownloadReportModal } from "@/components/DownloadReportModal";
import { openPdfReport } from "@/services/ReportExportService";
import { buildEnterpriseReportData } from "@/services/reportDataService";
import {
  NormalizedPeriod,
  getPresetPeriod,
  createCustomDatePeriod,
  filterTransactionsByPeriod,
  computePeriodMetrics,
  computeNetOperatingBalanceHealth,
  aggregateTransactionsByGranularity,
  getExpenseDistributionInsight,
} from "@/services/DatePeriodService";
import {
  buildAuthoritativeFinancialModel,
} from "@/services/FinancialCalculationEngine";
import { FinancialAnalyticsSuite } from "@/components/analytics/FinancialAnalyticsSuite";
import {
  SvgFileText,
  SvgChart,
  SvgLayers,
  SvgUsers,
  SvgArrowUpRight,
  SvgArrowDownLeft,
  SvgPieChart,
} from "./SvgIcons";

const EXPENSE_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];

interface WebReportsProps {
  onNavigate?: (route: string) => void;
}

const REPORT_PERIOD_PRESETS = [
  { id: "last_7d", label: "1W" },
  { id: "last_14d", label: "2W" },
  { id: "this_month", label: "1M" },
  { id: "last_3m", label: "3M" },
  { id: "last_6m", label: "6M" },
  { id: "this_year", label: "1Y" },
  { id: "all_time", label: "ALL" },
];

export function WebReports({ onNavigate }: WebReportsProps = {}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const { transactions, budgets, payroll, departments } = useFinance();

  const [activeTab, setActiveTab] = useState<"statement" | "analytics" | "departments" | "payroll">("statement");
  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() => getPresetPeriod("last_6m"));
  const [customDateModalVisible, setCustomDateModalVisible] = useState(false);
  const [customStart, setCustomStart] = useState(() => activePeriod.startDate || "2026-01-01");
  const [customEnd, setCustomEnd] = useState(() => activePeriod.endDate || "2026-09-01");
  const [drillDownType, setDrillDownType] = useState<DrillDownType | null>(null);

  const fmt = (n: number) => {
    return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtShort = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return Number(n || 0).toLocaleString();
  };

  // Filtered transactions for the chosen period
  const periodTransactions = useMemo(
    () => filterTransactionsByPeriod(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Period Metrics
  const metrics = useMemo(
    () => computePeriodMetrics(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Authoritative Net Operating Balance Health
  const nobHealth = useMemo(
    () => computeNetOperatingBalanceHealth(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Authoritative Single Source of Truth Financial Calculation Pipeline
  const authFinancialModel = useMemo(() => {
    return buildAuthoritativeFinancialModel(
      transactions,
      budgets,
      activePeriod,
      settings.currency
    );
  }, [transactions, budgets, activePeriod, settings.currency]);

  // Chart aggregated points for AreaLineChart
  const chartPoints = useMemo(
    () => aggregateTransactionsByGranularity(transactions, activePeriod),
    [transactions, activePeriod]
  );

  // Income by category in period
  const incomeByCat = useMemo(() => {
    const map: Record<string, number> = {};
    periodTransactions
      .filter((t) => t.type === "income")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return Object.entries(map).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  }, [periodTransactions]);

  // Expense by category in period
  const expenseByCat = useMemo(() => {
    const map: Record<string, number> = {};
    periodTransactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return Object.entries(map).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  }, [periodTransactions]);

  // Donut Segments for Expense Category Breakdown
  const expenseDonutSegments = useMemo(() => {
    if (expenseByCat.length === 0) {
      return [{ label: "No Expenses in Period", value: 1, color: colors.mutedForeground + "50" }];
    }
    return expenseByCat.map((c, i) => ({
      label: c.category,
      value: c.total,
      color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
    }));
  }, [expenseByCat, colors]);

  // Department matrix in period
  const deptMatrix = useMemo(() => {
    return (departments || []).map((d) => {
      const actualSpend = (periodTransactions || [])
        .filter((t) => t && t.type === "expense" && t.department?.trim().toLowerCase() === d.name?.trim().toLowerCase())
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const ratio = d.budgetAllocated > 0 ? (actualSpend / d.budgetAllocated) * 100 : 0;
      return {
        ...d,
        actualSpend,
        ratio,
        remaining: d.budgetAllocated - actualSpend,
      };
    });
  }, [departments, periodTransactions]);

  const [exportModalVisible, setExportModalVisible] = useState(false);

  const handleExportPDF = async () => {
    const enterpriseData = buildEnterpriseReportData(
      transactions,
      budgets,
      payroll,
      departments,
      {
        period: activePeriod,
        scope: "period",
        reportType: "consolidated_statement",
      },
      {
        organizationName: settings.organizationName || user?.organization || "Organization Finance Management",
        organizationAddress: settings.organizationAddress || "Enterprise Financial Center",
        organizationEmail: settings.organizationEmail || user?.email || "finance@ofm-cloud.com",
        organizationPhone: settings.organizationPhone || "+92-586-444111",
        organizationLogo: settings.organizationLogo || "",
        currency: settings.currency || "PKR",
        fiscalYear: settings.fiscalYear || "2025-2026",
      },
      {
        name: user?.name || user?.email || "Chief Financial Officer",
        email: user?.email || "cfo@ofm.org",
        role: user?.role || "Admin",
        organization: settings.organizationName || user?.organization,
      }
    );
    await openPdfReport(enterpriseData);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("export") === "dossier" || params.get("auto") === "pdf") {
        const reportType = (params.get("reportType") || "consolidated_statement") as any;
        const scope = (params.get("scope") || "period") as any;
        const dept = params.get("dept") || "all";
        const startDate = params.get("startDate") || undefined;
        const endDate = params.get("endDate") || undefined;

        setTimeout(() => {
          const enterpriseData = buildEnterpriseReportData(
            transactions,
            budgets,
            payroll,
            departments,
            {
              period: activePeriod,
              scope,
              reportType,
              department: dept,
              startDate,
              endDate,
            },
            {
              organizationName: settings.organizationName || user?.organization || "Organization Finance Management",
              organizationAddress: settings.organizationAddress || "Enterprise Financial Center",
              organizationEmail: settings.organizationEmail || user?.email || "finance@ofm-cloud.com",
              organizationPhone: settings.organizationPhone || "+92-586-444111",
              organizationLogo: settings.organizationLogo || "",
              currency: settings.currency || "PKR",
              fiscalYear: settings.fiscalYear || "2025-2026",
            },
            {
              name: user?.name || user?.email || "Chief Financial Officer",
              email: user?.email || "cfo@ofm.org",
              role: user?.role || "Admin",
              organization: settings.organizationName || user?.organization,
            }
          );
          openPdfReport(enterpriseData);
        }, 700);
      }
    }
  }, [transactions, budgets, payroll, departments, activePeriod, settings, user]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.primary + "20" }]}>
              <SvgFileText size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Financial Auditing & Reports</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                {settings.organizationName || "Organization Finance Management"} · Institutional Statement & Compliance Engine
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, width: isMobile ? "100%" : "auto", marginTop: isMobile ? 8 : 0 }}>
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: colors.border, backgroundColor: colors.card, flex: isMobile ? 1 : undefined }]}
            onPress={() => setExportModalVisible(true)}
            activeOpacity={0.8}
          >
            <SvgLayers size={14} color={colors.foreground} />
            <Text style={[styles.outlineBtnText, { color: colors.foreground, fontSize: isMobile ? 11.5 : 13 }]} numberOfLines={1}>Export Custom</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: isMobile ? 1 : undefined }]}
            onPress={handleExportPDF}
            activeOpacity={0.8}
          >
            <SvgFileText size={14} color="#FFFFFF" />
            <Text style={[styles.primaryBtnText, { fontSize: isMobile ? 11.5 : 13 }]} numberOfLines={1}>Full Dossier (PDF)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Dedicated Period & Audit Scope Toolbar ─── */}
      <View style={[styles.scopeToolbar, { backgroundColor: colors.card, borderColor: colors.border }, isMobile && { flexDirection: "column", alignItems: "stretch", gap: 10, padding: 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_800ExtraBold", color: colors.mutedForeground, letterSpacing: 0.5 }}>
            AUDIT SCOPE:
          </Text>

          {/* Active Range Scope Tag */}
          <View style={[styles.activeScopeTag, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.primary }} />
            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              Scope: {activePeriod.label}
            </Text>
            <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>
              ({periodTransactions.length} records)
            </Text>
          </View>
        </View>

        {/* Quick Period Selector Pills with Horizontal ScrollView */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={[styles.periodPillsContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {REPORT_PERIOD_PRESETS.map((p) => {
              const isSelected = activePeriod.presetId === p.id || (activePeriod.presetId !== "custom" && activePeriod.label.includes(p.label));
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setActivePeriod(getPresetPeriod(p.id))}
                  style={[
                    styles.periodPill,
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.periodPillText,
                      { color: isSelected ? "#FFFFFF" : colors.mutedForeground },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Custom Range Button */}
            <TouchableOpacity
              onPress={() => {
                setCustomStart(activePeriod.startDate || "2026-01-01");
                setCustomEnd(activePeriod.endDate || "2026-09-01");
                setCustomDateModalVisible(true);
              }}
              style={[
                styles.periodPill,
                activePeriod.presetId === "custom" && { backgroundColor: colors.primary },
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.periodPillText,
                  { color: activePeriod.presetId === "custom" ? "#FFFFFF" : colors.mutedForeground },
                ]}
              >
                📅 Custom Date Range
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* ─── Executive Period KPIs ─── */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>PERIOD REVENUE (INFLOWS)</Text>
          <Text style={[styles.metricValue, { color: colors.income }]}>
            +{settings.currency} {fmtShort(metrics.totalIncome)}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {incomeByCat.length} Revenue Streams
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>PERIOD EXPENDITURE (OUTFLOWS)</Text>
          <Text style={[styles.metricValue, { color: colors.expense }]}>
            -{settings.currency} {fmtShort(metrics.totalExpense)}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {expenseByCat.length} Expense Categories
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>NET OPERATING SURPLUS</Text>
          <Text style={[styles.metricValue, { color: metrics.netBalance >= 0 ? colors.income : colors.expense }]}>
            {metrics.netBalance >= 0 ? "+" : "-"}
            {settings.currency} {fmtShort(Math.abs(metrics.netBalance))}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {metrics.totalIncome > 0 ? `${((metrics.netBalance / metrics.totalIncome) * 100).toFixed(1)}% Net Margin` : "Operating Surplus"}
          </Text>
        </View>
      </View>

      {/* ─── Sub-Tab Navigation Bar ─── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { id: "statement", label: "Executive Statement", icon: SvgFileText },
            { id: "analytics", label: "Financial Trends", icon: SvgChart },
            { id: "departments", label: "Department Matrix", icon: SvgLayers },
            { id: "payroll", label: "Payroll Audit", icon: SvgUsers },
          ].map((tab) => {
            const IconComp = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tabBtn,
                  isActive && { backgroundColor: colors.primary, borderColor: "transparent" },
                ]}
                onPress={() => setActiveTab(tab.id as any)}
                activeOpacity={0.8}
              >
                <IconComp size={14} color={isActive ? "#FFFFFF" : colors.mutedForeground} />
                <Text style={[styles.tabBtnText, { color: isActive ? "#FFFFFF" : colors.foreground }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* ─── Tab Content ─── */}
      {activeTab === "statement" && (
        <View style={{ gap: 16 }}>
          {/* Income & Expense Breakdown Statement */}
          <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={[styles.panelTitle, { color: colors.foreground }]}>Income & Expenditure Statement</Text>
                <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
                  Comprehensive statement for {activePeriod.label}
                </Text>
              </View>
            </View>

            {/* Income Streams */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionHeading, { color: colors.income }]}>REVENUE & INFLOWS</Text>
              {incomeByCat.map((item) => (
                <View key={item.category} style={[styles.statementRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.statementLabel, { color: colors.foreground }]}>{item.category}</Text>
                  <Text style={[styles.statementAmount, { color: colors.income }]}>
                    +{settings.currency} {fmt(item.total)}
                  </Text>
                </View>
              ))}
              <View style={[styles.statementTotalRow, { backgroundColor: colors.income + "12", borderColor: colors.income + "30" }]}>
                <Text style={[styles.statementTotalLabel, { color: colors.income }]}>Total Inflows</Text>
                <Text style={[styles.statementTotalVal, { color: colors.income }]}>
                  +{settings.currency} {fmt(metrics.totalIncome)}
                </Text>
              </View>
            </View>

            {/* Expense Streams */}
            <View style={{ gap: 8, marginTop: 12 }}>
              <Text style={[styles.sectionHeading, { color: colors.expense }]}>OPERATIONAL EXPENDITURE & OUTFLOWS</Text>
              {expenseByCat.map((item) => (
                <View key={item.category} style={[styles.statementRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.statementLabel, { color: colors.foreground }]}>{item.category}</Text>
                  <Text style={[styles.statementAmount, { color: colors.expense }]}>
                    -{settings.currency} {fmt(item.total)}
                  </Text>
                </View>
              ))}
              <View style={[styles.statementTotalRow, { backgroundColor: colors.expense + "12", borderColor: colors.expense + "30" }]}>
                <Text style={[styles.statementTotalLabel, { color: colors.expense }]}>Total Outflows</Text>
                <Text style={[styles.statementTotalVal, { color: colors.expense }]}>
                  -{settings.currency} {fmt(metrics.totalExpense)}
                </Text>
              </View>
            </View>

            {/* Net Surplus Footer */}
            <View style={[styles.netSurplusBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.netSurplusLabel, { color: colors.foreground }]}>NET OPERATING SURPLUS / (DEFICIT)</Text>
              <Text
                style={[
                  styles.netSurplusValue,
                  { color: metrics.netBalance >= 0 ? colors.income : colors.expense },
                ]}
              >
                {metrics.netBalance >= 0 ? "+" : "-"}
                {settings.currency} {fmt(Math.abs(metrics.netBalance))}
              </Text>
            </View>
          </View>
        </View>
      )}

      {activeTab === "analytics" && (
        <View style={{ gap: 16 }}>
          {/* Authoritative 3-Card Financial Analytics Suite */}
          <FinancialAnalyticsSuite
            budget={authFinancialModel.budget}
            margin={authFinancialModel.margin}
            distribution={authFinancialModel.distribution}
            currency={settings.currency}
            onOpenDrillDown={(type) => setDrillDownType(type)}
          />

          {/* Historical Trend Curve */}
          <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={[styles.panelTitle, { color: colors.foreground }]}>Period Trend Timeline</Text>
                <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
                  Historical income vs expense cash flow ({activePeriod.label})
                </Text>
              </View>
            </View>

            <AreaLineChart
              data={chartPoints}
              width={isMobile ? width - 40 : 880}
              height={190}
              currency={settings.currency}
              activePeriod={activePeriod}
              onPeriodSelect={(p) => setActivePeriod(p)}
              transactions={transactions}
              userId={user?.id || "default"}
            />
          </View>

          {/* Expense Category Donut */}
          <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={[styles.panelTitle, { color: colors.foreground }]}>Category Expense Distribution</Text>
                <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
                  Proportional breakdown of disbursements
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDrillDownType("expense")}>
                <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>View Outflows →</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingVertical: 10 }}>
              <DonutChart
                segments={expenseDonutSegments}
                size={isMobile ? 140 : 180}
                strokeWidth={isMobile ? 14 : 18}
                centerLabel={`${settings.currency} ${fmtShort(metrics.totalExpense)}`}
                centerSub="Total Spent"
                currency={settings.currency}
                showChips={true}
              />
            </View>
          </View>
        </View>
      )}

      {activeTab === "departments" && (
        <View style={{ gap: 16 }}>
          <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={[styles.panelTitle, { color: colors.foreground }]}>Department Spending Audit</Text>
                <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
                  Actual spend against allocated budget ceilings
                </Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              {deptMatrix.map((dept) => (
                <View key={dept.id} style={[styles.deptAuditCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.deptAuditName, { color: colors.foreground }]}>{dept.name}</Text>
                    <Text style={[styles.deptAuditRatio, { color: dept.ratio > 100 ? colors.expense : dept.ratio > 80 ? colors.warning : colors.income }]}>
                      {dept.ratio.toFixed(1)}% Used
                    </Text>
                  </View>
                  <View style={[styles.deptTrack, { backgroundColor: colors.border, marginTop: 4 }]}>
                    <View
                      style={[
                        styles.deptFill,
                        {
                          width: `${Math.min(Math.round(dept.ratio), 100)}%`,
                          backgroundColor: dept.ratio > 100 ? colors.expense : dept.ratio > 80 ? colors.warning : colors.income,
                        },
                      ]}
                    />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                    <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
                      Spent: {settings.currency} {dept.actualSpend.toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
                      Budget: {settings.currency} {dept.budgetAllocated.toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {activeTab === "payroll" && (
        <View style={{ gap: 16 }}>
          <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={[styles.panelTitle, { color: colors.foreground }]}>Institutional Payroll Disbursals</Text>
                <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
                  Monthly staff compensation breakdown
                </Text>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              {payroll.map((p) => {
                const net = (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0);
                return (
                  <View key={p.id} style={[styles.deptAuditCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View>
                        <Text style={[styles.deptAuditName, { color: colors.foreground }]}>{p.employeeName}</Text>
                        <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>{p.employeeId} · {p.department}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#8B5CF6" }}>
                        {settings.currency} {net.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* ─── Custom Date Range Modal ─── */}
      <Modal visible={customDateModalVisible} transparent animationType="fade" onRequestClose={() => setCustomDateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.customDateSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.customDateHeader}>
              <View>
                <Text style={[styles.customDateTitle, { color: colors.foreground }]}>Select Custom Date Period</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  Filter transactions, statement analytics & PDF reports by exact date range
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCustomDateModalVisible(false)}>
                <Text style={{ fontSize: 18, color: colors.mutedForeground, fontWeight: "700" }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20, gap: 16 }}>
              {/* Quick Presets Shortcut row */}
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: colors.foreground, textTransform: "uppercase" }}>Quick Shortcuts</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[
                  { label: "This Month (Sep)", start: "2026-09-01", end: "2026-09-30" },
                  { label: "Last Month (Aug)", start: "2026-08-01", end: "2026-08-31" },
                  { label: "Q3 2026", start: "2026-07-01", end: "2026-09-30" },
                  { label: "Q2 2026", start: "2026-04-01", end: "2026-06-30" },
                  { label: "Full Year 2026", start: "2026-01-01", end: "2026-12-31" },
                  { label: "All Records", start: "2024-01-01", end: "2026-12-31" },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.label}
                    onPress={() => {
                      setCustomStart(s.start);
                      setCustomEnd(s.end);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: colors.background,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Start Date & End Date Inputs */}
              <View style={{ flexDirection: "row", gap: 14 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>Start Date (From)</Text>
                  <TextInput
                    value={customStart}
                    onChangeText={setCustomStart}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground}
                    style={{
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      color: colors.foreground,
                      fontSize: 14,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  />
                </View>

                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>End Date (To)</Text>
                  <TextInput
                    value={customEnd}
                    onChangeText={setCustomEnd}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground}
                    style={{
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      color: colors.foreground,
                      fontSize: 14,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  />
                </View>
              </View>

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={() => setCustomDateModalVisible(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const customPeriod = createCustomDatePeriod(customStart, customEnd);
                    setActivePeriod(customPeriod);
                    setCustomDateModalVisible(false);
                  }}
                  style={{
                    flex: 2,
                    backgroundColor: colors.primary,
                    paddingVertical: 12,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 13.5, fontWeight: "700", color: "#FFFFFF" }}>Apply Date Range</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Level 3 Comprehensive Financial Drill-Down Modal ─── */}
      {drillDownType !== null && (
        <FinancialDrillDownModal
          visible={drillDownType !== null}
          type={drillDownType || "expense"}
          onClose={() => setDrillDownType(null)}
          currency={settings.currency}
          period={activePeriod}
          transactions={transactions}
          budgets={budgets}
          departments={departments}
          nobHealth={nobHealth}
          onNavigate={onNavigate}
        />
      )}

      {/* ─── Enterprise Export Modal ─── */}
      <DownloadReportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        activePeriod={activePeriod}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  customDateSheet: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  customDateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.15)",
  },
  customDateTitle: {
    fontSize: 16,
    fontFamily: "Inter_800ExtraBold",
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 20,
    paddingBottom: 60,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 14,
  },
  titleIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  outlineBtnText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  scopeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    flexWrap: "wrap",
  },
  activeScopeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
  },
  periodPillsContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    gap: 3,
  },
  periodPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  periodPillText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 200,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  metricLabel: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
    marginVertical: 2,
  },
  metricSub: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },
  tabBar: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    flexWrap: "nowrap",
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabBtnText: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
  panelCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
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
    letterSpacing: -0.2,
  },
  panelSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  statementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  statementLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  statementAmount: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  statementTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  statementTotalLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  statementTotalVal: {
    fontSize: 14,
    fontFamily: "Inter_800ExtraBold",
  },
  netSurplusBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  netSurplusLabel: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.2,
  },
  netSurplusValue: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
  },
  deptAuditCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  deptAuditName: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  deptAuditRatio: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  deptTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  deptFill: {
    height: "100%",
    borderRadius: 3,
  },
});
