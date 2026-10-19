/**
 * components/PdfSuccessModal.tsx
 *
 * Shown after a PDF is generated: Open it, Share it as a real PDF attachment, or Save it to the phone.
 * Every action reports its result (or a readable error) inside the card.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "./UniversalIcon";
import { useColors } from "@/hooks/useColors";
import { PdfViewerModal } from "./PdfViewerModal";
import {
  getPdfSaveFolderLabel,
  openPdfFile,
  resetPdfSaveFolder,
  savePdfToPhone,
  sharePdfFile,
} from "@/services/pdfDownloadService";

interface Props {
  visible: boolean;
  onClose: () => void;
  filename: string;
  fileUri?: string;
  fileSize?: number;
  title?: string;
  subtitle?: string;
}

type Action = "open" | "share" | "save";
type Status = { kind: "ok" | "error" | "info"; text: string } | null;

function formatSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfSuccessModal({
  visible,
  onClose,
  filename,
  fileUri,
  fileSize,
  title = "PDF Ready ✓",
  subtitle = "Your PDF has been created.",
}: Props) {
  const colors = useColors();
  const [busy, setBusy] = useState<Action | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [saveFolder, setSaveFolder] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStatus(null);
    setBusy(null);
    getPdfSaveFolderLabel().then(setSaveFolder).catch(() => setSaveFolder(null));
  }, [visible, fileUri]);

  if (!visible) return null;
  const isWeb = Platform.OS === "web";
  const sizeLabel = formatSize(fileSize);

  // One action at a time: a second tap while a share sheet is opening causes "already in progress" errors
  const run = async (action: Action, fn: () => Promise<Status>) => {
    if (busy || !fileUri) return;
    setBusy(action);
    setStatus(null);
    try {
      const result = await fn();
      if (result) setStatus(result);
    } catch (err: any) {
      setStatus({ kind: "error", text: err?.message || "Something went wrong. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  const handleOpen = () =>
    run("open", async () => {
      if (Platform.OS === "ios") {
        setViewerVisible(true);
        return null;
      }
      const method = await openPdfFile(fileUri!, filename);
      return method === "share-sheet"
        ? { kind: "info", text: "No PDF viewer app found. Pick an app (e.g. Drive) to open the file." }
        : null;
    });

  const handleShare = () =>
    run("share", async () => {
      await sharePdfFile(fileUri!, filename);
      return null;
    });

  const handleSave = () =>
    run("save", async () => {
      const res = await savePdfToPhone(fileUri!, filename);
      if (res.method === "folder") setSaveFolder(await getPdfSaveFolderLabel());
      return { kind: res.saved ? (res.method === "share-sheet" ? "info" : "ok") : "info", text: res.message };
    });

  const handleChangeFolder = async () => {
    await resetPdfSaveFolder();
    setSaveFolder(null);
    handleSave();
  };

  const statusColor = status?.kind === "error" ? colors.expense : status?.kind === "ok" ? colors.income : colors.primary;
  const statusIcon = status?.kind === "error" ? "alert-circle" : status?.kind === "ok" ? "check-circle" : "info";

  const buttons: Array<{ key: Action; label: string; busyLabel: string; icon: string; color: string; onPress: () => void }> = [
    { key: "open", label: isWeb ? "Open PDF" : "Open PDF", busyLabel: "Opening…", icon: "eye", color: "#0284C7", onPress: handleOpen },
    { key: "share", label: "Share (WhatsApp, Gmail…)", busyLabel: "Opening share…", icon: "share-2", color: "#6366F1", onPress: handleShare },
    {
      key: "save",
      label: Platform.OS === "ios" ? "Save to Files" : "Save to phone",
      busyLabel: "Saving…",
      icon: "download",
      color: "#0D9488",
      onPress: handleSave,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={busy ? undefined : onClose}>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.glowOuter}>
            <View style={styles.glowInner}>
              <Feather name="check" size={24} color="#FFFFFF" />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>

          {filename ? (
            <View style={[styles.fileRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={[styles.fileIcon, { backgroundColor: colors.expense + "18" }]}>
                <Feather name="file-text" size={16} color={colors.expense} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={2}>{filename}</Text>
                <Text style={[styles.fileMeta, { color: colors.mutedForeground }]}>
                  PDF{sizeLabel ? ` · ${sizeLabel}` : ""}
                </Text>
              </View>
            </View>
          ) : null}

          {fileUri && !isWeb ? (
            <View style={{ width: "100%", gap: 9 }}>
              {buttons.map((b) => {
                const isBusy = busy === b.key;
                const disabled = !!busy && !isBusy;
                return (
                  <TouchableOpacity
                    key={b.key}
                    style={[styles.actionBtn, { backgroundColor: b.color, opacity: disabled ? 0.5 : 1 }]}
                    onPress={b.onPress}
                    disabled={!!busy}
                    activeOpacity={0.85}
                  >
                    {isBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name={b.icon as any} size={17} color="#FFFFFF" />}
                    <Text style={styles.actionBtnText}>{isBusy ? b.busyLabel : b.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {Platform.OS === "android" && saveFolder ? (
            <TouchableOpacity onPress={handleChangeFolder} disabled={!!busy} style={styles.folderRow} hitSlop={6}>
              <Feather name="folder" size={13} color={colors.mutedForeground} />
              <Text style={[styles.folderText, { color: colors.mutedForeground }]} numberOfLines={1}>
                Saves to {saveFolder} ·{" "}
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Change folder</Text>
              </Text>
            </TouchableOpacity>
          ) : null}

          {status ? (
            <View style={[styles.statusBox, { backgroundColor: statusColor + "14", borderColor: statusColor + "40" }]}>
              <Feather name={statusIcon as any} size={15} color={statusColor} style={{ marginTop: 1 }} />
              <Text style={[styles.statusText, { color: colors.foreground }]}>{status.text}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.closeBtn, { borderColor: colors.border }]}
            onPress={onClose}
            disabled={!!busy}
            activeOpacity={0.85}
          >
            <Text style={[styles.closeBtnText, { color: colors.foreground }]}>Done</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Nested so iOS can present it on top of this modal */}
      {Platform.OS === "ios" && fileUri ? (
        <PdfViewerModal
          visible={viewerVisible}
          onClose={() => setViewerVisible(false)}
          uri={fileUri}
          filename={filename}
          onShare={() => {
            sharePdfFile(fileUri, filename).catch((err: any) =>
              setStatus({ kind: "error", text: err?.message || "Unable to share the PDF." })
            );
          }}
        />
      ) : null}
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
    maxWidth: 360,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 12,
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
  },
  glowInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 18, fontFamily: "Inter_800ExtraBold", textAlign: "center", letterSpacing: -0.2, marginTop: -2 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19, marginTop: -6 },
  fileRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  fileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 17 },
  fileMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionBtn: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_700Bold" },
  folderRow: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  folderText: { fontSize: 12, fontFamily: "Inter_400Regular", flexShrink: 1 },
  statusBox: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 12, padding: 10 },
  statusText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  closeBtn: { width: "100%", height: 46, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  closeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
