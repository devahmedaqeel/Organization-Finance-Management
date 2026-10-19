/**
 * services/payslipTemplateRenderer.ts
 *
 * Turns a stored payroll record + organization profile + payslip template into HTML.
 * The SAME function feeds the web preview (iframe), the mobile preview (WebView),
 * printing and PDF generation, so all of them show identical figures and layout.
 *
 * Financial rules:
 * - Figures come from the stored payroll record. Stored totals (netSalary, summary)
 *   are authoritative and are never recalculated — finalized history stays intact.
 * - Nothing is invented: a value that is not on the record is not printed.
 * - Employer contributions are shown separately and never reduce net pay.
 * - Template settings (labels, visibility, ordering) affect presentation only.
 */

import {
  PayslipTemplate,
  PayslipSectionConfig,
  PayslipSectionKey,
  PayslipFieldConfig,
  PayslipTextBlock,
  CustomFieldPlacement,
  FONT_FAMILIES,
  componentKey,
  getField,
  getSection,
  isSensitiveField,
} from "./payslipTemplateConfig";
import { WORLD_CURRENCIES } from "../constants/currencies";

// ============================================================================
// RENDER DATA
// ============================================================================

export interface PayslipLine {
  code?: string;
  name: string;
  amount: number;
}

export interface PayslipLoanLine {
  loanId: string;
  description: string;
  principal?: number;
  installment: number;
  balance?: number;
  status?: string;
}

export interface PayslipOrganizationProfile {
  organizationId?: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  /** Logo saved in the organization profile (orgSettings.organizationLogo). */
  logo?: string;
  currency: string;
}

export interface PayslipTotals {
  basicSalary: number;
  totalAllowances: number;
  grossSalary: number;
  totalGeneralDeductions: number;
  totalLoanDeductions: number;
  totalTaxDeductions: number;
  otherDeductions: number;
  totalEmployeeDeductions: number;
  netSalary: number;
  employerContributions: number;
  totalEmployerCost: number;
}

export interface PayslipRenderData {
  org: PayslipOrganizationProfile;
  meta: {
    recordId: string;
    period: string; // raw, e.g. "2026-10"
    periodLabel: string; // e.g. "October 2026"
    payslipNumber: string;
    issueDate?: string;
    generatedAt: string;
    verificationCode: string;
    payrollStatus?: string;
  };
  employee: Record<string, string | undefined>;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  loans: PayslipLoanLine[];
  employer: PayslipLine[];
  tax?: {
    taxableIncome?: number;
    taxPeriod?: string;
    taxDeductedThisMonth?: number;
    taxRecoveredPreviously?: number;
    taxExemptions?: number;
    taxAdjustment?: number;
    remainingTaxPayable?: number;
  };
  attendance?: Record<string, number | string | undefined>;
  payment: Record<string, string | undefined>;
  approval: { approvedBy?: string; approvedAt?: string };
  totals: PayslipTotals;
  /** Consistency notes for the UI (never printed). */
  warnings: string[];
}

export interface BuildRenderDataOptions {
  /** May the viewer see unmasked CNIC/NTN/bank details? */
  canViewSensitive: boolean;
  /** Fixed "now" for deterministic output (tests); defaults to new Date(). */
  now?: Date;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sum(values: number[]): number {
  return round2(values.reduce((s, v) => s + v, 0));
}

function text(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

export function formatPeriodLabel(month?: string): string {
  if (!month) return "";
  const m = /^(\d{4})-(\d{1,2})$/.exec(month.trim());
  if (!m) return month;
  const idx = parseInt(m[2], 10) - 1;
  return MONTHS[idx] ? `${MONTHS[idx]} ${m[1]}` : month;
}

function periodEnd(month?: string): Date | undefined {
  const m = /^(\d{4})-(\d{1,2})$/.exec((month || "").trim());
  if (!m) return undefined;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10), 0);
}

export function serviceLength(joining?: string, asOf?: Date): string | undefined {
  if (!joining) return undefined;
  const start = parseDate(joining);
  if (!start) return undefined;
  const end = asOf || new Date();
  if (end < start) return undefined;
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  if (days < 0) {
    months--;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} Year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} Month${months === 1 ? "" : "s"}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} Day${days === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** Parses ISO (YYYY-MM-DD…) and DD.MM.YYYY / DD/MM/YYYY dates. Returns undefined when unsure. */
export function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const v = String(value).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return undefined;
}

/** Simple deterministic hash so preview and PDF show the same verification code. */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(7, "0");
}

export function maskValue(value?: string, visibleTail = 4): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/\s/g, "");
  if (clean.length <= visibleTail) return "•".repeat(clean.length);
  return "•".repeat(Math.min(8, clean.length - visibleTail)) + clean.slice(-visibleTail);
}

function mapLines(items: unknown): PayslipLine[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i && typeof i === "object")
    .map((i: any) => ({
      code: text(i.code),
      name: text(i.name) || text(i.label) || "Component",
      amount: round2(num(i.calculatedAmount) ?? num(i.amount) ?? 0),
    }));
}

/**
 * Builds presentation data from a stored payroll record. Pure: no I/O.
 */
