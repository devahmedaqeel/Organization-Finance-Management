import React, { useState, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { useFinance, Budget } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { DonutChart } from "@/components/DonutChart";
import { WebBudgetModal } from "./modals/WebBudgetModal";
import { WebConfirmModal } from "./modals/WebConfirmModal";
import {
  SvgPieChart,
  SvgPlus,
  SvgLayers,
  SvgCheck,
  SvgFileText,
} from "./SvgIcons";

const DEPT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4"];

export function WebBudgets() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const { budgets, transactions, deleteBudget, departments } = useFinance();

  const [selectedDept, setSelectedDept] = useState("all");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<Budget | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "accountant";

  // Calculate actual spend for each budget item from live transactions
  const budgetsWithLiveSpend = useMemo(() => {
    return budgets.map((b) => {
      const spent = transactions
        .filter((t) => {
          if (t.type !== "expense") return false;
          const matchDept =
            !b.department ||
            b.department === "All" ||
            t.department?.trim().toLowerCase() === b.department?.trim().toLowerCase();
          const matchCat =
            !b.category ||
            b.category === "All" ||
            t.category?.trim().toLowerCase() === b.category?.trim().toLowerCase();
          return matchDept && matchCat;
        })
        .reduce((sum, t) => sum + t.amount, 0);

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

  const filteredBudgets = useMemo(() => {
    if (selectedDept === "all") return budgetsWithLiveSpend;
    return budgetsWithLiveSpend.filter((b) => b.department === selectedDept);
  }, [budgetsWithLiveSpend, selectedDept]);

  const totalAllocated = useMemo(() => budgets.reduce((s, b) => s + b.allocated, 0), [budgets]);
  const totalSpentAcrossBudgets = useMemo(
    () => budgetsWithLiveSpend.reduce((s, b) => s + b.liveSpent, 0),
    [budgetsWithLiveSpend]
  );
  const overallUtilization = totalAllocated > 0 ? (totalSpentAcrossBudgets / totalAllocated) * 100 : 0;
  const totalRemaining = totalAllocated - totalSpentAcrossBudgets;

  // Donut chart breakdown by department
  const deptBudgetData = useMemo(() => {
    const map: Record<string, number> = {};
    budgets.forEach((b) => {
      map[b.department] = (map[b.department] || 0) + b.allocated;
    });
    const entries = Object.entries(map);
    if (entries.length === 0) return [{ label: "General", value: 1, color: colors.primary }];
    return entries.map(([dept, val], i) => ({
      label: dept,
      value: val,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }));
  }, [budgets, colors]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Page Header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.primary + "20" }]}>
              <SvgPieChart size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Department Budget Allocations</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                Expenditure ceilings, live utilization tracking, and overrun alert thresholds
              </Text>
            </View>
          </View>
        </View>

        {canEdit && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }, isMobile && { width: "100%" }]}
            onPress={() => {
              setEditingBudget(null);
              setModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <SvgPlus size={15} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Allocate Budget</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Executive Budget KPIs ─── */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL ALLOCATED CEILING</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>
            {settings.currency} {totalAllocated.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {budgets.length} Active Budget Lines
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL DISBURSED SPEND</Text>
          <Text style={[styles.metricValue, { color: colors.expense }]}>
            {settings.currency} {totalSpentAcrossBudgets.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Live Outflows Mapped
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>OVERALL UTILIZATION</Text>
          <Text
            style={[
              styles.metricValue,
              { color: overallUtilization > 90 ? colors.expense : overallUtilization > 75 ? colors.warning : colors.income },
            ]}
          >
            {overallUtilization.toFixed(1)}%
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {totalRemaining >= 0 ? `${settings.currency} ${totalRemaining.toLocaleString()} remaining` : "Deficit Overrun"}
          </Text>
        </View>
      </View>

      {/* ─── Department Filter Chips ─── */}
      <View style={[styles.filterBarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Filter by Department:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {["all", ...(departments.length > 0 ? departments.map((d) => d.name) : ["Software Engineering", "Administration", "Finance", "Research & Development"])].map((dept) => (
              <TouchableOpacity
                key={dept}
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
          </View>
        </ScrollView>
      </View>

      {/* ─── Visual Budget Allocation Donut Chart ─── */}
      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={[styles.chartTitle, { color: colors.foreground }]}>Department Budget Distribution</Text>
            <Text style={[styles.chartSubtitle, { color: colors.mutedForeground }]}>
              Proportional allocation of funds across departments
            </Text>
          </View>
          <View style={[styles.badgePill, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" }]}>
            <Text style={[styles.badgePillText, { color: colors.primary }]}>{deptBudgetData.length} Cost Centers</Text>
          </View>
        </View>

        <View style={{ paddingVertical: 10 }}>
          <DonutChart
            segments={deptBudgetData}
            size={isMobile ? 140 : 180}
            strokeWidth={isMobile ? 14 : 18}
            centerLabel={`${settings.currency} ${totalAllocated.toLocaleString()}`}
            centerSub="Total Budget"
            currency={settings.currency}
            showChips={true}
          />
        </View>
      </View>

      {/* ─── Budget Allocation Cards Grid ─── */}
      <View style={styles.budgetGrid}>
        {filteredBudgets.length === 0 ? (
          <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SvgFileText size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No budget lines configured</Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Click "Allocate Budget" to set financial ceilings for your departments.
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
                    <Text style={[styles.progressRemaining, { color: remaining >= 0 ? colors.mutedForeground : colors.expense }]}>
                      {remaining >= 0 ? `${settings.currency} ${remaining.toLocaleString()} left` : `-${settings.currency} ${Math.abs(remaining).toLocaleString()} over`}
                    </Text>
                  </View>

                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
                  </View>
                </View>

                {/* Key Numbers */}
                <View style={[styles.budgetValuesRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
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
                      style={[styles.cardActionBtn, { borderColor: colors.expense + "40", backgroundColor: colors.expense + "10" }]}
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

      {/* Global Budget Modal */}
      <WebBudgetModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingBudget(null);
        }}
        budgetToEdit={editingBudget}
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
  },
  content: {
    padding: 24,
    gap: 20,
    paddingBottom: 60,
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
  metricsGrid: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 200,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  metricLabel: {
    fontSize: 10.5,
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
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },
  filterBarCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
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
    alignItems: "center",
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  chartSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  budgetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  budgetItemCard: {
    flex: 1,
    minWidth: 280,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  budgetCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  budgetDept: {
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
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
    letterSpacing: 0.4,
  },
  progressContainer: {
    gap: 6,
  },
  progressTrackLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressRatio: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  progressRemaining: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  budgetValuesRow: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  valCol: {
    flex: 1,
    gap: 2,
  },
  valDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 10,
  },
  valLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  valText: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  cardActionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  cardActionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  emptyWrap: {
    width: "100%",
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badgePillText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
  },
});
