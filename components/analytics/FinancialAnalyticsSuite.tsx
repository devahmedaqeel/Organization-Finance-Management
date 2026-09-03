import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
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
} from "@/components/web/SvgIcons";
import {
  ValidatedBudgetAnalytics,
  ValidatedOperatingMarginAnalytics,
  ValidatedExpenseDistributionAnalytics,
  formatCurrencySafe,
  formatCompactCurrency,
} from "@/services/FinancialCalculationEngine";

interface Props {
  budget: ValidatedBudgetAnalytics;
  margin: ValidatedOperatingMarginAnalytics;
  distribution: ValidatedExpenseDistributionAnalytics;
  currency?: string;
  onOpenDrillDown: (type: "budget" | "nob" | "expense") => void;
  isCompact?: boolean;
}

export function FinancialAnalyticsSuite({
  budget,
  margin,
  distribution,
  currency = "PKR",
  onOpenDrillDown,
  isCompact = false,
}: Props) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Active interaction mode states
  const [budgetMode, setBudgetMode] = useState<"used" | "spent" | "remaining">("used");
  const [marginMode, setMarginMode] = useState<"margin" | "outflow" | "net">("margin");
  const [distributionMode, setDistributionMode] = useState<"drivers" | "share" | "all">("drivers");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState<"budget" | "margin" | "distribution" | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Selected category data for interactive donut
  const activeCategoryData = useMemo(() => {
    if (!selectedCategory || !distribution.categories.length) return null;
    return distribution.categories.find((c) => c.category === selectedCategory) || null;
  }, [selectedCategory, distribution.categories]);

  // Donut chart segments formatted
  const donutSegments = useMemo(() => {
    return distribution.chartSegments.map((seg) => ({
      label: seg.category,
      value: seg.amount,
      color: seg.color,
      pct: seg.pct,
    }));
  }, [distribution.chartSegments]);

  return (
    <View style={styles.container}>
      {/* ─── 3 Column Responsive Section ─── */}
      <View style={[styles.grid, isMobile && styles.gridMobile]}>
        {/* ========================================================================= */}
        {/* CARD 1: BUDGET UTILIZATION CARD                                          */}
        {/* ========================================================================= */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, isMobile && styles.cardMobile]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconBadge, { backgroundColor: colors.primary + "16" }]}>
                <SvgTarget size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleWithHelpRow}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
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
                  {budget.isValid
                    ? `Cap: ${formatCompactCurrency(budget.totalAllocated, currency)}`
                    : "No Budget Cap Configured"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenDrillDown("budget");
              }}
              style={{ flexShrink: 0 }}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>View Details →</Text>
            </TouchableOpacity>
          </View>

          {/* Formula Tooltip Banner */}
          {showTooltip === "budget" && (
            <View style={[styles.tooltipBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
              <Text style={[styles.tooltipText, { color: colors.foreground }]}>
                📐 <Text style={{ fontFamily: "Inter_700Bold" }}>Formula:</Text> (Actual Spend ÷ Budget Cap) × 100
              </Text>
              <Text style={[styles.tooltipSub, { color: colors.mutedForeground }]}>{budget.explanation}</Text>
            </View>
          )}

          {/* Contextual Status Strip (Uniform 46px minHeight across all cards) */}
          <View style={[styles.statusStrip, { backgroundColor: budget.statusColor + "14", borderColor: budget.statusColor + "30" }]}>
            <View style={[styles.statusDot, { backgroundColor: budget.statusColor }]} />
            <Text style={[styles.statusStripText, { color: budget.statusColor }]} numberOfLines={2}>
              {budget.statusLabel} · {budget.remainingText}
            </Text>
          </View>

          {/* Visual Ring / Gauge */}
          <View style={styles.ringCenterWrap}>
            {(() => {
              const remRatio =
                budget.isValid && budget.totalAllocated > 0
                  ? Math.min(100, Math.max(0, (budget.remainingAmount / budget.totalAllocated) * 100))
                  : 0;

              const spentRatio =
                budget.isValid && budget.totalAllocated > 0
                  ? Math.min(100, Math.max(0, (budget.actualSpending / budget.totalAllocated) * 100))
                  : 0;

              const activePct =
                !budget.isValid
                  ? 0
                  : budgetMode === "remaining"
                  ? remRatio
                  : budgetMode === "spent"
                  ? spentRatio
                  : Math.min(100, Math.max(0, budget.rawUtilizationPct));

              const centerLabel =
                !budget.isValid
                  ? "0%"
                  : budgetMode === "spent"
                  ? formatCompactCurrency(budget.actualSpending, currency)
                  : budgetMode === "remaining"
                  ? formatCompactCurrency(budget.remainingAmount, currency)
                  : budget.displayPct;

              const label =
                budgetMode === "spent"
                  ? "Total Disbursed"
                  : budgetMode === "remaining"
                  ? "Available Buffer"
                  : "Budget Used";

              const sublabel =
                !budget.isValid
                  ? "NO CAP"
                  : budgetMode === "spent"
                  ? `${budget.rawUtilizationPct < 1 && budget.rawUtilizationPct > 0 ? budget.rawUtilizationPct.toFixed(1) : budget.rawUtilizationPct.toFixed(0)}% OF CAP`
                  : budgetMode === "remaining"
                  ? `${remRatio < 100 && remRatio > 99 ? remRatio.toFixed(1) : remRatio.toFixed(0)}% LEFT`
                  : budget.isOverBudget
                  ? `${formatCompactCurrency(budget.excessAmount, currency)} Over`
                  : `${formatCompactCurrency(budget.actualSpending, currency)} Spent`;

              return (
                <RingProgress
                  percentage={activePct}
                  size={142}
                  strokeWidth={12}
                  color={budgetMode === "remaining" ? colors.income : budget.statusColor}
                  centerLabel={centerLabel}
                  label={label}
                  sublabel={sublabel}
                />
              );
            })()}
          </View>

          {/* Dual-Track Visual Budget Allocation Bar */}
          {budget.isValid && budget.totalAllocated > 0 && (
            <View style={styles.flowBarSection}>
              <View style={[styles.flowBarTrack, { backgroundColor: (colors.cardAlt ?? colors.muted) + "50" }]}>
                {/* Spent Segment: Red / Expense */}
                <View
                  style={[
                    styles.flowBarFill,
                    {
                      width: `${Math.max(3, Math.min(97, budget.rawUtilizationPct))}%`,
                      backgroundColor: colors.expense,
                    },
                  ]}
                />
                {/* Remaining Segment: Green / Income */}
                <View
                  style={[
                    styles.flowBarFill,
                    {
                      width: `${Math.max(3, Math.min(97, Math.max(0, 100 - budget.rawUtilizationPct)))}%`,
                      backgroundColor: colors.income,
                    },
                  ]}
                />
              </View>
              <View style={styles.flowBarLegend}>
                <View style={styles.flowLegendItem}>
                  <View style={[styles.flowDot, { backgroundColor: colors.expense }]} />
                  <Text style={[styles.flowLegendText, { color: colors.mutedForeground }]} numberOfLines={1}>
                    Spent:{" "}
                    <Text style={{ color: colors.expense, fontFamily: "Inter_700Bold" }}>
                      {formatCompactCurrency(budget.actualSpending, currency)} ({budget.rawUtilizationPct.toFixed(0)}%)
                    </Text>
                  </Text>
                </View>
                <View style={[styles.flowLegendItem, { justifyContent: "flex-end" }]}>
                  <View style={[styles.flowDot, { backgroundColor: colors.income }]} />
                  <Text style={[styles.flowLegendText, { color: colors.mutedForeground, textAlign: "right" }]} numberOfLines={1}>
                    Left:{" "}
                    <Text style={{ color: colors.income, fontFamily: "Inter_700Bold" }}>
                      {formatCompactCurrency(budget.remainingAmount, currency)} ({Math.max(0, 100 - budget.rawUtilizationPct).toFixed(0)}%)
                    </Text>
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Segmented Option Controls */}
          <View style={styles.chipsRow}>
            {[
              { id: "used", label: "% Used" },
              { id: "spent", label: "Spent Amount" },
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
              <Text style={[styles.bentoLabel, { color: colors.mutedForeground }]}>DISBURSED</Text>
              <Text
                style={[styles.bentoVal, { color: colors.expense }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {formatCompactCurrency(budget.actualSpending, currency)}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text style={[styles.bentoLabel, { color: colors.mutedForeground }]}>ALLOCATED</Text>
              <Text
                style={[styles.bentoVal, { color: budget.isValid ? colors.foreground : colors.mutedForeground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {budget.isValid ? formatCompactCurrency(budget.totalAllocated, currency) : "Not Set"}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text style={[styles.bentoLabel, { color: colors.mutedForeground }]}>
                {budget.isOverBudget ? "OVER BUDGET" : "REMAINING"}
              </Text>
              <Text
                style={[
                  styles.bentoVal,
                  {
                    color: budget.isOverBudget
                      ? colors.expense
                      : budget.remainingAmount > 0
                      ? colors.income
                      : colors.mutedForeground,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {budget.isValid
                  ? budget.isOverBudget
                    ? `-${formatCompactCurrency(budget.excessAmount, currency)}`
                    : formatCompactCurrency(budget.remainingAmount, currency)
                  : "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* CARD 2: NET OPERATING MARGIN (NOM) CARD                                  */}
        {/* ========================================================================= */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, isMobile && styles.cardMobile]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconBadge, { backgroundColor: margin.statusColor + "16" }]}>
                <SvgTrendingUp size={18} color={margin.statusColor} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleWithHelpRow}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
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
              <Text style={[styles.linkText, { color: colors.primary }]}>View Details →</Text>
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
            <Text style={[styles.statusStripText, { color: margin.statusColor, flex: 1 }]} numberOfLines={2}>
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
              let label = margin.statusLabel;
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
                  size={142}
                  strokeWidth={12}
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
                    <Text style={[styles.flowLegendText, { color: colors.mutedForeground }]} numberOfLines={1}>
                      Income:{" "}
                      <Text style={{ color: colors.income, fontFamily: "Inter_700Bold" }}>
                        +{formatCompactCurrency(rev, currency)} ({inflowPct.toFixed(0)}%)
                      </Text>
                    </Text>
                  </View>
                  <View style={[styles.flowLegendItem, { justifyContent: "flex-end" }]}>
                    <View style={[styles.flowDot, { backgroundColor: colors.expense }]} />
                    <Text style={[styles.flowLegendText, { color: colors.mutedForeground, textAlign: "right" }]} numberOfLines={1}>
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
              { id: "outflow", label: "Expenses %" },
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
              <Text style={[styles.bentoLabel, { color: colors.mutedForeground }]}>INCOME</Text>
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
              <Text style={[styles.bentoLabel, { color: colors.mutedForeground }]}>EXPENSES</Text>
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
              <Text style={[styles.bentoLabel, { color: colors.mutedForeground }]}>
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
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, isMobile && styles.cardMobile]}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconBadge, { backgroundColor: "#8B5CF616" }]}>
                <SvgPieChart size={18} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleWithHelpRow}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
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
                  {distribution.categories.length} Cost Drivers Categorized
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenDrillDown("expense");
              }}
              style={{ flexShrink: 0 }}
            >
              <Text style={[styles.linkText, { color: colors.primary }]}>View Outflows →</Text>
            </TouchableOpacity>
          </View>

          {/* Formula Tooltip Banner */}
          {showTooltip === "distribution" && (
            <View style={[styles.tooltipBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
              <Text style={[styles.tooltipText, { color: colors.foreground }]}>
                📐 <Text style={{ fontFamily: "Inter_700Bold" }}>Formula:</Text> Category Expense ÷ Total Expenses × 100
              </Text>
              <Text style={[styles.tooltipSub, { color: colors.mutedForeground }]}>
                All displayed percentages derive from authoritative raw sums and total ~100%.
              </Text>
            </View>
          )}

          {/* Contextual Status Strip (Uniform 46px minHeight across all cards) */}
          <View style={[styles.statusStrip, { backgroundColor: "#8B5CF614", borderColor: "#8B5CF630" }]}>
            <View style={[styles.statusDot, { backgroundColor: "#8B5CF6" }]} />
            <Text style={[styles.statusStripText, { color: "#8B5CF6" }]} numberOfLines={2}>
              {distribution.explanation}
            </Text>
          </View>

          {/* Interactive Donut Chart */}
          {distribution.hasExpenses ? (
            <View style={styles.donutWrap}>
              <DonutChart
                segments={donutSegments}
                size={128}
                strokeWidth={11}
                centerLabel={
                  activeCategoryData
                    ? formatCompactCurrency(activeCategoryData.amount, currency)
                    : formatCompactCurrency(distribution.totalExpenses, currency)
                }
                centerSub={activeCategoryData ? activeCategoryData.category.toUpperCase() : "TOTAL SPENT"}
                currency={currency}
                showChips={false}
                showLegend={false}
                selectedLabel={selectedCategory}
                onSelectLabel={(cat) => setSelectedCategory(cat)}
              />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No expense disbursements recorded in this period.
              </Text>
            </View>
          )}

          {/* Segmented Option Controls for Card 3 */}
          <View style={styles.chipsRow}>
            {[
              { id: "drivers", label: "Top Drivers" },
              { id: "share", label: "% Share" },
              { id: "all", label: `All (${distribution.categories.length})` },
            ].map((opt) => {
              const isSelected = distributionMode === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? "#8B5CF6" : (colors.cardAlt ?? colors.muted) + "30",
                      borderColor: isSelected ? "#8B5CF6" : colors.border,
                    },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setDistributionMode(opt.id as any);
                    if (opt.id === "all") setShowAllCategories(true);
                    else setShowAllCategories(false);
                  }}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? "#FFFFFF" : colors.mutedForeground },
                      isSelected && { fontFamily: "Inter_700Bold" },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Proportional Share Bars Mode */}
          {distributionMode === "share" ? (
            <View style={styles.shareBarsWrap}>
              {(showAllCategories ? distribution.categories : distribution.categories.slice(0, 2)).map((cat) => (
                <View key={cat.category} style={styles.shareBarRow}>
                  <View style={styles.shareBarHeader}>
                    <Text style={[styles.shareBarName, { color: colors.foreground }]} numberOfLines={1}>
                      {cat.category}
                    </Text>
                    <Text style={[styles.shareBarPct, { color: cat.color }]}>
                      {cat.displayPct} ({formatCompactCurrency(cat.amount, currency)})
                    </Text>
                  </View>
                  <View style={[styles.shareBarTrack, { backgroundColor: (colors.cardAlt ?? colors.muted) + "50" }]}>
                    <View style={[styles.shareBarFill, { width: `${Math.max(3, Math.min(100, cat.pct))}%`, backgroundColor: cat.color }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            /* Ranked Category List with Zero-Overlap Layout */
            <View style={styles.categoryRankedList}>
              {(distributionMode === "all" || showAllCategories
                ? distribution.categories
                : distribution.categories.slice(0, 2)
              ).map((cat) => {
                const isSelected = selectedCategory?.trim().toLowerCase() === cat.category.trim().toLowerCase();
                const isAnySelected = selectedCategory !== null;

                return (
                  <TouchableOpacity
                    key={cat.category}
                    style={[
                      styles.rankedRow,
                      {
                        backgroundColor: isSelected ? cat.color + "16" : (colors.cardAlt ?? colors.muted) + "18",
                        borderColor: isSelected ? cat.color : colors.border,
                        borderWidth: isSelected ? 1.5 : 1,
                        opacity: isAnySelected ? (isSelected ? 1.0 : 0.6) : 1.0,
                      },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCategory(isSelected ? null : cat.category);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rankedLeft}>
                      <View
                        style={[
                          styles.catColorDot,
                          {
                            backgroundColor: cat.color,
                            transform: [{ scale: isSelected ? 1.35 : 1.0 }],
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.rankedCatName,
                          {
                            color: isSelected ? cat.color : colors.foreground,
                            fontFamily: isSelected ? "Inter_700Bold" : "Inter_600SemiBold",
                          },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {cat.category}
                      </Text>
                    </View>

                    <View style={styles.rankedRight}>
                      <Text
                        style={[
                          styles.rankedAmount,
                          {
                            color: colors.foreground,
                            fontFamily: isSelected ? "Inter_700Bold" : "Inter_600SemiBold",
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {formatCompactCurrency(cat.amount, currency)}
                      </Text>
                      <Text
                        style={[
                          styles.rankedPct,
                          {
                            color: isSelected ? cat.color : colors.mutedForeground,
                            fontFamily: isSelected ? "Inter_700Bold" : "Inter_600SemiBold",
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {cat.displayPct}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {distribution.categories.length > 2 && distributionMode !== "all" && !showAllCategories && (
                <TouchableOpacity
                  style={styles.expandRow}
                  onPress={() => {
                    setDistributionMode("all");
                    setShowAllCategories(true);
                  }}
                >
                  <Text style={[styles.expandText, { color: colors.primary }]}>
                    +{distribution.categories.length - 2} More Cost Drivers ▼
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Authoritative 3-Metric Bento Box for Card 3 (Completes Symmetry Across All Cards) */}
          <View style={[styles.bentoRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.bentoCol}>
              <Text style={[styles.bentoLabel, { color: colors.mutedForeground }]}>TOP DRIVER</Text>
              <Text
                style={[
                  styles.bentoVal,
                  { color: distribution.topCategory?.color || "#8B5CF6" },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {distribution.topCategory?.category || "None"}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text style={[styles.bentoLabel, { color: colors.mutedForeground }]}>TOTAL SPENT</Text>
              <Text
                style={[styles.bentoVal, { color: colors.expense }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                -{formatCompactCurrency(distribution.totalExpenses, currency)}
              </Text>
            </View>
            <View style={[styles.bentoDivider, { backgroundColor: colors.border }]} />
            <View style={styles.bentoCol}>
              <Text style={[styles.bentoLabel, { color: colors.mutedForeground }]}>COST CENTERS</Text>
              <Text
                style={[styles.bentoVal, { color: colors.foreground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {distribution.categories.length} Active
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
  },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    justifyContent: "flex-start",
    overflow: "hidden",
    minWidth: 300,
  },
  cardMobile: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
    minWidth: "100%",
    padding: 16,
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
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 1,
  },
  linkText: {
    fontSize: 12,
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
    minHeight: 150,
    marginVertical: 4,
  },
  donutWrap: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 150,
    marginVertical: 4,
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
    flexShrink: 0,
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
  chipsRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 4,
  },
  chip: {
    paddingHorizontal: 9,
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
    paddingHorizontal: 6,
    marginTop: 10,
  },
  bentoCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    letterSpacing: 0.4,
    textAlign: "center",
  },
  bentoVal: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  categoryRankedList: {
    gap: 5,
    marginVertical: 4,
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
  donutWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    width: "100%",
  },
  emptyText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
