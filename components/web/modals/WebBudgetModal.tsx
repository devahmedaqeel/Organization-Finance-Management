import React, { useState, useEffect } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { Budget, useFinance } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import {
  SvgPieChart,
  SvgPlus,
  SvgCheck,
  SvgX,
} from "../SvgIcons";

const BUDGET_CATEGORIES = [
  "Salaries",
  "Utilities",
  "Equipment",
  "Research",
  "Maintenance",
  "Travel",
  "Marketing",
  "Software Licenses",
  "Office Supplies",
  "Other Expense",
];

interface WebBudgetModalProps {
  visible: boolean;
  onClose: () => void;
  budgetToEdit?: Budget | null;
}

export function WebBudgetModal({ visible, onClose, budgetToEdit }: WebBudgetModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { settings } = useSettings();
  const { addBudget, updateBudget, departments } = useFinance();

  const isEditing = Boolean(budgetToEdit);

  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState(BUDGET_CATEGORIES[0]);
  const [allocated, setAllocated] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [alertThreshold, setAlertThreshold] = useState("80");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (budgetToEdit) {
      setDepartment(budgetToEdit.department);
      setCategory(budgetToEdit.category);
      setAllocated(String(budgetToEdit.allocated));
      setPeriod(budgetToEdit.period || new Date().toISOString().substring(0, 7));
      setAlertThreshold(String(budgetToEdit.alertThreshold || 80));
      setNotes(budgetToEdit.notes || "");
    } else {
      setDepartment(departments[0]?.name || "Software Engineering");
      setCategory(BUDGET_CATEGORIES[0]);
      setAllocated("");
      setPeriod(new Date().toISOString().substring(0, 7));
      setAlertThreshold("80");
      setNotes("");
    }
    setError("");
  }, [budgetToEdit, visible, departments]);

  const handleSubmit = async () => {
    setError("");
    const parsedAmount = parseFloat(allocated);
    if (!allocated || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid allocation amount greater than 0.");
      return;
    }
    if (!department) {
      setError("Please select an organizational cost center / department.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && budgetToEdit) {
        updateBudget(budgetToEdit.id, {
          department,
          category,
          allocated: parsedAmount,
          period,
          alertThreshold: parseInt(alertThreshold, 10) || 80,
          notes,
        });
      } else {
        addBudget({
          department,
          category,
          allocated: parsedAmount,
          period,
          alertThreshold: parseInt(alertThreshold, 10) || 80,
          notes,
        });
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to commit budget line.");
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
              <View style={[styles.iconWrap, { backgroundColor: colors.primary + "20" }]}>
                <SvgPieChart size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  {isEditing ? "Modify Budget Allocation" : "Allocate Department Budget"}
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Set expenditure ceilings and overrun alerts
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
              <SvgX size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Department */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>DEPARTMENT / COST CENTER *</Text>
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
                          backgroundColor: department === dept ? colors.primary : colors.background,
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

            {/* Category */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>EXPENSE CATEGORY *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}>
                  {BUDGET_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: category === cat ? colors.foreground : colors.background,
                          borderColor: category === cat ? "transparent" : colors.border,
                        },
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: category === cat ? colors.background : colors.foreground },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Amount & Period */}
            <View style={[styles.row, isMobile && { flexDirection: "column" }]}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>ALLOCATED CEILING ({settings.currency}) *</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.currencyPrefix, { color: colors.mutedForeground }]}>{settings.currency}</Text>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    keyboardType="numeric"
                    value={allocated}
                    onChangeText={setAllocated}
                    autoFocus={!isEditing}
                  />
                </View>
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>FISCAL PERIOD (YYYY-MM) *</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="2026-05"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={period}
                    onChangeText={setPeriod}
                  />
                </View>
              </View>
            </View>

            {/* Alert Threshold */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>OVERRUN WARNING THRESHOLD (%)</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {["70", "80", "90", "95"].map((th) => (
                  <TouchableOpacity
                    key={th}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: alertThreshold === th ? colors.primary : colors.background,
                        borderColor: alertThreshold === th ? "transparent" : colors.border,
                        flex: 1,
                        alignItems: "center",
                      },
                    ]}
                    onPress={() => setAlertThreshold(th)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: alertThreshold === th ? "#FFFFFF" : colors.foreground },
                      ]}
                    >
                      {th}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Notes */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>NOTES & CONSTRAINTS</Text>
              <View style={[styles.textAreaWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.textArea, { color: colors.foreground }]}
                  placeholder="e.g. Annual HEC faculty salary ceiling..."
                  placeholderTextColor={colors.mutedForeground + "80"}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={2}
                />
              </View>
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
                  backgroundColor: colors.primary,
                  opacity: submitting ? 0.7 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <SvgPlus size={15} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>
                {submitting ? "Saving..." : isEditing ? "Update Allocation" : "Allocate Budget"}
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
    maxWidth: 560,
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
  textAreaWrap: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  textArea: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    minHeight: 50,
    textAlignVertical: "top",
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
