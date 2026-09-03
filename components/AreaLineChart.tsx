import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  Platform,
  ScrollView,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
  Circle as SvgCircle,
  Line,
  Text as SvgText,
} from "react-native-svg";
import * as Haptics from "expo-haptics";
import { SvgCalendar, SvgChevronLeft, SvgChevronRight, SvgBarChart2 } from "@/components/web/SvgIcons";
import { useColors } from "@/hooks/useColors";
import { DatePeriodSelectorModal } from "./DatePeriodSelectorModal";
import {
  NormalizedPeriod,
  Granularity,
  getPresetPeriod,
  getAvailableGranularities,
} from "@/services/DatePeriodService";
import { Transaction } from "@/context/FinanceContext";

export interface ChartPoint {
  label: string;
  income: number;
  expense: number;
  fullDate?: string;
}

export interface CustomDateSelection {
  type?: "day" | "days_range" | "month" | "months_range" | "year" | "preset";
  year?: number;
  month?: number;
  fromMonth?: number;
  toMonth?: number;
  from?: string;
  to?: string;
  presetName?: string;
}

interface Props {
  data: ChartPoint[];
  width: number;
  height?: number;
  currency?: string;
  activeRange?: string;
  onRangeSelect?: (range: string) => void;
  ranges?: string[];
  onCustomDateSelect?: (selection: CustomDateSelection) => void;
  activePeriod?: NormalizedPeriod;
  onPeriodSelect?: (period: NormalizedPeriod) => void;
  transactions?: Transaction[];
  onGranularityChange?: (g: Granularity) => void;
  userId?: string;
  onPointSelect?: (point: ChartPoint) => void;
}

function fmtAmount(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1000000000) return `${(n / 1000000000).toFixed(2)}B`;
  if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString();
}

function roundToNiceStep(val: number): number {
  if (val <= 1000) return 1000;
  if (val <= 10000) return Math.ceil(val / 1000) * 1000;
  if (val <= 100000) return Math.ceil(val / 5000) * 5000;
  if (val <= 500000) return Math.ceil(val / 25000) * 25000;
  if (val <= 1000000) return Math.ceil(val / 50000) * 50000;
  if (val <= 10000000) return Math.ceil(val / 500000) * 500000;
  if (val <= 100000000) return Math.ceil(val / 5000000) * 5000000;
  if (val <= 1000000000) return Math.ceil(val / 50000000) * 50000000;
  return Math.ceil(val / 500000000) * 500000000;
}

