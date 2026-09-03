import React, { useState, useMemo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { useFinance, Transaction } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { WebTransactionModal } from "./modals/WebTransactionModal";
import { WebConfirmModal } from "./modals/WebConfirmModal";
import { WebCountUp } from "./animations/WebCountUp";
import {
  SvgArrowUpRight,
  SvgFileText,
  SvgPlus,
  SvgSearch,
  SvgX,
  SvgChevronDown,
  SvgLayers,
  SvgDollar,
  SvgCheck,
  SvgTrash,
  SvgEdit,
} from "./SvgIcons";

interface WebIncomeProps {
  onOpenReport?: () => void;
}

export function WebIncome({ onOpenReport }: WebIncomeProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const { transactions, deleteTransaction, departments, totalIncome, totalExpenses, netBalance } = useFinance();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [sortField, setSortField] = useState<"date" | "amount" | "category">("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "accountant";

  // Filter categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    transactions.filter((t) => t.type === "income").forEach((t) => set.add(t.category));
    return ["all", ...Array.from(set)];
  }, [transactions]);

  // Filtered & Sorted Income List
  const filteredTransactions = useMemo(() => {
    let list = transactions.filter((t) => {
      if (t.type !== "income") return false;
      const matchCat = selectedCategory === "all" || t.category === selectedCategory;
      const matchDept = selectedDepartment === "all" || t.department === selectedDepartment;
      const matchSearch =
        search.trim() === "" ||
        t.category.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        (t.department && t.department.toLowerCase().includes(search.toLowerCase())) ||
        (t.referenceNumber && t.referenceNumber.toLowerCase().includes(search.toLowerCase())) ||
        (t.addedBy && t.addedBy.toLowerCase().includes(search.toLowerCase()));

      return matchCat && matchDept && matchSearch;
    });

    list.sort((a, b) => {
      if (sortField === "date") {
        const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
        return sortAsc ? -diff : diff;
      }
      if (sortField === "amount") {
        return sortAsc ? a.amount - b.amount : b.amount - a.amount;
      }
      if (sortField === "category") {
        return sortAsc ? a.category.localeCompare(b.category) : b.category.localeCompare(a.category);
      }
      return 0;
    });

    return list;
  }, [transactions, selectedCategory, selectedDepartment, search, sortField, sortAsc]);

  const totalFilteredIncome = useMemo(
    () => filteredTransactions.reduce((s, t) => s + t.amount, 0),
    [filteredTransactions]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Page Title & Action Bar ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.income + "20" }]}>
              <SvgArrowUpRight size={20} color={colors.income} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Income & Revenue Inflows</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                Track institutional grants, fees, donations, and capital receipts
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.headerRightActions, isMobile && { width: "100%", justifyContent: "flex-start" }]}>
          {canEdit && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.income }, isMobile && { flex: 1 }]}
              onPress={() => {
                setEditingTx(null);
                setModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <SvgPlus size={15} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Record Inflow</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── KPI Metrics Summary ─── */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL RECORDED INFLOWS</Text>
          <WebCountUp
            value={totalFilteredIncome}
            prefix={`+${settings.currency} `}
            formatter={(v) => Math.round(v).toLocaleString()}
            style={[styles.metricValue, { color: colors.income }]}
          />
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {filteredTransactions.length} Inflow Entries Listed
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>LARGEST SINGLE INFLOW</Text>
          <WebCountUp
            value={Math.max(...(filteredTransactions.map((t) => t.amount).concat(0)))}
            prefix={`${settings.currency} `}
            formatter={(v) => Math.round(v).toLocaleString()}
            style={[styles.metricValue, { color: colors.foreground }]}
          />
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Top Grant / Fee Batch
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>AVERAGE TRANSACTION</Text>
          <WebCountUp
            value={filteredTransactions.length > 0 ? Math.round(totalFilteredIncome / filteredTransactions.length) : 0}
            prefix={`${settings.currency} `}
            formatter={(v) => Math.round(v).toLocaleString()}
            style={[styles.metricValue, { color: colors.foreground }]}
          />
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Mean Value per Inflow
          </Text>
        </View>
      </View>

      {/* ─── Search & Advanced Filter Bar ─── */}
      <View style={[styles.filterBarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <SvgSearch size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by category, memo, department, reference..."
            placeholderTextColor={colors.mutedForeground + "80"}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <SvgX size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category Pills */}
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Category:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: selectedCategory === cat ? colors.income : colors.background,
                      borderColor: selectedCategory === cat ? "transparent" : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: selectedCategory === cat ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {cat === "all" ? "All Categories" : cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Department Filter Pills */}
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Department:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: selectedDepartment === "all" ? colors.primary : colors.background,
                    borderColor: selectedDepartment === "all" ? "transparent" : colors.border,
                  },
                ]}
                onPress={() => setSelectedDepartment("all")}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: selectedDepartment === "all" ? "#FFFFFF" : colors.foreground },
                  ]}
                >
                  All Cost Centers
                </Text>
              </TouchableOpacity>
              {departments.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: selectedDepartment === d.name ? colors.primary : colors.background,
                      borderColor: selectedDepartment === d.name ? "transparent" : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedDepartment(d.name)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: selectedDepartment === d.name ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {d.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* ─── Mobile Card List OR Desktop Data Table ─── */}
      {isMobile ? (
        <View style={{ gap: 10 }}>
          {filteredTransactions.length === 0 ? (
            <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14 }]}>
              <SvgFileText size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No income records matching filters</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Try clearing your search query or record a new inflow.
              </Text>
            </View>
          ) : (
            filteredTransactions.map((tx) => (
              <View
                key={tx.id}
                style={[
                  styles.mobileCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.mobileCardTop}>
                  <View style={[styles.catBadge, { backgroundColor: colors.income + "18" }]}>
                    <Text style={[styles.catBadgeText, { color: colors.income }]}>{tx.category}</Text>
                  </View>
                  <Text style={[styles.mobileAmount, { color: colors.income }]}>
                    +{settings.currency} {tx.amount.toLocaleString()}
                  </Text>
                </View>

                <Text style={[styles.mobileDesc, { color: colors.foreground }]}>
                  {tx.description || "No description provided"}
                </Text>

                <View style={styles.mobileCardMeta}>
                  <Text style={[styles.mobileMetaText, { color: colors.mutedForeground }]}>
                    {tx.date} · {tx.department} · {tx.paymentMethod || "Electronic"}
                  </Text>
                  {tx.referenceNumber ? (
                    <Text style={[styles.refText, { color: colors.mutedForeground }]}>
                      Ref: {tx.referenceNumber}
                    </Text>
                  ) : null}
                </View>

                {canEdit && (
                  <View style={styles.mobileActionsRow}>
                    <TouchableOpacity
                      style={[styles.mobileActionBtn, { borderColor: colors.border }]}
                      onPress={() => {
                        setEditingTx(tx);
                        setModalVisible(true);
                      }}
                    >
                      <Text style={[styles.mobileActionText, { color: colors.primary }]}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.mobileActionBtn, { borderColor: colors.expense + "40", backgroundColor: colors.expense + "10" }]}
                      onPress={() => setDeletingTx(tx)}
                    >
                      <Text style={[styles.mobileActionText, { color: colors.expense }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      ) : (
        <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={{ minWidth: 840 }}>
              {/* Table Header */}
              <View style={[styles.tableHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.thCol, { width: 110 }]}
                  onPress={() => {
                    if (sortField === "date") setSortAsc(!sortAsc);
                    else {
                      setSortField("date");
                      setSortAsc(false);
                    }
                  }}
                >
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>DATE</Text>
                  {sortField === "date" && <SvgChevronDown size={11} color={colors.primary} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.thCol, { width: 140 }]}
                  onPress={() => {
                    if (sortField === "category") setSortAsc(!sortAsc);
                    else {
                      setSortField("category");
                      setSortAsc(true);
                    }
                  }}
                >
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>CATEGORY</Text>
                  {sortField === "category" && <SvgChevronDown size={11} color={colors.primary} />}
                </TouchableOpacity>

                <View style={[styles.thCol, { width: 220 }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>DESCRIPTION / REFERENCE</Text>
                </View>

                <View style={[styles.thCol, { width: 150 }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>DEPARTMENT</Text>
                </View>

                <View style={[styles.thCol, { width: 110 }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>METHOD</Text>
                </View>

                <TouchableOpacity
                  style={[styles.thCol, { width: 140, justifyContent: "flex-end" }]}
                  onPress={() => {
                    if (sortField === "amount") setSortAsc(!sortAsc);
                    else {
                      setSortField("amount");
                      setSortAsc(false);
                    }
                  }}
                >
                  <Text style={[styles.thText, { color: colors.mutedForeground, textAlign: "right" }]}>AMOUNT</Text>
                  {sortField === "amount" && <SvgChevronDown size={11} color={colors.primary} />}
                </TouchableOpacity>

                {canEdit && (
                  <View style={[styles.thCol, { width: 90, justifyContent: "center" }]}>
                    <Text style={[styles.thText, { color: colors.mutedForeground }]}>ACTIONS</Text>
                  </View>
                )}
              </View>

              {/* Rows */}
              {filteredTransactions.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <SvgFileText size={36} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No income records matching filters</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                    Try clearing your search query or record a new inflow above.
                  </Text>
                </View>
              ) : (
                filteredTransactions.map((tx) => (
                  <View key={tx.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.tdCol, { width: 110 }]}>
                      <Text style={[styles.dateText, { color: colors.foreground }]} numberOfLines={1}>{tx.date}</Text>
                    </View>

                    <View style={[styles.tdCol, { width: 140 }]}>
                      <View style={[styles.catBadge, { backgroundColor: colors.income + "18" }]}>
                        <Text style={[styles.catBadgeText, { color: colors.income }]} numberOfLines={1}>{tx.category}</Text>
                      </View>
                    </View>

                    <View style={[styles.tdCol, { width: 220 }]}>
                      <Text style={[styles.descText, { color: colors.foreground }]} numberOfLines={1}>
                        {tx.description || "No description provided"}
                      </Text>
                      <Text style={[styles.refText, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {tx.referenceNumber || `TXN-${tx.id.slice(-6).toUpperCase()}`}
                      </Text>
                    </View>

                    <View style={[styles.tdCol, { width: 150 }]}>
                      <Text style={[styles.deptText, { color: colors.foreground }]} numberOfLines={1}>
                        {tx.department}
                      </Text>
                    </View>

                    <View style={[styles.tdCol, { width: 110 }]}>
                      <Text style={[styles.methodText, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {tx.paymentMethod || "Electronic"}
                      </Text>
                    </View>

                    <View style={[styles.tdCol, { width: 140, alignItems: "flex-end" }]}>
                      <Text style={[styles.amountText, { color: colors.income }]} numberOfLines={1}>
                        +{settings.currency} {tx.amount.toLocaleString()}
                      </Text>
                    </View>

                    {canEdit && (
                      <View style={[styles.tdCol, { width: 80, flexDirection: "row", justifyContent: "center", gap: 6 }]}>
                        <TouchableOpacity
                          style={[styles.actionIconBtn, { borderColor: "#3B82F630", backgroundColor: "#3B82F612" }]}
                          onPress={() => {
                            setEditingTx(tx);
                            setModalVisible(true);
                          }}
                        >
                          <SvgEdit size={14} color="#3B82F6" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionIconBtn, { borderColor: "#F43F5E30", backgroundColor: "#F43F5E12" }]}
                          onPress={() => setDeletingTx(tx)}
                        >
                          <SvgTrash size={14} color="#F43F5E" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Add / Edit Transaction Modal */}
      <WebTransactionModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingTx(null);
        }}
        initialType="income"
        transactionToEdit={editingTx}
      />

      {/* Confirmation Modal */}
      <WebConfirmModal
        visible={Boolean(deletingTx)}
        onClose={() => setDeletingTx(null)}
        onConfirm={() => {
          if (deletingTx) {
            deleteTransaction(deletingTx.id);
          }
        }}
        title="Delete Income Transaction"
        message={`Are you sure you want to remove the income entry "${deletingTx?.category} — ${settings.currency} ${deletingTx?.amount.toLocaleString()}" from the cloud ledger? This cannot be undone.`}
        confirmText="Delete Income"
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
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
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
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  outlineBtnText: {
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
    gap: 12,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    outlineStyle: "none",
  } as any,
  filterGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    width: 80,
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
  mobileCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  mobileCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mobileAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  mobileDesc: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  mobileCardMeta: {
    gap: 2,
  },
  mobileMetaText: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },
  mobileActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 8,
  },
  mobileActionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  mobileActionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tableCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    width: "100%",
    maxWidth: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  thCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  thText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  tdCol: {
    justifyContent: "center",
  },
  dateText: {
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  catBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  descText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  refText: {
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  deptText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  methodText: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },
  amountText: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  actionIconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  emptyWrap: {
    padding: 36,
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
});
