import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { useFinance } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { AreaLineChart } from "@/components/AreaLineChart";
import { DonutChart } from "@/components/DonutChart";
import {
  NormalizedPeriod,
  aggregateTransactionsByGranularity,
  getPresetPeriod,
} from "@/services/DatePeriodService";
import { calculateFinancialHealth } from "@/services/financialHealthService";
import { generateFinancialInsights, ActionableInsight } from "@/services/financialInsightsService";
import {
  SvgCpu,
  SvgShield,
  SvgTrendingUp,
  SvgTrendingDown,
  SvgPieChart,
  SvgCheck,
  SvgArrowUpRight,
  SvgArrowDownLeft,
} from "./SvgIcons";

const EXPENSE_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981", "#EC4899"];

const SEV_COLORS = {
  CRITICAL: { border: "#F43F5E", bg: "#F43F5E18", text: "#F43F5E", badge: "CRITICAL" },
  WARNING: { border: "#F59E0B", bg: "#F59E0B18", text: "#F59E0B", badge: "WARNING" },
  SUCCESS: { border: "#10B981", bg: "#10B98118", text: "#10B981", badge: "SUCCESS" },
  INFO: { border: "#3B82F6", bg: "#3B82F618", text: "#3B82F6", badge: "INFO" },
};

