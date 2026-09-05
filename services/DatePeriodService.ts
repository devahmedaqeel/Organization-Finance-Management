import AsyncStorage from "@react-native-async-storage/async-storage";
import { Transaction } from "@/context/FinanceContext";

export type Granularity = "day" | "week" | "month" | "year";
export type SelectionMode = "days" | "months" | "year" | "presets" | "custom";

export interface NormalizedPeriod {
  id?: string;
  mode: SelectionMode;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  label: string;
  granularity: Granularity;
  userGranularityOverride?: Granularity;
  presetId?: string;
}

export interface PeriodMetrics {
  durationDays: number;
  durationMonths: number;
  durationYears: number;
  recordCount: number;
  totalIncome: number;
  totalExpense: number;
  totalExpenses: number;
  netBalance: number;
  savingsRate: number;
}

export interface CategoryBreakdownItem {
  category: string;
  amount: number;
  pct: number;
  count: number;
}

export interface MonthlyTrendItem {
  month: string;
  income: number;
  expense: number;
  nob: number;
}

export interface NetOperatingBalanceHealth {
  totalIncome: number;
  operatingExpenses: number;
  netOperatingBalance: number;
  operatingMargin: number;
  expenseRatio: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  status: "healthy" | "watch" | "critical";
  statusLabel: string;
  statusColor: string;
  isDeficit: boolean;
  incomeBreakdown: CategoryBreakdownItem[];
  expenseBreakdown: CategoryBreakdownItem[];
  topExpenseCategories: CategoryBreakdownItem[];
  monthlyTrend: MonthlyTrendItem[];
}

