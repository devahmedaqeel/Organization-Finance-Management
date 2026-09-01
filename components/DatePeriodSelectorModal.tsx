import React, { useState, useMemo } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import {
  SvgCalendar,
  SvgX,
  SvgChevronLeft,
  SvgChevronRight,
  SvgClock,
  SvgCheck,
} from "@/components/web/SvgIcons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { Transaction } from "@/context/FinanceContext";
import {
  NormalizedPeriod,
  SelectionMode,
  Granularity,
  formatYMD,
  parseYMD,
  formatReadableDate,
  getDataDateBounds,
  calculateIntelligentGranularity,
  getPresetPeriod,
  computePeriodMetrics,
} from "@/services/DatePeriodService";

interface Props {
  visible: boolean;
  onClose: () => void;
  onApply?: (period: NormalizedPeriod) => void;
  onSelectPeriod?: (period: NormalizedPeriod) => void;
  currentPeriod?: NormalizedPeriod;
  activePeriod?: NormalizedPeriod;
  transactions?: Transaction[];
  userId?: string;
}

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function DatePeriodSelectorModal({
  visible,
  onClose,
  onApply,
  onSelectPeriod,
  currentPeriod,
  activePeriod,
  transactions = [],
}: Props) {
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const effectivePeriod = currentPeriod || activePeriod || getPresetPeriod("last_6m");
  const [activeTab, setActiveTab] = useState<SelectionMode>(effectivePeriod?.mode || "days");

  const { minYear, maxYear, years } = useMemo(
    () => getDataDateBounds(transactions),
    [transactions]
  );

  // ─── Days Mode State ───
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const d = parseYMD(effectivePeriod.startDate);
    return d.getFullYear() || new Date().getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    const d = parseYMD(effectivePeriod.startDate);
    return d.getMonth() || new Date().getMonth();
  });
  const [startDay, setStartDay] = useState<number | null>(() => {
    const d = parseYMD(effectivePeriod.startDate);
    return d.getDate() || 1;
  });
  const [endDay, setEndDay] = useState<number | null>(() => {
    const d = parseYMD(effectivePeriod.endDate);
    return d.getDate() || 31;
  });
  const [customDaysCount, setCustomDaysCount] = useState<string>("");

  // ─── Months Mode State ───
  const [monthStartIdx, setMonthStartIdx] = useState<number>(0);
  const [monthEndIdx, setMonthEndIdx] = useState<number>(11);

  // ─── Years Mode State ───
  const [pickedYear, setPickedYear] = useState<number>(selectedYear);

  // ─── Granularity Override ───
  const [userGranularity, setUserGranularity] = useState<Granularity | undefined>(
    effectivePeriod.userGranularityOverride
  );

  // Calendar calculations for selected month
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDayRaw = new Date(selectedYear, selectedMonth, 1).getDay();
  const startDayOffset = (firstDayRaw + 6) % 7; // Mon=0, Sun=6

  const prevMonthNav = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
    setStartDay(1);
    setEndDay(null);
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  };

  const nextMonthNav = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
    setStartDay(1);
    setEndDay(null);
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  };

  const handleDayPress = (dayNum: number) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});

    if (startDay === null || (startDay !== null && endDay !== null)) {
      setStartDay(dayNum);
      setEndDay(null);
    } else {
      if (dayNum < startDay) {
        setEndDay(startDay);
        setStartDay(dayNum);
      } else if (dayNum === startDay) {
        setEndDay(null);
      } else {
        setEndDay(dayNum);
      }
    }
  };

  // Quick custom days entered by user (e.g. 45 days)
  const handleApplyCustomDays = () => {
    const num = parseInt(customDaysCount, 10);
    if (isNaN(num) || num <= 0) return;
    const now = new Date();
    const s = new Date(now);
    s.setDate(now.getDate() - (num - 1));
    const sYMD = formatYMD(s);
    const eYMD = formatYMD(now);

    const calculated: NormalizedPeriod = {
      mode: "days",
      startDate: sYMD,
      endDate: eYMD,
      label: `Last ${num} Days (${formatReadableDate(sYMD)} – ${formatReadableDate(eYMD)})`,
      granularity: num <= 31 ? "day" : "week",
    };
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply(calculated);
    onClose();
  };

  // Draft Normalized Period
  const draftPeriod = useMemo<NormalizedPeriod>(() => {
    // 1. DAYS TAB
    if (activeTab === "days") {
      const mStr = String(selectedMonth + 1).padStart(2, "0");
      if (startDay !== null && endDay !== null && startDay !== endDay) {
        const sStr = String(startDay).padStart(2, "0");
        const eStr = String(endDay).padStart(2, "0");
        const sYMD = `${selectedYear}-${mStr}-${sStr}`;
        const eYMD = `${selectedYear}-${mStr}-${eStr}`;
        const diff = endDay - startDay + 1;
        const isWhole = startDay === 1 && endDay === daysInMonth;

        return {
          mode: "days",
          startDate: sYMD,
          endDate: eYMD,
          label: isWhole
            ? `Whole Month (${MONTH_NAMES_SHORT[selectedMonth]} ${selectedYear})`
            : `${startDay}–${endDay} ${MONTH_NAMES_SHORT[selectedMonth]} ${selectedYear} (${diff} Days)`,
          granularity: "day",
          userGranularityOverride: userGranularity,
        };
      } else if (startDay !== null) {
        const sStr = String(startDay).padStart(2, "0");
        const sYMD = `${selectedYear}-${mStr}-${sStr}`;
        return {
          mode: "days",
          startDate: sYMD,
          endDate: sYMD,
          label: `${startDay} ${MONTH_NAMES_SHORT[selectedMonth]} ${selectedYear}`,
          granularity: "day",
          userGranularityOverride: userGranularity,
        };
      }
    }

    // 2. MONTHS TAB
    if (activeTab === "months") {
      const sM = Math.min(monthStartIdx, monthEndIdx);
      const eM = Math.max(monthStartIdx, monthEndIdx);
      const sYMD = `${selectedYear}-${String(sM + 1).padStart(2, "0")}-01`;
      const eYMD = formatYMD(new Date(selectedYear, eM + 1, 0));
      const totalMonths = eM - sM + 1;

      return {
        mode: "months",
        startDate: sYMD,
        endDate: eYMD,
        label:
          sM === eM
            ? `${MONTH_NAMES_SHORT[sM]} ${selectedYear}`
            : `${MONTH_NAMES_SHORT[sM]}–${MONTH_NAMES_SHORT[eM]} ${selectedYear} (${totalMonths} Months)`,
        granularity: totalMonths <= 2 ? "week" : "month",
        userGranularityOverride: userGranularity,
      };
    }

    // 3. YEARS TAB
    if (activeTab === "year") {
      const sYMD = `${pickedYear}-01-01`;
      const eYMD = `${pickedYear}-12-31`;
      return {
        mode: "year",
        startDate: sYMD,
        endDate: eYMD,
        label: `Full Year ${pickedYear}`,
        granularity: "month",
        userGranularityOverride: userGranularity,
      };
    }

    // 4. PRESETS
    return effectivePeriod;
  }, [
    activeTab,
    selectedYear,
    selectedMonth,
    startDay,
    endDay,
    monthStartIdx,
    monthEndIdx,
    pickedYear,
    userGranularity,
    effectivePeriod,
    daysInMonth,
  ]);

  const metrics = useMemo(
    () => computePeriodMetrics(transactions, draftPeriod),
    [transactions, draftPeriod]
  );

  const handleFinalApply = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (onApply) onApply(draftPeriod);
    if (onSelectPeriod) onSelectPeriod(draftPeriod);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <SvgCalendar size={18} color={colors.primary} />
              <Text style={[styles.title, { color: colors.foreground }]}>Choose Date & Timeline</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <SvgX size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Simple 4 Mode Selector Tabs */}
          <View style={[styles.tabBar, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}>
            {(
              [
                { id: "days", label: "🗓️ Days" },
                { id: "months", label: "📅 Months" },
                { id: "year", label: "📆 Year" },
                { id: "presets", label: "⚡ Quick Presets" },
              ] as const
            ).map((tab) => {
              const isAct = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tabBtn, isAct && [styles.tabBtnActive, { backgroundColor: colors.primary }]]}
                  onPress={() => {
                    setActiveTab(tab.id);
                    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                  }}
                >
                  <Text style={[styles.tabText, { color: isAct ? "#fff" : colors.mutedForeground }, isAct && { fontFamily: "Inter_700Bold" }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollBody}
          >
            {/* ═══════════════════ TAB 1: DAYS MODE ═══════════════════ */}
            {activeTab === "days" && (
              <View style={styles.sectionWrap}>
                {/* Month Navigator */}
                <View style={[styles.navBar, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}>
                  <TouchableOpacity onPress={prevMonthNav} style={styles.navArrow}>
                    <SvgChevronLeft size={18} color={colors.foreground} />
                  </TouchableOpacity>
                  <View style={{ alignItems: "center" }}>
                    <Text style={[styles.navTitle, { color: colors.foreground }]}>
                      {MONTH_NAMES_SHORT[selectedMonth]} {selectedYear}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 2 }}>
                      <TouchableOpacity
                        onPress={() => {
                          const now = new Date();
                          setSelectedYear(now.getFullYear());
                          setSelectedMonth(now.getMonth());
                          setStartDay(now.getDate());
                          setEndDay(null);
                        }}
                      >
                        <Text style={{ fontSize: 10.5, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Today</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setStartDay(1);
                          setEndDay(daysInMonth);
                        }}
                      >
                        <Text style={{ fontSize: 10.5, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Whole Month</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity onPress={nextMonthNav} style={styles.navArrow}>
                    <SvgChevronRight size={18} color={colors.foreground} />
                  </TouchableOpacity>
                </View>

                {/* Quick Days Duration Spans */}
                <Text style={[styles.labelSmall, { color: colors.mutedForeground }]}>QUICK DAYS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 6 }}>
                  {[
                    { label: "1 Day", s: 1, e: null },
                    { label: "3 Days", s: 1, e: 3 },
                    { label: "7 Days (1W)", s: 1, e: 7 },
                    { label: "15 Days", s: 1, e: 15 },
                    { label: "30 Days", s: 1, e: 30 },
                    { label: `Whole Month (${daysInMonth}D)`, s: 1, e: daysInMonth },
                  ].map((chip) => (
                    <TouchableOpacity
                      key={chip.label}
                      style={[
                        styles.chipSmall,
                        {
                          backgroundColor: startDay === chip.s && endDay === chip.e ? colors.primary : (colors.cardAlt ?? colors.muted),
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => {
                        setStartDay(chip.s);
                        setEndDay(chip.e);
                        if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                      }}
                    >
                      <Text style={[styles.chipText, { color: startDay === chip.s && endDay === chip.e ? "#fff" : colors.foreground }]}>
                        {chip.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Easy Custom Days Input */}
                <View style={[styles.customDaysRow, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                    Custom Days:
                  </Text>
                  <TextInput
                    style={[styles.customDaysInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. 45"
                    placeholderTextColor={colors.mutedForeground}
                    value={customDaysCount}
                    onChangeText={setCustomDaysCount}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity
                    style={[styles.customDaysBtn, { backgroundColor: colors.primary }]}
                    onPress={handleApplyCustomDays}
                  >
                    <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" }}>View</Text>
                  </TouchableOpacity>
                </View>

                {/* Weekday Row */}
                <View style={styles.weekdayRow}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
                    <Text key={w} style={[styles.weekdayText, { color: colors.mutedForeground }]}>
                      {w}
                    </Text>
                  ))}
                </View>

                {/* 1-31 Day Grid */}
                <View style={styles.dayGrid}>
                  {Array.from({ length: startDayOffset }).map((_, i) => (
                    <View key={`b-${i}`} style={styles.dayCellEmpty} />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const d = i + 1;
                    const isStart = startDay === d;
                    const isEnd = endDay === d;
                    const inRange = startDay !== null && endDay !== null && d >= startDay && d <= endDay;
                    const selected = isStart || isEnd;

                    return (
                      <TouchableOpacity
                        key={`d-${d}`}
                        style={[
                          styles.dayCell,
                          inRange && [styles.dayCellInRange, { backgroundColor: colors.primary + "25" }],
                          selected && [styles.dayCellSelected, { backgroundColor: colors.primary }],
                        ]}
                        onPress={() => handleDayPress(d)}
                      >
                        <Text style={[styles.dayText, { color: selected ? "#fff" : colors.foreground }, selected && { fontFamily: "Inter_700Bold" }]}>
                          {d}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ═══════════════════ TAB 2: MONTHS MODE ═══════════════════ */}
            {activeTab === "months" && (
              <View style={styles.sectionWrap}>
                <Text style={[styles.labelSmall, { color: colors.mutedForeground }]}>QUICK SPANS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 6 }}>
                  {[
                    { label: "1 Month", count: 1 },
                    { label: "2 Months", count: 2 },
                    { label: "3 Months", count: 3 },
                    { label: "6 Months", count: 6 },
                    { label: "Full Year (12M)", count: 12 },
                  ].map((s) => (
                    <TouchableOpacity
                      key={s.label}
                      style={[styles.chipSmall, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}
                      onPress={() => {
                        setMonthStartIdx(0);
                        setMonthEndIdx(s.count - 1);
                      }}
                    >
                      <Text style={[styles.chipText, { color: colors.foreground }]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* 12 Months Grid */}
                <Text style={[styles.labelSmall, { color: colors.mutedForeground, marginTop: 10 }]}>
                  TAP MONTH TO SELECT ({selectedYear})
                </Text>
                <View style={styles.monthGrid}>
                  {MONTH_NAMES_SHORT.map((m, idx) => {
                    const isStart = monthStartIdx === idx;
                    const isEnd = monthEndIdx === idx;
                    const inSpan = idx >= Math.min(monthStartIdx, monthEndIdx) && idx <= Math.max(monthStartIdx, monthEndIdx);
                    const isSel = isStart || isEnd;

                    return (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.monthChip,
                          inSpan && { backgroundColor: colors.primary + "25", borderColor: colors.primary },
                          isSel && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => {
                          if (monthStartIdx === idx) {
                            setMonthEndIdx(idx);
                          } else {
                            if (idx < monthStartIdx) {
                              setMonthEndIdx(monthStartIdx);
                              setMonthStartIdx(idx);
                            } else {
                              setMonthEndIdx(idx);
                            }
                          }
                        }}
                      >
                        <Text style={[styles.monthText, { color: isSel ? "#fff" : colors.foreground }, isSel && { fontFamily: "Inter_700Bold" }]}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ═══════════════════ TAB 3: YEARS MODE ═══════════════════ */}
            {activeTab === "year" && (
              <View style={styles.sectionWrap}>
                <Text style={[styles.labelSmall, { color: colors.mutedForeground }]}>SELECT FULL YEAR</Text>
                <View style={styles.yearGrid}>
                  {years.map((yr) => {
                    const isSelected = yr === pickedYear;
                    return (
                      <TouchableOpacity
                        key={yr}
                        style={[
                          styles.yearCard,
                          {
                            backgroundColor: isSelected ? colors.primary : (colors.cardAlt ?? colors.muted),
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setPickedYear(yr);
                          if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                        }}
                      >
                        <Text style={[styles.yearTitle, { color: isSelected ? "#fff" : colors.foreground }, isSelected && { fontFamily: "Inter_700Bold" }]}>
                          {yr}
                        </Text>
                        <Text style={{ fontSize: 10, color: isSelected ? "#e2e8f0" : colors.mutedForeground }}>
                          All 12 Months
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ═══════════════════ TAB 4: PRESETS MODE ═══════════════════ */}
            {activeTab === "presets" && (
              <View style={styles.sectionWrap}>
                <Text style={[styles.labelSmall, { color: colors.mutedForeground }]}>POPULAR PRESETS</Text>
                <View style={styles.presetGrid}>
                  {[
                    { id: "today", label: "Today" },
                    { id: "this_week", label: "This Week (7D)" },
                    { id: "last_14d", label: "Last 14 Days (2W)" },
                    { id: "this_month", label: "This Month" },
                    { id: "last_30d", label: "Last 30 Days" },
                    { id: "last_3m", label: "Last 3 Months" },
                    { id: "last_6m", label: "Last 6 Months" },
                    { id: "this_year", label: "This Year" },
                    { id: "all_time", label: "All Time (Lifetime)" },
                  ].map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.presetCard, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}
                      onPress={() => {
                        const calculated = getPresetPeriod(p.id);
                        if (onApply) onApply(calculated);
                        if (onSelectPeriod) onSelectPeriod(calculated);
                        onClose();
                      }}
                    >
                      <SvgClock size={13} color={colors.primary} />
                      <Text style={[styles.presetText, { color: colors.foreground }]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ═══════════════════ LIVE SUMMARY BANNER ═══════════════════ */}
            <View style={[styles.summaryBanner, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <SvgCheck size={15} color={colors.primary} />
                <Text style={[styles.summaryLabelTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {draftPeriod.label}
                </Text>
              </View>

              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>DURATION</Text>
                  <Text style={[styles.metricVal, { color: colors.foreground }]}>{metrics.durationDays} Days</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>MONTHS</Text>
                  <Text style={[styles.metricVal, { color: colors.foreground }]}>{metrics.durationMonths}M</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>RECORDS</Text>
                  <Text style={[styles.metricVal, { color: colors.foreground }]}>{metrics.recordCount} Txs</Text>
                </View>
              </View>
            </View>

            {/* ═══════════════════ VIEW BY (DAY, WEEK, MONTH, YEAR) ═══════════════════ */}
            <View style={[styles.optionsWrap, { borderColor: colors.border }]}>
              <Text style={[styles.labelSmall, { color: colors.mutedForeground }]}>
                GRAPH VIEW BY
              </Text>
              <View style={styles.granularityRow}>
                {(["day", "week", "month", "year"] as const).map((g) => {
                  const isSel = (userGranularity || draftPeriod.granularity) === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.granularityChip,
                        isSel && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => setUserGranularity(g)}
                    >
                      <Text style={{ fontSize: 11, color: isSel ? "#fff" : colors.mutedForeground, fontFamily: isSel ? "Inter_700Bold" : "Inter_500Medium", textTransform: "capitalize" }}>
                        {g}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ═══════════════════ APPLY & CANCEL BUTTONS ═══════════════════ */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={onClose}
              >
                <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: colors.primary }]}
                onPress={handleFinalApply}
                activeOpacity={0.85}
              >
                <SvgCheck size={16} color="#FFFFFF" />
                <Text style={styles.applyBtnText}>Apply Period</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, maxHeight: "90%", paddingBottom: 24 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#94a3b8", alignSelf: "center", marginTop: 8, marginBottom: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  tabBar: { flexDirection: "row", marginHorizontal: 14, padding: 3, borderRadius: 12, borderWidth: 1, gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 6, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  tabBtnActive: { elevation: 2 },
  tabText: { fontSize: 10.5, fontFamily: "Inter_600SemiBold" },
  scrollBody: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 100, gap: 10 },
  sectionWrap: { gap: 8 },
  labelSmall: { fontSize: 9.5, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 8, borderRadius: 12, borderWidth: 1 },
  navArrow: { padding: 6 },
  navTitle: { fontSize: 13.5, fontFamily: "Inter_700Bold" },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  customDaysRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 10, borderWidth: 1, marginTop: 2 },
  customDaysInput: { flex: 1, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  customDaysBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  weekdayRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 4 },
  weekdayText: { fontSize: 10, fontFamily: "Inter_600SemiBold", width: 36, textAlign: "center" },
  dayGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 4 },
  dayCellEmpty: { width: "14.28%", height: 36 },
  dayCell: { width: "14.28%", height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  dayCellInRange: { borderRadius: 0 },
  dayCellSelected: { borderRadius: 10 },
  dayText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  monthChip: { width: "23%", paddingVertical: 8, alignItems: "center", borderRadius: 10, borderWidth: 1 },
  monthText: { fontSize: 11.5, fontFamily: "Inter_600SemiBold" },
  yearGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  yearCard: { width: "48%", paddingVertical: 12, alignItems: "center", borderRadius: 10, borderWidth: 1, gap: 2 },
  yearTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  presetCard: { width: "48.5%", flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, borderWidth: 1 },
  presetText: { fontSize: 11.5, fontFamily: "Inter_600SemiBold" },
  summaryBanner: { padding: 10, borderRadius: 12, borderWidth: 1, gap: 8 },
  summaryLabelTitle: { fontSize: 12.5, fontFamily: "Inter_700Bold", flex: 1 },
  metricsGrid: { flexDirection: "row", justifyContent: "space-around" },
  metricItem: { alignItems: "center", gap: 1 },
  metricLabel: { fontSize: 8.5, fontFamily: "Inter_700Bold", color: "#94a3b8" },
  metricVal: { fontSize: 11.5, fontFamily: "Inter_700Bold" },
  optionsWrap: { padding: 10, borderRadius: 12, borderWidth: 1, gap: 8 },
  granularityRow: { flexDirection: "row", gap: 6 },
  granularityChip: { flex: 1, paddingVertical: 6, alignItems: "center", borderRadius: 8, borderWidth: 1 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 12, borderWidth: 1 },
  cancelText: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  applyBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12 },
  applyBtnText: { color: "#FFFFFF", fontSize: 13.5, fontFamily: "Inter_700Bold" },
});
