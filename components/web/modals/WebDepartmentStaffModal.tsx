import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { Department, useFinance } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import {
  SvgUsers,
  SvgX,
  SvgBriefcase,
  SvgCheck,
  SvgSearch,
  SvgLayers,
} from "../SvgIcons";
import { isSalaryExpenseCategory } from "@/constants/categories";

interface WebDepartmentStaffModalProps {
  visible: boolean;
  onClose: () => void;
  department?: Department | null;
  onEditDepartment?: (dept: Department) => void;
}

export function WebDepartmentStaffModal({
  visible,
  onClose,
  department,
  onEditDepartment,
}: WebDepartmentStaffModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { settings } = useSettings();
  const { payroll = [], departments = [], budgets = [], transactions = [] } = useFinance();

  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Sync state whenever modal opens or initial department prop changes
  useEffect(() => {
    if (visible) {
      if (department && department.id) {
        setSelectedDeptId(department.id);
      } else {
        setSelectedDeptId("ALL");
      }
      setSearchQuery("");
    }
  }, [visible, department]);

  // Build department filter list: official departments and any extra departments found in payroll
  const allFilterDepts = useMemo(() => {
    const knownNames = new Set(departments.map((d) => d.name.trim().toLowerCase()));
    const extraNames = Array.from(
      new Set(
        payroll
          .map((p) => p.department?.trim())
          .filter((name): name is string => Boolean(name && !knownNames.has(name.toLowerCase())))
      )
    );

    const extras: Department[] = extraNames.map((name) => ({
      id: `custom_${name.toLowerCase()}`,
      name,
      headCount: 0,
      budgetAllocated: 0,
    }));

    return [...departments, ...extras];
  }, [departments, payroll]);

  // Determine currently active department object (if not "ALL")
  const activeDept = useMemo(() => {
    if (selectedDeptId === "ALL") return null;
    return (
      allFilterDepts.find(
        (d) =>
          d.id === selectedDeptId ||
          d.name.trim().toLowerCase() === selectedDeptId.trim().toLowerCase()
      ) || null
    );
  }, [selectedDeptId, allFilterDepts]);

  const isAllSelected = selectedDeptId === "ALL";

  // Filter staff by selected department
  const deptStaff = useMemo(() => {
    if (isAllSelected) {
      return payroll;
    }
    const targetDeptName = (activeDept ? activeDept.name : selectedDeptId).trim().toLowerCase();
    return payroll.filter(
      (p) => (p.department || "").trim().toLowerCase() === targetDeptName
    );
  }, [payroll, isAllSelected, activeDept, selectedDeptId]);

  // Apply search query filter (name, employeeId, designation, department)
  const filteredStaff = useMemo(() => {
    if (!searchQuery.trim()) return deptStaff;
    const q = searchQuery.trim().toLowerCase();
    return deptStaff.filter((p) => {
      const nameMatch = (p.employeeName || "").toLowerCase().includes(q);
      const idMatch = (p.employeeId || "").toLowerCase().includes(q);
      const desigMatch = (p.designation || "").toLowerCase().includes(q);
      const deptMatch = (p.department || "").toLowerCase().includes(q);
      return nameMatch || idMatch || desigMatch || deptMatch;
    });
  }, [deptStaff, searchQuery]);

  // Compute stats
  const totalMonthlyPayroll = deptStaff.reduce(
    (sum, p) => sum + (p.netSalary || p.baseSalary || 0),
    0
  );
  const registeredCount = deptStaff.length;

  // Headcount calculation
  const totalHeadcount = isAllSelected
    ? Math.max(
        departments.reduce((s, d) => s + (d.headCount || 0), 0),
        payroll.length
      )
    : activeDept?.headCount || registeredCount;

  const unassignedSlots = Math.max(0, totalHeadcount - registeredCount);

  // Financial breakdown for active department
  const activeDeptFinances = useMemo(() => {
    if (isAllSelected) {
      const allocated = departments.reduce((s, d) => s + (Number(d.budgetAllocated) || 0), 0);
      const allExpenses = transactions.filter(
        (t) => t && t.type === "expense" && t.status !== "failed" && (t as any).status !== "deleted"
      );
      const payrollSpending = allExpenses
        .filter((t) => t.expenseSource === "payroll" || Boolean(t.payrollId) || isSalaryExpenseCategory(t.category))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const otherTxList = allExpenses.filter(
        (t) => !(t.expenseSource === "payroll" || Boolean(t.payrollId) || isSalaryExpenseCategory(t.category))
      );
      const otherSpending = otherTxList.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const otherCategoryNames = Array.from(
        new Set(otherTxList.map((t) => t.category || t.title).filter(Boolean))
      );
      const otherCategorySummary =
        otherCategoryNames.length > 0 ? otherCategoryNames.slice(0, 2).join(", ") : "Non-payroll operations";
      const spent = payrollSpending + otherSpending;
      const remaining = Math.max(0, allocated - spent);
      const ratio = allocated > 0 ? (spent / allocated) * 100 : 0;
      const remainingRatio = allocated > 0 ? Math.max(0, 100 - ratio) : 0;
      return {
        allocated,
        spent,
        payrollSpending,
        otherSpending,
        otherCategorySummary,
        remaining,
        ratio,
        remainingRatio,
        isOver: allocated > 0 && spent > allocated,
      };
    }

    const targetDeptName = (activeDept ? activeDept.name : selectedDeptId).trim().toLowerCase();
    const lineBudgetsAllocated = budgets
      .filter((b) => (b.department || "").trim().toLowerCase() === targetDeptName)
      .reduce((s, b) => s + (Number(b.allocated) || 0), 0);
    const allocated = Math.max(Number(activeDept?.budgetAllocated) || 0, lineBudgetsAllocated);

    const deptTxs = transactions.filter(
      (t) =>
        t &&
        t.type === "expense" &&
        t.status !== "failed" &&
        (t as any).status !== "deleted" &&
        (t.department || "").trim().toLowerCase() === targetDeptName
    );
    const payrollSpending = deptTxs
      .filter((t) => t.expenseSource === "payroll" || Boolean(t.payrollId) || isSalaryExpenseCategory(t.category))
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const otherTxList = deptTxs.filter(
      (t) => !(t.expenseSource === "payroll" || Boolean(t.payrollId) || isSalaryExpenseCategory(t.category))
    );
    const otherSpending = otherTxList.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const otherCategoryNames = Array.from(
      new Set(otherTxList.map((t) => t.category || t.title).filter(Boolean))
    );
    const otherCategorySummary =
      otherCategoryNames.length > 0 ? otherCategoryNames.slice(0, 2).join(", ") : "Non-payroll operations";
    const spent = payrollSpending + otherSpending;
    const remaining = Math.max(0, allocated - spent);
    const ratio = allocated > 0 ? (spent / allocated) * 100 : 0;
    const remainingRatio = allocated > 0 ? Math.max(0, 100 - ratio) : 0;

    return {
      allocated,
      spent,
      payrollSpending,
      otherSpending,
      otherCategorySummary,
      remaining,
      ratio,
      remainingRatio,
      isOver: allocated > 0 && spent > allocated,
    };
  }, [isAllSelected, departments, activeDept, selectedDeptId, budgets, transactions]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, isMobile && { padding: 12 }]}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              width: isMobile ? "100%" : 620,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
              <View style={[styles.headerIconWrap, { backgroundColor: "#0EA5E918" }]}>
                {isAllSelected ? (
                  <SvgLayers size={20} color="#0EA5E9" />
                ) : (
                  <SvgUsers size={20} color="#0EA5E9" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {isAllSelected
                    ? "All Cost Centers — Staff & Roster"
                    : `${activeDept?.name || "Department"} — Staff & Roster`}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]} numberOfLines={3}>
                  {isAllSelected
                    ? `${totalHeadcount} Total Personnel Assigned • ${payroll.length} Payroll Profiles (All Units)`
                    : `${totalHeadcount} Total Personnel Assigned • ${registeredCount} Payroll Profiles`}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <SvgX size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Department Filter Selector Bar */}
          <View
            style={[
              styles.filterBar,
              {
                borderBottomColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
          >
            <View style={styles.filterBarHeader}>
              <Text style={[styles.filterBarLabel, { color: colors.mutedForeground }]}>
                SWITCH DEPARTMENT / COST CENTER:
              </Text>
              <Text style={[styles.filterBarCount, { color: "#0EA5E9" }]}>
                {allFilterDepts.length} Available
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterTabsScroll}
            >
              {/* All Departments Option */}
              <TouchableOpacity
                style={[
                  styles.filterTab,
                  {
                    backgroundColor: isAllSelected ? "#0EA5E9" : colors.card,
                    borderColor: isAllSelected ? "#0EA5E9" : colors.border,
                  },
                ]}
                onPress={() => setSelectedDeptId("ALL")}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: isAllSelected ? "#FFFFFF" : colors.foreground },
                  ]}
                >
                  All Departments
                </Text>
                <View
                  style={[
                    styles.tabBadge,
                    {
                      backgroundColor: isAllSelected
                        ? "rgba(255, 255, 255, 0.25)"
                        : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      { color: isAllSelected ? "#FFFFFF" : colors.mutedForeground },
                    ]}
                  >
                    {payroll.length}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Individual Department Chips */}
              {allFilterDepts.map((d) => {
                const isSelected =
                  selectedDeptId === d.id ||
                  (!isAllSelected &&
                    activeDept?.name?.toLowerCase() === d.name.toLowerCase());
                const deptCount = payroll.filter(
                  (p) =>
                    (p.department || "").trim().toLowerCase() ===
                    d.name.trim().toLowerCase()
                ).length;

                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[
                      styles.filterTab,
                      {
                        backgroundColor: isSelected ? "#0EA5E9" : colors.card,
                        borderColor: isSelected ? "#0EA5E9" : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedDeptId(d.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        { color: isSelected ? "#FFFFFF" : colors.foreground },
                      ]}
                    >
                      {d.name}
                    </Text>
                    <View
                      style={[
                        styles.tabBadge,
                        {
                          backgroundColor: isSelected
                            ? "rgba(255, 255, 255, 0.25)"
                            : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabBadgeText,
                          { color: isSelected ? "#FFFFFF" : colors.mutedForeground },
                        ]}
                      >
                        {deptCount}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Search Box */}
          <View
            style={[
              styles.searchBoxWrap,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <SvgSearch size={15} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder={`Search ${isAllSelected ? "all employees" : (activeDept?.name || "department") + " employees"} by name, ID, designation...`}
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                activeOpacity={0.7}
                style={{ padding: 4 }}
              >
                <SvgX size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Stats Grid with Headcount, Payroll, Allocated Budget, Total Used, Remaining Funds, and Operations */}
          <View style={styles.statsRow}>
            {/* Box 1: Allocated Budget */}
            <View
              style={[
                styles.statBox,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                ALLOCATED BUDGET
              </Text>
              <Text
                style={[styles.statValue, { color: colors.foreground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {activeDeptFinances.allocated > 0
                  ? `${settings.currency} ${activeDeptFinances.allocated.toLocaleString()}`
                  : "No Cap Set"}
              </Text>
              <Text
                style={[styles.statSub, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Approved ceiling
              </Text>
            </View>

            {/* Box 2: Total Used (Kitna Used Hoa) */}
            <View
              style={[
                styles.statBox,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                TOTAL USED
              </Text>
              <Text
                style={[
                  styles.statValue,
                  { color: activeDeptFinances.isOver ? colors.expense : "#F59E0B" },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {settings.currency} {activeDeptFinances.spent.toLocaleString()}
              </Text>
              <Text
                style={[
                  styles.statSub,
                  { color: activeDeptFinances.isOver ? colors.expense : colors.mutedForeground },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {activeDeptFinances.otherSpending > 0
                  ? `Pay: ${settings.currency} ${activeDeptFinances.payrollSpending.toLocaleString()} + Other: ${settings.currency} ${activeDeptFinances.otherSpending.toLocaleString()}`
                  : activeDeptFinances.allocated > 0
                  ? `${activeDeptFinances.ratio.toFixed(1)}% Cap utilized`
                  : "Actual spend"}
              </Text>
            </View>

            {/* Box 3: Remaining Funds */}
            <View
              style={[
                styles.statBox,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {activeDeptFinances.isOver ? "DEFICIT / OVER" : "REMAINING FUNDS"}
              </Text>
              <Text
                style={[
                  styles.statValue,
                  {
                    color: activeDeptFinances.isOver
                      ? colors.expense
                      : activeDeptFinances.remaining > 0
                      ? colors.income
                      : colors.mutedForeground,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {activeDeptFinances.allocated > 0
                  ? `${settings.currency} ${activeDeptFinances.remaining.toLocaleString()}`
                  : "Uncapped"}
              </Text>
              <Text
                style={[
                  styles.statSub,
                  { color: activeDeptFinances.isOver ? colors.expense : colors.mutedForeground },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {activeDeptFinances.allocated > 0
                  ? activeDeptFinances.isOver
                    ? `${(activeDeptFinances.ratio - 100).toFixed(1)}% Over budget`
                    : `${activeDeptFinances.remainingRatio.toFixed(1)}% Buffer left`
                  : "No limit assigned"}
              </Text>
            </View>

            {/* Box 4: Monthly Payroll */}
            <View
              style={[
                styles.statBox,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                MONTHLY PAYROLL
              </Text>
              <Text
                style={[styles.statValue, { color: "#8B5CF6" }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {settings.currency} {totalMonthlyPayroll.toLocaleString()}
              </Text>
              <Text
                style={[styles.statSub, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Direct compensation
              </Text>
            </View>

            {/* Box 5: Other Department Expenses */}
            <View
              style={[
                styles.statBox,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                OTHER EXPENSES
              </Text>
              <Text
                style={[styles.statValue, { color: "#06B6D4" }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {settings.currency} {activeDeptFinances.otherSpending.toLocaleString()}
              </Text>
              <Text
                style={[styles.statSub, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {activeDeptFinances.otherSpending > 0
                  ? activeDeptFinances.otherCategorySummary
                  : "Non-payroll operations"}
              </Text>
            </View>

            {/* Box 6: Unit Headcount */}
            <View
              style={[
                styles.statBox,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.statLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {isAllSelected ? "TOTAL HEADCOUNT" : "UNIT HEADCOUNT"}
              </Text>
              <Text
                style={[styles.statValue, { color: "#0EA5E9" }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {totalHeadcount}
              </Text>
              <Text
                style={[styles.statSub, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {registeredCount} {registeredCount === 1 ? "profile" : "profiles"} active
              </Text>
            </View>
          </View>

          {/* Executive Budget Reconciliation Progress Bar */}
          {activeDeptFinances.allocated > 0 && (
            <View
              style={[
                styles.budgetBarCard,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <View style={styles.budgetBarHeader}>
                <Text style={[styles.budgetBarTitle, { color: colors.mutedForeground }]}>
                  BUDGET RECONCILIATION
                </Text>
                <Text
                  style={[
                    styles.budgetBarRatio,
                    { color: activeDeptFinances.isOver ? colors.expense : "#10B981" },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {activeDeptFinances.ratio.toFixed(1)}% Used • {activeDeptFinances.remainingRatio.toFixed(1)}% Remaining
                </Text>
              </View>

              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                {/* Payroll Portion (Purple) */}
                <View
                  style={[
                    styles.progressSegment,
                    {
                      width: `${Math.min(100, (activeDeptFinances.payrollSpending / activeDeptFinances.allocated) * 100)}%`,
                      backgroundColor: "#8B5CF6",
                    },
                  ]}
                />
                {/* Other Expenses Portion (Cyan) */}
                <View
                  style={[
                    styles.progressSegment,
                    {
                      width: `${Math.min(
                        Math.max(0, 100 - (activeDeptFinances.payrollSpending / activeDeptFinances.allocated) * 100),
                        (activeDeptFinances.otherSpending / activeDeptFinances.allocated) * 100
                      )}%`,
                      backgroundColor: "#06B6D4",
                    },
                  ]}
                />
              </View>

              {/* Legend with exact amounts */}
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#8B5CF6" }]} />
                  <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
                    Payroll:{" "}
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                      {settings.currency} {activeDeptFinances.payrollSpending.toLocaleString()}
                    </Text>
                  </Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#06B6D4" }]} />
                  <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
                    Other:{" "}
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                      {settings.currency} {activeDeptFinances.otherSpending.toLocaleString()}
                    </Text>
                  </Text>
                </View>

                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
                  <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
                    Remaining:{" "}
                    <Text style={{ color: "#10B981", fontFamily: "Inter_600SemiBold" }}>
                      {settings.currency} {activeDeptFinances.remaining.toLocaleString()}
                    </Text>
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Personnel List */}
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={{ gap: 10, paddingVertical: 6 }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>
                REGISTERED EMPLOYEES ({filteredStaff.length}
                {filteredStaff.length !== deptStaff.length ? ` of ${deptStaff.length}` : ""})
              </Text>
              {searchQuery.trim().length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")} activeOpacity={0.7}>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#0EA5E9",
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    Clear Filter
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {filteredStaff.length === 0 ? (
              <View
                style={[
                  styles.emptyRoster,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <SvgBriefcase size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyRosterText, { color: colors.foreground }]}>
                  {searchQuery.trim().length > 0
                    ? `No employees match "${searchQuery}"`
                    : isAllSelected
                    ? "No staff payroll entries found in the organization yet."
                    : `No individual staff payroll entries mapped for "${activeDept?.name || "this department"}" yet.`}
                </Text>
                <Text style={[styles.emptyRosterSub, { color: colors.mutedForeground }]}>
                  {searchQuery.trim().length > 0
                    ? "Try searching for a different keyword or switch to another department tab above."
                    : "Individual profiles can be registered and assigned in the Staff Payroll tab."}
                </Text>
              </View>
            ) : (
              filteredStaff.map((staff) => (
                <View
                  key={staff.id}
                  style={[
                    styles.staffCard,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.staffAvatar}>
                    <Text style={styles.staffAvatarText}>
                      {staff.employeeName
                        ? staff.employeeName
                            .split(" ")
                            .filter(Boolean)
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()
                        : "EM"}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.staffName, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {staff.employeeName}
                    </Text>
                    <Text
                      style={[styles.staffMeta, { color: colors.mutedForeground }]}
                      numberOfLines={2}
                    >
                      {staff.employeeId} • {staff.designation || "Staff Member"}
                    </Text>
                    <View style={styles.deptBadgeWrap}>
                      <View style={[styles.deptBadge, { backgroundColor: "#0EA5E915" }]}>
                        <Text style={[styles.deptBadgeText, { color: "#0EA5E9" }]}>
                          {staff.department || "General"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.staffSalary, { color: colors.foreground }]}>
                      {settings.currency}{" "}
                      {Number(staff.netSalary || staff.baseSalary || 0).toLocaleString()}
                    </Text>
                    <View style={styles.paidBadge}>
                      <SvgCheck size={10} color="#10B981" />
                      <Text style={styles.paidBadgeText}>Active</Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            {!isAllSelected && unassignedSlots > 0 && !searchQuery.trim() && (
              <View style={[styles.unassignedBox, { borderColor: colors.border }]}>
                <Text style={[styles.unassignedText, { color: colors.mutedForeground }]}>
                  + {unassignedSlots} additional operational personnel positions assigned to this department
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
            {!isAllSelected && activeDept && onEditDepartment && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={() => {
                  onClose();
                  onEditDepartment(activeDept);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                  Adjust Headcount ({activeDept.name})
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#0EA5E9" }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
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
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    maxHeight: "92%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  filterBar: {
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  filterBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  filterBarLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  filterBarCount: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  filterTabsScroll: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  searchBoxWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  statBox: {
    flex: 1,
    minWidth: 125,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 4,
  },
  statSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  budgetBarCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  budgetBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  budgetBarTitle: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  budgetBarRatio: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
  },
  progressSegment: {
    height: "100%",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
  },
  listContainer: {
    paddingHorizontal: 20,
    maxHeight: 280,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  staffCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0EA5E920",
    alignItems: "center",
    justifyContent: "center",
  },
  staffAvatarText: {
    color: "#0EA5E9",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  staffName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  staffMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  deptBadgeWrap: {
    marginTop: 4,
    flexDirection: "row",
  },
  deptBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deptBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  staffSalary: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  paidBadgeText: {
    color: "#10B981",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  emptyRoster: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    textAlign: "center",
    gap: 6,
  },
  emptyRosterText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
    textAlign: "center",
  },
  emptyRosterSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
  },
  unassignedBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    marginTop: 4,
  },
  unassignedText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  primaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
});

