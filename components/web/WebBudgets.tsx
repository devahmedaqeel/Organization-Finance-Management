import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useFinance, Budget, Department } from "@/context/FinanceContext";
import {
  calculateBudgetSpentForCategory,
  calculateTotalIncome,
  calculateTotalExpenses,
} from "@/services/FinancialCalculationEngine";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { DonutChart } from "@/components/DonutChart";
import { WebBudgetModal } from "./modals/WebBudgetModal";
import { WebDepartmentModal } from "./modals/WebDepartmentModal";
import { WebConfirmModal } from "./modals/WebConfirmModal";
import {
  SvgPieChart,
  SvgPlus,
  SvgLayers,
  SvgCheck,
  SvgFileText,
} from "./SvgIcons";
import { Feather } from "@/components/UniversalIcon";

const DEPT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#14B8A6", "#6366F1"];

export function WebBudgets() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const {
    totalIncome,
    totalAllocatedBudget,
    unallocatedFunds,
    totalBudgetSpent,
    totalBudgetRemaining,
    budgetUtilization,
    departmentMetrics,
    departments,
    budgets,
    transactions,
    deleteBudget,
  } = useFinance();

  const [selectedDept, setSelectedDept] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "healthy" | "warning" | "over" | "no_budget">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [modalVisible, setModalVisible] = useState(false);
  const [initialModalDept, setInitialModalDept] = useState<string | undefined>(undefined);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deptModalVisible, setDeptModalVisible] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "accountant";

  // Operating cash and Available to Allocate buffer
  const netOperatingCash = useMemo(() => {
    return calculateTotalIncome(transactions) - calculateTotalExpenses(transactions);
  }, [transactions]);

  const availableToAllocate = useMemo(() => {
    return Math.max(0, netOperatingCash - totalAllocatedBudget);
  }, [netOperatingCash, totalAllocatedBudget]);

  // Calculate actual spend for each budget item from live transactions
  const budgetsWithLiveSpend = useMemo(() => {
    return (budgets || []).map((b) => {
      const spent = calculateBudgetSpentForCategory(b, transactions);
      const ratio = b.allocated > 0 ? (spent / b.allocated) * 100 : 0;
      return {
        ...b,
        liveSpent: spent,
        ratio,
        isOver: ratio >= 100,
        isWarning: ratio >= (b.alertThreshold || 80) && ratio < 100,
      };
    });
  }, [budgets, transactions]);

  // Donut chart breakdown by real departments (filtered to non-zero allocations, no fake "General")
  const deptBudgetData = useMemo(() => {
    const active = (departmentMetrics || []).filter((d) => d.allocated > 0);
    return active.map((d, i) => ({
      label: d.name,
      value: d.allocated,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }));
  }, [departmentMetrics]);

  // Filtered department metrics for Section 8 Department Allocation Table
  const filteredDepartmentMetrics = useMemo(() => {
    return (departmentMetrics || []).filter((d) => {
      if (selectedDept !== "all" && d.name.trim().toLowerCase() !== selectedDept.trim().toLowerCase()) {
        return false;
      }
      if (statusFilter !== "all" && d.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = d.name.toLowerCase().includes(q);
        const matchCat = (d.categories || []).some((c) => c.category.toLowerCase().includes(q));
        if (!matchName && !matchCat) return false;
      }
      return true;
    });
  }, [departmentMetrics, selectedDept, statusFilter, searchQuery]);

  // Filtered granular line-item budgets
  const filteredBudgets = useMemo(() => {
    return budgetsWithLiveSpend.filter((b) => {
      if (selectedDept !== "all" && (b.department || "").trim().toLowerCase() !== selectedDept.trim().toLowerCase()) {
        return false;
      }
      if (statusFilter === "over" && !b.isOver) return false;
      if (statusFilter === "warning" && !b.isWarning) return false;
      if (statusFilter === "healthy" && (b.isOver || b.isWarning)) return false;
      if (statusFilter === "no_budget" && b.allocated > 0) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchDept = (b.department || "").toLowerCase().includes(q);
        const matchCat = (b.category || "").toLowerCase().includes(q);
        const matchNotes = (b.notes || "").toLowerCase().includes(q);
        if (!matchDept && !matchCat && !matchNotes) return false;
      }
      return true;
    });
  }, [budgetsWithLiveSpend, selectedDept, statusFilter, searchQuery]);

  // Currently active selected department metrics for live insight
  const activeSelectedDeptMetric = useMemo(() => {
    if (selectedDept === "all") return null;
    return (departmentMetrics || []).find(
      (d) => d.name.trim().toLowerCase() === selectedDept.trim().toLowerCase()
    );
  }, [departmentMetrics, selectedDept]);

  // Unique list of department names for filter bar
  const allDeptNames = useMemo(() => {
    const set = new Set<string>();
    (departments || []).forEach((d) => d.name && set.add(d.name.trim()));
    (departmentMetrics || []).forEach((d) => d.name && set.add(d.name.trim()));
    (budgets || []).forEach((b) => b.department && set.add(b.department.trim()));
    return Array.from(set).filter(Boolean);
  }, [departments, departmentMetrics, budgets]);

  const handleOpenDeptAllocation = (deptName: string) => {
    const existingDept = departments.find(
      (d) => (d.name || "").trim().toLowerCase() === deptName.trim().toLowerCase()
    );
    if (existingDept) {
      setEditingDept(existingDept);
      setDeptModalVisible(true);
    } else {
      setInitialModalDept(deptName);
      setEditingBudget(null);
      setModalVisible(true);
    }
  };

  const handleOpenLineBudgetForDept = (deptName: string) => {
    setInitialModalDept(deptName);
    setEditingBudget(null);
    setModalVisible(true);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Page Header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 280 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.primary + "20" }]}>
              <SvgPieChart size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>
                Department Budget Allocations
              </Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                Expenditure ceilings, live utilization tracking, and overrun alert thresholds
              </Text>
            </View>
          </View>
        </View>

        {canEdit && (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }, isMobile && { flex: 1 }]}
              onPress={() => {
                setInitialModalDept(undefined);
                setEditingBudget(null);
                setModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <SvgPlus size={15} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Allocate Budget</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                { borderColor: colors.border, backgroundColor: colors.card },
                isMobile && { flex: 1 },
              ]}
              onPress={() => {
                setEditingDept(null);
                setDeptModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <SvgLayers size={15} color={colors.foreground} />
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>+ Department</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ─── Section 8: 5 Top Executive Summary Cards ─── */}
      <View style={styles.metricsGrid}>
        {/* 1. TOTAL INCOME */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 180 },
          ]}
        >
          <View style={styles.metricCardTop}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL INCOME</Text>
            <Feather name="trending-up" size={14} color={colors.income} />
          </View>
          <Text style={[styles.metricValue, { color: colors.income }]}>
            {settings.currency} {totalIncome.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Central Revenue Inflows
          </Text>
        </View>

        {/* 2. TOTAL ALLOCATED */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 180 },
          ]}
        >
          <View style={styles.metricCardTop}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL ALLOCATED</Text>
            <Feather name="pie-chart" size={14} color={colors.primary} />
          </View>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>
            {settings.currency} {totalAllocatedBudget.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {departmentMetrics.filter((d) => d.allocated > 0).length} Depts · {budgets.length} Lines
          </Text>
        </View>

        {/* 3. AVAILABLE TO ALLOCATE */}
        <View
          style={[
            styles.metricCard,
            {
              backgroundColor: colors.card,
              borderColor: availableToAllocate > 0 ? colors.income + "40" : colors.border,
              minWidth: isMobile ? "100%" : 180,
            },
          ]}
        >
          <View style={styles.metricCardTop}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>AVAILABLE TO ALLOCATE</Text>
            <Feather
              name={availableToAllocate > 0 ? "check-circle" : "alert-circle"}
              size={14}
              color={availableToAllocate > 0 ? colors.income : colors.warning}
            />
          </View>
          <Text
            style={[
              styles.metricValue,
              { color: availableToAllocate > 0 ? colors.income : colors.warning },
            ]}
          >
            {settings.currency} {availableToAllocate.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Net Cash Buffer · {settings.currency} {unallocatedFunds.toLocaleString()} Rev Res
          </Text>
        </View>

        {/* 4. TOTAL DEPARTMENT SPENDING */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 180 },
          ]}
        >
          <View style={styles.metricCardTop}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL DEPARTMENT SPENDING</Text>
            <Feather name="arrow-up-right" size={14} color={colors.expense} />
          </View>
          <Text style={[styles.metricValue, { color: colors.expense }]}>
            {settings.currency} {totalBudgetSpent.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {budgetUtilization.toFixed(1)}% Ceilings Utilized
          </Text>
        </View>

        {/* 5. REMAINING DEPARTMENT FUNDS */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 180 },
          ]}
        >
          <View style={styles.metricCardTop}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>REMAINING DEPARTMENT FUNDS</Text>
            <Feather
              name={totalBudgetRemaining >= 0 ? "shield" : "alert-triangle"}
              size={14}
              color={totalBudgetRemaining >= 0 ? colors.primary : colors.expense}
            />
          </View>
          <Text
            style={[
              styles.metricValue,
              { color: totalBudgetRemaining >= 0 ? colors.foreground : colors.expense },
            ]}
          >
            {settings.currency} {totalBudgetRemaining.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {totalBudgetRemaining >= 0 ? "Under Expenditure Limit" : "Deficit Overrun"}
          </Text>
        </View>
      </View>

      {/* ─── Search & Status Filters Bar ─── */}
      <View style={[styles.filterBarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Search Input */}
        <View
          style={[
            styles.searchRow,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search departments, categories, or notes..."
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Status Filter Chips */}
        <View style={styles.filterChipRow}>
          <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Status:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {(
              [
                { key: "all", label: "All Status" },
                { key: "healthy", label: "On Track" },
                { key: "warning", label: "Near Ceiling" },
                { key: "over", label: "Overrun" },
                { key: "no_budget", label: "Unbudgeted" },
              ] as const
            ).map((st) => (
              <TouchableOpacity
                key={st.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: statusFilter === st.key ? colors.primary : colors.background,
                    borderColor: statusFilter === st.key ? "transparent" : colors.border,
                  },
                ]}
                onPress={() => setStatusFilter(st.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: statusFilter === st.key ? "#FFFFFF" : colors.foreground },
                  ]}
                >
                  {st.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Department Filter Chips */}
        <View style={styles.filterChipRow}>
          <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Department:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {["all", ...allDeptNames].map((dept, idx) => (
              <TouchableOpacity
                key={`${dept}-${idx}`}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: selectedDept === dept ? colors.primary : colors.background,
                    borderColor: selectedDept === dept ? "transparent" : colors.border,
                  },
                ]}
                onPress={() => setSelectedDept(dept)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: selectedDept === dept ? "#FFFFFF" : colors.foreground },
                  ]}
                >
                  {dept === "all" ? "All Departments" : dept}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* ─── Visual Budget Allocation Donut Chart ─── */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={[styles.chartTitle, { color: colors.foreground }]}>Department Budget Distribution</Text>
            <Text style={[styles.chartSubtitle, { color: colors.mutedForeground }]}>
              Authoritative fund distribution across organization departments
            </Text>
          </View>
          <View
            style={[
              styles.badgePill,
              { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" },
            ]}
          >
            <Text style={[styles.badgePillText, { color: colors.primary }]}>
              {deptBudgetData.length} Allocated {deptBudgetData.length === 1 ? "Dept" : "Depts"}
            </Text>
          </View>
        </View>

        <View style={{ paddingVertical: 10, alignItems: "center" }}>
          {deptBudgetData.length > 0 ? (
            <DonutChart
              segments={deptBudgetData}
              size={isMobile ? 140 : 170}
              strokeWidth={isMobile ? 12 : 14}
              centerLabel={`${settings.currency} ${totalAllocatedBudget.toLocaleString()}`}
              centerSub="Total Budget"
              currency={settings.currency}
              selectedLabel={selectedDept === "all" ? null : selectedDept}
              onSelectLabel={(label) => setSelectedDept(label || "all")}
              showChips={true}
            />
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 16, gap: 8 }}>
              <DonutChart
                segments={[]}
                size={isMobile ? 130 : 150}
                strokeWidth={isMobile ? 10 : 12}
                centerLabel={`${settings.currency} 0`}
                centerSub="Total Budget"
                currency={settings.currency}
                showChips={false}
              />
              <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
                No department budget allocations configured yet. Click "Allocate Budget" to set expenditure limits.
              </Text>
            </View>
          )}
        </View>

        {/* Active Department Live Insight Banner */}
        {activeSelectedDeptMetric ? (
          <View
            style={[
              styles.selectedDeptBanner,
              {
                backgroundColor: colors.background,
                borderColor: colors.primary + "40",
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.activeDeptDot, { backgroundColor: colors.primary }]} />
                <View>
                  <Text style={[styles.activeDeptTitle, { color: colors.foreground }]}>
                    Filtering: {activeSelectedDeptMetric.name} Department
                  </Text>
                  <Text style={[styles.activeDeptSub, { color: colors.mutedForeground }]}>
                    Authoritative spending, remaining buffer, and line-item limits
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.clearSelectionBtn, { borderColor: colors.border }]}
                onPress={() => setSelectedDept("all")}
              >
                <Feather name="x" size={12} color={colors.mutedForeground} />
                <Text style={[styles.clearSelectionText, { color: colors.mutedForeground }]}>
                  Show All Departments
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.activeDeptKpisRow, { borderColor: colors.border }]}>
              <View style={styles.activeDeptKpiCol}>
                <Text style={[styles.activeDeptKpiLabel, { color: colors.mutedForeground }]}>ALLOCATED</Text>
                <Text style={[styles.activeDeptKpiVal, { color: colors.foreground }]}>
                  {settings.currency} {activeSelectedDeptMetric.allocated.toLocaleString()}
                </Text>
                <Text style={[styles.activeDeptKpiSub, { color: colors.mutedForeground }]}>
                  {totalAllocatedBudget > 0
                    ? `${((activeSelectedDeptMetric.allocated / totalAllocatedBudget) * 100).toFixed(1)}% of total`
                    : "0%"}
                </Text>
              </View>

              <View style={[styles.valDivider, { backgroundColor: colors.border }]} />

              <View style={styles.activeDeptKpiCol}>
                <Text style={[styles.activeDeptKpiLabel, { color: colors.mutedForeground }]}>USED / SPENT</Text>
                <Text style={[styles.activeDeptKpiVal, { color: colors.expense }]}>
                  {settings.currency} {activeSelectedDeptMetric.spent.toLocaleString()}
                </Text>
                <Text style={[styles.activeDeptKpiSub, { color: colors.mutedForeground }]}>
                  Payroll: {settings.currency} {activeSelectedDeptMetric.payrollSpending.toLocaleString()}
                </Text>
              </View>

              <View style={[styles.valDivider, { backgroundColor: colors.border }]} />

              <View style={styles.activeDeptKpiCol}>
                <Text style={[styles.activeDeptKpiLabel, { color: colors.mutedForeground }]}>REMAINING</Text>
                <Text
                  style={[
                    styles.activeDeptKpiVal,
                    { color: activeSelectedDeptMetric.remaining >= 0 ? colors.income : colors.expense },
                  ]}
                >
                  {settings.currency} {activeSelectedDeptMetric.remaining.toLocaleString()}
                </Text>
                <Text style={[styles.activeDeptKpiSub, { color: colors.mutedForeground }]}>
                  {activeSelectedDeptMetric.remaining >= 0 ? "Buffer available" : "Deficit overrun"}
                </Text>
              </View>

              <View style={[styles.valDivider, { backgroundColor: colors.border }]} />

              <View style={styles.activeDeptKpiCol}>
                <Text style={[styles.activeDeptKpiLabel, { color: colors.mutedForeground }]}>UTILIZATION</Text>
                <Text
                  style={[
                    styles.activeDeptKpiVal,
                    {
                      color:
                        activeSelectedDeptMetric.status === "over"
                          ? colors.expense
                          : activeSelectedDeptMetric.status === "warning"
                          ? colors.warning
                          : colors.income,
                    },
                  ]}
                >
                  {activeSelectedDeptMetric.utilizationPct.toFixed(1)}%
                </Text>
                <Text style={[styles.activeDeptKpiSub, { color: colors.mutedForeground }]}>
                  Status: {activeSelectedDeptMetric.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {/* ─── Section 8: Department Allocation Table ─── */}
      <View style={[styles.tableContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.tableHeaderSection}>
          <View>
            <Text style={[styles.tableSectionTitle, { color: colors.foreground }]}>
              Department Allocation Table
            </Text>
            <Text style={[styles.tableSectionSubtitle, { color: colors.mutedForeground }]}>
              Department ceilings, live disbursements (Payroll + Other), remaining buffer, and utilization %
            </Text>
          </View>
          <View
            style={[
              styles.badgePill,
              { backgroundColor: colors.income + "18", borderColor: colors.income + "35" },
            ]}
          >
            <Text style={[styles.badgePillText, { color: colors.income }]}>
              {filteredDepartmentMetrics.length} {filteredDepartmentMetrics.length === 1 ? "Record" : "Records"}
            </Text>
          </View>
        </View>

        {filteredDepartmentMetrics.length === 0 ? (
          <View style={styles.emptyTableState}>
            <Feather name="inbox" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No departments match criteria</Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Create a department or adjust search filters to view budget allocations.
            </Text>
          </View>
        ) : isMobile ? (
          /* Mobile Department Cards */
          <View style={{ gap: 12, padding: 12 }}>
            {filteredDepartmentMetrics.map((dept) => {
              const statusColor =
                dept.status === "over"
                  ? colors.expense
                  : dept.status === "warning"
                  ? colors.warning
                  : dept.status === "no_budget"
                  ? colors.mutedForeground
                  : colors.income;

              const statusText =
                dept.status === "over"
                  ? "OVERRUN"
                  : dept.status === "warning"
                  ? "NEAR CEILING"
                  : dept.status === "no_budget"
                  ? "UNBUDGETED"
                  : "ON TRACK";

              const utilPct = Math.min(Math.round(dept.utilizationPct), 100);

              return (
                <View
                  key={dept.id || dept.name}
                  style={[
                    styles.mobileDeptCard,
                    {
                      backgroundColor: colors.background,
                      borderColor: dept.status === "over" ? colors.expense + "60" : colors.border,
                    },
                  ]}
                >
                  <View style={styles.deptCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.deptCardName, { color: colors.foreground }]} numberOfLines={1}>
                        {dept.name}
                      </Text>
                      <Text style={[styles.deptCardSub, { color: colors.mutedForeground }]}>
                        Live Spending: {settings.currency} {dept.spent.toLocaleString()}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
                    </View>
                  </View>

                  {/* Progress */}
                  <View style={{ gap: 4, marginVertical: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: statusColor }}>
                        {dept.utilizationPct.toFixed(1)}% Used
                      </Text>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                        Remaining: {settings.currency} {dept.remaining.toLocaleString()}
                      </Text>
                    </View>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { width: `${utilPct}%`, backgroundColor: statusColor }]} />
                    </View>
                  </View>

                  {/* Spending Breakdown */}
                  <View style={[styles.deptNumbersGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.deptNumCol}>
                      <Text style={[styles.deptNumLabel, { color: colors.mutedForeground }]}>ALLOCATED</Text>
                      <Text style={[styles.deptNumVal, { color: colors.foreground }]}>
                        {settings.currency} {dept.allocated.toLocaleString()}
                      </Text>
                    </View>
                    <View style={[styles.valDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.deptNumCol}>
                      <Text style={[styles.deptNumLabel, { color: colors.mutedForeground }]}>PAYROLL</Text>
                      <Text style={[styles.deptNumVal, { color: colors.primary }]}>
                        {settings.currency} {dept.payrollSpending.toLocaleString()}
                      </Text>
                    </View>
                    <View style={[styles.valDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.deptNumCol}>
                      <Text style={[styles.deptNumLabel, { color: colors.mutedForeground }]}>OTHER</Text>
                      <Text style={[styles.deptNumVal, { color: colors.expense }]}>
                        {settings.currency} {dept.otherSpending.toLocaleString()}
                      </Text>
                    </View>
                  </View>

                  {/* Action */}
                  {canEdit && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[styles.tableActionBtn, { borderColor: colors.primary, flex: 1 }]}
                        onPress={() => handleOpenDeptAllocation(dept.name)}
                      >
                        <Text style={[styles.tableActionBtnText, { color: colors.primary }]}>
                          Allocate / Edit Budget
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.tableActionBtn,
                          { borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12 },
                        ]}
                        onPress={() => handleOpenLineBudgetForDept(dept.name)}
                      >
                        <Text style={[styles.tableActionBtnText, { color: colors.foreground }]}>+ Line Item</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          /* Desktop Department Table */
          <View style={styles.tableWrapper}>
            <View style={[styles.tableHeaderRow, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.th, { flex: 2.2, color: colors.mutedForeground }]}>DEPARTMENT</Text>
              <Text style={[styles.th, { flex: 1.4, textAlign: "right", color: colors.mutedForeground }]}>
                ALLOCATED
              </Text>
              <Text style={[styles.th, { flex: 1.8, textAlign: "right", color: colors.mutedForeground }]}>
                USED / DISBURSED
              </Text>
              <Text style={[styles.th, { flex: 1.4, textAlign: "right", color: colors.mutedForeground }]}>
                REMAINING
              </Text>
              <Text style={[styles.th, { flex: 1.6, color: colors.mutedForeground }]}>UTILIZATION</Text>
              <Text style={[styles.th, { flex: 1.2, textAlign: "center", color: colors.mutedForeground }]}>
                STATUS
              </Text>
              <Text style={[styles.th, { flex: 1.8, textAlign: "right", color: colors.mutedForeground }]}>
                ACTIONS
              </Text>
            </View>

            {filteredDepartmentMetrics.map((dept, index) => {
              const statusColor =
                dept.status === "over"
                  ? colors.expense
                  : dept.status === "warning"
                  ? colors.warning
                  : dept.status === "no_budget"
                  ? colors.mutedForeground
                  : colors.income;

              const statusText =
                dept.status === "over"
                  ? "OVERRUN"
                  : dept.status === "warning"
                  ? "NEAR CEILING"
                  : dept.status === "no_budget"
                  ? "UNBUDGETED"
                  : "ON TRACK";

              const utilPct = Math.min(Math.round(dept.utilizationPct), 100);

              return (
                <View
                  key={dept.id || dept.name}
                  style={[
                    styles.tableRow,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor: index % 2 === 0 ? colors.card : colors.background + "60",
                    },
                  ]}
                >
                  {/* Department */}
                  <View style={{ flex: 2.2, flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View
                      style={[
                        styles.deptIconBadge,
                        { backgroundColor: DEPT_COLORS[index % DEPT_COLORS.length] + "20" },
                      ]}
                    >
                      <SvgLayers size={14} color={DEPT_COLORS[index % DEPT_COLORS.length]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tdDeptName, { color: colors.foreground }]} numberOfLines={1}>
                        {dept.name}
                      </Text>
                      <Text style={[styles.tdDeptSub, { color: colors.mutedForeground }]}>
                        {dept.categories?.length || 0} Expense Categories
                      </Text>
                    </View>
                  </View>

                  {/* Allocated */}
                  <View style={{ flex: 1.4, alignItems: "flex-end" }}>
                    <Text style={[styles.tdAmount, { color: colors.foreground }]}>
                      {settings.currency} {dept.allocated.toLocaleString()}
                    </Text>
                    <Text style={[styles.tdSubtext, { color: colors.mutedForeground }]}>
                      {totalAllocatedBudget > 0
                        ? `${((dept.allocated / totalAllocatedBudget) * 100).toFixed(0)}% of total`
                        : "0%"}
                    </Text>
                  </View>

                  {/* Used / Disbursed */}
                  <View style={{ flex: 1.8, alignItems: "flex-end" }}>
                    <Text style={[styles.tdAmount, { color: colors.expense }]}>
                      {settings.currency} {dept.spent.toLocaleString()}
                    </Text>
                    <Text style={[styles.tdSubtext, { color: colors.mutedForeground }]}>
                      Pay: {settings.currency} {dept.payrollSpending.toLocaleString()} · Oth: {settings.currency}{" "}
                      {dept.otherSpending.toLocaleString()}
                    </Text>
                  </View>

                  {/* Remaining */}
                  <View style={{ flex: 1.4, alignItems: "flex-end" }}>
                    <Text
                      style={[
                        styles.tdAmount,
                        { color: dept.remaining >= 0 ? colors.income : colors.expense },
                      ]}
                    >
                      {settings.currency} {dept.remaining.toLocaleString()}
                    </Text>
                    <Text style={[styles.tdSubtext, { color: colors.mutedForeground }]}>
                      {dept.remaining >= 0 ? "Buffer left" : "Over limit"}
                    </Text>
                  </View>

                  {/* Utilization */}
                  <View style={{ flex: 1.6, paddingHorizontal: 8, gap: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={[styles.utilText, { color: statusColor }]}>
                        {dept.utilizationPct.toFixed(1)}%
                      </Text>
                    </View>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${utilPct}%`, backgroundColor: statusColor },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Status Badge */}
                  <View style={{ flex: 1.2, alignItems: "center" }}>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={{ flex: 1.8, flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.tableActionBtn, { borderColor: colors.primary }]}
                      onPress={() => handleOpenDeptAllocation(dept.name)}
                    >
                      <Text style={[styles.tableActionBtnText, { color: colors.primary }]}>
                        Allocate / Edit
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.tableActionBtn,
                        { borderColor: colors.border, backgroundColor: colors.background },
                      ]}
                      onPress={() => handleOpenLineBudgetForDept(dept.name)}
                    >
                      <Feather name="plus" size={13} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ─── Granular Category Line-Items Section ─── */}
      <View style={{ marginTop: 10, gap: 14 }}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Granular Category Line-Items
            </Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
              Specific category limits, periodic allocations, and overrun threshold alerts
            </Text>
          </View>
          <View
            style={[
              styles.badgePill,
              { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" },
            ]}
          >
            <Text style={[styles.badgePillText, { color: colors.primary }]}>
              {filteredBudgets.length} {filteredBudgets.length === 1 ? "Line" : "Lines"}
            </Text>
          </View>
        </View>

        <View style={styles.budgetGrid}>
          {filteredBudgets.length === 0 ? (
            <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SvgFileText size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No category lines configured</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Click "Allocate Budget" to set category-level expenditure ceilings.
              </Text>
            </View>
          ) : (
            filteredBudgets.map((b) => {
              const pct = Math.min(Math.round(b.ratio), 100);
              const statusColor = b.isOver ? colors.expense : b.isWarning ? colors.warning : colors.income;
              const remaining = b.allocated - b.liveSpent;

              return (
                <View
                  key={b.id}
                  style={[
                    styles.budgetItemCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: b.isOver ? colors.expense + "60" : colors.border,
                    },
                  ]}
                >
                  {/* Header */}
                  <View style={styles.budgetCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.budgetDept, { color: colors.foreground }]} numberOfLines={1}>
                        {b.department}
                      </Text>
                      <Text style={[styles.budgetCat, { color: colors.mutedForeground }]}>
                        {b.category || "General Operations"} · Period {b.period}
                      </Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                        {b.isOver ? "OVERRUN" : b.isWarning ? "NEAR CEILING" : "ON TRACK"}
                      </Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <View style={styles.progressContainer}>
                    <View style={styles.progressTrackLabels}>
                      <Text style={[styles.progressRatio, { color: statusColor }]}>
                        {b.ratio.toFixed(1)}% Used
                      </Text>
                      <Text
                        style={[
                          styles.progressRemaining,
                          { color: remaining >= 0 ? colors.mutedForeground : colors.expense },
                        ]}
                      >
                        {remaining >= 0
                          ? `${settings.currency} ${remaining.toLocaleString()} left`
                          : `-${settings.currency} ${Math.abs(remaining).toLocaleString()} over`}
                      </Text>
                    </View>

                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
                    </View>
                  </View>

                  {/* Key Numbers */}
                  <View
                    style={[
                      styles.budgetValuesRow,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.valCol}>
                      <Text style={[styles.valLabel, { color: colors.mutedForeground }]}>ALLOCATED</Text>
                      <Text style={[styles.valText, { color: colors.foreground }]} numberOfLines={1}>
                        {settings.currency} {b.allocated.toLocaleString()}
                      </Text>
                    </View>
                    <View style={[styles.valDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.valCol}>
                      <Text style={[styles.valLabel, { color: colors.mutedForeground }]}>DISBURSED</Text>
                      <Text style={[styles.valText, { color: colors.expense }]} numberOfLines={1}>
                        {settings.currency} {b.liveSpent.toLocaleString()}
                      </Text>
                    </View>
                  </View>

                  {/* Card Actions */}
                  {canEdit && (
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={[styles.cardActionBtn, { borderColor: colors.border }]}
                        onPress={() => {
                          setEditingBudget(b);
                          setModalVisible(true);
                        }}
                      >
                        <Text style={[styles.cardActionText, { color: colors.primary }]}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.cardActionBtn,
                          { borderColor: colors.expense + "40", backgroundColor: colors.expense + "10" },
                        ]}
                        onPress={() => setDeletingBudget(b)}
                      >
                        <Text style={[styles.cardActionText, { color: colors.expense }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Global Line-Item Budget Modal */}
      <WebBudgetModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingBudget(null);
          setInitialModalDept(undefined);
        }}
        budgetToEdit={editingBudget}
        initialDepartment={initialModalDept}
      />

      {/* Department Ceiling Modal */}
      <WebDepartmentModal
        visible={deptModalVisible}
        onClose={() => {
          setDeptModalVisible(false);
          setEditingDept(null);
        }}
        deptToEdit={editingDept}
      />

      {/* Confirmation Modal */}
      <WebConfirmModal
        visible={Boolean(deletingBudget)}
        onClose={() => setDeletingBudget(null)}
        onConfirm={() => {
          if (deletingBudget) {
            deleteBudget(deletingBudget.id);
          }
        }}
        title="Delete Budget Allocation"
        message={`Are you sure you want to remove the budget allocation of ${settings.currency} ${deletingBudget?.allocated.toLocaleString()} for "${deletingBudget?.department}"?`}
        confirmText="Delete Budget"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
  content: {
    padding: 24,
    gap: 20,
    paddingBottom: 60,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 14,
  },
  titleIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 180,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  metricCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
    marginVertical: 2,
  },
  metricSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  filterBarCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  filterChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterLabel: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
    minWidth: 70,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  chartSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgePillText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  tableContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableHeaderSection: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  tableSectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  tableSectionSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  emptyTableState: {
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  tableWrapper: {
    width: "100%",
  },
  tableHeaderRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  th: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  deptIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tdDeptName: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  tdDeptSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  tdAmount: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  tdSubtext: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
  },
  utilText: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  tableActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tableActionBtnText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  mobileDeptCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  deptCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  deptCardName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  deptCardSub: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  deptNumbersGrid: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    alignItems: "center",
  },
  deptNumCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  deptNumLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  deptNumVal: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  budgetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  budgetItemCard: {
    flex: 1,
    minWidth: 280,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  budgetCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  budgetDept: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  budgetCat: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  progressContainer: {
    gap: 5,
  },
  progressTrackLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressRatio: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  progressRemaining: {
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  budgetValuesRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  valCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  valDivider: {
    width: 1,
    height: 24,
  },
  valLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
  valText: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  cardActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
  },
  cardActionText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
  emptyWrap: {
    width: "100%",
    padding: 36,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  emptySubtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 320,
  },
  selectedDeptBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginTop: 6,
    width: "100%",
  },
  activeDeptDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDeptTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  activeDeptSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  clearSelectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  clearSelectionText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  activeDeptKpisRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  activeDeptKpiCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  activeDeptKpiLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  activeDeptKpiVal: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
  },
  activeDeptKpiSub: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
