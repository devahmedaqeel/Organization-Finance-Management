import React, { useState, useEffect, useMemo } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions, Platform } from "react-native";
import { Budget, useFinance } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateBudgetAllocation,
  validateBudgetAllocationAgainstNetCash,
} from "@/services/FinancialCalculationEngine";
import {
  SvgPieChart,
  SvgPlus,
  SvgCheck,
  SvgX,
} from "../SvgIcons";

export const ALL_CATEGORIES_BUDGET = "All Categories (Department Pool)";

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
  initialDepartment?: string;
}

export function WebBudgetModal({ visible, onClose, budgetToEdit, initialDepartment }: WebBudgetModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { settings, addCustomCategory } = useSettings();
  const { addBudget, updateBudget, departments, transactions, budgets, updateDepartment } = useFinance();

  const isEditing = Boolean(budgetToEdit);

  const netCash = useMemo(() => {
    return calculateTotalIncome(transactions) - calculateTotalExpenses(transactions);
  }, [transactions]);

  const totalAllocated = useMemo(() => {
    return calculateBudgetAllocation(budgets, departments);
  }, [budgets, departments]);

  const unallocatedNetCash = useMemo(() => {
    return Math.max(0, netCash - totalAllocated);
  }, [netCash, totalAllocated]);

  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES_BUDGET);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");
  const [allocated, setAllocated] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [alertThreshold, setAlertThreshold] = useState("80");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<"allocated" | "period" | "notes" | null>(null);

  const availableCategories = useMemo(() => {
    const list: string[] = [ALL_CATEGORIES_BUDGET];
    const seen = new Set<string>([ALL_CATEGORIES_BUDGET.toLowerCase()]);

    // 1. Matched department's configured categories
    const matchedDept = departments.find(
      (d) => d.name && d.name.trim().toLowerCase() === department.trim().toLowerCase()
    );
    if (matchedDept?.categories && Array.isArray(matchedDept.categories)) {
      matchedDept.categories.forEach((c) => {
        if (c && !seen.has(c.trim().toLowerCase())) {
          seen.add(c.trim().toLowerCase());
          list.push(c.trim());
        }
      });
    }

    // 2. Standard budget categories
    BUDGET_CATEGORIES.forEach((c) => {
      if (!seen.has(c.toLowerCase())) {
        seen.add(c.toLowerCase());
        list.push(c);
      }
    });

    // 3. Organization custom categories
    if (settings.customExpenseCategories && Array.isArray(settings.customExpenseCategories)) {
      settings.customExpenseCategories.forEach((c) => {
        if (c && !seen.has(c.trim().toLowerCase())) {
          seen.add(c.trim().toLowerCase());
          list.push(c.trim());
        }
      });
    }

    // 4. Current category if not in list
    if (category && !seen.has(category.trim().toLowerCase())) {
      list.push(category.trim());
    }

    return list;
  }, [department, departments, settings.customExpenseCategories, category]);

  useEffect(() => {
    if (budgetToEdit) {
      setDepartment(budgetToEdit.department);
      setCategory(budgetToEdit.category || ALL_CATEGORIES_BUDGET);
      setAllocated(String(budgetToEdit.allocated));
      setPeriod(budgetToEdit.period || new Date().toISOString().substring(0, 7));
      setAlertThreshold(String(budgetToEdit.alertThreshold || 80));
      setNotes(budgetToEdit.notes || "");
    } else {
      setDepartment(initialDepartment || departments[0]?.name || "");
      setCategory(ALL_CATEGORIES_BUDGET);
      setAllocated("");
      setPeriod(new Date().toISOString().substring(0, 7));
      setAlertThreshold("80");
      setNotes("");
    }
    setIsAddingCategory(false);
    setNewCatInput("");
    setError("");
  }, [budgetToEdit, visible, departments, initialDepartment]);

  const handleSaveCustomCategory = async () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    try {
      await addCustomCategory("expense", trimmed);
      const matchedDept = departments.find(
        (d) => d.name && d.name.trim().toLowerCase() === department.trim().toLowerCase()
      );
      if (matchedDept) {
        const existingCats = matchedDept.categories || [];
        if (!existingCats.map((c) => c.toLowerCase()).includes(trimmed.toLowerCase())) {
          await updateDepartment(matchedDept.id, {
            categories: [...existingCats, trimmed],
          });
        }
      }
      setCategory(trimmed);
      setNewCatInput("");
      setIsAddingCategory(false);
    } catch (e: any) {
      console.error("Failed to add custom category:", e);
    }
  };

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
      const validation = validateBudgetAllocationAgainstNetCash(
        parsedAmount,
        transactions,
        budgets,
        departments,
        {
          type: "budget",
          editingBudgetId: budgetToEdit?.id,
          targetDepartmentName: department,
          currency: settings.currency || "PKR",
        }
      );

      if (!validation.isValid) {
        setError(validation.errorMessage || "Allocation exceeds Available Net Cash.");
        setSubmitting(false);
        return;
      }

      if (isEditing && budgetToEdit) {
        await updateBudget(budgetToEdit.id, {
          department,
          category,
          allocated: parsedAmount,
          period,
          alertThreshold: parseInt(alertThreshold, 10) || 80,
          notes,
        });
      } else {
        await addBudget({
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
                  {isEditing ? "Edit budget" : "Set a department budget"}
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Choose how much a department can spend, and when to warn you
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
              <SvgX size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Available Net Cash Status Banner */}
            <View
              style={[
                styles.netCashBanner,
                {
                  backgroundColor: unallocatedNetCash <= 0 ? colors.expense + "12" : colors.income + "10",
                  borderColor: unallocatedNetCash <= 0 ? colors.expense + "40" : colors.income + "40",
                },
              ]}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.netCashBannerTitle, { color: unallocatedNetCash <= 0 ? colors.expense : colors.foreground }]}>
                  {unallocatedNetCash <= 0 ? "⚠ No money left to allocate" : "Available to allocate"}
                </Text>
                <Text style={[styles.netCashBannerAmount, { color: unallocatedNetCash <= 0 ? colors.expense : colors.income }]}>
                  {settings.currency || "PKR"} {unallocatedNetCash.toLocaleString()}
                </Text>
              </View>
              <Text style={[styles.netCashBannerSub, { color: colors.mutedForeground }]}>
                {unallocatedNetCash <= 0
                  ? `Your net cash (income − expenses) is ${settings.currency || "PKR"} ${netCash.toLocaleString()}, and all of it is already given to budgets.`
                  : `Net cash ${settings.currency || "PKR"} ${netCash.toLocaleString()} (income − expenses) − already in budgets ${settings.currency || "PKR"} ${Math.max(0, netCash - unallocatedNetCash).toLocaleString()} = ${settings.currency || "PKR"} ${unallocatedNetCash.toLocaleString()} you can still allocate.`}
              </Text>
            </View>

            {/* Top Error Notice */}
            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.expense + "18", borderColor: colors.expense + "40", marginBottom: 8 }]}>
                <Text style={[styles.errorText, { color: colors.expense }]}>{error}</Text>
              </View>
            ) : null}

            {/* Department */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Department<Text style={{ color: colors.expense }}> *</Text></Text>
              <View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 4 }}>
                  {departments.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, fontStyle: "italic", paddingVertical: 4 }}>
                      No departments yet. Create one on the Departments page first.
                    </Text>
                  ) : (
                    departments.map((d) => d.name).map((dept) => (
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
                    ))
                  )}
                </View>
              </View>
            </View>

            {/* Category */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>What is it for?<Text style={{ color: colors.expense }}> *</Text></Text>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>Pick the spending category this budget covers.</Text>
              <View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 4 }}>
                  {BUDGET_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: category === cat ? colors.primary : colors.background,
                          borderColor: category === cat ? "transparent" : colors.border,
                        },
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: category === cat ? "#FFFFFF" : colors.foreground },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Amount & Period */}
            <View style={[styles.row, isMobile && { flexDirection: "column" }]}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.foreground }]}>Budget amount ({settings.currency})<Text style={{ color: colors.expense }}> *</Text></Text>
                <View
                  style={[
                    styles.inputWrap,
                    {
                      backgroundColor: colors.background,
                      borderColor: focusedField === "allocated" ? colors.primary : colors.border,
                      borderWidth: focusedField === "allocated" ? 1.5 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.currencyPrefix, { color: colors.mutedForeground }]}>{settings.currency}</Text>
                  <View style={{ width: 1, height: 16, backgroundColor: colors.border, marginHorizontal: 2 }} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    keyboardType="numeric"
                    value={allocated}
                    onChangeText={setAllocated}
                    onFocus={() => setFocusedField("allocated")}
                    onBlur={() => setFocusedField(null)}
                    autoFocus={!isEditing}
                  />
                </View>
                {!isEditing && Number(allocated) > 0 ? (
                  <Text style={[styles.hint, { color: Number(allocated) > unallocatedNetCash ? colors.expense : colors.mutedForeground }]}>
                    {Number(allocated) > unallocatedNetCash
                      ? `More than the ${settings.currency || "PKR"} ${unallocatedNetCash.toLocaleString()} available`
                      : `${settings.currency || "PKR"} ${(unallocatedNetCash - Number(allocated)).toLocaleString()} will still be available after this`}
                  </Text>
                ) : null}
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.foreground }]}>Month<Text style={{ color: colors.expense }}> *</Text></Text>
                <View
                  style={[
                    styles.inputWrap,
                    {
                      backgroundColor: colors.background,
                      borderColor: focusedField === "period" ? colors.primary : colors.border,
                      borderWidth: focusedField === "period" ? 1.5 : 1,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="YYYY-MM, e.g. 2026-11"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={period}
                    onChangeText={setPeriod}
                    onFocus={() => setFocusedField("period")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            </View>

            {/* Alert Threshold */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Warn me when spending reaches</Text>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>You'll get an alert when this much of the budget has been used.</Text>
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
              <Text style={[styles.label, { color: colors.foreground }]}>Notes <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>(optional)</Text></Text>
              <View
                style={[
                  styles.textAreaWrap,
                  {
                    backgroundColor: colors.background,
                    borderColor: focusedField === "notes" ? colors.primary : colors.border,
                    borderWidth: focusedField === "notes" ? 1.5 : 1,
                  },
                ]}
              >
                <TextInput
                  style={[styles.textArea, { color: colors.foreground }]}
                  placeholder="e.g. Faculty salaries for the autumn semester"
                  placeholderTextColor={colors.mutedForeground + "80"}
                  value={notes}
                  onChangeText={setNotes}
                  onFocus={() => setFocusedField("notes")}
                  onBlur={() => setFocusedField(null)}
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
                {submitting ? "Saving…" : isEditing ? "Save changes" : "Save budget"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
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
    borderRadius: 10,
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
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 13,
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
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
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
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
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
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  chip: {
    paddingHorizontal: 12,
    height: 32,
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
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
  netCashBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    marginBottom: 8,
  },
  netCashBannerTitle: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },
  netCashBannerAmount: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  netCashBannerSub: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginTop: 4,
  },
});
