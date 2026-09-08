import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";
import { RingProgress } from "@/components/RingProgress";
import { DonutChart } from "@/components/DonutChart";
import {
  SvgTarget,
  SvgTrendingUp,
  SvgPieChart,
  SvgArrowUpRight,
  SvgArrowDownRight,
  SvgChevronDown,
  SvgBriefcase,
} from "@/components/web/SvgIcons";
import {
  ValidatedBudgetAnalytics,
  ValidatedOperatingMarginAnalytics,
  ValidatedExpenseDistributionAnalytics,
  DepartmentMetric,
  calculateDepartmentMetrics,
  formatCurrencySafe,
  formatCompactCurrency,
} from "@/services/FinancialCalculationEngine";
import { useFinance, Department, Budget, Transaction } from "@/context/FinanceContext";

interface Props {
  budget: ValidatedBudgetAnalytics;
  margin: ValidatedOperatingMarginAnalytics;
  distribution: ValidatedExpenseDistributionAnalytics;
  currency?: string;
  onOpenDrillDown: (type: "budget" | "nob" | "expense", department?: string) => void;
  isCompact?: boolean;
  departments?: Department[];
  departmentMetrics?: DepartmentMetric[];
  budgets?: Budget[];
  transactions?: Transaction[];
  onOpenDepartmentStaff?: (dept: Department | { id: string; name: string }) => void;
}

