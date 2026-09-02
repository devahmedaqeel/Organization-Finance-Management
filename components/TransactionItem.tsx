import { Feather } from "./UniversalIcon";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Platform } from "react-native";
import { Transaction } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

const CATEGORY_ICONS: Record<string, string> = {
  "Government Grant": "award",
  "Fee Collection": "dollar-sign",
  "Research Grant": "book-open",
  Donation: "heart",
  Salaries: "users",
  Utilities: "zap",
  Equipment: "monitor",
  Research: "activity",
  Maintenance: "tool",
  Travel: "navigation",
  Marketing: "trending-up",
  Software: "code",
  Supplies: "box",
  Consulting: "briefcase",
  Other: "circle",
};

interface TransactionItemProps extends Partial<Transaction> {
  item?: Transaction;
  transaction?: Transaction;
  onDelete?: (id: string) => void;
  onEdit?: (item: Transaction) => void;
  canDelete?: boolean;
}

export function TransactionItem(props: TransactionItemProps) {
  const { item, transaction, onDelete, onEdit, canDelete } = props;
  const colors = useColors();
  const { settings } = useSettings();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Support item prop, transaction prop, or directly spread props
  const tx: Transaction | undefined =
    (item && item.type ? item : undefined) ||
    (transaction && transaction.type ? transaction : undefined) ||
    (props.type && props.amount !== undefined ? (props as Transaction) : undefined);

  if (!tx || !tx.type) return null;

  const formatAmountVal = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return Number(n || 0).toLocaleString();
  };

  const isIncome = tx.type === "income";
  const amountColor = isIncome ? colors.income : colors.expense;
  const icon = CATEGORY_ICONS[tx.category] ?? "file-text";

  const handleDelete = () => {
    if (!onDelete) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDeleteModal(true);
  };

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: amountColor + "18", borderColor: amountColor + "33" }]}>
        <Feather name={icon} size={16} color={amountColor} />
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.category, { color: colors.foreground }]} numberOfLines={1}>
          {tx.title || tx.category}
        </Text>
        <Text style={[styles.dept, { color: colors.mutedForeground }]} numberOfLines={1}>
          {tx.department || "General"} · {formatDate(tx.date)}
        </Text>
        {tx.description ? (
          <Text style={[styles.desc, { color: colors.mutedForeground }]} numberOfLines={1}>
            {tx.description}
          </Text>
        ) : null}
      </View>

      {/* Amount + Actions */}
      <View style={styles.right}>
        <Text style={[styles.amount, { color: amountColor }]}>
          {isIncome ? "+" : "-"}{settings.currency} {formatAmountVal(tx.amount)}
        </Text>

        {canDelete && (
          <View style={styles.actions}>
            {onEdit && (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== "web") {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  }
                  onEdit(tx);
                }}
                hitSlop={12}
                style={[styles.actionBtn, { backgroundColor: amountColor + "18" }]}
              >
                <Feather name="edit-2" size={14} color={amountColor} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                onPress={handleDelete}
                hitSlop={12}
                style={[styles.actionBtn, { backgroundColor: colors.expense + "18" }]}
              >
                <Feather name="trash-2" size={14} color={colors.expense} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Ultra-Premium Custom Delete Confirmation Modal */}
      <ConfirmDeleteModal
        visible={showDeleteModal}
        title={`Delete ${isIncome ? "Income" : "Expense"}`}
        subtitle={`Are you sure you want to permanently delete this ${isIncome ? "income credit" : "expense debit"} transaction?`}
        itemName={tx.title || tx.category}
        itemDetails={`${tx.department || "General"} · ${formatDate(tx.date)}`}
        itemAmount={`${isIncome ? "+" : "-"}${settings.currency} ${formatAmountVal(tx.amount)}`}
        confirmText="Yes, Delete It"
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={() => {
          setShowDeleteModal(false);
          if (onDelete) onDelete(tx.id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  info: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  category: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  dept: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  desc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  right: {
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  amount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  actions: {
    flexDirection: "row",
    gap: 6,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
