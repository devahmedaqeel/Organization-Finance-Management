import type { NormalizedPeriod, Granularity } from "./DatePeriodService";
import { calculateTotalIncome, calculateTotalExpenses, Transaction } from "./FinancialCalculationEngine";

export interface CashFlowBucket {
  key: string; label: string; startDate: string; endDate: string;
  income: number; expenses: number; net: number; transactions: Transaction[];
}
const ymd = (date: Date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
function dateOnly(value: string): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day); date.setFullYear(year);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
function bucketStart(date: Date, group: Granularity): Date {
  const start = new Date(date);
  if (group === "week") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (group === "month") start.setDate(1);
  if (group === "year") { start.setDate(1); start.setMonth(0); }
  return start;
}
function nextBucket(date: Date, group: Granularity): Date {
  const next = new Date(date);
  if (group === "day") next.setDate(next.getDate() + 1);
  else if (group === "week") next.setDate(next.getDate() + 7);
  else if (group === "month") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}
const keyFor = (date: Date, group: Granularity) => ymd(bucketStart(date, group));

/** Read-only aggregation. It uses the same income/expense engine as the dashboard. */
export function buildCashFlowBarData(transactions: Transaction[], period: Pick<NormalizedPeriod, "startDate" | "endDate">, group: Granularity) {
  const start = dateOnly(period.startDate); const end = dateOnly(period.endDate);
  const empty = { buckets: [] as CashFlowBucket[], transactions: [] as Transaction[], income: 0, expenses: 0, net: 0 };
  if (!start || !end || end < start) return empty;
  const startDate = ymd(start); const endDate = ymd(end);
  const buckets: CashFlowBucket[] = [];
  const lookup = new Map<string, CashFlowBucket>();
  for (let cursor = bucketStart(start, group); cursor <= end; cursor = nextBucket(cursor, group)) {
    const following = nextBucket(cursor, group);
    const last = new Date(following); last.setDate(last.getDate() - 1);
    const from = cursor < start ? start : cursor; const to = last > end ? end : last;
    const label = group === "year" ? String(cursor.getFullYear()) : group === "month" ? cursor.toLocaleDateString("en-GB", { month: "short", ...(start.getFullYear() !== end.getFullYear() ? { year: "2-digit" as const } : {}) }) : from.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const bucket: CashFlowBucket = { key: ymd(cursor), label, startDate: ymd(from), endDate: ymd(to), income: 0, expenses: 0, net: 0, transactions: [] };
    buckets.push(bucket); lookup.set(bucket.key, bucket);
  }
  const valid: Transaction[] = [];
  for (const transaction of transactions || []) {
    if (!transaction || (transaction.type !== "income" && transaction.type !== "expense")) continue;
    if (["failed", "deleted", "void", "cancelled"].includes(String(transaction.status || "").toLowerCase())) continue;
    const amount = Number(transaction.amount); const date = dateOnly(transaction.date);
    if (!date || !Number.isFinite(amount) || amount <= 0) continue;
    const day = ymd(date); if (day < startDate || day > endDate) continue;
    const normalized = { ...transaction, amount, date: day };
    lookup.get(keyFor(date, group))?.transactions.push(normalized); valid.push(normalized);
  }
  for (const bucket of buckets) {
    bucket.income = money(calculateTotalIncome(bucket.transactions));
    bucket.expenses = money(calculateTotalExpenses(bucket.transactions));
    bucket.net = money(bucket.income - bucket.expenses);
  }
  const income = money(calculateTotalIncome(valid)); const expenses = money(calculateTotalExpenses(valid));
  return { buckets, transactions: valid, income, expenses, net: money(income - expenses) };
}
