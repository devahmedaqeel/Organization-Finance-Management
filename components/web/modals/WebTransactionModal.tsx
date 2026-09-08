import React, { useState, useEffect } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { Transaction, TransactionType, useFinance } from "@/context/FinanceContext";
import { calculateEffectiveDepartmentBudget } from "@/services/FinancialCalculationEngine";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import { formatYMD } from "@/services/DatePeriodService";
import {
  SvgArrowUpRight,
  SvgArrowDownLeft,
  SvgCheck,
  SvgPlus,
  SvgX,
  SvgShield,
} from "../SvgIcons";

import { getUnifiedCategories, getDepartmentCategories } from "@/constants/categories";

const PAYMENT_METHODS = ["Electronic Transfer", "Cash", "Cheque", "Credit Card", "Direct Debit"];

interface WebTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  initialType?: TransactionType;
  transactionToEdit?: Transaction | null;
}

export function WebTransactionModal({
  visible,
  onClose,
  initialType = "expense",
  transactionToEdit,
}: WebTransactionModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { settings, addCustomCategory } = useSettings();
  const { addTransaction, updateTransaction, departments, budgets, transactions } = useFinance();

  const isEditing = Boolean(transactionToEdit);

  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Electronic Transfer");
  const [date, setDate] = useState(() => formatYMD(new Date()));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");

  const categories = React.useMemo(() => {
    if (type === "expense") {
      return getDepartmentCategories(department, departments, settings.customExpenseCategories);
    }
    return getUnifiedCategories("income", settings.customIncomeCategories, settings.customExpenseCategories);
  }, [type, department, departments, settings.customIncomeCategories, settings.customExpenseCategories]);

  // Department metrics for budget validation
  const selectedDeptMetric = React.useMemo(() => {
    if (!department || type !== "expense") return null;
    const clean = department.trim().toLowerCase();
    const effectiveDept = calculateEffectiveDepartmentBudget(clean, departments, budgets);
    const allocated = effectiveDept.allocated;

    const spent = (transactions || [])
      .filter((t) => {
        if (t.type !== "expense" || (t.department || "").trim().toLowerCase() !== clean) return false;
        if (isEditing && transactionToEdit && t.id === transactionToEdit.id) return false;
        return t.status !== "failed" && (t as any).status !== "deleted";
      })
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const remaining = Math.max(0, allocated - spent);
    return {
      allocated,
      spent,
      remaining,
      hasBudget: allocated > 0,
      isExhausted: allocated > 0 && remaining <= 0,
    };
  }, [department, type, departments, budgets, transactions, isEditing, transactionToEdit]);

  useEffect(() => {
    if (categories.length > 0 && (!category || !categories.includes(category))) {
      setCategory(categories[0]);
    }
  }, [categories]);

  useEffect(() => {
    if (visible) {
      if (transactionToEdit) {
        setType(transactionToEdit.type);
        setAmount(String(transactionToEdit.amount));
        setCategory(transactionToEdit.category);
        setDepartment(transactionToEdit.department || (departments[0]?.name || ""));
        setSelectedBudgetId(transactionToEdit.budgetId || "");
        setDescription(transactionToEdit.description || "");
        setReferenceNumber(transactionToEdit.referenceNumber || "");
        setPaymentMethod(transactionToEdit.paymentMethod || "Electronic Transfer");
        setDate(transactionToEdit.date || formatYMD(new Date()));
      } else {
        const defaultDept = departments.length > 0 ? departments[0].name : "";
        const defaultCats = initialType === "expense"
          ? getDepartmentCategories(defaultDept, departments, settings.customExpenseCategories)
          : getUnifiedCategories("income", settings.customIncomeCategories, settings.customExpenseCategories);
        setType(initialType);
        setAmount("");
        setDepartment(defaultDept);
        setCategory(defaultCats[0] || (initialType === "income" ? "Government Grant" : "Salaries"));
        setSelectedBudgetId("");
        setDescription("");
        setReferenceNumber(`TXN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
        setPaymentMethod("Electronic Transfer");
        setDate(formatYMD(new Date()));
      }
      setIsAddingCategory(false);
      setNewCatInput("");
      setError("");
    }
  }, [visible, initialType, transactionToEdit, departments]);

  const handleSubmit = async () => {
    setError("");
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }
    if (type === "expense" && !department.trim()) {
      setError("Please assign a department / cost center.");
      return;
    }
    if (!category.trim()) {
      setError("Please select a transaction category.");
      return;
    }

    // Authoritative Department Budget Validation
    if (type === "expense") {
      if (!selectedDeptMetric || !selectedDeptMetric.hasBudget) {
        setError("No budget has been allocated to this department. Allocate a department budget before recording an expense.");
        return;
      }
      if (parsedAmount > selectedDeptMetric.remaining) {
        setError(`Insufficient department budget. Remaining budget: ${settings.currency} ${selectedDeptMetric.remaining.toLocaleString()}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const assignedDept = type === "expense" ? department.trim() : (transactionToEdit?.department || "Institutional");
      if (isEditing && transactionToEdit) {
        await updateTransaction(transactionToEdit.id, {
          type,
          amount: parsedAmount,
          category: category.trim(),
          department: assignedDept,
          description: description.trim(),
          referenceNumber: referenceNumber.trim(),
          paymentMethod,
          date,
          budgetId: type === "expense" ? (selectedBudgetId.trim() || null) : null,
        });
      } else {
        await addTransaction({
          type,
          amount: parsedAmount,
          category: category.trim(),
          department: assignedDept,
          description: description.trim(),
          referenceNumber: referenceNumber.trim(),
          paymentMethod,
          date,
          budgetId: type === "expense" ? (selectedBudgetId.trim() || undefined) : undefined,
        });
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to commit record.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, isMobile && { padding: 10 }]}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: (type === "income" ? colors.income : colors.expense) + "20",
                  },
                ]}
              >
                {type === "income" ? (
                  <SvgArrowUpRight size={20} color={colors.income} />
                ) : (
                  <SvgArrowDownLeft size={20} color={colors.expense} />
                )}
              </View>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  {isEditing ? "Edit General Ledger Entry" : type === "income" ? "Record Revenue Inflow" : "Record Operational Outflow"}
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Live synchronized double-entry cloud ledger
                </Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
              <SvgX size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Form Body */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Type Switcher */}
            {!isEditing && (
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>ENTRY CLASSIFICATION</Text>
                <View style={[styles.typeSwitcher, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={[
                      styles.typeBtn,
                      type === "income" && { backgroundColor: colors.income + "20", borderColor: colors.income },
                    ]}
                    onPress={() => {
                      setType("income");
                      const incomeCats = getUnifiedCategories("income", settings.customIncomeCategories, settings.customExpenseCategories);
                      setCategory(incomeCats[0] || "Government Grant");
                    }}
                  >
                    <SvgArrowUpRight size={14} color={type === "income" ? colors.income : colors.mutedForeground} />
                    <Text
                      style={[
                        styles.typeBtnText,
                        { color: type === "income" ? colors.income : colors.mutedForeground },
                      ]}
                    >
                      Income (Inflow)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeBtn,
                      type === "expense" && { backgroundColor: colors.expense + "20", borderColor: colors.expense },
                    ]}
                    onPress={() => {
                      setType("expense");
                      const expenseCats = getUnifiedCategories("expense", settings.customIncomeCategories, settings.customExpenseCategories);
                      setCategory(expenseCats[0] || "Salaries");
                    }}
                  >
                    <SvgArrowDownLeft size={14} color={type === "expense" ? colors.expense : colors.mutedForeground} />
                    <Text
                      style={[
                        styles.typeBtnText,
                        { color: type === "expense" ? colors.expense : colors.mutedForeground },
                      ]}
                    >
                      Expense (Outflow)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Amount & Date */}
            <View style={[styles.row, isMobile && { flexDirection: "column" }]}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>AMOUNT ({settings.currency}) *</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.currencyPrefix, { color: colors.mutedForeground }]}>{settings.currency}</Text>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    autoFocus={!isEditing}
                  />
                </View>
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>TRANSACTION DATE *</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={date}
                    onChangeText={setDate}
                  />
                </View>
              </View>
            </View>

            {/* Category */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORY *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -2 }}>
                <View style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: category === cat ? (type === "income" ? colors.income : colors.expense) : colors.background,
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

                  <TouchableOpacity
                    style={[
                      styles.chip,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        borderStyle: "dashed",
                      },
                    ]}
                    onPress={() => setIsAddingCategory((prev) => !prev)}
                  >
                    <Text style={[styles.chipText, { color: type === "income" ? colors.income : colors.expense, fontWeight: "600" }]}>
                      + Add Category
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {isAddingCategory && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        color: colors.foreground,
                        fontSize: 13,
                      },
                    ]}
                    placeholder="New category name..."
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={newCatInput}
                    onChangeText={setNewCatInput}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={{
                      backgroundColor: type === "income" ? colors.income : colors.expense,
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 8,
                    }}
                    onPress={async () => {
                      const trimmed = newCatInput.trim();
                      if (trimmed) {
                        await addCustomCategory(type, trimmed);
                        setCategory(trimmed);
                        setNewCatInput("");
                        setIsAddingCategory(false);
                      }
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 13 }}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      backgroundColor: colors.border + "40",
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      borderRadius: 8,
                    }}
                    onPress={() => {
                      setIsAddingCategory(false);
                      setNewCatInput("");
                    }}
                  >
                    <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Department (Expenses only) */}
            {type === "expense" && (
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>DEPARTMENT COST CENTER *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}>
                    {departments.length === 0 ? (
                      <Text style={{ color: colors.mutedForeground, fontSize: 13, fontStyle: "italic", paddingVertical: 4 }}>
                        No departments created yet. Please register a department first.
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
                </ScrollView>
              </View>
            )}

            {/* Department Budget Status Badge (Expenses only) */}
            {type === "expense" && (
              <View
                style={{
                  marginTop: -6,
                  marginBottom: 16,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: selectedDeptMetric?.hasBudget
                    ? (selectedDeptMetric.isExhausted ? colors.expense + "15" : colors.card)
                    : colors.expense + "15",
                  borderWidth: 1,
                  borderColor: selectedDeptMetric?.hasBudget
                    ? (selectedDeptMetric.isExhausted ? colors.expense + "40" : colors.border)
                    : colors.expense + "40",
                }}
              >
                {selectedDeptMetric?.hasBudget ? (
                  <View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.5 }}>
                        DEPARTMENT BUDGET HEALTH
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: selectedDeptMetric.isExhausted ? colors.expense : "#10B981",
                        }}
                      >
                        {selectedDeptMetric.isExhausted
                          ? "Budget Depleted"
                          : `${((selectedDeptMetric.spent / selectedDeptMetric.allocated) * 100).toFixed(0)}% Utilized`}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Allocated</Text>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                          {settings.currency} {selectedDeptMetric.allocated.toLocaleString()}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Spent</Text>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>
                          {settings.currency} {selectedDeptMetric.spent.toLocaleString()}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Remaining Budget</Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: selectedDeptMetric.remaining > 0 ? "#10B981" : colors.expense,
                          }}
                        >
                          {settings.currency} {selectedDeptMetric.remaining.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>⚠️</Text>
                    <Text style={{ fontSize: 12, color: colors.expense, fontWeight: "600", flex: 1 }}>
                      No budget has been allocated to this department. Allocate a department budget before recording an expense.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Budget Allocation (Expenses only) */}
            {type === "expense" && budgets && budgets.length > 0 && (
              <View style={styles.formGroup}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0 }]}>LINKED BUDGET (OPTIONAL)</Text>
                  <Text style={{ fontSize: 11, color: selectedBudgetId ? colors.expense : colors.mutedForeground }}>
                    {selectedBudgetId ? "Linked to Budget Ceiling" : "Unbudgeted (Discretionary)"}
                  </Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}>
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        {
                          backgroundColor: !selectedBudgetId ? colors.primary : colors.background,
                          borderColor: !selectedBudgetId ? "transparent" : colors.border,
                        },
                      ]}
                      onPress={() => setSelectedBudgetId("")}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: !selectedBudgetId ? "#FFFFFF" : colors.foreground },
                        ]}
                      >
                        None (Unbudgeted Expense)
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
                              backgroundColor: isSelected ? colors.expense : colors.background,
                              borderColor: isSelected ? "transparent" : colors.border,
                            },
                          ]}
                          onPress={() => {
                            setSelectedBudgetId(b.id);
                            if (b.category) setCategory(b.category);
                            if (b.department && b.department !== "All") setDepartment(b.department);
                          }}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: isSelected ? "#FFFFFF" : colors.foreground },
                            ]}
                          >
                            [{b.department || "General"}] {b.category || "All"} ({settings.currency} {Number(b.allocated || 0).toLocaleString()})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Reference Number */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>REFERENCE / INVOICE #</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="TXN-XXXXXX"
                  placeholderTextColor={colors.mutedForeground + "80"}
                  value={referenceNumber}
                  onChangeText={setReferenceNumber}
                />
              </View>
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>MEMO / DESCRIPTION</Text>
              <View style={[styles.textAreaWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.textArea, { color: colors.foreground }]}
                  placeholder="Add institutional memo, grant details, or vendor notes..."
                  placeholderTextColor={colors.mutedForeground + "80"}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
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
                  backgroundColor: type === "income" ? colors.income : colors.expense,
                  opacity: submitting ? 0.7 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <SvgPlus size={15} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>
                {submitting ? "Saving..." : isEditing ? "Update Transaction" : type === "income" ? "Record Inflow" : "Record Outflow"}
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
  typeSwitcher: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 6,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
  },
  typeBtnText: {
    fontSize: 12.5,
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
  },
  textAreaWrap: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  textArea: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    minHeight: 60,
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
