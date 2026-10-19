import { Feather } from "@/components/UniversalIcon";
import { screenTopPadding } from "@/utils/layout";
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
import { can } from "@/services/permissionService";
import { useSettings } from "@/context/SettingsContext";
import { LinearGradient } from "expo-linear-gradient";

const CATS = ["All", "Government Grant", "Fee Collection", "Research Grant", "Donation", "Other"];

export default function IncomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useFinance();
  const { settings } = useSettings();

  const formatAmt = (n: number) => {
    return `${settings.currency} ${Number(n || 0).toLocaleString()}`;
  };

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState<Transaction | null>(null);

  const canEdit = can(user, "edit_transaction");

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
      <View style={[styles.header, { paddingTop: webTop + screenTopPadding(insets.top), backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Inflow</Text>
            <Text style={[styles.count, { color: colors.mutedForeground }]}>Money received by your organization</Text>
          </View>
          {canEdit && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.income, shadowColor: colors.income }]}
              onPress={openAdd}
              activeOpacity={0.85}
              accessibilityLabel="Add inflow"
            >
              <Feather name="plus" size={17} color="#fff" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Summary card */}
        <LinearGradient
          colors={colors.isDark ? ["#064E3B", "#065F46"] : ["#059669", "#10B981"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.summaryCard}
        >
          <View style={styles.summaryIcon}>
            <Feather name="trending-up" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.summaryLabel}>{filterCat === "All" ? "TOTAL INFLOW" : filterCat.toUpperCase()}</Text>
            <Text style={styles.summaryValue} numberOfLines={Platform.OS === "web" ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {formatAmt(total)}
            </Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryPillText}>{income.length} {income.length === 1 ? "record" : "records"}</Text>
          </View>
        </LinearGradient>

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search inflow..."
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
        contentContainerStyle={[styles.list, { paddingBottom: 24 }]}
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
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No inflow records yet.</Text>
            {canEdit && (
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: colors.income }]}
                onPress={openAdd}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.emptyAddText}>Add Inflow</Text>
              </TouchableOpacity>
            )}
          </View>
        }
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
  header: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, gap: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  count: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    paddingHorizontal: 14, height: 38, borderRadius: 19,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  addBtnText: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  summaryCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, borderRadius: 20,
  },
  summaryIcon: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  summaryLabel: { color: "rgba(255,255,255,0.88)", fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  summaryValue: { color: "#FFFFFF", fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.4, marginTop: 2 },
  summaryPill: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  summaryPillText: { color: "#FFFFFF", fontSize: 12, fontFamily: "Inter_700Bold" },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, height: 44, borderRadius: 14, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
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
