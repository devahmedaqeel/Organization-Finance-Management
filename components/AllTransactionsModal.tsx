import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "./UniversalIcon";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Transaction } from "@/context/FinanceContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { TransactionItem } from "./TransactionItem";

interface Props {
  visible: boolean;
  onClose: () => void;
  transactions: Transaction[];
  onSelectTransaction?: (tx: Transaction) => void;
}

export function AllTransactionsModal({ visible, onClose, transactions, onSelectTransaction }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");

  const fmt = (n: number) => {
    if (n >= 1000000) return `${settings.currency} ${(n / 1000000).toFixed(2)}M`;
    if (n >= 1000) return `${settings.currency} ${(n / 1000).toFixed(1)}K`;
    return `${settings.currency} ${n.toLocaleString()}`;
  };

  const totalInflows = useMemo(
    () => transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const totalOutflows = useMemo(
    () => transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const netTotal = totalInflows - totalOutflows;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return transactions.filter((t) => {
      const matchSearch =
        !q ||
        ((t as any).title && (t as any).title.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.department && t.department.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        String(t.amount).includes(q);

      const matchType = filterType === "all" || t.type === filterType;
      return matchSearch && matchType;
    });
  }, [transactions, search, filterType]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingTop: Platform.OS === "android" ? 14 : 10,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            },
          ]}
        >
          {/* Header Handle */}
          <View style={styles.handle} />

          {/* Modal Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.iconWrap, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="list" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>Total Transactions</Text>
                <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                  {transactions.length} Total Records · {settings.organizationName || "OFM Ledger"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.muted }]}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Metric Summary Cards */}
          <View style={styles.metricRow}>
            <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Total Inflows</Text>
              <Text style={[styles.metricVal, { color: colors.income }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>+{fmt(totalInflows)}</Text>
              <Text style={[styles.metricCount, { color: colors.mutedForeground }]}>
                {transactions.filter((t) => t.type === "income").length} Records
              </Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Total Outflows</Text>
              <Text style={[styles.metricVal, { color: colors.expense }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>-{fmt(totalOutflows)}</Text>
              <Text style={[styles.metricCount, { color: colors.mutedForeground }]}>
                {transactions.filter((t) => t.type === "expense").length} Records
              </Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Net Ledger</Text>
              <Text style={[styles.metricVal, { color: netTotal >= 0 ? colors.income : colors.expense }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {netTotal >= 0 ? "+" : ""}{fmt(netTotal)}
              </Text>
              <Text style={[styles.metricCount, { color: colors.mutedForeground }]}>Balance</Text>
            </View>
          </View>

          {/* Search Bar */}
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search title, category, department..."
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Feather name="x" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter Pills */}
          <View style={styles.filterRow}>
            {[
              { id: "all", label: `ALL (${transactions.length})` },
              { id: "income", label: `INFLOWS (${transactions.filter((t) => t.type === "income").length})` },
              { id: "expense", label: `OUTFLOWS (${transactions.filter((t) => t.type === "expense").length})` },
            ].map((f) => {
              const isActive = filterType === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: isActive ? colors.primary : colors.card,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFilterType(f.id as any);
                  }}
                >
                  <Text style={[styles.filterText, { color: isActive ? "#FFFFFF" : colors.mutedForeground }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Transactions List */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={() => (
              <View style={styles.emptyWrap}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="inbox" size={32} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Transactions Found</Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                  No ledger entries match your filter or search keywords.
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => onSelectTransaction?.(item)}
              >
                <TransactionItem item={item} />
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    height: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#666",
    alignSelf: "center",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16.5,
    fontFamily: "Inter_800ExtraBold",
  },
  sub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
  },
  metricCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  metricVal: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
  },
  metricCount: {
    fontSize: 9.5,
    fontFamily: "Inter_400Regular",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 10,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  listContainer: {
    paddingBottom: 40,
    gap: 8,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  emptyDesc: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 30,
  },
});
