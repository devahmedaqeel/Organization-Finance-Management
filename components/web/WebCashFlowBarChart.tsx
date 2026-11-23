import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { Granularity, NormalizedPeriod } from "@/services/DatePeriodService";
import type { Transaction } from "@/services/FinancialCalculationEngine";
import { buildCashFlowBarData } from "@/services/cashFlowBarChart";

const GROUPS = [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }] as const;
const dateLabel = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
const rangeLabel = (start: string, end: string) => start === end ? dateLabel(start) : dateLabel(start) + " – " + dateLabel(end);
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function WebCashFlowBarChart({ transactions, period, currency = "PKR", hideAmounts = false }: {
  transactions: Transaction[]; period: NormalizedPeriod; currency?: string; hideAmounts?: boolean;
}) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [group, setGroup] = useState<Granularity>("month");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [scrollX, setScrollX] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const data = useMemo(() => buildCashFlowBarData(transactions, period, group), [transactions, period.startDate, period.endDate, group]);
  const selected = data.buckets.find((bucket) => bucket.key === selectedKey);
  const hovered = data.buckets.find((bucket) => bucket.key === hoveredKey);
  const totals = selected || data;
  const money = (value: number) => hideAmounts ? "••••" : currency + " " + number(value);
  const available = Math.max(240, (width || Math.max(280, windowWidth - (windowWidth < 768 ? 48 : 336))) - 32);
  const maximum = Math.max(0, ...data.buckets.flatMap((bucket) => [bucket.income, bucket.expenses]));
  const power = maximum ? Math.pow(10, Math.floor(Math.log10(maximum))) : 1;
  const scale = maximum ? Math.ceil(maximum / power) * power : 1;
  const gutter = Math.max(58, Math.min(144, number(scale).length * 6 + 20));
  const viewport = Math.max(160, available - gutter);
  const column = Math.max(group === "month" ? 68 : 56, viewport / Math.max(1, data.buckets.length));
  const plotWidth = Math.max(viewport, column * data.buckets.length);
  const baseline = 222; const amplitude = 200; const plotHeight = 262;
  const visibleTicks = [scale, scale * 0.75, scale / 2, scale / 4, 0];
  const fingerprint = group + period.startDate + period.endDate + data.buckets.map((bucket) => bucket.income + ":" + bucket.expenses).join("|");
  const hoveredIndex = data.buckets.findIndex((bucket) => bucket.key === hoveredKey);
  const tooltipWidth = Math.min(264, available - 16);
  const tooltipLeft = Math.max(8, Math.min(available - tooltipWidth - 8, gutter + column * (hoveredIndex + 0.5) - scrollX - tooltipWidth / 2));

  useEffect(() => { setSelectedKey(null); setHoveredKey(null); setShowAll(false); }, [period.startDate, period.endDate, group]);
  useEffect(() => { setShowAll(false); }, [selectedKey]);
  useEffect(() => {
    if (selectedKey) return;
    const last = data.buckets.reduce((index, bucket, current) => bucket.transactions.length ? current : index, 0);
    scroll.current?.scrollTo({ x: Math.max(0, last * column - viewport * 0.6), animated: false });
  }, [data, column, viewport]);

  const plot = useMemo(() => <svg key={fingerprint} width={plotWidth} height={plotHeight} viewBox={"0 0 " + plotWidth + " " + plotHeight} role="group" aria-label="Income and expenses side by side for each period">
    {visibleTicks.map((tick, index) => <line key={index} x1={0} x2={plotWidth} y1={baseline - tick / scale * amplitude} y2={baseline - tick / scale * amplitude} stroke={colors.border} strokeWidth={tick === 0 ? 1.4 : 0.7} strokeDasharray={tick === 0 ? undefined : "3 5"} />)}
    {data.buckets.map((bucket, index) => {
      const x = index * column; const barWidth = Math.max(8, Math.min(22, column * 0.28)); const pairGap = 4;
      const centre = x + column / 2;
      const incomeHeight = bucket.income > 0 ? Math.max(2, bucket.income / scale * amplitude) : 0;
      const expenseHeight = bucket.expenses > 0 ? Math.max(2, bucket.expenses / scale * amplitude) : 0;
      const active = selectedKey === bucket.key || hoveredKey === bucket.key;
      const dim = Boolean((selectedKey || hoveredKey) && !active);
      const label = rangeLabel(bucket.startDate, bucket.endDate) + (hideAmounts ? "" : ". Income " + currency + " " + number(bucket.income) + ", expenses " + currency + " " + number(bucket.expenses) + ", net " + currency + " " + number(bucket.net)) + ". " + bucket.transactions.length + " transactions. Select for details.";
      return <g key={bucket.key} role="button" tabIndex={0} aria-label={label} aria-pressed={selectedKey === bucket.key}
        onMouseEnter={() => setHoveredKey(bucket.key)} onMouseLeave={() => setHoveredKey(null)} onFocus={() => setHoveredKey(bucket.key)} onBlur={() => setHoveredKey(null)}
        onClick={() => setSelectedKey((previous) => previous === bucket.key ? null : bucket.key)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedKey((previous) => previous === bucket.key ? null : bucket.key); } }}
        style={{ cursor: "pointer", outline: "none" }}>
        <rect x={x + 3} y={8} width={column - 6} height={plotHeight - 32} rx={6} fill={active ? colors.primary + "0A" : "transparent"} />
        <g className="ofm-cash-group" style={{ transformOrigin: "0px " + baseline + "px", transformBox: "view-box", animation: "ofmCashBarEnter 560ms cubic-bezier(.2,.8,.2,1) " + Math.min(index * 14, 180) + "ms both" }}>
          <rect x={centre - pairGap / 2 - barWidth} y={baseline - incomeHeight} width={barWidth} height={incomeHeight} rx={3} fill={colors.income} fillOpacity={dim ? 0.35 : 1} style={{ transition: "fill-opacity 150ms ease" }} />
          <rect x={centre + pairGap / 2} y={baseline - expenseHeight} width={barWidth} height={expenseHeight} rx={3} fill={colors.expense} fillOpacity={dim ? 0.35 : 1} style={{ transition: "fill-opacity 150ms ease" }} />
        </g>
        <text x={x + column / 2} y={244} textAnchor="middle" fill={active ? colors.foreground : colors.mutedForeground} fontSize={11} fontFamily="Inter, sans-serif" fontWeight={active ? 600 : 400}>{bucket.label}</text>
        <rect x={x} y={0} width={column} height={plotHeight} fill="transparent" />
      </g>;
    })}
  </svg>, [fingerprint, plotWidth, column, selectedKey, hoveredKey, hideAmounts, currency, colors.border, colors.primary, colors.income, colors.expense, colors.foreground, colors.mutedForeground]);

  return <View onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))} style={{ padding: 16, gap: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, minWidth: 0 }}>
    <style>{'@keyframes ofmCashBarEnter{from{transform:scaleY(0);opacity:.35}to{transform:scaleY(1);opacity:1}}@media(prefers-reduced-motion:reduce){.ofm-cash-group{animation:none!important}}'}</style>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <View style={{ flex: 1, minWidth: 160 }}><Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Income & expenses</Text><Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Uses the date range selected above · {period.label}</Text></View>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", padding: 3, gap: 2, borderRadius: 8, backgroundColor: colors.muted }}>
        {GROUPS.map((item) => <TouchableOpacity key={item.value} accessibilityRole="tab" accessibilityState={{ selected: group === item.value }} accessibilityLabel={"Group transactions by " + item.label.toLowerCase()} onPress={() => setGroup(item.value)} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6, backgroundColor: group === item.value ? colors.card : "transparent" }}><Text style={{ color: group === item.value ? colors.foreground : colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{item.label}</Text></TouchableOpacity>)}
      </View>
    </View>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{selected ? rangeLabel(selected.startDate, selected.endDate) : rangeLabel(period.startDate, period.endDate)} · {(selected ? selected.transactions : data.transactions).length} transactions</Text>
      {selected ? <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedKey(null)}><Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Show full period</Text></TouchableOpacity> : null}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {[{ label: "Income", amount: totals.income, color: colors.income }, { label: "Expenses", amount: totals.expenses, color: colors.expense }, { label: "Net", amount: totals.net, color: totals.net < 0 ? colors.expense : colors.foreground }].map((item) => <View key={item.label} style={{ flexGrow: 1, flexBasis: "28%", minWidth: 100, gap: 4 }}><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{item.label}</Text><Text style={{ color: item.color, fontSize: 18, fontFamily: "Inter_600SemiBold" }}>{money(item.amount)}</Text></View>)}
    </View>
    {!data.transactions.length ? <View style={{ height: 186, alignItems: "center", justifyContent: "center", gap: 6 }}><Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>No transactions in this period</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Choose another date range above to see your cash flow.</Text></View> : <View style={{ position: "relative", minWidth: 0 }}>
      <View style={{ flexDirection: "row", minWidth: 0 }}>
        <svg width={gutter} height={plotHeight} aria-hidden="true" style={{ flexShrink: 0 }}>{visibleTicks.map((tick, index) => <text key={index} x={gutter - 10} y={baseline - tick / scale * amplitude + 4} textAnchor="end" fontFamily="Inter, sans-serif" fontSize={10} fill={colors.mutedForeground}>{hideAmounts ? "•••" : number(tick)}</text>)}</svg>
        <ScrollView ref={scroll} horizontal style={{ flex: 1, minWidth: 0 }} showsHorizontalScrollIndicator={plotWidth > viewport} scrollEventThrottle={16} onScroll={(event) => setScrollX(event.nativeEvent.contentOffset.x)}>{plot}</ScrollView>
      </View>
      {hovered ? <View pointerEvents="none" style={{ position: "absolute", top: 4, left: tooltipLeft, width: tooltipWidth, padding: 12, gap: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, boxShadow: "0 4px 18px rgba(0,0,0,.12)" } as any}>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{rangeLabel(hovered.startDate, hovered.endDate)}</Text>
        <Text style={{ color: colors.income, fontSize: 12 }}>Income: {money(hovered.income)}</Text><Text style={{ color: colors.expense, fontSize: 12 }}>Expenses: {money(hovered.expenses)}</Text><Text style={{ color: colors.foreground, fontSize: 12 }}>Net: {money(hovered.net)}</Text>
      </View> : null}
    </View>}
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: colors.income }} /><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Income</Text></View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: colors.expense }} /><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Expenses</Text></View>
      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{plotWidth > viewport && data.transactions.length ? "Scroll to see more periods · " : ""}Click a bar for its transactions</Text>
    </View>
    {selected ? <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{selected.transactions.length} {selected.transactions.length === 1 ? "transaction" : "transactions"} · {rangeLabel(selected.startDate, selected.endDate)}</Text>
      {!selected.transactions.length ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No transactions in this bar.</Text> : (showAll ? selected.transactions : selected.transactions.slice(0, 6)).map((transaction, index) => <View key={transaction.id + ":" + index} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.foreground, fontSize: 13 }}>{transaction.title || transaction.description || transaction.category || (transaction.type === "income" ? "Income" : "Expense")}</Text><Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 3 }}>{dateLabel(transaction.date)} · {transaction.category}</Text></View><Text style={{ color: transaction.type === "income" ? colors.income : colors.expense, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{hideAmounts ? "••••" : (transaction.type === "income" ? "+" : "−") + money(transaction.amount)}</Text></View>)}
      {selected.transactions.length > 6 ? <TouchableOpacity accessibilityRole="button" onPress={() => setShowAll((previous) => !previous)}><Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{showAll ? "Show fewer transactions" : "Show all " + selected.transactions.length + " transactions"}</Text></TouchableOpacity> : null}
    </View> : null}
  </View>;
}
