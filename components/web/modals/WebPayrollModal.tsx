import React, { useState, useEffect } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { PayrollEntry, useFinance } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import {
  SvgUsers,
  SvgPlus,
  SvgCheck,
  SvgX,
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
  const { addPayroll, updatePayroll, departments } = useFinance();

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

  const handleSubmit = async () => {
    if (submitting) return;
    if (!employeeName.trim()) {
      setError("Please enter staff member's name");
      return;
    }
    const numBase = parseFloat(baseSalary);
    if (!baseSalary || isNaN(numBase) || numBase <= 0) {
      setError("Please enter a valid base salary");
      return;
    }
    const numBonus = parseFloat(bonus) || 0;
    const numDeduct = parseFloat(deductions) || 0;

    setSubmitting(true);
    setError("");

    try {
      if (isEditing && entryToEdit) {
        updatePayroll(entryToEdit.id, {
          employeeName: employeeName.trim(),
          employeeId: employeeId.trim(),
          department,
          designation: designation.trim(),
          baseSalary: numBase,
          bonus: numBonus,
          deductions: numDeduct,
          netSalary: numBase + numBonus - numDeduct,
          month,
          paymentStatus,
          bankAccountNumber: bankAccountNumber.trim(),
        });
      } else {
        addPayroll({
          employeeName: employeeName.trim(),
          employeeId: employeeId.trim(),
          department,
          designation: designation.trim(),
          baseSalary: numBase,
          bonus: numBonus,
          deductions: numDeduct,
          netSalary: numBase + numBonus - numDeduct,
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

  const currentNet = (parseFloat(baseSalary) || 0) + (parseFloat(bonus) || 0) - (parseFloat(deductions) || 0);

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
            <View style={[styles.row, isMobile && { flexDirection: "column" }]}>
              <View style={[styles.formGroup, { flex: 1.4 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>EMPLOYEE FULL NAME *</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="e.g. Dr. Sundas Iftikhar"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={employeeName}
                    onChangeText={setEmployeeName}
                    autoFocus={!isEditing}
                  />
                </View>
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
              <Text style={[styles.label, { color: colors.mutedForeground }]}>ASSIGNED DEPARTMENT / UNIT *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}>
                  {(departments.length > 0
                    ? departments.map((d) => d.name)
                    : ["Software Engineering", "Administration", "Research & Development", "Finance"]
                  ).map((dept) => (
                    <TouchableOpacity
                      key={dept}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: department === dept ? "#8B5CF6" : colors.background,
                          borderColor: department === dept ? "transparent" : colors.border,
                        },
                      ]}
                      onPress={() => setDepartment(dept)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: department === dept ? "#FFFFFF" : colors.foreground },
                        ]}
                      >
                        {dept}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
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
                  backgroundColor: "#8B5CF6",
                  opacity: submitting ? 0.7 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
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
    maxHeight: 500,
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
});
