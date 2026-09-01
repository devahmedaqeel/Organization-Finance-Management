import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  color?: string;
  formatValue?: (v: number) => string;
}

function fmt(v: number) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toString();
}

export function ProgressBar({ label, value, max, color, formatValue = fmt }: ProgressBarProps) {
  const colors = useColors();
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor = color ?? (pct > 85 ? colors.expense : pct > 60 ? colors.warning : colors.income);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.values, { color: colors.mutedForeground }]}>
          {formatValue(value)} / {formatValue(max)}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.pct, { color: barColor }]}>{pct.toFixed(0)}% used</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  values: { fontSize: 12, fontFamily: "Inter_400Regular" },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
  pct: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
