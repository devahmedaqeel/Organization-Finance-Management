import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { Transaction, Budget, PayrollEntry, Department } from "@/context/FinanceContext";
import { sharePdfFile, downloadFinancialReportPdf, downloadPdfBinaryDirectly, PdfExportResult } from "./pdfDownloadService";
import {
  EnterpriseReportData,
  buildEnterpriseReportData,
  ReportFilterOptions,
  ReportType,
  CategorySummaryItem,
  DepartmentSummaryItem,
  PayrollDepartmentSummaryItem,
  PayrollEmployeeReportItem,
  BudgetPerformanceReportItem,
  MonthlyFinancialSummaryItem,
} from "./reportDataService";

export interface TeamMemberReportItem {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  status?: string;
  organization?: string;
}

export interface ChartPointReportItem {
  label: string;
  income: number;
  expense: number;
  fullDate?: string;
}

export interface ReportOptions {
  organizationName: string;
  organizationAddress?: string;
  organizationEmail?: string;
  organizationPhone?: string;
  organizationLogo?: string;
  currency: string;
  fiscalYear?: string;
  periodLabel: string;
  reportMode?: "full" | "expense" | "income" | "payroll" | ReportType;
  userRole?: string;
  startDate?: string;
  endDate?: string;
  generatedBy: string;
  generatedByEmail?: string;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  budgetUtilization: number;
  transactions: Transaction[];
  departments: Department[];
  payroll: PayrollEntry[];
  budgets: Budget[];
  members?: TeamMemberReportItem[];
  chartPoints?: ChartPointReportItem[];
  customTitle?: string;
  notes?: string;
  selectedDepartment?: string;
  selectedCategory?: string;
  selectedTypeFilter?: "all" | "income" | "expense";
  selectedSections?: any;
  selectedCharts?: any;
  includeSummary?: boolean;
  includeCharts?: boolean;
  includeCategories?: boolean;
  includeDepartments?: boolean;
  includeDepartmentDeepDive?: boolean;
  includePayroll?: boolean;
  includeMembers?: boolean;
  includeTransactions?: boolean;
  includeReconciliation?: boolean;
}

function fmt(n: number): string {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number): string {
  const abs = Math.abs(n || 0);
  const prefix = n < 0 ? "-" : "";
  return `${prefix}${abs.toLocaleString()}`;
}

function escapeCsv(val: any): string {
  const str = String(val ?? "").replace(/"/g, '""');
  return `"${str}"`;
}

function escapePdfText(str: string): string {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, " ");
}

/**
 * Transforms ReportOptions into EnterpriseReportData if needed
 */
function normalizeToEnterpriseData(input: ReportOptions | EnterpriseReportData): EnterpriseReportData {
  if ((input as any).executiveSummary && (input as any).metadata) {
    return input as EnterpriseReportData;
  }

  const opts = input as ReportOptions;
  const reportType: ReportType =
    opts.reportMode === "expense"
      ? "expense_analysis"
      : opts.reportMode === "income"
      ? "revenue_analysis"
      : opts.reportMode === "payroll"
      ? "payroll_audit"
      : (opts.reportMode as ReportType) || "consolidated_statement";

  return buildEnterpriseReportData(
    opts.transactions || [],
    opts.budgets || [],
    opts.payroll || [],
    opts.departments || [],
    {
      scope: (opts.startDate && opts.endDate) ? "period" : "all",
      period: (opts.startDate && opts.endDate)
        ? {
            id: "custom",
            label: opts.periodLabel || "Selected Audit Scope",
            startDate: opts.startDate,
            endDate: opts.endDate,
            mode: "custom",
            granularity: "month",
          }
        : undefined,
      departmentFilter: opts.selectedDepartment,
      categoryFilter: opts.selectedCategory,
      typeFilter: opts.selectedTypeFilter,
      reportType,
      customTitle: opts.customTitle,
      notes: opts.notes,
      selectedSections: opts.selectedSections,
      selectedCharts: opts.selectedCharts,
    },
    {
      organizationName: opts.organizationName,
      organizationAddress: opts.organizationAddress,
      organizationEmail: opts.organizationEmail,
      organizationPhone: opts.organizationPhone,
      organizationLogo: opts.organizationLogo,
      currency: opts.currency,
      fiscalYear: opts.fiscalYear,
    },
    {
      name: opts.generatedBy,
      email: opts.generatedByEmail || "finance@ofm.org",
      role: opts.userRole || "Admin",
      organization: opts.organizationName,
    }
  );
}

/**
 * Builds high-resolution SVG Vector Trend Area Line Chart for PDF
 */
function buildTrendSvg(points: any[] = [], currency: string): string {
  if (!points || points.length === 0) return "";
  const w = 740;
  const h = 100;
  const padL = 48;
  const padR = 20;
  const padT = 12;
  const padB = 20;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.income || p.revenue || 0, p.expense || p.expenses || 0)),
    1000
  );

  const getX = (i: number) => padL + (i / Math.max(points.length - 1, 1)) * chartW;
  const getY = (val: number) => padT + chartH - (val / maxVal) * chartH;

  const incCoords = points.map((p, i) => ({ x: getX(i), y: getY(p.income || p.revenue || 0) }));
  const expCoords = points.map((p, i) => ({ x: getX(i), y: getY(p.expense || p.expenses || 0) }));

  const makePath = (coords: { x: number; y: number }[]) => {
    return coords.reduce((acc, c, i) => `${acc} ${i === 0 ? "M" : "L"} ${c.x.toFixed(1)},${c.y.toFixed(1)}`, "");
  };

  const makeArea = (coords: { x: number; y: number }[]) => {
    const p = makePath(coords);
    return `${p} L ${coords[coords.length - 1]?.x || 720},${padT + chartH} L ${coords[0]?.x || 48},${padT + chartH} Z`;
  };

  return `
    <svg width="100%" height="100" viewBox="0 0 740 100" style="background:#F8FAFC; border-radius:6px; border:1px solid #E2E8F0; margin-bottom:8px;">
      <defs>
        <linearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10B981" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#10B981" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F43F5E" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#F43F5E" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <!-- Gridlines -->
      <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="#E2E8F0" stroke-dasharray="3,3"/>
      <text x="${padL - 6}" y="${padT + 3}" fill="#64748B" font-size="8" text-anchor="end">${currency} ${fmtShort(maxVal)}</text>

      <line x1="${padL}" y1="${padT + chartH / 2}" x2="${w - padR}" y2="${padT + chartH / 2}" stroke="#E2E8F0" stroke-dasharray="3,3"/>
      <text x="${padL - 6}" y="${padT + chartH / 2 + 3}" fill="#64748B" font-size="8" text-anchor="end">${currency} ${fmtShort(maxVal / 2)}</text>

      <line x1="${padL}" y1="${padT + chartH}" x2="${w - padR}" y2="${padT + chartH}" stroke="#CBD5E1"/>
      <text x="${padL - 6}" y="${padT + chartH + 3}" fill="#64748B" font-size="8" text-anchor="end">0</text>

      <!-- Area Fills -->
      <path d="${makeArea(incCoords)}" fill="url(#incFill)"/>
      <path d="${makeArea(expCoords)}" fill="url(#expFill)"/>

      <!-- Lines -->
      <path d="${makePath(incCoords)}" fill="none" stroke="#10B981" stroke-width="1.8"/>
      <path d="${makePath(expCoords)}" fill="none" stroke="#F43F5E" stroke-width="1.8"/>

      <!-- Points & X Labels -->
      ${points.map((p, i) => {
        const incVal = p.income || p.revenue || 0;
        const expVal = p.expense || p.expenses || 0;
        const lbl = p.label || p.monthLabel || "";
        const isLast = i === points.length - 1;
        const isFirst = i === 0;
        const anchor = isLast ? "end" : isFirst ? "start" : "middle";
        const xOffset = isLast ? -2 : isFirst ? 2 : 0;
        return `
          ${(incVal > 0 || points.length <= 6) ? `<circle cx="${getX(i)}" cy="${getY(incVal)}" r="${incVal > 0 ? 3 : 1.5}" fill="#10B981" stroke="#FFFFFF" stroke-width="1"/>` : ""}
          ${(expVal > 0 || points.length <= 6) ? `<circle cx="${getX(i)}" cy="${getY(expVal)}" r="${expVal > 0 ? 3 : 1.5}" fill="#F43F5E" stroke="#FFFFFF" stroke-width="1"/>` : ""}
          ${incVal > 0 ? `<text x="${getX(i) + xOffset}" y="${Math.max(getY(incVal) - 4, 10)}" fill="#10B981" font-size="7.5" font-weight="700" text-anchor="${anchor}">+${fmtShort(incVal)}</text>` : ""}
          ${expVal > 0 ? `<text x="${getX(i) + xOffset}" y="${Math.min(getY(expVal) + 9, 86)}" fill="#F43F5E" font-size="7.5" font-weight="700" text-anchor="${anchor}">-${fmtShort(expVal)}</text>` : ""}
          <text x="${getX(i)}" y="96" fill="#475569" font-size="8" text-anchor="middle" font-weight="600">${lbl}</text>
        `;
      }).join("")}
    </svg>
  `;
}

/**
 * Builds SVG Category Donut Chart for PDF
 */
