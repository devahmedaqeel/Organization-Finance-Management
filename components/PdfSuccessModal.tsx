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

import { openPdfFile, sharePdfFile, saveToPhoneFileManager } from "@/services/pdfDownloadService";
import { showFloatingToast } from "@/utils/toast";

export function PdfSuccessModal({
  visible,
  onClose,
  filename,
  fileUri,
  title = "PDF Ready ✓",
  subtitle = "Your PDF has been downloaded successfully.",
}: Props) {
  const colors = useColors();

  // Trigger floating notification on display without auto-closing
  useEffect(() => {
    if (visible) {
      showFloatingToast("PDF Ready ✓", filename || "Your PDF has been downloaded successfully.");
    }
  }, [visible, filename]);

  if (!visible) return null;

  const handleOpen = async () => {
    if (fileUri) {
      await openPdfFile(fileUri, filename);
    }
  };

  const handleShare = async () => {
    if (fileUri) {
      await sharePdfFile(fileUri, filename);
    }
  };

  const handleSaveToFileManager = async () => {
    if (fileUri) {
      const saved = await saveToPhoneFileManager(fileUri, filename);
      if (saved) {
        showFloatingToast("Saved to Storage ✓", "PDF file saved to device storage.");
      }
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

          {/* Action Buttons: Open PDF, Share, Save to File Manager, & Close */}
          <View style={{ width: "100%", gap: 9, marginTop: 8 }}>
            {fileUri ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#0284C7", paddingVertical: 12 }]}
                onPress={handleOpen}
                activeOpacity={0.85}
              >
                <Feather name="file-text" size={16} color="#FFFFFF" />
                <Text style={[styles.actionBtnText, { color: "#FFFFFF", fontSize: 14 }]}>
                  Open PDF
                </Text>
              </TouchableOpacity>
            ) : null}

            {fileUri ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#6366F1", paddingVertical: 12 }]}
                onPress={handleShare}
                activeOpacity={0.85}
              >
                <Feather name="share-2" size={16} color="#FFFFFF" />
                <Text style={[styles.actionBtnText, { color: "#FFFFFF", fontSize: 14 }]}>
                  Share
                </Text>
              </TouchableOpacity>
            ) : null}

            {fileUri ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#0D9488", paddingVertical: 12 }]}
                onPress={handleSaveToFileManager}
                activeOpacity={0.85}
              >
                <Feather name="folder" size={16} color="#FFFFFF" />
                <Text style={[styles.actionBtnText, { color: "#FFFFFF", fontSize: 14 }]}>
                  Save to File Manager
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.border, paddingVertical: 11, marginTop: 2 }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Feather name="x" size={15} color={colors.foreground} />
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