export function WebAIInsights() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const { transactions, budgets, payroll, departments, totalIncome, totalExpenses, netBalance, budgetUtilization } = useFinance();

  const [activePeriod, setActivePeriod] = useState<NormalizedPeriod>(() => getPresetPeriod("last_6m"));

  const fmt = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return Number(n || 0).toLocaleString();
  };

  // 1. Authoritative Financial Health Calculation
  const healthReport = useMemo(() => {
    return calculateFinancialHealth(transactions, budgets, payroll, activePeriod);
  }, [transactions, budgets, payroll, activePeriod]);

  const { healthScore, status: healthLabel, statusColor: healthColor } = healthReport;

  // 2. Authoritative Actionable Insights
  const actionableInsights = useMemo(() => {
    return generateFinancialInsights(
      transactions,
      budgets,
      payroll,
      departments,
      activePeriod,
      undefined,
      settings.currency || "PKR",
      user?.organizationId || "default_org"
    );
  }, [transactions, budgets, payroll, departments, activePeriod, settings.currency, user?.organizationId]);

  // Compute burn rate per month
  const monthlyBurn = useMemo(() => {
    const expenseTx = transactions.filter((t) => t.type === "expense");
    if (expenseTx.length === 0) return 0;
    return totalExpenses / Math.max(1, new Set(expenseTx.map((t) => t.date.substring(0, 7))).size);
  }, [transactions, totalExpenses]);

  // Projected runway in months
  const runwayMonths = useMemo(() => {
    if (monthlyBurn <= 0) return 12;
    if (netBalance <= 0) return 0;
    return Math.min(Math.round((netBalance / monthlyBurn) * 10) / 10, 24);
  }, [netBalance, monthlyBurn]);

  // Dynamic real-time chart data points
  const chartPoints = useMemo(() => {
    return aggregateTransactionsByGranularity(transactions, activePeriod);
  }, [transactions, activePeriod]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: "#8B5CF620" }]}>
              <SvgCpu size={20} color="#8B5CF6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>AI Financial Intelligence</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                Real-time predictive cashflow diagnostics, burn rate analysis, and automated insights
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ─── Health Score & Runway Hero Row ─── */}
      <View style={styles.heroRow}>
        {/* Health Score Card */}
        <View style={[styles.healthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>FINANCIAL HEALTH SCORE</Text>
            <View style={[styles.scoreBadge, { backgroundColor: healthColor + "20" }]}>
              <Text style={[styles.scoreBadgeText, { color: healthColor }]}>{healthLabel}</Text>
            </View>
          </View>
          <Text style={[styles.healthScoreNumber, { color: healthColor }]}>{healthScore}<Text style={{ fontSize: 20, color: colors.mutedForeground }}>/100</Text></Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Calculated from cash margin, budget discipline, and revenue stability
          </Text>
        </View>

        {/* Burn Rate & Runway */}
        <View style={[styles.healthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>ESTIMATED RUNWAY</Text>
          <Text style={[styles.healthScoreNumber, { color: runwayMonths < 3 ? colors.expense : colors.foreground }]}>
            {runwayMonths} <Text style={{ fontSize: 20, color: colors.mutedForeground }}>Months</Text>
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Avg Burn: {settings.currency} {fmt(monthlyBurn)} / month
          </Text>
        </View>
      </View>

      {/* ─── Predictive Forecast Curve ─── */}
      <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>Cash Flow Trend Timeline</Text>
            <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
              Dynamic trajectory based on historical general ledger entries
            </Text>
          </View>
        </View>

        <AreaLineChart
          data={chartPoints}
          width={isMobile ? width - 40 : 880}
          height={190}
          currency={settings.currency}
          activePeriod={activePeriod}
          onPeriodSelect={(p) => setActivePeriod(p)}
          transactions={transactions}
          userId={user?.id || "default"}
        />
      </View>

      {/* ─── Generated Financial Insights ─── */}
      <View style={styles.insightsContainer}>
        <Text style={[styles.insightsTitle, { color: colors.foreground }]}>
          {actionableInsights.length} Diagnostic Executive Highlights
        </Text>

        {actionableInsights.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SvgCheck size={24} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {transactions.length === 0
                ? "No financial records found. Add financial activity to receive personalized intelligence."
                : "All metrics within standard operational limits. No anomalies detected."}
            </Text>
          </View>
        ) : (
          actionableInsights.map((item) => {
            const sev = SEV_COLORS[item.severity] || SEV_COLORS.INFO;
            return (
              <View
                key={item.id}
                style={[
                  styles.insightCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderLeftColor: sev.border,
                    borderLeftWidth: 4,
                  },
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <View style={[styles.sevIconBadge, { backgroundColor: sev.bg }]}>
                      {item.severity === "SUCCESS" ? (
                        <SvgCheck size={14} color={sev.text} />
                      ) : (
                        <SvgShield size={14} color={sev.text} />
                      )}
                    </View>
                    <Text style={[styles.insightCardTitle, { color: colors.foreground }]}>{item.title}</Text>
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: sev.bg }]}>
                    <Text style={[styles.scoreBadgeText, { color: sev.text }]}>{sev.badge}</Text>
                  </View>
                </View>

                {/* Summary (WHAT) */}
                <Text style={[styles.insightDetail, { color: colors.foreground }]}>
                  {item.summary || (item as any).description}
                </Text>

                {/* Why It Matters */}
                <View style={[styles.whyMattersBox, { backgroundColor: colors.background, borderLeftColor: sev.border }]}>
                  <Text style={[styles.whyMattersLabel, { color: colors.mutedForeground }]}>WHY THIS MATTERS</Text>
                  <Text style={[styles.whyMattersText, { color: colors.mutedForeground }]}>{item.whyItMatters}</Text>
                </View>

                {/* Recommended Action */}
                {item.isActionable && (
                  <View style={[styles.recBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.recLabel, { color: colors.primary }]}>RECOMMENDED ACTION:</Text>
                    <Text style={[styles.recText, { color: colors.foreground }]}>{item.recommendedAction}</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
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
  heroRow: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  healthCard: {
    flex: 1,
    minWidth: 260,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  metricLabel: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  healthScoreNumber: {
    fontSize: 34,
    fontFamily: "Inter_900Black",
    letterSpacing: -1,
  },
  metricSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scoreBadgeText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  panelCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  panelTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  panelSubtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  insightsContainer: {
    gap: 12,
  },
  insightsTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  insightCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  sevIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  insightCardTitle: {
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    flex: 1,
  },
  insightDetail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  whyMattersBox: {
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    gap: 2,
  },
  whyMattersLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  whyMattersText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  recBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    gap: 3,
  },
  recLabel: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  recText: {
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    lineHeight: 17,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
