import { Feather } from "@/components/UniversalIcon";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState, useEffect } from "react";
import {
  Alert,
  BackHandler,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DonutChart } from "@/components/DonutChart";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { useAuth } from "@/context/AuthContext";
import { useFinance, Budget } from "@/context/FinanceContext";
import {
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateBudgetSpentForCategory,
  calculateBudgetRemaining,
  calculateTotalIncome,
  calculateTotalExpenses,
  validateBudgetAllocationAgainstNetCash,
} from "@/services/FinancialCalculationEngine";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { showFloatingToast } from "@/utils/toast";

const DEPARTMENTS = [
  "Software Engineering",
  "Administration",
  "Research & Development",
  "Finance",
  "Marketing",
  "Operations",
  "Human Resources",
  "Logistics",
];
const CATS = [
  "Salaries",
  "Equipment",
  "Utilities",
  "Research",
  "Maintenance",
  "Travel",
  "Marketing",
  "Software",
  "Supplies",
  "Consulting",
  "Other",
];
const DEPT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4"];

function fmtNum(n: number) {
  return Number(n || 0).toLocaleString();
}

export default function BudgetScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    budgets,
    transactions,
    addBudget,
    updateBudget,
    deleteBudget,
    departments,
    totalIncome,
    totalAllocatedBudget,
    unallocatedFunds,
    totalBudgetSpent,
    totalBudgetRemaining,
    budgetUtilization,
    departmentMetrics,
  } = useFinance();
  const { settings } = useSettings();
  const keyboardHeight = useKeyboardHeight();

  const availableDepts = useMemo(() => {
    const list = departments && departments.length > 0 ? departments.map((d) => d.name) : [];
    const set = new Set([...list, ...(departmentMetrics || []).map((d) => d.name), ...budgets.map((b) => b.department)]);
    return Array.from(set).filter(Boolean);
  }, [departments, departmentMetrics, budgets]);

  const defaultPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);
  const [dept, setDept] = useState(departments[0]?.name || "");
  const [cat, setCat] = useState(CATS[0]);
  const [allocated, setAllocated] = useState("");
  const [period, setPeriod] = useState(defaultPeriod);
  const [error, setError] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("All");

  const canEdit = user?.role === "admin";
  const webTop = Platform.OS === "web" ? 67 : 0;

  // Operating cash and Available to Allocate buffer
  const netCash = useMemo(() => {
    return calculateTotalIncome(transactions) - calculateTotalExpenses(transactions);
  }, [transactions]);

  const availableToAllocate = useMemo(() => {
    return Math.max(0, netCash - totalAllocatedBudget);
  }, [netCash, totalAllocatedBudget]);

  const unallocatedNetCash = availableToAllocate;

  // Compute spend per budget item using central calculateBudgetSpentForCategory
  const budgetWithSpend = useMemo(() =>
    budgets.map((b) => {
      const spent = calculateBudgetSpentForCategory(b, transactions);
      return { ...b, spent };
    }),
    [budgets, transactions]
  );

  // Group by department based on authoritative departmentMetrics (real departments, no fake "General")
  const deptBudgetData = useMemo(() => {
    const active = (departmentMetrics || []).filter((d) => d.allocated > 0);
    return active.map((d, i) => ({
      label: d.name,
      value: d.allocated,
      spent: d.spent,
      remaining: d.remaining,
      utilization: d.utilizationPct,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }));
  }, [departmentMetrics]);

  // Overall totals from authoritative context
  const totalAllocated = totalAllocatedBudget;
  const totalSpent = totalBudgetSpent;
  const totalRemaining = totalBudgetRemaining;
  const overallUtilization = budgetUtilization;

  // Filtered department metrics for Section 8 overview
  const filteredDeptMetrics = useMemo(() => {
    if (selectedDeptFilter === "All") return departmentMetrics || [];
    return (departmentMetrics || []).filter(
      (d) => d.name.trim().toLowerCase() === selectedDeptFilter.trim().toLowerCase()
    );
  }, [departmentMetrics, selectedDeptFilter]);

  // Filtered budget list
  const filteredBudgets = useMemo(() => {
    if (selectedDeptFilter === "All") return budgetWithSpend;
    return budgetWithSpend.filter((b) => (b.department || "").trim().toLowerCase() === selectedDeptFilter.trim().toLowerCase());
  }, [budgetWithSpend, selectedDeptFilter]);

  const handleOpenAdd = () => {
    setEditingBudget(null);
    setDept(availableDepts[0] || DEPARTMENTS[0]);
    setCat(CATS[0]);
    setAllocated("");
    setPeriod(defaultPeriod);
    setError("");
    setModalVisible(true);
  };

  const handleOpenEdit = (b: Budget) => {
    setEditingBudget(b);
    setDept(b.department || availableDepts[0] || DEPARTMENTS[0]);
    setCat(b.category || CATS[0]);
    setAllocated(String(b.allocated || ""));
    setPeriod(b.period || defaultPeriod);
    setError("");
    setModalVisible(true);
  };

  const handleSave = () => {
    const amt = parseFloat(allocated);
    if (!allocated || isNaN(amt) || amt <= 0) {
      setError("Enter valid positive amount");
      return;
    }

    const validation = validateBudgetAllocationAgainstNetCash(
      amt,
      transactions,
      budgets,
      departments,
      {
        type: "budget",
        editingBudgetId: editingBudget?.id,
        targetDepartmentName: dept,
        currency: settings.currency || "PKR",
      }
    );

    if (!validation.isValid) {
      setError(validation.errorMessage || "Allocation exceeds Available Net Cash.");
      return;
    }

    if (editingBudget) {
      updateBudget(editingBudget.id, { department: dept, category: cat, allocated: amt, period });
    } else {
      addBudget({ department: dept, category: cat, allocated: amt, period });
    }
    setAllocated("");
    setError("");
    setEditingBudget(null);
    setModalVisible(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteBudget = (item: any) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeletingBudget(item);
  };

  useEffect(() => {
    const onBackPress = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, []);

  const handleGoBack = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: webTop + insets.top + (Platform.OS === "android" ? 22 : 12),
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={handleGoBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Budget Planning</Text>
          {canEdit ? (
            <TouchableOpacity
              onPress={handleOpenAdd}
              style={[styles.addIconBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "33" }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="plus" size={20} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 32 }} />
          )}
        </View>

        {/* Section 8: Top 5 Executive Summary KPI Cards */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.kpiScroll}
          contentContainerStyle={styles.kpiScrollContent}
        >
          {/* Card 1: TOTAL INCOME */}
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.kpiCardTop}>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]} numberOfLines={2}>TOTAL INCOME</Text>
              <Feather name="trending-up" size={12} color={colors.income} />
            </View>
            <Text style={[styles.kpiVal, { color: colors.income }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
              {settings.currency} {fmtNum(totalIncome)}
            </Text>
          </View>

          {/* Card 2: TOTAL ALLOCATED */}
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.kpiCardTop}>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]} numberOfLines={2}>ALLOCATED</Text>
              <Feather name="pie-chart" size={12} color={colors.primary} />
            </View>
            <Text style={[styles.kpiVal, { color: colors.foreground }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
              {settings.currency} {fmtNum(totalAllocated)}
            </Text>
          </View>

          {/* Card 3: AVAILABLE TO ALLOCATE */}
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: availableToAllocate > 0 ? colors.income + "40" : colors.border }]}>
            <View style={styles.kpiCardTop}>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]} numberOfLines={2}>AVAILABLE</Text>
              <Feather name="check-circle" size={12} color={availableToAllocate > 0 ? colors.income : colors.warning} />
            </View>
            <Text style={[styles.kpiVal, { color: availableToAllocate > 0 ? colors.income : colors.warning }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
              {settings.currency} {fmtNum(availableToAllocate)}
            </Text>
          </View>

          {/* Card 4: TOTAL DEPARTMENT SPENDING */}
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.kpiCardTop}>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]} numberOfLines={2}>SPENDING</Text>
              <Feather name="arrow-up-right" size={12} color={colors.expense} />
            </View>
            <Text style={[styles.kpiVal, { color: colors.expense }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
              {settings.currency} {fmtNum(totalSpent)}
            </Text>
          </View>

          {/* Card 5: REMAINING DEPARTMENT FUNDS */}
          <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.kpiCardTop}>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]} numberOfLines={2}>REMAINING</Text>
              <Feather name="shield" size={12} color={totalRemaining >= 0 ? colors.primary : colors.expense} />
            </View>
            <Text style={[styles.kpiVal, { color: totalRemaining >= 0 ? colors.income : colors.expense }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
              {settings.currency} {fmtNum(totalRemaining)}
            </Text>
          </View>
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Department Budget Allocation Interactive Donut Card */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Department Budget Allocation
              </Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                Interactive allocation & utilization breakdown
              </Text>
            </View>
            <View style={[styles.utilBadge, { backgroundColor: (overallUtilization > 100 ? colors.expense : colors.primary) + "18", borderColor: (overallUtilization > 100 ? colors.expense : colors.primary) + "33" }]}>
              <Text style={[styles.utilBadgeText, { color: overallUtilization > 100 ? colors.expense : colors.primary }]}>
                {overallUtilization.toFixed(0)}% Used
              </Text>
            </View>
          </View>

          {/* Symmetrical Concentric Donut Chart */}
          <DonutChart
            segments={deptBudgetData.map((d) => ({
              label: d.label,
              value: d.value,
              color: d.color,
            }))}
            size={132}
            strokeWidth={11}
            centerLabel={`${settings.currency} ${fmtNum(totalAllocated)}`}
            centerSub="Total Allocated"
            currency={settings.currency}
            selectedLabel={selectedDeptFilter === "All" ? undefined : selectedDeptFilter}
            onSelectLabel={(label) => {
              if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
              setSelectedDeptFilter(label || "All");
            }}
            showChips={false}
          />

          {/* Department Filter Pills (Smooth Edge-to-Edge Slider) */}
          <View style={styles.filterPillsSection}>
            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>FILTER BY DEPARTMENT</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterPillsScroll}
              contentContainerStyle={styles.filterPillsRow}
            >
              <TouchableOpacity
                style={[
                  styles.deptPill,
                  {
                    backgroundColor: selectedDeptFilter === "All" ? colors.primary : (colors.cardAlt ?? colors.muted),
                    borderColor: selectedDeptFilter === "All" ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                  setSelectedDeptFilter("All");
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.deptPillText,
                    { color: selectedDeptFilter === "All" ? "#FFFFFF" : colors.mutedForeground },
                    selectedDeptFilter === "All" && { fontFamily: "Inter_700Bold" },
                  ]}
                >
                  All Depts ({availableDepts.length})
                </Text>
              </TouchableOpacity>

              {availableDepts.map((dName, idx) => {
                const isSelected = selectedDeptFilter.toLowerCase() === dName.toLowerCase();
                const dColor = DEPT_COLORS[idx % DEPT_COLORS.length];
                return (
                  <TouchableOpacity
                    key={dName}
                    style={[
                      styles.deptPill,
                      {
                        backgroundColor: isSelected ? dColor : (colors.cardAlt ?? colors.muted),
                        borderColor: isSelected ? dColor : colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                      setSelectedDeptFilter(isSelected ? "All" : dName);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.deptDot, { backgroundColor: isSelected ? "#FFFFFF" : dColor }]} />
                    <Text
                      style={[
                        styles.deptPillText,
                        { color: isSelected ? "#FFFFFF" : colors.foreground },
                        isSelected && { fontFamily: "Inter_700Bold" },
                      ]}
                    >
                      {dName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Section 8: Department Allocations Overview */}
        <View style={styles.listHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Department Allocations
          </Text>
          <Text style={[styles.itemCountText, { color: colors.mutedForeground }]}>
            {filteredDeptMetrics.length} {filteredDeptMetrics.length === 1 ? "dept" : "depts"}
          </Text>
        </View>

        {filteredDeptMetrics.map((dm) => {
          const statusColor =
            dm.status === "over"
              ? colors.expense
              : dm.status === "warning"
              ? colors.warning
              : dm.status === "no_budget"
              ? colors.mutedForeground
              : colors.income;

          const statusText =
            dm.status === "over"
              ? "OVERRUN"
              : dm.status === "warning"
              ? "NEAR CEILING"
              : dm.status === "no_budget"
              ? "UNBUDGETED"
              : "ON TRACK";

          const utilPct = Math.min(Math.round(dm.utilizationPct), 100);

          return (
            <View
              key={dm.id || dm.name}
              style={[
                styles.budgetCard,
                {
                  backgroundColor: colors.card,
                  borderColor: dm.status === "over" ? colors.expense + "60" : colors.border,
                },
              ]}
            >
              <View style={styles.budgetHeader}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.budgetDept, { color: colors.foreground }]}>{dm.name}</Text>
                  <Text style={[styles.budgetCat, { color: colors.mutedForeground }]}>
                    Payroll: {settings.currency} {fmtNum(dm.payrollSpending)} · Other: {settings.currency} {fmtNum(dm.otherSpending)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "18", borderColor: statusColor + "33" }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
                  </View>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: statusColor }}>
                    {dm.utilizationPct.toFixed(1)}% Used
                  </Text>
                </View>
              </View>

              <View style={styles.cardProgressWrap}>
                <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                  <View style={[styles.progressFill, { backgroundColor: statusColor, width: `${utilPct}%` }]} />
                </View>
              </View>

              <View style={[styles.deptMetricsRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={styles.deptMetricItem}>
                  <Text style={[styles.deptMetricLabel, { color: colors.mutedForeground }]}>ALLOCATED</Text>
                  <Text style={[styles.deptMetricVal, { color: colors.foreground }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {settings.currency} {fmtNum(dm.allocated)}
                  </Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.deptMetricItem}>
                  <Text style={[styles.deptMetricLabel, { color: colors.mutedForeground }]}>SPENT</Text>
                  <Text style={[styles.deptMetricVal, { color: colors.expense }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {settings.currency} {fmtNum(dm.spent)}
                  </Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.deptMetricItem}>
                  <Text style={[styles.deptMetricLabel, { color: colors.mutedForeground }]}>REMAINING</Text>
                  <Text style={[styles.deptMetricVal, { color: dm.remaining >= 0 ? colors.income : colors.expense }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {settings.currency} {fmtNum(dm.remaining)}
                  </Text>
                </View>
              </View>

              {canEdit && (
                <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 6 }}>
                  <TouchableOpacity
                    style={[styles.deptActionBtn, { borderColor: colors.primary }]}
                    onPress={() => {
                      setDept(dm.name);
                      setEditingBudget(null);
                      setAllocated("");
                      setPeriod(defaultPeriod);
                      setError("");
                      setModalVisible(true);
                    }}
                  >
                    <Feather name="plus" size={13} color={colors.primary} />
                    <Text style={[styles.deptActionBtnText, { color: colors.primary }]}>Allocate Budget</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Detailed Department Budgets List */}
        <View style={[styles.listHeaderRow, { marginTop: 12 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {selectedDeptFilter === "All" ? "Category Line-Items" : `${selectedDeptFilter} Line-Items`}
          </Text>
          <Text style={[styles.itemCountText, { color: colors.mutedForeground }]}>
            {filteredBudgets.length} {filteredBudgets.length === 1 ? "line" : "lines"}
          </Text>
        </View>

        {filteredBudgets.map((item) => {
          const pctUsed = Math.min((item.spent / Math.max(item.allocated, 1)) * 100, 100);
          const remaining = Math.max(item.allocated - item.spent, 0);
          const statusColor =
            pctUsed >= 95 ? colors.expense : pctUsed >= 75 ? colors.warning : colors.income;

          return (
            <View
              key={item.id}
              style={[styles.budgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.budgetHeader}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.budgetDept, { color: colors.foreground }]}>
                    {item.department}
                  </Text>
                  <Text style={[styles.budgetCat, { color: colors.mutedForeground }]}>
                    {item.category} · {item.period}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + "18", borderColor: statusColor + "33" }]}>
                    <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                      {pctUsed === 0
                        ? "0% Used · Fresh"
                        : pctUsed < 75
                        ? `${pctUsed.toFixed(0)}% Used · On Track`
                        : pctUsed < 95
                        ? `${pctUsed.toFixed(0)}% Used · Near Limit`
                        : `${pctUsed.toFixed(0)}% Used · Exceeded`}
                    </Text>
                  </View>
                  {canEdit && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          handleOpenEdit(item);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[styles.trashBtn, { backgroundColor: colors.primary + "18", borderRadius: 8, padding: 6 }]}
                      >
                        <Feather name="edit-2" size={13} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteBudget(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[styles.trashBtn, { backgroundColor: colors.expense + "18", borderRadius: 8, padding: 6 }]}
                      >
                        <Feather name="trash-2" size={13} color={colors.expense} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>

              {/* Progress Bar & Amount Row */}
              <View style={styles.cardProgressWrap}>
                <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                  <View style={[styles.progressFill, { backgroundColor: statusColor, width: `${pctUsed}%` }]} />
                </View>
                <View style={styles.cardAmountsRow}>
                  <Text style={[styles.cardAmtText, { color: colors.mutedForeground }]}>
                    Spent: <Text style={{ color: colors.expense, fontFamily: "Inter_700Bold" }}>{settings.currency} {fmtNum(item.spent)}</Text>
                  </Text>
                  <Text style={[styles.cardAmtText, { color: colors.mutedForeground }]}>
                    Limit: <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>{settings.currency} {fmtNum(item.allocated)}</Text>
                  </Text>
                  <Text style={[styles.cardAmtText, { color: colors.mutedForeground }]}>
                    Left: <Text style={{ color: colors.income, fontFamily: "Inter_700Bold" }}>{settings.currency} {fmtNum(remaining)}</Text>
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {filteredBudgets.length === 0 && (
          <View style={styles.empty}>
            <Feather name="pie-chart" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {budgets.length === 0 ? "No budget created yet." : "No budgets found for this department"}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Add / Edit Budget Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={[styles.overlay, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.handle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingBudget ? "Modify Budget Allocation" : "Add Department Budget"}
            </Text>
            
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
              {/* Available Net Cash Status Banner */}
              <View
                style={{
                  backgroundColor: unallocatedNetCash <= 0 ? "#EF444415" : "#10B98115",
                  borderColor: unallocatedNetCash <= 0 ? "#EF444440" : "#10B98140",
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 12,
                  marginTop: 4,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: unallocatedNetCash <= 0 ? "#EF4444" : "#10B981" }}>
                    {unallocatedNetCash <= 0 ? "⚠️ NO UNALLOCATED CASH AVAILABLE" : "✓ AVAILABLE TO ALLOCATE"}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: unallocatedNetCash <= 0 ? "#EF4444" : "#10B981" }}>
                    {settings.currency || "PKR"} {unallocatedNetCash.toLocaleString()}
                  </Text>
                </View>
                <Text style={{ fontSize: 10.5, color: colors.mutedForeground, marginTop: 2 }}>
                  {unallocatedNetCash <= 0
                    ? `Total Net Cash is ${settings.currency || "PKR"} ${netCash.toLocaleString()}, all of which is already committed to existing budgets.`
                    : `Total Net Cash: ${settings.currency || "PKR"} ${netCash.toLocaleString()} · Already Allocated: ${settings.currency || "PKR"} ${totalAllocatedBudget.toLocaleString()}`}
                </Text>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SELECT DEPARTMENT</Text>
              {availableDepts.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 12.5, fontStyle: "italic", marginBottom: 8 }}>
                  No departments created yet. Please create a department first.
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalChipsRow}>
                  {availableDepts.map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.modalChip,
                        {
                          backgroundColor: dept === d ? colors.primary : (colors.cardAlt ?? colors.muted),
                          borderColor: dept === d ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setDept(d)}
                    >
                      <Text style={[styles.modalChipText, { color: dept === d ? "#fff" : colors.foreground }]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 10 }]}>SELECT CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalChipsRow}>
                {CATS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.modalChip,
                      {
                        backgroundColor: cat === c ? colors.primary : (colors.cardAlt ?? colors.muted),
                        borderColor: cat === c ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setCat(c)}
                  >
                    <Text style={[styles.modalChipText, { color: cat === c ? "#fff" : colors.foreground }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 10 }]}>ALLOCATED AMOUNT ({settings.currency})</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.input,
                    borderColor: error ? colors.expense : colors.border,
                    color: colors.foreground,
                  },
                ]}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                value={allocated}
                onChangeText={(v) => {
                  setAllocated(v);
                  setError("");
                }}
              />
              {error ? <Text style={[styles.error, { color: colors.expense }]}>{error}</Text> : null}

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 10 }]}>PERIOD (YYYY-MM)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                placeholder="YYYY-MM"
                placeholderTextColor={colors.mutedForeground}
                value={period}
                onChangeText={setPeriod}
              />

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                  <Text style={styles.addBtnText}>
                    {editingBudget ? "Update Budget" : "Save Budget"}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Ultra-Premium Custom Delete Confirmation Modal */}
      <ConfirmDeleteModal
        visible={Boolean(deletingBudget)}
        title="Delete Budget Allocation"
        subtitle="Are you sure you want to permanently remove this budget line item?"
        itemName={deletingBudget ? `${deletingBudget.department} — ${deletingBudget.category}` : undefined}
        itemDetails={deletingBudget ? `Period: ${deletingBudget.period || defaultPeriod}` : undefined}
        itemAmount={deletingBudget ? `${settings.currency} ${fmtNum(deletingBudget.allocated)}` : undefined}
        confirmText="Yes, Delete It"
        onCancel={() => setDeletingBudget(null)}
        onConfirm={async () => {
          if (deletingBudget) {
            const b = deletingBudget;
            setDeletingBudget(null);
            await deleteBudget(b.id);
            showFloatingToast("Budget Deleted", `${b.department} - ${b.category} was permanently removed.`);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  addIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiScroll: {
    marginTop: 6,
  },
  kpiScrollContent: {
    gap: 8,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  kpiCard: {
    minWidth: 135,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  kpiCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 4,
  },
  kpiLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  kpiVal: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  deptMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 6,
  },
  deptMetricItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  deptMetricLabel: {
    fontSize: 8.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  deptMetricVal: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  deptActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  deptActionBtnText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  summaryCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  summaryColItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  summaryColLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  summaryColValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  summaryDivider: {
    width: 1,
    height: 24,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  cardSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  utilBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  utilBadgeText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
  },
  filterPillsSection: {
    gap: 8,
    marginTop: 6,
  },
  filterLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  filterPillsScroll: {
    marginHorizontal: -14,
  },
  filterPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  deptPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
  },
  deptDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  deptPillText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  itemCountText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  budgetCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  budgetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  budgetDept: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  budgetCat: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  trashBtn: {
    padding: 4,
  },
  cardProgressWrap: {
    gap: 6,
  },
  progressTrack: {
    height: 5,
    borderRadius: 2.5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2.5,
  },
  cardAmountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  cardAmtText: {
    fontSize: 10.5,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 36,
    gap: 10,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#94a3b8",
    alignSelf: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  modalChipsRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  modalChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  error: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  modalBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  addBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  addBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
