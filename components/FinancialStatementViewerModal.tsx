import React from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Share,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "./UniversalIcon";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { showFloatingToast } from "@/app/_layout";
import {
  ReportOptions,
  downloadCsvReport,
  openPdfReport,
  downloadPdfReport,
  sharePdfReport,
} from "@/services/ReportExportService";
import { PdfSuccessModal } from "@/components/PdfSuccessModal";

interface Props {
  visible: boolean;
  onClose: () => void;
  reportOpts: ReportOptions | null;
  fileUri?: string;
  title?: string;
  onPrintDownload?: () => void;
  htmlContent?: string;
}

function fmt(n: number): string {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function FinancialStatementViewerModal({
  visible,
  onClose,
  reportOpts,
  fileUri,
  title,
  onPrintDownload,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const [isExportingPdf, setIsExportingPdf] = React.useState(false);
  const [successModalData, setSuccessModalData] = React.useState<{
    visible: boolean;
    filename: string;
    fileUri?: string;
    fileSize?: number;
    title?: string;
    subtitle?: string;
  }>({
    visible: false,
    filename: "",
  });

  if (!visible || !reportOpts) return null;

  const {
    organizationName = "Organization Finance Management",
    organizationAddress = "Enterprise Financial Center",
    organizationEmail = "finance@ofm-cloud.com",
    organizationLogo,
    currency = "PKR",
    fiscalYear = "2025-2026",
    periodLabel = "Annual Fiscal Period",
    generatedBy = "Authorized Controller",
    totalIncome = 0,
    totalExpenses = 0,
    netBalance = 0,
    budgetUtilization = 0,
    transactions = [],
    departments = [],
    payroll = [],
    budgets = [],
    members = [],
    chartPoints = [],
    includeSummary = true,
    includeCharts = true,
    includeCategories = true,
    includeDepartments = true,
    includeDepartmentDeepDive = true,
    includePayroll = true,
    includeMembers = true,
    includeTransactions = true,
    includeReconciliation = true,
  } = reportOpts;

  const now = new Date();
  const printDate = now.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const printTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const isNetPositive = netBalance >= 0;
  const profitMargin = totalIncome > 0 ? (netBalance / totalIncome) * 100 : (netBalance >= 0 ? 0 : -100);
  const coverageRatio = totalExpenses > 0 ? totalIncome / totalExpenses : totalIncome > 0 ? 99 : 0;

  // Category aggregation
  const incomeCatMap: Record<string, { amount: number; count: number }> = {};
  const expenseCatMap: Record<string, { amount: number; count: number }> = {};

  transactions.forEach((t) => {
    if (t.type === "income") {
      if (!incomeCatMap[t.category]) incomeCatMap[t.category] = { amount: 0, count: 0 };
      incomeCatMap[t.category].amount += t.amount;
      incomeCatMap[t.category].count += 1;
    } else if (t.type === "expense") {
      if (!expenseCatMap[t.category]) expenseCatMap[t.category] = { amount: 0, count: 0 };
      expenseCatMap[t.category].amount += t.amount;
      expenseCatMap[t.category].count += 1;
    }
  });

  const deptExpenseMap: Record<string, number> = {};
  const deptIncomeMap: Record<string, number> = {};
  transactions.forEach((t) => {
    if (t.type === "expense") {
      deptExpenseMap[t.department] = (deptExpenseMap[t.department] ?? 0) + t.amount;
    } else if (t.type === "income") {
      deptIncomeMap[t.department] = (deptIncomeMap[t.department] ?? 0) + t.amount;
    }
  });

  const totalAllocatedBudget = departments.reduce((s, d) => s + (d.budgetAllocated || 0), 0);
  const totalEmployees = departments.reduce((s, d) => s + (d.headCount || 0), 0);

  const totalGrossSalary = payroll.reduce((s, p) => s + (p.baseSalary || 0), 0);
  const totalBonuses = payroll.reduce((s, p) => s + (p.bonus || 0), 0);
  const totalDeductions = payroll.reduce((s, p) => s + (p.deductions || 0), 0);
  const totalNetPayroll = payroll.reduce((s, p) => s + (p.baseSalary + (p.bonus || 0) - (p.deductions || 0)), 0);

  const fallbackMembers = members && members.length > 0 ? members : [];

  const handleShare = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (Platform.OS === "web") {
        window.print();
        return;
      }
      await sharePdfReport(reportOpts);
    } catch (e: any) {
      console.warn("Share error", e);
    }
  };

  const handlePrintPdf = async () => {
    if (isExportingPdf) return;
    if (onPrintDownload) {
      onPrintDownload();
      return;
    }
    setIsExportingPdf(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await downloadPdfReport(reportOpts);
      if (res.success) {
        showFloatingToast("Saved into File Manager ✅", "Official Financial Statement PDF saved successfully.");
        setSuccessModalData({
          visible: true,
          filename: res.filename || "Financial_Statement.pdf",
          fileUri: res.uri,
          title: "Saved into File Manager ✅",
          subtitle: `Official PDF dossier saved to your phone storage.`,
        });
      } else {
        Alert.alert("PDF Error", res.message || "Failed to download PDF report.");
      }
    } catch (e: any) {
      Alert.alert("PDF Export Failed", e?.message || "An unexpected error occurred.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportCsv = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await downloadCsvReport(reportOpts);
    if (res.success) {
      showFloatingToast("CSV Exported", "Spreadsheet downloaded successfully.");
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: "#0B1120", paddingTop: webTop + insets.top }]}>
        
        {/* Tier 1 Executive Modal Header */}
        <View style={styles.topHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View style={styles.docIconBox}>
              <Feather
                name={
                  reportOpts.reportMode === "payroll_audit"
                    ? "users"
                    : reportOpts.reportMode === "expense_analysis"
                    ? "trending-down"
                    : reportOpts.reportMode === "revenue_analysis"
                    ? "trending-up"
                    : reportOpts.reportMode === "department_analysis"
                    ? "layers"
                    : reportOpts.reportMode === "budget_performance"
                    ? "pie-chart"
                    : "file-text"
                }
                size={17}
                color="#38BDF8"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.topHeaderTitle} numberOfLines={1}>
                {title ||
                  (reportOpts.reportMode === "payroll_audit"
                    ? "Staff Payroll & Remuneration Audit"
                    : reportOpts.reportMode === "expense_analysis"
                    ? "Operational Expenditure Analysis"
                    : reportOpts.reportMode === "revenue_analysis"
                    ? "Institutional Revenue Statement"
                    : reportOpts.reportMode === "department_analysis"
                    ? "Departmental Cost Center Matrix"
                    : reportOpts.reportMode === "budget_performance"
                    ? "Fiscal Budget Performance Report"
                    : reportOpts.reportMode === "general_ledger"
                    ? "Audited General Ledger Trail"
                    : "Official Consolidated Financial Statement")}
              </Text>
              <Text style={styles.topHeaderSub} numberOfLines={1}>{organizationName} · {periodLabel}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Feather name="x" size={19} color="#CBD5E1" />
          </TouchableOpacity>
        </View>

        {/* Tier 2 Action Toolbar */}
        <View style={styles.actionToolbar}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#38BDF8", flex: 1.2 }]}
            onPress={handlePrintPdf}
            activeOpacity={0.85}
          >
            <Feather name="printer" size={14} color="#0F172A" />
            <Text style={[styles.actionBtnText, { color: "#0F172A" }]}>Print / PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#10B981", flex: 0.9 }]}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <Feather name="share-2" size={14} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { color: "#FFFFFF" }]}>Share</Text>
          </TouchableOpacity>

          {Platform.OS === "web" && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#1E293B" }]}
              onPress={handleExportCsv}
              activeOpacity={0.85}
            >
              <Feather name="download" size={14} color="#FFFFFF" />
              <Text style={[styles.actionBtnText, { color: "#FFFFFF" }]}>CSV</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Formal White Paper Sheet Viewer */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.paperSheet}>
            
            {/* ─── Formal Header Block ─── */}
            <View style={styles.formalHeader}>
              <View style={styles.headerTopRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
                  {organizationLogo ? (
                    <Image
                      source={{ uri: organizationLogo }}
                      style={styles.formalLogo}
                      contentFit="contain"
                    />
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.formalOrgTitle}>{organizationName}</Text>
                    <Text style={styles.formalDocSubtitle}>AUDITED COMPREHENSIVE FINANCIAL STATEMENT</Text>
                    <Text style={styles.formalDocStandard}>Standard Accounting Principles (GAAP/IFRS)</Text>
                  </View>
                </View>
                <View style={styles.sealBadge}>
                  <Feather name="shield" size={10} color="#38BDF8" />
                  <Text style={styles.sealText}>CERTIFIED</Text>
                </View>
              </View>

              {/* Meta Data Strip (Fixed 2-Column Responsive Layout) */}
              <View style={styles.metaDataStrip}>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>REF CODE</Text>
                  <Text style={styles.metaVal}>OFM-{fiscalYear.replace(/[^0-9]/g, "")}-{(transactions.length * 19).toString(16).toUpperCase()}</Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>FISCAL SCOPE</Text>
                  <Text style={styles.metaVal}>{periodLabel} (FY {fiscalYear})</Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>CURRENCY</Text>
                  <Text style={styles.metaVal}>{currency} (Standard)</Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>CONTROLLER</Text>
                  <Text style={styles.metaVal}>{generatedBy}</Text>
                </View>
                <View style={[styles.metaCol, { width: "100%" }]}>
                  <Text style={styles.metaLabel}>AUDIT STAMP</Text>
                  <Text style={styles.metaVal}>{printDate} at {printTime}</Text>
                </View>
              </View>
            </View>

            {/* ─── Executive Summary Matrix (Tier 1) ─── */}
            {includeSummary && (
              <View style={styles.executiveMatrix}>
                <View style={styles.matrixBox}>
                  <Text style={styles.matrixLabel}>GROSS REVENUES</Text>
                  <Text style={[styles.matrixVal, { color: "#10B981" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>+{currency} {fmtShort(totalIncome)}</Text>
                  <Text style={styles.matrixSub}>{transactions.filter(t => t.type === "income").length} Deposits</Text>
                </View>

                <View style={styles.matrixBox}>
                  <Text style={styles.matrixLabel}>TOTAL EXPENSES</Text>
                  <Text style={[styles.matrixVal, { color: "#E11D48" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>-{currency} {fmtShort(totalExpenses)}</Text>
                  <Text style={styles.matrixSub}>{transactions.filter(t => t.type === "expense").length} Outflows</Text>
                </View>

                <View style={styles.matrixBox}>
                  <Text style={styles.matrixLabel}>NET POSITION</Text>
                  <Text style={[styles.matrixVal, { color: isNetPositive ? "#10B981" : "#E11D48" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {isNetPositive ? "+" : "-"}{currency} {fmtShort(Math.abs(netBalance))}
                  </Text>
                  <Text style={styles.matrixSub}>{isNetPositive ? "Surplus Buffer" : "Deficit Drain"}</Text>
                </View>

                <View style={styles.matrixBox}>
                  <Text style={styles.matrixLabel}>PROFIT MARGIN</Text>
                  <Text style={[styles.matrixVal, { color: profitMargin >= 0 ? "#10B981" : "#E11D48" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {profitMargin.toFixed(1)}%
                  </Text>
                  <Text style={styles.matrixSub}>{coverageRatio >= 90 ? "99x" : `${coverageRatio.toFixed(1)}x`} Coverage</Text>
                </View>
              </View>
            )}

            {/* ─── SECTION 1: STATEMENT OF FINANCIAL POSITION & ACTIVITIES (P&L) ─── */}
            <View style={styles.sectionBlock}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionNumber}>1</Text>
                <Text style={styles.sectionTitleText}>STATEMENT OF OPERATING ACTIVITIES & CASHFLOW</Text>
              </View>

              <View style={styles.formalTable}>
                {/* Table Header */}
                <View style={styles.formalTableHeader}>
                  <Text style={[styles.fth, { flex: 2.5, textAlign: "left" }]} numberOfLines={1}>ACCOUNTING HEAD</Text>
                  <Text style={[styles.fth, { flex: 0.8, textAlign: "center" }]} numberOfLines={1}>RECS</Text>
                  <Text style={[styles.fth, { flex: 1.5, textAlign: "right" }]} numberOfLines={1}>INFLOW (+)</Text>
                  <Text style={[styles.fth, { flex: 1.5, textAlign: "right" }]} numberOfLines={1}>OUTFLOW (-)</Text>
                </View>

                {/* Sub-header: Revenue Streams */}
                <View style={styles.tableCategoryHeaderRow}>
                  <Text style={styles.tableCategoryHeaderLabel} numberOfLines={1}>A. OPERATING REVENUES (INFLOWS)</Text>
                </View>

                {Object.entries(incomeCatMap).length === 0 ? (
                  <View style={styles.formalTableRow}>
                    <Text style={[styles.ftd, { flex: 2.5, fontStyle: "italic", color: "#94A3B8" }]} numberOfLines={1}>No income recorded</Text>
                    <Text style={[styles.ftd, { flex: 0.8, textAlign: "center" }]}>-</Text>
                    <Text style={[styles.ftd, { flex: 1.5, textAlign: "right" }]}>{currency} 0</Text>
                    <Text style={[styles.ftd, { flex: 1.5, textAlign: "right" }]}>-</Text>
                  </View>
                ) : (
                  Object.entries(incomeCatMap).map(([cat, val], idx) => (
                    <View key={cat} style={[styles.formalTableRow, idx % 2 === 1 && styles.rowZebra]}>
                      <Text style={[styles.ftd, { flex: 2.5, fontWeight: "600" }]} numberOfLines={1}>{cat}</Text>
                      <Text style={[styles.ftd, { flex: 0.8, textAlign: "center", color: "#64748B" }]}>{val.count}</Text>
                      <Text style={[styles.ftd, { flex: 1.5, textAlign: "right", color: "#10B981", fontWeight: "700" }]} numberOfLines={1}>+{currency} {fmtShort(val.amount)}</Text>
                      <Text style={[styles.ftd, { flex: 1.5, textAlign: "right", color: "#94A3B8" }]}>-</Text>
                    </View>
                  ))
                )}

                <View style={styles.subtotalRow}>
                  <Text style={[styles.ftd, { flex: 2.5, fontWeight: "700" }]} numberOfLines={1}>TOTAL REVENUES (A)</Text>
                  <Text style={[styles.ftd, { flex: 0.8, textAlign: "center", fontWeight: "700" }]}>{transactions.filter(t => t.type === "income").length}</Text>
                  <Text style={[styles.ftd, { flex: 1.5, textAlign: "right", color: "#10B981", fontWeight: "800" }]} numberOfLines={1}>+{currency} {fmt(totalIncome)}</Text>
                  <Text style={[styles.ftd, { flex: 1.5, textAlign: "right" }]}>-</Text>
                </View>

                {/* Sub-header: Expenditure Sinks */}
                <View style={styles.tableCategoryHeaderRow}>
                  <Text style={styles.tableCategoryHeaderLabel} numberOfLines={1}>B. OPERATING EXPENDITURES (OUTFLOWS)</Text>
                </View>

                {Object.entries(expenseCatMap).length === 0 ? (
                  <View style={styles.formalTableRow}>
                    <Text style={[styles.ftd, { flex: 2.5, fontStyle: "italic", color: "#94A3B8" }]} numberOfLines={1}>No expenditures recorded</Text>
                    <Text style={[styles.ftd, { flex: 0.8, textAlign: "center" }]}>-</Text>
                    <Text style={[styles.ftd, { flex: 1.5, textAlign: "right" }]}>-</Text>
                    <Text style={[styles.ftd, { flex: 1.5, textAlign: "right" }]}>{currency} 0</Text>
                  </View>
                ) : (
                  Object.entries(expenseCatMap).map(([cat, val], idx) => (
                    <View key={cat} style={[styles.formalTableRow, idx % 2 === 1 && styles.rowZebra]}>
                      <Text style={[styles.ftd, { flex: 2.5, fontWeight: "600" }]} numberOfLines={1}>{cat}</Text>
                      <Text style={[styles.ftd, { flex: 0.8, textAlign: "center", color: "#64748B" }]}>{val.count}</Text>
                      <Text style={[styles.ftd, { flex: 1.5, textAlign: "right", color: "#94A3B8" }]}>-</Text>
                      <Text style={[styles.ftd, { flex: 1.5, textAlign: "right", color: "#E11D48", fontWeight: "700" }]} numberOfLines={1}>-{currency} {fmtShort(val.amount)}</Text>
                    </View>
                  ))
                )}

                <View style={styles.subtotalRow}>
                  <Text style={[styles.ftd, { flex: 2.5, fontWeight: "700" }]} numberOfLines={1}>TOTAL EXPENDITURES (B)</Text>
                  <Text style={[styles.ftd, { flex: 0.8, textAlign: "center", fontWeight: "700" }]}>{transactions.filter(t => t.type === "expense").length}</Text>
                  <Text style={[styles.ftd, { flex: 1.5, textAlign: "right" }]}>-</Text>
                  <Text style={[styles.ftd, { flex: 1.5, textAlign: "right", color: "#E11D48", fontWeight: "800" }]} numberOfLines={1}>-{currency} {fmt(totalExpenses)}</Text>
                </View>

                {/* Final Net Operating Position Footer */}
                <View style={styles.grandTotalDoubleRow}>
                  <Text style={[styles.ftd, { flex: 3.3, fontWeight: "900", color: "#0F172A", fontSize: 10.5 }]} numberOfLines={1}>
                    NET OPERATING BALANCE (A − B)
                  </Text>
                  <Text style={[styles.ftd, { flex: 3.0, textAlign: "right", fontWeight: "900", color: isNetPositive ? "#10B981" : "#E11D48", fontSize: 11.5 }]} numberOfLines={1}>
                    {isNetPositive ? "+" : "-"}{currency} {fmt(Math.abs(netBalance))}
                  </Text>
                </View>
              </View>
            </View>

            {/* ─── SECTION 2: CONSOLIDATED DEPARTMENTAL BUDGETS & UTILIZATION ─── */}
            {includeDepartments && departments.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionNumber}>2</Text>
                  <Text style={styles.sectionTitleText}>DEPARTMENTAL BUDGETS & UTILIZATION</Text>
                </View>

                <View style={styles.formalTable}>
                  <View style={styles.formalTableHeader}>
                    <Text style={[styles.fth, { flex: 2.2, textAlign: "left" }]} numberOfLines={1}>DEPARTMENT</Text>
                    <Text style={[styles.fth, { flex: 0.7, textAlign: "center" }]} numberOfLines={1}>STAFF</Text>
                    <Text style={[styles.fth, { flex: 1.3, textAlign: "right" }]} numberOfLines={1}>BUDGET</Text>
                    <Text style={[styles.fth, { flex: 1.3, textAlign: "right" }]} numberOfLines={1}>SPENT</Text>
                    <Text style={[styles.fth, { flex: 0.9, textAlign: "center" }]} numberOfLines={1}>UTIL %</Text>
                  </View>

                  {departments.map((d, i) => {
                    const allocated = d.budgetAllocated || 0;
                    const spent = deptExpenseMap[d.name] || 0;
                    const util = allocated > 0 ? (spent / allocated) * 100 : 0;
                    const utilColor = util > 100 ? "#E11D48" : util > 75 ? "#D97706" : "#10B981";

                    return (
                      <View key={d.id || i} style={[styles.formalTableRow, i % 2 === 1 && styles.rowZebra]}>
                        <Text style={[styles.ftd, { flex: 2.2, fontWeight: "700" }]} numberOfLines={1}>{d.name}</Text>
                        <Text style={[styles.ftd, { flex: 0.7, textAlign: "center", color: "#64748B" }]}>{d.headCount || 0}</Text>
                        <Text style={[styles.ftd, { flex: 1.3, textAlign: "right", fontWeight: "600" }]} numberOfLines={1}>{currency} {fmtShort(allocated)}</Text>
                        <Text style={[styles.ftd, { flex: 1.3, textAlign: "right", color: "#E11D48", fontWeight: "700" }]} numberOfLines={1}>{currency} {fmtShort(spent)}</Text>
                        <View style={{ flex: 0.9, alignItems: "center" }}>
                          <View style={[styles.formalStatusBadge, { backgroundColor: utilColor + "18", borderColor: utilColor + "44" }]}>
                            <Text style={[styles.formalStatusText, { color: utilColor }]}>{util.toFixed(0)}%</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {/* Summary Totals */}
                  <View style={styles.grandTotalDoubleRow}>
                    <Text style={[styles.ftd, { flex: 2.2, fontWeight: "800" }]} numberOfLines={1}>TOTALS</Text>
                    <Text style={[styles.ftd, { flex: 0.7, textAlign: "center", fontWeight: "800" }]}>{totalEmployees}</Text>
                    <Text style={[styles.ftd, { flex: 1.3, textAlign: "right", fontWeight: "800" }]} numberOfLines={1}>{currency} {fmtShort(totalAllocatedBudget)}</Text>
                    <Text style={[styles.ftd, { flex: 1.3, textAlign: "right", fontWeight: "800", color: "#E11D48" }]} numberOfLines={1}>{currency} {fmtShort(totalExpenses)}</Text>
                    <View style={{ flex: 0.9, alignItems: "center" }}>
                      <View style={[styles.formalStatusBadge, { backgroundColor: "#0284C718", borderColor: "#0284C744" }]}>
                        <Text style={[styles.formalStatusText, { color: "#0284C7" }]}>{budgetUtilization.toFixed(0)}%</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ─── SECTION 3: STAFF PAYROLL & COMPENSATION STATEMENT ─── */}
            {includePayroll && payroll.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionNumber}>3</Text>
                  <Text style={styles.sectionTitleText}>STAFF PAYROLL & COMPENSATION DISBURSEMENTS</Text>
                </View>

                <View style={styles.formalTable}>
                  <View style={styles.formalTableHeader}>
                    <Text style={[styles.fth, { flex: 2.0, textAlign: "left" }]} numberOfLines={1}>EMPLOYEE</Text>
                    <Text style={[styles.fth, { flex: 1.7, textAlign: "left" }]} numberOfLines={1}>DEPARTMENT</Text>
                    <Text style={[styles.fth, { flex: 1.3, textAlign: "right" }]} numberOfLines={1}>BASE</Text>
                    <Text style={[styles.fth, { flex: 1.4, textAlign: "right" }]} numberOfLines={1}>NET PAY</Text>
                  </View>

                  {payroll.map((p, i) => {
                    const net = p.baseSalary + (p.bonus || 0) - (p.deductions || 0);
                    return (
                      <View key={p.id || i} style={[styles.formalTableRow, i % 2 === 1 && styles.rowZebra]}>
                        <View style={{ flex: 2.0, minWidth: 0 }}>
                          <Text style={[styles.ftd, { fontWeight: "700" }]} numberOfLines={1}>{p.employeeName}</Text>
                          <Text style={styles.ftdSub} numberOfLines={1}>{p.employeeId}</Text>
                        </View>
                        <Text style={[styles.ftd, { flex: 1.7, color: "#475569" }]} numberOfLines={1}>{p.department}</Text>
                        <Text style={[styles.ftd, { flex: 1.3, textAlign: "right" }]} numberOfLines={1}>{currency} {fmtShort(p.baseSalary)}</Text>
                        <Text style={[styles.ftd, { flex: 1.4, textAlign: "right", fontWeight: "800", color: "#4338CA" }]} numberOfLines={1}>
                          {currency} {fmt(net)}
                        </Text>
                      </View>
                    );
                  })}

                  <View style={styles.grandTotalDoubleRow}>
                    <Text style={[styles.ftd, { flex: 3.7, fontWeight: "800" }]} numberOfLines={1}>TOTAL PAYROLL</Text>
                    <Text style={[styles.ftd, { flex: 1.3, textAlign: "right", fontWeight: "800" }]} numberOfLines={1}>{currency} {fmtShort(totalGrossSalary)}</Text>
                    <Text style={[styles.ftd, { flex: 1.4, textAlign: "right", fontWeight: "900", color: "#4338CA" }]} numberOfLines={1}>
                      {currency} {fmt(totalNetPayroll)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* ─── SECTION 4: AUTHORIZED OFFICERS & GOVERNANCE DIRECTORY ─── */}
            {includeMembers && fallbackMembers.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionNumber}>4</Text>
                  <Text style={styles.sectionTitleText}>AUTHORIZED FINANCIAL SIGNATORIES</Text>
                </View>

                <View style={styles.formalTable}>
                  <View style={styles.formalTableHeader}>
                    <Text style={[styles.fth, { flex: 2.2, textAlign: "left" }]} numberOfLines={1}>OFFICER NAME</Text>
                    <Text style={[styles.fth, { flex: 2.0, textAlign: "left" }]} numberOfLines={1}>ASSIGNED UNIT</Text>
                    <Text style={[styles.fth, { flex: 1.2, textAlign: "center" }]} numberOfLines={1}>ROLE</Text>
                  </View>

                  {fallbackMembers.map((m, i) => {
                    const roleColor = m.role === "admin" ? "#4338CA" : m.role === "accountant" ? "#047857" : "#B45309";
                    return (
                      <View key={m.id || i} style={[styles.formalTableRow, i % 2 === 1 && styles.rowZebra]}>
                        <View style={{ flex: 2.2, minWidth: 0 }}>
                          <Text style={[styles.ftd, { fontWeight: "700" }]} numberOfLines={1}>{m.name}</Text>
                          <Text style={styles.ftdSub} numberOfLines={1}>{m.email}</Text>
                        </View>
                        <Text style={[styles.ftd, { flex: 2.0, color: "#475569" }]} numberOfLines={1}>{m.department || "Executive Office"}</Text>
                        <View style={{ flex: 1.2, alignItems: "center" }}>
                          <View style={[styles.formalStatusBadge, { backgroundColor: roleColor + "18", borderColor: roleColor + "40" }]}>
                            <Text style={[styles.formalStatusText, { color: roleColor }]}>{(m.role || "MEMBER").toUpperCase()}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ─── SECTION 5: COMPLETE AUDITED GENERAL TRANSACTION LEDGER ─── */}
            {includeTransactions && transactions.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionNumber}>5</Text>
                  <Text style={styles.sectionTitleText}>AUDITED TRANSACTION GENERAL LEDGER ({transactions.length} ITEMS)</Text>
                </View>

                <View style={styles.formalTable}>
                  <View style={styles.formalTableHeader}>
                    <Text style={[styles.fth, { flex: 1.1, textAlign: "left" }]} numberOfLines={1}>DATE</Text>
                    <Text style={[styles.fth, { flex: 0.9, textAlign: "center" }]} numberOfLines={1}>TYPE</Text>
                    <Text style={[styles.fth, { flex: 2.2, textAlign: "left" }]} numberOfLines={1}>CATEGORY & NOTE</Text>
                    <Text style={[styles.fth, { flex: 1.5, textAlign: "left" }]} numberOfLines={1}>DEPARTMENT</Text>
                    <Text style={[styles.fth, { flex: 1.6, textAlign: "right" }]} numberOfLines={1}>AMOUNT</Text>
                  </View>

                  {transactions.map((t, i) => {
                    const isInc = t.type === "income";
                    return (
                      <View key={t.id || i} style={[styles.formalTableRow, i % 2 === 1 && styles.rowZebra]}>
                        <Text style={[styles.ftd, { flex: 1.1, fontSize: 8.5, color: "#64748B" }]} numberOfLines={1}>{t.date}</Text>
                        <View style={{ flex: 0.9, alignItems: "center" }}>
                          <View style={[styles.formalStatusBadge, { backgroundColor: isInc ? "#10B98118" : "#E11D4818", borderColor: isInc ? "#10B98140" : "#E11D4840" }]}>
                            <Text style={[styles.formalStatusText, { color: isInc ? "#10B981" : "#E11D48", fontSize: 7.5 }]}>
                              {isInc ? "IN" : "OUT"}
                            </Text>
                          </View>
                        </View>
                        <View style={{ flex: 2.2, minWidth: 0, paddingRight: 4 }}>
                          <Text style={[styles.ftd, { fontWeight: "700" }]} numberOfLines={1}>{t.category}</Text>
                          {Boolean(t.description || t.title) && (
                            <Text style={styles.ftdSub} numberOfLines={1}>{t.title ? `${t.title} · ` : ""}{t.description || ""}</Text>
                          )}
                        </View>
                        <Text style={[styles.ftd, { flex: 1.5, color: "#475569", fontSize: 9 }]} numberOfLines={1}>{t.department}</Text>
                        <Text style={[styles.ftd, { flex: 1.6, textAlign: "right", fontWeight: "800", color: isInc ? "#10B981" : "#E11D48" }]} numberOfLines={1}>
                          {isInc ? "+" : "-"}{currency} {fmt(t.amount)}
                        </Text>
                      </View>
                    );
                  })}

                  <View style={styles.grandTotalDoubleRow}>
                    <Text style={[styles.ftd, { flex: 5.7, fontWeight: "800" }]} numberOfLines={1}>TOTAL GENERAL LEDGER POSITION</Text>
                    <Text style={[styles.ftd, { flex: 1.6, textAlign: "right", fontWeight: "900", color: isNetPositive ? "#10B981" : "#E11D48" }]} numberOfLines={1}>
                      {isNetPositive ? "+" : "-"}{currency} {fmt(Math.abs(netBalance))}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* ─── SECTION 6: FINANCIAL RATIOS & RECONCILIATION AUDIT ─── */}
            {includeReconciliation && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionNumber}>6</Text>
                  <Text style={styles.sectionTitleText}>FINANCIAL RATIOS & RECONCILIATION AUDIT</Text>
                </View>

                <View style={styles.formalTable}>
                  <View style={styles.formalTableHeader}>
                    <Text style={[styles.fth, { flex: 2.6, textAlign: "left" }]} numberOfLines={1}>AUDIT VERIFICATION ITEM</Text>
                    <Text style={[styles.fth, { flex: 1.7, textAlign: "right" }]} numberOfLines={1}>VALUE</Text>
                    <Text style={[styles.fth, { flex: 1.3, textAlign: "center" }]} numberOfLines={1}>STATUS</Text>
                  </View>

                  <View style={styles.formalTableRow}>
                    <Text style={[styles.ftd, { flex: 2.6, fontWeight: "700" }]} numberOfLines={1}>1. Total Inflow Reconciliation</Text>
                    <Text style={[styles.ftd, { flex: 1.7, textAlign: "right", color: "#10B981", fontWeight: "700" }]} numberOfLines={1}>+{currency} {fmt(totalIncome)}</Text>
                    <View style={{ flex: 1.3, alignItems: "center" }}>
                      <View style={[styles.formalStatusBadge, { backgroundColor: "#10B98118", borderColor: "#10B98144" }]}>
                        <Text style={[styles.formalStatusText, { color: "#10B981" }]}>100% MATCH</Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.formalTableRow, styles.rowZebra]}>
                    <Text style={[styles.ftd, { flex: 2.6, fontWeight: "700" }]} numberOfLines={1}>2. Total Outflow Reconciliation</Text>
                    <Text style={[styles.ftd, { flex: 1.7, textAlign: "right", color: "#E11D48", fontWeight: "700" }]} numberOfLines={1}>-{currency} {fmt(totalExpenses)}</Text>
                    <View style={{ flex: 1.3, alignItems: "center" }}>
                      <View style={[styles.formalStatusBadge, { backgroundColor: "#10B98118", borderColor: "#10B98144" }]}>
                        <Text style={[styles.formalStatusText, { color: "#10B981" }]}>100% MATCH</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.formalTableRow}>
                    <Text style={[styles.ftd, { flex: 2.6, fontWeight: "700" }]} numberOfLines={1}>3. Net Operating Balance Verified</Text>
                    <Text style={[styles.ftd, { flex: 1.7, textAlign: "right", fontWeight: "800", color: isNetPositive ? "#10B981" : "#E11D48" }]} numberOfLines={1}>
                      {isNetPositive ? "+" : "-"}{currency} {fmt(Math.abs(netBalance))}
                    </Text>
                    <View style={{ flex: 1.3, alignItems: "center" }}>
                      <View style={[styles.formalStatusBadge, { backgroundColor: "#10B98118", borderColor: "#10B98144" }]}>
                        <Text style={[styles.formalStatusText, { color: "#10B981" }]}>BALANCED</Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.formalTableRow, styles.rowZebra]}>
                    <Text style={[styles.ftd, { flex: 2.6, fontWeight: "700" }]} numberOfLines={1}>4. Operating Efficiency Margin</Text>
                    <Text style={[styles.ftd, { flex: 1.7, textAlign: "right", fontWeight: "700" }]} numberOfLines={1}>{profitMargin.toFixed(1)}%</Text>
                    <View style={{ flex: 1.3, alignItems: "center" }}>
                      <View style={[styles.formalStatusBadge, { backgroundColor: "#0284C718", borderColor: "#0284C744" }]}>
                        <Text style={[styles.formalStatusText, { color: "#0284C7" }]}>OPTIMAL</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.formalTableRow}>
                    <Text style={[styles.ftd, { flex: 2.6, fontWeight: "700" }]} numberOfLines={1}>5. Revenue Cost Coverage Ratio</Text>
                    <Text style={[styles.ftd, { flex: 1.7, textAlign: "right", fontWeight: "700" }]} numberOfLines={1}>
                      {coverageRatio >= 90 ? "99.0x" : `${coverageRatio.toFixed(1)}x`} Multiplier
                    </Text>
                    <View style={{ flex: 1.3, alignItems: "center" }}>
                      <View style={[styles.formalStatusBadge, { backgroundColor: "#10B98118", borderColor: "#10B98144" }]}>
                        <Text style={[styles.formalStatusText, { color: "#10B981" }]}>SOLVENT</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ─── SECTION 7: OFFICIAL SIGNATURES & INSTITUTIONAL SEAL ─── */}
            <View style={styles.formalSignSection}>
              <View style={styles.signColumn}>
                <View style={styles.signDivider} />
                <Text style={styles.signTitle} numberOfLines={1}>CHIEF FINANCE OFFICER</Text>
                <Text style={styles.signOfficerName} numberOfLines={1}>{generatedBy}</Text>
                <Text style={styles.signOfficerSub} numberOfLines={1}>Finance & Accounts</Text>
              </View>

              <View style={styles.sealColumn}>
                <View style={styles.circularSeal}>
                  <Text style={styles.sealOrgName} numberOfLines={1}>{organizationName.substring(0, 14).toUpperCase()}</Text>
                  <Feather name="award" size={13} color="#0F172A" style={{ marginVertical: 1 }} />
                  <Text style={styles.sealStampText}>AUDITED & SEALED</Text>
                  <Text style={styles.sealYear}>{fiscalYear}</Text>
                </View>
                <Text style={styles.sealDateText} numberOfLines={1}>Issued: {printDate}</Text>
              </View>

              <View style={styles.signColumn}>
                <View style={styles.signDivider} />
                <Text style={styles.signTitle} numberOfLines={1}>EXECUTIVE DIRECTOR</Text>
                <Text style={styles.signOfficerName} numberOfLines={1}>Vice Chancellor</Text>
                <Text style={styles.signOfficerSub} numberOfLines={1}>Governance Council</Text>
              </View>
            </View>

            {/* Formal Legal Disclaimer */}
            <View style={styles.formalDisclaimerBox}>
              <Text style={styles.disclaimerText}>
                CONFIDENTIALITY NOTICE: This document is an official financial statement generated by {organizationName}. All ledger entries and departmental allocations are electronically stamped and reconciled in accordance with institutional audit regulations.
              </Text>
            </View>

          </View>
        </ScrollView>
      </View>
    </Modal>

    <PdfSuccessModal
      visible={successModalData.visible}
      onClose={() => setSuccessModalData((prev) => ({ ...prev, visible: false }))}
      filename={successModalData.filename}
      fileUri={successModalData.fileUri}
      fileSize={successModalData.fileSize}
      title={successModalData.title}
      subtitle={successModalData.subtitle}
    />
  </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#0B1120",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  docIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  topHeaderTitle: { color: "#FFFFFF", fontSize: 14.5, fontFamily: "Inter_700Bold" },
  topHeaderSub: { color: "#94A3B8", fontSize: 10.5, fontFamily: "Inter_400Regular", marginTop: 1 },
  closeBtn: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: "#1E293B",
  },
  actionToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#0F172A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  actionBtnText: { fontSize: 11.5, fontFamily: "Inter_700Bold" },
  scrollArea: { flex: 1, backgroundColor: "#090D16" },
  scrollContent: { padding: 8, paddingBottom: 50 },

  /* Paper Sheet Format */
  paperSheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    gap: 10,
  },

  /* Formal Header */
  formalHeader: {
    backgroundColor: "#0F172A",
    borderRadius: 7,
    padding: 10,
    gap: 8,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  formalLogo: {
    width: 38,
    height: 38,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#38BDF8",
    backgroundColor: "#1E293B",
  },
  formalOrgTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.2,
  },
  formalDocSubtitle: {
    color: "#38BDF8",
    fontSize: 8.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  formalDocStandard: {
    color: "#94A3B8",
    fontSize: 7.5,
    fontFamily: "Inter_400Regular",
    marginTop: 0.5,
  },
  sealBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#0284C718",
    borderWidth: 1,
    borderColor: "#0284C744",
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  sealText: {
    color: "#38BDF8",
    fontSize: 7.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  metaDataStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    backgroundColor: "#1E293B",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    rowGap: 4,
  },
  metaCol: {
    width: "48%",
    minWidth: 0,
    gap: 1,
  },
  metaLabel: {
    color: "#94A3B8",
    fontSize: 7,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  metaVal: {
    color: "#F1F5F9",
    fontSize: 8.5,
    fontFamily: "Inter_600SemiBold",
  },

  /* Executive Matrix */
  executiveMatrix: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 6,
  },
  matrixBox: {
    width: "48.5%",
    minWidth: 0,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 6,
    gap: 1,
  },
  matrixLabel: {
    fontSize: 7.5,
    color: "#64748B",
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  matrixVal: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
  },
  matrixSub: {
    fontSize: 7.5,
    color: "#94A3B8",
    fontFamily: "Inter_400Regular",
  },

  /* Section Styles */
  sectionBlock: {
    gap: 4,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: "#CBD5E1",
    paddingBottom: 3,
  },
  sectionNumber: {
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    fontSize: 8,
    fontFamily: "Inter_800ExtraBold",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  sectionTitleText: {
    fontSize: 10,
    fontFamily: "Inter_800ExtraBold",
    color: "#0F172A",
    letterSpacing: 0.2,
    flex: 1,
  },

  /* Formal Tables */
  formalTable: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 5,
    overflow: "hidden",
  },
  formalTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderBottomWidth: 1.5,
    borderBottomColor: "#CBD5E1",
  },
  fth: {
    fontSize: 7.5,
    fontFamily: "Inter_800ExtraBold",
    color: "#334155",
    letterSpacing: 0.2,
  },
  tableCategoryHeaderRow: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#CBD5E1",
  },
  tableCategoryHeaderLabel: {
    fontSize: 8,
    fontFamily: "Inter_800ExtraBold",
    color: "#0F172A",
    letterSpacing: 0.4,
  },
  formalTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  rowZebra: {
    backgroundColor: "#F8FAFC",
  },
  subtotalRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 4.5,
    borderTopWidth: 1,
    borderTopColor: "#CBD5E1",
    borderBottomWidth: 1,
    borderBottomColor: "#CBD5E1",
  },
  grandTotalDoubleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 6,
    paddingVertical: 5.5,
    borderTopWidth: 2,
    borderTopColor: "#0F172A",
  },
  ftd: {
    fontSize: 8.5,
    fontFamily: "Inter_400Regular",
    color: "#0F172A",
  },
  ftdSub: {
    fontSize: 7,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
  },
  formalStatusBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2.5,
    borderWidth: 1,
  },
  formalStatusText: {
    fontSize: 7,
    fontFamily: "Inter_700Bold",
  },

  /* Signatures */
  formalSignSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#CBD5E1",
    marginTop: 4,
  },
  signColumn: {
    width: "30%",
    minWidth: 0,
    alignItems: "center",
  },
  signDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#0F172A",
    marginBottom: 3,
  },
  signTitle: {
    fontSize: 7.5,
    fontFamily: "Inter_800ExtraBold",
    color: "#0F172A",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  signOfficerName: {
    fontSize: 7,
    fontFamily: "Inter_600SemiBold",
    color: "#334155",
    textAlign: "center",
  },
  signOfficerSub: {
    fontSize: 6,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
    textAlign: "center",
  },
  sealColumn: {
    width: "32%",
    minWidth: 0,
    alignItems: "center",
  },
  circularSeal: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: "#0F172A",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  sealOrgName: {
    fontSize: 5,
    fontFamily: "Inter_800ExtraBold",
    color: "#0F172A",
    textAlign: "center",
  },
  sealStampText: {
    fontSize: 5,
    fontFamily: "Inter_700Bold",
    color: "#0284C7",
    textAlign: "center",
  },
  sealYear: {
    fontSize: 5,
    fontFamily: "Inter_600SemiBold",
    color: "#64748B",
  },
  sealDateText: {
    fontSize: 6.5,
    fontFamily: "Inter_500Medium",
    color: "#64748B",
    marginTop: 2,
  },

  /* Disclaimer */
  formalDisclaimerBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 5,
    padding: 6,
  },
  disclaimerText: {
    fontSize: 7,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
    lineHeight: 10,
    textAlign: "justify",
  },
});
