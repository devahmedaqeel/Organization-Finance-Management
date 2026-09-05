import { Feather } from "@/components/UniversalIcon";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { TransactionItem } from "@/components/TransactionItem";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { Transaction } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";

const CATS = ["All", "Salaries", "Utilities", "Equipment", "Research", "Maintenance", "Travel", "Other"];

export default function ExpensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useFinance();
  const { settings } = useSettings();

  const formatAmt = (n: number) => {
    if (n >= 1000000) return `${settings.currency} ${(n / 1000000).toFixed(2)}M`;
    if (n >= 1000) return `${settings.currency} ${(n / 1000).toFixed(0)}K`;
    return `${settings.currency} ${n.toLocaleString()}`;
  };

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState<Transaction | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "accountant";

  const expenses = useMemo(() =>
    transactions
      .filter((t) => t.type === "expense")
      .filter((t) => filterCat === "All" || t.category === filterCat)
      .filter((t) =>
        search.trim() === "" ||
        t.category.toLowerCase().includes(search.toLowerCase()) ||
        t.department.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      ),
    [transactions, search, filterCat]
  );

  const total = expenses.reduce((s, t) => s + t.amount, 0);
  const webTop = Platform.OS === "web" ? 67 : 0;

  const openAdd = () => {
    setEditItem(null);
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const openEdit = (item: Transaction) => {
    setEditItem(item);
    setModalVisible(true);
  };

  const topCategories = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((t) => {
      map[t.category] = (map[t.category] ?? 0) + t.amount;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, amount]) => ({ name, amount }));
  }, [expenses]);

  const EXPENSE_BAR_COLORS = ["#F43F5E", "#F59E0B", "#8B5CF6", "#0EA5E9", "#10B981"];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: webTop + Math.max(insets.top, 20) + 14, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Expenses</Text>
            <Text style={[styles.count, { color: colors.mutedForeground }]}>{expenses.length} records</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.totalBadge, { backgroundColor: colors.expense + "22" }]}>
              <Feather name="trending-down" size={12} color={colors.expense} />
              <Text style={[styles.totalText, { color: colors.expense }]}>{formatAmt(total)}</Text>
            </View>
            {canEdit && (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.expense }]}
                onPress={openAdd}
                activeOpacity={0.85}
              >
                <Feather name="plus" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search expenses..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category Filter */}
        <FlatList
          horizontal
          data={CATS}
          keyExtractor={(c) => c}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: filterCat === c ? colors.expense : colors.card,
                  borderColor: filterCat === c ? colors.expense : colors.border,
                },
              ]}
              onPress={() => { setFilterCat(c); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.filterText, { color: filterCat === c ? "#fff" : colors.foreground }]}>{c}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* List */}
      <FlatList
        data={expenses}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 16) + 105 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          expenses.length > 0 && filterCat === "All" && !search ? (
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryCardHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="pie-chart" size={14} color={colors.expense} />
                  <Text style={[styles.summaryCardTitle, { color: colors.foreground }]}>Spending Flow</Text>
                </View>
                <Text style={[styles.summaryCardTotal, { color: colors.expense }]}>{formatAmt(total)}</Text>
              </View>
              <View style={styles.catBarsWrap}>
                {topCategories.map((cat, i) => {
                  const pct = total > 0 ? (cat.amount / total) * 100 : 0;
                  return (
                    <View key={cat.name} style={styles.catBarItem}>
                      <View style={styles.catBarHeader}>
                        <Text style={[styles.catBarName, { color: colors.foreground, flex: 1, marginRight: 8 }]}>
                          {cat.name}
                        </Text>
                        <Text style={[styles.catBarAmount, { color: colors.mutedForeground }]}>
                          {formatAmt(cat.amount)} ({pct.toFixed(0)}%)
                        </Text>
                      </View>
                      <View style={[styles.catBarTrack, { backgroundColor: colors.muted }]}>
                        <View
                          style={[
                            styles.catBarFill,
                            {
                              width: `${pct > 0 ? Math.min(Math.max(pct, 2), 100) : 0}%`,
                              backgroundColor: EXPENSE_BAR_COLORS[i % EXPENSE_BAR_COLORS.length],
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TransactionItem
            item={item}
            onDelete={canEdit ? deleteTransaction : undefined}
            onEdit={canEdit ? openEdit : undefined}
            canDelete={canEdit}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="arrow-down-circle" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No expense records</Text>
            {canEdit && (
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: colors.expense }]}
                onPress={openAdd}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.emptyAddText}>Add Expense</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <AddTransactionModal
        visible={modalVisible}
        type="expense"
        onClose={() => { setModalVisible(false); setEditItem(null); }}
        onAdd={addTransaction}
        onUpdate={updateTransaction}
        addedBy={user?.role ?? "accountant"}
        editItem={editItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, gap: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  count: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  totalBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  totalText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  filterRow: { gap: 8, paddingVertical: 4 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  list: { padding: 16, gap: 0 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  emptyAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
  },
  emptyAddText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  summaryCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10,
  },
  summaryCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryCardTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  summaryCardTotal: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  catBarsWrap: {
    gap: 8,
  },
  catBarItem: {
    gap: 4,
  },
  catBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  catBarName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  catBarAmount: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  catBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  catBarFill: {
    height: "100%",
    borderRadius: 3,
  },
});
