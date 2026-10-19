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
import { useBottomSheetLayout } from "@/hooks/useBottomSheetLayout";
import { NormalizedPeriod, createCustomDatePeriod, getPresetPeriod } from "@/services/DatePeriodService";
import {
  generateFinancialHtmlReport,
  downloadCsvReport,
  downloadPdfReport,
  ReportOptions,
} from "@/services/ReportExportService";
import {
  ReportType,
  buildEnterpriseReportData,
} from "@/services/reportDataService";
import { ReportHtmlPreviewModal } from "./ReportHtmlPreviewModal";
import { PdfSuccessModal } from "./PdfSuccessModal";
import { showFloatingToast } from "@/utils/toast";
import { sharePdfFile } from "@/services/pdfDownloadService";

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
    subtitle: "Everything: summary, charts, income, expenses, departments, budgets, payroll & all transactions",
    icon: "file-text",
    color: "#6366F1",
  },
  {
    id: "executive_summary",
    title: "Executive Summary",
    subtitle: "Key figures, health score, progress rings and monthly trend",
    icon: "award",
    color: "#10B981",
  },
  {
    id: "payroll_audit",
    title: "Payroll Report",
    subtitle: "Salaries, bonuses and deductions for every employee",
    icon: "users",
    color: "#8B5CF6",
  },
  {
    id: "expense_analysis",
    title: "Expense Report",
    subtitle: "Spending by category with chart, table and monthly trend",
    icon: "trending-down",
    color: "#F43F5E",
  },
  {
    id: "revenue_analysis",
    title: "Income Report",
    subtitle: "Income by source with chart, table and monthly trend",
    icon: "trending-up",
    color: "#10B981",
  },
  {
    id: "department_analysis",
    title: "Department Report",
    subtitle: "Each department's budget, spending, remaining amount and staff",
    icon: "layers",
    color: "#0EA5E9",
  },
  {
    id: "budget_performance",
    title: "Budget Performance",
    subtitle: "Every budget line: allocated, spent, remaining and status",
    icon: "pie-chart",
    color: "#F59E0B",
  },
  {
    id: "general_ledger",
    title: "Transaction List",
    subtitle: "Every transaction in the date range, with totals",
    icon: "book-open",
    color: "#475569",
  },
];

/** Plain-language names for the parts of the report the user can switch on or off. */
const SECTION_LABELS: Record<string, { label: string; hint: string }> = {
  kpis: { label: "Key figures", hint: "Summary cards at the top" },
  executiveSummary: { label: "Executive summary", hint: "Cash statement: income, budget, expenses, net" },
  healthEvaluation: { label: "Financial health score", hint: "Score out of 100 with explanation" },
  radialRings: { label: "Progress rings", hint: "Health, margin, budget used and burn rate" },
  monthlyTrends: { label: "Monthly trend", hint: "Income vs expenses chart and month-by-month table" },
  revenueAnalysis: { label: "Income by category", hint: "Donut chart and table" },
  expenseAnalysis: { label: "Expenses by category", hint: "Donut chart and table" },
  departmentBreakdown: { label: "Departments", hint: "Budget vs spending bars and table" },
  budgetPerformance: { label: "Budget lines", hint: "Allocated, spent and remaining per budget" },
  payrollAudit: { label: "Staff payroll", hint: "Salary, bonus and deductions per employee" },
  generalLedger: { label: "All transactions", hint: "Full list with dates, categories and amounts" },
};

/** Sections the PDF template can render for each report type (mirrors generateFinancialHtmlReport). */
const SECTIONS_BY_TYPE: Record<ReportType, string[]> = {
  consolidated_statement: Object.keys(SECTION_LABELS),
  executive_summary: ["kpis", "executiveSummary", "healthEvaluation", "radialRings", "monthlyTrends"],
  payroll_audit: ["kpis", "payrollAudit"],
  expense_analysis: ["kpis", "monthlyTrends", "expenseAnalysis"],
  revenue_analysis: ["kpis", "monthlyTrends", "revenueAnalysis"],
  department_analysis: ["kpis", "departmentBreakdown"],
  budget_performance: ["kpis", "radialRings", "budgetPerformance"],
  general_ledger: ["kpis", "generalLedger"],
};

