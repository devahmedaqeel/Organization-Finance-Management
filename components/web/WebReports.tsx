import { useWebLayout } from "@/hooks/useWebLayout";
import React, { useState, useMemo, useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, Modal, TextInput, Platform } from "react-native";
import { useFinance, Department } from "@/context/FinanceContext";
import { WebDepartmentStaffModal } from "./modals/WebDepartmentStaffModal";
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
import { Feather } from "@/components/UniversalIcon";
import { openPdfReport, generateFinancialHtmlReport, downloadPdfBinaryDirectly } from "@/services/ReportExportService";
import { buildEnterpriseReportData, EnterpriseReportData, ReportType } from "@/services/reportDataService";
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
  calculateBudgetAllocation,
  calculateUnallocatedFunds,
  calculateDepartmentMetrics,
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
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7d", label: "1W" },
  { id: "this_month", label: "1M" },
  { id: "prev_month", label: "Prev Month" },
  { id: "last_3m", label: "3M" },
  { id: "last_6m", label: "6M" },
  { id: "this_year", label: "1Y" },
  { id: "all_time", label: "ALL" },
];

export function WebReports({ onNavigate }: WebReportsProps = {}) {
  const colors = useColors();
  const { width } = useWebLayout();
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
  const [drillDownDept, setDrillDownDept] = useState<string | undefined>(undefined);
  const [staffModalDept, setStaffModalDept] = useState<Department | null>(null);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [chartContainerWidth, setChartContainerWidth] = useState<number>(0);

  const fmt = (n: number) => {
    return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtShort = (n: number) => {
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
      settings.currency,
      undefined,
      departments
    );
  }, [transactions, budgets, activePeriod, settings.currency, departments]);

  // Authoritative Capital Pool & Unified Surplus
  const totalBudgetAllocated = useMemo(() => {
    return authFinancialModel.budget.totalAllocated || calculateBudgetAllocation(budgets, departments);
  }, [authFinancialModel, budgets, departments]);

  const netCash = useMemo(() => {
    return metrics.totalIncome - metrics.totalExpense;
  }, [metrics.totalIncome, metrics.totalExpense]);

  const unallocatedFunds = useMemo(() => {
    return Math.max(0, netCash - totalBudgetAllocated);
  }, [netCash, totalBudgetAllocated]);

  const netCapitalSurplus = netCash;

  const retainedCapitalPct = useMemo(() => {
    return metrics.totalIncome > 0 ? (Math.max(0, netCash) / metrics.totalIncome) * 100 : 0;
  }, [netCash, metrics.totalIncome]);

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

  // Authoritative Department matrix in period using single calculation engine
  const deptMatrix = useMemo(() => {
    return calculateDepartmentMetrics(departments, transactions, activePeriod, budgets);
  }, [departments, transactions, activePeriod, budgets]);

  // Scoped Payroll strictly respecting active period
  const scopedPayroll = useMemo(() => {
    return (payroll || []).filter((p) => {
      if (!p) return false;
      if (activePeriod.presetId === "all_time") return true;
      if (!p.month) return true;
      const pMonth = p.month.slice(0, 7);
      const startMonth = (activePeriod.startDate || "").slice(0, 7);
      const endMonth = (activePeriod.endDate || "").slice(0, 7);
      if (startMonth && pMonth < startMonth) return false;
      if (endMonth && pMonth > endMonth) return false;
      return true;
    });
  }, [payroll, activePeriod]);

  const payrollTotals = useMemo(() => {
    const totalDisbursed = scopedPayroll.reduce((s, p) => {
      const net = p.netSalary !== undefined ? p.netSalary : (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0);
      return s + (Number(net) || 0);
    }, 0);
    const totalBase = scopedPayroll.reduce((s, p) => s + (Number(p.baseSalary) || 0), 0);
    const totalBonus = scopedPayroll.reduce((s, p) => s + (Number(p.bonus) || 0), 0);
    const totalDeductions = scopedPayroll.reduce((s, p) => s + (Number(p.deductions) || 0), 0);
    return {
      totalDisbursed,
      totalBase,
      totalBonus,
      totalDeductions,
      count: scopedPayroll.length,
    };
  }, [scopedPayroll]);

  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [dossierViewerVisible, setDossierViewerVisible] = useState(false);
  const [dossierHtml, setDossierHtml] = useState<string>("");
  const [activeEnterpriseData, setActiveEnterpriseData] = useState<EnterpriseReportData | null>(null);

  const handleExportPDF = async () => {
    const reportType: ReportType =
      activeTab === "payroll"
        ? "payroll_audit"
        : activeTab === "departments"
        ? "department_analysis"
        : activeTab === "analytics"
        ? "executive_summary"
        : "consolidated_statement";

    const isAllTime = activePeriod.presetId === "all_time";
    const enterpriseData = buildEnterpriseReportData(
      transactions,
      budgets,
      payroll,
      departments,
      {
        period: activePeriod,
        scope: isAllTime ? "all" : "period",
        reportType,
        startDate: activePeriod.startDate,
        endDate: activePeriod.endDate,
      },
      {
        organizationName: settings.organizationName || user?.organization || "Organization Finance Management",
        organizationAddress: settings.organizationAddress || "Enterprise Financial Center",
        organizationEmail: settings.organizationEmail || user?.email || "",
        organizationPhone: settings.organizationPhone || "",
        organizationLogo: settings.organizationLogo || "",
        currency: settings.currency || "PKR",
        fiscalYear: settings.fiscalYear || "2025-2026",
      },
      {
        name: user?.name || user?.email || "Chief Financial Officer",
        email: user?.email || "",
        role: user?.role || "Admin",
        organization: settings.organizationName || user?.organization,
      }
    );
    setActiveEnterpriseData(enterpriseData);
    const html = generateFinancialHtmlReport(enterpriseData);
    setDossierHtml(html);
    setDossierViewerVisible(true);
    await openPdfReport(enterpriseData);
  };

  const hasAutoExportedRef = React.useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !hasAutoExportedRef.current) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("export") === "dossier" || (params.get("auto") === "pdf" && params.get("tab") !== "payroll")) {
        hasAutoExportedRef.current = true;
        const reportType = (params.get("reportType") || "consolidated_statement") as any;
        const scope = (params.get("scope") || "period") as any;
        const dept = params.get("dept") || "all";
        const startDate = params.get("startDate") || undefined;
        const endDate = params.get("endDate") || undefined;

        const effectivePeriod = startDate && endDate
          ? createCustomDatePeriod(startDate, endDate)
          : scope === "all_time" || scope === "all"
          ? getPresetPeriod("all_time", transactions)
          : activePeriod;

        setTimeout(() => {
          const enterpriseData = buildEnterpriseReportData(
            transactions,
            budgets,
            payroll,
            departments,
            {
              period: effectivePeriod,
              scope: scope === "all_time" || scope === "all" ? "all" : "period",
              reportType,
              departmentFilter: dept !== "all" ? dept : undefined,
              startDate: effectivePeriod.startDate,
              endDate: effectivePeriod.endDate,
            },
            {
              organizationName: settings.organizationName || user?.organization || "Organization Finance Management",
              organizationAddress: settings.organizationAddress || "Enterprise Financial Center",
              organizationEmail: settings.organizationEmail || user?.email || "",
              organizationPhone: settings.organizationPhone || "",
              organizationLogo: settings.organizationLogo || "",
              currency: settings.currency || "PKR",
              fiscalYear: settings.fiscalYear || "2025-2026",
            },
            {
              name: user?.name || user?.email || "Chief Financial Officer",
              email: user?.email || "",
              role: user?.role || "Admin",
              organization: settings.organizationName || user?.organization,
            }
          );
          setActiveEnterpriseData(enterpriseData);
          const html = generateFinancialHtmlReport(enterpriseData);
          setDossierHtml(html);
          setDossierViewerVisible(true);
          openPdfReport(enterpriseData);
        }, 500);
      }
    }
  }, [transactions, budgets, payroll, departments, activePeriod, settings, user]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.primary + "16" }]}>
              <SvgFileText size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Reports</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
                {settings.organizationName || "Organization Finance Management"} · Financial statements & audit
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, width: isMobile ? "100%" : "auto", marginTop: isMobile ? 8 : 0 }}>
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: colors.border, backgroundColor: colors.card, flex: isMobile ? 1 : undefined }]}
            onPress={() => setExportModalVisible(true)}
            activeOpacity={0.8}
          >
            <SvgLayers size={15} color={colors.foreground} />
            <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>Custom export</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: isMobile ? 1 : undefined }]}
            onPress={handleExportPDF}
            activeOpacity={0.8}
          >
            <SvgFileText size={15} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>
              {activeTab === "payroll"
                ? "Download payroll PDF"
                : activeTab === "departments"
                ? "Download department PDF"
                : activeTab === "analytics"
                ? "Download trends PDF"
                : "Download full report"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Period toolbar ─── */}
      <View style={[styles.scopeToolbar, { backgroundColor: colors.card, borderColor: colors.border }, isMobile && { flexDirection: "column", alignItems: "stretch", gap: 10, padding: 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Text style={[styles.toolbarLabel, { color: colors.mutedForeground }]}>Report period</Text>
          <View style={[styles.activeScopeTag, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
            <Text style={[styles.scopeTagText, { color: colors.foreground }]}>{activePeriod.label}</Text>
            <Text style={[styles.scopeTagSub, { color: colors.mutedForeground }]}>
              · {periodTransactions.length} {periodTransactions.length === 1 ? "record" : "records"}
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={[styles.periodPillsContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {REPORT_PERIOD_PRESETS.map((p) => {
              const isSelected = activePeriod.presetId === p.id || (activePeriod.presetId !== "custom" && activePeriod.label.includes(p.label));
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setActivePeriod(getPresetPeriod(p.id))}
                  style={[styles.periodPill, isSelected && { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.periodPillText, { color: isSelected ? colors.primary : colors.mutedForeground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => {
                setCustomStart(activePeriod.startDate || "2026-01-01");
                setCustomEnd(activePeriod.endDate || "2026-09-01");
                setCustomDateModalVisible(true);
              }}
              style={[styles.periodPill, activePeriod.presetId === "custom" && { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodPillText, { color: activePeriod.presetId === "custom" ? colors.primary : colors.mutedForeground }]}>
                Custom range
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* ─── Period summary cards ─── */}
      {(() => {
        const cards =
          totalBudgetAllocated > 0
            ? [
                { label: "Income", value: `+${settings.currency} ${fmt(metrics.totalIncome)}`, sub: `${incomeByCat.length} income ${incomeByCat.length === 1 ? "source" : "sources"}`, color: colors.income },
                { label: "Expenses", value: `-${settings.currency} ${fmt(metrics.totalExpense)}`, sub: `${((metrics.totalExpense / totalBudgetAllocated) * 100).toFixed(1)}% of budget used`, color: colors.expense },
                { label: "Department budget", value: `${settings.currency} ${fmt(totalBudgetAllocated)}`, sub: `${settings.currency} ${fmt(unallocatedFunds)} unallocated`, color: colors.info },
                { label: "Net cash position", value: `${netCapitalSurplus >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(netCapitalSurplus))}`, sub: `${retainedCapitalPct.toFixed(1)}% of income retained`, color: netCapitalSurplus >= 0 ? colors.income : colors.expense },
              ]
            : [
                { label: "Income", value: `+${settings.currency} ${fmt(metrics.totalIncome)}`, sub: `${incomeByCat.length} income ${incomeByCat.length === 1 ? "source" : "sources"}`, color: colors.income },
                { label: "Expenses", value: `-${settings.currency} ${fmt(metrics.totalExpense)}`, sub: `${expenseByCat.length} expense ${expenseByCat.length === 1 ? "category" : "categories"}`, color: colors.expense },
                { label: "Net operating surplus", value: `${metrics.netBalance >= 0 ? "+" : "-"}${settings.currency} ${fmt(Math.abs(metrics.netBalance))}`, sub: metrics.totalIncome > 0 ? `${((metrics.netBalance / metrics.totalIncome) * 100).toFixed(1)}% net margin` : "Operating result", color: metrics.netBalance >= 0 ? colors.income : colors.expense },
              ];
        return (
          <View style={styles.metricsGrid}>
            {cards.map((c) => (
              <View
                key={c.label}
                style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, borderTopColor: c.color, minWidth: isMobile ? "100%" : 200 }]}
              >
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{c.label}</Text>
                <Text style={[styles.metricValue, { color: c.color }]}>{c.value}</Text>
                <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>{c.sub}</Text>
              </View>
            ))}
          </View>
        );
      })()}

      {/* ─── Sub-tab navigation ─── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          {[
            { id: "statement", label: "Income statement", icon: SvgFileText },
            { id: "analytics", label: "Financial trends", icon: SvgChart },
            { id: "departments", label: "Departments", icon: SvgLayers },
            { id: "payroll", label: "Payroll audit", icon: SvgUsers },
          ].map((tab) => {
            const IconComp = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabBtn, { borderBottomColor: isActive ? colors.primary : "transparent" }]}
                onPress={() => setActiveTab(tab.id as any)}
                activeOpacity={0.8}
              >
                <IconComp size={15} color={isActive ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.tabBtnText, { color: isActive ? colors.foreground : colors.mutedForeground, fontFamily: isActive ? "Inter_600SemiBold" : "Inter_500Medium" }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* ─── Tab: Income statement ─── */}
      {activeTab === "statement" && (() => {
        const pctOf = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toFixed(0)}%` : "—");
        const marginPct = metrics.totalIncome > 0 ? (metrics.netBalance / metrics.totalIncome) * 100 : null;
        const Row = ({ label, value, pct, color, strong, indent }: { label: string; value: string; pct?: string; color?: string; strong?: boolean; indent?: boolean }) => (
          <View style={[styles.statementRow, { borderBottomColor: colors.border }, width < 520 && { flexWrap: "wrap" }]}>
            <Text style={[strong ? styles.statementTotalLabel : styles.statementLabel, { color: colors.foreground, paddingLeft: indent ? 14 : 0 }, width < 520 && { flexBasis: "100%" }]}>{label}</Text>
            {pct !== undefined && <Text style={[styles.statementPct, { color: colors.mutedForeground }]}>{pct}</Text>}
            <Text style={[strong ? styles.statementTotalVal : styles.statementAmount, { color: color || colors.foreground }, width < 520 && { width: "auto", flex: 1, minWidth: 0 }]}>{value}</Text>
          </View>
        );

        return (
          <View style={[styles.statementGrid, isMobile && { flexDirection: "column" }]}>
            {/* Income statement */}
            <View style={[styles.panelCard, styles.statementMain, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.panelHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.panelTitle, { color: colors.foreground }]}>Income statement</Text>
                  <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>{activePeriod.label}</Text>
                </View>
              </View>

              <View style={[styles.statementHead, { borderBottomColor: colors.border }, width < 520 && { flexWrap: "wrap" }]}>
                <Text style={[styles.statementHeadText, { color: colors.mutedForeground, flex: 1 }, width < 520 && { flexBasis: "100%" }]}>Account</Text>
                <Text style={[styles.statementHeadText, styles.statementPct, { color: colors.mutedForeground }]}>% of total</Text>
                <Text style={[styles.statementHeadText, { color: colors.mutedForeground, width: 150, textAlign: "right" }]}>Amount</Text>
              </View>

              {/* Income */}
              <Text style={[styles.sectionHeading, { color: colors.foreground }]}>Income</Text>
              {incomeByCat.length === 0 ? (
                <Text style={[styles.emptyLine, { color: colors.mutedForeground }]}>No income recorded in this period.</Text>
              ) : (
                incomeByCat.map((item) => (
                  <Row key={item.category} indent label={item.category} pct={pctOf(item.total, metrics.totalIncome)} value={`${settings.currency} ${fmt(item.total)}`} />
                ))
              )}
              <Row strong label="Total income" value={`${settings.currency} ${fmt(metrics.totalIncome)}`} color={colors.income} />

              {/* Expenses */}
              <Text style={[styles.sectionHeading, { color: colors.foreground, marginTop: 14 }]}>Expenses</Text>
              {expenseByCat.length === 0 ? (
                <Text style={[styles.emptyLine, { color: colors.mutedForeground }]}>No expenses recorded in this period.</Text>
              ) : (
                expenseByCat.map((item) => (
                  <Row key={item.category} indent label={item.category} pct={pctOf(item.total, metrics.totalExpense)} value={`${settings.currency} ${fmt(item.total)}`} />
                ))
              )}
              <Row strong label="Total expenses" value={`${settings.currency} ${fmt(metrics.totalExpense)}`} color={colors.expense} />

              {/* Net result */}
              <View style={[styles.netSurplusBox, width < 520 && { flexDirection: "column", alignItems: "stretch" }, { borderTopColor: colors.foreground }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.netSurplusLabel, { color: colors.foreground }]}>
                    {metrics.netBalance >= 0 ? "Net income" : "Net loss"}
                  </Text>
                  <Text style={[styles.netSurplusSub, { color: colors.mutedForeground }]}>
                    {marginPct !== null ? `${marginPct.toFixed(1)}% operating margin` : "Income − expenses"}
                  </Text>
                </View>
                <Text style={[styles.netSurplusValue, { color: metrics.netBalance >= 0 ? colors.income : colors.expense }]}>
                  {metrics.netBalance >= 0 ? "+" : "-"}
                  {settings.currency} {fmt(Math.abs(metrics.netBalance))}
                </Text>
              </View>
            </View>

            {/* Budget reconciliation */}
            {totalBudgetAllocated > 0 && (
              <View style={[styles.panelCard, styles.statementSide, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.panelHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.panelTitle, { color: colors.foreground }]}>Budget reconciliation</Text>
                    <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>How income is allocated and used</Text>
                  </View>
                </View>

                <Row label="Total income" value={`+${settings.currency} ${fmt(metrics.totalIncome)}`} color={colors.income} />
                <Row label="Less: department budgets" value={`−${settings.currency} ${fmt(totalBudgetAllocated)}`} />
                <Row strong label="Unallocated funds" value={`${settings.currency} ${fmt(unallocatedFunds)}`} color={colors.info} />

                <View style={{ height: 8 }} />
                <Row label="Total income" value={`+${settings.currency} ${fmt(metrics.totalIncome)}`} color={colors.income} />
                <Row label="Less: expenses paid" value={`−${settings.currency} ${fmt(metrics.totalExpense)}`} color={colors.expense} />

                <View style={[styles.netSurplusBox, width < 520 && { flexDirection: "column", alignItems: "stretch" }, { borderTopColor: colors.foreground }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.netSurplusLabel, { color: colors.foreground }]}>Net cash position</Text>
                    <Text style={[styles.netSurplusSub, { color: colors.mutedForeground }]}>
                      {retainedCapitalPct.toFixed(1)}% of income retained
                    </Text>
                  </View>
                  <Text style={[styles.netSurplusValue, { color: netCash >= 0 ? colors.income : colors.expense }]}>
                    {netCash >= 0 ? "+" : "-"}
                    {settings.currency} {fmt(Math.abs(netCash))}
                  </Text>
                </View>

                {/* Visual: how the budget is being used */}
                <View style={{ gap: 8, marginTop: 6 }}>
                  <View style={styles.statementHead}>
                    <Text style={[styles.statementHeadText, { color: colors.mutedForeground, flex: 1 }]}>Budget used</Text>
                    <Text style={[styles.statementHeadText, { color: colors.foreground }]}>
                      {((metrics.totalExpense / totalBudgetAllocated) * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
                    <View
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.max(2, (metrics.totalExpense / totalBudgetAllocated) * 100))}%`,
                        backgroundColor: metrics.totalExpense > totalBudgetAllocated ? colors.expense : colors.primary,
                      }}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        );
      })()}

      {activeTab === "analytics" && (
        <View style={{ gap: 16 }}>
          {/* Authoritative 3-Card Financial Analytics Suite */}
          <FinancialAnalyticsSuite
            budget={authFinancialModel.budget}
            margin={authFinancialModel.margin}
            distribution={authFinancialModel.distribution}
            currency={settings.currency}
            departments={departments}
            budgets={budgets}
            transactions={periodTransactions}
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

          {/* Historical Trend Curve */}
          <View
            style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onLayout={(e) => setChartContainerWidth(e.nativeEvent.layout.width)}
          >
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
              width={
                chartContainerWidth > 40
                  ? chartContainerWidth - 36
                  : isMobile
                  ? width - 40
                  : Math.min(width - (width >= 1024 ? 320 : 64), 960)
              }
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
                size={isMobile ? 134 : 164}
                strokeWidth={isMobile ? 8 : 9}
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
                  Actual spend against allocated budget ceilings ({activePeriod.label})
                </Text>
              </View>
            </View>

            {deptMatrix.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                  No department allocations recorded yet.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {deptMatrix.map((dept) => {
                  const isOver = dept.spent > dept.allocated && dept.allocated > 0;
                  const isWarning = dept.utilizationPct >= 80 && !isOver;
                  const statusColor = isOver ? colors.expense : isWarning ? colors.warning : colors.income;
                  return (
                    <View key={dept.id} style={[styles.deptAuditCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={[styles.deptAuditName, { color: colors.foreground }]}>{dept.name}</Text>
                          <View style={[styles.deptBadge, { backgroundColor: statusColor + "18" }]}>
                            <Text style={[styles.deptBadgeText, { color: statusColor }]}>
                              {dept.allocated <= 0
                                ? "NO BUDGET"
                                : isOver
                                ? "OVER BUDGET"
                                : isWarning
                                ? "NEAR CEILING"
                                : "WITHIN BUDGET"}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.deptAuditRatio, { color: statusColor }]}>
                          {dept.allocated > 0 ? `${dept.utilizationPct.toFixed(1)}% Used` : "N/A"}
                        </Text>
                      </View>
                      <View style={[styles.deptTrack, { backgroundColor: colors.border, marginTop: 6 }]}>
                        <View
                          style={[
                            styles.deptFill,
                            {
                              width: `${Math.min(Math.round(dept.utilizationPct), 100)}%`,
                              backgroundColor: statusColor,
                            },
                          ]}
                        />
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                        <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
                          Allocated: <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{settings.currency} {fmt(dept.allocated)}</Text>
                        </Text>
                        <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
                          Period Spend: <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{settings.currency} {fmt(dept.spent)}</Text>
                        </Text>
                        <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
                          Payroll Spend: <Text style={{ color: "#8B5CF6", fontFamily: "Inter_600SemiBold" }}>{settings.currency} {fmt(dept.payrollSpending)}</Text>
                        </Text>
                        <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
                          Other Spend: <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>{settings.currency} {fmt(dept.otherSpending)}</Text>
                        </Text>
                        <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
                          Remaining: <Text style={{ color: dept.remaining > 0 ? colors.income : colors.expense, fontFamily: "Inter_700Bold" }}>{settings.currency} {fmt(dept.remaining)}</Text>
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
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
                  Monthly staff compensation breakdown ({activePeriod.label})
                </Text>
              </View>
            </View>

            {/* Payroll Summary Strip */}
            <View style={[styles.payrollSummaryStrip, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={styles.payrollSummaryItem}>
                <Text style={[styles.payrollSummaryLabel, { color: colors.mutedForeground }]}>TOTAL DISBURSED</Text>
                <Text style={[styles.payrollSummaryValue, { color: "#8B5CF6" }]}>
                  {settings.currency} {fmt(payrollTotals.totalDisbursed)}
                </Text>
              </View>
              <View style={styles.payrollSummaryItem}>
                <Text style={[styles.payrollSummaryLabel, { color: colors.mutedForeground }]}>BASE SALARIES</Text>
                <Text style={[styles.payrollSummaryValue, { color: colors.foreground }]}>
                  {settings.currency} {fmt(payrollTotals.totalBase)}
                </Text>
              </View>
              <View style={styles.payrollSummaryItem}>
                <Text style={[styles.payrollSummaryLabel, { color: colors.mutedForeground }]}>BONUSES & ALLOWANCES</Text>
                <Text style={[styles.payrollSummaryValue, { color: colors.income }]}>
                  +{settings.currency} {fmt(payrollTotals.totalBonus)}
                </Text>
              </View>
              <View style={styles.payrollSummaryItem}>
                <Text style={[styles.payrollSummaryLabel, { color: colors.mutedForeground }]}>TAX & DEDUCTIONS</Text>
                <Text style={[styles.payrollSummaryValue, { color: colors.expense }]}>
                  -{settings.currency} {fmt(payrollTotals.totalDeductions)}
                </Text>
              </View>
              <View style={styles.payrollSummaryItem}>
                <Text style={[styles.payrollSummaryLabel, { color: colors.mutedForeground }]}>STAFF PAID</Text>
                <Text style={[styles.payrollSummaryValue, { color: "#0EA5E9" }]}>
                  {payrollTotals.count} Personnel
                </Text>
              </View>
            </View>

            {scopedPayroll.length === 0 ? (
              <View style={{ padding: 24, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                  No staff payroll disbursals recorded for {activePeriod.label}.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {scopedPayroll.map((p) => {
                  const net = p.netSalary !== undefined ? p.netSalary : (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0);
                  return (
                    <View key={p.id} style={[styles.deptAuditCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text style={[styles.deptAuditName, { color: colors.foreground }]}>{p.employeeName}</Text>
                            <View style={[styles.deptBadge, { backgroundColor: "#0EA5E918" }]}>
                              <Text style={[styles.deptBadgeText, { color: "#0EA5E9" }]}>{p.department || "General"}</Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2 }}>
                            {p.employeeId} · {p.designation || "Staff Member"} {p.month ? `· Month: ${p.month}` : ""}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#8B5CF6" }}>
                            {settings.currency} {fmt(net)}
                          </Text>
                          <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
                            Base: {settings.currency} {fmt(p.baseSalary || 0)} | Bonus: +{fmt(p.bonus || 0)} | Ded: -{fmt(p.deductions || 0)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
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
                  Filter transactions and statement analytics by exact date range
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
      )}

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

      {/* ─── Enterprise Export Modal ─── */}
      <DownloadReportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        activePeriod={activePeriod}
      />

      {/* ─── Full-Screen Official PDF Dossier Viewer & Print Bar ─── */}
      {Platform.OS === "web" && dossierViewerVisible && (
        <Modal
          visible={dossierViewerVisible}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setDossierViewerVisible(false)}
        >
          <View style={styles.webViewerOverlay}>
            <View style={styles.webViewerHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
                <View style={[styles.docIconBox, { backgroundColor: "#38BDF820" }]}>
                  <Feather name="file-text" size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#F8FAFC" }}>
                    {activeEnterpriseData?.reportTitle || "Official Financial Dossier"}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: "#94A3B8" }}>
                    {settings.organizationName || user?.organization || "Organization Finance Management"} · Certified Statement · {activePeriod.label}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <TouchableOpacity
                  style={[styles.webViewerBtn, { backgroundColor: "#38BDF8" }]}
                  onPress={() => {
                    if (activeEnterpriseData) {
                      downloadPdfBinaryDirectly(activeEnterpriseData as any);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="download" size={14} color="#0F172A" />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>
                    Download PDF
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.webViewerBtn, { backgroundColor: "#10B981" }]}
                  onPress={() => {
                    try {
                      const iframe = document.getElementById("ofm-dossier-iframe") as HTMLIFrameElement;
                      if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                      } else {
                        window.print();
                      }
                    } catch {
                      window.print();
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="printer" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>
                    Print / Save as PDF
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.webViewerBtn, { backgroundColor: "#334155", paddingHorizontal: 12 }]}
                  onPress={() => setDossierViewerVisible(false)}
                  activeOpacity={0.8}
                >
                  <Feather name="x" size={16} color="#F8FAFC" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
              {React.createElement("iframe", {
                id: "ofm-dossier-iframe",
                srcDoc: dossierHtml,
                style: {
                  width: "100%",
                  height: "100%",
                  border: "none",
                  backgroundColor: "#FFFFFF",
                },
                title: "Official Financial Dossier",
              })}
            </View>
          </View>
        </Modal>
      )}
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
    borderRadius: 10,
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
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
  content: {
    padding: 24,
    gap: 20,
    paddingBottom: 60,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
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
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
  toolbarLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  scopeTagText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  scopeTagSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  statementGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  statementMain: {
    flex: 3,
    minWidth: 0,
  },
  statementSide: {
    flex: 2,
    minWidth: 0,
  },
  statementHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  statementHeadText: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
  statementPct: {
    width: 80,
    textAlign: "right",
    fontSize: 13,
  },
  emptyLine: {
    fontSize: 13,
    paddingVertical: 8,
    paddingLeft: 14,
  },
  netSurplusSub: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scopeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
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
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    gap: 2,
  },
  periodPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  periodPillText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 200,
    borderRadius: 8,
    borderWidth: 1,
    borderTopWidth: 3,
    padding: 16,
    gap: 6,
  },
  metricLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  metricValue: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.4,
  },
  metricSub: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    gap: 4,
    flexWrap: "nowrap",
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 2,
    marginBottom: -1,
  },
  tabBtnText: {
    fontSize: 14,
  },
  panelCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
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
    fontFamily: "Inter_600SemiBold",
  },
  panelSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  statementRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  statementLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
    minWidth: 0,
  },
  statementAmount: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    width: 150,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  statementTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  statementTotalLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    minWidth: 0,
  },
  statementTotalVal: {
    fontSize: 14.5,
    fontFamily: "Inter_600SemiBold",
    width: 150,
    textAlign: "right",
  },
  netSurplusBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 4,
    borderTopWidth: 2,
    marginTop: 6,
    gap: 12,
  },
  netSurplusLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  netSurplusValue: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
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
  deptBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deptBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  payrollSummaryStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  payrollSummaryItem: {
    flex: 1,
    minWidth: 120,
    gap: 2,
  },
  payrollSummaryLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  payrollSummaryValue: {
    fontSize: 14,
    fontFamily: "Inter_800ExtraBold",
  },
  webViewerOverlay: {
    flex: 1,
    backgroundColor: "#0B1120",
    display: "flex",
    flexDirection: "column",
  },
  webViewerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0F172A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    flexWrap: "wrap",
    gap: 10,
    zIndex: 10,
  },
  docIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  webViewerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
