import { Feather } from "@/components/UniversalIcon";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RingProgress } from "@/components/RingProgress";
import { useColors } from "@/hooks/useColors";
import { NetOperatingBalanceHealth } from "@/services/DatePeriodService";

interface Props {
  data: NetOperatingBalanceHealth;
  currency: string;
  periodLabel: string;
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return Number(n || 0).toLocaleString();
}

function fmtExact(n: number): string {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function NetOperatingBalanceHealthCard({ data, currency, periodLabel }: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    if (Platform.OS !== "web") {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
    setExpanded((prev) => !prev);
  };

  // Separate financial calculation from 0-100 visual arc representation:
  // For deficits, represent the deficit severity magnitude (0-100%) in deficit color;
  // For surplus, represent the operating margin percentage (0-100%) in surplus color.
  const visualProgress = data.isDeficit
    ? Math.min(100, Math.max(0, Math.abs(data.operatingMargin)))
    : Math.min(100, Math.max(0, data.operatingMargin));

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* ─── Card Header ─── */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Net Operating Balance Health</Text>
          </View>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            Actual income vs actual operating expenses for the selected period
          </Text>
        </View>

        <View
          style={[
            styles.badge,
            {
              backgroundColor: data.statusColor + "18",
              borderColor: data.statusColor + "35",
            },
          ]}
        >
          <View style={[styles.badgeDot, { backgroundColor: data.statusColor }]} />
          <Text style={[styles.badgeText, { color: data.statusColor }]}>
            {data.statusLabel}
          </Text>
        </View>
      </View>

      {/* ─── Center Radial Visualization & Core Breakdown ─── */}
      <View style={styles.mainRow}>
        <View style={styles.ringWrap}>
          <RingProgress
            percentage={visualProgress}
            size={120}
            strokeWidth={10}
            color={data.statusColor}
            centerLabel={
              data.isDeficit
                ? `-${Math.abs(data.operatingMargin).toFixed(1)}%`
                : `${data.operatingMargin.toFixed(1)}%`
            }
            label="NOB HEALTH"
            sublabel={data.isDeficit ? "DEFICIT" : "SURPLUS"}
          />
        </View>

        <View style={styles.statsCol}>
          {/* Total Income */}
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: colors.income }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Income</Text>
              <Text style={[styles.statVal, { color: colors.income }]}>
                {currency} {fmt(data.totalIncome)}
              </Text>
            </View>
          </View>

          {/* Operating Expenses */}
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: colors.expense }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Operating Expenses</Text>
              <Text style={[styles.statVal, { color: colors.expense }]}>
                {currency} {fmt(data.operatingExpenses)}
              </Text>
            </View>
          </View>

          {/* Net Operating Balance */}
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: data.isDeficit ? colors.expense : colors.income }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Net Operating Balance</Text>
              <Text
                style={[
                  styles.statVal,
                  { color: data.isDeficit ? colors.expense : colors.income },
                ]}
              >
                {data.isDeficit ? "-" : "+"}
                {currency} {fmt(Math.abs(data.netOperatingBalance))}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ─── Compact Metrics Bar ─── */}
      <View style={[styles.kpiBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.kpiCol}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground, textAlign: "center" }]}>Operating Margin</Text>
          <Text style={[styles.kpiNum, { color: data.isDeficit ? colors.expense : colors.income }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {data.operatingMargin.toFixed(1)}%
          </Text>
        </View>
        <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
        <View style={styles.kpiCol}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground, textAlign: "center" }]}>Expense Ratio</Text>
          <Text style={[styles.kpiNum, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {data.expenseRatio.toFixed(1)}%
          </Text>
        </View>
        <View style={[styles.kpiDivider, { backgroundColor: colors.border }]} />
        <View style={styles.kpiCol}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground, textAlign: "center" }]}>Transactions</Text>
          <Text style={[styles.kpiNum, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {data.transactionCount}
          </Text>
        </View>
      </View>

      {/* ─── Expandable Trigger Button ─── */}
      <TouchableOpacity
        style={[styles.expandBtn, { borderTopColor: colors.border }]}
        onPress={toggleExpand}
        activeOpacity={0.75}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.primary}
          />
          <Text style={[styles.expandBtnText, { color: colors.primary }]}>
            {expanded ? "Hide Detailed Breakdown" : "View Detailed Breakdown"}
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
          {periodLabel}
        </Text>
      </TouchableOpacity>

      {/* ─── Expanded Financial Breakdown Section ─── */}
      {expanded && (
        <View style={[styles.expandedContent, { borderTopColor: colors.border }]}>
          {/* Mathematical Reconciliation Box */}
          <View style={[styles.calcBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.calcTitle, { color: colors.foreground }]}>Operating Balance Calculation</Text>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Total Income ({data.incomeCount} Inflows)</Text>
              <Text style={{ color: colors.income, fontSize: 12, fontFamily: "Inter_700Bold" }}>
                +{currency} {fmtExact(data.totalIncome)}
              </Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Operating Expenses ({data.expenseCount} Outflows)</Text>
              <Text style={{ color: colors.expense, fontSize: 12, fontFamily: "Inter_700Bold" }}>
                -{currency} {fmtExact(data.operatingExpenses)}
              </Text>
            </View>
            <View style={[styles.calcDivider, { backgroundColor: colors.border }]} />
            <View style={styles.calcRow}>
              <Text style={{ color: colors.foreground, fontSize: 12.5, fontFamily: "Inter_700Bold" }}>
                Net Operating Balance (NOB)
              </Text>
              <Text
                style={{
                  color: data.isDeficit ? colors.expense : colors.income,
                  fontSize: 13,
                  fontFamily: "Inter_800ExtraBold",
                }}
              >
                {data.isDeficit ? "-" : "+"}
                {currency} {fmtExact(Math.abs(data.netOperatingBalance))}
              </Text>
            </View>
            <View style={styles.formulaNote}>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                Operating Margin: ({fmtExact(data.netOperatingBalance)} ÷ {fmtExact(data.totalIncome || 1)}) × 100 ={" "}
                <Text style={{ color: data.statusColor, fontFamily: "Inter_700Bold" }}>
                  {data.operatingMargin.toFixed(2)}%
                </Text>
              </Text>
            </View>
          </View>

          {/* Income Breakdown by Category */}
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionHeading, { color: colors.income }]}>INCOME BY CATEGORY</Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                {data.incomeBreakdown.length} Categories
              </Text>
            </View>
            {data.incomeBreakdown.length === 0 ? (
              <Text style={{ fontSize: 11.5, color: colors.mutedForeground, fontStyle: "italic", paddingVertical: 4 }}>
                No income recorded for this period.
              </Text>
            ) : (
              data.incomeBreakdown.map((item, idx) => (
                <View
                  key={item.category + idx}
                  style={[
                    styles.tableRow,
                    { borderBottomColor: colors.border },
                    idx === data.incomeBreakdown.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={{ flex: 1.5 }}>
                    <Text style={[styles.tableItemName, { color: colors.foreground }]}>{item.category}</Text>
                    <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>
                      {item.count} {item.count === 1 ? "transaction" : "transactions"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", flex: 1 }}>
                    <Text style={[styles.tableItemVal, { color: colors.income }]}>
                      +{currency} {fmt(item.amount)}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>
                      {item.pct.toFixed(1)}% of income
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Expense Breakdown by Category */}
          <View style={[styles.sectionWrap, { marginTop: 14 }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionHeading, { color: colors.expense }]}>OPERATING EXPENSES BY CATEGORY</Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                {(data?.expenseBreakdown?.length ?? 0)} Categories
              </Text>
            </View>
            {(!data?.expenseBreakdown || data.expenseBreakdown.length === 0) ? (
              <Text style={{ fontSize: 11.5, color: colors.mutedForeground, fontStyle: "italic", paddingVertical: 4 }}>
                No operating expenses recorded for this period.
              </Text>
            ) : (
              (data.expenseBreakdown ?? []).map((item, idx) => (
                <View
                  key={item.category + idx}
                  style={[
                    styles.tableRow,
                    { borderBottomColor: colors.border },
                    idx === data.expenseBreakdown.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={{ flex: 1.5 }}>
                    <Text style={[styles.tableItemName, { color: colors.foreground }]}>{item.category}</Text>
                    <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>
                      {item.count} {item.count === 1 ? "transaction" : "transactions"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", flex: 1 }}>
                    <Text style={[styles.tableItemVal, { color: colors.expense }]}>
                      -{currency} {fmt(item.amount)}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>
                      {item.pct.toFixed(1)}% of expenses
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Monthly Operating Trend Timeline */}
          {data.monthlyTrend && data.monthlyTrend.length > 0 && (
            <View style={[styles.sectionWrap, { marginTop: 14 }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionHeading, { color: colors.primary }]}>MONTHLY OPERATING TREND</Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                  {data.monthlyTrend.length} Months
                </Text>
              </View>
              {data.monthlyTrend.map((m, idx) => (
                <View
                  key={m.month}
                  style={[
                    styles.tableRow,
                    { borderBottomColor: colors.border },
                    idx === data.monthlyTrend.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tableItemName, { color: colors.foreground }]}>{m.month}</Text>
                    <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>
                      In: +{currency} {fmt(m.income)} · Out: -{currency} {fmt(m.expense)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", flex: 1 }}>
                    <Text
                      style={[
                        styles.tableItemVal,
                        { color: m.nob >= 0 ? colors.income : colors.expense },
                      ]}
                    >
                      {m.nob >= 0 ? "+" : "-"}
                      {currency} {fmt(Math.abs(m.nob))}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>
                      {m.nob >= 0 ? "Operating Surplus" : "Operating Deficit"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 8,
  },
  cardTitle: {
    fontSize: 15.5,
    fontFamily: "Inter_700Bold",
  },
  cardSub: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  statsCol: {
    flex: 1,
    gap: 10,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 10.5,
    fontFamily: "Inter_500Medium",
  },
  statVal: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
    marginTop: 1,
  },
  kpiBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
  },
  kpiCol: {
    alignItems: "center",
    flex: 1,
  },
  kpiLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  kpiNum: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  kpiDivider: {
    width: 1,
    height: 22,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
  },
  expandBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  expandedContent: {
    paddingTop: 14,
    marginTop: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  calcBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  calcTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calcDivider: {
    height: 1,
    marginVertical: 4,
  },
  formulaNote: {
    marginTop: 4,
    paddingTop: 4,
  },
  sectionWrap: {
    gap: 6,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  tableItemName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tableItemVal: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
});
