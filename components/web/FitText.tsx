import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextProps, TextStyle } from "react-native";

/**
 * Single-line text that shrinks its font (down to `minSize`) so the whole string fits its column.
 * Web measures the string with a canvas; native falls back to adjustsFontSizeToFit.
 * Display-only: it never changes the data passed in.
 */
let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, size: number, weight: number) {
  if (typeof document === "undefined") return 0;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${weight} ${size}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;
  return ctx.measureText(text).width;
}

const WEIGHT: Record<string, number> = {
  Inter_400Regular: 400,
  Inter_500Medium: 500,
  Inter_600SemiBold: 600,
  Inter_700Bold: 600, // webStyles renders 700 as 600
  Inter_800ExtraBold: 700,
};

export function FitText({
  children,
  style,
  minSize = 11,
  ...rest
}: TextProps & { minSize?: number; children?: React.ReactNode }) {
  const [width, setWidth] = useState(0);
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  const base = Number(flat.fontSize) || 13;
  const text = React.Children.toArray(children).join("");

  let size = base;
  if (Platform.OS === "web" && width > 0) {
    const needed = measure(text, base, WEIGHT[String(flat.fontFamily)] || 400);
    if (needed > width) size = Math.max(minSize, Math.floor(((base * width) / needed) * 10) / 10);
  }

  return (
    <Text
      {...rest}
      onLayout={(e) => {
        const w = Math.floor(e.nativeEvent.layout.width);
        if (Math.abs(w - width) > 1) setWidth(w);
      }}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={minSize / base}
      style={[style, { fontSize: size, lineHeight: Math.round(size * 1.4) }]}
    >
      {text}
    </Text>
  );
}

/**
 * Splits long system-generated descriptions into a short title + a detail line.
 * "Staff payroll disbursement for Ahmed (EMP355). Base: 1000, Bonus: 2100, Deductions: 390"
 *   → title "Payroll · Ahmed (EMP355)", detail "Base 1,000 · Bonus 2,100 · Deductions 390"
 */
export function splitDescription(desc?: string | null): { title: string; detail: string } {
  const d = (desc || "").trim();
  if (!d) return { title: "No description", detail: "" };
  const m = d.match(/^Staff payroll disbursement for (.+?)\s*\(([^)]+)\)\.?\s*(.*)$/i);
  if (m) {
    const parts = (m[3] || "")
      .split(/,\s*/)
      .map((p) => p.trim().replace(/[.:]$/, ""))
      .filter(Boolean)
      .map((p) => p.replace(/^([A-Za-z ]+):\s*(-?\d+(?:\.\d+)?)$/, (_, k, v) => `${k} ${Number(v).toLocaleString()}`));
    return { title: `Payroll · ${m[1]} (${m[2]})`, detail: parts.join(" · ") };
  }
  return { title: d, detail: "" };
}