export function FinancialAnalyticsSuite({
  budget,
  margin,
  distribution,
  currency = "PKR",
  onOpenDrillDown,
  isCompact = false,
  departments: propDepartments,
  departmentMetrics: propDepartmentMetrics,
  budgets: propBudgets,
  transactions: propTransactions,
  onOpenDepartmentStaff,
}: Props) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Safe fallback to FinanceContext
  let financeContext: any = null;
  try {
    financeContext = useFinance();
  } catch (e) {
    // Handled safely if rendered outside provider
  }

  const effectiveDepts = propDepartments || financeContext?.departments || [];
  const effectiveBudgets = propBudgets || financeContext?.budgets || [];
  const effectiveTransactions = propTransactions || financeContext?.transactions || [];

  const effectiveDeptMetrics: DepartmentMetric[] = useMemo(() => {
    if (propDepartmentMetrics && propDepartmentMetrics.length > 0) {
      return propDepartmentMetrics;
    }
    if (financeContext?.departmentMetrics && financeContext.departmentMetrics.length > 0) {
      return financeContext.departmentMetrics;
    }
    if (effectiveDepts.length > 0 || effectiveBudgets.length > 0) {
      return calculateDepartmentMetrics(effectiveDepts, effectiveTransactions, undefined, effectiveBudgets);
    }
    return [];
  }, [propDepartmentMetrics, financeContext?.departmentMetrics, effectiveDepts, effectiveTransactions, effectiveBudgets]);

  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");

  const deptOptions = useMemo(() => {
    const list = [
      {
        id: "ALL",
        name: "All Units",
        spent: budget.actualSpending,
        allocated: budget.totalAllocated,
      },
    ];
    effectiveDeptMetrics.forEach((dm) => {
      list.push({
        id: dm.id,
        name: dm.name,
        spent: dm.spent,
        allocated: dm.allocated,
      });
    });
    return list;
  }, [effectiveDeptMetrics, budget]);

  const activeDepartmentMetric = useMemo(() => {
    if (selectedDeptId === "ALL") return null;
    return (
      effectiveDeptMetrics.find(
        (d) =>
          d.id === selectedDeptId ||
          d.name.trim().toLowerCase() === selectedDeptId.trim().toLowerCase()
      ) || null
    );
  }, [selectedDeptId, effectiveDeptMetrics]);

  const activeBudgetView = useMemo(() => {
    if (!activeDepartmentMetric) {
      return {
        isDept: false,
        name: "All Units",
        isValid: budget.isValid,
        totalAllocated: budget.totalAllocated,
        actualSpending: budget.actualSpending,
        remainingAmount: budget.remainingAmount,
        excessAmount: budget.excessAmount,
        rawUtilizationPct: budget.rawUtilizationPct,
        displayPct: budget.displayPct,
        isOverBudget: budget.isOverBudget,
        statusColor: budget.statusColor,
        statusLabel: budget.statusLabel,
        remainingText: budget.remainingText,
        explanation: budget.explanation,
        payrollSpending: 0,
        otherSpending: 0,
      };
    }

    const d = activeDepartmentMetric;
    const isOver = d.allocated > 0 && d.spent > d.allocated;
    const isWarning = d.utilizationPct >= 80 && !isOver;
    const isValid = d.allocated > 0 || d.spent > 0;
    const statusColor =
      d.allocated <= 0
        ? colors.mutedForeground
        : isOver
        ? colors.expense
        : isWarning
        ? colors.warning
        : colors.income;

    const statusLabel =
      d.allocated <= 0
        ? "No Budget Cap"
        : isOver
        ? "Over Budget Cap"
        : isWarning
        ? "Near Ceiling"
        : "On Track";

    const remainingText =
      d.allocated <= 0
        ? `${formatCompactCurrency(d.spent, currency)} Disbursed`
        : isOver
        ? `${formatCompactCurrency(d.spent - d.allocated, currency)} Over Limit`
        : `${formatCompactCurrency(d.remaining, currency)} Remaining`;

    const explanation =
      d.allocated > 0
        ? `Budget Cap: ${formatCompactCurrency(d.allocated, currency)} · Disbursed: ${formatCompactCurrency(d.spent, currency)} (${d.utilizationPct.toFixed(1)}% Used)`
        : `No allocated ceiling configured · Disbursed: ${formatCompactCurrency(d.spent, currency)}`;

    return {
      isDept: true,
      deptId: d.id,
      name: d.name,
      isValid,
      totalAllocated: d.allocated,
      actualSpending: d.spent,
      remainingAmount: d.remaining,
      excessAmount: Math.max(0, d.spent - d.allocated),
      rawUtilizationPct: d.utilizationPct,
      displayPct: `${d.utilizationPct.toFixed(1)}%`,
      isOverBudget: isOver,
      statusColor,
      statusLabel,
      remainingText,
      explanation,
      payrollSpending: d.payrollSpending || 0,
      otherSpending: d.otherSpending || 0,
    };
  }, [activeDepartmentMetric, budget, colors, currency]);

  // Active interaction mode states
  const [budgetMode, setBudgetMode] = useState<"used" | "spent" | "remaining">("used");
  const [marginMode, setMarginMode] = useState<"margin" | "outflow" | "net">("margin");
  const [selectedDistributionItem, setSelectedDistributionItem] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState<"budget" | "margin" | "distribution" | null>(null);
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);

  // Authoritative valid expense transactions
  const validExpenseTxs = useMemo(() => {
    return (effectiveTransactions || []).filter(
      (t: any) =>
        t &&
        t.type === "expense" &&
        Number(t.amount || 0) > 0 &&
        t.status !== "failed" &&
        t.status !== "deleted"
    );
  }, [effectiveTransactions]);

  // Map each category to the departments that incurred it
  const categoryToDeptsMap = useMemo(() => {
    const map: Record<string, { total: number; depts: { name: string; amount: number; pct: number }[] }> = {};
    validExpenseTxs.forEach((t: any) => {
      const cat = (t.category || "General").trim();
      const rawDept = (t.department || "General").trim();
      const matchedDept = effectiveDeptMetrics.find(
        (dm) => dm.id === rawDept || dm.name.trim().toLowerCase() === rawDept.toLowerCase()
      );
      const deptName = matchedDept ? matchedDept.name : rawDept;

      const catKey = cat.toLowerCase();
      if (!map[catKey]) {
        map[catKey] = { total: 0, depts: [] };
      }
      const entry = map[catKey];
      entry.total += Number(t.amount || 0);

      const existing = entry.depts.find((d) => d.name.toLowerCase() === deptName.toLowerCase());
      if (existing) {
        existing.amount += Number(t.amount || 0);
      } else {
        entry.depts.push({ name: deptName, amount: Number(t.amount || 0), pct: 0 });
      }
    });

    Object.values(map).forEach((entry) => {
      entry.depts.sort((a, b) => b.amount - a.amount);
      entry.depts.forEach((d) => {
        d.pct = entry.total > 0 ? (d.amount / entry.total) * 100 : 0;
      });
    });

    return map;
  }, [validExpenseTxs, effectiveDeptMetrics]);

  // Map each department to the categories it incurred
  const deptToCategoriesMap = useMemo(() => {
    const map: Record<string, { total: number; categories: { name: string; amount: number; pct: number }[] }> = {};
    validExpenseTxs.forEach((t: any) => {
      const cat = (t.category || "General").trim();
      const rawDept = (t.department || "General").trim();
      const matchedDept = effectiveDeptMetrics.find(
        (dm) => dm.id === rawDept || dm.name.trim().toLowerCase() === rawDept.toLowerCase()
      );
      const deptName = matchedDept ? matchedDept.name : rawDept;

      const key = deptName.toLowerCase();
      if (!map[key]) {
        map[key] = { total: 0, categories: [] };
      }
      const entry = map[key];
      entry.total += Number(t.amount || 0);

      const existing = entry.categories.find((c) => c.name.toLowerCase() === cat.toLowerCase());
      if (existing) {
        existing.amount += Number(t.amount || 0);
      } else {
        entry.categories.push({ name: cat, amount: Number(t.amount || 0), pct: 0 });
      }
    });

    Object.values(map).forEach((entry) => {
      entry.categories.sort((a, b) => b.amount - a.amount);
      entry.categories.forEach((c) => {
        c.pct = entry.total > 0 ? (c.amount / entry.total) * 100 : 0;
      });
    });

    return map;
  }, [validExpenseTxs, effectiveDeptMetrics]);

  // Department-level expense distribution
  const deptDistribution = useMemo(() => {
    const total = effectiveDeptMetrics.reduce((sum, d) => sum + d.spent, 0);
    if (total <= 0) {
      return {
        hasExpenses: false,
        totalExpenses: 0,
        departments: [] as {
          id: string;
          name: string;
          amount: number;
          pct: number;
          displayPct: string;
          count?: string;
          categoriesBreakdown?: { name: string; amount: number; pct: number }[];
          color: string;
        }[],
        chartSegments: [] as {
          label: string;
          value: number;
          color: string;
          pct: number;
        }[],
        topDept: null as any,
        explanation: "No department disbursements recorded in this period.",
      };
    }

    const sorted = [...effectiveDeptMetrics]
      .filter((d) => d.spent > 0)
      .sort((a, b) => b.spent - a.spent);

    const palette = ["#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#06B6D4", "#6366F1", "#64748B"];

    const fullDepts = sorted.map((d, idx) => {
      const pct = (d.spent / total) * 100;
      const catEntry =
        deptToCategoriesMap[d.name.toLowerCase()] ||
        deptToCategoriesMap[d.id.toLowerCase()] ||
        null;
      const categoriesBreakdown = catEntry?.categories || [];

      let originText = "Active Operational Cost Center";
      if (categoriesBreakdown.length > 0) {
        originText = `🏷️ Spend: ${categoriesBreakdown.map((c) => `${c.name} (${c.pct.toFixed(0)}%)`).join(" · ")}`;
      } else if (d.allocated > 0) {
        originText = `Cap: ${formatCompactCurrency(d.allocated, currency)} (${d.utilizationPct.toFixed(0)}% Used)`;
      }

      return {
        id: d.id,
        name: d.name,
        amount: d.spent,
        pct,
        displayPct: `${pct.toFixed(1)}%`,
        count:
          ((d as any).payrollHeadcount || (d as any).headCount) > 0
            ? `${(d as any).payrollHeadcount || (d as any).headCount} Staff`
            : undefined,
        categoriesBreakdown,
        originText,
        color: palette[idx % palette.length],
      };
    });

    const topDept = fullDepts[0] || null;

    let explanation = "Departmental disbursement breakdown.";
    if (topDept) {
      const activeSpendDepts = fullDepts.filter((d) => d.amount > 0);
      const zeroSpendDepts = effectiveDeptMetrics.filter((d) => d.spent === 0);

      const zeroText =
        zeroSpendDepts.length > 0
          ? ` ${zeroSpendDepts.map((d) => `${d.name}: ${currency} 0 used`).join(", ")} (${formatCompactCurrency(
              zeroSpendDepts.reduce((s, d) => s + d.remaining, 0),
              currency
            )} budget remaining).`
          : "";

      if (activeSpendDepts.length === 1) {
        explanation = `🏢 100% of spending is in ${topDept.name} (${formatCompactCurrency(
          topDept.amount,
          currency
        )} used of ${formatCompactCurrency(total, currency)} total).${zeroText}`;
      } else if (
        activeSpendDepts.length >= 2 &&
        Math.abs(activeSpendDepts[0].pct - activeSpendDepts[1].pct) < 0.5
      ) {
        explanation = `⚖️ Balanced Spending: ${activeSpendDepts
          .map(
            (d) =>
              `${d.name}: ${formatCompactCurrency(d.amount, currency)} (${d.displayPct})`
          )
          .join(" · ")} (${formatCompactCurrency(total, currency)} total spent).${zeroText}`;
      } else {
        explanation = `🏢 Primary Cost Center: ${topDept.name} leads with ${formatCompactCurrency(
          topDept.amount,
          currency
        )} (${topDept.displayPct} of ${formatCompactCurrency(
          total,
          currency
        )} total spent).${zeroText}`;
      }
    }

    return {
      hasExpenses: true,
      totalExpenses: total,
      departments: fullDepts,
      chartSegments: fullDepts.map((d) => ({
        label: d.name,
        value: d.amount,
        color: d.color,
        pct: d.pct,
      })),
      topDept,
      explanation,
    };
  }, [effectiveDeptMetrics, deptToCategoriesMap, currency]);

  // Department-Focused Active View for Card 3
  const activeDistView = useMemo(() => {
    const totalExp = deptDistribution.totalExpenses;
    const items = deptDistribution.departments;
    const chartSegs = deptDistribution.chartSegments;
    const topItem = deptDistribution.topDept
      ? {
          name: deptDistribution.topDept.name,
          amount: deptDistribution.topDept.amount,
          displayPct: deptDistribution.topDept.displayPct,
          color: deptDistribution.topDept.color,
        }
      : null;

    const selectedDeptMetric = selectedDistributionItem
      ? effectiveDeptMetrics.find(
          (dm) =>
            dm.name.toLowerCase() === selectedDistributionItem.toLowerCase() ||
            dm.id.toLowerCase() === selectedDistributionItem.toLowerCase()
        ) || null
      : null;

    const selectedData = selectedDistributionItem
      ? items.find(
          (i) => i.name.trim().toLowerCase() === selectedDistributionItem.trim().toLowerCase()
        ) ||
        (selectedDeptMetric
          ? {
              id: selectedDeptMetric.id,
              name: selectedDeptMetric.name,
              amount: selectedDeptMetric.spent,
              pct: totalExp > 0 ? (selectedDeptMetric.spent / totalExp) * 100 : 0,
              displayPct:
                totalExp > 0
                  ? `${((selectedDeptMetric.spent / totalExp) * 100).toFixed(1)}%`
                  : "0.0%",
              count:
                ((selectedDeptMetric as any).payrollHeadcount || (selectedDeptMetric as any).headCount) > 0
                  ? `${(selectedDeptMetric as any).payrollHeadcount || (selectedDeptMetric as any).headCount} Staff`
                  : undefined,
              originText: "Active Cost Center",
              color: "#3B82F6",
            }
          : null)
      : null;

    let contextualExplanation = deptDistribution.explanation;
    if (selectedDeptMetric) {
      const deptPct = totalExp > 0 ? (selectedDeptMetric.spent / totalExp) * 100 : 0;
      contextualExplanation = `🏢 ${selectedDeptMetric.name} Department: ${currency} ${selectedDeptMetric.spent.toLocaleString()} used (${deptPct.toFixed(1)}% of total expenses) • Budget: ${selectedDeptMetric.allocated > 0 ? `${currency} ${selectedDeptMetric.allocated.toLocaleString()}` : "No Cap"} • Remaining: ${selectedDeptMetric.allocated > 0 ? `${currency} ${selectedDeptMetric.remaining.toLocaleString()}` : "Uncapped"} (${selectedDeptMetric.utilizationPct.toFixed(0)}% used).`;
    }

    const isTied = items.length >= 2 && Math.abs(items[0].pct - items[1].pct) < 0.1;

    const bentoCol1Label = selectedDeptMetric
      ? "SELECTED DEPT"
      : isTied
      ? "TOP DEPARTMENTS"
      : "TOP DEPARTMENT";
    const bentoCol1Val = selectedDeptMetric
      ? selectedDeptMetric.name
      : isTied && items.length >= 2
      ? `${items[0].name} & ${items[1].name} (Tied)`
      : topItem
      ? topItem.name
      : "None";
    const bentoCol1Color = selectedData
      ? selectedData.color
      : topItem
      ? topItem.color
      : "#3B82F6";

    const bentoCol2Label = selectedDeptMetric ? "DEPT SPENT" : "TOTAL SPENT";
    const bentoCol2Val = selectedDeptMetric
      ? formatCompactCurrency(selectedDeptMetric.spent, currency)
      : formatCompactCurrency(totalExp, currency);

    const bentoCol3Label = selectedDeptMetric ? "SHARE OF TOTAL" : "DEPARTMENTS";
    const bentoCol3Val = selectedDeptMetric
      ? totalExp > 0
        ? `${((selectedDeptMetric.spent / totalExp) * 100).toFixed(1)}%`
        : "0.0%"
      : `${effectiveDeptMetrics.length} Active`;

    return {
      isDept: true,
      titleSubtitle: `${effectiveDeptMetrics.length} Department Cost Center${effectiveDeptMetrics.length === 1 ? "" : "s"} Active`,
      hasExpenses: deptDistribution.hasExpenses,
      totalExpenses: totalExp,
      items,
      chartSegments: chartSegs,
      topItem,
      selectedData,
      explanation: contextualExplanation,
      bentoCol1Label,
      bentoCol1Val,
      bentoCol1Color,
      bentoCol2Label,
      bentoCol2Val,
      bentoCol3Label,
      bentoCol3Val,
    };
  }, [deptDistribution, effectiveDeptMetrics, selectedDistributionItem, currency]);

  return (
    <View style={styles.container}>
      {/* ─── 3 Column Responsive Section ─── */}
      <View style={[styles.grid, isMobile && styles.gridMobile]}>
        {/* ========================================================================= */}
        {/* CARD 1: BUDGET UTILIZATION CARD                                          */}
        {/* ========================================================================= */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, isMobile ? styles.cardMobile : styles.cardDesktop]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconBadge, { backgroundColor: colors.primary + "16" }]}>
                <SvgTarget size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleWithHelpRow}>
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    Budget Utilization
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowTooltip(showTooltip === "budget" ? null : "budget")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.helpIcon, { color: colors.mutedForeground }]}>ⓘ</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {activeBudgetView.isDept
                    ? activeBudgetView.totalAllocated > 0
                      ? `Cap: ${formatCompactCurrency(activeBudgetView.totalAllocated, currency)} · ${activeBudgetView.name}`
                      : `Uncapped · ${activeBudgetView.name}`
                    : budget.isValid
                    ? `Cap: ${formatCompactCurrency(budget.totalAllocated, currency)} · Organization Total`
                    : "No Budget Cap Configured"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenDrillDown("budget", selectedDeptId !== "ALL" ? activeBudgetView.name : undefined);
              }}
              style={{ flexShrink: 0 }}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>{isMobile ? "Details →" : "View Details"}</Text>
            </TouchableOpacity>
          </View>

          {/* Formula Tooltip Banner */}
          {showTooltip === "budget" && (
            <View style={[styles.tooltipBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
              <Text style={[styles.tooltipText, { color: colors.foreground }]}>
                📐 <Text style={{ fontFamily: "Inter_700Bold" }}>Formula:</Text> (Actual Spend ÷ Budget Cap) × 100
              </Text>
              <Text style={[styles.tooltipSub, { color: colors.mutedForeground }]}>{activeBudgetView.explanation}</Text>
            </View>
          )}

          {/* Contextual Status Strip (Uniform 46px minHeight across all cards) */}
          <View style={[styles.statusStrip, { backgroundColor: activeBudgetView.statusColor + "14", borderColor: activeBudgetView.statusColor + "30" }]}>
            <View style={[styles.statusDot, { backgroundColor: activeBudgetView.statusColor }]} />
            <Text style={[styles.statusStripText, { color: activeBudgetView.statusColor }]} numberOfLines={4}>
              {activeBudgetView.statusLabel} · {activeBudgetView.remainingText}
            </Text>
            {activeBudgetView.isDept && (
              <View style={[styles.deptIndicatorBadge, { backgroundColor: activeBudgetView.statusColor + "20" }]}>
                <Text style={[styles.deptIndicatorText, { color: activeBudgetView.statusColor }]} numberOfLines={1}>
                  {activeBudgetView.name}
                </Text>
              </View>
            )}
          </View>

          {/* Visual Ring / Gauge */}
          <View style={styles.ringCenterWrap}>
            {(() => {
              const remRatio =
                activeBudgetView.isValid && activeBudgetView.totalAllocated > 0
                  ? Math.min(100, Math.max(0, (activeBudgetView.remainingAmount / activeBudgetView.totalAllocated) * 100))
                  : 0;

              const spentRatio =
                activeBudgetView.isValid && activeBudgetView.totalAllocated > 0
                  ? Math.min(100, Math.max(0, (activeBudgetView.actualSpending / activeBudgetView.totalAllocated) * 100))
                  : 0;

              const activePct =
                !activeBudgetView.isValid
                  ? 0
                  : budgetMode === "remaining"
                  ? remRatio
                  : budgetMode === "spent"
                  ? spentRatio
                  : Math.min(100, Math.max(0, activeBudgetView.rawUtilizationPct));

              const centerLabel =
                !activeBudgetView.isValid
                  ? "0%"
                  : budgetMode === "spent"
                  ? formatCompactCurrency(activeBudgetView.actualSpending, currency)
                  : budgetMode === "remaining"
                  ? formatCompactCurrency(activeBudgetView.remainingAmount, currency)
                  : activeBudgetView.displayPct;

              const label =
                budgetMode === "spent"
                  ? "Disbursed"
                  : budgetMode === "remaining"
                  ? "Remaining"
                  : "Budget Used";

              const sublabel =
                !activeBudgetView.isValid
                  ? "NO CAP"
                  : budgetMode === "spent"
                  ? `${activeBudgetView.rawUtilizationPct < 1 && activeBudgetView.rawUtilizationPct > 0 ? activeBudgetView.rawUtilizationPct.toFixed(1) : activeBudgetView.rawUtilizationPct.toFixed(0)}% OF CAP`
                  : budgetMode === "remaining"
                  ? `${remRatio < 100 && remRatio > 99 ? remRatio.toFixed(1) : remRatio.toFixed(0)}% LEFT`
                  : activeBudgetView.isOverBudget
                  ? `${formatCompactCurrency(activeBudgetView.excessAmount, currency)} Over`
                  : `${formatCompactCurrency(activeBudgetView.actualSpending, currency)} Spent`;

              return (
                <RingProgress
                  percentage={activePct}
                  size={132}
                  strokeWidth={11}
                  color={budgetMode === "remaining" ? colors.income : activeBudgetView.statusColor}
                  centerLabel={centerLabel}
                  label={label}
                  sublabel={sublabel}
                />
              );
            })()}
          </View>

          {/* Dual-Track Visual Budget Allocation Bar */}
          {activeBudgetView.isValid && activeBudgetView.totalAllocated > 0 ? (
            <View style={styles.flowBarSection}>
              <View style={[styles.flowBarTrack, { backgroundColor: (colors.cardAlt ?? colors.muted) + "50" }]}>
                {/* Spent Segment: Red / Expense */}
                <View
                  style={[
                    styles.flowBarFill,
                    {
                      width: `${Math.max(3, Math.min(97, activeBudgetView.rawUtilizationPct))}%`,
                      backgroundColor: colors.expense,
                    },
                  ]}
                />
                {/* Remaining Segment: Green / Income */}
                <View
                  style={[
                    styles.flowBarFill,
                    {
                      width: `${Math.max(3, Math.min(97, Math.max(0, 100 - activeBudgetView.rawUtilizationPct)))}%`,
                      backgroundColor: colors.income,
                    },
                  ]}
                />
              </View>
              <View style={styles.flowBarLegend}>
                <View style={styles.flowLegendItem}>
                  <View style={[styles.flowDot, { backgroundColor: colors.expense }]} />
                  <Text style={[styles.flowLegendText, { color: colors.mutedForeground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    Spent:{" "}
                    <Text style={{ color: colors.expense, fontFamily: "Inter_700Bold" }}>
                      {formatCompactCurrency(activeBudgetView.actualSpending, currency)} ({activeBudgetView.rawUtilizationPct.toFixed(0)}%)
                    </Text>
                  </Text>
                </View>
                <View style={[styles.flowLegendItem, { justifyContent: "flex-end" }]}>
                  <View style={[styles.flowDot, { backgroundColor: colors.income }]} />
                  <Text style={[styles.flowLegendText, { color: colors.mutedForeground, textAlign: "right" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    Left:{" "}
                    <Text style={{ color: colors.income, fontFamily: "Inter_700Bold" }}>
                      {formatCompactCurrency(activeBudgetView.remainingAmount, currency)} ({Math.max(0, 100 - activeBudgetView.rawUtilizationPct).toFixed(0)}%)
                    </Text>
                  </Text>
                </View>
              </View>
            </View>
          ) : activeBudgetView.isDept && activeBudgetView.actualSpending > 0 ? (
            <View style={[styles.uncappedNotice, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
              <Text style={[styles.uncappedNoticeText, { color: colors.mutedForeground }]}>
                Live Disbursements: <Text style={{ color: colors.expense, fontFamily: "Inter_700Bold" }}>{formatCompactCurrency(activeBudgetView.actualSpending, currency)}</Text> (Uncapped Cost Center)
              </Text>
            </View>
          ) : null}

          {/* Department Selector Option Controls (Requested by User) */}
          {deptOptions.length > 1 && (
            <View style={styles.deptOptionsContainer}>
              <View style={styles.deptOptionsHeader}>
                <Text style={[styles.deptOptionsLabel, { color: colors.mutedForeground }]}>
                  SELECT DEPARTMENT OPTION:
                </Text>
                {activeBudgetView.isDept ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedDeptId("ALL");
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.resetDeptText, { color: colors.primary }]}>
                      Show All Units
                    </Text>
                  </TouchableOpacity>
                ) : onOpenDepartmentStaff ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onOpenDepartmentStaff({ id: "ALL", name: "All Units" });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.resetDeptText, { color: "#0EA5E9" }]}>
                      Staff Roster (All) →
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.deptChipsScroll}
              >
                {deptOptions.map((dept) => {
                  const isSelected = selectedDeptId === dept.id;
                  return (
                    <TouchableOpacity
                      key={dept.id}
                      style={[
                        styles.deptChip,
                        {
                          backgroundColor: isSelected ? colors.primary : (colors.cardAlt ?? colors.muted) + "30",
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDeptId(dept.id);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.deptChipText,
                          { color: isSelected ? "#FFFFFF" : colors.foreground },
                          isSelected && { fontFamily: "Inter_700Bold" },
                        ]}
                        numberOfLines={1}
                      >
                        {dept.name}
                      </Text>
                      <View
                        style={[
                          styles.deptChipBadge,
                          {
                            backgroundColor: isSelected
                              ? "rgba(255, 255, 255, 0.25)"
                              : (colors.cardAlt ?? colors.muted) + "60",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.deptChipBadgeText,
                            { color: isSelected ? "#FFFFFF" : colors.mutedForeground },
                          ]}
                        >
                          {dept.allocated > 0
                            ? `${((dept.spent / dept.allocated) * 100).toFixed(0)}%`
                            : formatCompactCurrency(dept.spent, currency)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Segmented Metric View Mode Controls */}
          <View style={styles.chipsRow}>
            {[
              { id: "used", label: "% Used" },
              { id: "spent", label: "Spent" },
              { id: "remaining", label: "Remaining" },
            ].map((opt) => {
              const isSelected = budgetMode === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? colors.primary : (colors.cardAlt ?? colors.muted) + "30",
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setBudgetMode(opt.id as any);
                  }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? "#FFFFFF" : colors.mutedForeground },
                      isSelected && { fontFamily: "Inter_700Bold" },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 3-Metric Structured Bento Box (Pinned to bottom) */}
          <View style={[styles.bentoRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                DISBURSED
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.expense }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {formatCompactCurrency(activeBudgetView.actualSpending, currency)}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                ALLOCATED
              </Text>
              <Text
                style={[styles.bentoVal, { color: activeBudgetView.isValid && activeBudgetView.totalAllocated > 0 ? colors.foreground : colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {activeBudgetView.isValid && activeBudgetView.totalAllocated > 0 ? formatCompactCurrency(activeBudgetView.totalAllocated, currency) : "Not Set"}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {activeBudgetView.isOverBudget ? "OVER BUDGET" : "REMAINING"}
              </Text>
              <Text
                style={[
                  styles.bentoVal,
                  {
                    color: activeBudgetView.isOverBudget
                      ? colors.expense
                      : activeBudgetView.remainingAmount > 0
                      ? colors.income
                      : colors.mutedForeground,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {activeBudgetView.isValid && activeBudgetView.totalAllocated > 0
                  ? activeBudgetView.isOverBudget
                    ? `-${formatCompactCurrency(activeBudgetView.excessAmount, currency)}`
                    : formatCompactCurrency(activeBudgetView.remainingAmount, currency)
                  : activeBudgetView.actualSpending > 0
                  ? "Uncapped"
                  : "—"}
              </Text>
            </View>
          </View>

          {/* Department Spending Composition Note */}
          {activeBudgetView.isDept && (
            <View style={[styles.deptSubMetaRow, { borderColor: colors.border }]}>
              <Text style={[styles.deptSubMetaText, { color: colors.mutedForeground }]}>
                Payroll: <Text style={{ color: "#8B5CF6", fontFamily: "Inter_700Bold" }}>{formatCompactCurrency(activeBudgetView.payrollSpending, currency)}</Text>
                {"  "}•{"  "}
                Operational: <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{formatCompactCurrency(activeBudgetView.otherSpending, currency)}</Text>
              </Text>
              {onOpenDepartmentStaff && (
                <TouchableOpacity
                  onPress={() => {
                    const matchedDept = effectiveDepts.find(
                      (d: any) => d.id === activeBudgetView.deptId || d.name.trim().toLowerCase() === activeBudgetView.name.trim().toLowerCase()
                    );
                    onOpenDepartmentStaff(matchedDept || { id: activeBudgetView.deptId || activeBudgetView.name, name: activeBudgetView.name });
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={{ fontSize: 10, color: "#0EA5E9", fontFamily: "Inter_700Bold" }}>
                    View Roster →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ========================================================================= */}
        {/* CARD 2: NET OPERATING MARGIN (NOM) CARD                                  */}
        {/* ========================================================================= */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, isMobile ? styles.cardMobile : styles.cardDesktop]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconBadge, { backgroundColor: margin.statusColor + "16" }]}>
                <SvgTrendingUp size={18} color={margin.statusColor} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleWithHelpRow}>
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    Net Operating Margin
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowTooltip(showTooltip === "margin" ? null : "margin")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.helpIcon, { color: colors.mutedForeground }]}>ⓘ</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {margin.statusLabel}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenDrillDown("nob");
              }}
              style={{ flexShrink: 0 }}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>{isMobile ? "Details →" : "View Details"}</Text>
            </TouchableOpacity>
          </View>

          {/* Formula Tooltip Banner */}
          {showTooltip === "margin" && (
            <View style={[styles.tooltipBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
              <Text style={[styles.tooltipText, { color: colors.foreground }]}>
                📐 <Text style={{ fontFamily: "Inter_700Bold" }}>Formula:</Text> (Operating Income ÷ Operating Revenue) × 100
              </Text>
              <Text style={[styles.tooltipSub, { color: colors.mutedForeground }]}>
                Measures the percentage of operating revenue retained after operating disbursements.
              </Text>
            </View>
          )}

          {/* Contextual Status Strip with Trend (Uniform 46px minHeight across all cards) */}
          <View style={[styles.statusStrip, { backgroundColor: margin.statusColor + "14", borderColor: margin.statusColor + "30" }]}>
            <View style={[styles.statusDot, { backgroundColor: margin.statusColor }]} />
            <Text style={[styles.statusStripText, { color: margin.statusColor, flex: 1 }]} numberOfLines={4}>
              {margin.explanationText}
            </Text>
            {margin.marginChangeVsPrevious !== null && margin.marginChangeVsPrevious !== undefined && (
              <View style={styles.trendBadge}>
                {margin.trendDirection === "up" ? (
                  <SvgArrowUpRight size={12} color={colors.income} />
                ) : (
                  <SvgArrowDownRight size={12} color={colors.expense} />
                )}
                <Text
                  style={[
                    styles.trendText,
                    { color: margin.trendDirection === "up" ? colors.income : colors.expense },
                  ]}
                  numberOfLines={1}
                >
                  {Math.abs(margin.marginChangeVsPrevious).toFixed(1)}% vs prev
                </Text>
              </View>
            )}
          </View>

          {/* Visual Ring / Gauge */}
          <View style={styles.ringCenterWrap}>
            {(() => {
              const revenue = margin.operatingRevenue;
              const expenses = margin.operatingExpenses;
              const income = margin.operatingIncome;
              const isLoss = margin.isLoss;
              const totalFlow = revenue + expenses;

              // Outflow share of total cash movement
              const outflowSharePct = totalFlow > 0 ? (expenses / totalFlow) * 100 : 0;
              // Deficit share of expenditures
              const deficitSharePct = expenses > 0 ? (Math.abs(income) / expenses) * 100 : 0;

              let activePct = 0;
              let ringColor = margin.statusColor;
              let centerLabel = margin.displayMargin;
              let label: string = margin.statusLabel;
              let sublabel = `${isLoss ? "-" : "+"}${formatCompactCurrency(Math.abs(income), currency)}`;

              if (marginMode === "outflow") {
                activePct = Math.min(100, Math.max(0, outflowSharePct));
                ringColor = colors.expense;
                centerLabel = `${outflowSharePct.toFixed(1)}%`;
                label = "Expenses Share";
                sublabel = `-${formatCompactCurrency(expenses, currency)}`;
              } else if (marginMode === "net") {
                activePct = isLoss
                  ? Math.min(100, Math.max(0, deficitSharePct))
                  : Math.min(100, Math.max(0, margin.rawMarginPct));
                ringColor = isLoss ? colors.expense : colors.income;
                centerLabel = `${isLoss ? "-" : "+"}${formatCompactCurrency(Math.abs(income), currency)}`;
                label = isLoss ? "Net Deficit" : "Net Surplus";
                sublabel = margin.displayMargin;
              } else {
                // marginMode === "margin" (Profit / Loss %)
                if (!margin.hasRevenue) {
                  activePct = expenses > 0 ? 100 : 0;
                  ringColor = expenses > 0 ? colors.expense : colors.mutedForeground;
                  centerLabel = expenses > 0 ? "-100%" : "0%";
                  label = expenses > 0 ? "Zero Income" : "No Activity";
                  sublabel = expenses > 0 ? `-${formatCompactCurrency(expenses, currency)}` : "PKR 0";
                } else if (isLoss) {
                  activePct = Math.min(100, Math.max(0, Math.abs(margin.rawMarginPct)));
                  ringColor = colors.expense;
                  centerLabel = margin.displayMargin;
                  label = "Operating Loss";
                  sublabel = `-${formatCompactCurrency(Math.abs(income), currency)}`;
                } else {
                  // Healthy Surplus
                  activePct = Math.min(100, Math.max(0, margin.rawMarginPct));
                  ringColor = colors.income;
                  centerLabel = margin.displayMargin;
                  label = "Operating Profit";
                  sublabel = `+${formatCompactCurrency(income, currency)}`;
                }
              }

              return (
                <RingProgress
                  percentage={activePct}
                  size={132}
                  strokeWidth={11}
                  color={ringColor}
                  centerLabel={centerLabel}
                  label={label}
                  sublabel={sublabel}
                />
              );
            })()}
          </View>

          {/* Dual-Tone Cash Income vs Expenses Comparison Bar (Guaranteed Gap & Non-Overlapping Alignment) */}
          {(() => {
            const rev = margin.operatingRevenue;
            const exp = margin.operatingExpenses;
            const total = rev + exp;
            if (total <= 0) return null;

            const inflowPct = (rev / total) * 100;
            const outflowPct = (exp / total) * 100;

            return (
              <View style={styles.flowBarSection}>
                <View style={[styles.flowBarTrack, { backgroundColor: (colors.cardAlt ?? colors.muted) + "50" }]}>
                  {inflowPct > 0 && (
                    <View
                      style={[
                        styles.flowBarFill,
                        {
                          width: `${Math.max(3, Math.min(97, inflowPct))}%`,
                          backgroundColor: colors.income,
                        },
                      ]}
                    />
                  )}
                  {outflowPct > 0 && (
                    <View
                      style={[
                        styles.flowBarFill,
                        {
                          width: `${Math.max(3, Math.min(97, outflowPct))}%`,
                          backgroundColor: colors.expense,
                        },
                      ]}
                    />
                  )}
                </View>
                <View style={styles.flowBarLegend}>
                  <View style={styles.flowLegendItem}>
                    <View style={[styles.flowDot, { backgroundColor: colors.income }]} />
                    <Text style={[styles.flowLegendText, { color: colors.mutedForeground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      Income:{" "}
                      <Text style={{ color: colors.income, fontFamily: "Inter_700Bold" }}>
                        +{formatCompactCurrency(rev, currency)} ({inflowPct.toFixed(0)}%)
                      </Text>
                    </Text>
                  </View>
                  <View style={[styles.flowLegendItem, { justifyContent: "flex-end" }]}>
                    <View style={[styles.flowDot, { backgroundColor: colors.expense }]} />
                    <Text style={[styles.flowLegendText, { color: colors.mutedForeground, textAlign: "right" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      Expenses:{" "}
                      <Text style={{ color: colors.expense, fontFamily: "Inter_700Bold" }}>
                        -{formatCompactCurrency(exp, currency)} ({outflowPct.toFixed(0)}%)
                      </Text>
                    </Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* Segmented Option Controls */}
          <View style={styles.chipsRow}>
            {[
              { id: "margin", label: "Profit / Loss" },
              { id: "outflow", label: "Expenses" },
              { id: "net", label: "Net Surplus" },
            ].map((opt) => {
              const isSelected = marginMode === opt.id;
              const chipColor =
                opt.id === "outflow"
                  ? colors.expense
                  : opt.id === "net"
                  ? margin.isLoss
                    ? colors.expense
                    : colors.income
                  : margin.statusColor;

              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? chipColor : (colors.cardAlt ?? colors.muted) + "30",
                      borderColor: isSelected ? chipColor : colors.border,
                    },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMarginMode(opt.id as any);
                  }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? "#FFFFFF" : colors.mutedForeground },
                      isSelected && { fontFamily: "Inter_700Bold" },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 3-Metric Structured Bento Box (Pinned to bottom) */}
          <View style={[styles.bentoRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                INCOME
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.income }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                +{formatCompactCurrency(margin.operatingRevenue, currency)}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                EXPENSES
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.expense }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                -{formatCompactCurrency(margin.operatingExpenses, currency)}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {margin.isLoss ? "NET DEFICIT" : "NET SURPLUS"}
              </Text>
              <Text
                style={[
                  styles.bentoVal,
                  { color: margin.isLoss ? colors.expense : colors.income },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {margin.isLoss ? "-" : "+"}
                {formatCompactCurrency(Math.abs(margin.operatingIncome), currency)}
              </Text>
            </View>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* CARD 3: EXPENSE DISTRIBUTION DONUT & RANKED LIST CARD                     */}
        {/* ========================================================================= */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, isMobile ? styles.cardMobile : styles.cardDesktop]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconBadge, { backgroundColor: activeDistView.isDept ? "#3B82F618" : "#8B5CF618" }]}>
                <SvgPieChart size={18} color={activeDistView.isDept ? "#3B82F6" : "#8B5CF6"} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleWithHelpRow}>
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    Expense Distribution
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowTooltip(showTooltip === "distribution" ? null : "distribution")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.helpIcon, { color: colors.mutedForeground }]}>ⓘ</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {activeDistView.titleSubtitle}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenDrillDown("expense", selectedDistributionItem || undefined);
              }}
              style={{ flexShrink: 0 }}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>{isMobile ? "Outflows →" : "View Outflows"}</Text>
            </TouchableOpacity>
          </View>

          {/* Formula Tooltip Banner */}
          {showTooltip === "distribution" && (
            <View style={[styles.tooltipBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
              <Text style={[styles.tooltipText, { color: colors.foreground }]}>
                📐 <Text style={{ fontFamily: "Inter_700Bold" }}>Formula:</Text> {activeDistView.isDept ? "Department Spend ÷ Total Expenses × 100" : "Category Spend ÷ Total Expenses × 100"}
              </Text>
              <Text style={[styles.tooltipSub, { color: colors.mutedForeground }]}>
                All percentage shares derive from authoritative period disbursements and total exactly 100%.
              </Text>
            </View>
          )}

          {/* Contextual Status Strip (Uniform 46px minHeight across all cards) */}
          <View style={[styles.statusStrip, { backgroundColor: (activeDistView.isDept ? "#3B82F6" : "#8B5CF6") + "14", borderColor: (activeDistView.isDept ? "#3B82F6" : "#8B5CF6") + "30" }]}>
            <View style={[styles.statusDot, { backgroundColor: activeDistView.isDept ? "#3B82F6" : "#8B5CF6" }]} />
            <Text style={[styles.statusStripText, { color: activeDistView.isDept ? "#3B82F6" : "#8B5CF6" }]} numberOfLines={4}>
              {activeDistView.explanation}
            </Text>
          </View>

          {/* Interactive Donut Chart */}
          {activeDistView.hasExpenses ? (
            <View style={styles.donutWrap}>
              <DonutChart
                segments={activeDistView.chartSegments}
                size={124}
                strokeWidth={10}
                centerLabel={
                  activeDistView.selectedData
                    ? formatCompactCurrency(activeDistView.selectedData.amount, currency)
                    : formatCompactCurrency(activeDistView.totalExpenses, currency)
                }
                centerSub={
                  activeDistView.selectedData
                    ? `${activeDistView.selectedData.name.toUpperCase()} (${activeDistView.selectedData.displayPct})`
                    : "TOTAL SPENT"
                }
                currency={currency}
                showChips={false}
                showLegend={false}
                selectedLabel={selectedDistributionItem}
                onSelectLabel={(lbl) => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (!lbl || selectedDistributionItem?.toLowerCase() === lbl.toLowerCase()) {
                    setSelectedDistributionItem(null);
                    setExpandedDeptId(null);
                  } else {
                    setSelectedDistributionItem(lbl);
                    const matched = effectiveDeptMetrics.find(
                      (dm) =>
                        dm.name.toLowerCase() === lbl.toLowerCase() ||
                        dm.id.toLowerCase() === lbl.toLowerCase()
                    );
                    if (matched) {
                      setExpandedDeptId(matched.id);
                    }
                  }
                }}
              />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No expense disbursements recorded in this period.
              </Text>
            </View>
          )}

          {/* Quick Department Filter Chips */}
          <View style={styles.deptOptionsContainer}>
            <View style={styles.deptOptionsHeader}>
              <Text style={[styles.deptOptionsLabel, { color: colors.mutedForeground }]}>
                {selectedDistributionItem ? "FILTERED BREAKDOWN" : "DEPARTMENT BREAKDOWN"}
              </Text>
              {selectedDistributionItem ? (
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDistributionItem(null);
                    setExpandedDeptId(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.resetDeptText, { color: colors.primary }]}>
                    Show All Units ✕
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.deptChipsScroll}
            >
              <TouchableOpacity
                style={[
                  styles.deptChip,
                  {
                    backgroundColor: !selectedDistributionItem ? colors.primary : (colors.cardAlt ?? colors.muted) + "30",
                    borderColor: !selectedDistributionItem ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedDistributionItem(null);
                  setExpandedDeptId(null);
                }}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.deptChipText,
                    { color: !selectedDistributionItem ? "#FFFFFF" : colors.foreground },
                    !selectedDistributionItem && { fontFamily: "Inter_700Bold" },
                  ]}
                >
                  🏢 All Units
                </Text>
                <View
                  style={[
                    styles.deptChipBadge,
                    {
                      backgroundColor: !selectedDistributionItem
                        ? "rgba(255, 255, 255, 0.25)"
                        : (colors.cardAlt ?? colors.muted) + "60",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.deptChipBadgeText,
                      { color: !selectedDistributionItem ? "#FFFFFF" : colors.mutedForeground },
                    ]}
                  >
                    {formatCompactCurrency(activeDistView.totalExpenses, currency)}
                  </Text>
                </View>
              </TouchableOpacity>

              {effectiveDeptMetrics.map((dm) => {
                const isSelected =
                  selectedDistributionItem?.toLowerCase() === dm.name.toLowerCase() ||
                  selectedDistributionItem?.toLowerCase() === dm.id.toLowerCase();
                const matchedSeg = activeDistView.chartSegments.find(
                  (s) => s.label.toLowerCase() === dm.name.toLowerCase()
                );
                const dotColor = matchedSeg?.color || colors.primary;

                return (
                  <TouchableOpacity
                    key={dm.id || dm.name}
                    style={[
                      styles.deptChip,
                      {
                        backgroundColor: isSelected ? colors.primary : (colors.cardAlt ?? colors.muted) + "30",
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (isSelected) {
                        setSelectedDistributionItem(null);
                        setExpandedDeptId(null);
                      } else {
                        setSelectedDistributionItem(dm.name);
                        setExpandedDeptId(dm.id);
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.flowDot, { backgroundColor: isSelected ? "#FFFFFF" : dotColor }]} />
                    <Text
                      style={[
                        styles.deptChipText,
                        { color: isSelected ? "#FFFFFF" : colors.foreground },
                        isSelected && { fontFamily: "Inter_700Bold" },
                      ]}
                      numberOfLines={1}
                    >
                      {dm.name}
                    </Text>
                    <View
                      style={[
                        styles.deptChipBadge,
                        {
                          backgroundColor: isSelected
                            ? "rgba(255, 255, 255, 0.25)"
                            : (colors.cardAlt ?? colors.muted) + "60",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.deptChipBadgeText,
                          { color: isSelected ? "#FFFFFF" : colors.mutedForeground },
                        ]}
                      >
                        {formatCompactCurrency(dm.spent, currency)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Department Breakdown Ranked List */}
          <ScrollView
            style={styles.categoryRankedScroll}
            contentContainerStyle={styles.categoryRankedList}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {activeDistView.items.length === 0 && !selectedDistributionItem ? (
              <View style={[styles.emptyDeptCatBox, { borderColor: colors.border }]}>
                <Text style={[styles.emptyDeptCatText, { color: colors.mutedForeground }]}>
                  {effectiveDeptMetrics.length === 0
                    ? "No departments configured in the organization yet."
                    : "No expense disbursements recorded in this period."}
                </Text>
              </View>
            ) : (
              (selectedDistributionItem
                ? (activeDistView.items.some(
                    (it) =>
                      it.name.toLowerCase() === selectedDistributionItem.toLowerCase() ||
                      it.id.toLowerCase() === selectedDistributionItem.toLowerCase()
                  )
                    ? activeDistView.items.filter(
                        (it) =>
                          it.name.toLowerCase() === selectedDistributionItem.toLowerCase() ||
                          it.id.toLowerCase() === selectedDistributionItem.toLowerCase()
                      )
                    : (() => {
                        const matched = effectiveDeptMetrics.find(
                          (dm) =>
                            dm.name.toLowerCase() === selectedDistributionItem.toLowerCase() ||
                            dm.id.toLowerCase() === selectedDistributionItem.toLowerCase()
                        );
                        return matched
                          ? [
                              {
                                id: matched.id,
                                name: matched.name,
                                amount: matched.spent,
                                pct:
                                  activeDistView.totalExpenses > 0
                                    ? (matched.spent / activeDistView.totalExpenses) * 100
                                    : 0,
                                displayPct:
                                  activeDistView.totalExpenses > 0
                                    ? `${((matched.spent / activeDistView.totalExpenses) * 100).toFixed(1)}%`
                                    : "0.0%",
                                count:
                                  ((matched as any).payrollHeadcount || (matched as any).headCount) > 0
                                    ? `${(matched as any).payrollHeadcount || (matched as any).headCount} Staff`
                                    : undefined,
                                categoriesBreakdown:
                                  (
                                    deptToCategoriesMap[matched.name.toLowerCase()] ||
                                    deptToCategoriesMap[matched.id.toLowerCase()]
                                  )?.categories || [],
                                color: colors.primary,
                              },
                            ]
                          : [];
                      })())
                : activeDistView.items
              ).map((d) => {
                const isSelected =
                  selectedDistributionItem?.toLowerCase() === d.name.toLowerCase() ||
                  selectedDistributionItem?.toLowerCase() === d.id.toLowerCase();
                const isExpanded =
                  isSelected ||
                  expandedDeptId === d.id ||
                  (expandedDeptId && expandedDeptId.toLowerCase() === d.name.toLowerCase());

                return (
                  <TouchableOpacity
                    key={d.id || d.name}
                    style={[
                      styles.rankedDistItem,
                      {
                        backgroundColor: isSelected ? d.color + "16" : (colors.cardAlt ?? colors.muted) + "18",
                        borderColor: isSelected ? d.color : colors.border,
                        borderWidth: isSelected ? 1.5 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (isSelected) {
                        setSelectedDistributionItem(null);
                        setExpandedDeptId(null);
                      } else {
                        setSelectedDistributionItem(d.name);
                        setExpandedDeptId(d.id);
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.rankedDistTopRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
                        <View style={[styles.flowDot, { backgroundColor: d.color }]} />
                        <Text
                          style={[
                            styles.rankedDistName,
                            { color: isSelected ? d.color : colors.foreground },
                            isSelected && { fontFamily: "Inter_700Bold" },
                          ]}
                          numberOfLines={1}
                        >
                          {d.name}
                        </Text>
                        {d.count && (
                          <View style={[styles.distCountBadge, { backgroundColor: d.color + "18" }]}>
                            <Text style={[styles.distCountText, { color: d.color }]}>{d.count}</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <Text style={[styles.rankedDistAmount, { color: colors.foreground }]}>
                          {formatCompactCurrency(d.amount, currency)}
                        </Text>
                        <View style={[styles.distPctBadge, { backgroundColor: d.color + "20", borderColor: d.color + "40" }]}>
                          <Text style={[styles.distPctText, { color: d.color }]}>{d.displayPct}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Progress Bar */}
                    <View style={[styles.distBarTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.distBarFill,
                          {
                            width: `${Math.min(100, Math.max(3, d.pct))}%`,
                            backgroundColor: d.color,
                          },
                        ]}
                      />
                    </View>

                    {/* Sub-breakdown if selected/expanded and has categories */}
                    {isExpanded && d.categoriesBreakdown && d.categoriesBreakdown.length > 0 && (
                      <View style={styles.distSubCatRow}>
                        {d.categoriesBreakdown.map((cat: any) => (
                          <View
                            key={cat.name}
                            style={[
                              styles.distSubCatChip,
                              { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border },
                            ]}
                          >
                            <Text style={[styles.distSubCatText, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {cat.name}:{" "}
                              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                                {formatCompactCurrency(cat.amount, currency)}
                              </Text>{" "}
                              ({cat.pct.toFixed(0)}%)
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Authoritative 3-Metric Bento Box for Card 3 (Clean, Non-Alarmist, Harmonious) */}
          <View style={[styles.bentoRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {activeDistView.bentoCol1Label}
              </Text>
              <Text
                style={[
                  styles.bentoVal,
                  { color: activeDistView.bentoCol1Color },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {activeDistView.bentoCol1Val}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {activeDistView.bentoCol2Label}
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.foreground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {activeDistView.bentoCol2Val}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {activeDistView.bentoCol3Label}
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.foreground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {activeDistView.bentoCol3Val}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginBottom: 16,
  },
  grid: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  gridMobile: {
    flexDirection: "column",
    flexWrap: "nowrap",
    gap: 14,
    width: "100%",
    alignItems: "stretch",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    justifyContent: "flex-start",
  },
  cardDesktop: {
    flex: 1,
    minWidth: 300,
    overflow: "hidden",
  },
  cardMobile: {
    width: "100%",
    minWidth: "100%",
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  titleWithHelpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
  },
  helpIcon: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  cardSub: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 1,
  },
  linkText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
    flexShrink: 0,
  },
  tooltipBanner: {
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
  },
  tooltipText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
  tooltipSub: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
  },
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 46,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  statusStripText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
    flex: 1,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  trendText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  ringCenterWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 140,
    marginVertical: 2,
  },
  donutWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 140,
    marginVertical: 2,
  },
  flowBarSection: {
    gap: 5,
    marginVertical: 4,
    paddingHorizontal: 2,
  },
  flowBarTrack: {
    height: 6,
    borderRadius: 3,
    flexDirection: "row",
    overflow: "hidden",
    gap: 2,
  },
  flowBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  flowBarLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
    marginTop: 4,
  },
  flowLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  flowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  flowLegendText: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.2,
  },
  deptOptionsContainer: {
    gap: 6,
    marginVertical: 4,
  },
  deptOptionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  deptOptionsLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  resetDeptText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  deptChipsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  deptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  deptChipText: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },
  deptChipBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  deptChipBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  deptIndicatorBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: "auto",
  },
  deptIndicatorText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  deptSubMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
  },
  deptSubMetaText: {
    fontSize: 10.5,
    flex: 1,
    minWidth: 170,
  },
  uncappedNotice: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    marginVertical: 4,
  },
  uncappedNoticeText: {
    fontSize: 10.5,
    fontFamily: "Inter_500Medium",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
  },
  bentoRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    marginTop: "auto",
  },
  bentoCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    gap: 2,
    minWidth: 0,
  },
  bentoDivider: {
    width: 1,
    height: "75%",
  },
  bentoLabel: {
    fontSize: 8.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
    textAlign: "center",
  },
  bentoVal: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  categoryRankedScroll: {
    maxHeight: 125,
    marginVertical: 2,
  },
  categoryRankedList: {
    gap: 5,
    paddingVertical: 1,
  },
  dimensionToggleRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 4,
  },
  dimensionTab: {
    paddingHorizontal: 12,
    paddingVertical: 5.5,
    borderRadius: 20,
    borderWidth: 1,
  },
  dimensionTabText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  deptFilterSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 4,
    paddingHorizontal: 2,
  },
  deptFilterLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    flexShrink: 0,
  },
  deptFilterScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  rankedDistItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  rankedDistTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rankedDistName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },
  distCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  distCountText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  rankedDistAmount: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  distPctBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  distPctText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  distBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  distBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  distSubCatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 3,
  },
  distSubCatChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  distSubCatText: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
  },
  emptyDeptCatBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
  },
  emptyDeptCatText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  deptDrillDownBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  deptFilterChip: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 14,
    borderWidth: 1,
  },
  deptFilterChipText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  inspectorCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginVertical: 2,
  },
  inspectorTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  inspectorSub: {
    fontSize: 10.5,
    fontFamily: "Inter_500Medium",
  },
  inspectLinkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  inspectLinkText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  inspectCloseBtn: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  distItemCard: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    gap: 5,
  },
  distItemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  itemCountText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  itemPctBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  itemPctBadgeText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
  },
  distItemBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 3,
    paddingTop: 1,
  },
  distItemSubtext: {
    fontSize: 10.5,
    fontFamily: "Inter_500Medium",
    flex: 1,
    minWidth: 160,
    lineHeight: 14.5,
  },
  distItemLink: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    flexShrink: 0,
    alignSelf: "center",
  },
  clearFilterChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: "auto",
  },
  clearFilterText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  rankedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  rankedLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  catColorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  rankedCatName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  rankedRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  rankedAmount: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  rankedPct: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
    minWidth: 38,
    textAlign: "right",
  },
  expandRow: {
    alignItems: "center",
    paddingVertical: 4,
  },
  expandText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  shareBarsWrap: {
    gap: 6,
    marginVertical: 4,
  },
  shareBarRow: {
    gap: 3,
  },
  shareBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shareBarName: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    minWidth: 0,
  },
  shareBarPct: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    flexShrink: 0,
  },
  shareBarTrack: {
    height: 5,
    borderRadius: 2.5,
    overflow: "hidden",
  },
  shareBarFill: {
    height: "100%",
    borderRadius: 2.5,
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
