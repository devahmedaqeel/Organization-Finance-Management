import { Feather } from "./UniversalIcon";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  label: string;
  value: string;
  icon: any;
  color?: string;
  subtitle?: string;
  flex?: number;
}

export function StatCard({ label, value, icon, color, subtitle, flex = 1 }: StatCardProps) {
  const colors = useColors();
  const accentColor = color ?? colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, flex }]}>
      <View style={[styles.iconWrap, { backgroundColor: accentColor + "22" }]}>
        <Feather name={icon} size={18} color={accentColor} />
      </View>
      <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: accentColor }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    minWidth: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
