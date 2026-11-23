/**
 * Fiscal-year helpers shared by the top-bar fiscal-year picker, Settings and the Dashboard.
 *
 * A fiscal year is identified by the calendar year it STARTS in plus the start month (1–12).
 *   start month 7 (July, Pakistan default), start year 2026 → 1 Jul 2026 – 30 Jun 2027, label "2026-2027"
 *   start month 1 (January), start year 2026            → 1 Jan 2026 – 31 Dec 2026, label "2026"
 */

export const DEFAULT_FY_START_MONTH = 7;

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface FiscalRange {
  startYear: number;
  startMonth: number;
  label: string;
  start: Date;
  end: Date;
  startYmd: string;
  endYmd: string;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function normalizeStartMonth(m?: number | null): number {
  const n = Number(m);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : DEFAULT_FY_START_MONTH;
}

export function fiscalLabel(startYear: number, startMonth: number): string {
  return startMonth === 1 ? String(startYear) : `${startYear}-${startYear + 1}`;
}

export function fiscalRange(startYear: number, startMonth: number): FiscalRange {
  const m = normalizeStartMonth(startMonth);
  const start = new Date(startYear, m - 1, 1);
  const end = new Date(startYear + 1, m - 1, 0, 23, 59, 59); // last day of the month before the start month, one year later
  return { startYear, startMonth: m, label: fiscalLabel(startYear, m), start, end, startYmd: ymd(start), endYmd: ymd(end) };
}

/** Start year of the fiscal year that contains `date`. */
export function fiscalStartYearFor(date: Date, startMonth: number): number {
  const m = normalizeStartMonth(startMonth);
  return date.getMonth() + 1 >= m ? date.getFullYear() : date.getFullYear() - 1;
}

/** Reads the saved label ("2025-2026", "2025-26" or "2026"); falls back to the fiscal year containing today. */
export function parseFiscalStartYear(label: string | undefined, startMonth: number, today = new Date()): number {
  const m = String(label || "").match(/(\d{4})/);
  return m ? Number(m[1]) : fiscalStartYearFor(today, startMonth);
}

export function fiscalStatus(r: FiscalRange, today = new Date()): "upcoming" | "active" | "ended" {
  return today < r.start ? "upcoming" : today > r.end ? "ended" : "active";
}

/** 1–12 month number within the fiscal year (0 if not started, 12 if ended). */
export function fiscalMonthIndex(r: FiscalRange, today = new Date()): number {
  const st = fiscalStatus(r, today);
  if (st === "upcoming") return 0;
  if (st === "ended") return 12;
  return (today.getFullYear() - r.start.getFullYear()) * 12 + today.getMonth() - r.start.getMonth() + 1;
}

// ── Tiny bridge so the top-bar picker can ask the Dashboard to show a fiscal year ──
type DashPeriod = { startDate: string; endDate: string; label: string };
let pendingPeriod: DashPeriod | null = null;
const listeners = new Set<(p: DashPeriod) => void>();

export function showFiscalYearOnDashboard(r: FiscalRange) {
  const p = { startDate: r.startYmd, endDate: r.endYmd, label: `FY ${r.label}` };
  if (listeners.size > 0) {
    listeners.forEach((fn) => fn(p)); // dashboard is open: apply now
    pendingPeriod = null;
  } else {
    pendingPeriod = p; // dashboard not open yet: apply once when it mounts
  }
}

export function subscribeDashboardPeriod(fn: (p: DashPeriod) => void): () => void {
  listeners.add(fn);
  if (pendingPeriod) {
    const p = pendingPeriod;
    pendingPeriod = null;
    fn(p);
  }
  return () => {
    listeners.delete(fn);
  };
}