export function buildPayslipRenderData(
  entry: any,
  org: PayslipOrganizationProfile,
  opts: BuildRenderDataOptions
): PayslipRenderData {
  if (!entry || typeof entry !== "object") {
    throw new Error("PAYSLIP_DATA_INVALID: Payroll record is missing.");
  }
  const warnings: string[] = [];
  const now = opts.now || new Date();
  const summary = entry.summary && typeof entry.summary === "object" ? entry.summary : undefined;

  // Never show another organization's branding.
  let logo = text(org.logo);
  if (entry.organizationId && org.organizationId && entry.organizationId !== org.organizationId) {
    logo = undefined;
    warnings.push("This payroll record belongs to a different organization; its logo cannot be shown.");
  }

  // ── Earnings ────────────────────────────────────────────────
  let earnings = mapLines(entry.itemizedEarnings);
  if (earnings.length === 0) earnings = mapLines(entry.customAllowances);
  const baseSalary = num(entry.baseSalary) ?? num(entry.basicSalary);
  const bonus = num(entry.bonus);

  if (earnings.length === 0) {
    if (baseSalary !== undefined) earnings.push({ name: "Basic Pay", amount: round2(baseSalary) });
    if (bonus) earnings.push({ name: "Bonus / Allowances", amount: round2(bonus) });
  } else {
    // Custom items or itemized earnings were provided.
    // If basic pay is not present in the custom items, include Basic Pay at the top.
    const hasBasic = earnings.some((e) => /^(basic|0001|bp)$/i.test(e.code || "") || /basic/i.test(e.name));
    if (!hasBasic && baseSalary !== undefined && baseSalary > 0) {
      earnings.unshift({ code: "0001", name: "Basic Pay", amount: round2(baseSalary) });
    }
  }

  // ── Loans / tax / employer ──────────────────────────────────
  const loans: PayslipLoanLine[] = Array.isArray(entry.loanDeductions)
    ? entry.loanDeductions
        .filter((l: any) => l && typeof l === "object")
        .map((l: any, i: number) => ({
          loanId: text(l.loanCode) || text(l.loanId) || text(l.loanType) || `Loan ${i + 1}`,
          description: text(l.description) || text(l.loanType) || "Loan / Advance",
          principal: num(l.originalPrincipal) ?? num(l.principal),
          installment: round2(num(l.currentDeduction) ?? num(l.installmentAmount) ?? 0),
          balance: num(l.outstandingBalance) ?? num(l.balance),
          status: text(l.status),
        }))
    : [];

  const td = entry.taxDetails && typeof entry.taxDetails === "object" ? entry.taxDetails : undefined;
  const tax = td
    ? {
        taxableIncome: num(td.taxableIncome),
        taxPeriod: text(td.taxPeriod),
        taxDeductedThisMonth: num(td.taxDeductedThisMonth),
        taxRecoveredPreviously: num(td.taxRecoveredPreviously),
        taxExemptions: num(td.taxExemptions),
        taxAdjustment: num(td.taxAdjustment),
        remainingTaxPayable: num(td.remainingTaxPayable),
      }
    : undefined;

  const employer = mapLines(entry.employerContributions);

  // ── General deductions ──────────────────────────────────────
  let deductions = mapLines(entry.itemizedDeductions);
  if (deductions.length === 0) deductions = mapLines(entry.customDeductions);
  if (deductions.length === 0) {
    // Legacy records store a single deductions amount. When loans/tax are itemized
    // separately, only the remainder is a "general" deduction (avoids double counting).
    const lump = num(entry.deductions) ?? 0;
    const separately = sum(loans.map((l) => l.installment)) + (tax?.taxDeductedThisMonth ?? 0);
    const general = loans.length > 0 || tax ? round2(Math.max(0, lump - separately)) : round2(lump);
    if (general > 0) deductions.push({ name: "Deductions", amount: general });
  }

  // ── Totals (stored values win) ──────────────────────────────
  const grossSalary = round2(num(summary?.grossSalary) ?? sum(earnings.map((e) => e.amount)));
  const basicLine = earnings.find((e) => /^(basic|0001|bp)$/i.test(e.code || "") || /basic/i.test(e.name));
  const basicSalary = round2(num(summary?.basicSalary) ?? baseSalary ?? basicLine?.amount ?? 0);
  const totalAllowances = round2(num(summary?.totalAllowances) ?? Math.max(0, grossSalary - basicSalary));
  const totalGeneralDeductions = round2(num(summary?.totalGeneralDeductions) ?? sum(deductions.map((d) => d.amount)));
  const totalLoanDeductions = round2(num(summary?.totalLoanDeductions) ?? sum(loans.map((l) => l.installment)));
  const totalTaxDeductions = round2(num(summary?.totalTaxDeductions) ?? tax?.taxDeductedThisMonth ?? 0);
  const otherDeductions = round2(num(summary?.otherDeductions) ?? 0);
  const computedEmployeeDeductions = round2(totalGeneralDeductions + totalLoanDeductions + totalTaxDeductions + otherDeductions);
  const totalEmployeeDeductions = round2(num(summary?.totalEmployeeDeductions) ?? computedEmployeeDeductions);
  const storedNet = num(entry.netSalary) ?? num(summary?.netSalaryPayable);
  const computedNet = round2(grossSalary - totalEmployeeDeductions);
  const netSalary = round2(storedNet ?? computedNet);
  if (storedNet !== undefined && Math.abs(storedNet - computedNet) > 0.01) {
    warnings.push(
      `Stored net salary (${storedNet.toFixed(2)}) differs from gross minus deductions (${computedNet.toFixed(2)}). The stored figure is shown.`
    );
  }
  const employerContributions = round2(num(summary?.employerContributions) ?? sum(employer.map((e) => e.amount)));
  const totalEmployerCost = round2(
    num(entry.totalEmployerCost) ?? num(summary?.totalEmployerPayrollCost) ?? grossSalary + employerContributions
  );

  // ── Identity & meta ─────────────────────────────────────────
  const month = text(entry.month) || text(entry.period) || "";
  const employeeId = text(entry.employeeId) || "";
  const recordId = text(entry.id) || employeeId;
  const payslipNumber =
    text(entry.payslipNumber) ||
    `PS-${(employeeId || "EMP").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()}-${month.replace(/[^0-9]/g, "") || "000000"}`;
  const verificationCode =
    text(entry.verificationCode) || `OFM-${stableHash(`${recordId}|${month}|${netSalary.toFixed(2)}|${org.organizationId || ""}`)}`;

  const cnicRaw = text(entry.cnic) || text(entry.cnicNumber);
  const ntnRaw = text(entry.ntn) || text(entry.taxIdentificationNumber);
  const accountRaw = text(entry.bankAccountNumber);
  const dateOfJoining = text(entry.dateOfJoining) || text(entry.joiningDate);

  const employee: Record<string, string | undefined> = {
    employeeName: text(entry.employeeName) || text(entry.fullName),
    employeeId: employeeId || undefined,
    cnic: opts.canViewSensitive ? cnicRaw : maskValue(cnicRaw),
    ntn: opts.canViewSensitive ? ntnRaw : maskValue(ntnRaw),
    designation: text(entry.designation),
    department: text(entry.department),
    branch: text(entry.branch),
    employmentCategory: text(entry.employmentCategory),
    dateOfJoining,
    lengthOfService: text(entry.lengthOfService) || serviceLength(dateOfJoining, periodEnd(month) || now),
    payScale: text(entry.payScale) || text(entry.bps) || text(entry.grade),
    payStage: text(entry.payStage) || text(entry.payStep),
    basicSalary: baseSalary !== undefined ? String(baseSalary) : undefined,
    payrollSection: text(entry.payrollSection),
    email: text(entry.email),
    phone: text(entry.phone),
    address: text(entry.permanentAddress) || text(entry.address),
  };

  const att = entry.attendanceDetails && typeof entry.attendanceDetails === "object" ? entry.attendanceDetails : undefined;
  const attendance = att || entry.leaveBalance !== undefined
    ? {
        workingDays: num(att?.workingDays),
        daysPresent: num(att?.daysPresent),
        paidLeave: num(att?.paidLeave),
        unpaidLeave: num(att?.unpaidLeave),
        absences: num(att?.absences),
        overtimeHours: num(att?.overtimeHours),
        leaveBalance: text(entry.leaveBalance) ?? text(att?.leaveBalance),
      }
    : undefined;

  const paymentStatus = text(entry.paymentStatus) || text(entry.status);
  const payment: Record<string, string | undefined> = {
    payeeName: text(entry.payeeName) || text(entry.employeeName),
    bankName: [text(entry.bankName), text(entry.bankBranch)].filter(Boolean).join(", ") || undefined,
    bankAccount: opts.canViewSensitive ? accountRaw : maskValue(accountRaw),
    paymentMethod: text(entry.paymentMethod),
    paymentDate: text(entry.paymentDate) || text(entry.paidAt),
    paymentReference: text(entry.transactionReference) || text(entry.paymentReference),
    paymentStatus: paymentStatus ? paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1) : undefined,
  };

  return {
    org: { ...org, logo },
    meta: {
      recordId,
      period: month,
      periodLabel: formatPeriodLabel(month),
      payslipNumber,
      issueDate: text(entry.issueDate) || text(entry.finalizedAt) || text(entry.createdAt),
      generatedAt: now.toISOString(),
      verificationCode,
      payrollStatus: text(entry.payrollStatus),
    },
    employee,
    earnings,
    deductions,
    loans,
    employer,
    tax,
    attendance,
    payment,
    approval: { approvedBy: text(entry.approvedBy), approvedAt: text(entry.approvedAt) },
    totals: {
      basicSalary,
      totalAllowances,
      grossSalary,
      totalGeneralDeductions,
      totalLoanDeductions,
      totalTaxDeductions,
      otherDeductions,
      totalEmployeeDeductions,
      netSalary,
      employerContributions,
      totalEmployerCost,
    },
    warnings,
  };
}

