import React, { useState, useMemo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { useFinance, Transaction } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { WebTransactionModal } from "./modals/WebTransactionModal";
import { WebConfirmModal } from "./modals/WebConfirmModal";
import { openPdfReport } from "@/services/ReportExportService";
import {
  SvgList,
  SvgFileText,
  SvgPlus,
  SvgSearch,
  SvgX,
  SvgChevronDown,
  SvgArrowUpRight,
  SvgArrowDownLeft,
  SvgTrash,
  SvgEdit,
} from "./SvgIcons";

export function WebTransactions() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const { transactions, deleteTransaction, departments, totalIncome, totalExpenses, netBalance, budgets, payroll } = useFinance();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [sortField, setSortField] = useState<"date" | "amount">("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"income" | "expense">("income");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "accountant";

  // Filtered & Sorted
  const filteredTransactions = useMemo(() => {
    let list = transactions.filter((t) => {
      const matchType = typeFilter === "all" || t.type === typeFilter;
      const matchDept = selectedDepartment === "all" || t.department === selectedDepartment;
      const matchSearch =
        search.trim() === "" ||
        t.category.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        (t.department && t.department.toLowerCase().includes(search.toLowerCase())) ||
        (t.referenceNumber && t.referenceNumber.toLowerCase().includes(search.toLowerCase())) ||
        (t.addedBy && t.addedBy.toLowerCase().includes(search.toLowerCase()));

      return matchType && matchDept && matchSearch;
    });

    list.sort((a, b) => {
      if (sortField === "date") {
        const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
        return sortAsc ? -diff : diff;
      }
      if (sortField === "amount") {
        return sortAsc ? a.amount - b.amount : b.amount - a.amount;
      }
      return 0;
    });

    return list;
  }, [transactions, typeFilter, selectedDepartment, search, sortField, sortAsc]);

  const handleExportPDF = async () => {
    const totalAlloc = budgets.reduce((s, b) => s + b.allocated, 0);
    const utilPct = totalAlloc > 0 ? (totalExpenses / totalAlloc) * 100 : 0;
    await openPdfReport({
      organizationName: settings.organizationName || "Organization Finance Management",
      organizationAddress: settings.organizationAddress || "Enterprise Financial Center",
      organizationEmail: settings.organizationEmail || "finance@ofm-cloud.com",
      organizationPhone: settings.organizationPhone || "+92-586-444111",
      organizationLogo: settings.organizationLogo || "",
      currency: settings.currency || "PKR",
      fiscalYear: settings.fiscalYear || "2025-2026",
      periodLabel: selectedDepartment !== "all" ? `General Ledger (${selectedDepartment})` : "General Ledger Complete Audit",
      reportMode: "full",
      generatedBy: user?.name || user?.email || "Chief Financial Officer",
      totalIncome,
      totalExpenses,
      netBalance,
      budgetUtilization: utilPct,
      transactions: filteredTransactions,
      departments,
      payroll,
      budgets,
      includeSummary: true,
      includeCharts: false,
      includeCategories: true,
      includeDepartments: true,
      includePayroll: false,
      includeTransactions: true,
      includeReconciliation: true,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Page Title & Action Bar ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.primary + "20" }]}>
              <SvgList size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>General Ledger Records</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                Complete double-entry transaction trail with real-time cloud synchronization
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.headerRightActions, isMobile && { width: "100%", justifyContent: "flex-start" }]}>
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: colors.border, backgroundColor: colors.card }, isMobile && { flex: 1 }]}
            onPress={handleExportPDF}
            activeOpacity={0.8}
          >
            <SvgFileText size={14} color={colors.primary} />
            <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>Export (PDF)</Text>
          </TouchableOpacity>

          {canEdit && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }, isMobile && { flex: 1 }]}
              onPress={() => {
                setEditingTx(null);
                setModalType("income");
                setModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <SvgPlus size={15} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Add Entry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Executive Ledger KPIs ─── */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL INFLOWS</Text>
          <Text style={[styles.metricValue, { color: colors.income }]}>
            +{settings.currency} {totalIncome.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {transactions.filter((t) => t.type === "income").length} Income Vouchers
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL OUTFLOWS</Text>
          <Text style={[styles.metricValue, { color: colors.expense }]}>
            -{settings.currency} {totalExpenses.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {transactions.filter((t) => t.type === "expense").length} Expense Vouchers
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>NET AUDITED BALANCE</Text>
          <Text style={[styles.metricValue, { color: netBalance >= 0 ? colors.income : colors.expense }]}>
            {netBalance >= 0 ? "+" : "-"}
            {settings.currency} {Math.abs(netBalance).toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Current Operating Balance
          </Text>
        </View>
      </View>

      {/* ─── Search & Ledger Filters ─── */}
      <View style={[styles.filterBarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <SvgSearch size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search general ledger by keyword, reference number, memo..."
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

        {/* Ledger Type Filter & Department */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Type:</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[
                { id: "all", label: "All" },
                { id: "income", label: "Inflows" },
                { id: "expense", label: "Outflows" },
              ].map((tf) => (
                <TouchableOpacity
                  key={tf.id}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: typeFilter === tf.id ? colors.primary : colors.background,
                      borderColor: typeFilter === tf.id ? "transparent" : colors.border,
                    },
                  ]}
                  onPress={() => setTypeFilter(tf.id as any)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: typeFilter === tf.id ? "#FFFFFF" : colors.foreground },
                    ]}
                  >
                    {tf.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Department:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {["all", ...(departments.length > 0 ? departments.map((d) => d.name) : ["Software Engineering", "Administration", "Finance", "Research & Development"])].map((dept) => (
                  <TouchableOpacity
                    key={dept}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: selectedDepartment === dept ? colors.foreground : colors.background,
                        borderColor: selectedDepartment === dept ? "transparent" : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedDepartment(dept)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: selectedDepartment === dept ? colors.background : colors.foreground },
                      ]}
                    >
                      {dept === "all" ? "All Units" : dept}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </View>

      {/* ─── Mobile Card List OR Desktop Data Table ─── */}
      {isMobile ? (
        <View style={{ gap: 10 }}>
          {filteredTransactions.length === 0 ? (
            <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14 }]}>
              <SvgFileText size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No ledger records matching filters</Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Try clearing your search query or add a new voucher.
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View
                      style={[
                        styles.txIconBadge,
                        {
                          backgroundColor: tx.type === "income" ? colors.income + "18" : colors.expense + "18",
                        },
                      ]}
                    >
                      {tx.type === "income" ? (
                        <SvgArrowUpRight size={12} color={colors.income} />
                      ) : (
                        <SvgArrowDownLeft size={12} color={colors.expense} />
                      )}
                    </View>
                    <View style={[styles.catBadge, { backgroundColor: (tx.type === "income" ? colors.income : colors.expense) + "18" }]}>
                      <Text style={[styles.catBadgeText, { color: tx.type === "income" ? colors.income : colors.expense }]}>{tx.category}</Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.mobileAmount,
                      { color: tx.type === "income" ? colors.income : colors.expense },
                    ]}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {settings.currency} {tx.amount.toLocaleString()}
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
                        setModalType(tx.type);
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
            <View style={{ minWidth: 980, paddingHorizontal: 12 }}>
              {/* Table Header */}
              <View style={[styles.tableHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.thCol, { width: 120 }]}
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

                <View style={[styles.thCol, { width: 110 }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>TYPE</Text>
                </View>

                <View style={[styles.thCol, { width: 160, paddingLeft: 8 }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>CATEGORY</Text>
                </View>

                <View style={[styles.thCol, { width: 230 }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>MEMO / REF</Text>
                </View>

                <View style={[styles.thCol, { width: 170 }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>DEPARTMENT</Text>
                </View>

                <TouchableOpacity
                  style={[styles.thCol, { width: 130, justifyContent: "flex-end" }]}
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
                  <View style={[styles.thCol, { width: 80, justifyContent: "center" }]}>
                    <Text style={[styles.thText, { color: colors.mutedForeground }]}>ACTIONS</Text>
                  </View>
                )}
              </View>

              {/* Rows */}
              {filteredTransactions.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <SvgFileText size={36} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No ledger records found</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                    Try changing your active filters or create a new entry.
                  </Text>
                </View>
              ) : (
                filteredTransactions.map((tx) => (
                  <View key={tx.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.tdCol, { width: 115 }]}>
                      <Text style={[styles.dateText, { color: colors.foreground }]} numberOfLines={1}>{tx.date}</Text>
                    </View>

                    <View style={[styles.tdCol, { width: 110, alignItems: "flex-start", justifyContent: "center" }]}>
                      <View
                        style={[
                          styles.catBadge,
                          {
                            backgroundColor: tx.type === "income" ? "#10B9811A" : "#F43F5E1A",
                            borderColor: tx.type === "income" ? "#10B98140" : "#F43F5E40",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.catBadgeText,
                            { color: tx.type === "income" ? "#10B981" : "#F43F5E" },
                          ]}
                        >
                          {tx.type === "income" ? "INFLOW" : "OUTFLOW"}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.tdCol, { width: 160, paddingLeft: 8 }]}>
                      <Text style={[styles.deptText, { color: colors.foreground }]} numberOfLines={1}>
                        {tx.category}
                      </Text>
                    </View>

                    <View style={[styles.tdCol, { width: 220 }]}>
                      <Text style={[styles.descText, { color: colors.foreground }]} numberOfLines={1}>
                        {tx.description || "No description provided"}
                      </Text>
                      <Text style={[styles.refText, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {tx.referenceNumber || `TXN-${tx.id.slice(-6).toUpperCase()}`}
                      </Text>
                    </View>

                    <View style={[styles.tdCol, { width: 170 }]}>
                      <Text style={[styles.deptText, { color: colors.foreground }]} numberOfLines={1}>
                        {tx.department}
                      </Text>
                    </View>

                    <View style={[styles.tdCol, { width: 130, alignItems: "flex-end" }]}>
                      <Text
                        style={[
                          styles.amountText,
                          { color: tx.type === "income" ? "#10B981" : "#F43F5E" },
                        ]}
                        numberOfLines={1}
                      >
                        {tx.type === "income" ? "+" : "-"}
                        {settings.currency} {tx.amount.toLocaleString()}
                      </Text>
                    </View>

                    {canEdit && (
                      <View style={[styles.tdCol, { width: 80, flexDirection: "row", justifyContent: "center", gap: 6 }]}>
                        <TouchableOpacity
                          style={[styles.actionIconBtn, { borderColor: "#3B82F630", backgroundColor: "#3B82F612" }]}
                          onPress={() => {
                            setEditingTx(tx);
                            setModalType(tx.type);
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

      {/* Modal */}
      <WebTransactionModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingTx(null);
        }}
        initialType={modalType}
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
        title="Delete Transaction"
        message={`Are you sure you want to delete the transaction "${deletingTx?.category} — ${settings.currency} ${deletingTx?.amount.toLocaleString()}"? This action will permanently remove it from the cloud ledger.`}
        confirmText="Delete Transaction"
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
  txIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
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
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  catBadgeText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
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
