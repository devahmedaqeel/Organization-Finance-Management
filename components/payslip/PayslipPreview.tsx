import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, Platform, StyleProp, View, ViewStyle } from "react-native";

const PX_PER_MM = 96 / 25.4;

/**
 * On phones the A4/Letter sheet is much wider than the screen. Instead of squeezing
 * the sheet (which breaks table alignment), keep its true page width and zoom the
 * whole sheet down to fit — exactly like a PDF viewer. Pinch-zoom still works.
 */
function fitSheetToWidth(html: string, viewWidth: number): string {
  if (!viewWidth) return html;
  const m = html.match(/\.sheet\s*\{[^}]*?width:\s*([\d.]+)mm/);
  if (!m) return html;
  const sheetPx = parseFloat(m[1]) * PX_PER_MM;
  const available = viewWidth - 16;
  if (!sheetPx || available >= sheetPx) return html;
  const zoom = (available / sheetPx).toFixed(4);
  const css = `<style>body{padding:8px 8px 16px 8px !important;}.sheet{max-width:none !important;width:${sheetPx.toFixed(1)}px !important;zoom:${zoom};margin:0 auto 12px auto !important;}</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${css}</head>`) : css + html;
}

/**
 * Renders payslip HTML exactly as the PDF engine will: an iframe on web and a
 * WebView on mobile. Both receive the same HTML from renderPayslipDocument().
 */
export function PayslipPreview({ html, style }: { html: string; style?: StyleProp<ViewStyle> }) {
  const [viewWidth, setViewWidth] = useState(0);
  const fittedHtml = useMemo(() => fitSheetToWidth(html, viewWidth), [html, viewWidth]);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && Math.abs(w - viewWidth) > 2) setViewWidth(w);
  };

  if (Platform.OS === "web") {
    return (
      <View style={[{ flex: 1, backgroundColor: "#E5E7EB" }, style]} onLayout={onLayout}>
        {React.createElement("iframe", {
          title: "Payslip preview",
          srcDoc: fittedHtml,
          sandbox: "allow-same-origin",
          style: { width: "100%", height: "100%", border: "none", backgroundColor: "#E5E7EB" },
        })}
      </View>
    );
  }
  // Loaded lazily so the web bundle never pulls in the native module.
  const { WebView } = require("react-native-webview");
  return (
    <View
      style={[{ flex: 1, backgroundColor: "#E5E7EB" }, style]}
      onLayout={onLayout}
    >
      {viewWidth ? (
        <WebView
          originWhitelist={["*"]}
          source={{ html: fittedHtml }}
          javaScriptEnabled={false}
          scalesPageToFit
          setBuiltInZoomControls
          setDisplayZoomControls={false}
          nestedScrollEnabled
          style={{ flex: 1, backgroundColor: "#E5E7EB" }}
        />
      ) : null}
    </View>
  );
}
