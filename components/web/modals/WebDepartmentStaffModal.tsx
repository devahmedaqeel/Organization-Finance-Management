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
import { FitText } from "../FitText";
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
      <View {...({ dataSet: { ofmDialogOverlay: "" } } as any)} style={[styles.backdrop, isMobile && { padding: 12 }]}>
        <View {...({ dataSet: { ofmDialogCard: "" } } as any)}
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              width: isMobile ? "100%" : 780,
            },
          ]}
        >
          {/* Header */}
          <View {...({ dataSet: { ofmDialogHeader: "" } } as any)} style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
              <View style={[styles.headerIconWrap, { backgroundColor: colors.primary + "16" }]}>
                {isAllSelected ? <SvgLayers size={20} color={colors.primary} /> : <SvgUsers size={20} color={colors.primary} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.xTitle, { color: colors.foreground }]}>
                  {isAllSelected ? "Staff roster · All departments" : `Staff roster · ${activeDept?.name || "Department"}`}
                </Text>
                <Text style={[styles.xSub, { color: colors.mutedForeground }]}>
                  {totalHeadcount} {totalHeadcount === 1 ? "person" : "people"} assigned · {isAllSelected ? payroll.length : registeredCount} on payroll
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7} accessibilityLabel="Close">
              <SvgX size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView {...({ dataSet: { ofmDialogBody: "" } } as any)}
            style={styles.modalBody}
            contentContainerStyle={[styles.modalBodyContent, { gap: 16 }, isMobile && { paddingHorizontal: 16, paddingTop: 16 }]}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {/* Department tabs */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.xLabel, { color: colors.mutedForeground }]}>Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {[{ id: "ALL", name: "All departments", count: payroll.length }, ...allFilterDepts.map((d) => ({
                  id: d.id,
                  name: d.name,
                  count: payroll.filter((p) => (p.department || "").trim().toLowerCase() === d.name.trim().toLowerCase()).length,
                }))].map((d) => {
                  const isSel =
                    d.id === "ALL"
                      ? isAllSelected
                      : selectedDeptId === d.id || (!isAllSelected && activeDept?.name?.toLowerCase() === d.name.toLowerCase());
                  return (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => setSelectedDeptId(d.id)}
                      activeOpacity={0.75}
                      style={[styles.xTab, { backgroundColor: isSel ? colors.primary : colors.card, borderColor: isSel ? colors.primary : colors.border }]}
                    >
                      <Text style={[styles.xTabText, { color: isSel ? "#FFFFFF" : colors.foreground }]}>{d.name}</Text>
                      <View style={[styles.xTabCount, { backgroundColor: isSel ? "rgba(255,255,255,0.25)" : colors.muted }]}>
                        <Text style={[styles.xTabCountText, { color: isSel ? "#FFFFFF" : colors.mutedForeground }]}>{d.count}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Search */}
            <View style={[styles.searchBoxWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <SvgSearch size={15} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search by name, employee ID or role"
                placeholderTextColor={colors.mutedForeground}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")} activeOpacity={0.7} style={{ padding: 4 }} accessibilityLabel="Clear search">
                  <SvgX size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            {/* Figures: 3 × 2 grid */}
            {(() => {
              const f = activeDeptFinances;
              const hasCap = f.allocated > 0;
              const tiles = [
                { label: "Budget", value: hasCap ? `${settings.currency} ${f.allocated.toLocaleString()}` : "Not set", sub: hasCap ? "Approved limit" : "No limit assigned", color: colors.foreground },
                { label: "Spent", value: `${settings.currency} ${f.spent.toLocaleString()}`, sub: hasCap ? `${f.ratio.toFixed(1)}% of budget` : "Actual spend", color: f.isOver ? colors.expense : colors.foreground },
                {
                  label: f.isOver ? "Over budget" : "Remaining",
                  value: hasCap ? `${settings.currency} ${Math.abs(f.remaining).toLocaleString()}` : "—",
                  sub: hasCap ? (f.isOver ? `${(f.ratio - 100).toFixed(1)}% over` : `${f.remainingRatio.toFixed(1)}% left`) : "No limit",
                  color: f.isOver ? colors.expense : colors.income,
                },
                { label: "Monthly payroll", value: `${settings.currency} ${totalMonthlyPayroll.toLocaleString()}`, sub: "Salaries", color: colors.foreground },
                { label: "Other expenses", value: `${settings.currency} ${f.otherSpending.toLocaleString()}`, sub: f.otherSpending > 0 ? f.otherCategorySummary : "Non-payroll costs", color: colors.foreground },
                { label: "Headcount", value: String(totalHeadcount), sub: `${registeredCount} ${registeredCount === 1 ? "profile" : "profiles"} on payroll`, color: colors.foreground },
              ];
              return (
                <View style={[styles.xGrid, { borderColor: colors.border }]}>
                  {tiles.map((t, i) => (
                    <View
                      key={t.label}
                      style={[
                        styles.xTile,
                        isMobile ? { width: "50%" } : { width: "33.333%" },
                        { borderColor: colors.border },
                        (isMobile ? i % 2 !== 0 : i % 3 !== 0) && { borderLeftWidth: 1 },
                        (isMobile ? i >= 2 : i >= 3) && { borderTopWidth: 1 },
                      ]}
                    >
                      <Text style={[styles.xLabel, { color: colors.mutedForeground }]}>{t.label}</Text>
                      <FitText style={[styles.xValue, { color: t.color }]}>{t.value}</FitText>
                      <Text style={[styles.xTileSub, { color: colors.mutedForeground }]}>{t.sub}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* Budget usage bar */}
            {activeDeptFinances.allocated > 0 && (() => {
              const f = activeDeptFinances;
              const payPct = Math.min(100, (f.payrollSpending / f.allocated) * 100);
              const otherPct = Math.min(Math.max(0, 100 - payPct), (f.otherSpending / f.allocated) * 100);
              return (
                <View style={[styles.xCard, { borderColor: colors.border }]}>
                  <View style={styles.xRowBetween}>
                    <Text style={[styles.xCardTitle, { color: colors.foreground }]}>Budget usage</Text>
                    <Text style={[styles.xCardTitle, { color: f.isOver ? colors.expense : colors.income }]}>
                      {f.ratio.toFixed(1)}% used
                    </Text>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: colors.muted, height: 10, borderRadius: 5, gap: 2 }]}>
                    <View style={[styles.progressSegment, { width: `${payPct}%`, backgroundColor: "#8B5CF6" }]} />
                    <View style={[styles.progressSegment, { width: `${otherPct}%`, backgroundColor: "#06B6D4" }]} />
                  </View>
                  <View style={styles.xLegend}>
                    {[
                      { label: "Payroll", value: f.payrollSpending, color: "#8B5CF6" },
                      { label: "Other", value: f.otherSpending, color: "#06B6D4" },
                      { label: f.isOver ? "Over" : "Remaining", value: Math.abs(f.remaining), color: f.isOver ? colors.expense : colors.income },
                    ].map((l) => (
                      <View key={l.label} style={styles.xLegendItem}>
                        <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                        <Text style={[styles.xLegendText, { color: colors.mutedForeground }]}>{l.label}</Text>
                        <Text style={[styles.xLegendValue, { color: colors.foreground }]}>
                          {settings.currency} {l.value.toLocaleString()}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Employees */}
            <View style={{ gap: 10 }}>
              <View style={styles.xRowBetween}>
                <Text style={[styles.xCardTitle, { color: colors.foreground }]}>
                  Employees ({filteredStaff.length}
                  {filteredStaff.length !== deptStaff.length ? ` of ${deptStaff.length}` : ""})
                </Text>
                {searchQuery.trim().length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")} activeOpacity={0.7}>
                    <Text style={[styles.xLink, { color: colors.primary }]}>Clear search</Text>
                  </TouchableOpacity>
                )}
              </View>

              {filteredStaff.length === 0 ? (
                <View style={[styles.emptyRoster, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <SvgBriefcase size={28} color={colors.mutedForeground} />
                  <Text style={[styles.emptyRosterText, { color: colors.foreground }]}>
                    {searchQuery.trim().length > 0
                      ? `No employees match "${searchQuery}"`
                      : isAllSelected
                      ? "No employees on payroll yet"
                      : `No employees in ${activeDept?.name || "this department"} yet`}
                  </Text>
                  <Text style={[styles.emptyRosterSub, { color: colors.mutedForeground }]}>
                    {searchQuery.trim().length > 0
                      ? "Try another name, or choose a different department above."
                      : "Add employees from the Staff Payroll page."}
                  </Text>
                </View>
              ) : (
                <View style={[styles.xList, { borderColor: colors.border }]}>
                  {!isMobile && (
                    <View style={[styles.xListHead, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                      <Text style={[styles.xHeadText, { color: colors.mutedForeground, flex: 1 }]}>Employee</Text>
                      <Text style={[styles.xHeadText, { color: colors.mutedForeground, width: 120 }]}>Department</Text>
                      <Text style={[styles.xHeadText, { color: colors.mutedForeground, width: 120, textAlign: "right" }]}>Net salary</Text>
                      <Text style={[styles.xHeadText, { color: colors.mutedForeground, width: 80, textAlign: "right" }]}>Status</Text>
                    </View>
                  )}
                  {filteredStaff.map((staff, i) => (
                    <View
                      key={staff.id}
                      style={[styles.xListRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, isMobile && { flexWrap: "wrap" }]}
                    >
                      <View style={{ flex: 1, minWidth: isMobile ? "60%" : 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={[styles.xAvatar, { backgroundColor: colors.info + "18" }]}>
                          <Text style={[styles.xAvatarText, { color: colors.info }]}>
                            {staff.employeeName
                              ? staff.employeeName.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase()
                              : "EM"}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.xName, { color: colors.foreground }]}>{staff.employeeName}</Text>
                          <Text style={[styles.xMeta, { color: colors.mutedForeground }]}>
                            {staff.employeeId} · {staff.designation || "Staff member"}
                          </Text>
                        </View>
                      </View>
                      <View style={{ width: isMobile ? undefined : 120 }}>
                        <View style={[styles.xDept, { backgroundColor: colors.muted }]}>
                          <Text style={[styles.xDeptText, { color: colors.foreground }]}>{staff.department || "General"}</Text>
                        </View>
                      </View>
                      <FitText style={[styles.xSalary, { color: colors.foreground, width: isMobile ? 110 : 120 }]}>
                        {`${settings.currency} ${Number(staff.netSalary || staff.baseSalary || 0).toLocaleString()}`}
                      </FitText>
                      <View style={{ width: isMobile ? undefined : 80, alignItems: "flex-end" }}>
                        <View style={styles.paidBadge}>
                          <SvgCheck size={10} color="#10B981" />
                          <Text style={styles.paidBadgeText}>Active</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {!isAllSelected && unassignedSlots > 0 && !searchQuery.trim() && (
                <View style={[styles.unassignedBox, { borderColor: colors.border }]}>
                  <Text style={[styles.unassignedText, { color: colors.mutedForeground }]}>
                    + {unassignedSlots} more {unassignedSlots === 1 ? "position" : "positions"} assigned to this department without a payroll profile
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View {...({ dataSet: { ofmDialogFooter: "" } } as any)} style={[styles.modalFooter, { borderTopColor: colors.border }]}>
            {!isAllSelected && activeDept && onEditDepartment && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={() => {
                  onClose();
                  onEditDepartment(activeDept);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Edit {activeDept.name}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  xTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", lineHeight: 23 },
  xSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 2 },
  xLabel: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
  xTab: { flexDirection: "row", alignItems: "center", gap: 8, height: 34, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1 },
  xTabText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  xTabCount: { minWidth: 22, alignItems: "center", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  xTabCountText: { fontSize: 11.5, fontFamily: "Inter_600SemiBold" },
  xGrid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  xTile: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  xValue: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  xTileSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  xCard: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 10 },
  xCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  xRowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  xLegend: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  xLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  xLegendText: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
  xLegendValue: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  xLink: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  xList: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  xListHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1 },
  xHeadText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  xListRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  xAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  xAvatarText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  xName: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  xMeta: { fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 17 },
  xDept: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  xDeptText: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
  xSalary: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    maxHeight: "90%",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexShrink: 0,
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
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
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  filterBarCount: {
    fontSize: 11.5,
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
    borderRadius: 10,
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
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  searchBoxWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
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
    fontSize: 11.5,
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
    fontSize: 11.5,
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
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 10,
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
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  staffAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#0EA5E920",
    alignItems: "center",
    justifyContent: "center",
  },
  staffAvatarText: {
    color: "#0EA5E9",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  staffName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  staffMeta: {
    fontSize: 11.5,
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
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
  staffSalary: {
    fontSize: 14,
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
    fontSize: 11.5,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
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
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    flexShrink: 0,
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

