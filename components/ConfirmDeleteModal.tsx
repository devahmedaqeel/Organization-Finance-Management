import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  TouchableWithoutFeedback,
} from "react-native";
import { Feather } from "./UniversalIcon";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  visible: boolean;
  title?: string;
  subtitle?: string;
  itemName?: string;
  itemDetails?: string;
  itemAmount?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDeleteModal({
  visible,
  title = "Delete Record",
  subtitle = "Are you sure you want to permanently remove this record?",
  itemName,
  itemDetails,
  itemAmount,
  confirmText = "Yes, Delete It",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.modalBox,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  paddingBottom: Math.max(insets.bottom, 16) + 8,
                },
              ]}
            >
              {/* Top Accent Warning / Trash Icon Glow */}
              <View style={styles.iconCircleOuter}>
                <View style={[styles.iconCircleInner, { backgroundColor: colors.expense + "20" }]}>
                  <Feather name="trash-2" size={26} color={colors.expense} />
                </View>
              </View>

              {/* Title & Subtitle */}
              <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>

              {/* Entity Highlight Badge Pill (if provided) */}
              {(itemName || itemAmount || itemDetails) && (
                <View
                  style={[
                    styles.entityCard,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    {itemName ? (
                      <Text style={[styles.entityName, { color: colors.foreground }]} numberOfLines={1}>
                        {itemName}
                      </Text>
                    ) : null}
                    {itemDetails ? (
                      <Text style={[styles.entityDetails, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {itemDetails}
                      </Text>
                    ) : null}
                  </View>
                  {itemAmount ? (
                    <View style={[styles.amountBadge, { backgroundColor: colors.expense + "15", borderColor: colors.expense + "30" }]}>
                      <Text style={[styles.amountText, { color: colors.expense }]}>{itemAmount}</Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Permanent Warning Note */}
              <View style={styles.warningNoteRow}>
                <Feather name="alert-triangle" size={13} color="#F59E0B" />
                <Text style={styles.warningNoteText}>
                  This action is permanent and cannot be undone.
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onCancel();
                  }}
                  activeOpacity={0.7}
                  disabled={loading}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>{cancelText}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: colors.expense }]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    onConfirm();
                  }}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  <Feather name="trash-2" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.confirmBtnText}>{loading ? "Deleting..." : confirmText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 24,
  },
  iconCircleOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  iconCircleInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 19,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  entityCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  entityName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  entityDetails: {
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
  },
  amountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  amountText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  warningNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  warningNoteText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#D97706",
  },
  btnRow: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  confirmBtn: {
    flex: 1.3,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