export interface AggregatedPoint {
  key: string;
  label: string;
  fullDate: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYMD(str: string): Date {
  if (!str) return new Date();
  const parts = str.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function formatReadableDate(ymd: string): string {
  if (!ymd) return "";
  const d = parseYMD(ymd);
  return `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function getDataDateBounds(transactions: Transaction[]) {
  const currentYear = new Date().getFullYear();
  let minYear = currentYear - 1;
  let maxYear = currentYear + 1;
  let earliestDate = `${minYear}-01-01`;
  let latestDate = formatYMD(new Date());

  if (transactions && transactions.length > 0) {
    const dates = transactions
      .map((t) => t.date)
      .filter(Boolean)
      .sort();
    if (dates.length > 0) {
      earliestDate = dates[0];
      latestDate = dates[dates.length - 1];
      const eYear = parseInt(earliestDate.split("-")[0], 10);
      const lYear = parseInt(latestDate.split("-")[0], 10);
      if (!isNaN(eYear)) minYear = Math.min(minYear, eYear);
      if (!isNaN(lYear)) maxYear = Math.max(maxYear, lYear, currentYear);
    }
  }

  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    years.push(y);
  }

  return { minYear, maxYear, earliestDate, latestDate, years };
}

export function calculateIntelligentGranularity(startDate: string, endDate: string): Granularity {
  const start = parseYMD(startDate);
  const end = parseYMD(endDate);
  const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  if (diffDays <= 14) return "day";
  if (diffDays <= 90) return "week";
  if (diffDays <= 730) return "month";
  return "year";
}

export function getAvailableGranularities(): Granularity[] {
  return ["day", "week", "month", "year"];
}

export function getPresetPeriod(presetId: string): NormalizedPeriod {
  const now = new Date();
  const todayStr = formatYMD(now);
  let startDate = todayStr;
  let endDate = todayStr;
  let label = "Today";

  const key = (presetId || "").toLowerCase().trim();
  switch (key) {
    case "today": {
      startDate = todayStr;
      endDate = todayStr;
      label = `Today (${formatReadableDate(todayStr)})`;
      break;
    }
    case "1w":
    case "this_week":
    case "last_7d": {
      const s = new Date(now);
      s.setDate(now.getDate() - 6);
      startDate = formatYMD(s);
      endDate = todayStr;
      label = "Last 7 Days (1W)";
      break;
    }
    case "2w":
    case "last_14d": {
      const s = new Date(now);
      s.setDate(now.getDate() - 13);
      startDate = formatYMD(s);
      endDate = todayStr;
      label = "Last 14 Days (2W)";
      break;
    }
    case "1m":
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      startDate = formatYMD(s);
      endDate = formatYMD(e);
      label = `This Month (${MONTH_NAMES_SHORT[now.getMonth()]} ${now.getFullYear()})`;
      break;
    }
    case "last_30d": {
      const s = new Date(now);
      s.setDate(now.getDate() - 29);
      startDate = formatYMD(s);
      endDate = todayStr;
      label = "Last 30 Days";
      break;
    }
    case "3m":
    case "last_3m": {
      const s = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      startDate = formatYMD(s);
      endDate = formatYMD(e);
      label = "Last 3 Months";
      break;
    }
    case "6m":
    case "last_6m": {
      const s = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      startDate = formatYMD(s);
      endDate = formatYMD(e);
      label = "Last 6 Months";
      break;
    }
    case "1y":
    case "this_year": {
      startDate = `${now.getFullYear()}-01-01`;
      endDate = `${now.getFullYear()}-12-31`;
      label = `Full Year ${now.getFullYear()}`;
      break;
    }
    case "prev_year": {
      const py = now.getFullYear() - 1;
      startDate = `${py}-01-01`;
      endDate = `${py}-12-31`;
      label = `Year ${py}`;
      break;
    }
    case "all":
    case "all_time":
    default: {
      startDate = "2024-01-01";
      endDate = formatYMD(now);
      label = "All Time";
      break;
    }
  }

  const granularity = calculateIntelligentGranularity(startDate, endDate);

  return {
    mode: "presets",
    startDate,
    endDate,
    label,
    granularity,
    presetId,
  };
}

export function createCustomDatePeriod(startDate: string, endDate: string, customLabel?: string): NormalizedPeriod {
  const now = new Date();
  const cleanStart = startDate ? startDate.trim() : `${now.getFullYear()}-01-01`;
  const cleanEnd = endDate ? endDate.trim() : formatYMD(now);
  const granularity = calculateIntelligentGranularity(cleanStart, cleanEnd);
  const label = customLabel || `${formatReadableDate(cleanStart)} → ${formatReadableDate(cleanEnd)}`;

  return {
    mode: "days",
    startDate: cleanStart,
    endDate: cleanEnd,
    label,
    granularity,
    presetId: "custom",
  };
}

export function filterTransactionsByPeriod(
  transactions: Transaction[],
  period: NormalizedPeriod
): Transaction[] {
  if (!transactions || transactions.length === 0) return [];
  if (!period || !period.startDate || !period.endDate) {
    return transactions.filter((t) => {
      if (!t) return false;
      const status = (t as any).status;
      return status !== "deleted" && status !== "void" && status !== "cancelled";
    });
  }
  const { startDate, endDate } = period;
  return transactions.filter((t) => {
    if (!t || !t.date) return false;
    const status = (t as any).status;
    if (status === "deleted" || status === "void" || status === "cancelled") return false;
    const txDate = t.date.slice(0, 10);
    return txDate >= startDate && txDate <= endDate;
  });
}

export function computePeriodMetrics(
  transactions: Transaction[],
  period?: NormalizedPeriod
): PeriodMetrics {
  const effectivePeriod = period || getPresetPeriod("all_time");
  const filtered = filterTransactionsByPeriod(transactions, effectivePeriod);
  const start = parseYMD(effectivePeriod.startDate);
  const end = parseYMD(effectivePeriod.endDate);
  const durationDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const durationMonths = Number((durationDays / 30.4375).toFixed(1));
  const durationYears = Number((durationDays / 365.25).toFixed(2));

  const totalIncome = filtered
    .filter((t) => t.type === "income" && (t as any).status !== "deleted" && (t as any).status !== "void" && (t as any).status !== "cancelled")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered
    .filter((t) => t.type === "expense" && (t as any).status !== "deleted" && (t as any).status !== "void" && (t as any).status !== "cancelled")
    .reduce((s, t) => s + t.amount, 0);
  const netBalance = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netBalance / totalIncome) * 100 : 0;

  return {
    durationDays,
    durationMonths,
    durationYears,
    recordCount: filtered.length,
    totalIncome,
    totalExpense,
    totalExpenses: totalExpense,
    netBalance,
    savingsRate,
  };
}

export function isOperatingIncome(t: Transaction): boolean {
  if (!t || !t.amount || t.amount <= 0) return false;
  if (t.type !== "income") return false;
  const status = (t as any).status;
  if (status === "cancelled" || status === "void" || status === "deleted") return false;
  return true;
}

export function isOperatingExpense(t: Transaction): boolean {
  if (!t || !t.amount || t.amount <= 0) return false;
  if (t.type !== "expense") return false;
  const status = (t as any).status;
  if (status === "cancelled" || status === "void" || status === "deleted") return false;
  return true;
}

export function computeNetOperatingBalanceHealth(
  transactions: Transaction[],
  period: NormalizedPeriod
): NetOperatingBalanceHealth {
  const filtered = filterTransactionsByPeriod(transactions, period);
  const incomeTxs = filtered.filter(isOperatingIncome);
  const expenseTxs = filtered.filter(isOperatingExpense);

  const totalIncome = incomeTxs.reduce((s, t) => s + t.amount, 0);
  const operatingExpenses = expenseTxs.reduce((s, t) => s + t.amount, 0);
  const netOperatingBalance = totalIncome - operatingExpenses;

  const operatingMargin = totalIncome > 0
    ? (netOperatingBalance / totalIncome) * 100
    : 0;
  const expenseRatio = totalIncome > 0
    ? (operatingExpenses / totalIncome) * 100
    : (operatingExpenses > 0 ? 100 : 0);

  const isDeficit = netOperatingBalance < 0;
  let status: "healthy" | "watch" | "critical" = "healthy";
  let statusLabel = "Healthy Surplus";
  let statusColor = "#10B981";

  if (isDeficit) {
    status = "critical";
    statusLabel = "Operating Deficit";
    statusColor = "#F43F5E";
  } else if (totalIncome === 0 && operatingExpenses === 0) {
    status = "healthy";
    statusLabel = "Zero Activity";
    statusColor = "#94A3B8";
  } else if (operatingMargin < 25 || expenseRatio > 75) {
    status = "watch";
    statusLabel = "Tight Margin";
    statusColor = "#F59E0B";
  } else {
    status = "healthy";
    statusLabel = `${operatingMargin.toFixed(1)}% Margin`;
    statusColor = "#10B981";
  }

  // Income category breakdown
  const incomeMap: Record<string, { amount: number; count: number }> = {};
  incomeTxs.forEach((t) => {
    const cat = t.category || "General Income";
    if (!incomeMap[cat]) incomeMap[cat] = { amount: 0, count: 0 };
    incomeMap[cat].amount += t.amount;
    incomeMap[cat].count += 1;
  });
  const incomeBreakdown: CategoryBreakdownItem[] = Object.entries(incomeMap)
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      pct: totalIncome > 0 ? Number(((data.amount / totalIncome) * 100).toFixed(1)) : 0,
      count: data.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Expense category breakdown
  const expenseMap: Record<string, { amount: number; count: number }> = {};
  expenseTxs.forEach((t) => {
    const cat = t.category || "General Expense";
    if (!expenseMap[cat]) expenseMap[cat] = { amount: 0, count: 0 };
    expenseMap[cat].amount += t.amount;
    expenseMap[cat].count += 1;
  });
  const expenseBreakdown: CategoryBreakdownItem[] = Object.entries(expenseMap)
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      pct: operatingExpenses > 0 ? Number(((data.amount / operatingExpenses) * 100).toFixed(1)) : 0,
      count: data.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  const topExpenseCategories = expenseBreakdown.slice(0, 5);

  // Monthly Trend Map
  const monthMap: Record<string, { income: number; expense: number }> = {};
  filtered.forEach((t) => {
    if (!t.date) return;
    const ym = t.date.slice(0, 7); // "YYYY-MM"
    if (!monthMap[ym]) monthMap[ym] = { income: 0, expense: 0 };
    if (isOperatingIncome(t)) monthMap[ym].income += t.amount;
    if (isOperatingExpense(t)) monthMap[ym].expense += t.amount;
  });

  const monthlyTrend: MonthlyTrendItem[] = Object.keys(monthMap)
    .sort()
    .map((ym) => {
      const d = monthMap[ym];
      return {
        month: ym,
        income: d.income,
        expense: d.expense,
        nob: d.income - d.expense,
      };
    });

  return {
    totalIncome,
    operatingExpenses,
    netOperatingBalance,
    operatingMargin,
    expenseRatio,
    transactionCount: incomeTxs.length + expenseTxs.length,
    incomeCount: incomeTxs.length,
    expenseCount: expenseTxs.length,
    status,
    statusLabel,
    statusColor,
    isDeficit,
    incomeBreakdown,
    expenseBreakdown,
    topExpenseCategories,
    monthlyTrend,
  };
}

/**
 * Generates dynamic, context-aware micro-insights for the 3 financial cards.
 */
export function getBudgetInsight(allocated: number, spent: number, currency = "PKR"): string {
  if (allocated <= 0) {
    return spent > 0
      ? `Disbursing without a ceiling: ${currency} ${spent.toLocaleString()} spent with no cap set.`
      : "No budget ceiling configured for the active period.";
  }
  if (spent > allocated) {
    const overspend = spent - allocated;
    return `🚨 Critical: Budget exceeded by ${currency} ${overspend.toLocaleString()} (${((spent / allocated) * 100).toFixed(0)}% of cap).`;
  }
  if (spent === 0) {
    return "🟢 100% of the allocated budget ceiling remains untouched.";
  }
  const remaining = allocated - spent;
  const remainingPct = (remaining / allocated) * 100;
  if (remainingPct <= 20) {
    return `⚠️ Warning: Approaching ceiling with only ${remainingPct.toFixed(0)}% (${currency} ${remaining.toLocaleString()}) buffer left.`;
  }
  return `🟢 Healthy: You have ${remainingPct.toFixed(0)}% (${currency} ${remaining.toLocaleString()}) of the allocated budget remaining.`;
}

export function getNobInsight(nob: NetOperatingBalanceHealth, currency = "PKR"): string {
  if (!nob) return "No operating revenue or disbursements recorded in this period.";
  const totalIncome = nob.totalIncome ?? 0;
  const operatingExpenses = nob.operatingExpenses ?? 0;
  const netOperatingBalance = nob.netOperatingBalance ?? (totalIncome - operatingExpenses);
  const operatingMargin = nob.operatingMargin ?? 0;
  const isDeficit = nob.isDeficit ?? (netOperatingBalance < 0);

  if (totalIncome === 0 && operatingExpenses === 0) {
    return "No operating revenue or disbursements recorded in this period.";
  }
  if (isDeficit) {
    return `🚨 Operating deficit of ${currency} ${Math.abs(netOperatingBalance).toLocaleString()} detected (Expenses exceed revenue by ${Math.abs(operatingMargin).toFixed(1)}%).`;
  }
  if (operatingMargin >= 50) {
    return `🟢 Strong operating surplus retaining ${operatingMargin.toFixed(1)}% (+${currency} ${netOperatingBalance.toLocaleString()}) of incoming revenue.`;
  }
  if (operatingMargin < 20) {
    return `⚠️ Tight operating margin: Only ${operatingMargin.toFixed(1)}% of revenue retained after operational expenses.`;
  }
  return `🟢 Stable operating performance with ${operatingMargin.toFixed(1)}% net cash flow retention.`;
}

export function getExpenseDistributionInsight(
  breakdown: CategoryBreakdownItem[],
  totalExpenses: number
): string {
  if (totalExpenses <= 0 || !breakdown || breakdown.length === 0) {
    return "No operational expenses recorded for this period.";
  }
  const top = breakdown[0];
  if (breakdown.length === 1 || top.pct >= 90) {
    return `📊 ${top.category} is the dominant cost driver, accounting for ${top.pct.toFixed(0)}% of all disbursements.`;
  }
  if (breakdown.length >= 2) {
    const top2 = breakdown.slice(0, 2);
    const combinedPct = top2.reduce((s, c) => s + c.pct, 0);
    return `📊 ${top.category} (${top.pct.toFixed(0)}%) and ${top2[1].category} (${top2[1].pct.toFixed(0)}%) drive ${combinedPct.toFixed(0)}% of operational spending.`;
  }
  return `📊 Expenses are distributed across ${breakdown.length} active cost categories.`;
}

/**
 * Authoritative financial aggregation engine computing 100% true data from database transactions.
 * Never invents mock numbers or synthetic wave profiles.
 */
export function aggregateTransactionsByGranularity(
  transactions: Transaction[],
  period: NormalizedPeriod,
  granularityOverride?: Granularity
): AggregatedPoint[] {
  const granularity = granularityOverride || period.userGranularityOverride || period.granularity;
  const filtered = filterTransactionsByPeriod(transactions, period);
  const start = parseYMD(period.startDate);
  const end = parseYMD(period.endDate);

  // ─── 1. DAY VIEW (Accurate daily sum of real transactions) ───
  if (granularity === "day") {
    const dayCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const loopStart = new Date(start);

    const dayMap: Record<string, { inc: number; exp: number; count: number }> = {};
    filtered.forEach((t) => {
      const dKey = (t.date || "").slice(0, 10);
      const amt = Number(t.amount || 0);
      if (isNaN(amt) || amt <= 0) return;
      if (!dayMap[dKey]) dayMap[dKey] = { inc: 0, exp: 0, count: 0 };
      if (t.type === "income") dayMap[dKey].inc += amt;
      else if (t.type === "expense") dayMap[dKey].exp += amt;
      dayMap[dKey].count += 1;
    });

    const points: AggregatedPoint[] = [];

    for (let d = 0; d < dayCount; d++) {
      const curr = new Date(loopStart);
      curr.setDate(loopStart.getDate() + d);
      const ymd = formatYMD(curr);
      const dayNum = curr.getDate();
      const dayOfWeekIdx = curr.getDay(); // 0=Sun..6=Sat
      const weekdayShort = WEEKDAY_NAMES[dayOfWeekIdx];
      const weekdayLong = WEEKDAY_FULL[dayOfWeekIdx];
      const mName = MONTH_NAMES_SHORT[curr.getMonth()];
      const yr = curr.getFullYear();

      const txData = dayMap[ymd];
      const inc = txData ? txData.inc : 0;
      const exp = txData ? txData.exp : 0;
      const count = txData ? txData.count : 0;

      points.push({
        key: ymd,
        label: dayCount <= 7 ? weekdayShort : `${dayNum} ${mName}`,
        fullDate: `${weekdayLong}, ${dayNum} ${mName} ${yr}`,
        income: inc,
        expense: exp,
        net: inc - exp,
        count,
      });
    }
    return points;
  }

  // ─── 2. WEEK VIEW (Accurate weekly sum of real transactions) ───
  if (granularity === "week") {
    const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const numWeeks = Math.max(1, Math.ceil(diffDays / 7));
    const points: AggregatedPoint[] = [];

    for (let w = 0; w < numWeeks; w++) {
      const wStart = new Date(start);
      wStart.setDate(start.getDate() + w * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 6);
      if (wEnd > end) wEnd.setTime(end.getTime());

      const sYMD = formatYMD(wStart);
      const eYMD = formatYMD(wEnd);

      const weekTxs = filtered.filter((t) => {
        const dKey = (t.date || "").slice(0, 10);
        return dKey >= sYMD && dKey <= eYMD;
      });
      const inc = weekTxs
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      const exp = weekTxs
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + Number(t.amount || 0), 0);

      const mLabel = MONTH_NAMES_SHORT[wStart.getMonth()];

      points.push({
        key: `W${w + 1}`,
        label: numWeeks <= 5 ? `W${w + 1}` : `W${w + 1} (${mLabel})`,
        fullDate: `Week ${w + 1} (${wStart.getDate()} ${MONTH_NAMES_SHORT[wStart.getMonth()]} – ${wEnd.getDate()} ${MONTH_NAMES_SHORT[wEnd.getMonth()]} ${wEnd.getFullYear()})`,
        income: inc,
        expense: exp,
        net: inc - exp,
        count: weekTxs.length,
      });
    }
    return points;
  }

  // ─── 3. MONTH VIEW (Accurate monthly sum of real transactions) ───
  if (granularity === "month") {
    const sYear = start.getFullYear();
    const eYear = end.getFullYear();
    const sMonth = start.getMonth();
    const eMonth = end.getMonth();

    const monthMap: Record<string, { inc: number; exp: number; count: number }> = {};
    filtered.forEach((t) => {
      const ym = (t.date || "").slice(0, 7);
      const amt = Number(t.amount || 0);
      if (isNaN(amt) || amt <= 0) return;
      if (!monthMap[ym]) monthMap[ym] = { inc: 0, exp: 0, count: 0 };
      if (t.type === "income") monthMap[ym].inc += amt;
      else if (t.type === "expense") monthMap[ym].exp += amt;
      monthMap[ym].count += 1;
    });

    const points: AggregatedPoint[] = [];

    for (let yr = sYear; yr <= eYear; yr++) {
      const startM = yr === sYear ? sMonth : 0;
      const endM = yr === eYear ? eMonth : 11;

      for (let m = startM; m <= endM; m++) {
        const ym = `${yr}-${String(m + 1).padStart(2, "0")}`;
        const txData = monthMap[ym];
        const inc = txData ? txData.inc : 0;
        const exp = txData ? txData.exp : 0;
        const count = txData ? txData.count : 0;

        points.push({
          key: ym,
          label: MONTH_NAMES_SHORT[m],
          fullDate: `${MONTH_NAMES_FULL[m]} ${yr}`,
          income: inc,
          expense: exp,
          net: inc - exp,
          count,
        });
      }
    }
    return points;
  }

  // ─── 4. YEAR VIEW (Accurate yearly sum of real transactions) ───
  let startYear = start.getFullYear();
  let endYear = end.getFullYear();

  if (endYear - startYear < 3) {
    startYear = Math.max(2023, endYear - 3);
    endYear = Math.max(endYear, new Date().getFullYear());
  }

  const yearMap: Record<string, { inc: number; exp: number; count: number }> = {};
  filtered.forEach((t) => {
    const yr = (t.date || "").substring(0, 4);
    const amt = Number(t.amount || 0);
    if (isNaN(amt) || amt <= 0) return;
    if (!yearMap[yr]) yearMap[yr] = { inc: 0, exp: 0, count: 0 };
    if (t.type === "income") yearMap[yr].inc += amt;
    else if (t.type === "expense") yearMap[yr].exp += amt;
    yearMap[yr].count += 1;
  });

  const points: AggregatedPoint[] = [];

  for (let yr = startYear; yr <= endYear; yr++) {
    const yrStr = String(yr);
    const txData = yearMap[yrStr];
    const inc = txData ? txData.inc : 0;
    const exp = txData ? txData.exp : 0;
    const count = txData ? txData.count : 0;

    points.push({
      key: yrStr,
      label: yrStr,
      fullDate: `Full Year ${yrStr}`,
      income: inc,
      expense: exp,
      net: inc - exp,
      count,
    });
  }
  return points;
}
