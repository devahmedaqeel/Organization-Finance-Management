import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  Platform,
  Animated,
} from "react-native";
import Svg, { Path, G, Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSub?: string;
  currency?: string;
  showChips?: boolean;
  showLegend?: boolean;
  selectedLabel?: string | null;
  onSelectLabel?: (label: string | null) => void;
  selectedIndex?: number | null;
  onSelectIndex?: (index: number | null) => void;
}

function fmtVal(n: number) {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) {
    const val = n / 1000;
    return val % 1 === 0 ? `${val.toFixed(0)}K` : `${val.toFixed(1)}K`;
  }
  return n.toLocaleString();
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArcSector(
  x: number,
  y: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const angleDiff = endAngle - startAngle;
  if (angleDiff <= 0) return "";

  const startOuter = polarToCartesian(x, y, outerRadius, startAngle);
  const endOuter = polarToCartesian(x, y, outerRadius, endAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);

  const largeArcFlag = angleDiff <= 180 ? "0" : "1";

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${endInner.x} ${endInner.y}`,
    `Z`,
  ].join(" ");
}

export function DonutChart({
  segments,
  size = 136,
  strokeWidth = 14,
  centerLabel,
  centerSub = "total",
  currency = "PKR",
  showChips = true,
  showLegend = true,
  selectedLabel,
  onSelectLabel,
  selectedIndex,
  onSelectIndex,
}: Props) {
  const colors = useColors();
  const [internalIndex, setInternalIndex] = useState<number | null>(null);

  // Smooth spring scale & opacity animation for interactive center feedback
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // Controlled or uncontrolled selection
  const effectiveIndex = useMemo(() => {
    if (selectedIndex !== undefined && selectedIndex !== null) return selectedIndex;
    if (selectedLabel !== undefined) {
      if (!selectedLabel) return null;
      const idx = segments.findIndex(
        (s) => s.label.trim().toLowerCase() === selectedLabel.trim().toLowerCase()
      );
      return idx >= 0 ? idx : null;
    }
    return internalIndex;
  }, [selectedIndex, selectedLabel, segments, internalIndex]);

  useEffect(() => {
    scaleAnim.setValue(0.88);
    opacityAnim.setValue(0.35);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [effectiveIndex]);

  const setEffectiveIndex = (idx: number | null) => {
    setInternalIndex(idx);
    if (onSelectIndex) {
      onSelectIndex(idx);
    }
    if (onSelectLabel) {
      const label = idx !== null && idx < segments.length ? segments[idx].label : null;
      onSelectLabel(label);
    }
  };

  const center = size / 2;
  const outerRadius = size / 2 - 4;
  const innerRadius = outerRadius - strokeWidth;
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  const safeTotal = total > 0 ? total : 1;

  // Typography mathematically proportional to donut diameter
  const amountFontSize = Math.max(13, Math.min(16, Math.round(size * 0.105)));
  const catFontSize = Math.max(9.5, Math.min(11.5, Math.round(size * 0.075)));
  const pctFontSize = Math.max(8.5, Math.min(10, Math.round(size * 0.065)));

  // Compute exact arc sectors with clean gaps
  const computedSlices = useRef<
    {
      index: number;
      label: string;
      value: number;
      color: string;
      pct: number;
      startAngle: number;
      endAngle: number;
      midAngle: number;
      path: string;
    }[]
  >([]);

  // Proportional arc calculation with guaranteed minimum visual span for small categories
  const MIN_SLICE_DEGREES = 22;
  const nonZeroSegments = segments.filter((s) => (s.value || 0) > 0);
  const numNonZero = nonZeroSegments.length;
  const gap = numNonZero > 1 ? 2.5 : 0;
  const totalGap = gap * numNonZero;
  const totalAvail = Math.max(0, 360 - totalGap);

  // Compute visual spans ensuring small categories (< MIN_SLICE_DEGREES) are clearly visible
  let smallDegreesNeeded = 0;
  let largeDegreesSum = 0;

  const rawSpans = segments.map((seg) => {
    const val = seg.value || 0;
    return total > 0 && val > 0 ? (val / safeTotal) * totalAvail : 0;
  });

  const isSmall = rawSpans.map((span, i) => {
    const val = segments[i].value || 0;
    if (val <= 0) return false;
    if (numNonZero > 1 && span < MIN_SLICE_DEGREES) {
      smallDegreesNeeded += MIN_SLICE_DEGREES;
      return true;
    }
    largeDegreesSum += span;
    return false;
  });

  const remainingForLarge = Math.max(0, totalAvail - smallDegreesNeeded);
  const visualSpans = rawSpans.map((span, i) => {
    const val = segments[i].value || 0;
    if (val <= 0) return 0;
    if (numNonZero === 1) return 359.99;
    if (isSmall[i]) return MIN_SLICE_DEGREES;
    return largeDegreesSum > 0 ? (span / largeDegreesSum) * remainingForLarge : span;
  });

  let currentAngle = 0;
  const sliceList: typeof computedSlices.current = [];

  segments.forEach((seg, i) => {
    const val = seg.value || 0;
    if (val <= 0) return;
    const span = visualSpans[i];
    if (span <= 0) return;

    const startA = currentAngle;
    const endA = currentAngle + (numNonZero === 1 ? 359.99 : span);
    const midA = (startA + endA) / 2;

    const isSelected = effectiveIndex === i;
    // Keep outer and inner radius uniform so the selected slice never protrudes outside the circle track
    const sliceOuterRadius = outerRadius;
    const sliceInnerRadius = innerRadius;

    const path = describeArcSector(
      center,
      center,
      sliceInnerRadius,
      sliceOuterRadius,
      startA,
      endA
    );

    sliceList.push({
      index: i,
      label: seg.label,
      value: seg.value,
      color: seg.color,
      pct: total > 0 ? seg.value / safeTotal : 0,
      startAngle: startA,
      endAngle: endA + gap,
      midAngle: midA,
      path,
    });

    currentAngle += span + gap;
  });

  computedSlices.current = sliceList;

  // Touch gesture around the circle to select slices
  const handleTouchAtPoint = (touchX: number, touchY: number) => {
    const dx = touchX - center;
    const dy = touchY - center;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Check if touching inside the ring area
    if (dist < innerRadius - 8 || dist > outerRadius + 8) {
      return;
    }

    // Convert to angle (0-360 starting from top)
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;

    const found = sliceList.find(
      (s) => deg >= s.startAngle && deg < s.endAngle
    );

    if (found && found.index !== effectiveIndex) {
      setEffectiveIndex(found.index);
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt: GestureResponderEvent) => {
      handleTouchAtPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
    },
    onPanResponderMove: (evt: GestureResponderEvent) => {
      handleTouchAtPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
    },
    onPanResponderRelease: () => {},
  });

  const innerDiameter = innerRadius * 2;
  const innerOffset = (size - innerDiameter) / 2;

  const activeSegment =
    effectiveIndex !== null && effectiveIndex < segments.length
      ? segments[effectiveIndex]
      : null;

  return (
    <View style={[styles.container, !showLegend && { alignItems: "center" }]}>
      <View style={[styles.chartAndLegend, !showLegend && { justifyContent: "center" }]}>
        {/* SVG Donut Circle */}
        <View {...panResponder.panHandlers} style={{ width: size, height: size, position: "relative" }}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background Track Circle */}
            <Circle
              cx={center}
              cy={center}
              r={(outerRadius + innerRadius) / 2}
              fill="none"
              stroke={colors.border}
              strokeWidth={strokeWidth}
              opacity={0.25}
            />

            {/* Clean Concentric SVG Arc Sectors with Selected Slice on Top */}
            <G>
              {[...sliceList]
                .sort((a, b) => (effectiveIndex === a.index ? 1 : effectiveIndex === b.index ? -1 : 0))
                .map((slice) => {
                  const isSelected = effectiveIndex === slice.index;
                  const isAnySelected = effectiveIndex !== null;

                  return (
                    <Path
                      key={`slice-${slice.index}`}
                      d={slice.path}
                      fill={slice.color}
                      opacity={isAnySelected ? (isSelected ? 1.0 : 0.35) : 1.0}
                      stroke={isSelected ? "#FFFFFF" : "transparent"}
                      strokeWidth={isSelected ? 1.5 : 0}
                      strokeLinejoin="round"
                      onPress={() => {
                        setEffectiveIndex(
                          effectiveIndex === slice.index ? null : slice.index
                        );
                        if (Platform.OS !== "web")
                          Haptics.selectionAsync().catch(() => {});
                      }}
                    />
                  );
                })}
            </G>
          </Svg>

          {/* Interactive Center Content — Constrained inside inner radius so text never touches ring */}
          <TouchableOpacity
            style={[
              styles.centerTextContainer,
              {
                width: innerDiameter - 6,
                height: innerDiameter - 6,
                top: innerOffset + 3,
                left: innerOffset + 3,
                borderRadius: (innerDiameter - 6) / 2,
                paddingHorizontal: 4,
              },
            ]}
            onPress={() => {
              setEffectiveIndex(null);
              if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
            }}
            activeOpacity={0.8}
          >
            {activeSegment ? (
              <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim, alignItems: "center", justifyContent: "center", width: "100%", gap: 2 }}>
                <Text
                  style={[
                    styles.centerAmount,
                    { color: activeSegment.color, fontSize: amountFontSize },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {currency} {fmtVal(activeSegment.value)}
                </Text>
                <Text
                  style={[
                    styles.centerCategoryTitle,
                    { color: colors.foreground, fontSize: catFontSize },
                  ]}
                  numberOfLines={1}
                >
                  {activeSegment.label}
                </Text>
                <View
                  style={[
                    styles.pctBadge,
                    {
                      backgroundColor: activeSegment.color + "18",
                      borderColor: activeSegment.color + "40",
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 12,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.centerPctText,
                      { color: activeSegment.color, fontSize: pctFontSize },
                    ]}
                    numberOfLines={1}
                  >
                    {total > 0
                      ? (activeSegment.value / safeTotal) * 100 < 0.1 && activeSegment.value > 0
                        ? "< 0.1% of total"
                        : `${((activeSegment.value / safeTotal) * 100).toFixed(1)}% of total`
                      : "0.0% of total"}
                  </Text>
                </View>
              </Animated.View>
            ) : (
              <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim, alignItems: "center", justifyContent: "center", width: "100%", gap: 2 }}>
                <Text
                  style={[
                    styles.centerAmount,
                    { color: colors.foreground, fontSize: amountFontSize },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {centerLabel || `${currency} ${fmtVal(total)}`}
                </Text>
                <Text
                  style={[
                    styles.centerSubText,
                    { color: colors.mutedForeground, fontSize: catFontSize - 1 },
                  ]}
                  numberOfLines={1}
                >
                  {centerSub}
                </Text>
              </Animated.View>
            )}
          </TouchableOpacity>
        </View>

        {/* Legend List (Clean width so it never stretches across entire screen) */}
        {showLegend && (
          <View style={styles.legend}>
            {segments.map((seg, i) => {
              const isSelected = effectiveIndex === i;
              const rawPct = total > 0 ? (seg.value / total) * 100 : 0;
              const pct = rawPct > 0 && rawPct < 1 ? "< 1%" : `${rawPct.toFixed(0)}%`;
              return (
                <TouchableOpacity
                  key={seg.label}
                  style={[
                    styles.legendItem,
                    {
                      backgroundColor: isSelected ? seg.color + "18" : (colors.cardAlt ?? colors.muted) + "30",
                      borderColor: isSelected ? seg.color : colors.border + "40",
                    },
                  ]}
                  onPress={() => {
                    setEffectiveIndex(effectiveIndex === i ? null : i);
                    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.dot, { backgroundColor: seg.color }]} />
                  <View style={styles.legendText}>
                    <Text
                      style={[
                        styles.legendLabel,
                        {
                          color: isSelected ? colors.foreground : colors.mutedForeground,
                          fontFamily: isSelected ? "Inter_700Bold" : "Inter_500Medium",
                        },
                      ]}
                    >
                      {seg.label}
                    </Text>
                    <Text
                      style={[
                        styles.legendValue,
                        {
                          color: isSelected ? seg.color : colors.foreground,
                          fontFamily: isSelected ? "Inter_700Bold" : "Inter_600SemiBold",
                        },
                      ]}
                    >
                      {pct}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Quick Category Selector Pills */}
      {showChips && segments.length > 0 && (
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[
              styles.chip,
              {
                backgroundColor: effectiveIndex === null ? colors.primary : (colors.cardAlt ?? colors.muted),
                borderColor: effectiveIndex === null ? colors.primary : colors.border,
              },
            ]}
            onPress={() => {
              setEffectiveIndex(null);
              if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                { color: effectiveIndex === null ? "#FFFFFF" : colors.mutedForeground },
                effectiveIndex === null && { fontFamily: "Inter_700Bold" },
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          {segments.map((seg, i) => {
            const isSelected = effectiveIndex === i;
            return (
              <TouchableOpacity
                key={`pill-${seg.label}`}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isSelected ? seg.color : (colors.cardAlt ?? colors.muted),
                    borderColor: isSelected ? seg.color : colors.border,
                  },
                ]}
                onPress={() => {
                  setEffectiveIndex(effectiveIndex === i ? null : i);
                  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.chipDot,
                    { backgroundColor: isSelected ? "#FFFFFF" : seg.color },
                  ]}
                />
                <Text
                  style={[
                    styles.chipText,
                    { color: isSelected ? "#FFFFFF" : colors.foreground },
                    isSelected && { fontFamily: "Inter_700Bold" },
                  ]}
                >
                  {seg.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 12,
  },
  chartAndLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  centerTextContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  centerAmount: {
    fontFamily: "Inter_800ExtraBold",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  centerCategoryTitle: {
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  pctBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 1,
  },
  centerPctText: {
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  centerSubText: {
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  legend: {
    flex: 1,
    minWidth: 180,
    maxWidth: 340,
    gap: 5,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4.5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  legendText: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  legendLabel: {
    fontSize: 11.5,
    flexShrink: 1,
  },
  legendValue: {
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  chipText: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
  },
});


