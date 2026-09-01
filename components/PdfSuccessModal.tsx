/**
 * components/PdfSuccessModal.tsx
 *
 * Compact & Auto-Dismissing "Saved into File Manager" Toast Popup.
 * Auto-closes after 2 seconds or on tap.
 */

import React, { useEffect } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "./UniversalIcon";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onClose: () => void;
  filename: string;
  fileUri?: string;
  fileSize?: number;
  title?: string;
  subtitle?: string;
}

import { openPdfFile, sharePdfFile } from "@/services/pdfDownloadService";
import { showFloatingToast } from "@/utils/toast";

export function PdfSuccessModal({
  visible,
  onClose,
  filename,
  fileUri,
  title = "Saved into File Manager ✅",
  subtitle = "Official PDF dossier saved to your phone storage.",
}: Props) {
  const colors = useColors();

  // Trigger floating notification on display without auto-closing
  useEffect(() => {
    if (visible) {
      showFloatingToast("Saved into File Manager ✅", filename || "PDF saved to device storage.");
    }
  }, [visible, filename]);

  if (!visible) return null;

  const handleOpen = async () => {
    if (fileUri) {
      await openPdfFile(fileUri, filename);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Glowing Checkmark Badge */}
          <View style={styles.glowOuter}>
            <View style={styles.glowInner}>
              <Feather name="check" size={24} color="#FFFFFF" />
            </View>
          </View>

          {/* Title & Description */}
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
            {filename ? `${filename}\n${subtitle}` : subtitle}
          </Text>

          {/* Action Buttons: Single Direct Action & Close */}
          <View style={{ width: "100%", gap: 10, marginTop: 8 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#0284C7", paddingVertical: 13 }]}
              onPress={async () => {
                const { Linking } = require("react-native");
                try {
                  const WebBrowser = require("expo-web-browser");
                  await WebBrowser.openBrowserAsync("https://ofmapp-main.web.app");
                } catch {
                  await Linking.openURL("https://ofmapp-main.web.app");
                }
              }}
              activeOpacity={0.85}
            >
              <Feather name="file-text" size={17} color="#FFFFFF" />
              <Text style={[styles.actionBtnText, { color: "#FFFFFF", fontSize: 14.5 }]}>
                Open Official PDF Dossier
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.border, paddingVertical: 12 }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Feather name="x" size={16} color={colors.foreground} />
              <Text style={[styles.actionBtnText, { color: colors.foreground, fontSize: 13.5 }]}>Close</Text>
            </TouchableOpacity>
          </View>

        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  glowOuter: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(16, 185, 129, 0.16)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  glowInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  title: {
    fontSize: 17.5,
    fontFamily: "Inter_800ExtraBold",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionBtnText: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  closeBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  closeBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
});
