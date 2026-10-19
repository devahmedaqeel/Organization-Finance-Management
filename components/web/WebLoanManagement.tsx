import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions, Modal } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useFinance } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import {
  EmployeeLoan,
  LoanStatus,
  LoanType,
  getLoans,
  createLoan,
  approveLoan,
} from "@/services/LoanService";
import { SvgPlus, SvgSearch, SvgCheck, SvgX, SvgDollar } from "./SvgIcons";

export function WebLoanManagement() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { user } = useAuth();
  const { settings } = useSettings();
  const { payroll, departments } = useFinance();
  const orgId = user?.organizationId || "demo-org";

  const [loans, setLoans] = useState<EmployeeLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | LoanStatus>("all");
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  // Form states
  const [empName, setEmpName] = useState("");
  const [empId, setEmpId] = useState("");
  const [dept, setDept] = useState(departments[0]?.name || "");
  const [loanType, setLoanType] = useState<LoanType>("Salary Advance");
  const [principal, setPrincipal] = useState("");
  const [totalInstallments, setTotalInstallments] = useState("3");
  const [monthlyInstallment, setMonthlyInstallment] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);

  const canManage = user?.role === "admin" || user?.role === "accountant";

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getLoans(orgId);
      setLoans(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  // Auto calculate monthly installment
  useEffect(() => {
    const p = Number(principal || 0);
    const n = Math.max(1, Number(totalInstallments || 1));
    if (p > 0) {
      setMonthlyInstallment(String(Math.round(p / n)));
    }
  }, [principal, totalInstallments]);

  // Extract known employees from payroll
  const knownEmployees = useMemo(() => {
    const map = new Map<string, { name: string; employeeId: string; department: string }>();
    payroll.forEach((p) => {
      if (p.employeeName) {
        const key = p.employeeName.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name: p.employeeName.trim(),
            employeeId: p.employeeId,
            department: p.department || "",
          });
        }
      }
    });
    return Array.from(map.values());
  }, [payroll]);

  const handleSelectEmployee = (staff: { name: string; employeeId: string; department: string }) => {
    setEmpName(staff.name);
    setEmpId(staff.employeeId);
    if (staff.department) setDept(staff.department);
  };

  const handleOpenAdd = () => {
    if (knownEmployees.length > 0) {
      setEmpName(knownEmployees[0].name);
      setEmpId(knownEmployees[0].employeeId);
      setDept(knownEmployees[0].department);
    } else {
      setEmpName("");
      setEmpId("EMP-001");
      setDept(departments[0]?.name || "");
    }
    setLoanType("Salary Advance");
    setPrincipal("");
    setTotalInstallments("3");
    setPurpose("");
    setModalVisible(true);
  };

  const handleSaveLoan = async () => {
    if (!empName.trim() || !principal) return;
    setSaving(true);
    try {
      await createLoan(
        {
          organizationId: orgId,
          employeeId: empId.trim() || "EMP-001",
          employeeName: empName.trim(),
          department: dept,
          loanType,
          principalAmount: Number(principal),
          totalInstallments: Number(totalInstallments || 1),
          monthlyInstallment: Number(monthlyInstallment || 0),
          startDate: new Date().toISOString().substring(0, 7),
          status: "active",
          purpose: purpose.trim(),
        },
        {
          id: user?.id || "anon",
          name: user?.name || user?.email || "Admin",
          role: user?.role || "admin",
        }
      );
      setModalVisible(false);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (loanId: string) => {
    try {
      await approveLoan(loanId, orgId, {
        id: user?.id || "anon",
        name: user?.name || user?.email || "Admin",
        role: user?.role || "admin",
      });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  // KPIs
  const totalPrincipalDisbursed = useMemo(() => loans.reduce((s, l) => s + (l.principalAmount || 0), 0), [loans]);
  const totalOutstanding = useMemo(() => loans.reduce((s, l) => s + (l.outstandingBalance || 0), 0), [loans]);
  const activeCount = useMemo(() => loans.filter((l) => l.status === "active" || l.status === "approved").length, [loans]);
  const monthlyDue = useMemo(
    () =>
      loans
        .filter((l) => (l.status === "active" || l.status === "approved") && l.outstandingBalance > 0)
        .reduce((s, l) => s + Math.min(l.monthlyInstallment || 0, l.outstandingBalance || 0), 0),
    [loans]
  );

  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          l.employeeName.toLowerCase().includes(q) ||
          l.employeeId.toLowerCase().includes(q) ||
          l.loanType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [loans, statusFilter, search]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerBar}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Staff Loans & Salary Advances</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Track company advances, personal loans, monthly payroll deductions, and remaining balances.
          </Text>
        </View>
        {canManage && (
          <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: "#8B5CF6" }]} onPress={handleOpenAdd}>
            <SvgPlus size={14} color="#FFFFFF" />
            <Text style={styles.btnPrimaryText}>Issue Advance / Loan</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* KPI Tiles */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>ACTIVE LOANS</Text>
          <Text style={[styles.kpiVal, { color: "#8B5CF6" }]}>{activeCount}</Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>Staff in repayment</Text>
        </View>
        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>TOTAL DISBURSED</Text>
          <Text style={[styles.kpiVal, { color: colors.foreground }]}>
            {settings.currency} {totalPrincipalDisbursed.toLocaleString()}
          </Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>Cumulative advances</Text>
        </View>
        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>TOTAL OUTSTANDING</Text>
          <Text style={[styles.kpiVal, { color: "#F43F5E" }]}>
            {settings.currency} {totalOutstanding.toLocaleString()}
          </Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>Pending recovery</Text>
        </View>
        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>MONTHLY RECOVERY DUE</Text>
          <Text style={[styles.kpiVal, { color: "#10B981" }]}>
            {settings.currency} {monthlyDue.toLocaleString()}
          </Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>Auto-deducted in payroll</Text>
        </View>
      </View>

      {/* Toolbar */}
      <View style={[styles.toolbar, isMobile && { flexDirection: "column", alignItems: "stretch" }]}>
        <View style={styles.tabsRow}>
          {(["all", "active", "completed", "pending"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabBtn,
                statusFilter === tab && { backgroundColor: "#8B5CF622", borderColor: "#8B5CF6" },
              ]}
              onPress={() => setStatusFilter(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: statusFilter === tab ? "#8B5CF6" : colors.mutedForeground },
                ]}
              >
                {tab === "all" ? "All Loans" : tab === "active" ? "Active" : tab === "completed" ? "Paid Off" : "Pending"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SvgSearch size={14} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by staff name or ID..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Table */}
      <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.tableHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.th, { flex: 2, color: colors.mutedForeground }]}>EMPLOYEE / DEPT</Text>
          <Text style={[styles.th, { flex: 1.5, color: colors.mutedForeground }]}>LOAN TYPE</Text>
          <Text style={[styles.th, { flex: 1.2, textAlign: "right", color: colors.mutedForeground }]}>PRINCIPAL</Text>
          <Text style={[styles.th, { flex: 1.2, textAlign: "right", color: colors.mutedForeground }]}>INSTALLMENT</Text>
          <Text style={[styles.th, { flex: 1.2, textAlign: "center", color: colors.mutedForeground }]}>PROGRESS</Text>
          <Text style={[styles.th, { flex: 1.2, textAlign: "right", color: colors.mutedForeground }]}>OUTSTANDING</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "center", color: colors.mutedForeground }]}>STATUS</Text>
        </View>

        <ScrollView style={{ maxHeight: 520 }}>
          {filteredLoans.length === 0 ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No loans or salary advances found.</Text>
            </View>
          ) : (
            filteredLoans.map((item) => (
              <View key={item.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 2 }}>
                  <Text style={[styles.empName, { color: colors.foreground }]}>{item.employeeName}</Text>
                  <Text style={[styles.subText, { color: colors.mutedForeground }]}>
                    {item.employeeId} · {item.department || "General"}
                  </Text>
                </View>

                <View style={{ flex: 1.5 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.foreground }}>{item.loanType}</Text>
                  {item.purpose ? (
                    <Text style={[styles.subText, { color: colors.mutedForeground }]}>
                      {item.purpose}
                    </Text>
                  ) : null}
                </View>

                <View style={{ flex: 1.2, alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.foreground }}>
                    {settings.currency} {Number(item.principalAmount).toLocaleString()}
                  </Text>
                </View>

                <View style={{ flex: 1.2, alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 12.5, fontWeight: "800", color: "#F43F5E" }}>
                    -{settings.currency} {Number(item.monthlyInstallment).toLocaleString()}
                  </Text>
                </View>

                <View style={{ flex: 1.2, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>
                    {item.installmentsPaid} / {item.totalInstallments}
                  </Text>
                  <Text style={{ fontSize: 9.5, color: colors.mutedForeground }}>
                    {Math.round((item.installmentsPaid / item.totalInstallments) * 100)}% paid
                  </Text>
                </View>

                <View style={{ flex: 1.2, alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: item.outstandingBalance > 0 ? "#F59E0B" : "#10B981" }}>
                    {settings.currency} {Number(item.outstandingBalance).toLocaleString()}
                  </Text>
                </View>

                <View style={{ flex: 1, alignItems: "center" }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 12,
                      backgroundColor:
                        item.status === "completed"
                          ? "#10B9811A"
                          : item.status === "active"
                          ? "#3B82F61A"
                          : "#F59E0B1A",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: "700",
                        color:
                          item.status === "completed"
                            ? "#10B981"
                            : item.status === "active"
                            ? "#3B82F6"
                            : "#F59E0B",
                        textTransform: "capitalize",
                      }}
                    >
                      {item.status}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* Issue Loan Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Issue Advance or Loan</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <SvgX size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {/* Select Employee */}
              {knownEmployees.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>SELECT ACTIVE STAFF</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: "row", gap: 6 }}>
                    {knownEmployees.map((staff) => (
                      <TouchableOpacity
                        key={staff.employeeId}
                        style={[
                          styles.catPill,
                          empId === staff.employeeId && { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" },
                          { borderColor: colors.border },
                        ]}
                        onPress={() => handleSelectEmployee(staff)}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: empId === staff.employeeId ? "#FFF" : colors.foreground }}>
                          {staff.name} ({staff.employeeId})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.formRow}>
                <View style={{ flex: 1.5 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>EMPLOYEE FULL NAME</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={empName}
                    onChangeText={setEmpName}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>EMPLOYEE ID</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={empId}
                    onChangeText={setEmpId}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>LOAN PROGRAM</Text>
                  <View style={styles.selectRow}>
                    {(["Salary Advance", "Personal Loan", "Emergency Aid", "Provident Fund Advance"] as const).map(
                      (type) => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.catPill,
                            loanType === type && { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" },
                            { borderColor: colors.border },
                          ]}
                          onPress={() => setLoanType(type)}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: loanType === type ? "#FFF" : colors.mutedForeground }}>
                            {type}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>PRINCIPAL AMOUNT ({settings.currency})</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. 30000"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={principal}
                    onChangeText={setPrincipal}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>TENURE (INSTALLMENTS)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. 3"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={totalInstallments}
                    onChangeText={setTotalInstallments}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>MONTHLY DEDUCTION ({settings.currency})</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    value={monthlyInstallment}
                    onChangeText={setMonthlyInstallment}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>PURPOSE / REASON</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. Medical emergency advance"
                    placeholderTextColor={colors.mutedForeground}
                    value={purpose}
                    onChangeText={setPurpose}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: colors.border }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: "#8B5CF6" }]}
                onPress={handleSaveLoan}
                disabled={saving}
              >
                <Text style={styles.btnPrimaryText}>{saving ? "Processing..." : "Disburse Loan"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  kpiVal: {
    fontSize: 20,
    fontWeight: "800",
  },
  kpiSub: {
    fontSize: 11,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 240,
  },
  searchInput: {
    fontSize: 12,
    outlineWidth: 0,
    flex: 1,
  } as any,
  tableCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  th: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  empName: {
    fontSize: 13,
    fontWeight: "700",
  },
  subText: {
    fontSize: 11,
    marginTop: 2,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxWidth: 580,
    borderRadius: 14,
    borderWidth: 1,
    padding: 22,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  formRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  input: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12.5,
    outlineWidth: 0,
  } as any,
  selectRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  catPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
});
