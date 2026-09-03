import React, { useState, useMemo, useEffect } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions, Platform } from "react-native";
import { useFinance, PayrollEntry } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { openPdfReport, buildPayslipHtml } from "@/services/ReportExportService";
import { downloadPayslipPDF } from "@/services/payslipExportService";
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

export function WebPayroll() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const { payroll, deletePayroll, departments } = useFinance();

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
          p.employeeName.toLowerCase().includes((user.name || "").toLowerCase()) ||
          (user.email && p.employeeName.toLowerCase().includes(user.email.split("@")[0].toLowerCase()));
        if (!isMatch) return false;
      }

      const matchSearch =
        search.trim() === "" ||
        p.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        p.employeeId.toLowerCase().includes(search.toLowerCase()) ||
        p.department.toLowerCase().includes(search.toLowerCase()) ||
        (p.designation && p.designation.toLowerCase().includes(search.toLowerCase()));

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
    const orgEmail = (settings.organizationEmail && !settings.organizationEmail.includes("ofm-cloud.com"))
      ? settings.organizationEmail
      : (user?.email && !user.email.includes("ofm-cloud.com"))
        ? user.email
        : "";
    const orgPhone = (settings.organizationPhone && !settings.organizationPhone.includes("555-0199"))
      ? settings.organizationPhone
      : "+92-586-444111";

    const orgInfo = {
      name: settings.organizationName || user?.organization || "DevOrbit Tech Kotli",
      address: settings.organizationAddress || "Kotli, Azad Kashmir",
      email: orgEmail,
      phone: orgPhone,
      currency: settings.currency || "PKR",
      fiscalYear: settings.fiscalYear || "2025-2026",
    };
    if (Platform.OS === "web") {
      const html = buildPayslipHtml(emp, orgInfo);
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } else {
      await downloadPayslipPDF(emp, orgInfo);
    }
  };

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
      if (exportType === "payslip" || exportType === "slip") {
        const empId = params.get("empId") || params.get("employeeId");
        if (empId && payroll.length > 0) {
          const matchedEmp = payroll.find(
            (p) => p.id === empId || p.employeeId === empId || p.employeeName.toLowerCase().includes(empId.toLowerCase())
          );
          if (matchedEmp) {
            setTimeout(() => {
              handleExportEmployeeSlip(matchedEmp);
            }, 600);
          }
        }
      } else if (exportType === "payroll" || exportType === "all") {
        setTimeout(() => {
          handleExportPDF();
        }, 600);
      }
    }
  }, [payroll]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Page Title & Action Bar ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: "#8B5CF620" }]}>
              <SvgUsers size={20} color="#8B5CF6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Staff Payroll & Compensation</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                Monthly staff remuneration, allowances, statutory deductions, and net disbursals
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.headerRightActions, isMobile && { width: "100%", justifyContent: "flex-start" }]}>
          {canEdit && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#8B5CF6" }, isMobile && { flex: 1 }]}
              onPress={() => {
                setEditingEntry(null);
                setModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <SvgPlus size={15} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Add Entry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Payroll KPIs ─── */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>NET DISBURSED DISBURSAL</Text>
          <Text style={[styles.metricValue, { color: "#8B5CF6" }]}>
            {settings.currency} {totalNetDisbursed.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {filteredPayroll.length} Staff Slips Generated
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL BASE SALARY</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>
            {settings.currency} {totalBase.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Base Compensation
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>BONUSES & ALLOWANCES</Text>
          <Text style={[styles.metricValue, { color: colors.income }]}>
            +{settings.currency} {totalBonus.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Deductions: -{settings.currency} {totalDeductions.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* ─── Search & Filters ─── */}
      <View style={[styles.filterBarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <SvgSearch size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search staff payroll by employee name, ID, designation, department..."
            placeholderTextColor={colors.mutedForeground + "80"}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <SvgX size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Department:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {["all", ...(departments.length > 0 ? departments.map((d) => d.name) : ["Software Engineering", "Administration", "Finance", "Research & Development"])].map((dept) => (
                  <TouchableOpacity
                    key={dept}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: selectedDept === dept ? "#8B5CF6" : colors.background,
                        borderColor: selectedDept === dept ? "transparent" : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedDept(dept)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: selectedDept === dept ? "#FFFFFF" : colors.foreground },
                      ]}
                    >
                      {dept === "all" ? "All Departments" : dept}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </View>

      {/* ─── Mobile Card List OR Desktop Data Table ─── */}
      {isMobile ? (
        <View style={{ gap: 10 }}>
          {filteredPayroll.length === 0 ? (
            <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14 }]}>
              <SvgFileText size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No payroll records matching filters</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Try clearing your search query or generate a new payroll entry.
              </Text>
            </View>
          ) : (
            filteredPayroll.map((p) => {
              const net = (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0);
              return (
                <View
                  key={p.id}
                  style={[
                    styles.mobileCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.mobileCardTop}>
                    <View>
                      <Text style={[styles.empName, { color: colors.foreground }]}>{p.employeeName}</Text>
                      <Text style={[styles.empMeta, { color: colors.mutedForeground }]}>
                        {p.employeeId} · {p.designation || p.department}
                      </Text>
                    </View>
                    <Text style={[styles.mobileAmount, { color: "#8B5CF6" }]}>
                      {settings.currency} {net.toLocaleString()}
                    </Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.breakdownCol}>
                      <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>BASE</Text>
                      <Text style={[styles.breakdownVal, { color: colors.foreground }]}>
                        {settings.currency} {p.baseSalary?.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.breakdownCol}>
                      <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>BONUS</Text>
                      <Text style={[styles.breakdownVal, { color: colors.income }]}>
                        +{settings.currency} {p.bonus?.toLocaleString() || "0"}
                      </Text>
                    </View>
                    <View style={styles.breakdownCol}>
                      <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>DEDUCT</Text>
                      <Text style={[styles.breakdownVal, { color: colors.expense }]}>
                        -{settings.currency} {p.deductions?.toLocaleString() || "0"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.mobileActionsRow}>
                    <TouchableOpacity
                      style={[styles.mobileActionBtn, { borderColor: "#8B5CF640", backgroundColor: "#8B5CF612" }]}
                      onPress={() => handleExportEmployeeSlip(p)}
                    >
                      <SvgFileText size={12} color="#8B5CF6" />
                      <Text style={[styles.mobileActionText, { color: "#8B5CF6" }]}>PDF Slip</Text>
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

                        <TouchableOpacity
                          style={[styles.mobileActionBtn, { borderColor: colors.expense + "40", backgroundColor: colors.expense + "10" }]}
                          onPress={() => setDeletingPayroll(p)}
                        >
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
          <View style={[styles.tableHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
            <View style={[styles.thCol, { flex: 2.2 }]}>
              <Text style={[styles.thText, { color: colors.mutedForeground }]}>EMPLOYEE</Text>
            </View>
            <View style={[styles.thCol, { flex: 1.8 }]}>
              <Text style={[styles.thText, { color: colors.mutedForeground }]}>DEPARTMENT</Text>
            </View>
            <View style={[styles.thCol, { flex: 1.1, justifyContent: "flex-end" }]}>
              <Text style={[styles.thText, { color: colors.mutedForeground, textAlign: "right" }]}>BASE</Text>
            </View>
            <View style={[styles.thCol, { flex: 1.0, justifyContent: "flex-end" }]}>
              <Text style={[styles.thText, { color: colors.mutedForeground, textAlign: "right" }]}>BONUS</Text>
            </View>
            <View style={[styles.thCol, { flex: 1.0, justifyContent: "flex-end" }]}>
              <Text style={[styles.thText, { color: colors.mutedForeground, textAlign: "right" }]}>DEDUCTIONS</Text>
            </View>
            <View style={[styles.thCol, { flex: 1.2, justifyContent: "flex-end" }]}>
              <Text style={[styles.thText, { color: colors.mutedForeground, textAlign: "right" }]}>NET SALARY</Text>
            </View>
            <View style={[styles.thCol, { flex: 1.5, justifyContent: "center" }]}>
              <Text style={[styles.thText, { color: colors.mutedForeground, textAlign: "center" }]}>ACTIONS</Text>
            </View>
          </View>

          {filteredPayroll.length === 0 ? (
            <View style={styles.emptyWrap}>
              <SvgFileText size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No payroll entries recorded</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Click "Add Entry" to generate a staff payroll slip.
              </Text>
            </View>
          ) : (
            filteredPayroll.map((p) => {
              const net = (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0);
              return (
                <View key={p.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.tdCol, { flex: 2.2 }]}>
                    <Text style={[styles.empName, { color: colors.foreground }]}>
                      {p.employeeName}
                    </Text>
                    <Text style={[styles.empMeta, { color: colors.mutedForeground }]}>
                      {p.employeeId} · {p.designation || "Staff"}
                    </Text>
                  </View>

                  <View style={[styles.tdCol, { flex: 1.8 }]}>
                    <Text style={[styles.deptText, { color: colors.foreground }]}>
                      {p.department}
                    </Text>
                  </View>

                  <View style={[styles.tdCol, { flex: 1.1, alignItems: "flex-end" }]}>
                    <Text style={[styles.amountCell, { color: colors.foreground }]}>
                      {settings.currency} {p.baseSalary?.toLocaleString()}
                    </Text>
                  </View>

                  <View style={[styles.tdCol, { flex: 1.0, alignItems: "flex-end" }]}>
                    <Text style={[styles.amountCell, { color: colors.income }]}>
                      +{settings.currency} {p.bonus?.toLocaleString() || "0"}
                    </Text>
                  </View>

                  <View style={[styles.tdCol, { flex: 1.0, alignItems: "flex-end" }]}>
                    <Text style={[styles.amountCell, { color: colors.expense }]}>
                      -{settings.currency} {p.deductions?.toLocaleString() || "0"}
                    </Text>
                  </View>

                  <View style={[styles.tdCol, { flex: 1.2, alignItems: "flex-end" }]}>
                    <Text style={[styles.netAmountText, { color: "#8B5CF6" }]}>
                      {settings.currency} {net.toLocaleString()}
                    </Text>
                  </View>

                  <View style={[styles.tdCol, { flex: 1.5, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }]}>
                    <TouchableOpacity
                      style={[styles.actionIconBtn, { borderColor: "#8B5CF640", backgroundColor: "#8B5CF615", paddingHorizontal: 9, width: "auto" }]}
                      onPress={() => handleExportEmployeeSlip(p)}
                    >
                      <SvgFileText size={12} color="#8B5CF6" />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "#8B5CF6", marginLeft: 4 }}>Slip</Text>
                    </TouchableOpacity>

                    {canEdit && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionIconBtn, { borderColor: "#3B82F630", backgroundColor: "#3B82F612" }]}
                          onPress={() => {
                            setEditingEntry(p);
                            setModalVisible(true);
                          }}
                        >
                          <SvgEdit size={14} color="#3B82F6" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionIconBtn, { borderColor: "#F43F5E30", backgroundColor: "#F43F5E12" }]}
                          onPress={() => setDeletingPayroll(p)}
                        >
                          <SvgTrash size={14} color="#F43F5E" />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Modal */}
      <WebPayrollModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingEntry(null);
        }}
        entryToEdit={editingEntry}
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

const styles = StyleSheet.create({
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
  filterBarCard: {
    borderRadius: 16,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  mobileCard: {
    borderRadius: 14,
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
    fontSize: 9.5,
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
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  thCol: {
    flexDirection: "row",
    alignItems: "center",
  },
  thText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  tdCol: {
    justifyContent: "center",
  },
  empName: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  empMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1.5,
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
