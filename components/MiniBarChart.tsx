import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface BarData {
  label: string;
  income: number;
  expense: number;
}

interface MiniBarChartProps {
  data: BarData[];
  height?: number;
}

export function MiniBarChart({ data, height = 120 }: MiniBarChartProps) {
  const colors = useColors();
  const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1);

  return (
    <View style={styles.container}>
      <View style={[styles.chart, { height }]}>
        {data.map((d) => (
          <View key={d.label} style={styles.group}>
            <View style={styles.bars}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max((d.income / maxVal) * height * 0.85, 4),
                    backgroundColor: colors.income,
                    borderRadius: 4,
                  },
                ]}
              />
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max((d.expense / maxVal) * height * 0.85, 4),
                    backgroundColor: colors.expense,
                    borderRadius: 4,
                  },
                ]}
              />
            </View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{d.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.income }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Income</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.expense }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Expense</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  group: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  bar: {
    width: 10,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
