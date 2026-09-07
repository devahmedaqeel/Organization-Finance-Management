import React, { useState, useEffect, useMemo } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { PayrollEntry, useFinance } from "@/context/FinanceContext";
import { calculateEffectiveDepartmentBudget } from "@/services/FinancialCalculationEngine";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import {
  SvgUsers,
  SvgPlus,
  SvgCheck,
  SvgX,
  SvgLock,
} from "../SvgIcons";

interface WebPayrollModalProps {
  visible: boolean;
  onClose: () => void;
  entryToEdit?: PayrollEntry | null;
}

export function WebPayrollModal({ visible, onClose, entryToEdit }: WebPayrollModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { settings } = useSettings();
  const { addPayroll, updatePayroll, departments, payroll, transactions, budgets } = useFinance();

  const isEditing = Boolean(entryToEdit);

  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [bonus, setBonus] = useState("");
  const [deductions, setDeductions] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending" | "processing">("paid");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Extract unique known staff roster with their established department
  const knownEmployees = useMemo(() => {
    const map = new Map<string, { name: string; employeeId: string; department: string; designation?: string; baseSalary?: number }>();
    payroll.forEach((p) => {
      if (p.employeeName && p.department) {
        const key = p.employeeName.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name: p.employeeName.trim(),
            employeeId: p.employeeId,
            department: p.department,
            designation: p.designation,
            baseSalary: p.baseSalary,
          });
        }
      }
    });
    return Array.from(map.values());
  }, [payroll]);

  // Check if current employeeName matches an existing staff member with an assigned department
  const matchedStaff = useMemo(() => {
    if (!employeeName.trim()) return null;
    return knownEmployees.find((e) => e.name.toLowerCase() === employeeName.trim().toLowerCase()) || null;
  }, [knownEmployees, employeeName]);

  // Automatically lock department to matched staff member's department
  useEffect(() => {
    if (matchedStaff && matchedStaff.department && matchedStaff.department !== department) {
      setDepartment(matchedStaff.department);
      if (matchedStaff.employeeId && (!employeeId || employeeId.startsWith("EMP"))) {
        setEmployeeId(matchedStaff.employeeId);
      }
      if (matchedStaff.designation && !designation) {
        setDesignation(matchedStaff.designation);
      }
    }
  }, [matchedStaff]);

  useEffect(() => {
    if (entryToEdit) {
      setEmployeeName(entryToEdit.employeeName);
      setEmployeeId(entryToEdit.employeeId);
      setDepartment(entryToEdit.department);
      setDesignation(entryToEdit.designation || "");
      setBaseSalary(String(entryToEdit.baseSalary || ""));
      setBonus(String(entryToEdit.bonus || "0"));
      setDeductions(String(entryToEdit.deductions || "0"));
      setMonth(entryToEdit.month || new Date().toISOString().substring(0, 7));
      setPaymentStatus(entryToEdit.paymentStatus || "paid");
      setBankAccountNumber(entryToEdit.bankAccountNumber || "");
    } else {
      setEmployeeName("");
      setEmployeeId(`EMP${Math.floor(100 + Math.random() * 900)}`);
      setDepartment(departments[0]?.name || "Software Engineering");
      setDesignation("Faculty / Staff Member");
      setBaseSalary("");
      setBonus("0");
      setDeductions("0");
      setMonth(new Date().toISOString().substring(0, 7));
      setPaymentStatus("paid");
      setBankAccountNumber("PK-00-BANK-XXXX-XXXX");
    }
    setError("");
  }, [entryToEdit, visible, departments]);

  // Selected Department Budget Health Calculation
  const selectedDeptBudget = useMemo(() => {
    return calculateEffectiveDepartmentBudget(department, departments, budgets);
  }, [department, departments, budgets]);

  const selectedDeptObj = selectedDeptBudget.matchedDept;
  const deptBudgetAllocated = selectedDeptBudget.allocated;

  const deptCurrentSpent = useMemo(() => {
    if (!department) return 0;
    const dLower = department.trim().toLowerCase();
    const editTxId = entryToEdit ? `tx_pay_${entryToEdit.id}` : null;
    return transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          (t.department || "").trim().toLowerCase() === dLower &&
          t.status !== "failed" &&
          (t as any).status !== "deleted" &&
          t.id !== editTxId
      )
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  }, [transactions, department, entryToEdit]);

  const deptRemainingBudget = Math.max(0, deptBudgetAllocated - deptCurrentSpent);
  const currentNet = (parseFloat(baseSalary) || 0) + (parseFloat(bonus) || 0) - (parseFloat(deductions) || 0);
  const projectedRemaining = deptRemainingBudget - currentNet;
  const isZeroBudget = deptBudgetAllocated <= 0;
  const isOverBudget = currentNet > deptRemainingBudget && !isZeroBudget;

  const handleSubmit = async () => {
    if (submitting) return;
    if (!employeeName.trim()) {
      setError("Please enter staff member's name");
      return;
    }
    if (!department.trim()) {
      setError("Please select a valid department for this employee.");
      return;
    }

    // Enforce Section 6: No department budget = no payroll expense
    if (isZeroBudget) {
      setError(`Payroll cannot be processed because the ${department} department has no allocated budget.`);
      return;
    }

    const numBase = parseFloat(baseSalary);
    if (!baseSalary || isNaN(numBase) || numBase <= 0) {
      setError("Please enter a valid base salary");
      return;
    }
    const numBonus = parseFloat(bonus) || 0;
    const numDeduct = parseFloat(deductions) || 0;
    const netSalaryVal = numBase + numBonus - numDeduct;

    // Enforce Section 7: Insufficient department budget
    if (netSalaryVal > deptRemainingBudget) {
      setError(`Insufficient ${department} department budget. Available: ${settings.currency} ${deptRemainingBudget.toLocaleString()}. Required for payroll: ${settings.currency} ${netSalaryVal.toLocaleString()}.`);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (isEditing && entryToEdit) {
        await updatePayroll(entryToEdit.id, {
          employeeName: employeeName.trim(),
          employeeId: employeeId.trim(),
          department,
          designation: designation.trim(),
          baseSalary: numBase,
          bonus: numBonus,
          deductions: numDeduct,
          netSalary: netSalaryVal,
          month,
          paymentStatus,
          bankAccountNumber: bankAccountNumber.trim(),
        });
      } else {
        await addPayroll({
          employeeName: employeeName.trim(),
          employeeId: employeeId.trim(),
          department,
          designation: designation.trim(),
          baseSalary: numBase,
          bonus: numBonus,
          deductions: numDeduct,
          netSalary: netSalaryVal,
          month,
          paymentStatus,
          bankAccountNumber: bankAccountNumber.trim(),
        });
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to commit payroll slip.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, isMobile && { padding: 10 }]}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.iconWrap, { backgroundColor: "#8B5CF620" }]}>
                <SvgUsers size={20} color="#8B5CF6" />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  {isEditing ? "Modify Payroll Slip" : "Generate Staff Payroll Slip"}
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Institutional staff remuneration calculation
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
              <SvgX size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Employee Name & ID */}
            {/* Employee Name & ID */}
            <View style={[styles.row, isMobile && { flexDirection: "column" }]}>
              <View style={[styles.formGroup, { flex: 1.4 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>EMPLOYEE FULL NAME *</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="e.g. Ahmed"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={employeeName}
                    onChangeText={setEmployeeName}
                    autoFocus={!isEditing}
                  />
                </View>
                {/* Staff suggestion chips */}
                {knownEmployees.length > 0 && !matchedStaff ? (
                  <View style={styles.knownStaffRow}>
                    <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>Select Staff:</Text>
                    {knownEmployees.slice(0, 4).map((emp) => (
                      <TouchableOpacity
                        key={emp.name}
                        style={[styles.staffPill, { backgroundColor: colors.background, borderColor: colors.border }]}
                        onPress={() => {
                          setEmployeeName(emp.name);
                          setDepartment(emp.department);
                          if (emp.employeeId) setEmployeeId(emp.employeeId);
                          if (emp.designation) setDesignation(emp.designation);
                          if (emp.baseSalary && !baseSalary) setBaseSalary(String(emp.baseSalary));
                        }}
                      >
                        <Text style={[styles.staffPillText, { color: colors.foreground }]}>{emp.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>EMPLOYEE ID</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="EMP001"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={employeeId}
                    onChangeText={setEmployeeId}
                  />
                </View>
              </View>
            </View>

            {/* Department */}
            <View style={styles.formGroup}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>ASSIGNED DEPARTMENT / UNIT *</Text>
                {matchedStaff ? (
                  <View style={[styles.lockedBadge, { backgroundColor: "#8B5CF620", borderColor: "#8B5CF640" }]}>
                    <SvgLock size={11} color="#8B5CF6" />
                    <Text style={[styles.lockedBadgeText, { color: "#8B5CF6" }]}>
                      Auto-locked to {matchedStaff.name}&apos;s assigned department
                    </Text>
                  </View>
                ) : null}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}>
                  {(departments.length > 0
                    ? departments.map((d) => d.name)
                    : ["Software Engineering", "Administration", "Research & Development", "Finance"]
                  ).map((dept) => {
                    const isSelected = department === dept;
                    const isDisabled = Boolean(matchedStaff && matchedStaff.department && matchedStaff.department !== dept);
                    return (
                      <TouchableOpacity
                        key={dept}
                        disabled={isDisabled}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected ? "#8B5CF6" : colors.background,
                            borderColor: isSelected ? "transparent" : colors.border,
                            opacity: isDisabled ? 0.35 : 1,
                          },
                        ]}
                        onPress={() => setDepartment(dept)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: isSelected ? "#FFFFFF" : colors.foreground },
                          ]}
                        >
                          {dept}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* Live Department Budget Health & Deduction Box */}
            <View style={[styles.budgetBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={styles.budgetBoxHeader}>
                <Text style={[styles.budgetBoxTitle, { color: colors.foreground }]}>
                  Department Budget: <Text style={{ color: "#8B5CF6" }}>{department || "Unassigned"}</Text>
                </Text>
                <View
                  style={[
                    styles.badgePill,
                    {
                      backgroundColor: isZeroBudget ? colors.expense + "20" : isOverBudget ? colors.expense + "20" : colors.income + "20",
                      borderColor: isZeroBudget ? colors.expense + "40" : isOverBudget ? colors.expense + "40" : colors.income + "40",
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontFamily: "Inter_700Bold",
                      color: isZeroBudget ? colors.expense : isOverBudget ? colors.expense : colors.income,
                    }}
                  >
                    {isZeroBudget ? "NO BUDGET ALLOCATED" : isOverBudget ? "DEFICIT PREVENTED" : "BUDGET AVAILABLE"}
                  </Text>
                </View>
              </View>

              <View style={styles.budgetMetricsGrid}>
                <View style={styles.budgetMetricItem}>
                  <Text style={[styles.budgetMetricLabel, { color: colors.mutedForeground }]}>ALLOCATED</Text>
                  <Text style={[styles.budgetMetricVal, { color: colors.foreground }]}>
                    {settings.currency} {deptBudgetAllocated.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.budgetMetricItem}>
                  <Text style={[styles.budgetMetricLabel, { color: colors.mutedForeground }]}>CURRENT SPENT</Text>
                  <Text style={[styles.budgetMetricVal, { color: colors.mutedForeground }]}>
                    {settings.currency} {deptCurrentSpent.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.budgetMetricItem}>
                  <Text style={[styles.budgetMetricLabel, { color: colors.mutedForeground }]}>REMAINING</Text>
                  <Text style={[styles.budgetMetricVal, { color: deptRemainingBudget > 0 ? colors.income : colors.expense }]}>
                    {settings.currency} {deptRemainingBudget.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.budgetMetricItem}>
                  <Text style={[styles.budgetMetricLabel, { color: colors.mutedForeground }]}>PAYROLL CHARGE</Text>
                  <Text style={[styles.budgetMetricVal, { color: "#8B5CF6" }]}>
                    -{settings.currency} {currentNet.toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Status Notice */}
              {isZeroBudget ? (
                <View style={[styles.budgetWarningBanner, { backgroundColor: colors.expense + "15", borderColor: colors.expense + "35" }]}>
                  <Text style={[styles.budgetWarningText, { color: colors.expense }]}>
                    🚫 Payroll cannot be processed because the <Text style={{ fontWeight: "700" }}>{department}</Text> department has no allocated budget ({settings.currency} 0).
                  </Text>
                </View>
              ) : isOverBudget ? (
                <View style={[styles.budgetWarningBanner, { backgroundColor: colors.expense + "15", borderColor: colors.expense + "35" }]}>
                  <Text style={[styles.budgetWarningText, { color: colors.expense }]}>
                    ⚠️ Insufficient {department} department budget. Available: {settings.currency} {deptRemainingBudget.toLocaleString()}. Required: {settings.currency} {currentNet.toLocaleString()}.
                  </Text>
                </View>
              ) : (
                <View style={[styles.budgetSuccessBanner, { backgroundColor: colors.income + "12", borderColor: colors.income + "30" }]}>
                  <Text style={[styles.budgetSuccessText, { color: colors.income }]}>
                    ✓ Sufficient department budget. Projected remaining after payroll: {settings.currency} {projectedRemaining.toLocaleString()}.
                  </Text>
                </View>
              )}
            </View>

            {/* Base Salary & Month */}
            <View style={[styles.row, isMobile && { flexDirection: "column" }]}>
              <View style={[styles.formGroup, { flex: 1.2 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>BASE SALARY ({settings.currency}) *</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.currencyPrefix, { color: colors.mutedForeground }]}>{settings.currency}</Text>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    keyboardType="numeric"
                    value={baseSalary}
                    onChangeText={setBaseSalary}
                  />
                </View>
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>PAYROLL MONTH (YYYY-MM) *</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="2026-05"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={month}
                    onChangeText={setMonth}
                  />
                </View>
              </View>
            </View>

            {/* Bonus & Deductions */}
            <View style={[styles.row, isMobile && { flexDirection: "column" }]}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>BONUS / ALLOWANCES</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.currencyPrefix, { color: colors.income }]}>+</Text>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    keyboardType="numeric"
                    value={bonus}
                    onChangeText={setBonus}
                  />
                </View>
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>DEDUCTIONS / TAX</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.currencyPrefix, { color: colors.expense }]}>-</Text>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    keyboardType="numeric"
                    value={deductions}
                    onChangeText={setDeductions}
                  />
                </View>
              </View>
            </View>

            {/* Calculated Net Preview */}
            <View style={[styles.netPreviewBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.netLabel, { color: colors.mutedForeground }]}>CALCULATED NET DISBURSAL</Text>
              <Text style={[styles.netValue, { color: "#8B5CF6" }]}>
                {settings.currency} {currentNet.toLocaleString()}
              </Text>
            </View>

            {/* Error Banner */}
            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.expense + "18", borderColor: colors.expense + "40" }]}>
                <Text style={[styles.errorText, { color: colors.expense }]}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} disabled={submitting}>
              <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: (isZeroBudget || isOverBudget) ? colors.mutedForeground + "40" : "#8B5CF6",
                  opacity: (submitting || isZeroBudget || isOverBudget) ? 0.6 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={submitting || isZeroBudget || isOverBudget}
            >
              <SvgPlus size={15} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>
                {submitting ? "Saving..." : isEditing ? "Update Payroll" : "Issue Payroll Slip"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 580,
    maxHeight: "90%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  closeBtn: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  body: {
    flex: 1,
    flexShrink: 1,
  },
  bodyContent: {
    padding: 20,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    height: 42,
  },
  currencyPrefix: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  input: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    height: "100%",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  netPreviewBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    gap: 2,
  },
  netLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  netValue: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  lockedBadgeText: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
  },
  knownStaffRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 4,
  },
  staffPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  staffPillText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  budgetBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  budgetBoxHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  budgetBoxTitle: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  budgetMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  budgetMetricItem: {
    minWidth: "22%",
    gap: 2,
  },
  budgetMetricLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  budgetMetricVal: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  budgetWarningBanner: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  budgetWarningText: {
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
  },
  budgetSuccessBanner: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  budgetSuccessText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 16,
  },
});
