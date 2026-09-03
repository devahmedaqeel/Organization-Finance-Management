import React, { useState, useMemo } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { Feather } from "./UniversalIcon";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { useSettings } from "@/context/SettingsContext";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { NormalizedPeriod, createCustomDatePeriod } from "@/services/DatePeriodService";
import {
  generateFinancialHtmlReport,
  downloadCsvReport,
  downloadPdfReport,
} from "@/services/ReportExportService";
import {
  ReportType,
  buildEnterpriseReportData,
} from "@/services/reportDataService";
import { FinancialStatementViewerModal } from "./FinancialStatementViewerModal";
import { PdfSuccessModal } from "./PdfSuccessModal";
import { showFloatingToast } from "@/app/_layout";

interface Props {
  visible: boolean;
  onClose: () => void;
  activePeriod?: NormalizedPeriod;
}

const REPORT_TYPE_OPTIONS: Array<{
  id: ReportType;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}> = [
  {
    id: "consolidated_statement",
    title: "Complete Financial Statement",
    subtitle: "Full multi-page dossier with KPIs, charts, departments, payroll & ledger",
    icon: "file-text",
    color: "#6366F1",
  },
  {
    id: "executive_summary",
    title: "Executive Financial Summary",
    subtitle: "High-level summary with health evaluation, margin analysis & trend curves",
    icon: "award",
    color: "#10B981",
  },
  {
    id: "payroll_audit",
    title: "Staff Payroll & Remuneration Audit",
    subtitle: "Departmental salary disbursals, tax withholdings, allowances & employee slips",
    icon: "users",
    color: "#8B5CF6",
  },
  {
    id: "expense_analysis",
    title: "Operational Expenditure Analysis",
    subtitle: "Detailed breakdown of operational spending, overhead & cost center vouchers",
    icon: "trending-down",
    color: "#F43F5E",
  },
  {
    id: "revenue_analysis",
    title: "Institutional Revenue Statement",
    subtitle: "Capital inflows, institutional grants, fee receipts & active funding streams",
    icon: "trending-up",
    color: "#10B981",
  },
  {
    id: "department_analysis",
    title: "Departmental Cost Center Matrix",
    subtitle: "Allocated budget vs actual utilization, headcount costs & cost-center margins",
    icon: "layers",
    color: "#0EA5E9",
  },
  {
    id: "budget_performance",
    title: "Fiscal Budget Performance Report",
    subtitle: "Authorized budget limits, variance thresholds & remaining capacity",
    icon: "pie-chart",
    color: "#F59E0B",
  },
  {
    id: "general_ledger",
    title: "Audited General Ledger Trail",
    subtitle: "Chronological double-entry transaction trail with reference metadata",
    icon: "book-open",
    color: "#475569",
  },
];

