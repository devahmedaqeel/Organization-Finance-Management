import React, { useMemo } from "react";
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "./UniversalIcon";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The exact HTML the PDF engine prints, so the preview matches the downloaded file. */
  html: string;
  title: string;
  subtitle?: string;
  onDownload: () => void;
  /** Builds the PDF and opens the phone's share sheet */
  onShare?: () => void;
  busy?: boolean;
}

/** A4 page width in CSS px; the report is laid out at this width and zoomed to fit the phone, like a PDF viewer. */
const A4_LAYOUT_WIDTH = 820;

function toPrintLayout(html: string): string {
  const css = "<style>.no-print{display:none !important;} body{background:#E5E7EB !important;}</style>";
  return html
    .replace(/<meta name="viewport"[^>]*>/i, `<meta name="viewport" content="width=${A4_LAYOUT_WIDTH}">`)
    .replace("</head>", `${css}</head>`);
}

export function ReportHtmlPreviewModal({ visible, onClose, html, title, subtitle, onDownload, onShare, busy }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pageHtml = useMemo(() => toPrintLayout(html), [html]);

  if (!visible) return null;
  // Loaded lazily so the web bundle never pulls in the native module.
  const { WebView } = require("react-native-webview");

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Platform.OS === "android" ? 12 : insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            accessibilityLabel="Close preview"
          >
            <Feather name="x" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {subtitle || "Preview · this is exactly what the PDF will contain"}
            </Text>
          </View>
        </View>

        <View style={styles.page}>
          <WebView
            originWhitelist={["*"]}
            source={{ html: pageHtml }}
            javaScriptEnabled={false}
            scalesPageToFit
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            nestedScrollEnabled
            style={{ flex: 1, backgroundColor: "#E5E7EB" }}
          />
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Pinch to zoom · scroll to see every page</Text>
          <View style={styles.footerRow}>
            {onShare ? (
              <TouchableOpacity
                style={[styles.shareBtn, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "12", opacity: busy ? 0.6 : 1 }]}
                onPress={onShare}
                disabled={busy}
                activeOpacity={0.85}
                accessibilityLabel="Share this PDF"
              >
                <Feather name="share-2" size={17} color={colors.primary} />
                <Text style={[styles.shareText, { color: colors.primary }]}>Share</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.downloadBtn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
              onPress={onDownload}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="download" size={17} color="#FFFFFF" />}
              <Text style={styles.downloadText}>{busy ? "Generating PDF…" : "Download this PDF"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  closeBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  page: { flex: 1, backgroundColor: "#E5E7EB" },
  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  footerRow: { flexDirection: "row", gap: 10 },
  shareBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, borderWidth: 1 },
  shareText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  downloadBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14 },
  downloadText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_700Bold" },
});
