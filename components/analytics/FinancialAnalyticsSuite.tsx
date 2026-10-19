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

  // Web desktop-only insight blocks (native / narrow layouts are unchanged)
  const showDesktopInsights = Platform.OS === "web" && !isMobile && !isCompact;

  const topUtilizationDepts = useMemo(() => {
    return effectiveDeptMetrics
      .filter((d) => (d.allocated || 0) > 0 || (d.spent || 0) > 0)
      .map((d) => {
        const hasCap = (d.allocated || 0) > 0;
        const pct = hasCap && Number.isFinite(d.utilizationPct) ? Math.max(0, d.utilizationPct) : 0;
        const isOver = hasCap && d.spent > d.allocated;
        return {
          id: d.id,
          name: d.name,
          pct,
          barPct: hasCap ? Math.min(100, pct) : 100,
          label: hasCap ? `${pct.toFixed(0)}%` : "No cap",
          color: !hasCap ? colors.mutedForeground : isOver ? colors.expense : pct >= 80 ? colors.warning : colors.income,
        };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [effectiveDeptMetrics, colors]);

  const operatingRatios = useMemo(() => {
    const rev = Number(margin.operatingRevenue) || 0;
    const exp = Number(margin.operatingExpenses) || 0;
    const expenseRatio = rev > 0 ? (exp / rev) * 100 : null;
    const savingsRate = rev > 0 ? ((rev - exp) / rev) * 100 : null;
    const coverage = exp > 0 ? rev / exp : null;
    return [
      {
        label: "Expense ratio",
        value: expenseRatio === null ? "—" : `${expenseRatio.toFixed(0)}%`,
        color: expenseRatio !== null && expenseRatio > 100 ? colors.expense : colors.warning,
      },
      {
        label: "Savings rate",
        value: savingsRate === null ? "—" : `${savingsRate.toFixed(0)}%`,
        color: savingsRate !== null && savingsRate < 0 ? colors.expense : colors.income,
      },
      {
        label: "Cost coverage",
        value: coverage === null ? "—" : `${coverage.toFixed(2)}×`,
        color: coverage !== null && coverage < 1 ? colors.expense : colors.primary,
      },
    ];
  }, [margin.operatingRevenue, margin.operatingExpenses, colors]);

  const marginScale = useMemo(() => {
    const rev = Number(margin.operatingRevenue) || 0;
    const exp = Number(margin.operatingExpenses) || 0;
    if (rev <= 0) return null;
    const rate = ((rev - exp) / rev) * 100;
    const clamped = Math.max(-50, Math.min(100, rate));
    return {
      pos: ((clamped + 50) / 150) * 100,
      label: rate < 0 ? "Deficit" : rate < 20 ? "Thin margin" : "Healthy",
      color: rate < 0 ? colors.expense : rate < 20 ? colors.warning : colors.income,
    };
  }, [margin.operatingRevenue, margin.operatingExpenses, colors]);

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
                    numberOfLines={Platform.OS === "web" ? undefined : 1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
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
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
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
            <Text style={[styles.statusStripText, { color: activeBudgetView.statusColor }]}>
              {activeBudgetView.statusLabel} · {activeBudgetView.remainingText}
            </Text>
            {activeBudgetView.isDept && (
              <View style={[styles.deptIndicatorBadge, { backgroundColor: activeBudgetView.statusColor + "20" }]}>
                <Text style={[styles.deptIndicatorText, { color: activeBudgetView.statusColor }]}>
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
                  <Text style={[styles.flowLegendText, { color: colors.mutedForeground }]} numberOfLines={Platform.OS === "web" ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    Spent:{" "}
                    <Text style={{ color: colors.expense, fontFamily: "Inter_700Bold" }}>
                      {formatCompactCurrency(activeBudgetView.actualSpending, currency)} ({activeBudgetView.rawUtilizationPct.toFixed(0)}%)
                    </Text>
                  </Text>
                </View>
                <View style={[styles.flowLegendItem, { justifyContent: "flex-end" }]}>
                  <View style={[styles.flowDot, { backgroundColor: colors.income }]} />
                  <Text style={[styles.flowLegendText, { color: colors.mutedForeground, textAlign: "right" }]} numberOfLines={Platform.OS === "web" ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7}>
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
                  FILTER BY DEPARTMENT
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
                    numberOfLines={Platform.OS === "web" ? undefined : 1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Web desktop: top departments by utilisation (fills the card instead of empty space) */}
          {showDesktopInsights && topUtilizationDepts.length > 0 && (
            <View style={[styles.insightBlock, { borderColor: colors.border }]}>
              <Text style={[styles.insightTitle, { color: colors.mutedForeground }]}>TOP DEPARTMENTS BY USAGE</Text>
              {topUtilizationDepts.map((d) => (
                <View key={d.id} style={styles.insightRow}>
                  <View style={styles.insightRowHead}>
                    <Text style={[styles.insightName, { color: colors.foreground }]} numberOfLines={1}>
                      {d.name}
                    </Text>
                    <Text style={[styles.insightValue, { color: d.color }]}>{d.label}</Text>
                  </View>
                  <View style={[styles.insightTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.insightFill, { width: `${d.barPct}%`, backgroundColor: d.color }]} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* 3-Metric Structured Bento Box (Pinned to bottom) */}
          <View style={[styles.bentoRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                DISBURSED
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.expense }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatCompactCurrency(activeBudgetView.actualSpending, currency)}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                ALLOCATED
              </Text>
              <Text
                style={[styles.bentoVal, { color: activeBudgetView.isValid && activeBudgetView.totalAllocated > 0 ? colors.foreground : colors.mutedForeground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {activeBudgetView.isValid && activeBudgetView.totalAllocated > 0 ? formatCompactCurrency(activeBudgetView.totalAllocated, currency) : "Not Set"}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
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
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
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
                  <Text style={{ fontSize: 12, color: "#0EA5E9", fontFamily: "Inter_700Bold" }}>
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
                    numberOfLines={Platform.OS === "web" ? undefined : 1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
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
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
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
            <Text style={[styles.statusStripText, { color: margin.statusColor, flex: 1 }]}>
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
                    <Text style={[styles.flowLegendText, { color: colors.mutedForeground }]} numberOfLines={Platform.OS === "web" ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      Income:{" "}
                      <Text style={{ color: colors.income, fontFamily: "Inter_700Bold" }}>
                        +{formatCompactCurrency(rev, currency)} ({inflowPct.toFixed(0)}%)
                      </Text>
                    </Text>
                  </View>
                  <View style={[styles.flowLegendItem, { justifyContent: "flex-end" }]}>
                    <View style={[styles.flowDot, { backgroundColor: colors.expense }]} />
                    <Text style={[styles.flowLegendText, { color: colors.mutedForeground, textAlign: "right" }]} numberOfLines={Platform.OS === "web" ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7}>
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
                    numberOfLines={Platform.OS === "web" ? undefined : 1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Web desktop: key operating ratios */}
          {showDesktopInsights && (
            <View style={[styles.insightBlock, { borderColor: colors.border }]}>
              <Text style={[styles.insightTitle, { color: colors.mutedForeground }]}>KEY OPERATING RATIOS</Text>
              <View style={styles.ratioRow}>
                {operatingRatios.map((r) => (
                  <View key={r.label} style={[styles.ratioTile, { backgroundColor: r.color + "12", borderColor: r.color + "33" }]}>
                    <Text style={[styles.ratioValue, { color: r.color }]}>{r.value}</Text>
                    <Text style={[styles.ratioLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                  </View>
                ))}
              </View>

              {/* Margin health scale: -50% … +100%, marker at the current savings rate */}
              {marginScale && (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <View style={styles.insightRowHead}>
                    <Text style={[styles.insightTitle, { color: colors.mutedForeground }]}>MARGIN HEALTH</Text>
                    <Text style={[styles.insightValue, { color: marginScale.color }]}>{marginScale.label}</Text>
                  </View>
                  <View style={styles.scaleTrack}>
                    <View style={[styles.scaleZone, { flex: 50, backgroundColor: colors.expense + "55" }]} />
                    <View style={[styles.scaleZone, { flex: 20, backgroundColor: colors.warning + "66" }]} />
                    <View style={[styles.scaleZone, { flex: 80, backgroundColor: colors.income + "66" }]} />
                    <View style={[styles.scaleMarker, { left: `${marginScale.pos}%`, borderColor: marginScale.color, backgroundColor: colors.foreground }]} />
                  </View>
                  <View style={styles.insightRowHead}>
                    <Text style={[styles.scaleTick, { color: colors.mutedForeground }]}>Deficit</Text>
                    <Text style={[styles.scaleTick, { color: colors.mutedForeground }]}>Break-even</Text>
                    <Text style={[styles.scaleTick, { color: colors.mutedForeground }]}>Healthy 20%+</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* 3-Metric Structured Bento Box (Pinned to bottom) */}
          <View style={[styles.bentoRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                INCOME
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.income }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                +{formatCompactCurrency(margin.operatingRevenue, currency)}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                EXPENSES
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.expense }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                -{formatCompactCurrency(margin.operatingExpenses, currency)}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {margin.isLoss ? "NET DEFICIT" : "NET SURPLUS"}
              </Text>
              <Text
                style={[
                  styles.bentoVal,
                  { color: margin.isLoss ? colors.expense : colors.income },
                ]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
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
                    numberOfLines={Platform.OS === "web" ? undefined : 1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
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
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
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
            <Text style={[styles.statusStripText, { color: activeDistView.isDept ? "#3B82F6" : "#8B5CF6" }]}>
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

          {/* Department Breakdown Cards */}
          <ScrollView
            style={styles.categoryRankedScroll}
            contentContainerStyle={styles.categoryRankedList}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {effectiveDeptMetrics.length === 0 ? (
              <View style={[styles.emptyDeptCatBox, { borderColor: colors.border }]}>
                <Text style={[styles.emptyDeptCatText, { color: colors.mutedForeground }]}>
                  No departments configured in the organization yet.
                </Text>
              </View>
            ) : (
              (selectedDistributionItem
                ? effectiveDeptMetrics.filter(
                    (dm) =>
                      dm.name.toLowerCase() === selectedDistributionItem.toLowerCase() ||
                      dm.id.toLowerCase() === selectedDistributionItem.toLowerCase()
                  )
                : effectiveDeptMetrics
              ).map((dm) => {
                const isSelected =
                  selectedDistributionItem?.toLowerCase() === dm.name.toLowerCase() ||
                  selectedDistributionItem?.toLowerCase() === dm.id.toLowerCase();
                const isExpanded =
                  isSelected ||
                  expandedDeptId === dm.id ||
                  (expandedDeptId && expandedDeptId.toLowerCase() === dm.name.toLowerCase());
                const isOver = dm.allocated > 0 && dm.spent > dm.allocated;
                const isWarning = dm.utilizationPct >= 80 && !isOver;
                const usageColor =
                  dm.allocated <= 0
                    ? colors.mutedForeground
                    : isOver
                    ? colors.expense
                    : isWarning
                    ? colors.warning
                    : "#10B981";

                const catItems =
                  dm.categories && dm.categories.length > 0
                    ? dm.categories
                    : deptToCategoriesMap[dm.name.toLowerCase()]?.categories || [];

                const catPalette = [
                  "#3B82F6",
                  "#8B5CF6",
                  "#06B6D4",
                  "#F59E0B",
                  "#EC4899",
                  "#10B981",
                  "#6366F1",
                ];

                return (
                  <TouchableOpacity
                    key={dm.id || dm.name}
                    style={[
                      styles.deptBreakdownCard,
                      {
                        backgroundColor: isExpanded ? colors.card : (colors.cardAlt ?? colors.muted) + "18",
                        borderColor: isExpanded ? colors.primary : colors.border,
                        borderWidth: isExpanded ? 1.5 : 1,
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
                    activeOpacity={0.8}
                  >
                    {/* Department Header: 🏢 IT Department [▼ / ▲] */}
                    <View style={styles.deptCardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                        <Text style={styles.deptIcon}>🏢</Text>
                        <Text
                          style={[styles.deptCardTitle, { color: colors.foreground }]}
                          numberOfLines={Platform.OS === "web" ? undefined : 1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {dm.name} Department
                        </Text>
                      </View>
                      <View style={{ transform: [{ rotate: isExpanded ? "180deg" : "0deg" }] }}>
                        <SvgChevronDown size={16} color={colors.mutedForeground} />
                      </View>
                    </View>

                    {/* 3-Column Metric Box: Budget | Used | Remaining */}
                    <View style={[styles.deptKpiRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={styles.deptKpiCol}>
                        <Text style={[styles.deptKpiLabel, { color: colors.mutedForeground }]}>Budget</Text>
                        <Text
                          style={[styles.deptKpiVal, { color: colors.foreground }]}
                          numberOfLines={Platform.OS === "web" ? undefined : 1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {dm.allocated > 0 ? formatCompactCurrency(dm.allocated, currency) : "No Cap"}
                        </Text>
                      </View>
                      <View style={[styles.deptKpiDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.deptKpiCol}>
                        <Text style={[styles.deptKpiLabel, { color: colors.mutedForeground }]}>Used</Text>
                        <Text
                          style={[
                            styles.deptKpiVal,
                            { color: isOver ? colors.expense : "#F59E0B" },
                          ]}
                          numberOfLines={Platform.OS === "web" ? undefined : 1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {formatCompactCurrency(dm.spent, currency)}
                        </Text>
                      </View>
                      <View style={[styles.deptKpiDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.deptKpiCol}>
                        <Text style={[styles.deptKpiLabel, { color: colors.mutedForeground }]}>Remaining</Text>
                        <Text
                          style={[
                            styles.deptKpiVal,
                            {
                              color: isOver
                                ? colors.expense
                                : dm.remaining > 0
                                ? colors.income
                                : colors.mutedForeground,
                            },
                          ]}
                          numberOfLines={Platform.OS === "web" ? undefined : 1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {dm.allocated > 0 ? formatCompactCurrency(dm.remaining, currency) : "Uncapped"}
                        </Text>
                      </View>
                    </View>

                    {/* Budget Usage Progress Bar */}
                    <View style={styles.deptUsageRow}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <Text style={[styles.deptUsageLabel, { color: colors.mutedForeground }]}>Budget Usage</Text>
                        <Text
                          style={[
                            styles.deptUsagePct,
                            { color: usageColor },
                          ]}
                        >
                          {dm.allocated > 0 ? `${dm.utilizationPct.toFixed(0)}% Used` : "Uncapped"}
                        </Text>
                      </View>
                      <View style={[styles.deptProgressTrack, { backgroundColor: colors.border }]}>
                        <View
                          style={[
                            styles.deptProgressFill,
                            {
                              width: `${Math.min(100, Math.max(2, dm.utilizationPct))}%`,
                              backgroundColor: usageColor,
                            },
                          ]}
                        />
                      </View>
                    </View>

                    {/* Collapsed Hint */}
                    {!isExpanded && (
                      <View style={styles.deptTapHint}>
                        <Text style={[styles.deptTapHintText, { color: colors.primary }]}>
                          Tap to View Breakdown ▼
                        </Text>
                      </View>
                    )}

                    {/* Expanded Details: Financial Overview & Expense Breakdown */}
                    {isExpanded && (
                      <View style={styles.deptExpandedContent}>
                        {/* Financial Overview Subcard */}
                        <View style={[styles.expandedSectionBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Text style={[styles.expandedSectionHeading, { color: colors.mutedForeground }]}>
                            FINANCIAL OVERVIEW
                          </Text>

                          <View style={styles.overviewLine}>
                            <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Total Budget:</Text>
                            <Text style={[styles.overviewValue, { color: colors.foreground }]}>
                              {dm.allocated > 0 ? `${currency} ${dm.allocated.toLocaleString()}` : "No Cap Set"}
                            </Text>
                          </View>

                          <View style={styles.overviewLine}>
                            <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Total Used:</Text>
                            <Text style={[styles.overviewValue, { color: isOver ? colors.expense : "#F59E0B" }]}>
                              {currency} {dm.spent.toLocaleString()}
                            </Text>
                          </View>

                          <View style={styles.overviewLine}>
                            <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Remaining Budget:</Text>
                            <Text style={[styles.overviewValue, { color: isOver ? colors.expense : dm.remaining > 0 ? colors.income : colors.mutedForeground }]}>
                              {dm.allocated > 0 ? `${currency} ${dm.remaining.toLocaleString()}` : "Uncapped"}
                            </Text>
                          </View>

                          <View style={styles.overviewLine}>
                            <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Budget Usage:</Text>
                            <Text style={[styles.overviewValue, { color: usageColor }]}>
                              {dm.allocated > 0 ? `${dm.utilizationPct.toFixed(1)}%` : "0.0%"}
                            </Text>
                          </View>

                          {dm.allocated > 0 && (
                            <View style={[styles.deptProgressTrack, { backgroundColor: colors.border, marginTop: 6 }]}>
                              <View
                                style={[
                                  styles.deptProgressFill,
                                  {
                                    width: `${Math.min(100, Math.max(2, dm.utilizationPct))}%`,
                                    backgroundColor: usageColor,
                                  },
                                ]}
                              />
                            </View>
                          )}
                        </View>

                        {/* Divider */}
                        <View style={[styles.expandedDivider, { backgroundColor: colors.border }]} />

                        {/* Expense Breakdown Subcard */}
                        <View style={styles.catBreakdownSection}>
                          <Text style={[styles.expandedSectionHeading, { color: colors.mutedForeground, marginBottom: 6 }]}>
                            EXPENSE BREAKDOWN
                          </Text>

                          {catItems.length === 0 ? (
                            <View style={[styles.emptyDeptCatBox, { borderColor: colors.border }]}>
                              <Text style={[styles.emptyDeptCatText, { color: colors.mutedForeground }]}>
                                No expense disbursements recorded for this department yet.
                              </Text>
                            </View>
                          ) : (
                            catItems.map((c: any, cIdx: number) => {
                              const catColor = catPalette[cIdx % catPalette.length];
                              const catName = c.category || c.name;
                              const catAmt = Number(c.amount || 0);
                              const catPct = Number(c.pct || 0);

                              return (
                                <View key={catName} style={styles.deptCatItem}>
                                  <View style={styles.deptCatHeader}>
                                    <Text
                                      style={[styles.deptCatName, { color: colors.foreground }]}
                                      numberOfLines={Platform.OS === "web" ? undefined : 1}
                                      adjustsFontSizeToFit
                                      minimumFontScale={0.7}
                                    >
                                      {catName}
                                    </Text>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                      <Text style={[styles.deptCatAmt, { color: colors.foreground }]}>
                                        {currency} {catAmt.toLocaleString()}
                                      </Text>
                                      <Text style={[styles.deptCatPct, { color: catColor }]}>
                                        {catPct.toFixed(0)}%
                                      </Text>
                                    </View>
                                  </View>

                                  <View style={[styles.deptCatTrack, { backgroundColor: colors.border }]}>
                                    <View
                                      style={[
                                        styles.deptCatFill,
                                        {
                                          width: `${Math.max(3, Math.min(100, catPct))}%`,
                                          backgroundColor: catColor,
                                        },
                                      ]}
                                    />
                                  </View>
                                </View>
                              );
                            })
                          )}
                        </View>

                        {/* Action Button: View Outflows */}
                        <TouchableOpacity
                          style={[styles.deptDrillDownBtn, { borderColor: colors.border }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            onOpenDrillDown("expense", dm.name);
                          }}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.deptDrillDownBtnText, { color: colors.primary }]}>
                            View All {dm.name} Outflows →
                          </Text>
                        </TouchableOpacity>
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
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {activeDistView.bentoCol1Label}
              </Text>
              <Text
                style={[
                  styles.bentoVal,
                  { color: activeDistView.bentoCol1Color },
                ]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {activeDistView.bentoCol1Val}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {activeDistView.bentoCol2Label}
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.foreground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {activeDistView.bentoCol2Val}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text
                style={[styles.bentoLabel, { color: colors.mutedForeground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {activeDistView.bentoCol3Label}
              </Text>
              <Text
                style={[styles.bentoVal, { color: colors.foreground }]}
                numberOfLines={Platform.OS === "web" ? undefined : 1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
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
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    justifyContent: "flex-start",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardDesktop: {
    flex: 1,
    minWidth: 300,
    overflow: "hidden",
  },
  cardMobile: {
    width: "100%",
    minWidth: "100%",
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    minHeight: 40,
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
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  cardSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  linkText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 0,
  },
  tooltipBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  tooltipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  tooltipSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 46,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusStripText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  trendText: {
    fontSize: 12,
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
    gap: 8,
    marginVertical: 2,
    paddingHorizontal: 2,
  },
  flowBarTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
    gap: 2,
  },
  flowBarFill: {
    height: "100%",
    borderRadius: 4,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  flowLegendText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  deptOptionsContainer: {
    gap: 10,
    marginVertical: 2,
  },
  deptOptionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  deptOptionsLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
  },
  resetDeptText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  deptChipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  deptChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  deptChipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  deptChipBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  deptChipBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  deptIndicatorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: "auto",
  },
  deptIndicatorText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  deptSubMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 12,
    marginTop: 2,
    borderTopWidth: 1,
  },
  deptSubMetaText: {
    fontSize: 12,
    flex: 1,
    minWidth: 170,
  },
  uncappedNotice: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    marginVertical: 4,
  },
  uncappedNoticeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 2,
  },
  chip: {
    flex: 1,
    maxWidth: 140,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  bentoRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginTop: "auto",
  },
  bentoCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    gap: 4,
    minWidth: 0,
  },
  bentoDivider: {
    width: 1,
    height: "75%",
  },
  bentoLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  bentoVal: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  categoryRankedScroll: {
    maxHeight: 250,
    marginVertical: 3,
  },
  insightBlock: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    paddingTop: 12,
    marginTop: 2,
    gap: 9,
  },
  insightTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  insightRow: {
    gap: 5,
  },
  insightRowHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  insightName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  insightValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  insightTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  insightFill: {
    height: "100%",
    borderRadius: 3,
  },
  ratioRow: {
    flexDirection: "row",
    gap: 8,
  },
  ratioTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 4,
  },
  ratioValue: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.3,
  },
  scaleTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "visible",
    position: "relative",
  },
  scaleZone: {
    height: "100%",
  },
  scaleMarker: {
    position: "absolute",
    top: -4,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    borderWidth: 3,
  },
  scaleTick: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  ratioLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  categoryRankedList: {
    gap: 8,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  dimensionTabText: {
    fontSize: 13,
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
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    flexShrink: 0,
  },
  deptFilterScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  deptBreakdownCard: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    gap: 10,
  },
  deptCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deptIcon: {
    fontSize: 14,
  },
  deptCardTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  deptKpiRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  deptKpiCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    gap: 3,
  },
  deptKpiDivider: {
    width: 1,
    height: "70%",
  },
  deptKpiLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
  deptKpiVal: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  deptUsageRow: {
    gap: 6,
  },
  deptUsageLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  deptUsagePct: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  deptProgressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  deptProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  deptTapHint: {
    alignItems: "center",
    paddingTop: 1,
  },
  deptTapHintText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  deptExpandedContent: {
    marginTop: 4,
    gap: 6,
  },
  expandedSectionBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  expandedSectionHeading: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  overviewLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  overviewLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  overviewValue: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  expandedDivider: {
    height: 1,
    marginVertical: 2,
  },
  catBreakdownSection: {
    gap: 5,
  },
  emptyDeptCatBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
  },
  emptyDeptCatText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  deptCatItem: {
    gap: 3,
    marginBottom: 3,
  },
  deptCatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deptCatName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
    minWidth: 0,
  },
  deptCatAmt: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  deptCatPct: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  deptCatTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  deptCatFill: {
    height: "100%",
    borderRadius: 3,
  },
  deptDrillDownBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    marginTop: 3,
  },
  deptDrillDownBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  deptFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  deptFilterChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  inspectorCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginVertical: 2,
  },
  inspectorTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  inspectorSub: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  inspectLinkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  inspectLinkText: {
    fontSize: 12,
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  distItemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  itemCountText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  itemPctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  itemPctBadgeText: {
    fontSize: 11,
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
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
    minWidth: 160,
    lineHeight: 17,
  },
  distItemLink: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    flexShrink: 0,
    alignSelf: "center",
  },
  clearFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: "auto",
  },
  clearFilterText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  rankedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  rankedCatName: {
    fontSize: 13,
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
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  rankedPct: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    minWidth: 38,
    textAlign: "right",
  },
  expandRow: {
    alignItems: "center",
    paddingVertical: 4,
  },
  expandText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  shareBarsWrap: {
    gap: 10,
    marginVertical: 4,
  },
  shareBarRow: {
    gap: 6,
  },
  shareBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shareBarName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    minWidth: 0,
  },
  shareBarPct: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    flexShrink: 0,
  },
  shareBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  shareBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