// ============================================================================
// FORMATTING
// ============================================================================

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only image data URIs and http(s) URLs may be used as a logo source. */
export function isSafeLogoSrc(src?: string): boolean {
  if (!src) return false;
  return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(src) || /^https?:\/\/[^\s"'<>]+$/i.test(src);
}

export function formatAmount(amount: number, template: PayslipTemplate, currency: string, negative = false): string {
  const d = template.format.decimals;
  const body = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  let prefix = "";
  if (template.format.currencyDisplay === "code") prefix = `${currency} `;
  else if (template.format.currencyDisplay === "symbol") {
    prefix = `${WORLD_CURRENCIES.find((c) => c.code === currency)?.symbol || currency} `;
  }
  const value = `${prefix}${body}`;
  const isNeg = negative ? amount !== 0 : amount < 0;
  if (!isNeg) return value;
  return template.format.negativeStyle === "parentheses" ? `(${value})` : `-${value}`;
}

export function formatDate(value: string | undefined, template: PayslipTemplate): string | undefined {
  if (!value) return undefined;
  const d = parseDate(value) || (isNaN(Date.parse(value)) ? undefined : new Date(value));
  if (!d) return value;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  switch (template.format.dateFormat) {
    case "DD/MM/YYYY": return `${dd}/${mm}/${yyyy}`;
    case "MM/DD/YYYY": return `${mm}/${dd}/${yyyy}`;
    case "YYYY-MM-DD": return `${yyyy}-${mm}-${dd}`;
    case "D MMM YYYY": return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${yyyy}`;
    default: return `${dd}.${mm}.${yyyy}`;
  }
}

// ============================================================================
// HTML RENDERING
// ============================================================================

export interface RenderHtmlOptions {
  /** "screen" adds a grey backdrop & sheet shadow for previews; "print" is clean for PDF engines. */
  mode?: "screen" | "print";
  /** Placeholder text shown when the profile has no logo (only in screen mode). */
  showLogoPlaceholder?: boolean;
  documentTitle?: string;
}

const DATE_FIELDS = new Set(["dateOfJoining", "issueDate", "paymentDate", "approvedAt"]);
const AMOUNT_EMPLOYEE_FIELDS = new Set(["basicSalary"]);

interface Ctx {
  t: PayslipTemplate;
  d: PayslipRenderData;
  cur: string;
}

function visibleField(section: PayslipSectionConfig, key: string): string | null {
  const f = getField(section, key);
  if (!f || !f.visible) return null;
  return f.label;
}

function amt(ctx: Ctx, n: number, negative = false): string {
  return escapeHtml(formatAmount(n, ctx.t, ctx.cur, negative));
}

function infoGrid(items: Array<{ label: string; value: string }>, columns: number): string {
  if (items.length === 0) return "";
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += columns) {
    const cells = items.slice(i, i + columns);
    rows.push(
      `<tr>${cells
        .map((c) => `<td><span class="lbl">${escapeHtml(c.label)}:</span> <span class="val">${escapeHtml(c.value)}</span></td>`)
        .join("")}${"<td></td>".repeat(columns - cells.length)}</tr>`
    );
  }
  return `<table class="info-grid">${rows.join("")}</table>`;
}

function sectionTitle(section: PayslipSectionConfig): string {
  return section.title.trim() ? `<div class="sec-title">${escapeHtml(section.title)}</div>` : "";
}

function resolveMapped(ctx: Ctx, key?: string): string | undefined {
  if (!key) return undefined;
  const [scope, field] = key.split(".");
  if (scope === "totals") {
    const v = (ctx.d.totals as any)[field];
    return typeof v === "number" ? formatAmount(v, ctx.t, ctx.cur) : undefined;
  }
  if (scope === "employee") {
    const v = ctx.d.employee[field];
    return DATE_FIELDS.has(field) ? formatDate(v, ctx.t) : v;
  }
  if (scope === "payment") return ctx.d.payment[field];
  if (scope === "meta") return field === "period" ? ctx.d.meta.periodLabel : (ctx.d.meta as any)[field];
  return undefined;
}

/** Adds the user's own text before/after a value. Presentation only. */
function decorate(f: PayslipFieldConfig | undefined, value: string): string {
  if (!f) return value;
  return [f.prefix, value, f.suffix].map((x) => (x || "").trim()).filter(Boolean).join(" ");
}

function decoratedHtml(f: PayslipFieldConfig | undefined, valueHtml: string): string {
  const pre = (f?.prefix || "").trim();
  const suf = (f?.suffix || "").trim();
  return `${pre ? escapeHtml(pre) + " " : ""}${valueHtml}${suf ? " " + escapeHtml(suf) : ""}`;
}

function renderTextBlock(b: PayslipTextBlock, t: PayslipTemplate): string {
  if (!b.visible || !b.text.trim()) return "";
  const style = [
    `text-align:${b.align}`,
    `font-size:${(t.page.fontSizePt * b.scale).toFixed(1)}pt`,
    `color:${b.color}`,
    b.bold ? "font-weight:bold" : "",
    b.italic ? "font-style:italic" : "",
  ].filter(Boolean).join(";");
  return `<div class="tblock${b.boxed ? " boxed" : ""}" style="${style}">${escapeHtml(b.text).replace(/\n/g, "<br/>")}</div>`;
}

function textBlocksFor(ctx: Ctx, anchor: PayslipSectionKey, position: "before" | "after"): string {
  return (ctx.t.textBlocks || [])
    .filter((b) => b.anchor === anchor && b.position === position)
    .map((b) => renderTextBlock(b, ctx.t))
    .join("");
}

function customItems(ctx: Ctx, placement: CustomFieldPlacement): Array<{ label: string; value: string }> {
  return ctx.t.customFields
    .filter((f) => f.visible && f.placement === placement)
    .map((f) => ({ label: f.label, value: (f.source === "mapped" ? resolveMapped(ctx, f.mappedKey) : f.value)?.trim() || "" }))
    .filter((i) => i.value);
}

function columns(ctx: Ctx): number {
  return ctx.t.page.orientation === "landscape" ? 4 : 3;
}

function renderHeader(ctx: Ctx, section: PayslipSectionConfig, opts: RenderHtmlOptions): string {
  const { t, d } = ctx;
  const lines: string[] = [];
  const orgName = visibleField(section, "organizationName");
  if (orgName !== null && d.org.name) lines.push(`<div class="org-name">${escapeHtml(d.org.name)}</div>`);
  if (visibleField(section, "organizationAddress") !== null && d.org.address) {
    lines.push(`<div class="org-sub">${escapeHtml(d.org.address)}</div>`);
  }
  const contact = [d.org.phone, d.org.email].filter(Boolean).join(" · ");
  if (visibleField(section, "organizationContact") !== null && contact) lines.push(`<div class="org-sub">${escapeHtml(contact)}</div>`);
  if (visibleField(section, "documentTitle") !== null && t.header.documentTitle.trim()) {
    const periodInline = visibleField(section, "period") !== null && d.meta.periodLabel ? ` (${d.meta.periodLabel})` : "";
    lines.push(`<div class="doc-title">${escapeHtml(t.header.documentTitle)}${escapeHtml(periodInline)}</div>`);
  } else if (visibleField(section, "period") !== null && d.meta.periodLabel) {
    lines.push(`<div class="doc-title">${escapeHtml(visibleField(section, "period"))}: ${escapeHtml(d.meta.periodLabel)}</div>`);
  }
  const metaBits: string[] = [];
  const psLabel = visibleField(section, "payslipNumber");
  if (psLabel !== null) metaBits.push(`${escapeHtml(psLabel)}: ${escapeHtml(decorate(getField(section, "payslipNumber"), d.meta.payslipNumber))}`);
  const issueLabel = visibleField(section, "issueDate");
  const issue = formatDate(d.meta.issueDate || d.meta.generatedAt, t);
  if (issueLabel !== null && issue) metaBits.push(`${escapeHtml(issueLabel)}: ${escapeHtml(decorate(getField(section, "issueDate"), issue))}`);
  if (metaBits.length) lines.push(`<div class="doc-meta">${metaBits.join(" &nbsp;|&nbsp; ")}</div>`);

  // Logo: always the organization profile logo; template controls presentation only.
  let logoHtml = "";
  if (t.logo.visible) {
    if (isSafeLogoSrc(d.org.logo)) {
      logoHtml = `<img class="logo" src="${escapeHtml(d.org.logo)}" alt="${escapeHtml(d.org.name)} logo" onerror="this.style.display='none'" />`;
    } else if (opts.showLogoPlaceholder && opts.mode !== "print") {
      logoHtml = `<div class="logo-placeholder">No logo in organization profile</div>`;
    }
  }

  const textBlock = `<div class="hdr-text">${lines.join("")}</div>`;
  let inner: string;
  if (!logoHtml) {
    inner = `<table class="hdr"><tr><td>${textBlock}</td></tr></table>`;
  } else if (t.logo.position === "center") {
    inner = `<div class="hdr-center-logo">${logoHtml}</div><table class="hdr"><tr><td>${textBlock}</td></tr></table>`;
  } else {
    // Balanced 3-column header keeps centered text truly centered.
    const logoCell = `<td class="hdr-logo-cell">${logoHtml}</td>`;
    const spacer = `<td class="hdr-logo-cell"></td>`;
    const centered = t.header.align === "center";
    inner =
      t.logo.position === "left"
        ? `<table class="hdr"><tr>${logoCell}<td>${textBlock}</td>${centered ? spacer : ""}</tr></table>`
        : `<table class="hdr"><tr>${centered ? spacer : ""}<td>${textBlock}</td>${logoCell}</tr></table>`;
  }
  return `<div class="section header-section">${inner}${t.header.showDivider ? '<div class="divider"></div>' : ""}</div>`;
}

function renderEmployee(ctx: Ctx, section: PayslipSectionConfig): string {
  const items: Array<{ label: string; value: string }> = [];
  for (const f of section.fields) {
    if (!f.visible) continue;
    let v = ctx.d.employee[f.key];
    if (!v) continue;
    if (DATE_FIELDS.has(f.key)) v = formatDate(v, ctx.t);
    if (AMOUNT_EMPLOYEE_FIELDS.has(f.key)) v = formatAmount(Number(v), ctx.t, ctx.cur);
    if (v) items.push({ label: f.label, value: decorate(f, v) });
  }
  items.push(...customItems(ctx, "employee"));
  if (items.length === 0) return "";
  return `<div class="section">${sectionTitle(section)}${infoGrid(items, columns(ctx))}</div>`;
}

interface DisplayLine extends PayslipLine {
  label: string;
  group?: string;
}

function displayLines(ctx: Ctx, lines: PayslipLine[]): DisplayLine[] {
  const ov = ctx.t.components.overrides;
  return lines
    .map((l, idx) => ({ l, idx, o: ov[componentKey(l)] || {} }))
    .filter(({ l, o }) => !o.hidden && (ctx.t.components.showZeroRows || Math.abs(l.amount) > 0.0001))
    .sort((a, b) => (a.o.order ?? a.idx + 1000) - (b.o.order ?? b.idx + 1000))
    .map(({ l, o }) => ({ ...l, label: [o.label || l.name, o.note].filter(Boolean).join(" "), group: o.group }));
}

function renderComponentTable(ctx: Ctx, section: PayslipSectionConfig, lines: PayslipLine[], total: number, negative: boolean): string {
  const rows = displayLines(ctx, lines);
  if (rows.length === 0) return "";
  const showCode = ctx.t.components.showCodes && visibleField(section, "colCode") !== null;
  const nameLabel = getField(section, "colName")?.label || "Wage Type";
  const amountLabel = getField(section, "colAmount")?.label || "Amount";
  const codeLabel = getField(section, "colCode")?.label || "Code";
  const w = ctx.t.components.columnWidths;
  const dual = ctx.t.components.layout === "dual";
  const perSide = showCode ? 3 : 2;
  const totalCols = dual ? perSide * 2 : perSide;
  const scale = dual ? 0.5 : 1;
  const wsum = (showCode ? w.code : 0) + w.name + w.amount;
  const pct = (n: number) => `${((n / wsum) * 100 * scale).toFixed(2)}%`;

  const headSide =
    (showCode ? `<th style="width:${pct(w.code)}">${escapeHtml(codeLabel)}</th>` : "") +
    `<th style="width:${pct(w.name)}">${escapeHtml(nameLabel)}</th>` +
    `<th class="num" style="width:${pct(w.amount)}">${escapeHtml(amountLabel)}</th>`;
  const cellSide = (l?: DisplayLine) =>
    l
      ? (showCode ? `<td class="code">${escapeHtml(l.code || "")}</td>` : "") +
        `<td>${escapeHtml(l.label)}</td><td class="num">${amt(ctx, l.amount, negative)}</td>`
      : (showCode ? "<td></td>" : "") + "<td></td><td></td>";

  // Group rows (groups are presentation-only sub-headings).
  const groups: Array<{ name?: string; lines: DisplayLine[] }> = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.name === r.group) last.lines.push(r);
    else groups.push({ name: r.group, lines: [r] });
  }

  const body: string[] = [];
  for (const g of groups) {
    if (g.name) body.push(`<tr class="grp"><td colspan="${totalCols}">${escapeHtml(g.name)}</td></tr>`);
    if (dual) {
      for (let i = 0; i < g.lines.length; i += 2) body.push(`<tr>${cellSide(g.lines[i])}${cellSide(g.lines[i + 1])}</tr>`);
    } else {
      for (const l of g.lines) body.push(`<tr>${cellSide(l)}</tr>`);
    }
  }
  const totalLabel = visibleField(section, "total");
  if (ctx.t.components.showSectionTotals && totalLabel !== null) {
    body.push(
      `<tr class="total"><td colspan="${totalCols - 1}">${escapeHtml(totalLabel)}</td><td class="num">${amt(ctx, total, negative)}</td></tr>`
    );
  }
  return `<div class="section">${sectionTitle(section)}<table class="grid"><thead><tr>${dual ? headSide + headSide : headSide}</tr></thead><tbody>${body.join("")}</tbody></table></div>`;
}

function renderLoans(ctx: Ctx, section: PayslipSectionConfig): string {
  const loans = ctx.d.loans;
  if (loans.length === 0) return "";
  const cols: Array<{ key: string; num?: boolean; get: (l: PayslipLoanLine) => string }> = [
    { key: "loanId", get: (l) => escapeHtml(l.loanId) },
    { key: "description", get: (l) => escapeHtml(l.description) },
    { key: "principal", num: true, get: (l) => (l.principal !== undefined ? amt(ctx, l.principal) : "") },
    { key: "installment", num: true, get: (l) => amt(ctx, l.installment, true) },
    { key: "balance", num: true, get: (l) => (l.balance !== undefined ? amt(ctx, l.balance) : "") },
    { key: "status", get: (l) => escapeHtml(l.status || "") },
  ];
  const order = section.fields.map((f) => f.key);
  const active = cols
    .filter((c) => visibleField(section, c.key) !== null)
    .filter((c) => c.key !== "status" || loans.some((l) => l.status))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const head = active.map((c) => `<th${c.num ? ' class="num"' : ""}>${escapeHtml(getField(section, c.key)!.label)}</th>`).join("");
  const rows = loans.map((l) => `<tr>${active.map((c) => `<td${c.num ? ' class="num"' : ""}>${c.get(l)}</td>`).join("")}</tr>`);
  const totalLabel = visibleField(section, "total");
  if (ctx.t.components.showSectionTotals && totalLabel !== null && active.length > 1) {
    rows.push(
      `<tr class="total"><td colspan="${active.length - 1}">${escapeHtml(totalLabel)}</td><td class="num">${amt(ctx, ctx.d.totals.totalLoanDeductions, true)}</td></tr>`
    );
  }
  return `<div class="section">${sectionTitle(section)}<table class="grid"><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function renderTax(ctx: Ctx, section: PayslipSectionConfig): string {
  const tax = ctx.d.tax;
  const items: Array<{ label: string; value: string }> = [];
  for (const f of tax ? section.fields : []) {
    if (!f.visible) continue;
    const v = (tax as any)[f.key];
    if (v === undefined || v === "") continue;
    items.push({ label: f.label, value: decorate(f, typeof v === "number" ? formatAmount(v, ctx.t, ctx.cur) : String(v)) });
  }
  items.push(...customItems(ctx, "tax"));
  if (items.length === 0) return "";
  return `<div class="section">${sectionTitle(section)}${infoGrid(items, columns(ctx) + 1)}</div>`;
}

function renderSummary(ctx: Ctx, section: PayslipSectionConfig): string {
  const T = ctx.d.totals as any;
  const NEG = new Set(["totalGeneralDeductions", "totalLoanDeductions", "totalTaxDeductions", "otherDeductions", "totalEmployeeDeductions"]);
  const OPTIONAL_ZERO = new Set(["totalLoanDeductions", "totalTaxDeductions", "otherDeductions", "employerContributions"]);
  const cells = section.fields
    .filter((f) => f.visible && typeof T[f.key] === "number")
    .filter((f) => !(OPTIONAL_ZERO.has(f.key) && T[f.key] === 0))
    .filter((f) => !(f.key === "totalEmployerCost" && T.employerContributions === 0))
    .map((f) => {
      const isNet = f.key === "netSalary";
      return `<td class="${isNet ? "net" : ""}"><span class="lbl">${escapeHtml(f.label)}:</span> ${decoratedHtml(f, `<strong>${amt(ctx, T[f.key], NEG.has(f.key))}</strong>`)}</td>`;
    });
  if (cells.length === 0) return "";
  const per = ctx.t.page.orientation === "landscape" ? 4 : 3;
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += per) rows.push(`<tr>${cells.slice(i, i + per).join("")}</tr>`);
  return `<div class="section">${sectionTitle(section)}<table class="summary">${rows.join("")}</table></div>`;
}

function renderSimpleGrid(
  ctx: Ctx,
  section: PayslipSectionConfig,
  source: Record<string, any> | undefined,
  placement: CustomFieldPlacement
): string {
  const items: Array<{ label: string; value: string }> = [];
  for (const f of source ? section.fields : []) {
    if (!f.visible) continue;
    const raw = source![f.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = DATE_FIELDS.has(f.key) ? formatDate(String(raw), ctx.t) : String(raw);
    if (value) items.push({ label: f.label, value: decorate(f, value) });
  }
  items.push(...customItems(ctx, placement));
  if (items.length === 0) return "";
  return `<div class="section">${sectionTitle(section)}${infoGrid(items, columns(ctx))}</div>`;
}

function renderCustom(ctx: Ctx, section: PayslipSectionConfig): string {
  const items = customItems(ctx, "custom");
  if (items.length === 0) return "";
  return `<div class="section">${sectionTitle(section)}${infoGrid(items, Math.max(1, columns(ctx) - 1))}</div>`;
}

function renderFooter(ctx: Ctx, section: PayslipSectionConfig): string {
  const { t, d } = ctx;
  const parts: string[] = [];
  const approvalBits: string[] = [];
  const ab = visibleField(section, "approvedBy");
  if (ab !== null && d.approval.approvedBy) approvalBits.push(`${escapeHtml(ab)}: ${decoratedHtml(getField(section, "approvedBy"), `<strong>${escapeHtml(d.approval.approvedBy)}</strong>`)}`);
  const aa = visibleField(section, "approvedAt");
  const approvedAt = formatDate(d.approval.approvedAt, t);
  if (aa !== null && approvedAt) approvalBits.push(`${escapeHtml(aa)}: ${escapeHtml(decorate(getField(section, "approvedAt"), approvedAt))}`);
  if (approvalBits.length) parts.push(`<div class="foot-line">${approvalBits.join(" &nbsp;|&nbsp; ")}</div>`);

  for (const cf of customItems(ctx, "footer")) {
    parts.push(`<div class="foot-line">${escapeHtml(cf.label)}: ${escapeHtml(cf.value)}</div>`);
  }

  if (t.footer.showSignatures && t.footer.signatureLabels.length > 0) {
    parts.push(
      `<table class="sigs"><tr>${t.footer.signatureLabels
        .map((l) => `<td><div class="sig-line"></div><div>${escapeHtml(l)}</div></td>`)
        .join("")}</tr></table>`
    );
  }
  if (visibleField(section, "notes") !== null && t.footer.notes.trim()) {
    parts.push(`<div class="foot-note">${escapeHtml(t.footer.notes).replace(/\n/g, "<br/>")}</div>`);
  }
  const meta: string[] = [];
  const gd = visibleField(section, "generatedDate");
  if (gd !== null) meta.push(`${escapeHtml(gd)}: ${escapeHtml(formatDate(d.meta.generatedAt, t) || "")}`);
  const vc = visibleField(section, "verificationCode");
  if (vc !== null) meta.push(`${escapeHtml(vc)}: ${escapeHtml(d.meta.verificationCode)}`);
  if (meta.length) parts.push(`<div class="foot-note">${meta.join(" &nbsp;|&nbsp; ")}</div>`);
  if (visibleField(section, "digitalNotice") !== null && t.footer.digitalNotice.trim()) {
    parts.push(`<div class="foot-note">${escapeHtml(t.footer.digitalNotice)}</div>`);
  }
  if (visibleField(section, "customText") !== null && t.footer.customText.trim()) {
    parts.push(`<div class="foot-note">${escapeHtml(t.footer.customText).replace(/\n/g, "<br/>")}</div>`);
  }
  if (parts.length === 0) return "";
  return `<div class="section footer-section">${parts.join("")}</div>`;
}

/** Section plus any free text blocks the user placed above/below it. */
function renderSection(ctx: Ctx, section: PayslipSectionConfig, opts: RenderHtmlOptions): string {
  const before = textBlocksFor(ctx, section.key, "before");
  const after = textBlocksFor(ctx, section.key, "after");
  return before + renderSectionBody(ctx, section, opts) + after;
}

function renderSectionBody(ctx: Ctx, section: PayslipSectionConfig, opts: RenderHtmlOptions): string {
  if (!section.visible) return "";
  const { d } = ctx;
  switch (section.key as PayslipSectionKey) {
    case "header": return renderHeader(ctx, section, opts);
    case "employee": return renderEmployee(ctx, section);
    case "earnings": return renderComponentTable(ctx, section, d.earnings, d.totals.grossSalary, false);
    case "deductions": return renderComponentTable(ctx, section, d.deductions, d.totals.totalGeneralDeductions, true);
    case "employer": return renderComponentTable(ctx, section, d.employer, d.totals.employerContributions, false);
    case "loans": return renderLoans(ctx, section);
    case "tax": return renderTax(ctx, section);
    case "summary": return renderSummary(ctx, section);
    case "attendance": return renderSimpleGrid(ctx, section, d.attendance, "attendance");
    case "payment": return renderSimpleGrid(ctx, section, d.payment, "payment");
    case "custom": return renderCustom(ctx, section);
    case "footer": return renderFooter(ctx, section);
    default: return "";
  }
}

export function pageDimensionsMm(t: PayslipTemplate): { widthMm: number; heightMm: number } {
  const [w, h] = t.page.size === "Letter" ? [215.9, 279.4] : [210, 297];
  return t.page.orientation === "landscape" ? { widthMm: h, heightMm: w } : { widthMm: w, heightMm: h };
}

function buildCss(t: PayslipTemplate, mode: "screen" | "print"): string {
  const font = FONT_FAMILIES.find((f) => f.key === t.page.fontFamily)?.css || FONT_FAMILIES[0].css;
  const { widthMm } = pageDimensionsMm(t);
  const accent = t.page.accentColor;
  const border =
    t.page.tableBorders === "grid"
      ? `.grid { border: 1px solid #000; } .grid th, .grid td { border: 1px solid #000; }`
      : t.page.tableBorders === "horizontal"
        ? `.grid th { border-bottom: 1.5px solid ${accent}; } .grid td { border-bottom: 1px solid #D4D4D8; }`
        : `.grid th { border-bottom: 1px solid #A1A1AA; }`;
  const align = t.header.align;
  const screen =
    mode === "screen"
      ? `html { background: #E5E7EB; } body { padding: 16px 8px; }
         .sheet { background: #FFF; width: ${widthMm}mm; max-width: 100%; margin: 0 auto 16px auto; padding: ${t.page.marginMm}mm;
                  box-shadow: 0 2px 12px rgba(0,0,0,0.15); box-sizing: border-box; }`
      : `.sheet { padding: 0; }`;
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: ${t.page.size} ${t.page.orientation}; margin: ${t.page.marginMm}mm; }
    html, body { background: #FFFFFF; }
    body { font-family: ${font}; font-size: ${t.page.fontSizePt}pt; line-height: 1.35; color: #000;
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    ${screen}
    @media print { html { background: #FFF; } body { padding: 0; } .sheet { box-shadow: none; width: auto; margin: 0; padding: 0; } }
    .sheet + .sheet { page-break-before: always; break-before: page; }
    .section { margin-top: ${t.page.sectionSpacingPx}px; page-break-inside: avoid; break-inside: avoid; }
    .header-section { margin-top: 0; }
    .hdr { width: 100%; border-collapse: collapse; }
    .hdr td { vertical-align: middle; }
    .hdr-logo-cell { width: 1%; white-space: nowrap; padding: 0 ${t.logo.spacingPx}px; }
    .hdr-text { text-align: ${align}; }
    .hdr-center-logo { text-align: center; margin-bottom: ${t.logo.spacingPx}px; }
    .logo { height: ${t.logo.heightPx}px; width: auto; max-width: 220px; object-fit: contain; display: inline-block; }
    .logo-placeholder { height: ${t.logo.heightPx}px; width: ${t.logo.heightPx * 1.6}px; border: 1px dashed #A1A1AA; color: #71717A;
                        font-size: 7pt; display: inline-flex; align-items: center; justify-content: center; text-align: center; padding: 4px; }
    .org-name { font-size: ${(t.page.fontSizePt * 1.35).toFixed(1)}pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3px; color: ${accent}; }
    .org-sub { font-weight: bold; margin-top: 1px; }
    .doc-title { font-size: ${(t.page.fontSizePt * 1.12).toFixed(1)}pt; font-weight: bold; margin-top: 3px; }
    .doc-meta { margin-top: 2px; font-size: ${(t.page.fontSizePt * 0.92).toFixed(1)}pt; }
    .divider { border-bottom: 2px solid ${accent}; margin-top: 8px; }
    .sec-title { font-weight: bold; margin-bottom: 3px; color: ${accent}; }
    .info-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .info-grid td { padding: 1.5px 6px 1.5px 0; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
    .info-grid .val { font-weight: bold; }
    .grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .grid th { text-align: left; font-weight: bold; padding: 3px 5px; }
    .grid td { padding: 2px 5px; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
    .grid .num { text-align: right; white-space: nowrap; }
    .grid .code { font-family: "Courier New", Courier, monospace; font-size: ${(t.page.fontSizePt * 0.9).toFixed(1)}pt; }
    .grid tr.grp td { font-weight: bold; font-style: italic; background: #F4F4F5; }
    .grid tr.total td { font-weight: bold; }
    .grid thead { display: table-header-group; }
    .grid tr { page-break-inside: avoid; break-inside: avoid; }
    ${border}
    .summary { width: 100%; border-collapse: collapse; border-top: 1px solid #000; border-bottom: 1px solid #000; }
    .summary td { padding: 4px 6px 4px 0; font-size: ${(t.page.fontSizePt * 1.05).toFixed(1)}pt; }
    .summary td.net strong { font-size: ${(t.page.fontSizePt * 1.2).toFixed(1)}pt; color: ${accent}; }
    .footer-section { margin-top: ${Math.max(10, t.page.sectionSpacingPx)}px; }
    .foot-line { margin-bottom: 2px; }
    .foot-note { font-size: ${(t.page.fontSizePt * 0.85).toFixed(1)}pt; color: #333; margin-top: 4px; }
    .sigs { width: 100%; margin-top: 28px; border-collapse: collapse; }
    .sigs td { text-align: center; padding: 0 12px; vertical-align: top; }
    .tblock { margin-top: ${t.page.sectionSpacingPx}px; line-height: 1.4; word-wrap: break-word; overflow-wrap: anywhere; page-break-inside: avoid; }
    .tblock.boxed { border: 1px solid #A1A1AA; padding: 6px 8px; border-radius: 3px; }
    .sig-line { border-top: 1px solid #000; margin: 0 10% 3px 10%; }
  `;
}

function renderSheet(t: PayslipTemplate, d: PayslipRenderData, opts: RenderHtmlOptions): string {
  const ctx: Ctx = { t, d, cur: d.org.currency || "PKR" };
  return `<div class="sheet">${t.sections.map((s) => renderSection(ctx, s, opts)).join("")}</div>`;
}

/**
 * Renders one or more payslips (bulk) into a single HTML document. Each payslip
 * starts on a new page.
 */
export function renderPayslipDocument(
  template: PayslipTemplate,
  slips: PayslipRenderData[],
  opts: RenderHtmlOptions = {}
): string {
  const mode = opts.mode || "screen";
  const first = slips[0];
  const title =
    opts.documentTitle ||
    (slips.length === 1 && first ? `Payslip - ${first.employee.employeeName || ""} (${first.meta.periodLabel})` : "Payslips");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title><style>${buildCss(template, mode)}</style></head>
<body>${slips.map((s) => renderSheet(template, s, { ...opts, mode })).join("")}</body></html>`;
}

/** Sample data used to preview a template before a real payroll record is chosen. Clearly marked as sample. */
export function buildSamplePayslipData(org: PayslipOrganizationProfile, now: Date = new Date()): PayslipRenderData {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return buildPayslipRenderData(
    {
      id: "sample",
      employeeName: "Sample Employee",
      employeeId: "EMP-0000",
      designation: "Designation",
      department: "Department",
      employmentCategory: "Permanent",
      payScale: "BPS-00",
      dateOfJoining: `${now.getFullYear() - 3}-01-01`,
      month,
      cnic: "00000-0000000-0",
      bankName: "Bank Name",
      bankAccountNumber: "0000000000000",
      paymentMethod: "Bank Transfer",
      paymentStatus: "pending",
      itemizedEarnings: [
        { code: "0001", name: "Basic Pay", calculatedAmount: 50000 },
        { code: "1000", name: "House Rent Allowance", calculatedAmount: 22500 },
        { code: "1300", name: "Medical Allowance", calculatedAmount: 5000 },
        { code: "1210", name: "Conveyance Allowance", calculatedAmount: 3000 },
      ],
      itemizedDeductions: [
        { code: "3014", name: "Provident Fund", calculatedAmount: 4000 },
        { code: "3515", name: "Benevolent Fund", calculatedAmount: 1000 },
      ],
      loanDeductions: [
        { loanId: "ADV-01", description: "Salary Advance", originalPrincipal: 30000, currentDeduction: 5000, outstandingBalance: 15000 },
      ],
      taxDetails: { taxableIncome: 80500, taxPeriod: month, taxDeductedThisMonth: 2500, taxRecoveredPreviously: 7500 },
      employerContributions: [{ code: "EOBI", name: "EOBI (Employer)", calculatedAmount: 1500 }],
      attendanceDetails: { workingDays: 22, daysPresent: 21, paidLeave: 1, unpaidLeave: 0, absences: 0, overtimeHours: 0 },
      approvedBy: "Approving Officer",
      verificationCode: "SAMPLE-PREVIEW",
    },
    org,
    { canViewSensitive: true, now }
  );
}

/** Convenience: renders a single payslip with the given template. */
export function renderPayslipHtml(template: PayslipTemplate, data: PayslipRenderData, opts: RenderHtmlOptions = {}): string {
  return renderPayslipDocument(template, [data], opts);
}

export { getSection, isSensitiveField };