export function DownloadReportModal({ visible, onClose, activePeriod }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { transactions, departments, payroll, budgets } = useFinance();

  const [selectedType, setSelectedType] = useState<ReportType>("consolidated_statement");
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [scope, setScope] = useState<"period" | "all" | "custom">("period");
  const [customStart, setCustomStart] = useState(() => activePeriod?.startDate || "2026-01-01");
  const [customEnd, setCustomEnd] = useState(() => activePeriod?.endDate || "2026-09-01");
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [generating, setGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");

  const [successModalData, setSuccessModalData] = useState<{
    visible: boolean;
    filename: string;
    fileUri?: string;
    title?: string;
    subtitle?: string;
  }>({
    visible: false,
    filename: "",
  });

  const availableDepartments = useMemo(() => {
    const list = departments && departments.length > 0 ? departments.map((d) => d.name) : [];
    const fromTx = transactions.map((t) => t.department).filter(Boolean);
    const fromPr = payroll.map((p) => p.department).filter(Boolean);
    const unique = Array.from(new Set([...list, ...fromTx, ...fromPr])).filter(Boolean);
    return ["all", ...unique];
  }, [departments, transactions, payroll]);

  const effectivePeriod = useMemo(() => {
    if (scope === "custom") {
      return createCustomDatePeriod(customStart, customEnd);
    }
    return activePeriod;
  }, [scope, customStart, customEnd, activePeriod]);

  const compiledEnterpriseData = useMemo(() => {
    return buildEnterpriseReportData(
      transactions,
      budgets,
      payroll,
      departments,
      {
        period: effectivePeriod,
        scope: scope === "custom" ? "period" : scope,
        departmentFilter: selectedDept,
        reportType: selectedType,
      },
      {
        organizationName: settings.organizationName || user?.organization || "DevOrbit Tech Kotli",
        organizationAddress: settings.organizationAddress || "Kotli, Azad Kashmir",
        organizationEmail: (settings.organizationEmail && !settings.organizationEmail.includes("ofm-cloud.com")) ? settings.organizationEmail : (user?.email && !user.email.includes("ofm-cloud.com")) ? user.email : "",
        organizationPhone: (settings.organizationPhone && !settings.organizationPhone.includes("555-0199")) ? settings.organizationPhone : "+92-586-444111",
        organizationLogo: settings.organizationLogo || "",
        currency: settings.currency || "PKR",
        fiscalYear: settings.fiscalYear || "2025-2026",
      },
      {
        name: user?.name || user?.email || "Chief Financial Officer",
        email: (user?.email && !user.email.includes("ofm.org")) ? user.email : "",
        role: user?.role || "Admin",
        organization: settings.organizationName || user?.organization || "DevOrbit Tech Kotli",
      }
    );
  }, [transactions, budgets, payroll, departments, effectivePeriod, scope, selectedDept, selectedType, settings, user]);

  const reportOptsForViewer: ReportOptions = useMemo(() => {
    return {
      organizationName: settings.organizationName || user?.organization || "DevOrbit Tech Kotli",
      organizationAddress: settings.organizationAddress || "Kotli, Azad Kashmir",
      organizationEmail: (settings.organizationEmail && !settings.organizationEmail.includes("ofm-cloud.com")) ? settings.organizationEmail : (user?.email && !user.email.includes("ofm-cloud.com")) ? user.email : "",
      organizationPhone: settings.organizationPhone || "+92-586-444111",
      organizationLogo: settings.organizationLogo || "",
      currency: settings.currency || "PKR",
      fiscalYear: settings.fiscalYear || "2025-2026",
      periodLabel: effectivePeriod?.label || "Selected Audit Scope",
      startDate: effectivePeriod?.startDate,
      endDate: effectivePeriod?.endDate,
      generatedBy: user?.name || user?.email || "Chief Financial Officer",
      generatedByEmail: user?.email || "",
      userRole: user?.role || "Admin",
      totalIncome: compiledEnterpriseData.executiveSummary.totalRevenue,
      totalExpenses: compiledEnterpriseData.executiveSummary.totalExpenses,
      netBalance: compiledEnterpriseData.executiveSummary.netOperatingBalance,
      budgetUtilization: compiledEnterpriseData.executiveSummary.budgetUtilizationPct,
      transactions: compiledEnterpriseData.generalLedger.transactions,
      departments: departments,
      payroll: payroll,
      budgets: budgets,
      reportMode: selectedType,
    };
  }, [settings, user, effectivePeriod, compiledEnterpriseData, departments, payroll, budgets, selectedType]);

  const handlePreview = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const html = generateFinancialHtmlReport(compiledEnterpriseData);
    if (Platform.OS === "web") {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } else {
      setPreviewHtml(html);
      setPreviewModalVisible(true);
    }
  };

  const handleExport = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setGenerating(true);
    setLoadingStep("Collecting authoritative financial data...");

    setTimeout(async () => {
      try {
        setLoadingStep("Validating single source of truth calculations...");
        await new Promise((r) => setTimeout(r, 200));

        setLoadingStep("Generating vector charts & analytics...");
        await new Promise((r) => setTimeout(r, 200));

        setLoadingStep("Compiling official PDF dossier...");


        if (format === "csv") {
          const res = await downloadCsvReport(compiledEnterpriseData);
          setGenerating(false);
          if (res.success) {
            showFloatingToast("Report Exported", `Excel-compatible CSV ready.`);
            onClose();
          } else {
            Alert.alert("Export Error", res.message || "Failed to generate CSV file.");
          }
        } else {
          const res = await downloadPdfReport(compiledEnterpriseData as any);
          setGenerating(false);
          if (res.success) {
            onClose();
            setSuccessModalData({
              visible: true,
              filename: res.filename || `OFM_${selectedType}.pdf`,
              fileUri: res.uri,
              title: "PDF Ready ✓",
              subtitle: "Your PDF has been downloaded successfully.",
            });
          } else {
            onClose();
          }
        }
      } catch (err: any) {
        setGenerating(false);
        Alert.alert("Export Error", err?.message || "An unexpected error occurred while generating report.");
      }
    }, 150);
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={[styles.overlay, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={[styles.headerIcon, { backgroundColor: colors.primary + "18" }]}>
                  <Feather name="download" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.title, { color: colors.foreground }]}>Enterprise Financial Reporting</Text>
                  <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                    Certified PDF & Excel export · Zero-discrepancy verified
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {/* Report Type Selector */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>1. Select Report Dossier Type</Text>
              <View style={{ gap: 8, marginBottom: 16 }}>
                {REPORT_TYPE_OPTIONS.map((opt) => {
                  const isSelected = selectedType === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.reportTypeCard,
                        {
                          backgroundColor: isSelected ? opt.color + "12" : colors.background,
                          borderColor: isSelected ? opt.color : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setSelectedType(opt.id);
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.reportTypeIconBox, { backgroundColor: opt.color + "20" }]}>
                        <Feather name={opt.icon} size={16} color={opt.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.reportTypeTitle, { color: isSelected ? opt.color : colors.foreground }]}>
                          {opt.title}
                        </Text>
                        <Text style={[styles.reportTypeSub, { color: colors.mutedForeground }]}>
                          {opt.subtitle}
                        </Text>
                      </View>
                      <View style={[styles.radioCircle, { borderColor: isSelected ? opt.color : colors.border }]}>
                        {isSelected && <View style={[styles.radioDot, { backgroundColor: opt.color }]} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Scope & Date Filters */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>2. Financial Scope & Date Filter</Text>
              <View style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.toggleBtn, scope === "period" && { backgroundColor: colors.primary }]}
                  onPress={() => setScope("period")}
                >
                  <Text style={[styles.toggleBtnText, { color: scope === "period" ? "#FFF" : colors.foreground }]}>
                    Active Scope
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, scope === "all" && { backgroundColor: colors.primary }]}
                  onPress={() => setScope("all")}
                >
                  <Text style={[styles.toggleBtnText, { color: scope === "all" ? "#FFF" : colors.foreground }]}>
                    All-Time
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, scope === "custom" && { backgroundColor: colors.primary }]}
                  onPress={() => setScope("custom")}
                >
                  <Text style={[styles.toggleBtnText, { color: scope === "custom" ? "#FFF" : colors.foreground }]}>
                    Custom Range
                  </Text>
                </TouchableOpacity>
              </View>

              {scope === "custom" && (
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12, marginTop: 4 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground }}>From Date</Text>
                    <TextInput
                      value={customStart}
                      onChangeText={setCustomStart}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.mutedForeground}
                      style={{
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: colors.foreground,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground }}>To Date</Text>
                    <TextInput
                      value={customEnd}
                      onChangeText={setCustomEnd}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.mutedForeground}
                      style={{
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: colors.foreground,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    />
                  </View>
                </View>
              )}

              {/* Department Cost Center Filter */}
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 14 }]}>3. Cost Center Filter</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {availableDepartments.map((dept) => {
                    const isSel = selectedDept === dept;
                    return (
                      <TouchableOpacity
                        key={dept}
                        style={[
                          styles.deptChip,
                          {
                            backgroundColor: isSel ? colors.primary : colors.background,
                            borderColor: isSel ? "transparent" : colors.border,
                          },
                        ]}
                        onPress={() => setSelectedDept(dept)}
                      >
                        <Text style={[styles.deptChipText, { color: isSel ? "#FFF" : colors.foreground }]}>
                          {dept === "all" ? "All Departments" : dept}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Format Selection */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>4. Output Format</Text>
              <View style={[styles.formatGrid, { marginBottom: 20 }]}>
                <TouchableOpacity
                  style={[
                    styles.formatCard,
                    {
                      backgroundColor: format === "pdf" ? colors.primary + "12" : colors.background,
                      borderColor: format === "pdf" ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setFormat("pdf")}
                >
                  <Feather name="file-text" size={20} color={format === "pdf" ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.formatTitle, { color: format === "pdf" ? colors.primary : colors.foreground }]}>
                    Official PDF Document
                  </Text>
                  <Text style={[styles.formatSub, { color: colors.mutedForeground }]}>
                    High-res vector charts, tables & signatures
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.formatCard,
                    {
                      backgroundColor: format === "csv" ? colors.primary + "12" : colors.background,
                      borderColor: format === "csv" ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setFormat("csv")}
                >
                  <Feather name="grid" size={20} color={format === "csv" ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.formatTitle, { color: format === "csv" ? colors.primary : colors.foreground }]}>
                    Excel Spreadsheet (CSV)
                  </Text>
                  <Text style={[styles.formatSub, { color: colors.mutedForeground }]}>
                    Raw data matrices for Excel/Sheets analysis
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Actions with full bottom safe area padding for Android 3-button navigation bar */}
            <View
              style={[
                styles.footer,
                {
                  borderTopColor: colors.border,
                  paddingBottom:
                    Platform.OS === "android"
                      ? Math.max(insets.bottom, 24) + 16
                      : Platform.OS === "ios"
                      ? Math.max(insets.bottom, 16) + 8
                      : 16,
                },
              ]}
            >
              {generating ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.primary }]}>{loadingStep}</Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
                  <TouchableOpacity
                    style={[styles.previewBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                    onPress={handlePreview}
                  >
                    <Feather name="eye" size={15} color={colors.foreground} />
                    <Text style={[styles.previewBtnText, { color: colors.foreground }]}>Preview</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.exportBtn, { backgroundColor: colors.primary }]}
                    onPress={handleExport}
                  >
                    <Feather name="download" size={16} color="#FFF" />
                    <Text style={styles.exportBtnText}>Generate & Download {format.toUpperCase()} Dossier</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Interactive In-App Statement Preview Modal */}
      {previewModalVisible && (
        <FinancialStatementViewerModal
          visible={previewModalVisible}
          onClose={() => setPreviewModalVisible(false)}
          reportOpts={reportOptsForViewer}
          title={compiledEnterpriseData.reportTitle}
          onPrintDownload={handleExport}
        />
      )}

      {/* Success Modal for Mobile Downloads */}
      {successModalData.visible && (
        <PdfSuccessModal
          visible={successModalData.visible}
          onClose={() => setSuccessModalData((prev) => ({ ...prev, visible: false }))}
          filename={successModalData.filename}
          fileUri={successModalData.fileUri}
          title={successModalData.title}
          subtitle={successModalData.subtitle}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: Platform.OS === "web" ? "center" : "flex-end",
    alignItems: Platform.OS === "web" ? "center" : "stretch",
    padding: Platform.OS === "web" ? 16 : 0,
  },
  sheet: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 640 : "100%",
    borderRadius: Platform.OS === "web" ? 20 : 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: Platform.OS === "web" ? "88%" : "92%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#94A3B8",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.15)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 16.5,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  reportTypeCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  reportTypeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  reportTypeTitle: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  reportTypeSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  toggleRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  deptChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  deptChipText: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  formatGrid: {
    flexDirection: "row",
    gap: 12,
  },
  formatCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  formatTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
  },
  formatSub: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 14,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "700",
  },
  previewBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  exportBtn: {
    flex: 2,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  exportBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
