import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";
import {
  NetOperatingBalanceHealth,
  NormalizedPeriod,
  getBudgetInsight,
  getNobInsight,
  getExpenseDistributionInsight,
} from "@/services/DatePeriodService";
import { Transaction, Department } from "@/context/FinanceContext";
import { Budget } from "@/services/BudgetService";
import { SvgX, SvgFileText, SvgChevronDown, SvgTrendingUp, SvgArrowDownRight, SvgArrowUpRight } from "@/components/web/SvgIcons";

export type DrillDownType = "budget" | "nob" | "expense";

interface Props {
  visible: boolean;
  type: DrillDownType;
  onClose: () => void;
  currency?: string;
  period: NormalizedPeriod;
  transactions: Transaction[];
  budgets: Budget[];
  nobHealth: NetOperatingBalanceHealth;
  onNavigate?: (tab: string) => void;
  departments?: Department[];
}

function fmt(n: number) {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function FinancialDrillDownModal({
  visible,
  type,
  onClose,
  currency = "PKR",
  period,
  transactions,
  budgets,
  nobHealth,
  onNavigate,
  departments,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<"overview" | "breakdown" | "trend" | "ledger">("overview");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Budget metrics
  const totalAllocated = useMemo(() => {
    const line = (budgets || []).reduce((s, b) => s + (b.allocated || 0), 0);
    if (line > 0) return line;
    return (departments || []).reduce((s, d) => s + (d.budgetAllocated || 0), 0);
  }, [budgets, departments]);
  const totalSpent = nobHealth?.operatingExpenses ?? 0;
  const budgetRatio = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;
  const remainingBudget = totalAllocated - totalSpent;
  const isOverBudget = totalAllocated > 0 && totalSpent > totalAllocated;

  // Filtered period transactions for ledger
  const periodTxs = useMemo(() => {
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    end.setHours(23, 59, 59, 999);

    return transactions
      .filter((t) => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, period]);

  const expenseTxs = useMemo(() => periodTxs.filter((t) => t.type === "expense"), [periodTxs]);
  const filteredExpenseLedger = useMemo(() => {
    if (!selectedCategory) return expenseTxs;
    return expenseTxs.filter((t) => (t.category || "General Expense") === selectedCategory);
  }, [expenseTxs, selectedCategory]);

  const modalTitle =
    type === "budget"
      ? "Budget Utilization & Burn-Rate Audit"
      : type === "nob"
      ? "Net Operating Balance Health Breakdown"
      : "Expense Distribution & Disbursement Ledger";

  const modalSubtitle = `Authoritative data for ${period.label} (${period.startDate} to ${period.endDate})`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isMobile ? "slide" : "fade"}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: "rgba(3, 7, 18, 0.82)" }]}>
        <View
          style={[
            styles.modalBox,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              width: isMobile ? "96%" : Math.min(width * 0.88, 920),
              maxHeight: isMobile ? "92%" : "88%",
            },
          ]}
        >
          {/* ─── Header ─── */}
          <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>{modalTitle}</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{modalSubtitle}</Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: (colors.cardAlt ?? colors.muted) + "60", borderColor: colors.border }]}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              activeOpacity={0.75}
            >
              <SvgX size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* ─── Tab Navigation Bar (Horizontal Slider) ─── */}
          <View style={[styles.tabBarWrap, { borderBottomColor: colors.border }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabBarScroll}
            >
              {[
                { id: "overview", label: "Executive KPI" },
                { id: "breakdown", label: type === "budget" ? "Department Ceilings" : "Category Ledger" },
                { id: "trend", label: "Monthly Timeline" },
                { id: "ledger", label: "Transaction Audit" },
              ].map((tab) => {
                const isSelected = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[
                      styles.tabItem,
                      isSelected && [styles.tabItemActive, { borderBottomColor: colors.primary }],
                    ]}
                    onPress={() => {
                      setActiveTab(tab.id as any);
                      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tabItemText,
                        {
                          color: isSelected ? colors.primary : colors.mutedForeground,
                          fontFamily: isSelected ? "Inter_700Bold" : "Inter_600SemiBold",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ─── Body Content ─── */}
          <ScrollView
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator={false}
          >
            {/* ─── TAB 1: EXECUTIVE OVERVIEW ─── */}
            {activeTab === "overview" && (
              <View style={{ gap: 16 }}>
                {/* Dynamic Contextual Insight Box */}
                <View
                  style={[
                    styles.insightCard,
                    {
                      backgroundColor:
                        type === "budget"
                          ? (isOverBudget ? colors.expense : colors.income) + "12"
                          : type === "nob"
                          ? nobHealth.statusColor + "12"
                          : colors.primary + "12",
                      borderColor:
                        type === "budget"
                          ? (isOverBudget ? colors.expense : colors.income) + "30"
                          : type === "nob"
                          ? nobHealth.statusColor + "30"
                          : colors.primary + "30",
                    },
                  ]}
                >
                  <Text style={[styles.insightTitle, { color: colors.foreground }]}>Financial Insight</Text>
                  <Text style={[styles.insightText, { color: colors.mutedForeground }]}>
                    {type === "budget"
                      ? getBudgetInsight(totalAllocated, totalSpent, currency)
                      : type === "nob"
                      ? getNobInsight(nobHealth, currency)
                      : getExpenseDistributionInsight(nobHealth.expenseBreakdown, nobHealth.operatingExpenses)}
                  </Text>
                </View>

                {/* KPI Grid */}
                <View style={styles.kpiGrid}>
                  {type === "budget" && (
                    <>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>ALLOCATED BUDGET</Text>
                        <Text style={[styles.kpiVal, { color: totalAllocated > 0 ? colors.foreground : colors.mutedForeground }]}>
                          {totalAllocated > 0 ? `${currency} ${fmt(totalAllocated)}` : "No Cap Set"}
                        </Text>
                      </View>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>ACTUAL SPENT</Text>
                        <Text style={[styles.kpiVal, { color: colors.expense }]}>{currency} {fmt(totalSpent)}</Text>
                      </View>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>
                          {isOverBudget ? "OVER BUDGET" : "REMAINING CAP"}
                        </Text>
                        <Text style={[styles.kpiVal, { color: isOverBudget ? colors.expense : colors.income }]}>
                          {totalAllocated > 0 ? `${isOverBudget ? "+" : ""}${currency} ${fmt(Math.abs(remainingBudget))}` : "—"}
                        </Text>
                      </View>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>USAGE RATIO</Text>
                        <Text style={[styles.kpiVal, { color: isOverBudget ? colors.expense : colors.income }]}>
                          {totalAllocated > 0 ? `${budgetRatio.toFixed(1)}%` : "0%"}
                        </Text>
                      </View>
                    </>
                  )}

                  {type === "nob" && (
                    <>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>OPERATING INFLOW</Text>
                        <Text style={[styles.kpiVal, { color: colors.income }]}>+{currency} {fmt(nobHealth.totalIncome)}</Text>
                      </View>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>OPERATING OUTFLOW</Text>
                        <Text style={[styles.kpiVal, { color: colors.expense }]}>-{currency} {fmt(nobHealth.operatingExpenses)}</Text>
                      </View>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>NET OPERATING BALANCE</Text>
                        <Text style={[styles.kpiVal, { color: nobHealth.isDeficit ? colors.expense : colors.income }]}>
                          {nobHealth.isDeficit ? "-" : "+"}{currency} {fmt(Math.abs(nobHealth.netOperatingBalance))}
                        </Text>
                      </View>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>OPERATING MARGIN</Text>
                        <Text style={[styles.kpiVal, { color: nobHealth.statusColor }]}>
                          {nobHealth.isDeficit ? `-${Math.abs(nobHealth.operatingMargin).toFixed(1)}%` : `${nobHealth.operatingMargin.toFixed(1)}%`}
                        </Text>
                      </View>
                    </>
                  )}

                  {type === "expense" && (
                    <>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>TOTAL DISBURSED</Text>
                        <Text style={[styles.kpiVal, { color: colors.expense }]}>{currency} {fmt(nobHealth.operatingExpenses)}</Text>
                      </View>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>ACTIVE CATEGORIES</Text>
                        <Text style={[styles.kpiVal, { color: colors.foreground }]}>{nobHealth.expenseBreakdown.length}</Text>
                      </View>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>TRANSACTION COUNT</Text>
                        <Text style={[styles.kpiVal, { color: colors.foreground }]}>{nobHealth.expenseCount} Records</Text>
                      </View>
                      <View style={[styles.kpiCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                        <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>TOP COST DRIVER</Text>
                        <Text style={[styles.kpiVal, { color: colors.primary }]} numberOfLines={1}>
                          {nobHealth.expenseBreakdown[0]?.category || "None"}
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                {/* Arithmetic Equation Box for NOB */}
                {type === "nob" && (
                  <View style={[styles.equationCard, { backgroundColor: (colors.cardAlt ?? colors.muted) + "20", borderColor: colors.border }]}>
                    <Text style={[styles.equationTitle, { color: colors.foreground }]}>Mathematical Balance Equation</Text>
                    <View style={styles.equationRow}>
                      <View style={styles.equationCol}>
                        <Text style={[styles.eqLabel, { color: colors.mutedForeground }]}>Total Operating Inflows</Text>
                        <Text style={[styles.eqVal, { color: colors.income }]}>+{currency} {fmt(nobHealth.totalIncome)}</Text>
                      </View>
                      <Text style={[styles.eqOp, { color: colors.mutedForeground }]}>−</Text>
                      <View style={styles.equationCol}>
                        <Text style={[styles.eqLabel, { color: colors.mutedForeground }]}>Operating Outflows</Text>
                        <Text style={[styles.eqVal, { color: colors.expense }]}>-{currency} {fmt(nobHealth.operatingExpenses)}</Text>
                      </View>
                      <Text style={[styles.eqOp, { color: colors.mutedForeground }]}>=</Text>
                      <View style={styles.equationCol}>
                        <Text style={[styles.eqLabel, { color: colors.mutedForeground }]}>Net Operating Balance</Text>
                        <Text style={[styles.eqVal, { color: nobHealth.isDeficit ? colors.expense : colors.income }]}>
                          {nobHealth.isDeficit ? "-" : "+"}{currency} {fmt(Math.abs(nobHealth.netOperatingBalance))}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ─── TAB 2: BREAKDOWN & CEILINGS ─── */}
            {activeTab === "breakdown" && (
              <View style={{ gap: 12 }}>
                <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
                  {type === "budget" ? "Department Allocation vs Live Spend" : "Operating Disbursements by Category"}
                </Text>

                {type === "budget" ? (
                  budgets.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, paddingVertical: 16 }}>No department budgets configured.</Text>
                  ) : (
                    budgets.map((b) => {
                      const bDept = b.department?.trim().toLowerCase();
                      const bCat = b.category?.trim().toLowerCase();
                      const deptSpent = transactions
                        .filter((t) => {
                          if (t.type !== "expense") return false;
                          const tDept = t.department?.trim().toLowerCase();
                          const tCat = t.category?.trim().toLowerCase();
                          const matchDept = !bDept || bDept === "all" || tDept === bDept;
                          const matchCat = !bCat || bCat === "all" || tCat === bCat;
                          return matchDept && matchCat;
                        })
                        .reduce((s, t) => s + (t.amount || 0), 0);
                      const pct = b.allocated > 0 ? Math.min(Math.round((deptSpent / b.allocated) * 100), 100) : 0;
                      const isDeptOver = b.allocated > 0 && deptSpent > b.allocated;

                      return (
                        <View key={b.id} style={[styles.breakdownRow, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{b.department} - {b.category}</Text>
                            <Text style={[styles.rowVal, { color: isDeptOver ? colors.expense : colors.foreground }]}>
                              {currency} {fmt(deptSpent)} / {currency} {fmt(b.allocated)} ({pct}%)
                            </Text>
                          </View>
                          <View style={[styles.track, { backgroundColor: colors.border }]}>
                            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: isDeptOver ? colors.expense : colors.income }]} />
                          </View>
                        </View>
                      );
                    })
                  )
                ) : (
                  nobHealth.expenseBreakdown.map((c) => (
                    <TouchableOpacity
                      key={c.category}
                      style={[
                        styles.breakdownRow,
                        {
                          backgroundColor: selectedCategory === c.category ? colors.primary + "18" : (colors.cardAlt ?? colors.muted) + "30",
                          borderColor: selectedCategory === c.category ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setSelectedCategory(selectedCategory === c.category ? null : c.category)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{c.category}</Text>
                        <Text style={[styles.rowVal, { color: colors.expense }]}>
                          {currency} {fmt(c.amount)} · {c.pct.toFixed(1)}% ({c.count} txs)
                        </Text>
                      </View>
                      <View style={[styles.track, { backgroundColor: colors.border }]}>
                        <View style={[styles.fill, { width: `${Math.min(c.pct, 100)}%`, backgroundColor: colors.expense }]} />
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* ─── TAB 3: MONTHLY TIMELINE ─── */}
            {activeTab === "trend" && (
              <View style={{ gap: 10 }}>
                <Text style={[styles.sectionHeading, { color: colors.foreground }]}>Monthly Financial Movement</Text>
                {nobHealth.monthlyTrend.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, paddingVertical: 16 }}>No monthly trend data available.</Text>
                ) : (
                  <View style={[styles.tableWrap, { borderColor: colors.border }]}>
                    <View style={[styles.tableHeader, { backgroundColor: (colors.cardAlt ?? colors.muted) + "60", borderBottomColor: colors.border }]}>
                      <Text style={[styles.th, { color: colors.mutedForeground, flex: 1 }]}>MONTH</Text>
                      <Text style={[styles.th, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>INFLOW</Text>
                      <Text style={[styles.th, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>OUTFLOW</Text>
                      <Text style={[styles.th, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>NET BALANCE</Text>
                    </View>
                    {nobHealth.monthlyTrend.map((m) => (
                      <View key={m.month} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.td, { color: colors.foreground, flex: 1 }]}>{m.month}</Text>
                        <Text style={[styles.td, { color: colors.income, flex: 1, textAlign: "right" }]}>+{currency} {fmt(m.income)}</Text>
                        <Text style={[styles.td, { color: colors.expense, flex: 1, textAlign: "right" }]}>-{currency} {fmt(m.expense)}</Text>
                        <Text style={[styles.td, { color: m.nob >= 0 ? colors.income : colors.expense, flex: 1, textAlign: "right", fontFamily: "Inter_700Bold" }]}>
                          {m.nob >= 0 ? "+" : ""}{currency} {fmt(m.nob)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ─── TAB 4: TRANSACTION AUDIT LEDGER ─── */}
            {activeTab === "ledger" && (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
                    {selectedCategory ? `Transactions in ${selectedCategory}` : "All Period Disbursements"} ({filteredExpenseLedger.length})
                  </Text>
                  {selectedCategory && (
                    <TouchableOpacity onPress={() => setSelectedCategory(null)}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Clear Filter</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {filteredExpenseLedger.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, paddingVertical: 16 }}>No transactions found for this selection.</Text>
                ) : (
                  filteredExpenseLedger.slice(0, 50).map((t) => (
                    <View key={t.id} style={[styles.txRow, { backgroundColor: (colors.cardAlt ?? colors.muted) + "30", borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.txDesc, { color: colors.foreground }]}>{t.description || t.category || "Disbursement"}</Text>
                        <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
                          {t.date} · {t.category || "General"} {t.department ? `· ${t.department}` : ""}
                        </Text>
                      </View>
                      <Text style={[styles.txAmount, { color: colors.expense }]}>
                        -{currency} {fmt(t.amount)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>

          {/* ─── Footer Action with safe area padding ─── */}
          <View
            style={[
              styles.footerRow,
              {
                borderTopColor: colors.border,
                paddingBottom:
                  Platform.OS === "android"
                    ? Math.max(insets.bottom, 24) + 12
                    : Platform.OS === "ios"
                    ? Math.max(insets.bottom, 16) + 4
                    : 14,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                onClose();
                if (onNavigate) {
                  onNavigate(type === "budget" ? "budgets" : type === "nob" ? "reports" : "expenses");
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.footerBtnText}>
                {type === "budget" ? "Go to Budget Manager →" : type === "nob" ? "Go to Full Reports →" : "View All Outflow Ledgers →"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  modalBox: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBarWrap: {
    borderBottomWidth: 1,
  },
  tabBarScroll: {
    flexDirection: "row",
    paddingHorizontal: 14,
    alignItems: "center",
  },
  tabItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
    marginRight: 6,
  },
  tabItemActive: {},
  tabItemText: {
    fontSize: 12,
  },
  scrollBody: {
    padding: 20,
  },
  insightCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  insightTitle: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  insightText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  kpiLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  kpiVal: {
    fontSize: 15,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 4,
  },
  equationCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  equationTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  equationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  equationCol: {
    alignItems: "center",
  },
  eqLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
  },
  eqVal: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 2,
  },
  eqOp: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  sectionHeading: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  breakdownRow: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  rowTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  rowVal: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
  tableWrap: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  th: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  td: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  txDesc: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
  txMeta: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  txAmount: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  footerRow: {
    padding: 14,
    borderTopWidth: 1,
  },
  footerBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