const RANGE_PRESETS: Array<{ id: string; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3m", label: "Last 3 months" },
  { id: "last_6m", label: "Last 6 months" },
  { id: "this_year", label: "This year" },
  { id: "prev_year", label: "Last year" },
];

/** Keeps only digits and inserts dashes as the user types: 20260131 → 2026-01-31 */
function formatDateInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function todayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function DownloadReportModal({ visible, onClose, activePeriod }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { maxHeight: sheetMaxHeight, keyboardHeight, scrollRef: sheetScrollRef, onTouchEnd: sheetOnTouchEnd } = useBottomSheetLayout();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { transactions, departments, payroll, budgets } = useFinance();

  const [selectedType, setSelectedType] = useState<ReportType>("consolidated_statement");
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [scope, setScope] = useState<"period" | "all" | "custom">("period");
  const [customStart, setCustomStart] = useState(() => activePeriod?.startDate || `${new Date().getFullYear()}-01-01`);
  const [customEnd, setCustomEnd] = useState(() => activePeriod?.endDate || todayYmd());
  const [customPresetId, setCustomPresetId] = useState<string | null>(null);
  const [customPresetLabel, setCustomPresetLabel] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [customTitle, setCustomTitle] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");

  // Section selections
  const [sections, setSections] = useState({
    executiveSummary: true,
    kpis: true,
    healthEvaluation: true,
    radialRings: true,
    monthlyTrends: true,
    revenueAnalysis: true,
    expenseAnalysis: true,
    departmentBreakdown: true,
    budgetPerformance: true,
    payrollAudit: true,
    generalLedger: true,
  });

  // Chart selections
  const [charts, setCharts] = useState({
    trendLine: true,
    revenueDonut: true,
    expenseDonut: true,
    departmentBars: true,
    radialGauges: true,
  });

  const [successModalData, setSuccessModalData] = useState<{
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

  const availableDepartments = useMemo(() => {
    const list = departments && departments.length > 0 ? departments.map((d) => d.name) : [];
    const fromTx = transactions.map((t) => t.department).filter(Boolean);
    const fromPr = payroll.map((p) => p.department).filter(Boolean);
    const unique = Array.from(new Set([...list, ...fromTx, ...fromPr])).filter(Boolean);
    return ["all", ...unique];
  }, [departments, transactions, payroll]);

  const availableCategories = useMemo(() => {
    const fromTx = transactions.map((t) => t.category).filter(Boolean);
    const fromBg = budgets.map((b) => b.category).filter(Boolean);
    const unique = Array.from(new Set([...fromTx, ...fromBg])).filter(Boolean);
    return ["all", ...unique];
  }, [transactions, budgets]);

  const customRangeError = useMemo(() => {
    if (scope !== "custom") return null;
    if (!isValidYmd(customStart)) return "Enter the start date as YYYY-MM-DD (for example 2026-01-31).";
    if (!isValidYmd(customEnd)) return "Enter the end date as YYYY-MM-DD (for example 2026-06-30).";
    if (customStart > customEnd) return "The start date must be on or before the end date.";
    return null;
  }, [scope, customStart, customEnd]);

  const effectivePeriod = useMemo(() => {
    if (scope === "custom") {
      // While the typed range is incomplete, keep showing the active period instead of a broken one
      if (customRangeError) return activePeriod;
      return createCustomDatePeriod(customStart, customEnd, customPresetLabel || undefined);
    }
    if (scope === "all") {
      return getPresetPeriod("all_time", transactions);
    }
    return activePeriod;
  }, [scope, customStart, customEnd, customPresetLabel, customRangeError, activePeriod, transactions]);

  const compiledEnterpriseData = useMemo(() => {
    return buildEnterpriseReportData(
      transactions,
      budgets,
      payroll,
      departments,
      {
        period: effectivePeriod,
        scope: scope === "all" ? "all" : "period",
        startDate: effectivePeriod?.startDate,
        endDate: effectivePeriod?.endDate,
        departmentFilter: selectedDept,
        categoryFilter: selectedCategory,
        typeFilter: selectedTypeFilter,
        reportType: selectedType,
        customTitle: customTitle.trim() || undefined,
        notes: customNotes.trim() || undefined,
        selectedSections: sections,
        selectedCharts: charts,
      },
      {
        organizationName: settings.organizationName || user?.organization || "Organization Finance Management",
        organizationAddress: settings.organizationAddress || "Enterprise Financial Center",
        organizationEmail: (settings.organizationEmail && !settings.organizationEmail.includes("ofm-cloud.com")) ? settings.organizationEmail : (user?.email && !user.email.includes("ofm-cloud.com")) ? user.email : "",
        organizationPhone: (settings.organizationPhone && !settings.organizationPhone.includes("555-0199")) ? settings.organizationPhone : "",
        organizationLogo: settings.organizationLogo || "",
        currency: settings.currency || "PKR",
        fiscalYear: settings.fiscalYear || "2025-2026",
      },
      {
        name: user?.name || user?.email || "Chief Financial Officer",
        email: (user?.email && !user.email.includes("ofm.org")) ? user.email : "",
        role: user?.role || "Admin",
        organization: settings.organizationName || user?.organization || "Organization Finance Management",
      }
    );
  }, [transactions, budgets, payroll, departments, effectivePeriod, scope, selectedDept, selectedCategory, selectedTypeFilter, selectedType, customTitle, customNotes, sections, charts, settings, user]);


  const handlePreview = () => {
    if (customRangeError) {
      Alert.alert("Check the date range", customRangeError);
      return;
    }
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

  const includedCount = compiledEnterpriseData.generalLedger.transactions.length;

  const relevantSections = SECTIONS_BY_TYPE[selectedType] ?? Object.keys(SECTION_LABELS);
  const allRelevantOn = relevantSections.every((k) => (sections as any)[k] !== false);
  const noSectionSelected = relevantSections.every((k) => (sections as any)[k] === false);
  const setAllRelevant = (on: boolean) => {
    setSections((prev) => {
      const next: any = { ...prev };
      relevantSections.forEach((k) => { next[k] = on; });
      return next;
    });
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  /** Generates the report. `then: "share"` opens the phone's share sheet with the PDF right after it is built. */
  const handleExport = async (forceFormat?: "pdf" | "csv", then: "save" | "share" = "save") => {
    const kind = forceFormat ?? format;
    if (generating) return;
    if (customRangeError) {
      Alert.alert("Check the date range", customRangeError);
      return;
    }
    if (kind === "pdf" && noSectionSelected) {
      Alert.alert("Nothing selected", "Tick at least one item under “What to include”.");
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setGenerating(true);
    setLoadingStep(kind === "pdf" ? "Building report data…" : "Preparing spreadsheet…");
    // Let the spinner paint before the heavy work starts
    await new Promise((r) => setTimeout(r, 60));

    try {
      if (kind === "csv") {
        const res = await downloadCsvReport(compiledEnterpriseData);
        if (res.success) {
          showFloatingToast("Report Exported", "Excel-compatible CSV ready.");
          onClose();
        } else {
          Alert.alert("Export Error", res.message || "Failed to generate CSV file.");
        }
        return;
      }

      setLoadingStep("Rendering charts, tables & pages…");
      const res = await downloadPdfReport(compiledEnterpriseData as any);
      if (res.success && res.uri) {
        let shareNote = "";
        if (then === "share" && Platform.OS !== "web") {
          // Share the real PDF file (WhatsApp, Gmail, Drive…) while this sheet is still open,
          // then show the success card so the same file can also be opened or saved.
          setLoadingStep("Opening share options…");
          try {
            await sharePdfFile(res.uri, res.filename);
            shareNote = "Shared. ";
          } catch (shareErr: any) {
            shareNote = "";
            Alert.alert("Share failed", shareErr?.message || "The PDF was created but could not be shared. Use Share in the next screen to try again.");
          }
        }
        setPreviewModalVisible(false);
        onClose();
        setSuccessModalData({
          visible: true,
          filename: res.filename || `OFM_${selectedType}.pdf`,
          fileUri: res.uri,
          fileSize: res.fileSize,
          title: "PDF Ready ✓",
          subtitle: Platform.OS === "web"
            ? "Your PDF has been downloaded."
            : `${shareNote}Open it, share it (WhatsApp, Gmail, Drive…) or save it to your phone.`,
        });
      } else {
        Alert.alert("PDF Error", res.error || res.message || "The PDF could not be generated. Please try again.");
      }
    } catch (err: any) {
      Alert.alert("Export Error", err?.message || "An unexpected error occurred while generating the report.");
    } finally {
      setGenerating(false);
      setLoadingStep("");
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={[styles.overlay, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }, Platform.OS !== "web" && { maxHeight: sheetMaxHeight }]}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={[styles.headerIcon, { backgroundColor: colors.primary + "18" }]}>
                  <Feather name="download" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.title, { color: colors.foreground }]}>Export Report</Text>
                  <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                    Pick what goes in, preview it, then download
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView ref={sheetScrollRef} onTouchEnd={sheetOnTouchEnd} keyboardShouldPersistTaps="handled" style={styles.body} showsVerticalScrollIndicator={false}>
              {/* Report Type Selector */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>1. Report type</Text>
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
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>2. Date range</Text>
              <View style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.toggleBtn, scope === "period" && { backgroundColor: colors.primary }]}
                  onPress={() => setScope("period")}
                >
                  <Text style={[styles.toggleBtnText, { color: scope === "period" ? "#FFF" : colors.foreground }]}>
                    Current period
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, scope === "all" && { backgroundColor: colors.primary }]}
                  onPress={() => setScope("all")}
                >
                  <Text style={[styles.toggleBtnText, { color: scope === "all" ? "#FFF" : colors.foreground }]}>
                    All time
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, scope === "custom" && { backgroundColor: colors.primary }]}
                  onPress={() => setScope("custom")}
                >
                  <Text style={[styles.toggleBtnText, { color: scope === "custom" ? "#FFF" : colors.foreground }]}>
                    Custom dates
                  </Text>
                </TouchableOpacity>
              </View>

              {scope === "custom" && (
                <View style={{ gap: 10, marginBottom: 12, marginTop: 4 }}>
                  {/* One-tap ranges */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {RANGE_PRESETS.map((p) => {
                      const isSel = customPresetId === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[
                            styles.deptChip,
                            {
                              backgroundColor: isSel ? colors.primary : colors.background,
                              borderColor: isSel ? "transparent" : colors.border,
                            },
                          ]}
                          onPress={() => {
                            const period = getPresetPeriod(p.id);
                            setCustomStart(period.startDate);
                            setCustomEnd(period.endDate);
                            setCustomPresetId(p.id);
                            setCustomPresetLabel(period.label);
                            if (Platform.OS !== "web") Haptics.selectionAsync();
                          }}
                        >
                          <Text style={[styles.deptChipText, { color: isSel ? "#FFF" : colors.foreground }]}>{p.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Exact dates */}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {[
                      { label: "From date", value: customStart, set: setCustomStart, ok: isValidYmd(customStart) },
                      { label: "To date", value: customEnd, set: setCustomEnd, ok: isValidYmd(customEnd) },
                    ].map((f) => (
                      <View key={f.label} style={{ flex: 1, gap: 6 }}>
                        <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                        <View
                          style={[
                            styles.dateInputWrap,
                            {
                              backgroundColor: colors.background,
                              borderColor: f.value.length >= 10 && !f.ok ? colors.expense : colors.border,
                            },
                          ]}
                        >
                          <Feather name="calendar" size={14} color={colors.mutedForeground} />
                          <TextInput
                            value={f.value}
                            onChangeText={(t) => {
                              f.set(formatDateInput(t));
                              setCustomPresetId(null);
                              setCustomPresetLabel(null);
                            }}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={colors.mutedForeground}
                            keyboardType="number-pad"
                            maxLength={10}
                            style={[styles.dateInput, { color: colors.foreground }]}
                          />
                        </View>
                      </View>
                    ))}
                  </View>

                  {customRangeError ? (
                    <View style={styles.rangeErrorRow}>
                      <Feather name="alert-circle" size={13} color={colors.expense} />
                      <Text style={[styles.rangeErrorText, { color: colors.expense }]}>{customRangeError}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* What the report will contain */}
              <View
                style={[
                  styles.rangeSummary,
                  {
                    backgroundColor: (includedCount === 0 ? colors.warning : colors.primary) + "12",
                    borderColor: (includedCount === 0 ? colors.warning : colors.primary) + "40",
                  },
                ]}
              >
                <Feather name={includedCount === 0 ? "alert-triangle" : "check-circle"} size={16} color={includedCount === 0 ? colors.warning : colors.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rangeSummaryTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {compiledEnterpriseData.filters.periodLabel}
                  </Text>
                  <Text style={[styles.rangeSummarySub, { color: colors.mutedForeground }]}>
                    {compiledEnterpriseData.filters.startDate} → {compiledEnterpriseData.filters.endDate} ·{" "}
                    {includedCount === 0
                      ? "no transactions match these filters"
                      : `${includedCount} ${includedCount === 1 ? "transaction" : "transactions"} included`}
                  </Text>
                </View>
              </View>
              {/* Department Cost Center Filter */}
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 14 }]}>3. Filter the data</Text>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>Leave on “All” to include everything.</Text>
              <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
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

              {/* Category Filter */}
              <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {availableCategories.map((cat) => {
                    const isSel = selectedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.deptChip,
                          {
                            backgroundColor: isSel ? colors.primary : colors.background,
                            borderColor: isSel ? "transparent" : colors.border,
                          },
                        ]}
                        onPress={() => setSelectedCategory(cat)}
                      >
                        <Text style={[styles.deptChipText, { color: isSel ? "#FFF" : colors.foreground }]}>
                          {cat === "all" ? "All Categories" : cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Transaction Flow Type Filter */}
              <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Transaction type</Text>
              <View style={[styles.toggleRow, { backgroundColor: colors.background, borderColor: colors.border, marginBottom: 16 }]}>
                <TouchableOpacity
                  style={[styles.toggleBtn, selectedTypeFilter === "all" && { backgroundColor: colors.primary }]}
                  onPress={() => setSelectedTypeFilter("all")}
                >
                  <Text style={[styles.toggleBtnText, { color: selectedTypeFilter === "all" ? "#FFF" : colors.foreground }]}>
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, selectedTypeFilter === "income" && { backgroundColor: "#10B981" }]}
                  onPress={() => setSelectedTypeFilter("income")}
                >
                  <Text style={[styles.toggleBtnText, { color: selectedTypeFilter === "income" ? "#FFF" : colors.foreground }]}>
                    Income only
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, selectedTypeFilter === "expense" && { backgroundColor: "#F43F5E" }]}
                  onPress={() => setSelectedTypeFilter("expense")}
                >
                  <Text style={[styles.toggleBtnText, { color: selectedTypeFilter === "expense" ? "#FFF" : colors.foreground }]}>
                    Expenses only
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Section & Chart Inclusion Toggles */}
              <View style={styles.stepHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>4. What to include</Text>
                <TouchableOpacity onPress={() => setAllRelevant(!allRelevantOn)} hitSlop={8}>
                  <Text style={[styles.stepLink, { color: colors.primary }]}>{allRelevantOn ? "Clear all" : "Select all"}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                Only the parts that belong to the selected report are listed.
              </Text>
              <View style={{ gap: 6, marginBottom: 16 }}>
                {relevantSections.map((key) => {
                  const meta = SECTION_LABELS[key];
                  const isEnabled = (sections as any)[key] !== false;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.sectionToggleRow,
                        {
                          backgroundColor: isEnabled ? colors.primary + "10" : colors.background,
                          borderColor: isEnabled ? colors.primary + "40" : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setSections((prev) => ({ ...prev, [key]: !isEnabled }));
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                      }}
                    >
                      <View style={[styles.checkboxBox, { backgroundColor: isEnabled ? colors.primary : "transparent", borderColor: isEnabled ? colors.primary : colors.border }]}>
                        {isEnabled && <Feather name="check" size={12} color="#FFF" />}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.sectionToggleText, { color: isEnabled ? colors.foreground : colors.mutedForeground }]}>
                          {meta.label}
                        </Text>
                        <Text style={[styles.sectionToggleHint, { color: colors.mutedForeground }]}>{meta.hint}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom Report Title & Auditor Notes */}
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 14 }]}>5. Title & notes (optional)</Text>
              <View style={{ gap: 8, marginBottom: 16 }}>
                <TextInput
                  value={customTitle}
                  onChangeText={setCustomTitle}
                  placeholder="Report title, e.g. January Operations Report"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                />
                <TextInput
                  value={customNotes}
                  onChangeText={setCustomNotes}
                  placeholder="Notes to print at the top of the report"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={2}
                  style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, minHeight: 52, textAlignVertical: "top" }]}
                />
              </View>

              {/* Format Selection */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>6. File format</Text>
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
                    PDF document
                  </Text>
                  <Text style={[styles.formatSub, { color: colors.mutedForeground }]}>
                    Charts, rings, tables — ready to share
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
                    Excel (CSV)
                  </Text>
                  <Text style={[styles.formatSub, { color: colors.mutedForeground }]}>
                    Raw rows for Excel or Google Sheets
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

                  {format === "pdf" && Platform.OS !== "web" ? (
                    <TouchableOpacity
                      style={[styles.previewBtn, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "12", opacity: customRangeError ? 0.55 : 1 }]}
                      onPress={() => handleExport("pdf", "share")}
                      accessibilityLabel="Generate and share PDF"
                    >
                      <Feather name="share-2" size={15} color={colors.primary} />
                      <Text style={[styles.previewBtnText, { color: colors.primary }]}>Share</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.exportBtn, { backgroundColor: colors.primary, opacity: customRangeError ? 0.55 : 1 }]}
                    onPress={() => handleExport()}
                    accessibilityState={{ disabled: !!customRangeError }}
                  >
                    <Feather name="download" size={16} color="#FFF" />
                    <Text style={styles.exportBtnText} numberOfLines={1}>
                      {format === "pdf" ? (Platform.OS === "web" ? "Generate PDF" : "Download") : "Export CSV"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Preview: the exact HTML that becomes the PDF, with the same selections */}
      {previewModalVisible && (
        <ReportHtmlPreviewModal
          visible={previewModalVisible}
          onClose={() => setPreviewModalVisible(false)}
          html={previewHtml}
          title={compiledEnterpriseData.reportTitle}
          subtitle={`${compiledEnterpriseData.filters.periodLabel} · ${includedCount} transactions`}
          onDownload={() => {
            setFormat("pdf");
            handleExport("pdf");
          }}
          onShare={() => {
            setFormat("pdf");
            handleExport("pdf", "share");
          }}
          busy={generating}
        />
      )}

      {/* Success Modal for Mobile Downloads */}
      {successModalData.visible && (
        <PdfSuccessModal
          visible={successModalData.visible}
          onClose={() => setSuccessModalData((prev) => ({ ...prev, visible: false }))}
          filename={successModalData.filename}
          fileUri={successModalData.fileUri}
          fileSize={successModalData.fileSize}
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
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 12,
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
    fontSize: 14,
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
    fontSize: 12,
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
  inputBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "600",
  },
  dateLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  dateInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  dateInput: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", padding: 0 },
  rangeErrorRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  rangeErrorText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  rangeSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  rangeSummaryTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  rangeSummarySub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 4 },
  stepLink: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  stepHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10 },
  filterLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  sectionToggleHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionToggleText: {
    fontSize: 13,
    fontWeight: "600",
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
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  exportBtn: {
    flex: 1.4,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  exportBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
