import { useWebLayout } from "@/hooks/useWebLayout";
import React, { useState, useMemo, useEffect } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, Platform } from "react-native";
import { useFinance, PayrollEntry } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { openPdfReport, buildPayslipHtml } from "@/services/ReportExportService";
import {
  SvgUsers,
  SvgFileText,
  SvgPlus,
  SvgSearch,
  SvgX,
  SvgDollar,
  SvgCheck,
  SvgTrash,
  SvgEdit,
} from "./SvgIcons";
import { WebPayrollModal } from "./modals/WebPayrollModal";
import { WebConfirmModal } from "./modals/WebConfirmModal";
import { FitText } from "./FitText";
import { PayslipViewerModal } from "@/components/payslip/PayslipViewerModal";
import { PayslipTemplateManager } from "@/components/payslip/PayslipTemplateManager";
import { usePayslipOrganizationProfile, usePayslipTemplates } from "@/hooks/usePayslipTemplates";
import { buildPayslipRenderData } from "@/services/payslipTemplateRenderer";
import { generatePayslipsPdf, preparePayslipProfile } from "@/services/payslipDocumentService";

export function WebPayroll() {
  const colors = useColors();
  const { width } = useWebLayout();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const { payroll, deletePayroll, departments } = useFinance();

  const [activePayrollTab, setActivePayrollTab] = useState<"slips" | "templates">("slips");
  const [viewingSlipEntries, setViewingSlipEntries] = useState<PayrollEntry[]>([]);
  const templateLib = usePayslipTemplates();
  const payslipOrg = usePayslipOrganizationProfile();
  const showTemplatesTab = templateLib.canManage || (templateLib.canSelect && user?.role !== "employee");

  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");

  const [modalVisible, setModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);
  const [deletingPayroll, setDeletingPayroll] = useState<PayrollEntry | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "accountant";

  // Months list
  const months = useMemo(() => {
    const set = new Set(payroll.map((p) => p.month));
    return ["all", ...Array.from(set)];
  }, [payroll]);

  // Filtered payroll entries
  const filteredPayroll = useMemo(() => {
    return payroll.filter((p) => {
      // If employee, only show their own record
      if (user?.role === "employee") {
        const isMatch =
          (p.employeeName || "").toLowerCase().includes((user.name || "").toLowerCase()) ||
          (user.email && (p.employeeName || "").toLowerCase().includes(user.email.split("@")[0].toLowerCase()));
        if (!isMatch) return false;
      }

      const matchSearch =
        search.trim() === "" ||
        (p.employeeName || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.employeeId || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.department || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.designation && (p.designation || "").toLowerCase().includes(search.toLowerCase()));

      const matchDept = selectedDept === "all" || p.department === selectedDept;
      const matchMonth = selectedMonth === "all" || p.month === selectedMonth;

      return matchSearch && matchDept && matchMonth;
    });
  }, [payroll, search, selectedDept, selectedMonth, user?.role, user?.name, user?.email]);

  const totalBase = useMemo(() => filteredPayroll.reduce((s, p) => s + (p.baseSalary || 0), 0), [filteredPayroll]);
  const totalBonus = useMemo(() => filteredPayroll.reduce((s, p) => s + (p.bonus || 0), 0), [filteredPayroll]);
  const totalDeductions = useMemo(() => filteredPayroll.reduce((s, p) => s + (p.deductions || 0), 0), [filteredPayroll]);
  const totalNetDisbursed = totalBase + totalBonus - totalDeductions;

  const handleExportEmployeeSlip = async (emp: PayrollEntry) => {
    // Uses the organization default template and the profile logo, same as the in-app preview.
    try {
      const org = await preparePayslipProfile(payslipOrg);
      const slip = buildPayslipRenderData(emp, org, { canViewSensitive: templateLib.canViewSensitive || user?.role === "employee" });
      await generatePayslipsPdf(templateLib.resolve(null), [slip], { organizationId: user?.organizationId });
    } catch (err) {
      console.log("[PAYSLIP] Auto export failed, opening viewer instead:", err);
      setViewingSlipEntries([emp]);
    }
  };

  const hasAutoDownloadedRef = React.useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !hasAutoDownloadedRef.current && payroll.length > 0 && !templateLib.loading) {
      const params = new URLSearchParams(window.location.search);
      const isExportPayslip =
        params.get("export") === "payslip" ||
        params.get("export") === "slip" ||
        (params.get("auto") === "pdf" && params.get("tab") === "payroll");

      if (isExportPayslip) {
        hasAutoDownloadedRef.current = true;
        const targetPayrollId = params.get("payrollId");
        const targetEmpId = params.get("empId");
        const targetEmpName = params.get("employeeName")?.toLowerCase();

        const matchedEmp =
          payroll.find((p) => targetPayrollId && p.id === targetPayrollId) ||
          payroll.find((p) => targetEmpId && (p.employeeId === targetEmpId || p.id === targetEmpId)) ||
          payroll.find((p) => targetEmpName && p.employeeName?.toLowerCase().includes(targetEmpName)) ||
          payroll[0];

        if (matchedEmp) {
          setTimeout(() => {
            handleExportEmployeeSlip(matchedEmp);
          }, 400);
        }
      }
    }
  }, [payroll, settings, user, templateLib.loading]);

  const handleExportPDF = async () => {
    const orgEmail = (settings.organizationEmail && !settings.organizationEmail.includes("ofm-cloud.com"))
      ? settings.organizationEmail
      : (user?.email && !user.email.includes("ofm-cloud.com"))
        ? user.email
        : "";
    const orgPhone = (settings.organizationPhone && !settings.organizationPhone.includes("555-0199"))
      ? settings.organizationPhone
      : "+92-586-444111";

    await openPdfReport({
      organizationName: settings.organizationName || user?.organization || "DevOrbit Tech Kotli",
      organizationAddress: settings.organizationAddress || "Kotli, Azad Kashmir",
      organizationEmail: orgEmail,
      organizationPhone: orgPhone,
      organizationLogo: settings.organizationLogo || "",
      currency: settings.currency || "PKR",
      fiscalYear: settings.fiscalYear || "2025-2026",
      periodLabel: selectedDept !== "all" ? `Payroll (${selectedDept} - ${selectedMonth})` : `Staff Remuneration & Payroll Audit (${selectedMonth})`,
      generatedBy: user?.name || user?.email || "Chief Financial Officer",
      userRole: user?.role,
      totalIncome: 0,
      totalExpenses: totalNetDisbursed,
      netBalance: -totalNetDisbursed,
      budgetUtilization: 0,
      transactions: [],
      departments,
      payroll: filteredPayroll,
      budgets: [],
      includeSummary: true,
      includeCharts: false,
      includeCategories: false,
      includeDepartments: true,
      includePayroll: true,
      includeTransactions: false,
      includeReconciliation: true,
    });
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const exportType = params.get("export");
      // Payslip exports (?export=payslip) are handled once by the effect above.
      if (exportType === "payroll" || exportType === "all") {
        setTimeout(() => {
          handleExportPDF();
        }, 600);
      }
    }
  }, [payroll]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Page header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.primary + "16" }]}>
              <SvgUsers size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Payroll</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
                Salaries, bonuses, deductions and payslips for your staff
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.headerRightActions, isMobile && { width: "100%", justifyContent: "flex-start" }]}>
          {canEdit && activePayrollTab === "slips" && filteredPayroll.length > 0 && (
            <TouchableOpacity
              style={[styles.pBtn, { backgroundColor: colors.card, borderColor: colors.border }, isMobile && { flex: 1 }]}
              onPress={() => setViewingSlipEntries(filteredPayroll)}
              accessibilityLabel="Generate payslips for all listed records"
              activeOpacity={0.8}
            >
              <SvgFileText size={15} color={colors.foreground} />
              <Text style={[styles.pBtnText, { color: colors.foreground }]}>Payslips for all ({filteredPayroll.length})</Text>
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity
              style={[styles.pBtn, { backgroundColor: colors.primary, borderColor: colors.primary }, isMobile && { flex: 1 }]}
              onPress={() => {
                setEditingEntry(null);
                setModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <SvgPlus size={15} color="#FFFFFF" />
              <Text style={[styles.pBtnText, { color: "#FFFFFF" }]}>Add payroll entry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showTemplatesTab && (
        <View style={[styles.pTabs, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
          {([["slips", "Salary slips"], ["templates", "Payslip templates"]] as const).map(([key, label]) => {
            const active = activePayrollTab === key;
            return (
              <TouchableOpacity
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setActivePayrollTab(key)}
                style={[styles.pTab, { borderBottomColor: active ? colors.primary : "transparent" }]}
              >
                <Text style={[styles.pTabText, { color: active ? colors.foreground : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium" }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {activePayrollTab === "templates" && showTemplatesTab ? (
        <PayslipTemplateManager />
      ) : (
      <>
      {/* ─── Summary cards ─── */}
      <View style={styles.metricsGrid}>
        {[
          { label: "Net pay", value: `${settings.currency} ${totalNetDisbursed.toLocaleString()}`, sub: `${filteredPayroll.length} ${filteredPayroll.length === 1 ? "payslip" : "payslips"}`, color: colors.primary },
          { label: "Base salary", value: `${settings.currency} ${totalBase.toLocaleString()}`, sub: "Before bonuses and deductions", color: colors.foreground },
          { label: "Bonuses & allowances", value: `+${settings.currency} ${totalBonus.toLocaleString()}`, sub: "Added to base salary", color: colors.income },
          { label: "Deductions", value: `-${settings.currency} ${totalDeductions.toLocaleString()}`, sub: "Tax, loans and other cuts", color: colors.expense },
        ].map((c) => (
          <View key={c.label} style={[styles.metricCard, styles.pSumCard, { backgroundColor: colors.card, borderColor: colors.border, borderTopColor: c.color === colors.foreground ? colors.info : c.color, minWidth: isMobile ? "100%" : 190 }]}>
            <Text style={[styles.pSumLabel, { color: colors.mutedForeground }]}>{c.label}</Text>
            <FitText style={[styles.pSumValue, { color: c.color }]}>{c.value}</FitText>
            <Text style={[styles.pSumSub, { color: colors.mutedForeground }]}>{c.sub}</Text>
          </View>
        ))}
      </View>

      {/* ─── Search & filters ─── */}
      <View style={[styles.filterBarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <SvgSearch size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name, employee ID, role or department"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
              <SvgX size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.pFilterRow}>
          <Text style={[styles.pFilterLabel, { color: colors.mutedForeground }]}>Department</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {Array.from(new Set(["all", ...departments.map((d) => d.name)].filter(Boolean))).map((dept, idx) => {
              const isSel = selectedDept === dept;
              return (
                <TouchableOpacity
                  key={`${dept}-${idx}`}
                  style={[styles.filterChip, { backgroundColor: isSel ? colors.primary : colors.background, borderColor: isSel ? colors.primary : colors.border }]}
                  onPress={() => setSelectedDept(dept)}
                >
                  <Text style={[styles.filterChipText, { color: isSel ? "#FFFFFF" : colors.foreground }]}>
                    {dept === "all" ? "All" : dept}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={[styles.pResultRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.pResultText, { color: colors.foreground }]}>
            Showing {filteredPayroll.length} {filteredPayroll.length === 1 ? "record" : "records"}
            {selectedDept !== "all" ? ` in ${selectedDept}` : ""}
            {search.trim() ? ` matching "${search.trim()}"` : ""}
          </Text>
          {(selectedDept !== "all" || search.trim().length > 0) && (
            <TouchableOpacity
              onPress={() => {
                setSelectedDept("all");
                setSearch("");
              }}
              style={[styles.pClearBtn, { borderColor: colors.border }]}
            >
              <SvgX size={12} color={colors.primary} />
              <Text style={[styles.pClearText, { color: colors.primary }]}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Mobile cards OR desktop table ─── */}
      {isMobile ? (
        <View style={{ gap: 10 }}>
          {filteredPayroll.length === 0 ? (
            <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8 }]}>
              <SvgFileText size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No payroll records found</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>Clear the filters or add a new payroll entry.</Text>
            </View>
          ) : (
            filteredPayroll.map((p) => {
              const net = (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0);
              return (
                <View key={p.id} style={[styles.mobileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.mobileCardTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.empName, { color: colors.foreground }]}>{p.employeeName}</Text>
                      <FitText style={[styles.empMeta, { color: colors.mutedForeground }]}>
                        {`${p.employeeId} · ${p.designation || "Staff"} · ${p.department}`}
                      </FitText>
                      <PeriodStatus entry={p} />
                    </View>
                    <Text style={[styles.mobileAmount, { color: colors.foreground }]}>
                      {settings.currency} {net.toLocaleString()}
                    </Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    {[
                      { label: "Base", value: `${settings.currency} ${(p.baseSalary || 0).toLocaleString()}`, color: colors.foreground },
                      { label: "Bonus", value: `+${(p.bonus || 0).toLocaleString()}`, color: colors.income },
                      { label: "Deductions", value: `-${(p.deductions || 0).toLocaleString()}`, color: colors.expense },
                    ].map((b) => (
                      <View key={b.label} style={styles.breakdownCol}>
                        <Text style={[styles.pSumSub, { color: colors.mutedForeground }]}>{b.label}</Text>
                        <FitText style={[styles.breakdownVal, { color: b.color }]}>{b.value}</FitText>
                      </View>
                    ))}
                  </View>

                  <View style={styles.mobileActionsRow}>
                    <TouchableOpacity style={[styles.mobileActionBtn, { borderColor: colors.border }]} onPress={() => setViewingSlipEntries([p])}>
                      <SvgFileText size={13} color={colors.foreground} />
                      <Text style={[styles.mobileActionText, { color: colors.foreground }]}>Payslip</Text>
                    </TouchableOpacity>
                    {canEdit && (
                      <>
                        <TouchableOpacity
                          style={[styles.mobileActionBtn, { borderColor: colors.border }]}
                          onPress={() => {
                            setEditingEntry(p);
                            setModalVisible(true);
                          }}
                        >
                          <Text style={[styles.mobileActionText, { color: colors.primary }]}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.mobileActionBtn, { borderColor: colors.expense + "40" }]} onPress={() => setDeletingPayroll(p)}>
                          <Text style={[styles.mobileActionText, { color: colors.expense }]}>Delete</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : (
        <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }} showsHorizontalScrollIndicator>
            <View style={{ minWidth: 1080, width: "100%" }}>
              {/* Header */}
              <View style={[styles.tableHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                {PAY_COLS.map((c) => (
                  <View key={c.key} style={[styles.pCell, c.style]}>
                    <Text numberOfLines={1} style={[styles.pTh, { color: colors.mutedForeground, textAlign: c.align }]}>{c.label}</Text>
                  </View>
                ))}
              </View>

              {filteredPayroll.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <SvgFileText size={36} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No payroll records found</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                    Clear the filters, or click "Add payroll entry" to create one.
                  </Text>
                </View>
              ) : (
                <>
                  {filteredPayroll.map((p) => {
                    const net = (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0);
                    const pending = p.paymentStatus === "pending";
                    const tone = pending ? colors.warning : colors.income;
                    return (
                      <View key={p.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                        <View style={[styles.pCell, PAY_COLS[0].style, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
                          <View style={[styles.pAvatar, { backgroundColor: colors.info + "18" }]}>
                            <Text style={[styles.pAvatarText, { color: colors.info }]}>
                              {(p.employeeName || "E").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <FitText style={[styles.empName, { color: colors.foreground }]}>{p.employeeName}</FitText>
                            <FitText style={[styles.empMeta, { color: colors.mutedForeground }]}>{`${p.employeeId} · ${p.designation || "Staff"}`}</FitText>
                          </View>
                        </View>
                        <View style={[styles.pCell, PAY_COLS[1].style]}>
                          <FitText style={[styles.pCellText, { color: colors.foreground }]}>{p.month}</FitText>
                        </View>
                        <View style={[styles.pCell, PAY_COLS[2].style]}>
                          <FitText style={[styles.pCellText, { color: colors.foreground }]}>{p.department || "—"}</FitText>
                        </View>
                        <View style={[styles.pCell, PAY_COLS[3].style]}>
                          <FitText style={[styles.pAmt, { color: colors.foreground }]}>{`${settings.currency} ${(p.baseSalary || 0).toLocaleString()}`}</FitText>
                        </View>
                        <View style={[styles.pCell, PAY_COLS[4].style]}>
                          <FitText style={[styles.pAmt, { color: colors.income }]}>{`+${(p.bonus || 0).toLocaleString()}`}</FitText>
                        </View>
                        <View style={[styles.pCell, PAY_COLS[5].style]}>
                          <FitText style={[styles.pAmt, { color: colors.expense }]}>{`-${(p.deductions || 0).toLocaleString()}`}</FitText>
                        </View>
                        <View style={[styles.pCell, PAY_COLS[6].style]}>
                          <FitText style={[styles.pNet, { color: colors.foreground }]}>{`${settings.currency} ${net.toLocaleString()}`}</FitText>
                        </View>
                        <View style={[styles.pCell, PAY_COLS[7].style, { alignItems: "center" }]}>
                          <View style={[styles.pStatus, { backgroundColor: tone + "16" }]}>
                            <View style={[styles.pDot, { backgroundColor: tone }]} />
                            <Text numberOfLines={1} style={[styles.pStatusText, { color: tone }]}>{pending ? "Pending" : "Paid"}</Text>
                          </View>
                        </View>
                        <View style={[styles.pCell, PAY_COLS[8].style, { flexDirection: "row", justifyContent: "flex-end", gap: 6 }]}>
                          <TouchableOpacity style={[styles.pIconBtn, { borderColor: colors.border }]} onPress={() => setViewingSlipEntries([p])} accessibilityLabel="Open payslip">
                            <SvgFileText size={14} color={colors.foreground} />
                          </TouchableOpacity>
                          {canEdit && (
                            <>
                              <TouchableOpacity
                                style={[styles.pIconBtn, { borderColor: colors.border }]}
                                onPress={() => {
                                  setEditingEntry(p);
                                  setModalVisible(true);
                                }}
                                accessibilityLabel="Edit entry"
                              >
                                <SvgEdit size={14} color={colors.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.pIconBtn, { borderColor: colors.expense + "40" }]} onPress={() => setDeletingPayroll(p)} accessibilityLabel="Delete entry">
                                <SvgTrash size={14} color={colors.expense} />
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}

                  {/* Totals */}
                  <View style={[styles.tableRow, { borderBottomWidth: 0, backgroundColor: colors.background }]}>
                    <View style={[styles.pCell, PAY_COLS[0].style]}>
                      <Text numberOfLines={1} style={[styles.pNet, { color: colors.foreground }]}>Total ({filteredPayroll.length})</Text>
                    </View>
                    <View style={[styles.pCell, PAY_COLS[1].style]} />
                    <View style={[styles.pCell, PAY_COLS[2].style]} />
                    <View style={[styles.pCell, PAY_COLS[3].style]}>
                      <FitText style={[styles.pNet, { color: colors.foreground }]}>{`${settings.currency} ${totalBase.toLocaleString()}`}</FitText>
                    </View>
                    <View style={[styles.pCell, PAY_COLS[4].style]}>
                      <FitText style={[styles.pNet, { color: colors.income }]}>{`+${totalBonus.toLocaleString()}`}</FitText>
                    </View>
                    <View style={[styles.pCell, PAY_COLS[5].style]}>
                      <FitText style={[styles.pNet, { color: colors.expense }]}>{`-${totalDeductions.toLocaleString()}`}</FitText>
                    </View>
                    <View style={[styles.pCell, PAY_COLS[6].style]}>
                      <FitText style={[styles.pNet, { color: colors.primary }]}>{`${settings.currency} ${totalNetDisbursed.toLocaleString()}`}</FitText>
                    </View>
                    <View style={[styles.pCell, PAY_COLS[7].style]} />
                    <View style={[styles.pCell, PAY_COLS[8].style]} />
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      )}
      </>
      )}

      {/* Add / Edit Modal */}
      <WebPayrollModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingEntry(null);
        }}
        entryToEdit={editingEntry}
      />

      {/* Template-aware Salary Slip Viewer (individual or bulk) */}
      <PayslipViewerModal
        visible={viewingSlipEntries.length > 0}
        entries={viewingSlipEntries}
        onClose={() => setViewingSlipEntries([])}
      />

      {/* Confirmation Modal */}
      <WebConfirmModal
        visible={Boolean(deletingPayroll)}
        onClose={() => setDeletingPayroll(null)}
        onConfirm={() => {
          if (deletingPayroll) {
            deletePayroll(deletingPayroll.id);
          }
        }}
        title="Delete Payroll Record"
        message={`Are you sure you want to delete the payroll record for ${deletingPayroll?.employeeName} (${deletingPayroll?.employeeId}) for ${deletingPayroll?.month}?`}
        confirmText="Delete Payroll Slip"
      />
    </ScrollView>
  );
}

/** Pay period + payment status badge (same as the mobile app payroll list). */
function PeriodStatus({ entry }: { entry: PayrollEntry }) {
  const colors = useColors();
  const pending = entry.paymentStatus === "pending";
  const tone = pending ? "#F59E0B" : colors.income;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
      <Text style={{ fontSize: 12.5, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Period {entry.month}</Text>
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: tone + "16" }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: tone }}>{pending ? "Pending" : "Paid"}</Text>
      </View>
    </View>
  );
}

// Column layout shared by the header, rows and totals so every value lines up.
const PAY_COLS = [
  { key: "emp", label: "Employee", align: "left", style: { flex: 1, minWidth: 230, paddingLeft: 16 } },
  { key: "period", label: "Period", align: "left", style: { width: 90 } },
  { key: "dept", label: "Department", align: "left", style: { width: 120 } },
  { key: "base", label: "Base salary", align: "right", style: { width: 120 } },
  { key: "bonus", label: "Bonus", align: "right", style: { width: 95 } },
  { key: "ded", label: "Deductions", align: "right", style: { width: 105 } },
  { key: "net", label: "Net pay", align: "right", style: { width: 125 } },
  { key: "status", label: "Status", align: "center", style: { width: 95 } },
  { key: "act", label: "Actions", align: "right", style: { width: 130, paddingRight: 16 } },
] as const;

const styles = StyleSheet.create({
  pBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 38, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, justifyContent: "center" },
  pBtnText: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  pTabs: { flexDirection: "row", gap: 4, borderBottomWidth: 1 },
  pTab: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 2, marginBottom: -1 },
  pTabText: { fontSize: 14 },
  pSumCard: { borderTopWidth: 3, gap: 6 },
  pSumLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  pSumValue: { fontSize: 22, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  pSumSub: { fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 18 },
  pFilterRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pFilterLabel: { width: 90, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pResultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, paddingTop: 12, borderTopWidth: 1 },
  pResultText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  pClearBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1 },
  pClearText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pCell: { paddingHorizontal: 8, justifyContent: "center" },
  pTh: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  pCellText: { fontSize: 13.5, fontFamily: "Inter_400Regular" },
  pAmt: { fontSize: 13.5, fontFamily: "Inter_500Medium", textAlign: "right" },
  pNet: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  pAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  pAvatarText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  pStatus: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pDot: { width: 7, height: 7, borderRadius: 4 },
  pStatusText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  pIconBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabText: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
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
    letterSpacing: -0.1,
    marginTop: 2,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
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
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  outlineBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 200,
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11.5,
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
  filterBarCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    outlineStyle: "none",
  } as any,
  filterGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  filterChip: {
    paddingHorizontal: 14,
    height: 32,
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  mobileCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  mobileCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  mobileAmount: {
    fontSize: 16,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.3,
  },
  breakdownBox: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  breakdownCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  breakdownLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  breakdownVal: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  mobileActionsRow: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 8,
  },
  mobileActionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  mobileActionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tableCard: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    width: "100%",
    maxWidth: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  thCol: {
    flexDirection: "row",
    alignItems: "center",
  },
  thText: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tdCol: {
    justifyContent: "center",
  },
  empName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },
  empMeta: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  deptText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  amountCell: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
  netAmountText: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  actionIconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  emptyWrap: {
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
