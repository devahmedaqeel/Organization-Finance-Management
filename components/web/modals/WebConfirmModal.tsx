import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/useColors";
import { SvgTrash, SvgX, SvgShield } from "../SvgIcons";

interface WebConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
}

export function WebConfirmModal({
  visible,
  onClose,
  onConfirm,
  title = "Confirm Deletion",
  message = "Are you sure you want to remove this record from the cloud ledger? This action cannot be undone.",
  confirmText = "Delete Record",
  cancelText = "Cancel",
  type = "danger",
}: WebConfirmModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const isDanger = type === "danger";
  const mainColor = isDanger ? colors.expense : colors.primary;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              maxWidth: isMobile ? "92%" : 460,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: mainColor + "18", borderColor: mainColor + "35" }]}>
              {isDanger ? <SvgTrash size={20} color={mainColor} /> : <SvgShield size={20} color={mainColor} />}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <SvgX size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
          </View>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: mainColor }]}
              onPress={() => {
                onConfirm();
                onClose();
              }}
              activeOpacity={0.85}
            >
              {isDanger && <SvgTrash size={14} color="#FFFFFF" />}
              <Text style={styles.confirmBtnText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 7, 18, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 22,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  message: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