export function AreaLineChart({
  data,
  width,
  height = 175,
  currency = "PKR",
  activeRange = "6M",
  onRangeSelect,
  ranges = ["1W", "2W", "1M", "3M", "6M", "1Y"],
  onCustomDateSelect,
  activePeriod,
  onPeriodSelect,
  transactions = [],
  onGranularityChange,
  userId = "default",
  onPointSelect,
}: Props) {
  const colors = useColors();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const prevIndexRef = useRef<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  const currentPeriod =
    activePeriod ||
    getPresetPeriod(
      activeRange === "1W"
        ? "last_7d"
        : activeRange === "2W"
        ? "last_14d"
        : activeRange === "1M"
        ? "this_month"
        : activeRange === "3M"
        ? "last_3m"
        : activeRange === "1Y"
        ? "this_year"
        : "last_6m"
    );

  useEffect(() => {
    if (data && data.length > 0) {
      // Find the most significant active point (highest total transaction volume)
      let bestIdx = -1;
      let maxVolume = 0;
      for (let i = 0; i < data.length; i++) {
        const vol = (Number(data[i].income) || 0) + (Number(data[i].expense) || 0);
        if (vol > maxVolume) {
          maxVolume = vol;
          bestIdx = i;
        }
      }
      // If no points have positive volume, pick latest point with non-zero
      if (bestIdx === -1) {
        for (let i = data.length - 1; i >= 0; i--) {
          if ((Number(data[i].income) || 0) > 0 || (Number(data[i].expense) || 0) > 0) {
            bestIdx = i;
            break;
          }
        }
      }
      if (bestIdx === -1) {
        bestIdx = data.length - 1;
      }
      setSelectedIndex(bestIdx);
      if (onPointSelect && data[bestIdx]) {
        onPointSelect(data[bestIdx]);
      }
    }
  }, [data]);

  // Layout metrics - generous left pad so Billion & Million figures never get truncated
  const padLeft = 58;
  const padRight = 20;
  const padTop = 22;
  const padBottom = 26;

  const pointSpacing = (data && data.length > 20) ? 46 : (data && data.length > 8) ? 56 : 0;
  const effectiveCanvasWidth = pointSpacing > 0 && data ? Math.max(width, data.length * pointSpacing + padLeft + padRight) : width;
  const isScrollable = effectiveCanvasWidth > width;

  const chartW = Math.max(effectiveCanvasWidth - padLeft - padRight, 10);
  const chartH = Math.max(height - padTop - padBottom, 10);

  // Dynamic Y-axis scale calculated directly from active points so curves are never flat!
  const allValues =
    data && data.length > 0
      ? data.flatMap((d) => [Number(d.income || 0), Number(d.expense || 0)])
      : [1000];
  const positiveValues = allValues.filter((v) => !isNaN(v) && v > 0);
  const rawMax = positiveValues.length > 0 ? Math.max(...positiveValues) : 1000;
  const maxVal = roundToNiceStep(rawMax * 1.25);
  const midVal = Math.round(maxVal / 2);

  const toX = (i: number) =>
    padLeft + (i / Math.max((data ? data.length : 1) - 1, 1)) * chartW;
  const toY = (v: number) => {
    const num = Number(v || 0);
    if (isNaN(num) || maxVal <= 0) return padTop + chartH;
    const clamped = Math.max(num, 0);
    return padTop + chartH - (clamped / maxVal) * chartH;
  };

  const buildPath = (key: "income" | "expense") => {
    if (!data || data.length === 0) return "";
    const pts = data.map((d, i) => ({ x: toX(i), y: toY(d[key]) }));
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 1} ${pts[0].y}`;

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cp1x = (pts[i - 1].x + pts[i].x) / 2;
      d += ` C ${cp1x} ${pts[i - 1].y}, ${cp1x} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
    }
    return d;
  };

  const buildArea = (key: "income" | "expense") => {
    const line = buildPath(key);
    if (!line || !data || data.length === 0) return "";
    return `${line} L ${toX(data.length - 1)} ${padTop + chartH} L ${toX(0)} ${padTop + chartH} Z`;
  };

  const handleTouchAtX = (touchX: number) => {
    if (!data || data.length === 0) return;
    const clampedX = Math.max(padLeft, Math.min(effectiveCanvasWidth - padRight, touchX));
    const ratio = (clampedX - padLeft) / chartW;
    const rawIdx = Math.round(ratio * (data.length - 1));
    const newIdx = Math.max(0, Math.min(data.length - 1, rawIdx));

    if (newIdx !== prevIndexRef.current) {
      prevIndexRef.current = newIdx;
      setSelectedIndex(newIdx);
      if (Platform.OS !== "web") {
        Haptics.selectionAsync().catch(() => {});
      }
      if (onPointSelect && data[newIdx]) {
        onPointSelect(data[newIdx]);
      }
    }
  };

  // Only intercept gestures if not in scrollable mode so native scroll momentum is 100% fluid!
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isScrollable,
      onMoveShouldSetPanResponder: () => !isScrollable,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        handleTouchAtX(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        handleTouchAtX(evt.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
    })
  ).current;

  const activeIdx =
    selectedIndex !== null && data && selectedIndex < data.length
      ? selectedIndex
      : (data && data.length > 0 ? data.length - 1 : 0);
  const activePoint = data && data.length > 0 ? data[activeIdx] : { label: "-", income: 0, expense: 0, fullDate: "-" };
  const netSurplus = activePoint ? activePoint.income - activePoint.expense : 0;
  const isNetPositive = netSurplus >= 0;
  const activeX = data && data.length > 0 ? toX(activeIdx) : padLeft;

  const availableGranularities = getAvailableGranularities();

  const shouldRenderLabel = (i: number, totalLen: number) => {
    if (isScrollable) {
      if (totalLen <= 15) return true;
      if (totalLen <= 35) return i % 2 === 0 || i === totalLen - 1;
      return i % 3 === 0 || i === totalLen - 1;
    }
    if (totalLen <= 6) return true;
    if (totalLen <= 10) return i % 2 === 0 || i === totalLen - 1;
    if (totalLen <= 20) return i % 3 === 0 || i === totalLen - 1;
    return i % 5 === 0 || i === totalLen - 1;
  };

  // ─── Bidirectional Sync Handlers ───
  const handleRangePresetPress = (r: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});

    const matchingGranularity: Granularity =
      r === "1W" || r === "2W" ? "day" :
      r === "1M" || r === "3M" ? "week" :
      "month";

    if (onRangeSelect) onRangeSelect(r);

    const mappedPreset =
      r === "1W"
        ? "last_7d"
        : r === "2W"
        ? "last_14d"
        : r === "1M"
        ? "this_month"
        : r === "3M"
        ? "last_3m"
        : r === "1Y"
        ? "this_year"
        : "last_6m";

    const period = getPresetPeriod(mappedPreset);
    if (onPeriodSelect) {
      onPeriodSelect({
        ...period,
        userGranularityOverride: matchingGranularity,
      });
    }
  };

  const handleGranularityPress = (g: Granularity) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});

    let targetPreset = activeRange;
    if (g === "month" && (activeRange === "1W" || activeRange === "2W" || activeRange === "1M")) {
      targetPreset = "6M";
    } else if (g === "year" && activeRange !== "1Y") {
      targetPreset = "1Y";
    } else if (g === "day" && (activeRange === "6M" || activeRange === "1Y")) {
      targetPreset = "1W";
    } else if (g === "week" && (activeRange === "1W" || activeRange === "1Y")) {
      targetPreset = "1M";
    }

    if (targetPreset && targetPreset !== activeRange && onRangeSelect) {
      onRangeSelect(targetPreset);
    }

    const mappedPreset =
      targetPreset === "1W"
        ? "last_7d"
        : targetPreset === "2W"
        ? "last_14d"
        : targetPreset === "1M"
        ? "this_month"
        : targetPreset === "3M"
        ? "last_3m"
        : targetPreset === "1Y"
        ? "this_year"
        : "last_6m";

    const basePeriod = currentPeriod.mode === "presets" ? getPresetPeriod(mappedPreset) : currentPeriod;

    if (onGranularityChange) onGranularityChange(g);
    if (onPeriodSelect) {
      onPeriodSelect({
        ...basePeriod,
        userGranularityOverride: g,
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* ─── Top Control Row: Scrollable Quick Period Pills + Fixed Custom Button ─── */}
      <View style={styles.topControlRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rangeScrollContent}
          style={styles.rangeScrollView}
        >
          {ranges.map((r) => {
            const isSelected = activeRange === r && currentPeriod.mode === "presets";
            return (
              <TouchableOpacity
                key={r}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: isSelected ? colors.primary : (colors.cardAlt ?? colors.muted),
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => handleRangePresetPress(r)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.rangeText,
                    { color: isSelected ? "#FFFFFF" : colors.mutedForeground },
                    isSelected && { fontFamily: "Inter_700Bold" },
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={[
            styles.calendarBtn,
            {
              backgroundColor: currentPeriod.mode !== "presets" ? colors.primary : (colors.cardAlt ?? colors.muted),
              borderColor: currentPeriod.mode !== "presets" ? colors.primary : colors.border,
            },
          ]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
            setModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <SvgCalendar
            size={13}
            color={currentPeriod.mode !== "presets" ? "#FFFFFF" : colors.foreground}
          />
          <Text
            style={[
              styles.calendarBtnText,
              { color: currentPeriod.mode !== "presets" ? "#FFFFFF" : colors.foreground },
              currentPeriod.mode !== "presets" && { fontFamily: "Inter_700Bold" },
            ]}
          >
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Clean, Non-Overlapping Inspector Box (2-Row Layout) ─── */}
      <View
        style={[
          styles.inspectorCard,
          {
            backgroundColor: (colors.cardAlt ?? colors.muted) + "90",
            borderColor: colors.border,
          },
        ]}
      >
        {/* Top Header: Date & Net Margin */}
        <View style={styles.inspectorHeaderRow}>
          <View style={styles.dateBadgeWrap}>
            <SvgCalendar size={12} color={colors.primary} />
            <Text style={[styles.inspectorDate, { color: colors.foreground }]} numberOfLines={1}>
              {activePoint ? (activePoint.fullDate || activePoint.label) : "-"}
            </Text>
          </View>

          <View
            style={[
              styles.netSurplusPill,
              {
                backgroundColor: (isNetPositive ? colors.income : colors.expense) + "18",
                borderColor: (isNetPositive ? colors.income : colors.expense) + "40",
              },
            ]}
          >
            <Text
              style={[
                styles.netSurplusText,
                { color: isNetPositive ? colors.income : colors.expense },
              ]}
            >
              Net: {isNetPositive ? "+" : "-"}{currency} {fmtAmount(Math.abs(netSurplus))}
            </Text>
          </View>
        </View>

        {/* Bottom Badges: Income and Expense */}
        <View style={styles.inspectorBadgesRow}>
          <View style={[styles.statBadge, { backgroundColor: colors.income + "14", borderColor: colors.income + "30" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={[styles.legendDot, { backgroundColor: colors.income }]} />
              <Text style={[styles.statBadgeLabel, { color: colors.income }]}>Income</Text>
            </View>
            <Text style={[styles.statBadgeValue, { color: colors.income }]}>
              {currency} {fmtAmount(activePoint ? activePoint.income : 0)}
            </Text>
          </View>

          <View style={[styles.statBadge, { backgroundColor: colors.expense + "14", borderColor: colors.expense + "30" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={[styles.legendDot, { backgroundColor: colors.expense }]} />
              <Text style={[styles.statBadgeLabel, { color: colors.expense }]}>Expense</Text>
            </View>
            <Text style={[styles.statBadgeValue, { color: colors.expense }]}>
              {currency} {fmtAmount(activePoint ? activePoint.expense : 0)}
            </Text>
          </View>
        </View>
      </View>

      {/* ─── Interactive Navigation Bar for Scrollable Timelines ─── */}
      {isScrollable && (
        <View style={styles.scrollHintRow}>
          <TouchableOpacity
            style={[styles.scrollNavBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
              const nextX = Math.max(0, scrollOffsetRef.current - 200);
              scrollViewRef.current?.scrollTo({ x: nextX, animated: true });
            }}
            activeOpacity={0.7}
          >
            <SvgChevronLeft size={13} color={colors.primary} />
            <Text style={[styles.scrollNavBtnText, { color: colors.primary }]}>Earlier</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={[styles.scrollHintText, { color: colors.mutedForeground }]}>
              {data.length} {currentPeriod.userGranularityOverride || currentPeriod.granularity}s · Swipe to explore
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.scrollNavBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
              const nextX = scrollOffsetRef.current + 200;
              scrollViewRef.current?.scrollTo({ x: nextX, animated: true });
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.scrollNavBtnText, { color: colors.primary }]}>Later</Text>
            <SvgChevronRight size={13} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── SVG Trend Graph Area with Smooth Native Horizontal Pan & Direct Touch ─── */}
      {(!data || data.length === 0) ? (
        <View style={[styles.emptyBox, { height }]}>
          <SvgBarChart2 size={28} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No financial records found
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          onScroll={(e) => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{ minWidth: width }}
        >
          <View
            style={{ width: effectiveCanvasWidth, height, cursor: "crosshair" as any }}
            {...(isScrollable ? {} : panResponder.panHandlers)}
            onTouchStart={(e) => handleTouchAtX(e.nativeEvent.locationX)}
            onTouchMove={(e) => handleTouchAtX(e.nativeEvent.locationX)}
            onTouchEnd={(e) => handleTouchAtX(e.nativeEvent.locationX)}
            {...(Platform.OS === "web"
              ? {
                  onPointerMove: (e: any) => {
                    const rect = e.currentTarget?.getBoundingClientRect?.();
                    if (rect) {
                      const clientX = e.clientX - rect.left;
                      handleTouchAtX(clientX);
                    }
                  },
                  onPointerDown: (e: any) => {
                    const rect = e.currentTarget?.getBoundingClientRect?.();
                    if (rect) {
                      const clientX = e.clientX - rect.left;
                      handleTouchAtX(clientX);
                    }
                  },
                }
              : {})}
          >
            <Svg width={effectiveCanvasWidth} height={height}>
              <Defs>
                <LinearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={colors.income} stopOpacity="0.32" />
                  <Stop offset="100%" stopColor={colors.income} stopOpacity="0.0" />
                </LinearGradient>
                <LinearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={colors.expense} stopOpacity="0.26" />
                  <Stop offset="100%" stopColor={colors.expense} stopOpacity="0.0" />
                </LinearGradient>
              </Defs>

              {/* Horizontal Gridlines & Auto-Scaled Y-Axis Values */}
              {[
                { val: maxVal, yPct: 0 },
                { val: midVal, yPct: 0.5 },
                { val: 0, yPct: 1 },
              ].map((grid, idx) => {
                const y = padTop + chartH * grid.yPct;
                return (
                  <React.Fragment key={`grid-${idx}`}>
                    <Line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + chartW}
                      y2={y}
                      stroke={colors.border}
                      strokeWidth={1}
                      strokeDasharray="4,4"
                      opacity={0.45}
                    />
                    <SvgText
                      x={padLeft - 6}
                      y={y + 3.5}
                      fill={colors.mutedForeground}
                      fontSize={8.5}
                      fontWeight="500"
                      textAnchor="end"
                    >
                      {fmtAmount(grid.val)}
                    </SvgText>
                  </React.Fragment>
                );
              })}

              {/* Filled Area Gradient Shading */}
              <Path d={buildArea("income")} fill="url(#incomeGrad)" />
              <Path d={buildArea("expense")} fill="url(#expenseGrad)" />

              {/* Main Smooth Curves with Dynamic Ups and Downs */}
              <Path
                d={buildPath("income")}
                fill="none"
                stroke={colors.income}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d={buildPath("expense")}
                fill="none"
                stroke={colors.expense}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Permanent Activity Anchor Dots along the curves */}
              {data.map((d, i) => {
                const px = toX(i);
                const pyInc = toY(Number(d.income || 0));
                const pyExp = toY(Number(d.expense || 0));
                return (
                  <React.Fragment key={`anchor-${i}`}>
                    {d.income > 0 && (
                      <SvgCircle cx={px} cy={pyInc} r={3.5} fill={colors.income} opacity={0.85} />
                    )}
                    {d.expense > 0 && (
                      <SvgCircle cx={px} cy={pyExp} r={3.5} fill={colors.expense} opacity={0.85} />
                    )}
                  </React.Fragment>
                );
              })}

              {/* Active Vertical Guideline */}
              <Line
                x1={activeX}
                y1={padTop}
                x2={activeX}
                y2={padTop + chartH}
                stroke={colors.foreground}
                strokeWidth={1.5}
                strokeDasharray="3,3"
                opacity={0.6}
              />

              {/* Active Highlight Dots */}
              <SvgCircle cx={activeX} cy={toY(activePoint.income)} r={7} fill={colors.income} opacity={0.3} />
              <SvgCircle
                cx={activeX}
                cy={toY(activePoint.income)}
                r={4.5}
                fill="#FFFFFF"
                stroke={colors.income}
                strokeWidth={2.5}
              />
              <SvgCircle cx={activeX} cy={toY(activePoint.expense)} r={7} fill={colors.expense} opacity={0.3} />
              <SvgCircle
                cx={activeX}
                cy={toY(activePoint.expense)}
                r={4.5}
                fill="#FFFFFF"
                stroke={colors.expense}
                strokeWidth={2.5}
              />
            </Svg>

            {/* X-Axis Tick Labels */}
            <View style={[styles.xAxisRow, { left: padLeft, width: chartW, top: padTop + chartH + 4 }]}>
              {data.map((d, i) => {
                const isAct = i === activeIdx;
                const showText = shouldRenderLabel(i, data.length);

                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      setSelectedIndex(i);
                      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                    }}
                    style={styles.xLabelWrap}
                  >
                    <Text
                      style={[
                        styles.xLabel,
                        { color: isAct ? colors.primary : colors.mutedForeground },
                        isAct && { fontFamily: "Inter_700Bold" },
                      ]}
                      numberOfLines={1}
                    >
                      {showText ? d.label : "·"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ─── Granularity Switcher: View by Day | Week | Month | Year ─── */}
      <View style={styles.granularityControlRow}>
        <Text style={[styles.granularityTitle, { color: colors.mutedForeground }]}>View by:</Text>
        <View style={styles.granPillsRow}>
          {availableGranularities.map((g) => {
            const isAct = (currentPeriod.userGranularityOverride || currentPeriod.granularity) === g;
            return (
              <TouchableOpacity
                key={g}
                style={[
                  styles.granPill,
                  {
                    backgroundColor: isAct ? colors.primary : (colors.cardAlt ?? colors.muted),
                    borderColor: isAct ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => handleGranularityPress(g)}
              >
                <Text
                  style={[
                    styles.granPillText,
                    { color: isAct ? "#FFFFFF" : colors.foreground },
                    isAct && { fontFamily: "Inter_700Bold" },
                  ]}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ─── Date Period Modal ─── */}
      <DatePeriodSelectorModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        currentPeriod={currentPeriod}
        transactions={transactions}
        userId={userId}
        onApply={(p) => {
          if (onPeriodSelect) onPeriodSelect(p);
          if (onCustomDateSelect) {
            onCustomDateSelect({
              type: "days_range",
              from: p.startDate,
              to: p.endDate,
              presetName: p.label,
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  topControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rangeScrollView: {
    flex: 1,
  },
  rangeScrollContent: {
    flexDirection: "row",
    gap: 6,
    paddingLeft: 2,
    paddingRight: 6,
  },
  rangeChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  rangeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  calendarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
  },
  calendarBtnText: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
  },
  inspectorCard: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  inspectorHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateBadgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    marginRight: 6,
  },
  inspectorDate: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  netSurplusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  netSurplusText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
  },
  inspectorBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statBadgeLabel: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
  },
  statBadgeValue: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  scrollHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  scrollNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  scrollNavBtnText: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
  },
  scrollHintText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  xAxisRow: {
    position: "absolute",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  xLabelWrap: {
    flex: 1,
    alignItems: "center",
  },
  xLabel: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  granularityControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 4,
  },
  granularityTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  granPillsRow: {
    flexDirection: "row",
    gap: 6,
  },
  granPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  granPillText: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
  },
});
