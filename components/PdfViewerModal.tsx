import React from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "./UniversalIcon";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onClose: () => void;
  uri: string;
  filename: string;
  onShare?: () => void;
}

/**
 * In-app PDF reader for iOS: WKWebView renders local PDFs natively (pages, pinch-zoom, scrolling).
 * Android WebView cannot render PDFs, so Android opens the phone's PDF app via openPdfFile instead.
 */
export function PdfViewerModal({ visible, onClose, uri, filename, onShare }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const { WebView } = require("react-native-webview");

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Platform.OS === "ios" ? insets.top : 12 }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            accessibilityLabel="Close PDF"
          >
            <Feather name="x" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{filename}</Text>
          {onShare ? (
            <TouchableOpacity
              onPress={onShare}
              style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              accessibilityLabel="Share PDF"
            >
              <Feather name="share" size={17} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
        <WebView
          source={{ uri }}
          originWhitelist={["*"]}
          allowingReadAccessToURL={FileSystem.documentDirectory || undefined}
          allowFileAccess
          style={{ flex: 1, backgroundColor: "#E5E7EB" }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "center" },
});
