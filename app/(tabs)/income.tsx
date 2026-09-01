import { Feather } from "@expo/vector-icons";
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

const CATS = ["All", "Government Grant", "Fee Collection", "Research Grant", "Donation", "Other"];

export default function IncomeScreen() {
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

  const income = useMemo(() =>
    transactions
      .filter((t) => t.type === "income")
      .filter((t) => filterCat === "All" || t.category === filterCat)
      .filter((t) =>
        search.trim() === "" ||
        t.category.toLowerCase().includes(search.toLowerCase()) ||
        t.department.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      ),
    [transactions, search, filterCat]
  );

  const total = income.reduce((s, t) => s + t.amount, 0);
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

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: webTop + Math.max(insets.top, 20) + 14, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Income</Text>
            <Text style={[styles.count, { color: colors.mutedForeground }]}>{income.length} records</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.totalBadge, { backgroundColor: colors.income + "22" }]}>
              <Feather name="trending-up" size={12} color={colors.income} />
              <Text style={[styles.totalText, { color: colors.income }]}>{formatAmt(total)}</Text>
            </View>
            {canEdit && (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.income }]}
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
            placeholder="Search income..."
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

        {/* Categories Horizontal */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATS}
          keyExtractor={(c) => c}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: filterCat === c ? colors.income : colors.card,
                  borderColor: filterCat === c ? colors.income : colors.border,
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
        data={income}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 16) + 105 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
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
            <Feather name="arrow-up-circle" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No income records</Text>
            {canEdit && (
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: colors.income }]}
                onPress={openAdd}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.emptyAddText}>Add Income</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <AddTransactionModal
        visible={modalVisible}
        type="income"
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
});
