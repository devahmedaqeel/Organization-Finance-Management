import { Feather } from "./UniversalIcon";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Transaction, TransactionType, useFinance } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { formatYMD } from "@/services/DatePeriodService";
import { getUnifiedCategories } from "@/constants/categories";

interface Props {
  visible: boolean;
  type: TransactionType;
  onClose: () => void;
  onAdd: (data: Omit<Transaction, "id">) => void;
  onUpdate?: (id: string, data: Partial<Omit<Transaction, "id">>) => void;
  addedBy: string;
  /** Pass an existing transaction to open in Edit mode */
  editItem?: Transaction | null;
}

export function AddTransactionModal({
  visible,
  type,
  onClose,
  onAdd,
  onUpdate,
  addedBy,
  editItem,
}: Props) {
  const colors = useColors();
  const { settings, addCustomCategory } = useSettings();
  const { departments, addDepartment, updateDepartment, budgets } = useFinance();
  const keyboardHeight = useKeyboardHeight();
  
  const cats = React.useMemo(() => {
    return getUnifiedCategories(type, settings.customIncomeCategories, settings.customExpenseCategories);
  }, [type, settings.customIncomeCategories, settings.customExpenseCategories]);

  const isEditMode = !!editItem;

  const resolvedDepts = departments && departments.length > 0
    ? departments
    : [
        { id: "d1", name: "Software Engineering", headCount: 45, budgetAllocated: 850000 },
        { id: "d2", name: "Administration", headCount: 12, budgetAllocated: 250000 },
        { id: "d3", name: "Research & Development", headCount: 20, budgetAllocated: 650000 },
        { id: "d4", name: "Finance", headCount: 8, budgetAllocated: 180000 }
      ];

  const [category, setCategory] = useState(cats[0]);
  const [amount, setAmount] = useState("");
  const [department, setDepartment] = useState("");
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => formatYMD(new Date()));
  const [error, setError] = useState("");

  // Inline category creation
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [categoryInputText, setCategoryInputText] = useState("");

  // Inline department creation/editing state
  const [isCreatingDept, setIsCreatingDept] = useState(false);
  const [isEditingDept, setIsEditingDept] = useState(false);
  const [deptInputText, setDeptInputText] = useState("");

  // When editItem changes, populate form fields
  useEffect(() => {
    const defaultDept = resolvedDepts[0]?.name || "Administration";
    if (editItem) {
      setCategory(editItem.category);
      setAmount(editItem.amount.toString());
      setDepartment(editItem.department);
      setSelectedBudgetId(editItem.budgetId || "");
      setDescription(editItem.description || "");
      setDate(editItem.date);
      setError("");
    } else {
      setCategory(cats[0]);
      setAmount("");
      setDepartment(defaultDept);
      setSelectedBudgetId("");
      setDescription("");
      setDate(formatYMD(new Date()));
      setError("");
    }
    setIsCreatingCategory(false);
    setCategoryInputText("");
    setIsCreatingDept(false);
    setIsEditingDept(false);
    setDeptInputText("");
  }, [editItem, visible, departments]);

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setError("Date format must be YYYY-MM-DD");
      return;
    }

    const payload: Omit<Transaction, "id"> = {
      type,
      category,
      amount: amt,
      date,
      department,
      description,
      addedBy,
      budgetId: type === "expense" && selectedBudgetId.trim() ? selectedBudgetId.trim() : undefined,
    };

    if (isEditMode && editItem && onUpdate) {
      onUpdate(editItem.id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      onAdd(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setAmount("");
    setDescription("");
    setError("");
    onClose();
  };

  const isIncome = type === "income";
  const accentColor = isIncome ? colors.income : colors.expense;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.overlay, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIcon, { backgroundColor: accentColor + "22" }]}>
                <Feather
                  name={isEditMode ? "edit-3" : (isIncome ? "arrow-up-circle" : "arrow-down-circle")}
                  size={18}
                  color={accentColor}
                />
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {isEditMode ? `Edit ${isIncome ? "Income" : "Expense"}` : `Add ${isIncome ? "Income" : "Expense"}`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 100 }}
          >

            {/* Category */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CATEGORY</Text>
            <View style={styles.chips}>
              {cats.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: category === c ? accentColor : colors.muted,
                      borderColor: category === c ? accentColor : colors.border,
                    },
                  ]}
                  onPress={() => { setCategory(c); setError(""); }}
                >
                  <Text style={[styles.chipText, { color: category === c ? "#fff" : colors.foreground }]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.muted + "80",
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setIsCreatingCategory(true)}
              >
                <Text style={[styles.chipText, { color: accentColor, fontWeight: "600" }]}>
                  + Add Category
                </Text>
              </TouchableOpacity>
            </View>

            {isCreatingCategory && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 12, alignItems: "center" }}>
                <TextInput
                  style={[
                    styles.input,
                    { flex: 1, backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, marginBottom: 0 },
                  ]}
                  placeholder="New category name..."
                  placeholderTextColor={colors.mutedForeground}
                  value={categoryInputText}
                  onChangeText={setCategoryInputText}
                  autoFocus
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: accentColor,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 8,
                  }}
                  onPress={async () => {
                    const trimmed = categoryInputText.trim();
                    if (trimmed) {
                      await addCustomCategory(type, trimmed);
                      setCategory(trimmed);
                      setCategoryInputText("");
                      setIsCreatingCategory(false);
                    }
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.muted,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    borderRadius: 8,
                  }}
                  onPress={() => {
                    setIsCreatingCategory(false);
                    setCategoryInputText("");
                  }}
                >
                  <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Amount */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AMOUNT ({settings.currency})</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: error && !amount ? colors.expense : colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(v) => { setAmount(v); setError(""); }}
            />

            {/* Date */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground },
              ]}
              placeholder="2026-05-01"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
              value={date}
              onChangeText={(v) => { setDate(v); setError(""); }}
            />

            {/* Department */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DEPARTMENT</Text>
            <View style={styles.chips}>
              {resolvedDepts.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: department === d.name ? colors.primary : colors.muted,
                      borderColor: department === d.name ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setDepartment(d.name);
                    setIsCreatingDept(false);
                    setIsEditingDept(false);
                  }}
                >
                  <Text style={[styles.chipText, { color: department === d.name ? "#fff" : colors.foreground }]}>
                    {d.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Inline Department Actions */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <TouchableOpacity
                style={[styles.miniActionBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setDeptInputText("");
                  setIsEditingDept(false);
                  setIsCreatingDept(true);
                }}
                activeOpacity={0.7}
              >
                <Feather name="plus" size={13} color={colors.primary} />
                <Text style={[styles.miniActionBtnText, { color: colors.primary }]}>Add Department</Text>
              </TouchableOpacity>

              {resolvedDepts.some((d) => d.name === department) && (
                <TouchableOpacity
                  style={[styles.miniActionBtn, { borderColor: colors.border }]}
                  onPress={() => {
                    setDeptInputText(department);
                    setIsCreatingDept(false);
                    setIsEditingDept(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="edit-2" size={12} color={colors.primary} />
                  <Text style={[styles.miniActionBtnText, { color: colors.primary }]}>Rename Selected</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Inline Department Editor Form */}
            {(isCreatingDept || isEditingDept) && (
              <View style={[styles.deptForm, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 6 }}>
                  {isCreatingDept ? "CREATE NEW DEPARTMENT" : `RENAME "${department}"`}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TextInput
                    style={[styles.miniInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Department name"
                    placeholderTextColor={colors.mutedForeground}
                    value={deptInputText}
                    onChangeText={setDeptInputText}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[styles.miniSaveBtn, { backgroundColor: colors.primary }]}
                    onPress={async () => {
                      if (!deptInputText.trim()) return;
                      const trimmedName = deptInputText.trim();
                      if (isCreatingDept) {
                        await addDepartment({
                          name: trimmedName,
                          headCount: 0,
                          budgetAllocated: 0,
                        });
                        setDepartment(trimmedName);
                        setIsCreatingDept(false);
                      } else {
                        const deptToUpdate = resolvedDepts.find((d) => d.name === department);
                        if (deptToUpdate) {
                          await updateDepartment(deptToUpdate.id, {
                            name: trimmedName,
                          });
                          setDepartment(trimmedName);
                          setIsEditingDept(false);
                        }
                      }
                      setDeptInputText("");
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }}
                  >
                    <Feather name="check" size={14} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.miniCancelBtn, { borderColor: colors.border }]}
                    onPress={() => {
                      setIsCreatingDept(false);
                      setIsEditingDept(false);
                      setDeptInputText("");
                    }}
                  >
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Linked Budget (Expenses only) */}
            {!isIncome && budgets && budgets.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 0 }]}>
                    LINKED BUDGET (OPTIONAL)
                  </Text>
                  <Text style={{ fontSize: 11, color: selectedBudgetId ? colors.expense : colors.mutedForeground }}>
                    {selectedBudgetId ? "Linked" : "Unbudgeted"}
                  </Text>
                </View>
                <View style={styles.chips}>
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      {
                        backgroundColor: !selectedBudgetId ? accentColor : colors.muted,
                        borderColor: !selectedBudgetId ? accentColor : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedBudgetId("")}
                  >
                    <Text style={[styles.chipText, { color: !selectedBudgetId ? "#fff" : colors.foreground }]}>
                      None (Unbudgeted)
                    </Text>
                  </TouchableOpacity>
                  {budgets.map((b) => {
                    const isSelected = selectedBudgetId === b.id;
                    return (
                      <TouchableOpacity
                        key={b.id}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected ? accentColor : colors.muted,
                            borderColor: isSelected ? accentColor : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setSelectedBudgetId(b.id);
                          if (b.category) setCategory(b.category);
                          if (b.department && b.department !== "All") setDepartment(b.department);
                        }}
                      >
                        <Text style={[styles.chipText, { color: isSelected ? "#fff" : colors.foreground }]}>
                          [{b.department || "General"}] {b.category || "All"} ({settings.currency} {Number(b.allocated || 0).toLocaleString()})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Description */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              style={[
                styles.input,
                styles.descInput,
                { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground },
              ]}
              placeholder="Add a note..."
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
              maxLength={150}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.expense + "18", borderColor: colors.expense + "44" }]}>
                <Feather name="alert-circle" size={13} color={colors.expense} />
                <Text style={[styles.errorText, { color: colors.expense }]}>{error}</Text>
              </View>
            ) : null}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: accentColor }]}
              onPress={handleSubmit}
              activeOpacity={0.8}
            >
              <Feather name={isEditMode ? "check-circle" : "plus-circle"} size={18} color="#fff" />
              <Text style={styles.addBtnText}>
                {isEditMode ? "Save Changes" : `Add ${isIncome ? "Income" : "Expense"}`}
              </Text>
            </TouchableOpacity>

            {isEditMode && (
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
                <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel Edit</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    maxHeight: "88%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#666",
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  input: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  descInput: {
    minHeight: 64,
    paddingTop: 12,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 14,
    marginTop: 20,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  cancelBtn: {
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
  },
  cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  miniActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  miniActionBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  deptForm: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  miniInput: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  miniSaveBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  miniCancelBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
