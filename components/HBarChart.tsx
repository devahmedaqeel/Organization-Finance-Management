import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View, Animated, Easing, Platform } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface HBarItem {
  label: string;
  value: number;
  color: string;
  sublabel?: string;
}

interface Props {
  items: HBarItem[];
  formatValue?: (v: number) => string;
  currency?: string;
  maxConstraint?: number;
  labelWidth?: number;
}

function defaultFmt(v: number) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString();
}

function AnimatedBarRow({
  item,
  maxVal,
  formatValue,
  index,
  labelWidth,
}: {
  item: HBarItem;
  maxVal: number;
  formatValue: (v: number) => string;
  index: number;
  labelWidth: number;
}) {
  const colors = useColors();
  const pct = Math.min(Math.max((item.value / maxVal) * 100, 0), 100);
  const animWidth = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: pct,
      duration: 600 + index * 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, index]);

  const animatedWidthStr = animWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.row}>
      <View style={[styles.labelCol, { width: labelWidth }]}>
        <Text style={[styles.label, { color: colors.foreground }]} numberOfLines={1}>
          {item.label}
        </Text>
        {item.sublabel ? (
          <Text style={[styles.sublabel, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.sublabel}
          </Text>
        ) : null}
      </View>

      <View style={styles.barWrap}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <Animated.View
            style={[
              styles.fill,
              {
                width: animatedWidthStr,
                backgroundColor: item.color,
              },
            ]}
          />
        </View>
      </View>

      <Text style={[styles.value, { color: item.color }]} numberOfLines={1}>
        {formatValue(item.value)}
      </Text>
    </View>
  );
}

export function HBarChart({
  items,
  formatValue = defaultFmt,
  maxConstraint,
  labelWidth = Platform.OS === "web" ? 180 : 120,
}: Props) {
  if (!items || items.length === 0) {
    return (
      <View style={{ paddingVertical: 14, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>
          No records found for this period
        </Text>
      </View>
    );
  }

  const maxVal = Math.max(...items.map((i) => i.value), maxConstraint || 1, 1);

  return (
    <View style={styles.container}>
      {items.map((item, i) => (
        <AnimatedBarRow
          key={`${item.label}-${i}`}
          item={item}
          maxVal={maxVal}
          formatValue={formatValue}
          index={i}
          labelWidth={labelWidth}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 11 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  labelCol: {
    width: 100,
    justifyContent: "center",
  },
  label: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
  sublabel: {
    fontSize: 9.5,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  barWrap: { flex: 1 },
  track: {
    height: 9,
    borderRadius: 5,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 5,
  },
  value: {
    minWidth: 62,
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
});