function buildCategoryDonutSvg(
  categories: CategorySummaryItem[],
  total: number,
  currency: string
): string {
  if (!categories || categories.length === 0 || total <= 0) return "";
  const size = 90;
  const cx = size / 2;
  const cy = size / 2;
  const r = 34;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = categories.map((c) => {
    const strokeDash = (c.amount / Math.max(total, 1)) * circumference;
    const strokeDashoffset = -offset;
    offset += strokeDash;
    return `
      <circle
        cx="${cx}"
        cy="${cy}"
        r="${r}"
        fill="transparent"
        stroke="${c.color || "#3B82F6"}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${strokeDash.toFixed(1)} ${circumference.toFixed(1)}"
        stroke-dashoffset="${strokeDashoffset.toFixed(1)}"
      />
    `;
  }).join("");

  return `
    <div style="display:flex; align-items:center; gap:14px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:8px 12px; margin-bottom:8px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg); flex-shrink:0;">
        ${slices}
        <g style="transform: rotate(90deg); transform-origin: center;">
          <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="9.5" font-weight="bold" fill="#0F172A">${currency} ${fmtShort(total)}</text>
          <text x="${cx}" y="${cy + 9}" text-anchor="middle" font-size="7.5" fill="#64748B">Volume</text>
        </g>
      </svg>
      <div style="flex:1; display:grid; grid-template-columns:1fr 1fr; gap:4px 8px;">
        ${categories.slice(0, 8).map((c) => `
          <div style="display:flex; align-items:center; gap:5px; font-size:8.5px;">
            <span style="display:inline-block; width:6px; height:6px; border-radius:2px; background:${c.color || "#3B82F6"}; flex-shrink:0;"></span>
            <span style="font-weight:600; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.category}</span>
            <span style="color:#64748B; margin-left:auto; white-space:nowrap;">${c.pct}% (${currency} ${fmtShort(c.amount)})</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/**
 * Builds SVG Department Budget Allocation vs Actual Spend Horizontal Bar Chart for PDF
 */
function buildDepartmentBudgetSvg(
  departments: DepartmentSummaryItem[],
  currency: string
): string {
  if (!departments || departments.length === 0) return "";
  const maxBudget = Math.max(...departments.map((d) => Math.max(d.allocatedBudget || 0, d.actualSpent || 0)), 1000);

  return `
    <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:8px 12px; margin-bottom:8px;">
      <div style="font-size:9.5px; font-weight:700; color:#1E293B; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
        <span>Department Budget Capacity vs Actual Spend Visualizer</span>
        <div style="display:flex; gap:10px; font-size:8.5px; font-weight:600;">
          <span style="color:#3B82F6;">■ Budget Ceiling</span>
          <span style="color:#F43F5E;">■ Actual Spend</span>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:5px;">
        ${departments.map((d) => {
          const budget = d.allocatedBudget || 0;
          const spent = d.actualSpent || 0;
          const budgetPct = Math.min((budget / maxBudget) * 100, 100);
          const spentPct = Math.min((spent / maxBudget) * 100, 100);
          const utilPct = d.utilizationPct || (budget > 0 ? Math.round((spent / budget) * 100) : 0);
          const barColor = d.statusColor || (utilPct > 90 ? "#F43F5E" : utilPct > 70 ? "#F59E0B" : "#10B981");

          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:8.5px; font-weight:600; color:#1E293B; margin-bottom:2px;">
                <span><strong>${d.name}</strong> <span style="color:#64748B; font-weight:normal;">(${d.headcount || 0} Staff)</span></span>
                <span>${currency} ${fmtShort(spent)} / ${currency} ${fmtShort(budget)} <strong style="color:${barColor};">(${utilPct}%)</strong></span>
              </div>
              <div style="height:8px; background:#E2E8F0; border-radius:4px; overflow:hidden; position:relative;">
                <div style="height:100%; width:${budgetPct}%; background:#93C5FD; border-radius:4px; position:absolute; left:0; top:0;"></div>
                <div style="height:100%; width:${spentPct}%; background:${barColor}; border-radius:4px; position:absolute; left:0; top:0; opacity:0.9;"></div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

/**
 * Builds SVG Executive Rings Visual Suite for PDF (Budget Ring, Margin Ring, Retention Ring)
 * Matches the in-app Executive Radial Progress Rings with 100% data fidelity.
 */
function buildExecutiveRingsSuiteSvg(
  budgetUtilPct: number,
  totalAllocated: number,
  totalSpent: number,
  netMarginPct: number,
  isDeficit: boolean,
  totalRevenue: number,
  totalExpenses: number,
  retainedSurplusPct: number,
  currency: string,
  financialHealth?: { score: number; label: string; color: string; explanation?: string }
): string {
  const r = 26;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * r;

  function renderRingSvg(pct: number, color: string, centerText: string, centerSub: string): string {
    const clampedPct = Math.min(Math.max(pct || 0, 0), 100);
    const isFull = clampedPct >= 99.7;
    const isEmpty = clampedPct <= 0.2;
    const useRound = clampedPct >= 3.0 && !isFull;
    const capLength = useRound ? strokeWidth : 0;
    const dashLength = isFull
      ? circumference
      : Math.max((clampedPct / 100) * circumference - capLength, 0.1);
    const dashOffset = isFull ? 0 : circumference - dashLength;
    const capAngularOffset = useRound ? ((strokeWidth / 2) / circumference) * 360 : 0;
    const rotation = -90 + capAngularOffset;

    return `
      <svg width="70" height="70" viewBox="0 0 70 70" style="margin-bottom:3px;">
        <circle cx="35" cy="35" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="${strokeWidth}" opacity="0.65"/>
        ${!isEmpty ? `
          <circle cx="35" cy="35" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
            stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${dashOffset.toFixed(1)}"
            stroke-linecap="${useRound ? "round" : "butt"}" transform="rotate(${rotation.toFixed(1)} 35 35)"/>
        ` : ""}
        <text x="35" y="34" text-anchor="middle" font-size="9.5" font-weight="800" fill="${color}">${centerText}</text>
        <text x="35" y="44" text-anchor="middle" font-size="6.5" font-weight="700" fill="#64748B">${centerSub}</text>
      </svg>
    `;
  }

  // 1. Health Score Ring
  const healthScore = financialHealth?.score || 86;
  const healthColor = financialHealth?.color || "#10B981";
  const healthLabel = financialHealth?.label || "OPTIMAL";

  // 2. Operating Surplus Ring
  const marginColor = isDeficit ? "#F43F5E" : "#10B981";
  const marginLabel = `${netMarginPct >= 0 ? "+" : ""}${netMarginPct.toFixed(1)}%`;
  const marginStatus = isDeficit ? "Operating Deficit" : "Healthy Surplus";

  // 3. Budget Utilized Ring
  const budgetColor = budgetUtilPct > 100 ? "#F43F5E" : budgetUtilPct > 80 ? "#F59E0B" : "#3B82F6";
  const budgetStatus = budgetUtilPct > 100 ? "Cap Overrun" : budgetUtilPct > 80 ? "Near Limit" : "On Track";

  // 4. Outflow Burn Rate Ring
  const burnPct = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : (totalExpenses > 0 ? 100 : 0);
  const burnColor = burnPct > 80 ? "#F43F5E" : burnPct > 50 ? "#F59E0B" : "#8B5CF6";
  const burnStatus = burnPct <= 30 ? "Low Burn (Safe)" : burnPct <= 60 ? "Optimal Burn" : "High Outflow";

  return `
    <div class="avoid-break" style="margin-bottom: 10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-weight:800; font-size:10.5px; color:#0F172A; text-transform:uppercase; letter-spacing:0.4px;">Executive Analytics & Radial Indicator Gauges</span>
        <span style="font-size:8.5px; font-weight:600; color:#64748B;">App Synchronized Metric Rings (4 Indicators)</span>
      </div>
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
        <!-- Ring 1: Financial Health Score -->
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:7px 5px; display:flex; flex-direction:column; align-items:center; text-align:center;">
          <div style="font-size:7.5px; font-weight:700; color:#64748B; text-transform:uppercase; margin-bottom:3px;">Financial Health</div>
          ${renderRingSvg(healthScore, healthColor, `${healthScore}%`, "SCORE")}
          <div style="font-size:8.5px; font-weight:800; color:${healthColor}; margin-bottom:1px;">${healthLabel}</div>
          <div style="font-size:7.5px; color:#475569;">Evaluation Score</div>
          <div style="font-size:7px; color:#64748B;">Rating: ${healthScore}/100</div>
        </div>

        <!-- Ring 2: Operating Surplus / Margin -->
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:7px 5px; display:flex; flex-direction:column; align-items:center; text-align:center;">
          <div style="font-size:7.5px; font-weight:700; color:#64748B; text-transform:uppercase; margin-bottom:3px;">Operating Surplus</div>
          ${renderRingSvg(Math.abs(netMarginPct || 0), marginColor, marginLabel, isDeficit ? "DEFICIT" : "SURPLUS")}
          <div style="font-size:8.5px; font-weight:800; color:${marginColor}; margin-bottom:1px;">${marginStatus}</div>
          <div style="font-size:7.5px; color:#475569;">Inflows: +${currency} ${fmtShort(totalRevenue)}</div>
          <div style="font-size:7px; color:#64748B;">Net: ${netMarginPct >= 0 ? "+" : "-"}${currency} ${fmtShort(Math.abs(totalRevenue - totalExpenses))}</div>
        </div>

        <!-- Ring 3: Budget Utilized -->
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:7px 5px; display:flex; flex-direction:column; align-items:center; text-align:center;">
          <div style="font-size:7.5px; font-weight:700; color:#64748B; text-transform:uppercase; margin-bottom:3px;">Budget Utilized</div>
          ${renderRingSvg(budgetUtilPct, budgetColor, `${budgetUtilPct.toFixed(0)}%`, "UTILIZED")}
          <div style="font-size:8.5px; font-weight:800; color:${budgetColor}; margin-bottom:1px;">${budgetStatus}</div>
          <div style="font-size:7.5px; color:#475569;">Spent: ${currency} ${fmtShort(totalSpent)}</div>
          <div style="font-size:7px; color:#64748B;">Cap: ${currency} ${fmtShort(totalAllocated)}</div>
        </div>

        <!-- Ring 4: Outflow Burn Rate -->
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:7px 5px; display:flex; flex-direction:column; align-items:center; text-align:center;">
          <div style="font-size:7.5px; font-weight:700; color:#64748B; text-transform:uppercase; margin-bottom:3px;">Outflow Burn Rate</div>
          ${renderRingSvg(burnPct, burnColor, `${burnPct.toFixed(0)}%`, "BURN RATE")}
          <div style="font-size:8.5px; font-weight:800; color:${burnColor}; margin-bottom:1px;">${burnStatus}</div>
          <div style="font-size:7.5px; color:#475569;">Outflows: -${currency} ${fmtShort(totalExpenses)}</div>
          <div style="font-size:7px; color:#64748B;">Net: ${totalRevenue >= totalExpenses ? "+" : "-"}${currency} ${fmtShort(Math.abs(totalRevenue - totalExpenses))}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Builds HTML Payslip for individual employee
 */
export function buildPayslipHtml(
  payslip: PayrollEntry,
  orgInfo?: {
    name?: string;
    address?: string;
    email?: string;
    phone?: string;
    currency?: string;
    fiscalYear?: string;
  }
): string {
  const orgName = orgInfo?.name || "Organization Finance Management";
  const orgAddress = orgInfo?.address || "Enterprise Financial Center";
  const orgEmail = orgInfo?.email || "finance@ofm-cloud.com";
  const orgPhone = orgInfo?.phone || "+92-586-444111";
  const currency = orgInfo?.currency || "PKR";
  const fiscalYear = orgInfo?.fiscalYear || "2025-2026";

  const base = Number(payslip.baseSalary || 0);
  const bon = Number(payslip.bonus || 0);
  const ded = Number(payslip.deductions || 0);
  const net = payslip.netSalary !== undefined ? Number(payslip.netSalary) : base + bon - ded;

  const now = new Date();
  const printDate = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const printTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const slipId = "SLIP-" + (payslip.id || payslip.employeeId || "0000").slice(-6).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();

  const metaParts: string[] = [];
  if (orgAddress && !orgAddress.includes("Enterprise Financial Center")) {
    metaParts.push(orgAddress);
  } else if (orgAddress) {
    metaParts.push(orgAddress);
  }

  if (orgEmail && !orgEmail.includes("ofm-cloud.com")) {
    metaParts.push(orgEmail);
  }
  if (orgPhone && !orgPhone.includes("555-0199")) {
    metaParts.push(orgPhone);
  }

  const orgSubText = metaParts.length > 0 ? metaParts.join(" · ") : "Authorized Institutional Payroll & Compensation";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Official Salary Slip — ${payslip.employeeName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; background: #FFFFFF; font-size: 11px; font-variant-numeric: tabular-nums; line-height: 1.4; }
    @media print { body { background: #FFFFFF; } .no-print { display: none !important; } .card { box-shadow: none !important; border: 1px solid #E2E8F0 !important; } }
    @media screen { body { max-width: 820px; margin: 0 auto; padding: 24px 16px; background: #F1F5F9; } .card { background: #FFF; padding: 26px; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.07); } }
    .header { background: linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%); color: #FFF; padding: 18px 22px; border-radius: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
    .org-title { font-size: 18px; font-weight: 900; letter-spacing: -0.3px; }
    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 14px 16px; border-radius: 8px; margin-bottom: 18px; }
    .info-lbl { font-size: 9px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-val { font-size: 12.5px; font-weight: 700; color: #0F172A; margin-top: 3px; }
    .table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 18px; }
    .slip-table { width: 100%; min-width: 520px; border-collapse: collapse; table-layout: fixed; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; }
    .slip-table th { background: #F1F5F9; font-size: 10px; font-weight: 800; color: #475569; padding: 10px 12px; text-transform: uppercase; letter-spacing: 0.4px; }
    .slip-table td { padding: 10px 12px; border-top: 1px solid #F1F5F9; font-size: 11.5px; }
    .col-divider-head { border-right: 1px solid #CBD5E1; }
    .col-divider-body { border-right: 1px solid #E2E8F0; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .net-card { background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%); color: #FFF; padding: 18px 22px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .sign-row { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 8px; }
    .sign-box { width: 200px; text-align: center; border-top: 1px solid #94A3B8; padding-top: 8px; font-size: 10.5px; color: #475569; }

    @media screen and (max-width: 640px) {
      body { padding: 10px 6px; }
      .card { padding: 14px; }
      .header { flex-direction: column; align-items: flex-start; gap: 10px; }
      .info-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
      .net-card { flex-direction: column; align-items: flex-start; gap: 10px; }
      .sign-row { flex-direction: column; gap: 24px; align-items: center; }
      .sign-box { width: 100%; max-width: 240px; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="position:fixed; top:12px; right:16px; z-index:9999;">
    <button onclick="window.print()" style="background:#4F46E5; color:#FFF; font-weight:700; border:none; padding:9px 18px; border-radius:7px; cursor:pointer; box-shadow:0 2px 8px rgba(79,70,229,0.3);">🖨️ Print / Save as PDF</button>
  </div>
  <div class="card">
    <div class="header">
      <div>
        <div class="org-title">${orgName}</div>
        <div style="font-size: 10.5px; color: #C7D2FE; margin-top: 3px;">${orgSubText}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 12px; font-weight: 800; color: #67E8F9; letter-spacing: 0.5px;">OFFICIAL SALARY SLIP</div>
        <div style="font-size: 10px; color: #E0E7FF; margin-top: 2px;">Period: <strong>${payslip.month || "Current Month"}</strong></div>
        <div style="display:inline-block; background:#10B981; color:#FFF; font-weight:800; font-size:9px; padding:2px 7px; border-radius:4px; margin-top:4px;">✓ DISBURSED</div>
      </div>
    </div>

    <div class="info-grid">
      <div><div class="info-lbl">Employee Full Name</div><div class="info-val">${payslip.employeeName}</div></div>
      <div><div class="info-lbl">Employee ID</div><div class="info-val">${payslip.employeeId || "EMP-001"}</div></div>
      <div><div class="info-lbl">Department</div><div class="info-val">${payslip.department || "General Administration"}</div></div>
      <div><div class="info-lbl">Designation</div><div class="info-val">${payslip.designation || "Staff Specialist"}</div></div>
    </div>

    <div class="table-wrap">
      <table class="slip-table">
        <colgroup>
          <col style="width: 32%;">
          <col style="width: 18%;">
          <col style="width: 32%;">
          <col style="width: 18%;">
        </colgroup>
        <thead>
          <tr>
            <th class="text-left">Earnings & Allowances</th>
            <th class="text-right col-divider-head">Amount (${currency})</th>
            <th class="text-left" style="padding-left: 14px;">Deductions & Withholdings</th>
            <th class="text-right">Amount (${currency})</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="text-left">Basic Salary</td>
            <td class="text-right col-divider-body" style="font-weight:700;">+${currency} ${fmt(base)}</td>
            <td class="text-left" style="padding-left: 14px;">Income Tax Withholding</td>
            <td class="text-right" style="color:#DC2626; font-weight:700;">-${currency} ${fmt(ded * 0.6)}</td>
          </tr>
          <tr>
            <td class="text-left">Bonuses & Performance Allowances</td>
            <td class="text-right col-divider-body" style="color:#059669; font-weight:700;">+${currency} ${fmt(bon)}</td>
            <td class="text-left" style="padding-left: 14px;">Provident Fund & Insurance</td>
            <td class="text-right" style="color:#DC2626; font-weight:700;">-${currency} ${fmt(ded * 0.4)}</td>
          </tr>
          <tr style="background:#F8FAFC; font-weight:800; border-top: 1px solid #CBD5E1;">
            <td class="text-left" style="color:#0F172A;">Total Gross Earnings</td>
            <td class="text-right col-divider-body" style="color:#059669; font-size:12px;">+${currency} ${fmt(base + bon)}</td>
            <td class="text-left" style="padding-left: 14px; color:#0F172A;">Total Deductions</td>
            <td class="text-right" style="color:#DC2626; font-size:12px;">-${currency} ${fmt(ded)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="net-card">
      <div>
        <div style="font-size:11px; font-weight:800; letter-spacing:0.6px; text-transform:uppercase;">NET SALARY PAYABLE & DISBURSED</div>
        <div style="font-size:9.5px; opacity:0.9; margin-top:3px;">Direct institutional bank deposit verified · Ref: ${slipId}</div>
      </div>
      <div style="font-size:24px; font-weight:900; letter-spacing:-0.5px;">${currency} ${fmt(net)}</div>
    </div>

    <div class="sign-row">
      <div class="sign-box"><strong>${payslip.employeeName}</strong><br>Employee Acknowledgment</div>
      <div class="sign-box"><strong>Chief Financial Officer</strong><br>Authorized Signatory (${orgName})</div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Builds the comprehensive Enterprise Financial Report HTML document
 */
export function generateFinancialHtmlReport(input: ReportOptions | EnterpriseReportData): string {
  const data = normalizeToEnterpriseData(input);
  const { metadata, filters, executiveSummary, financialHealth, revenueAnalysis, expenseAnalysis, payrollSection, budgetPerformance, departmentFinancials, monthlyTrends, generalLedger, selectedSections, selectedCharts } = data;
  const currency = metadata.currency;

  const sec = selectedSections || {};
  const ch = selectedCharts || {};

  const type = data.reportType || "consolidated_statement";
  const isConsolidated = type === "consolidated_statement";
  const isExecutive = (isConsolidated || type === "executive_summary") && (sec.executiveSummary !== false);
  const isPayroll = (isConsolidated || type === "payroll_audit") && (sec.payrollAudit !== false);
  const isRevenue = (isConsolidated || type === "revenue_analysis") && (sec.revenueAnalysis !== false);
  const isExpense = (isConsolidated || type === "expense_analysis") && (sec.expenseAnalysis !== false);
  const isDepartment = (isConsolidated || type === "department_analysis") && (sec.departmentBreakdown !== false);
  const isBudget = (isConsolidated || type === "budget_performance") && (sec.budgetPerformance !== false);
  const isLedger = (isConsolidated || type === "general_ledger") && (sec.generalLedger !== false);

  let kpisHtml = "";
  if (sec.kpis !== false) {
    if (type === "payroll_audit") {
    kpisHtml = `
      <div class="kpi-card">
        <div class="kpi-label">Gross Payroll Budget</div>
        <div class="kpi-val" style="color: #6366F1;">${currency} ${fmt(payrollSection.grossPayroll)}</div>
        <div class="kpi-sub">${payrollSection.employeeCount} Total Employees</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Deductions & Taxes</div>
        <div class="kpi-val" style="color: #F43F5E;">-${currency} ${fmt(payrollSection.totalDeductions)}</div>
        <div class="kpi-sub">Statutory Withholdings</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Disbursed Remuneration</div>
        <div class="kpi-val" style="color: #10B981;">${currency} ${fmt(payrollSection.netPayroll)}</div>
        <div class="kpi-sub">Direct Bank Deposit Verified</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Cost Centers Impacted</div>
        <div class="kpi-val" style="color: #3B82F6;">${payrollSection.byDepartment.length} Depts</div>
        <div class="kpi-sub">${payrollSection.payrollCostPctOfExpenses.toFixed(1)}% of Total Outflows</div>
      </div>
    `;
  } else if (type === "revenue_analysis") {
    kpisHtml = `
      <div class="kpi-card">
        <div class="kpi-label">Total Realized Revenue</div>
        <div class="kpi-val" style="color: #10B981;">+${currency} ${fmt(revenueAnalysis.totalRevenue)}</div>
        <div class="kpi-sub">${revenueAnalysis.transactions.length} Inflow Receipts</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Active Funding Streams</div>
        <div class="kpi-val" style="color: #3B82F6;">${revenueAnalysis.byCategory.length} Streams</div>
        <div class="kpi-sub">Institutional & Operational Grants</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Top Revenue Stream</div>
        <div class="kpi-val" style="color: #0F172A; font-size:12px; line-height:1.3;">${revenueAnalysis.byCategory[0]?.category || "General Inflows"}</div>
        <div class="kpi-sub">${revenueAnalysis.byCategory[0]?.pct || 100}% of Total Inflows</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Operating Surplus</div>
        <div class="kpi-val" style="color: ${executiveSummary.isNetPositive ? "#10B981" : "#F43F5E"};">
          ${executiveSummary.isNetPositive ? "+" : "-"}${currency} ${fmt(Math.abs(executiveSummary.netOperatingBalance))}
        </div>
        <div class="kpi-sub">${executiveSummary.netProfitMarginPct.toFixed(1)}% Operating Margin</div>
      </div>
    `;
  } else if (type === "expense_analysis") {
    kpisHtml = `
      <div class="kpi-card">
        <div class="kpi-label">Total Operational Expenditures</div>
        <div class="kpi-val" style="color: #F43F5E;">-${currency} ${fmt(expenseAnalysis.totalExpenses)}</div>
        <div class="kpi-sub">${expenseAnalysis.transactions.length} Outflow Vouchers</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Cost Categories Monitored</div>
        <div class="kpi-val" style="color: #3B82F6;">${expenseAnalysis.byCategory.length} Divisions</div>
        <div class="kpi-sub">Overhead & Operational Spending</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Top Expense Category</div>
        <div class="kpi-val" style="color: #0F172A; font-size:12px; line-height:1.3;">${expenseAnalysis.byCategory[0]?.category || "General Outflows"}</div>
        <div class="kpi-sub">${expenseAnalysis.byCategory[0]?.pct || 100}% of Outflows</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Operating Expense Ratio</div>
        <div class="kpi-val" style="color: #F59E0B;">${financialHealth.expenseRatioPct.toFixed(1)}%</div>
        <div class="kpi-sub">Expense to Revenue Ratio</div>
      </div>
    `;
  } else if (type === "department_analysis" || type === "budget_performance") {
    kpisHtml = `
      <div class="kpi-card">
        <div class="kpi-label">Total Allocated Budget</div>
        <div class="kpi-val" style="color: #3B82F6;">${currency} ${fmt(budgetPerformance.totalAllocated)}</div>
        <div class="kpi-sub">${departmentFinancials.departments.length} Cost Centers Monitored</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Actual Spend Disbursed</div>
        <div class="kpi-val" style="color: #F43F5E;">-${currency} ${fmt(budgetPerformance.totalSpent)}</div>
        <div class="kpi-sub">Realized Outflows & Payroll</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Remaining Budget Capacity</div>
        <div class="kpi-val" style="color: ${budgetPerformance.totalRemaining >= 0 ? "#10B981" : "#F43F5E"};">
          ${currency} ${fmt(budgetPerformance.totalRemaining)}
        </div>
        <div class="kpi-sub">${budgetPerformance.totalRemaining >= 0 ? "Under Spending Limit" : "Over Budget"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Budget Utilization</div>
        <div class="kpi-val" style="color: ${budgetPerformance.overallUtilizationPct > 100 ? "#F43F5E" : budgetPerformance.overallUtilizationPct > 80 ? "#F59E0B" : "#10B981"};">
          ${budgetPerformance.overallUtilizationPct.toFixed(1)}%
        </div>
        <div class="kpi-sub">Of Total Ceiling</div>
      </div>
    `;
  } else if (type === "general_ledger") {
    kpisHtml = `
      <div class="kpi-card">
        <div class="kpi-label">Total Audited Volume</div>
        <div class="kpi-val" style="color: #3B82F6;">${currency} ${fmt(generalLedger.totalVolume)}</div>
        <div class="kpi-sub">${generalLedger.transactions.length} Total Line Items</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Realized Inflows</div>
        <div class="kpi-val" style="color: #10B981;">+${currency} ${fmt(executiveSummary.totalRevenue)}</div>
        <div class="kpi-sub">${revenueAnalysis.transactions.length} Inflow Receipts</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Realized Outflows</div>
        <div class="kpi-val" style="color: #F43F5E;">-${currency} ${fmt(executiveSummary.totalExpenses)}</div>
        <div class="kpi-sub">${expenseAnalysis.transactions.length} Expense Vouchers</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Ledger Balance</div>
        <div class="kpi-val" style="color: ${executiveSummary.isNetPositive ? "#10B981" : "#F43F5E"};">
          ${executiveSummary.isNetPositive ? "+" : "-"}${currency} ${fmt(Math.abs(executiveSummary.netOperatingBalance))}
        </div>
        <div class="kpi-sub">${executiveSummary.isNetPositive ? "Retained Surplus" : "Operating Deficit"}</div>
      </div>
    `;
    } else {
      const hasBudget = (executiveSummary.budgetTotal || 0) > 0;
      const unallocatedFunds = executiveSummary.unallocatedFunds !== undefined
        ? executiveSummary.unallocatedFunds
        : Math.max(0, executiveSummary.netOperatingBalance - (executiveSummary.budgetTotal || 0));
      const netCash = executiveSummary.netOperatingBalance;
      const isNetPositive = executiveSummary.isNetPositive;

      if (hasBudget) {
        kpisHtml = `
      <div class="kpi-card">
        <div class="kpi-label">Total Income</div>
        <div class="kpi-val" style="color: #10B981;">+${currency} ${fmt(executiveSummary.totalRevenue)}</div>
        <div class="kpi-sub">${revenueAnalysis.transactions.length} Inflow Receipts</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Expenses</div>
        <div class="kpi-val" style="color: #F43F5E;">-${currency} ${fmt(executiveSummary.totalExpenses)}</div>
        <div class="kpi-sub">${executiveSummary.budgetUtilizationPct.toFixed(1)}% of Budget Used</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Department Budget</div>
        <div class="kpi-val" style="color: #3B82F6;">${currency} ${fmt(executiveSummary.budgetTotal)}</div>
        <div class="kpi-sub">${currency} ${fmtShort(unallocatedFunds)} Unallocated Funds</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Cash Position</div>
        <div class="kpi-val" style="color: ${isNetPositive ? "#10B981" : "#F43F5E"};">
          ${isNetPositive ? "+" : "-"}${currency} ${fmt(Math.abs(netCash))}
        </div>
        <div class="kpi-sub">${currency} ${fmt(executiveSummary.budgetRemaining)} Remaining Budget</div>
      </div>
    `;
      } else {
        kpisHtml = `
      <div class="kpi-card">
        <div class="kpi-label">Total Realized Inflows</div>
        <div class="kpi-val" style="color: #10B981;">+${currency} ${fmt(executiveSummary.totalRevenue)}</div>
        <div class="kpi-sub">${revenueAnalysis.transactions.length} Inflow Receipts</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Realized Expenses</div>
        <div class="kpi-val" style="color: #F43F5E;">-${currency} ${fmt(executiveSummary.totalExpenses)}</div>
        <div class="kpi-sub">${expenseAnalysis.transactions.length} Outflow Vouchers</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Operating Balance</div>
        <div class="kpi-val" style="color: ${executiveSummary.isNetPositive ? "#10B981" : "#F43F5E"};">
          ${executiveSummary.isNetPositive ? "+" : "-"}${currency} ${fmt(Math.abs(executiveSummary.netOperatingBalance))}
        </div>
        <div class="kpi-sub">${executiveSummary.netProfitMarginPct.toFixed(1)}% Operating Margin</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Budget Capacity Used</div>
        <div class="kpi-val" style="color: ${executiveSummary.budgetUtilizationPct > 100 ? "#F43F5E" : executiveSummary.budgetUtilizationPct > 80 ? "#F59E0B" : "#10B981"};">
          ${executiveSummary.budgetUtilizationPct.toFixed(1)}%
        </div>
        <div class="kpi-sub">${currency} ${fmtShort(executiveSummary.budgetRemaining)} Remaining Limit</div>
      </div>
    `;
      }
    }
  }

  const contactParts: string[] = [];
  if (metadata.organizationAddress && !metadata.organizationAddress.includes("Enterprise Financial Center")) {
    contactParts.push(metadata.organizationAddress);
  } else if (metadata.organizationAddress) {
    contactParts.push(metadata.organizationAddress);
  }
  if (metadata.organizationEmail && !metadata.organizationEmail.includes("ofm-cloud.com")) {
    contactParts.push(metadata.organizationEmail);
  }
  if (metadata.organizationPhone && !metadata.organizationPhone.includes("555-0199")) {
    contactParts.push(metadata.organizationPhone);
  }
  const cleanContact = contactParts.length > 0 ? contactParts.join(" · ") : "Institutional Financial Audit & Compliance Management";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.reportTitle} — ${metadata.organizationName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 8mm 7mm 10mm 7mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A; background: #FFFFFF; font-size: 8.5px; line-height: 1.35;
      -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    }
    @media print {
      body { background: #FFF !important; font-size: 8.5px !important; margin: 0 !important; padding: 0 !important; }
      .sheet-wrap { padding: 0 !important; box-shadow: none !important; border-radius: 0 !important; background: transparent !important; }
      .no-print { display: none !important; }
      .avoid-break { page-break-inside: avoid !important; break-inside: avoid-page !important; }
      tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      table { page-break-inside: auto !important; }
      thead { display: table-header-group !important; }
      tfoot { display: table-footer-group !important; }
      .section-title { page-break-after: avoid !important; break-after: avoid !important; }
    }
    @media screen {
      body { max-width: 900px; margin: 0 auto; padding: 16px 12px 36px 12px; background: #F1F5F9; }
      .sheet-wrap { background: #FFF; padding: 20px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    }
    
    /* Document Header Banner */
    .header-card {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%) !important;
      color: #FFFFFF !important; padding: 12px 16px; border-radius: 6px; margin-bottom: 8px;
      display: flex; justify-content: space-between; align-items: center;
      -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    }
    .org-title { font-size: 15px; font-weight: 800; letter-spacing: -0.3px; margin-bottom: 1px; }
    .org-sub { font-size: 9.5px; color: #94A3B8; }
    .org-contact { font-size: 8.5px; color: #CBD5E1; margin-top: 1px; }
    .meta-box { text-align: right; font-size: 8.5px; color: #CBD5E1; line-height: 1.4; }
    .cert-badge { display: inline-block; background: #10B98122; color: #10B981; border: 1px solid #10B98144; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; font-size: 8px; margin-top: 2px; }

    /* Applied Filters Bar */
    .filters-bar {
      background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 6px;
      padding: 5px 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 8.5px; color: #475569;
    }
    .filter-tag { font-weight: 700; color: #0F172A; background: #FFFFFF; border: 1px solid #CBD5E1; padding: 1px 5px; border-radius: 3px; }

    /* KPI Grid */
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
    .kpi-card { border: 1px solid #E2E8F0; border-radius: 6px; padding: 7px 10px; background: #F8FAFC; }
    .kpi-label { font-size: 8px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 1px; }
    .kpi-val { font-size: 13.5px; font-weight: 800; white-space: nowrap; }
    .kpi-sub { font-size: 8px; color: #64748B; margin-top: 1px; }

    /* Financial Health Card */
    .health-card {
      border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; background: #FFFFFF;
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
    }
    .health-badge {
      display: inline-block; padding: 3px 8px; border-radius: 5px; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px;
    }

    /* Section Headings */
    .section-title {
      font-size: 10.5px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.4px;
      margin: 10px 0 4px 0; padding-bottom: 3px; border-bottom: 1.5px solid #0F172A;
      display: flex; justify-content: space-between; align-items: center;
    }
    .section-tag { font-size: 8.5px; font-weight: 600; color: #64748B; text-transform: none; }

    /* Tables */
    .table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 8px; }
    table { width: 100%; min-width: 500px; border-collapse: collapse; margin-bottom: 0; font-size: 8.5px; table-layout: fixed; word-break: break-word; }
    thead th {
      background: #F1F5F9; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 8px; letter-spacing: 0.3px;
      padding: 5px 7px; border-bottom: 1.5px solid #CBD5E1; vertical-align: middle;
    }
    tbody tr td { padding: 4.5px 7px; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }
    tbody tr.even td { background: #FAFAFA; }
    .num { text-align: right !important; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap !important; }
    .badge { display: inline-block; padding: 1.5px 5px; border-radius: 3px; font-size: 7.5px; font-weight: 700; text-transform: uppercase; white-space: nowrap; }
    .tfoot-row td { background: #F1F5F9; font-weight: 800; border-top: 1.5px solid #0F172A; padding: 6px 7px; font-size: 8.5px; }

    /* Footer Signatures */
    .footer-sign {
      display: flex; justify-content: space-between; align-items: flex-end;
      margin-top: 14px; padding-top: 10px; border-top: 1px solid #E2E8F0;
    }
    .sign-box { width: 28%; text-align: center; font-size: 8.5px; color: #475569; }
    .sign-line { border-top: 1px dashed #94A3B8; margin-bottom: 4px; width: 100%; }
    .running-footer {
      font-size: 8px; color: #94A3B8; text-align: center; margin-top: 10px; padding-top: 6px; border-top: 1px solid #F1F5F9;
    }
    .sign-box { width: 220px; text-align: center; font-size: 9.5px; color: #64748B; }
    .sign-line { border-top: 1px dashed #94A3B8; margin-bottom: 4px; width: 100%; }
    .running-footer {
      font-size: 8.5px; color: #94A3B8; text-align: center; margin-top: 16px; padding-top: 8px; border-top: 1px solid #F1F5F9;
    }

    @media screen and (max-width: 768px) {
      body { padding: 8px 4px; font-size: 9px; }
      .sheet-wrap { padding: 12px; }
      .header-card { flex-direction: column; align-items: flex-start; gap: 10px; }
      .meta-box { text-align: left; margin-top: 4px; }
      .kpi-grid { grid-template-columns: 1fr 1fr; }
      .filters-bar { flex-direction: column; align-items: flex-start; }
      .health-card { flex-direction: column; align-items: flex-start; gap: 8px; }
      .footer-sign { flex-direction: column; gap: 20px; align-items: center; }
      .sign-box { width: 100%; max-width: 220px; }
    }
    @media screen and (max-width: 480px) {
      .kpi-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <!-- Floating Print Toolbar -->
  <div class="no-print" style="position:fixed; top:12px; right:16px; z-index:9999; display:flex; gap:10px;">
    <button onclick="window.print()" style="background:#10B981; color:#FFFFFF; font-family:-apple-system,sans-serif; font-size:13px; font-weight:700; border:none; padding:10px 18px; border-radius:8px; cursor:pointer; box-shadow:0 4px 14px rgba(16,185,129,0.35); display:flex; align-items:center; gap:6px;">
      🖨️ Print / Save as PDF
    </button>
  </div>

  <div class="sheet-wrap">

  <!-- Header Banner -->
  <div class="header-card">
    <div style="display:flex; align-items:center; gap:14px; flex:1.4;">
      ${metadata.organizationLogo ? `
        <img src="${metadata.organizationLogo}" alt="Logo" style="width:48px; height:48px; border-radius:10px; object-fit:contain; border:1px solid #38BDF8; background:#0F172A; padding:2px;" />
      ` : `
        <div style="width:44px; height:44px; border-radius:10px; background:linear-gradient(135deg, #0A1128 0%, #1E3A8A 100%); border:1.5px solid rgba(56,189,248,0.5); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#38BDF8; font-weight:800; font-size:12px; flex-shrink:0;">
          <span>▲</span>
          <span style="font-size:8.5px; color:#FFF; margin-top:-2px;">OFM</span>
        </div>
      `}
      <div>
        <div class="org-title">${data.reportTitle}</div>
        <div class="org-sub">${metadata.organizationName} · ${data.reportSubtitle}</div>
        <div class="org-contact">${cleanContact}</div>
      </div>
    </div>
    <div class="meta-box">
      <div><strong>Report Date:</strong> ${metadata.generatedDate}</div>
      <div><strong>Audit Generated:</strong> ${metadata.generatedTime}</div>
      <div><strong>Prepared By:</strong> ${metadata.generatedBy} (${metadata.userRole})</div>
      <div><strong>Dossier ID:</strong> <span class="cert-badge">${metadata.reportRefId}</span></div>
    </div>
  </div>

  <!-- Applied Filters Summary Bar -->
  <div class="filters-bar">
    <div><strong>Scope:</strong> <span class="filter-tag">${filters.periodLabel}</span> (${filters.startDate} → ${filters.endDate})</div>
    <div><strong>Cost Center:</strong> <span class="filter-tag">${filters.department}</span></div>
    <div><strong>Category:</strong> <span class="filter-tag">${filters.category}</span></div>
    <div><strong>Type:</strong> <span class="filter-tag">${filters.type}</span></div>
  </div>

  ${metadata.notes ? `
  <!-- Executive / Auditor Observations Block -->
  <div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:6px; padding:7px 11px; margin-bottom:8px; font-size:9px; color:#92400E;">
    <div style="font-weight:800; text-transform:uppercase; font-size:8px; letter-spacing:0.4px; margin-bottom:2px; display:flex; align-items:center; gap:5px;">
      <span>📝</span><span>Auditor & Executive Observations / Custom Notes</span>
    </div>
    <div>${metadata.notes}</div>
  </div>
  ` : ""}

  <!-- Dynamic KPI Scorecard Grid -->
  ${sec.kpis !== false && kpisHtml ? `
  <div class="kpi-grid">
    ${kpisHtml}
  </div>
  ` : ""}

  <!-- Financial Health & Executive Assessment -->
  ${isExecutive && sec.healthEvaluation !== false ? `
  <div class="health-card">
    <div style="flex:1;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
        <span class="health-badge" style="background:${financialHealth.color}18; color:${financialHealth.color}; border:1px solid ${financialHealth.color}40;">
          ${financialHealth.label} (Score: ${financialHealth.score}/100)
        </span>
        <span style="font-weight:700; color:#334155; font-size:10px;">Executive Financial Health Evaluation</span>
      </div>
      <div style="font-size:9.5px; color:#475569; line-height:1.4;">${financialHealth.explanation}</div>
    </div>
  </div>
  ` : ""}

  <!-- Executive Analytics & Radial Indicator Gauges (App Circular Progress Rings) -->
  ${(isExecutive || isBudget || isConsolidated) && sec.radialRings !== false && ch.radialGauges !== false ? buildExecutiveRingsSuiteSvg(
    budgetPerformance.overallUtilizationPct,
    budgetPerformance.totalAllocated,
    budgetPerformance.totalSpent,
    executiveSummary.netProfitMarginPct,
    !executiveSummary.isNetPositive,
    executiveSummary.totalRevenue,
    executiveSummary.totalExpenses,
    Math.max(0, 100 - (financialHealth.expenseRatioPct || 0)),
    currency,
    financialHealth
  ) : ""}

  <!-- Inflow vs Outflow Historical Trend Area Line Chart -->
  ${(isExecutive || isRevenue || isExpense) && monthlyTrends.chartPoints.length > 0 && sec.monthlyTrends !== false && ch.trendLine !== false ? `
  <div class="avoid-break" style="margin-bottom: 14px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <span style="font-weight:800; font-size:11px; color:#0F172A;">Monthly Inflow vs Outflow Trend Analysis</span>
      <div style="display:flex; gap:12px; font-size:9.5px; font-weight:600;">
        <span style="color:#10B981;">● Revenue Inflow</span>
        <span style="color:#F43F5E;">● Operational Outflow</span>
      </div>
    </div>
    ${buildTrendSvg(monthlyTrends.chartPoints, currency)}
  </div>
  ` : ""}

  <!-- Executive Statement of Financial Activities & Capital Pool Summary -->
  ${(isConsolidated || isExecutive) ? `
  <div class="section-title avoid-break" style="margin-top: 8px;">
    <span>Executive Statement of Financial Activities & Capital Pool</span>
    <span class="section-tag">${filters.periodLabel} · Audited Statement</span>
  </div>
  <div class="table-wrap avoid-break">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 55%; text-align: left;">Financial Classification / Funding Source</th>
          <th style="width: 25%; text-align: right;">Audited Amount (${currency})</th>
          <th style="width: 20%; text-align: center;">Composition & Audit Note</th>
        </tr>
      </thead>
      <tbody>
        <tr class="even">
          <td style="text-align: left; font-weight:700; color:#10B981;">A. Institutional Realized Revenue & Inflows</td>
          <td class="num" style="color:#10B981; font-weight:700;">+${currency} ${fmt(executiveSummary.totalRevenue)}</td>
          <td style="text-align: center; color:#10B981;">${revenueAnalysis.byCategory.length} Revenue Streams</td>
        </tr>
        ${(executiveSummary.budgetTotal || 0) > 0 ? `
        <tr>
          <td style="text-align: left; font-weight:700; color:#3B82F6;">B. Department Budget Allocation (Funded from Income)</td>
          <td class="num" style="color:#3B82F6; font-weight:700;">${currency} ${fmt(executiveSummary.budgetTotal)}</td>
          <td style="text-align: center; color:#3B82F6;">${departmentFinancials.departments.length} Cost Centers Monitored</td>
        </tr>
        <tr style="background:#F1F5F9; font-weight:800;">
          <td style="text-align: left; color:#0F172A;">UNALLOCATED AVAILABLE FUNDS (Net Cash − Budget)</td>
          <td class="num" style="color:#0F172A; font-weight:800;">${currency} ${fmt(executiveSummary.unallocatedFunds !== undefined ? executiveSummary.unallocatedFunds : Math.max(0, executiveSummary.netOperatingBalance - (executiveSummary.budgetTotal || 0)))}</td>
          <td style="text-align: center; font-weight:800;">Liquid Reserve</td>
        </tr>
        ` : ""}
        <tr class="even">
          <td style="text-align: left; font-weight:700; color:#F43F5E;">C. Total Realized Operational Expenditures & Outflows</td>
          <td class="num" style="color:#F43F5E; font-weight:700;">-${currency} ${fmt(executiveSummary.totalExpenses)}</td>
          <td style="text-align: center; color:#F43F5E;">${expenseAnalysis.byCategory.length} Cost Categories</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td style="text-align: left;">NET OPERATING CASHFLOW (Inflows - Outflows)</td>
          <td class="num" style="color: ${executiveSummary.isNetPositive ? "#10B981" : "#F43F5E"};">
            ${executiveSummary.isNetPositive ? "+" : "-"}${currency} ${fmt(Math.abs(executiveSummary.netOperatingBalance))}
          </td>
          <td style="text-align: center;">${executiveSummary.netProfitMarginPct.toFixed(1)}% Operating Margin</td>
        </tr>
        ${(executiveSummary.budgetTotal || 0) > 0 ? `
        <tr style="background:#E0F2FE; font-weight:900; border-top:2px solid #0284C7;">
          <td style="text-align: left; color:#0369A1;">NET CAPITAL SURPLUS REMAINING (Capital Pool - Expenses)</td>
          <td class="num" style="color:#0369A1; font-weight:900; font-size:10px;">
            +${currency} ${fmt(executiveSummary.netCapitalSurplus !== undefined ? executiveSummary.netCapitalSurplus : ((executiveSummary.totalRevenue + (executiveSummary.budgetTotal || 0)) - executiveSummary.totalExpenses))}
          </td>
          <td style="text-align: center; color:#0369A1; font-weight:800;">${(executiveSummary.retainedCapitalPct || 0).toFixed(1)}% Retained</td>
        </tr>
        ` : ""}
      </tfoot>
    </table>
  </div>
  ` : ""}

  <!-- Section 1: Revenue Streams Analysis -->
  ${isRevenue && revenueAnalysis.hasData ? `
  <div class="section-title avoid-break" style="margin-top: 8px;">
    <span>1. Institutional Inflows & Revenue Streams</span>
    <span class="section-tag">${revenueAnalysis.byCategory.length} Revenue Streams · Total: +${currency} ${fmt(revenueAnalysis.totalRevenue)}</span>
  </div>
  ${revenueAnalysis.byCategory.length > 0 && ch.revenueDonut !== false ? buildCategoryDonutSvg(revenueAnalysis.byCategory, revenueAnalysis.totalRevenue, currency) : ""}
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 40%; text-align: left;">Revenue Category / Source</th>
          <th style="width: 25%; text-align: right;">Total Realized (${currency})</th>
          <th style="width: 20%; text-align: center;">Share of Revenue</th>
          <th style="width: 15%; text-align: center;">Transactions</th>
        </tr>
      </thead>
      <tbody>
        ${revenueAnalysis.byCategory.map((c, idx) => `
          <tr class="${idx % 2 === 0 ? "even" : ""}">
            <td style="text-align: left;"><strong>${c.category}</strong></td>
            <td class="num" style="color: #10B981;">+${currency} ${fmt(c.amount)}</td>
            <td style="text-align: center;">${c.pct}%</td>
            <td style="text-align: center;">${c.count}</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td style="text-align: left;">TOTAL INSTITUTIONAL REVENUE</td>
          <td class="num" style="color: #10B981;">+${currency} ${fmt(revenueAnalysis.totalRevenue)}</td>
          <td style="text-align: center;">100%</td>
          <td style="text-align: center;">${revenueAnalysis.transactions.length}</td>
        </tr>
      </tfoot>
    </table>
  </div>
  ` : ""}

  <!-- Section 2: Expenditure & Cost Centers Analysis -->
  ${isExpense && expenseAnalysis.hasData ? `
  <div class="section-title avoid-break" style="margin-top: 8px;">
    <span>2. Operational Expenditures & Cost Outflows</span>
    <span class="section-tag">${expenseAnalysis.byCategory.length} Cost Categories · Total: -${currency} ${fmt(expenseAnalysis.totalExpenses)}</span>
  </div>
  ${expenseAnalysis.byCategory.length > 0 && ch.expenseDonut !== false ? buildCategoryDonutSvg(expenseAnalysis.byCategory, expenseAnalysis.totalExpenses, currency) : ""}
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 40%; text-align: left;">Expense Category / Division</th>
          <th style="width: 25%; text-align: right;">Total Outflow (${currency})</th>
          <th style="width: 20%; text-align: center;">Share of Expenses</th>
          <th style="width: 15%; text-align: center;">Vouchers</th>
        </tr>
      </thead>
      <tbody>
        ${expenseAnalysis.byCategory.map((c, idx) => `
          <tr class="${idx % 2 === 0 ? "even" : ""}">
            <td style="text-align: left;"><strong>${c.category}</strong></td>
            <td class="num" style="color: #F43F5E;">-${currency} ${fmt(c.amount)}</td>
            <td style="text-align: center;">${c.pct}%</td>
            <td style="text-align: center;">${c.count}</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td style="text-align: left;">TOTAL OPERATIONAL EXPENDITURES</td>
          <td class="num" style="color: #F43F5E;">-${currency} ${fmt(expenseAnalysis.totalExpenses)}</td>
          <td style="text-align: center;">100%</td>
          <td style="text-align: center;">${expenseAnalysis.transactions.length}</td>
        </tr>
      </tfoot>
    </table>
  </div>
  ` : ""}

  <!-- Section 3: Department Financial Allocations & Budget Performance -->
  ${(isDepartment || isBudget) && departmentFinancials.hasData ? `
  <div class="section-title avoid-break" style="margin-top: 8px;">
    <span>3. Department Cost Center Allocations & Profitability</span>
    <span class="section-tag">${departmentFinancials.departments.length} Cost Centers Monitored</span>
  </div>
  ${ch.departmentBars !== false ? buildDepartmentBudgetSvg(departmentFinancials.departments, currency) : ""}
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 26%; text-align: left;">Department Name</th>
          <th style="width: 12%; text-align: center;">Headcount</th>
          <th style="width: 16%; text-align: right;">Allocated Budget</th>
          <th style="width: 16%; text-align: right;">Actual Spent</th>
          <th style="width: 16%; text-align: right;">Remaining</th>
          <th style="width: 14%; text-align: center;">Utilization</th>
        </tr>
      </thead>
      <tbody>
        ${departmentFinancials.departments.map((d, idx) => `
          <tr class="${idx % 2 === 0 ? "even" : ""}">
            <td style="text-align: left;"><strong>${d.name}</strong></td>
            <td style="text-align: center;">${d.headcount} Staff</td>
            <td class="num">${currency} ${fmt(d.allocatedBudget)}</td>
            <td class="num" style="color: #F43F5E;">${currency} ${fmt(d.actualSpent)}</td>
            <td class="num" style="color: ${d.remainingBudget >= 0 ? "#10B981" : "#F43F5E"}; font-weight:600;">${currency} ${fmt(d.remainingBudget)}</td>
            <td style="text-align: center;">
              <span class="badge" style="background:${d.statusColor}18; color:${d.statusColor}; border:1px solid ${d.statusColor}35;">${d.utilizationPct}% (${d.status})</span>
            </td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td style="text-align: left;">CONSOLIDATED TOTALS</td>
          <td style="text-align: center;">${departmentFinancials.departments.reduce((s, d) => s + d.headcount, 0)} Staff</td>
          <td class="num">${currency} ${fmt(departmentFinancials.departments.reduce((s, d) => s + (d.allocatedBudget || 0), 0))}</td>
          <td class="num" style="color: #F43F5E;">${currency} ${fmt(departmentFinancials.departments.reduce((s, d) => s + (d.actualSpent || 0), 0))}</td>
          <td class="num" style="color: ${departmentFinancials.departments.reduce((s, d) => s + (d.remainingBudget || 0), 0) >= 0 ? "#10B981" : "#F43F5E"};">${currency} ${fmt(departmentFinancials.departments.reduce((s, d) => s + (d.remainingBudget || 0), 0))}</td>
          <td style="text-align: center;">${budgetPerformance.overallUtilizationPct.toFixed(1)}%</td>
        </tr>
      </tfoot>
    </table>
  </div>
  ` : ""}

  <!-- Section 4: Staff Payroll & Remuneration Audit -->
  ${isPayroll && payrollSection.hasData ? `
  <div class="section-title avoid-break" style="margin-top: 8px;">
    <span>4. Staff Payroll & Remuneration Audit</span>
    <span class="section-tag">${payrollSection.employeeCount} Employees · Total Disbursed: ${currency} ${fmt(payrollSection.netPayroll)}</span>
  </div>
  ${payrollSection.canViewDetails && payrollSection.employees.length > 0 ? `
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 22%; text-align: left;">Employee Name</th>
          <th style="width: 12%; text-align: center;">Employee ID</th>
          <th style="width: 16%; text-align: left;">Department</th>
          <th style="width: 13%; text-align: right;">Base Salary</th>
          <th style="width: 11%; text-align: right;">Bonus</th>
          <th style="width: 11%; text-align: right;">Deductions</th>
          <th style="width: 15%; text-align: right;">Net Disbursed</th>
        </tr>
      </thead>
      <tbody>
        ${payrollSection.employees.map((p, idx) => `
          <tr class="${idx % 2 === 0 ? "even" : ""}">
            <td style="text-align: left;"><strong>${p.employeeName}</strong><br><span style="font-size:7.5px; color:#64748B;">${p.designation || "Staff"}</span></td>
            <td style="text-align: center; color: #64748B;">${p.employeeId}</td>
            <td style="text-align: left;">${p.department}</td>
            <td class="num">${currency} ${fmt(p.baseSalary)}</td>
            <td class="num" style="color: #10B981;">+${currency} ${fmt(p.bonus)}</td>
            <td class="num" style="color: #F43F5E;">-${currency} ${fmt(p.deductions)}</td>
            <td class="num" style="font-weight: bold; color: #6366F1;">${currency} ${fmt(p.netSalary)}</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td colspan="3" style="text-align: left;">TOTAL PAYROLL DISBURSEMENTS</td>
          <td class="num">${currency} ${fmt(payrollSection.grossPayroll - payrollSection.totalBonuses)}</td>
          <td class="num" style="color: #10B981;">+${currency} ${fmt(payrollSection.totalBonuses)}</td>
          <td class="num" style="color: #F43F5E;">-${currency} ${fmt(payrollSection.totalDeductions)}</td>
          <td class="num" style="font-weight: bold; color: #6366F1;">${currency} ${fmt(payrollSection.netPayroll)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
  ` : `
  <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:8px 10px; font-size:8.5px; color:#64748B; margin-bottom:8px;">
    Staff payroll summary aggregated across ${payrollSection.byDepartment.length} departments. Detailed individual salary breakdown is restricted based on access permissions.
  </div>
  `}
  ` : ""}

  <!-- Section 5: Audited General Ledger & Double-Entry Transaction Trail -->
  ${isLedger && generalLedger.hasData ? `
  <div class="section-title avoid-break" style="margin-top: 8px;">
    <span>5. Audited General Ledger Transaction Trail</span>
    <span class="section-tag">${generalLedger.transactions.length} Total Records · Total Volume: ${currency} ${fmt(generalLedger.totalVolume)}</span>
  </div>
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 11%; text-align: center;">Date</th>
          <th style="width: 10%; text-align: center;">Type</th>
          <th style="width: 19%; text-align: left;">Category</th>
          <th style="width: 18%; text-align: left;">Department</th>
          <th style="width: 24%; text-align: left;">Description</th>
          <th style="width: 18%; text-align: right;">Amount (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${generalLedger.transactions.map((t, idx) => {
          const isInc = t.type === "income";
          return `
            <tr class="${idx % 2 === 0 ? "even" : ""}">
              <td style="text-align: center; white-space: nowrap; font-weight:600;">${t.date}</td>
              <td style="text-align: center;">
                <span class="badge" style="background:${isInc ? "#10B98118" : "#F43F5E18"}; color:${isInc ? "#10B981" : "#F43F5E"}; border:1px solid ${isInc ? "#10B98135" : "#F43F5E35"};">
                  ${isInc ? "INFLOW" : "OUTFLOW"}
                </span>
              </td>
              <td style="text-align: left;"><strong>${t.category}</strong></td>
              <td style="text-align: left;">${t.department}</td>
              <td style="text-align: left; color: #64748B; font-size: 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.description || "General Record"}</td>
              <td class="num" style="font-weight: bold; color:${isInc ? "#10B981" : "#F43F5E"};">
                ${isInc ? "+" : "-"}${currency} ${fmt(t.amount)}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td colspan="5" style="text-align: left;">NET AUDITED BALANCE RESULT</td>
          <td class="num" style="font-weight: bold; color:${executiveSummary.isNetPositive ? "#10B981" : "#F43F5E"};">
            ${executiveSummary.isNetPositive ? "+" : "-"}${currency} ${fmt(Math.abs(executiveSummary.netOperatingBalance))}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
  ` : ""}

  <!-- Audit Authorization & Verification Block -->
  <div class="footer-sign avoid-break">
    <div class="sign-box">
      <div class="sign-line"></div>
      <div><strong>${metadata.generatedBy}</strong></div>
      <div style="font-size:7.5px; color:#94A3B8;">Prepared By (${metadata.userRole})</div>
    </div>
    <div class="sign-box">
      <div class="sign-line"></div>
      <div><strong>Executive Management</strong></div>
      <div style="font-size:7.5px; color:#94A3B8;">Financial Operations Authorization</div>
    </div>
    <div class="sign-box">
      <div class="sign-line"></div>
      <div><strong>Auditing & Compliance Board</strong></div>
      <div style="font-size:7.5px; color:#94A3B8;">Institutional Verification</div>
    </div>
  </div>

  <div class="running-footer">
    ${metadata.organizationName} · Organization Finance Management (OFM) · Report Reference: ${metadata.reportRefId} · Generated: ${metadata.generatedDate} ${metadata.generatedTime}
  </div>

  </div>
</body>
</html>
  `;
}

/**
 * Builds standard PDF 1.4 vector binary stream
 */
export function buildFinancialPdfBinary(input: ReportOptions | EnterpriseReportData): string {
  const data = normalizeToEnterpriseData(input);
  const { metadata, filters, executiveSummary, generalLedger, departmentFinancials, payrollSection, monthlyTrends } = data;
  const currency = metadata.currency || "PKR";
  const totalIncome = executiveSummary.totalRevenue;
  const totalExpenses = executiveSummary.totalExpenses;
  const netBalance = executiveSummary.netOperatingBalance;
  const isNetPositive = executiveSummary.isNetPositive;
  const hasBudget = (executiveSummary.budgetTotal || 0) > 0;
  const unallocatedFunds = executiveSummary.unallocatedFunds !== undefined
    ? executiveSummary.unallocatedFunds
    : Math.max(0, netBalance - (executiveSummary.budgetTotal || 0));
  const netCapitalSurplus = netBalance;
  const isSurplusPositive = isNetPositive;
  const retainedPct = totalIncome > 0 ? (Math.max(0, netBalance) / totalIncome) * 100 : 0;
  const orgName = metadata.organizationName || "Organization Finance Management";
  const generatedBy = metadata.generatedBy || "Chief Financial Officer";
  const dateStr = metadata.generatedDate;
  const timeStr = metadata.generatedTime;
  const certId = metadata.reportRefId;

  const contactParts: string[] = [];
  if (metadata.organizationAddress && !metadata.organizationAddress.includes("Kotli, Azad Kashmir")) {
    contactParts.push(metadata.organizationAddress);
  } else if (metadata.organizationAddress) {
    contactParts.push(metadata.organizationAddress);
  }
  if (metadata.organizationEmail && !metadata.organizationEmail.includes("devorbit.tech") && !metadata.organizationEmail.includes("ofm-cloud.com")) {
    contactParts.push(metadata.organizationEmail);
  }
  if (metadata.organizationPhone && !metadata.organizationPhone.includes("555-0199") && !metadata.organizationPhone.includes("444111")) {
    contactParts.push(metadata.organizationPhone);
  }
  const fullContact = contactParts.length > 0 ? contactParts.join(" · ") : "Official Institutional Audited Financial Statement";

  const fmtEx = (n: number) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => Number(n || 0).toLocaleString();

  // Multi-Page state
  const pages: string[][] = [];
  let curPage: string[] = [];
  let currentY = 800;

  const pushCurrentPage = () => {
    if (curPage.length > 0) {
      pages.push(curPage);
      curPage = [];
    }
  };

  const startNewPage = (isFirst = false) => {
    pushCurrentPage();
    curPage = ["q"];

    if (isFirst) {
      // ─── 1. TOP HEADER BANNER (Page 1) ───
      curPage.push(
        "0.06 0.09 0.16 rg",
        "40 735 515.28 75 re f",
        "0.22 0.74 0.97 rg",
        "40 735 6 75 re f",
        "BT",
        "/F2 14 Tf 1 1 1 rg",
        `56 788 Td (${escapePdfText(orgName.slice(0, 42))}) Tj`,
        "/F1 8 Tf 0.78 0.82 0.95 rg",
        "56 772 Td (Organization Finance Management · Official Certified Statement) Tj",
        "/F1 7.5 Tf 0.22 0.74 0.97 rg",
        `56 756 Td (${escapePdfText(fullContact.slice(0, 75))}) Tj`,
        "ET",
        // Header Right Badge
        "0.15 0.23 0.40 rg",
        "405 760 140 22 re f",
        "BT",
        "/F2 7.5 Tf 0.22 0.74 0.97 rg",
        `415 768 Td (REF: ${escapePdfText(certId.slice(0, 18))}) Tj`,
        "ET",
        // Applied Scope Bar
        "0.94 0.95 0.98 rg",
        "40 710 515.28 18 re f",
        "0.85 0.88 0.94 rg",
        "40 710 515.28 18 re S",
        "BT",
        "/F2 7.5 Tf 0.15 0.20 0.35 rg",
        `48 716 Td (AUDIT SCOPE: ${escapePdfText(filters.periodLabel)}  |  RANGE: ${escapePdfText(filters.startDate)} to ${escapePdfText(filters.endDate)}  |  RECORDS: ${generalLedger.transactions.length}) Tj`,
        "ET",
        // ─── 2. EXECUTIVE SUMMARY CARDS (3 Columns) ───
        // Card 1: Revenue
        "0.96 0.97 0.99 rg",
        "40 640 165 62 re f",
        "0.06 0.72 0.50 rg",
        "40 700 165 2.5 re f",
        "BT",
        "/F2 7.5 Tf 0.40 0.45 0.55 rg",
        "50 688 Td (TOTAL REVENUE / INFLOWS) Tj",
        "ET",
        "BT",
        "/F2 11 Tf 0.06 0.72 0.50 rg",
        `50 670 Td (+${escapePdfText(currency)} ${escapePdfText(fmtEx(totalIncome))}) Tj`,
        "ET",
        "BT",
        "/F1 7 Tf 0.45 0.50 0.60 rg",
        `50 654 Td (${generalLedger.transactions.filter(t => t.type === "income").length} Realized Inflows) Tj`,
        "ET",
        // Card 2: Expenditures
        "0.96 0.97 0.99 rg",
        "215 640 165 62 re f",
        "0.94 0.25 0.37 rg",
        "215 700 165 2.5 re f",
        "BT",
        "/F2 7.5 Tf 0.40 0.45 0.55 rg",
        "225 688 Td (TOTAL EXPENDITURES) Tj",
        "ET",
        "BT",
        "/F2 11 Tf 0.94 0.25 0.37 rg",
        `225 670 Td (-${escapePdfText(currency)} ${escapePdfText(fmtEx(totalExpenses))}) Tj`,
        "ET",
        "BT",
        "/F1 7 Tf 0.45 0.50 0.60 rg",
        hasBudget
          ? `225 654 Td (Budget Cap: ${escapePdfText(currency)} ${escapePdfText(fmtInt(executiveSummary.budgetTotal))}) Tj`
          : `225 654 Td (${generalLedger.transactions.filter(t => t.type === "expense").length} Outflow Vouchers) Tj`,
        "ET",
        // Card 3: Net Operating Balance
        "0.96 0.97 0.99 rg",
        "390 640 165 62 re f",
        (hasBudget ? isSurplusPositive : isNetPositive) ? "0.06 0.72 0.50 rg" : "0.94 0.25 0.37 rg",
        "390 700 165 2.5 re f",
        "BT",
        "/F2 7.5 Tf 0.40 0.45 0.55 rg",
        `400 688 Td (${hasBudget ? "NET CAPITAL SURPLUS" : "NET OPERATING BALANCE"}) Tj`,
        "ET",
        "BT",
        `/F2 11 Tf ${(hasBudget ? isSurplusPositive : isNetPositive) ? "0.06 0.72 0.50" : "0.94 0.25 0.37"} rg`,
        hasBudget
          ? `400 670 Td (${isSurplusPositive ? "+" : "-"}${escapePdfText(currency)} ${escapePdfText(fmtEx(Math.abs(netCapitalSurplus)))}) Tj`
          : `400 670 Td (${isNetPositive ? "+" : "-"}${escapePdfText(currency)} ${escapePdfText(fmtEx(Math.abs(netBalance)))}) Tj`,
        "ET",
        "BT",
        "/F1 7 Tf 0.45 0.50 0.60 rg",
        hasBudget
          ? `400 654 Td (${retainedPct.toFixed(0)}% Retained · ${isNetPositive ? "+" : "-"}${escapePdfText(currency)} ${escapePdfText(fmtInt(Math.abs(netBalance)))} Cash) Tj`
          : `400 654 Td (${isNetPositive ? "Operating Surplus Retained" : "Operating Deficit Alert"}) Tj`,
        "ET"
      );

      // ─── 3. FINANCIAL TREND GRAPH (Page 1) ───
      const chartY = 525;
      const chartH = 102;
      curPage.push(
        "0.98 0.98 1.0 rg",
        `40 ${chartY} 515.28 ${chartH} re f`,
        "0.88 0.90 0.95 rg",
        `40 ${chartY} 515.28 ${chartH} re S`,
        "BT",
        "/F2 8 Tf 0.10 0.15 0.30 rg",
        `50 ${chartY + 86} Td (FINANCIAL CASH FLOW & REVENUE TRAJECTORY (VECTOR AUDIT)) Tj`,
        "ET",
        "0.06 0.72 0.50 rg",
        `355 ${chartY + 88} 7 7 re f`,
        "BT",
        "/F1 6.5 Tf 0.30 0.35 0.45 rg",
        `366 ${chartY + 89} Td (Realized Inflows) Tj`,
        "ET",
        "0.94 0.25 0.37 rg",
        `440 ${chartY + 88} 7 7 re f`,
        "BT",
        "/F1 6.5 Tf 0.30 0.35 0.45 rg",
        `451 ${chartY + 89} Td (Operational Outflows) Tj`,
        "ET",
        "0.75 0.80 0.88 rg",
        `50 ${chartY + 22} 495 0.8 re f`
      );

      const pts = monthlyTrends?.chartPoints || [];
      if (pts.length > 0 && (totalIncome > 0 || totalExpenses > 0)) {
        const maxBar = Math.max(...pts.map((p) => Math.max(p.income || 0, p.expense || 0)), totalIncome, totalExpenses, 1);
        const visiblePts = pts.slice(0, 14);
        const stepW = 460 / Math.max(visiblePts.length, 1);
        const barW = Math.max(4, Math.min(15, stepW * 0.36));

        visiblePts.forEach((pt, idx) => {
          const x = 58 + idx * stepW;
          const incH = Math.max(1, Math.min(52, ((pt.income || 0) / maxBar) * 52));
          const expH = Math.max(1, Math.min(52, ((pt.expense || 0) / maxBar) * 52));
          curPage.push(
            "0.06 0.72 0.50 rg",
            `${x} ${chartY + 22} ${barW} ${incH} re f`,
            "0.94 0.25 0.37 rg",
            `${x + barW + 2} ${chartY + 22} ${barW} ${expH} re f`,
            "BT",
            "/F1 6.5 Tf 0.40 0.45 0.55 rg",
            `${x} ${chartY + 11} Td (${escapePdfText((pt.label || "").slice(0, 7))}) Tj`,
            "ET"
          );
        });
      } else {
        curPage.push(
          "BT",
          "/F1 8 Tf 0.45 0.50 0.60 rg",
          `160 ${chartY + 46} Td (No financial activity recorded for the selected audit period) Tj`,
          "ET"
        );
      }

      currentY = 508;
    } else {
      // Running header on Page 2+
      curPage.push(
        "BT",
        "/F2 8 Tf 0.10 0.15 0.30 rg",
        `40 812 Td (${escapePdfText(orgName.slice(0, 35))} · Official Financial Statement) Tj`,
        "ET",
        "BT",
        "/F1 7.5 Tf 0.45 0.50 0.60 rg",
        `390 812 Td (REF: ${escapePdfText(certId.slice(0, 16))} · ${escapePdfText(filters.periodLabel.slice(0, 22))}) Tj`,
        "ET",
        "0.85 0.88 0.94 rg",
        "40 804 515.28 0.8 re f"
      );
      currentY = 785;
    }
  };

  const ensureSpace = (needed: number, onNewPageHeader?: () => void) => {
    if (currentY - needed < 70) {
      startNewPage(false);
      if (onNewPageHeader) {
        onNewPageHeader();
      }
    }
  };

  // Start Page 1
  startNewPage(true);

  // ─── 4. DEPARTMENT ALLOCATIONS (Full List) ───
  if (departmentFinancials?.departments && departmentFinancials.departments.length > 0) {
    const renderDeptHeader = () => {
      curPage.push(
        "0.06 0.09 0.16 rg",
        `40 ${currentY - 16} 515.28 16 re f`,
        "BT",
        "/F2 8 Tf 1 1 1 rg",
        `48 ${currentY - 12} Td (DEPARTMENTAL COST CENTER ALLOCATIONS & UTILIZATION) Tj`,
        "ET",
        "0.92 0.94 0.98 rg",
        `40 ${currentY - 32} 515.28 15 re f`,
        "BT",
        "/F2 7 Tf 0.20 0.25 0.35 rg",
        `48 ${currentY - 28} Td (COST CENTER) Tj`,
        `180 ${currentY - 28} Td (HEADCOUNT) Tj`,
        `250 ${currentY - 28} Td (ALLOCATED (${escapePdfText(currency)})) Tj`,
        `350 ${currentY - 28} Td (ACTUAL SPENT (${escapePdfText(currency)})) Tj`,
        `460 ${currentY - 28} Td (CAPACITY UTILIZATION) Tj`,
        "ET"
      );
      currentY -= 33;
    };

    ensureSpace(50, renderDeptHeader);
    renderDeptHeader();

    departmentFinancials.departments.forEach((d, idx) => {
      ensureSpace(18, renderDeptHeader);
      const y = currentY;
      const utilPct = Math.min(100, Math.round(d.utilizationPct || 0));
      const barW = Math.max(2, Math.min(50, (utilPct / 100) * 50));
      const isOver = utilPct > 90;

      if (idx % 2 === 1) {
        curPage.push("0.98 0.98 0.99 rg", `40 ${y - 14} 515.28 16 re f`);
      }
      curPage.push(
        "0.90 0.92 0.95 rg",
        `40 ${y - 14} 515.28 0.5 re f`,
        "BT",
        "/F2 7.5 Tf 0.10 0.15 0.25 rg",
        `48 ${y - 10} Td (${escapePdfText(d.name.slice(0, 22))}) Tj`,
        "ET",
        "BT",
        "/F1 7.5 Tf 0.35 0.40 0.50 rg",
        `185 ${y - 10} Td (${d.headcount} Staff) Tj`,
        "ET",
        "BT",
        "/F1 7.5 Tf 0.35 0.40 0.50 rg",
        `250 ${y - 10} Td (${currency} ${escapePdfText(fmtInt(d.allocatedBudget))}) Tj`,
        "ET",
        "BT",
        "/F2 7.5 Tf 0.94 0.25 0.37 rg",
        `350 ${y - 10} Td (${currency} ${escapePdfText(fmtInt(d.actualSpent))}) Tj`,
        "ET",
        // Progress bar track
        "0.88 0.90 0.95 rg",
        `460 ${y - 10} 50 6 re f`,
        // Progress bar fill
        isOver ? "0.94 0.25 0.37 rg" : "0.22 0.74 0.97 rg",
        `460 ${y - 10} ${barW} 6 re f`,
        "BT",
        "/F2 7 Tf 0.15 0.20 0.30 rg",
        `515 ${y - 10} Td (${utilPct}%) Tj`,
        "ET"
      );
      currentY -= 17;
    });
    currentY -= 6;
  }

  // ─── 5. STAFF PAYROLL & REMUNERATION AUDIT (Full List) ───
  if (payrollSection?.employees && payrollSection.employees.length > 0 && payrollSection.canViewDetails) {
    const renderPayrollHeader = () => {
      curPage.push(
        "0.06 0.09 0.16 rg",
        `40 ${currentY - 16} 515.28 16 re f`,
        "BT",
        "/F2 8 Tf 1 1 1 rg",
        `48 ${currentY - 12} Td (STAFF PAYROLL & REMUNERATION AUDIT DOSSIER) Tj`,
        "ET",
        "0.92 0.94 0.98 rg",
        `40 ${currentY - 32} 515.28 15 re f`,
        "BT",
        "/F2 7 Tf 0.20 0.25 0.35 rg",
        `48 ${currentY - 28} Td (EMPLOYEE NAME) Tj`,
        `170 ${currentY - 28} Td (EMP ID) Tj`,
        `230 ${currentY - 28} Td (DEPARTMENT) Tj`,
        `345 ${currentY - 28} Td (BASE SALARY (${escapePdfText(currency)})) Tj`,
        `455 ${currentY - 28} Td (NET DISBURSED (${escapePdfText(currency)})) Tj`,
        "ET"
      );
      currentY -= 33;
    };

    ensureSpace(50, renderPayrollHeader);
    renderPayrollHeader();

    payrollSection.employees.forEach((p, idx) => {
      ensureSpace(17, renderPayrollHeader);
      const y = currentY;

      if (idx % 2 === 1) {
        curPage.push("0.98 0.98 0.99 rg", `40 ${y - 13} 515.28 15 re f`);
      }
      curPage.push(
        "0.90 0.92 0.95 rg",
        `40 ${y - 13} 515.28 0.5 re f`,
        "BT",
        "/F2 7.5 Tf 0.10 0.15 0.25 rg",
        `48 ${y - 10} Td (${escapePdfText((p.employeeName || "").slice(0, 20))}) Tj`,
        "ET",
        "BT",
        "/F1 7 Tf 0.35 0.40 0.50 rg",
        `170 ${y - 10} Td (${escapePdfText((p.employeeId || "-").slice(0, 10))}) Tj`,
        "ET",
        "BT",
        "/F1 7.5 Tf 0.35 0.40 0.50 rg",
        `230 ${y - 10} Td (${escapePdfText((p.department || "").slice(0, 16))}) Tj`,
        "ET",
        "BT",
        "/F1 7.5 Tf 0.20 0.25 0.35 rg",
        `345 ${y - 10} Td (${currency} ${escapePdfText(fmtEx(p.baseSalary))}) Tj`,
        "ET",
        "BT",
        "/F2 7.5 Tf 0.06 0.72 0.50 rg",
        `455 ${y - 10} Td (${currency} ${escapePdfText(fmtEx(p.netSalary || p.baseSalary))}) Tj`,
        "ET"
      );
      currentY -= 16;
    });
    currentY -= 6;
  }

  // ─── 6. AUDITED GENERAL LEDGER (Full Dynamically Paginated List) ───
  if (generalLedger?.transactions && generalLedger.transactions.length > 0) {
    const renderLedgerHeader = () => {
      curPage.push(
        "0.06 0.09 0.16 rg",
        `40 ${currentY - 16} 515.28 16 re f`,
        "BT",
        "/F2 8 Tf 1 1 1 rg",
        `48 ${currentY - 12} Td (AUDITED GENERAL LEDGER & TRANSACTION TRAIL (${generalLedger.transactions.length} RECORDS)) Tj`,
        "ET",
        "0.92 0.94 0.98 rg",
        `40 ${currentY - 32} 515.28 15 re f`,
        "BT",
        "/F2 7 Tf 0.20 0.25 0.35 rg",
        `48 ${currentY - 28} Td (DATE) Tj`,
        `115 ${currentY - 28} Td (TYPE) Tj`,
        `170 ${currentY - 28} Td (CATEGORY) Tj`,
        `270 ${currentY - 28} Td (DEPARTMENT / DESCRIPTION) Tj`,
        `450 ${currentY - 28} Td (AMOUNT (${escapePdfText(currency)})) Tj`,
        "ET"
      );
      currentY -= 33;
    };

    ensureSpace(50, renderLedgerHeader);
    renderLedgerHeader();

    generalLedger.transactions.forEach((t, idx) => {
      ensureSpace(16, renderLedgerHeader);
      const y = currentY;
      const isIncome = t.type === "income";
      const amtStr = `${isIncome ? "+" : "-"}${currency} ${fmtEx(t.amount)}`;

      if (idx % 2 === 1) {
        curPage.push("0.98 0.98 0.99 rg", `40 ${y - 13} 515.28 15 re f`);
      }
      curPage.push(
        "0.90 0.92 0.95 rg",
        `40 ${y - 13} 515.28 0.5 re f`,
        "BT",
        "/F1 7.5 Tf 0.15 0.20 0.30 rg",
        `48 ${y - 10} Td (${escapePdfText((t.date || "").slice(0, 10))}) Tj`,
        "ET",
        "BT",
        `/F2 7 Tf ${isIncome ? "0.06 0.72 0.50" : "0.94 0.25 0.37"} rg`,
        `115 ${y - 10} Td (${isIncome ? "INFLOW" : "OUTFLOW"}) Tj`,
        "ET",
        "BT",
        "/F2 7.5 Tf 0.10 0.15 0.25 rg",
        `170 ${y - 10} Td (${escapePdfText((t.category || "").slice(0, 16))}) Tj`,
        "ET",
        "BT",
        "/F1 7 Tf 0.35 0.40 0.50 rg",
        `270 ${y - 10} Td (${escapePdfText(`${t.department || ""} ${t.description ? "— " + t.description : ""}`.slice(0, 50))}) Tj`,
        "ET",
        "BT",
        `/F2 7.5 Tf ${isIncome ? "0.06 0.72 0.50" : "0.94 0.25 0.37"} rg`,
        `450 ${y - 10} Td (${escapePdfText(amtStr)}) Tj`,
        "ET"
      );
      currentY -= 15.5;
    });
    currentY -= 6;
  } else {
    // Empty data state banner
    ensureSpace(48);
    curPage.push(
      "0.98 0.98 0.99 rg",
      `40 ${currentY - 36} 515.28 36 re f`,
      "0.88 0.90 0.95 rg",
      `40 ${currentY - 36} 515.28 36 re S`,
      "BT",
      "/F2 8.5 Tf 0.35 0.40 0.50 rg",
      `140 ${currentY - 18} Td (No financial records were found for the selected period.) Tj`,
      "ET",
      "BT",
      "/F1 7.5 Tf 0.55 0.60 0.70 rg",
      `175 ${currentY - 30} Td (All accounts and cost centers report zero transactions.) Tj`,
      "ET"
    );
    currentY -= 48;
  }

  // ─── 7. VERIFICATION SIGNATURES (Guaranteed Safe Placement) ───
  ensureSpace(85);
  const sigY = currentY - 72;
  curPage.push(
    "0.96 0.97 0.99 rg",
    `40 ${sigY} 515.28 68 re f`,
    "0.80 0.85 0.92 rg",
    `40 ${sigY} 515.28 68 re S`,
    // Signature 1
    "0.40 0.45 0.55 rg",
    `60 ${sigY + 30} 130 0.8 re f`,
    "BT",
    "/F2 7.5 Tf 0.10 0.15 0.30 rg",
    `60 ${sigY + 18} Td (${escapePdfText(generatedBy.slice(0, 22))}) Tj`,
    "ET",
    "BT",
    "/F1 6.5 Tf 0.45 0.50 0.60 rg",
    `60 ${sigY + 8} Td (Financial Controller / Auditor) Tj`,
    "ET",
    // Signature 2
    "0.40 0.45 0.55 rg",
    `230 ${sigY + 30} 130 0.8 re f`,
    "BT",
    "/F2 7.5 Tf 0.10 0.15 0.30 rg",
    `230 ${sigY + 18} Td (Executive Management) Tj`,
    "ET",
    "BT",
    "/F1 6.5 Tf 0.45 0.50 0.60 rg",
    `230 ${sigY + 8} Td (Financial Operations Authorization) Tj`,
    "ET",
    // Signature 3
    "0.40 0.45 0.55 rg",
    `400 ${sigY + 30} 130 0.8 re f`,
    "BT",
    "/F2 7.5 Tf 0.10 0.15 0.30 rg",
    `400 ${sigY + 18} Td (Compliance & Audit Board) Tj`,
    "ET",
    "BT",
    "/F1 6.5 Tf 0.45 0.50 0.60 rg",
    `400 ${sigY + 8} Td (Institutional Verification) Tj`,
    "ET"
  );
  currentY = sigY - 10;

  pushCurrentPage();

  // ─── 8. RUNNING FOOTERS & GRAPHICS STATE RESTORATION ───
  const totalPages = Math.max(pages.length, 1);
  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const pLines = pages[pIdx];
    pLines.push(
      // Running footer line
      "0.85 0.88 0.94 rg",
      "40 45 515.28 0.8 re f",
      "BT",
      "/F1 7 Tf 0.40 0.45 0.55 rg",
      `48 32 Td (${escapePdfText(orgName.slice(0, 32))} · Ref: ${escapePdfText(certId.slice(0, 16))} · Page ${pIdx + 1} of ${totalPages} · Generated ${escapePdfText(dateStr)} ${escapePdfText(timeStr)}) Tj`,
      "ET",
      "BT",
      "/F2 7 Tf 0.22 0.74 0.97 rg",
      `460 32 Td (GAAP / IFRS Certified) Tj`,
      "ET",
      "Q"
    );
  }

  // ─── 9. PDF 1.4 STANDARD SERIALIZATION ───
  const header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;

  // Object indices:
  // 1 0 obj: Catalog
  // 2 0 obj: Pages
  // 3 0 obj: Font F1 (Helvetica)
  // 4 0 obj: Font F2 (Helvetica-Bold)
  // For each page p:
  //   Page obj: 5 + p * 2
  //   Content obj: 6 + p * 2

  const pageKids = Array.from({ length: totalPages }, (_, i) => `${5 + i * 2} 0 R`).join(" ");
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [${pageKids}] /Count ${totalPages} >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
  const obj4 = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;

  const pageObjects: string[] = [];
  for (let p = 0; p < totalPages; p++) {
    const streamContent = pages[p].join("\n");
    const streamLength = typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(streamContent).length
      : Buffer.byteLength(streamContent, "utf8");

    const pageObjNum = 5 + p * 2;
    const streamObjNum = 6 + p * 2;

    const pageObj = `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObjNum} 0 R >>\nendobj\n`;
    const streamObj = `${streamObjNum} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
    pageObjects.push(pageObj, streamObj);
  }

  // Calculate byte offsets for XREF table
  const offsets: number[] = [0]; // dummy 0 for object 0
  let runningOffset = header.length;

  offsets.push(runningOffset); // obj 1
  runningOffset += obj1.length;

  offsets.push(runningOffset); // obj 2
  runningOffset += obj2.length;

  offsets.push(runningOffset); // obj 3
  runningOffset += obj3.length;

  offsets.push(runningOffset); // obj 4
  runningOffset += obj4.length;

  for (const objStr of pageObjects) {
    offsets.push(runningOffset);
    runningOffset += objStr.length;
  }

  const xrefOffset = runningOffset;
  const totalObjCount = 4 + totalPages * 2;

  let xref = `xref\n0 ${totalObjCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjCount; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer =
    `trailer\n` +
    `<< /Size ${totalObjCount + 1} /Root 1 0 R >>\n` +
    `startxref\n` +
    `${xrefOffset}\n` +
    `%%EOF\n`;

  return header + obj1 + obj2 + obj3 + obj4 + pageObjects.join("") + xref + trailer;
}

/**
 * Generates an Excel-compatible CSV Report
 */
export async function downloadCsvReport(
  input: ReportOptions | EnterpriseReportData
): Promise<{ success: boolean; uri?: string; filename?: string; message?: string }> {
  const data = normalizeToEnterpriseData(input);
  const { metadata, filters, executiveSummary, generalLedger, departmentFinancials, payrollSection } = data;
  const currency = metadata.currency;

  const rows: string[] = [
    `OFM OFFICIAL FINANCIAL REPORT & AUDIT DOSSIER`,
    `Organization,${escapeCsv(metadata.organizationName)}`,
    `Period,${escapeCsv(filters.periodLabel)} (${filters.startDate} to ${filters.endDate})`,
    `Generated By,${escapeCsv(metadata.generatedBy)} (${metadata.userRole})`,
    `Generated Date,${metadata.generatedDate} ${metadata.generatedTime}`,
    `Reference ID,${metadata.reportRefId}`,
    ``,
    `EXECUTIVE FINANCIAL SUMMARY`,
    `Metric,Amount (${currency}),Notes`,
    `Total Realized Revenue,+${executiveSummary.totalRevenue},All Inflow Streams`,
    `Total Operating Expenses,-${executiveSummary.totalExpenses},All Outflow Vouchers`,
    `Net Operating Balance,${executiveSummary.netOperatingBalance >= 0 ? "+" : ""}${executiveSummary.netOperatingBalance},${executiveSummary.netProfitMarginPct.toFixed(1)}% Net Margin`,
    `Budget Capacity Utilization,${executiveSummary.budgetUtilizationPct.toFixed(1)}%,Ceiling: ${executiveSummary.budgetTotal}`,
    `Total Staff Payroll,${executiveSummary.totalPayroll},${payrollSection.employeeCount} Staff Members`,
    ``,
  ];

  if (departmentFinancials.hasData) {
    rows.push(
      `DEPARTMENT FINANCIAL ALLOCATIONS`,
      `Department,Headcount,Allocated Budget,Actual Spent,Remaining,Utilization %`
    );
    departmentFinancials.departments.forEach((d) => {
      rows.push(
        `${escapeCsv(d.name)},${d.headcount},${d.allocatedBudget},${d.actualSpent},${d.remainingBudget},${d.utilizationPct}%`
      );
    });
    rows.push(``);
  }

  if (payrollSection.hasData && payrollSection.canViewDetails) {
    rows.push(
      `STAFF PAYROLL & REMUNERATION AUDIT`,
      `Employee Name,Employee ID,Department,Base Salary,Bonus,Deductions,Net Salary,Month,Status`
    );
    payrollSection.employees.forEach((p) => {
      rows.push(
        `${escapeCsv(p.employeeName)},${escapeCsv(p.employeeId)},${escapeCsv(p.department)},${p.baseSalary},${p.bonus},${p.deductions},${p.netSalary},${escapeCsv(p.month)},${escapeCsv(p.paymentStatus)}`
      );
    });
    rows.push(``);
  }

  if (generalLedger.hasData) {
    rows.push(
      `AUDITED GENERAL LEDGER TRANSACTIONS`,
      `Date,Type,Category,Department,Description,Added By,Amount (${currency})`
    );
    generalLedger.transactions.forEach((t) => {
      const isInc = t.type === "income";
      rows.push(
        `${escapeCsv(t.date)},${escapeCsv(t.type.toUpperCase())},${escapeCsv(t.category)},${escapeCsv(t.department)},${escapeCsv(t.description || "")},${escapeCsv(t.addedBy || "")},${isInc ? "+" : "-"}${t.amount}`
      );
    });
  }

  const csvContent = rows.join("\n");
  const filename = `OFM_${metadata.organizationName.replace(/\s+/g, "_")}_${data.reportType}_${new Date().toISOString().substring(0, 10)}.csv`;

  if (Platform.OS === "web") {
    try {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return { success: true, uri: url, filename };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  try {
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
    await Share.share({ title: filename, url: uri });
    return { success: true, uri, filename };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Opens PDF report preview and triggers download
 */
export async function openPdfReport(
  opts: ReportOptions | EnterpriseReportData
): Promise<void> {
  const res = await downloadFinancialReportPdf(opts as any);
  if (!res.success && Platform.OS !== "web") {
    console.warn("PDF generation notice:", res.error || res.message);
  }
}

export async function downloadPdfReport(
  opts: ReportOptions | EnterpriseReportData
): Promise<PdfExportResult> {
  return await downloadFinancialReportPdf(opts as any);
}

export async function sharePdfReport(
  opts: ReportOptions | EnterpriseReportData
): Promise<PdfExportResult> {
  return await downloadFinancialReportPdf(opts as any);
}

export { downloadPdfBinaryDirectly };
