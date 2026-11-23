import React, { useState, useMemo } from "react";
import {
  Animated,
  Easing,
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
import Svg, { Circle, G } from "react-native-svg";
import {
  SvgTarget,
  SvgTrendingUp,
  SvgPieChart,
  SvgArrowUpRight,
  SvgArrowDownRight,
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

  const [selectedDistributionItem, setSelectedDistributionItem] = useState<string | null>(null);

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

  const tap = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const hasCap = activeBudgetView.isValid && activeBudgetView.totalAllocated > 0;
  const usedPct = Math.max(0, activeBudgetView.rawUtilizationPct || 0);

  // ── Margin view ──
  const rev = Number(margin.operatingRevenue) || 0;
  const exp = Number(margin.operatingExpenses) || 0;
  const flowTotal = rev + exp;
  const incomeShare = flowTotal > 0 ? (rev / flowTotal) * 100 : 0;
  const marginColor = !margin.hasRevenue && exp <= 0
    ? colors.mutedForeground
    : margin.isLoss || !margin.hasRevenue
    ? colors.expense
    : colors.income;
  const marginRingPct = margin.hasRevenue
    ? Math.min(100, Math.abs(margin.rawMarginPct || 0))
    : exp > 0
    ? 100
    : 0;
  const coverage = exp > 0 ? rev / exp : null;

  // ── Spending view ──
  const selectedDept = activeDistView.selectedData;
  const selectedMetric = selectedDistributionItem
    ? effectiveDeptMetrics.find(
        (dm) =>
          dm.name.toLowerCase() === selectedDistributionItem.toLowerCase() ||
          dm.id.toLowerCase() === selectedDistributionItem.toLowerCase()
      ) || null
    : null;
  const selectedCats = selectedMetric
    ? (selectedMetric.categories && selectedMetric.categories.length > 0
        ? selectedMetric.categories
        : deptToCategoriesMap[selectedMetric.name.toLowerCase()]?.categories || []
      ).slice(0, 2)
    : [];
  const legendRows = [
    ...deptDistribution.departments,
    ...effectiveDeptMetrics
      .filter((dm) => !deptDistribution.departments.some((d) => d.id === dm.id))
      .map((dm) => ({ id: dm.id, name: dm.name, amount: 0, pct: 0, displayPct: "0%", color: colors.mutedForeground })),
  ];

  const selectDistDept = (name: string | null) => {
    tap();
    setSelectedDistributionItem(
      !name || selectedDistributionItem?.toLowerCase() === name.toLowerCase() ? null : name
    );
  };

  const spendPill = selectedMetric
    ? selectedCats.length > 0
      ? `${selectedMetric.name}: ${selectedCats
          .map((c: any) => `${c.category || c.name} ${Number(c.pct || 0).toFixed(0)}%`)
          .join(" · ")}`
      : `${selectedMetric.name}: no spending yet`
    : activeDistView.topItem
    ? `Top spender: ${activeDistView.topItem.name} (${Number(deptDistribution.topDept?.pct || 0).toFixed(0)}%)`
    : "No spending yet";

  const cardStyle = [
    styles.card,
    { backgroundColor: colors.card, borderColor: colors.border },
    isMobile ? styles.cardMobile : styles.cardDesktop,
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.grid, isMobile && styles.gridMobile]}>
        {/* ════════ CARD 1 · BUDGET ════════ */}
        <View style={cardStyle}>
          <CardHeader
            icon={<SvgTarget size={18} color={colors.primary} />}
            tint={colors.primary}
            title="Budget"
            subtitle={activeBudgetView.isDept ? activeBudgetView.name : "All departments"}
            action="Details"
            onAction={() => {
              tap();
              onOpenDrillDown("budget", selectedDeptId !== "ALL" ? activeBudgetView.name : undefined);
            }}
          />

          <View style={styles.hero}>
            <MetricRing
              segments={[{ key: "used", value: hasCap ? Math.min(100, usedPct) : 0, color: activeBudgetView.statusColor }]}
              total={100}
              value={hasCap ? `${usedPct.toFixed(0)}%` : "—"}
              valueColor={activeBudgetView.statusColor}
              label="Budget used"
            />
          </View>

          <StatusPill color={activeBudgetView.statusColor} text={`${activeBudgetView.statusLabel} · ${activeBudgetView.remainingText}`} />

          <View style={styles.middle}>
            <SectionRow
              label="Departments"
              action={activeBudgetView.isDept && onOpenDepartmentStaff ? "View staff" : undefined}
              onAction={() => {
                const matched = effectiveDepts.find(
                  (d: any) =>
                    d.id === activeBudgetView.deptId ||
                    d.name.trim().toLowerCase() === activeBudgetView.name.trim().toLowerCase()
                );
                onOpenDepartmentStaff?.(matched || { id: activeBudgetView.deptId || activeBudgetView.name, name: activeBudgetView.name });
              }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
              {deptOptions.map((dept) => {
                const isSel = selectedDeptId === dept.id;
                return (
                  <TouchableOpacity
                    key={dept.id}
                    onPress={() => {
                      tap();
                      setSelectedDeptId(dept.id);
                    }}
                    activeOpacity={0.75}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSel ? colors.primary : colors.card,
                        borderColor: isSel ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: isSel ? "#FFFFFF" : colors.foreground }]} numberOfLines={1}>
                      {dept.id === "ALL" ? "All" : dept.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <ProgressLine
              left={hasCap ? `${formatCompactCurrency(activeBudgetView.actualSpending, currency)} of ${formatCompactCurrency(activeBudgetView.totalAllocated, currency)}` : "No budget cap set"}
              right={hasCap ? `${usedPct.toFixed(0)}%` : ""}
              pct={hasCap ? Math.min(100, usedPct) : 0}
              color={activeBudgetView.statusColor}
            />
          </View>

          <StatRow
            items={[
              { label: "Spent", value: formatCompactCurrency(activeBudgetView.actualSpending, currency), color: colors.foreground },
              { label: "Budget", value: hasCap ? formatCompactCurrency(activeBudgetView.totalAllocated, currency) : "Not set", color: colors.foreground },
              activeBudgetView.isOverBudget
                ? { label: "Over", value: formatCompactCurrency(activeBudgetView.excessAmount, currency), color: colors.expense }
                : { label: "Left", value: hasCap ? formatCompactCurrency(activeBudgetView.remainingAmount, currency) : "—", color: colors.income },
            ]}
          />
        </View>

        {/* ════════ CARD 2 · NET MARGIN ════════ */}
        <View style={cardStyle}>
          <CardHeader
            icon={<SvgTrendingUp size={18} color={marginColor} />}
            tint={marginColor}
            title="Net Margin"
            subtitle="Income vs expenses"
            action="Details"
            onAction={() => {
              tap();
              onOpenDrillDown("nob");
            }}
          />

          <View style={styles.hero}>
            <MetricRing
              segments={[{ key: "margin", value: marginRingPct, color: marginColor }]}
              total={100}
              value={margin.hasRevenue ? margin.displayMargin : exp > 0 ? "-100%" : "0%"}
              valueColor={marginColor}
              label={margin.isLoss || !margin.hasRevenue ? "Loss margin" : "Profit margin"}
            />
          </View>

          <StatusPill
            color={marginColor}
            text={`${margin.statusLabel}${margin.marginChangeVsPrevious !== null && margin.marginChangeVsPrevious !== undefined ? ` · ${margin.trendDirection === "up" ? "▲" : "▼"} ${Math.abs(margin.marginChangeVsPrevious).toFixed(1)}% vs last period` : ""}`}
          />

          <View style={styles.middle}>
            <SectionRow
              label="Cash flow split"
              right={coverage !== null ? `Covers costs ${coverage.toFixed(1)}×` : undefined}
            />
            <View style={[styles.splitTrack, { backgroundColor: colors.muted }]}>
              {flowTotal > 0 && (
                <>
                  <View style={{ flex: Math.max(incomeShare, 2), backgroundColor: colors.income }} />
                  <View style={{ flex: Math.max(100 - incomeShare, 2), backgroundColor: colors.expense }} />
                </>
              )}
            </View>
            <View style={styles.splitLegend}>
              <Legend dot={colors.income} text={`Income ${incomeShare.toFixed(0)}%`} />
              <Legend dot={colors.expense} text={`Expenses ${flowTotal > 0 ? (100 - incomeShare).toFixed(0) : 0}%`} />
            </View>
            <ProgressLine
              left="Savings rate"
              right={rev > 0 ? `${(((rev - exp) / rev) * 100).toFixed(0)}%` : "—"}
              pct={rev > 0 ? Math.max(0, Math.min(100, ((rev - exp) / rev) * 100)) : 0}
              color={marginColor}
            />
          </View>

          <StatRow
            items={[
              { label: "Income", value: formatCompactCurrency(rev, currency), color: colors.income },
              { label: "Expenses", value: formatCompactCurrency(exp, currency), color: colors.expense },
              {
                label: margin.isLoss ? "Deficit" : "Net",
                value: `${margin.isLoss ? "-" : "+"}${formatCompactCurrency(Math.abs(margin.operatingIncome), currency)}`,
                color: margin.isLoss ? colors.expense : colors.income,
              },
            ]}
          />
        </View>

        {/* ════════ CARD 3 · SPENDING ════════ */}
        <View style={cardStyle}>
          <CardHeader
            icon={<SvgPieChart size={18} color={colors.info} />}
            tint={colors.info}
            title="Spending"
            subtitle={selectedMetric ? selectedMetric.name : "By department"}
            action="Outflows"
            onAction={() => {
              tap();
              onOpenDrillDown("expense", selectedDistributionItem || undefined);
            }}
          />

          <View style={styles.hero}>
            <MetricRing
              segments={activeDistView.chartSegments.map((seg) => ({ key: seg.label, value: seg.value, color: seg.color }))}
              total={activeDistView.totalExpenses}
              gap
              selectedKey={selectedDistributionItem}
              onSelect={(key) => selectDistDept(key)}
              value={formatCompactCurrency(selectedDept ? selectedDept.amount : activeDistView.totalExpenses, currency)}
              valueColor={selectedDept ? selectedDept.color : colors.foreground}
              label={selectedDept ? `${selectedDept.name} · ${Number(selectedDept.pct || 0).toFixed(0)}%` : "Total spent"}
            />
          </View>

          <StatusPill color={selectedDept ? selectedDept.color : colors.info} text={spendPill} />

          <View style={styles.middle}>
            <SectionRow
              label="Departments"
              action={selectedMetric ? "Clear" : undefined}
              onAction={() => selectDistDept(null)}
            />
            <View style={styles.legendList}>
              {legendRows.map((d) => {
                const isSel = selectedDistributionItem?.toLowerCase() === d.name.toLowerCase();
                const dim = !!selectedDistributionItem && !isSel;
                return (
                  <TouchableOpacity
                    key={d.id || d.name}
                    onPress={() => selectDistDept(d.name)}
                    activeOpacity={0.75}
                    style={[
                      styles.legendRow,
                      { backgroundColor: isSel ? colors.muted : "transparent", opacity: dim ? 0.5 : 1 },
                    ]}
                  >
                    <View style={[styles.dot, { backgroundColor: d.amount > 0 ? d.color : colors.border }]} />
                    <Text style={[styles.legendName, { color: colors.foreground }]} numberOfLines={2}>
                      {d.name}
                    </Text>
                    <Text style={[styles.legendAmt, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {formatCompactCurrency(d.amount, currency)}
                    </Text>
                    <Text style={[styles.legendPct, { color: colors.foreground }]} numberOfLines={1}>
                      {d.pct.toFixed(0)}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <StatRow
            items={
              selectedMetric
                ? [
                    { label: "Spent", value: formatCompactCurrency(selectedMetric.spent, currency), color: colors.foreground },
                    { label: "Budget", value: selectedMetric.allocated > 0 ? formatCompactCurrency(selectedMetric.allocated, currency) : "No cap", color: colors.foreground },
                    selectedMetric.allocated > 0 && selectedMetric.spent > selectedMetric.allocated
                      ? { label: "Over", value: formatCompactCurrency(selectedMetric.spent - selectedMetric.allocated, currency), color: colors.expense }
                      : { label: "Left", value: selectedMetric.allocated > 0 ? formatCompactCurrency(selectedMetric.remaining, currency) : "—", color: colors.income },
                  ]
                : [
                    { label: "Total", value: formatCompactCurrency(activeDistView.totalExpenses, currency), color: colors.foreground },
                    { label: "Departments", value: String(effectiveDeptMetrics.length), color: colors.foreground },
                    { label: "Spending", value: String(deptDistribution.departments.length), color: colors.foreground },
                  ]
            }
          />
        </View>
      </View>
    </View>
  );
}

/* ═══════════════════════════ Shared building blocks ═══════════════════════════ */

const RING_SIZE = 132;

/** Pick a font size so text fits on one line inside `width` (approx. 0.6em per glyph). */
function fitSize(text: string, max: number, width: number, min = 12) {
  const len = Math.max(1, (text || "").length);
  return Math.max(min, Math.min(max, Math.floor(width / (len * 0.6))));
}
const RING_STROKE = 8;

/** One ring used by every card: identical size, track, centre layout and fonts. */
function MetricRing({
  segments,
  total,
  value,
  valueColor,
  label,
  gap = false,
  selectedKey,
  onSelect,
}: {
  segments: { key: string; value: number; color: string }[];
  total: number;
  value: string;
  valueColor: string;
  label: string;
  gap?: boolean;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}) {
  const colors = useColors();
  const r = (RING_SIZE - RING_STROKE - 6) / 2; // room for the thicker selected arc
  const c = 2 * Math.PI * r;
  const center = RING_SIZE / 2;
  const sum = total > 0 ? total : 0;
  const visible = segments.filter((s) => s.value > 0);
  const gapLen = gap && visible.length > 1 ? 3 : 0;

  // Target geometry for the current data
  let offset = 0;
  const target = visible.map((s) => {
    const len = sum > 0 ? Math.min(1, s.value / sum) * c : 0;
    const arc = { ...s, dash: Math.max(0, len - gapLen), start: offset };
    offset += len;
    return arc;
  });
  const signature = target.map((a) => `${a.key}:${a.dash.toFixed(2)}:${a.start.toFixed(2)}:${a.color}`).join("|");

  // Animate every arc from where it was to where it should be (grows in on first show)
  const fromRef = React.useRef<Record<string, { dash: number; start: number }>>({});
  const [arcs, setArcs] = useState(() => target.map((a) => ({ ...a, dash: 0 })));
  React.useEffect(() => {
    const from = { ...fromRef.current };
    const reduce =
      Platform.OS === "web" && typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setArcs(target);
      fromRef.current = Object.fromEntries(target.map((a) => [a.key, { dash: a.dash, start: a.start }]));
      return;
    }
    const DURATION = 650;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / DURATION);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      const frame = target.map((a) => {
        const f = from[a.key] || { dash: 0, start: a.start };
        return { ...a, dash: f.dash + (a.dash - f.dash) * e, start: f.start + (a.start - f.start) * e };
      });
      fromRef.current = Object.fromEntries(frame.map((a) => [a.key, { dash: a.dash, start: a.start }]));
      setArcs(frame);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Centre text fades/slides in whenever the shown value changes
  const fade = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
  }, [value, label, fade]);

  const rotate = Platform.OS === "web"
    ? ({ transform: `rotate(-90 ${center} ${center})` } as any)
    : ({ rotation: -90, origin: `${center}, ${center}` } as any);

  const inner = RING_SIZE - RING_STROKE * 2 - 16;
  const single = arcs.length === 1;

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={center} cy={center} r={r} fill="none" stroke={colors.muted} strokeWidth={RING_STROKE} />
        <G {...rotate}>
          {arcs.map((a) => {
            const isSel = !!selectedKey && selectedKey.toLowerCase() === a.key.toLowerCase();
            const dim = !!selectedKey && !isSel;
            const press = onSelect
              ? { [Platform.OS === "web" ? "onClick" : "onPress"]: () => onSelect(a.key) }
              : {};
            return (
              <Circle
                key={a.key}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={a.color}
                strokeOpacity={dim ? 0.25 : 1}
                strokeWidth={isSel ? RING_STROKE + 3 : RING_STROKE}
                strokeDasharray={`${Math.max(0, a.dash)} ${c}`}
                strokeDashoffset={-a.start}
                strokeLinecap={single && a.dash < c - 1 ? "round" : "butt"}
                {...(press as any)}
                {...(Platform.OS === "web"
                  ? ({ style: { cursor: onSelect ? "pointer" : "default", transition: "stroke-width 220ms ease, stroke-opacity 220ms ease" } } as any)
                  : {})}
              />
            );
          })}
        </G>
      </Svg>
      <Animated.View
        style={[
          styles.ringCenter,
          { width: inner, left: (RING_SIZE - inner) / 2, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] },
        ]}
        pointerEvents="none"
      >
        <Text style={[styles.ringValue, { color: valueColor, fontSize: fitSize(value, 19, inner) }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={[styles.ringLabel, { color: colors.mutedForeground, fontSize: fitSize(label, 12, inner, 10) }]} numberOfLines={2}>
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

function CardHeader({
  icon,
  tint,
  title,
  subtitle,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  subtitle: string;
  action: string;
  onAction: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={[styles.iconBadge, { backgroundColor: tint + "16" }]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onAction}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.actionBtn, { borderColor: colors.border }]}
      >
        <Text style={[styles.actionText, { color: colors.primary }]} numberOfLines={1}>
          {action}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function StatusPill({ color, text }: { color: string; text: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + "12" }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

function SectionRow({
  label,
  right,
  action,
  onAction,
}: {
  label: string;
  right?: string;
  action?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
      {action ? (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={[styles.sectionAction, { color: colors.primary }]} numberOfLines={1}>
            {action} →
          </Text>
        </TouchableOpacity>
      ) : right ? (
        <Text style={[styles.sectionRight, { color: colors.foreground }]} numberOfLines={1}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

function ProgressLine({ left, right, pct, color }: { left: string; right: string; pct: number; color: string }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.sectionRow}>
        <Text style={[styles.progressText, { color: colors.foreground }]} numberOfLines={2}>
          {left}
        </Text>
        <Text style={[styles.progressText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
          {right}
        </Text>
      </View>
      <View style={[styles.thinTrack, { backgroundColor: colors.muted }]}>
        <View style={{ width: `${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct))}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

function Legend({ dot, text }: { dot: string; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.legendText, { color: colors.mutedForeground }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function StatRow({ items }: { items: { label: string; value: string; color: string }[] }) {
  const colors = useColors();
  return (
    <View style={[styles.statRow, { borderTopColor: colors.border }]}>
      {items.map((it, i) => (
        <View key={it.label} style={[styles.statCol, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
            {it.label}
          </Text>
          <Text style={[styles.statValue, { color: it.color, fontSize: it.value.length > 12 ? 13 : it.value.length > 9 ? 14 : 15 }]} numberOfLines={1}>
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* Fixed section heights keep all three cards identical and stop them resizing when a filter is tapped. */
const styles = StyleSheet.create({
  container: { width: "100%", marginBottom: 16 },
  grid: { flexDirection: "row", gap: 16, flexWrap: "wrap", alignItems: "stretch" },
  gridMobile: { flexDirection: "column", flexWrap: "nowrap", gap: 14, width: "100%" },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 20,
    gap: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardDesktop: { flex: 1, minWidth: 300, flexBasis: 300 },
  cardMobile: { width: "100%" },

  header: { flexDirection: "row", alignItems: "center", gap: 12, height: 40 },
  iconBadge: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  subtitle: { fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 17 },
  actionBtn: { paddingHorizontal: 12, height: 30, justifyContent: "center", borderRadius: 6, borderWidth: 1 },
  actionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  hero: { height: RING_SIZE + 8, alignItems: "center", justifyContent: "center" },
  ringCenter: { position: "absolute", top: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 2 },
  ringValue: { fontSize: 19, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3, lineHeight: 24, textAlign: "center" },
  ringLabel: { fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 16, textAlign: "center" },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pillText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium" },
  dot: { width: 8, height: 8, borderRadius: 4 },

  middle: { minHeight: 132, gap: 12, flexGrow: 1 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, height: 18 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2, flexShrink: 1 },
  sectionAction: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  sectionRight: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
  progressText: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 1 },
  thinTrack: { height: 6, borderRadius: 3, overflow: "hidden" },

  chips: { gap: 8, alignItems: "center" },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, justifyContent: "center" },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  splitTrack: { height: 10, borderRadius: 5, flexDirection: "row", overflow: "hidden", gap: 2 },
  splitLegend: { flexDirection: "row", justifyContent: "space-between", height: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontSize: 12.5, fontFamily: "Inter_500Medium" },

  legendList: { gap: 2 },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 32,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  legendName: { flex: 1, fontSize: 13.5, fontFamily: "Inter_500Medium" },
  legendAmt: { minWidth: 80, textAlign: "right", fontSize: 13, fontFamily: "Inter_400Regular" },
  legendPct: { width: 44, textAlign: "right", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  statRow: { flexDirection: "row", borderTopWidth: 1, paddingTop: 14, minHeight: 66 },
  statCol: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 6, minWidth: 0 },
  statLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  statValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
});
