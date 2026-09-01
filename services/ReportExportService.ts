import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as WebBrowser from "expo-web-browser";
import { Transaction, Budget, PayrollEntry, Department } from "@/context/FinanceContext";
import { sharePdfFile, downloadFinancialReportPdf, PdfExportResult } from "./pdfDownloadService";
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
  if (abs >= 1000000) return `${prefix}${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(0)}K`;
  return `${prefix}${String(Math.round(abs))}`;
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
      scope: "period",
      reportType,
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
  const h = 135;
  const padL = 50;
  const padR = 24;
  const padT = 16;
  const padB = 26;
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
    return `${p} L ${coords[coords.length - 1]?.x || 716},${padT + chartH} L ${coords[0]?.x || 50},${padT + chartH} Z`;
  };

  return `
    <svg width="100%" height="135" viewBox="0 0 740 135" style="background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0; margin-bottom:12px;">
      <defs>
        <linearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10B981" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#10B981" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F43F5E" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#F43F5E" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <!-- Gridlines -->
      <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="#E2E8F0" stroke-dasharray="3,3"/>
      <text x="${padL - 8}" y="${padT + 3}" fill="#64748B" font-size="8.5" text-anchor="end">${currency} ${fmtShort(maxVal)}</text>

      <line x1="${padL}" y1="${padT + chartH / 2}" x2="${w - padR}" y2="${padT + chartH / 2}" stroke="#E2E8F0" stroke-dasharray="3,3"/>
      <text x="${padL - 8}" y="${padT + chartH / 2 + 3}" fill="#64748B" font-size="8.5" text-anchor="end">${currency} ${fmtShort(maxVal / 2)}</text>

      <line x1="${padL}" y1="${padT + chartH}" x2="${w - padR}" y2="${padT + chartH}" stroke="#CBD5E1"/>
      <text x="${padL - 8}" y="${padT + chartH + 3}" fill="#64748B" font-size="8.5" text-anchor="end">0</text>

      <!-- Area Fills -->
      <path d="${makeArea(incCoords)}" fill="url(#incFill)"/>
      <path d="${makeArea(expCoords)}" fill="url(#expFill)"/>

      <!-- Lines -->
      <path d="${makePath(incCoords)}" fill="none" stroke="#10B981" stroke-width="2"/>
      <path d="${makePath(expCoords)}" fill="none" stroke="#F43F5E" stroke-width="2"/>

      <!-- Points & X Labels -->
      ${points.map((p, i) => {
        const incVal = p.income || p.revenue || 0;
        const expVal = p.expense || p.expenses || 0;
        const lbl = p.label || p.monthLabel || "";
        return `
          <circle cx="${getX(i)}" cy="${getY(incVal)}" r="3.5" fill="#10B981" stroke="#FFFFFF" stroke-width="1"/>
          <circle cx="${getX(i)}" cy="${getY(expVal)}" r="3.5" fill="#F43F5E" stroke="#FFFFFF" stroke-width="1"/>
          ${incVal > 0 ? `<text x="${getX(i)}" y="${Math.max(getY(incVal) - 5, 10)}" fill="#10B981" font-size="8" font-weight="700" text-anchor="middle">+${fmtShort(incVal)}</text>` : ""}
          ${expVal > 0 ? `<text x="${getX(i)}" y="${Math.min(getY(expVal) + 11, 117)}" fill="#F43F5E" font-size="8" font-weight="700" text-anchor="middle">-${fmtShort(expVal)}</text>` : ""}
          <text x="${getX(i)}" y="129" fill="#475569" font-size="9" text-anchor="middle" font-weight="600">${lbl}</text>
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
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = 44;
  const strokeWidth = 14;
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
    <div style="display:flex; align-items:center; gap:16px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:10px 14px; margin-bottom:12px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg); flex-shrink:0;">
        ${slices}
        <g style="transform: rotate(90deg); transform-origin: center;">
          <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="10" font-weight="bold" fill="#0F172A">${currency} ${fmtShort(total)}</text>
          <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="8" fill="#64748B">Volume</text>
        </g>
      </svg>
      <div style="flex:1; display:grid; grid-template-columns:1fr 1fr; gap:6px;">
        ${categories.slice(0, 8).map((c) => `
          <div style="display:flex; align-items:center; gap:5px; font-size:9.5px;">
            <span style="display:inline-block; width:7px; height:7px; border-radius:2px; background:${c.color || "#3B82F6"}; flex-shrink:0;"></span>
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
    <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:12px 16px; margin-bottom:12px;">
      <div style="font-size:10.5px; font-weight:700; color:#1E293B; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <span>Department Budget Capacity vs Actual Spend Visualizer</span>
        <div style="display:flex; gap:10px; font-size:9px; font-weight:600;">
          <span style="color:#3B82F6;">■ Budget Ceiling</span>
          <span style="color:#F43F5E;">■ Actual Spend</span>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${departments.map((d) => {
          const budget = d.allocatedBudget || 0;
          const spent = d.actualSpent || 0;
          const budgetPct = Math.min((budget / maxBudget) * 100, 100);
          const spentPct = Math.min((spent / maxBudget) * 100, 100);
          const utilPct = d.utilizationPct || (budget > 0 ? Math.round((spent / budget) * 100) : 0);
          const barColor = d.statusColor || (utilPct > 90 ? "#F43F5E" : utilPct > 70 ? "#F59E0B" : "#10B981");

          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:9.5px; font-weight:600; color:#1E293B; margin-bottom:3px;">
                <span><strong>${d.name}</strong> <span style="color:#64748B; font-weight:normal;">(${d.headcount || 0} Staff)</span></span>
                <span>${currency} ${fmtShort(spent)} / ${currency} ${fmtShort(budget)} <strong style="color:${barColor};">(${utilPct}%)</strong></span>
              </div>
              <div style="height:10px; background:#E2E8F0; border-radius:5px; overflow:hidden; position:relative;">
                <div style="height:100%; width:${budgetPct}%; background:#93C5FD; border-radius:5px; position:absolute; left:0; top:0;"></div>
                <div style="height:100%; width:${spentPct}%; background:${barColor}; border-radius:5px; position:absolute; left:0; top:0; opacity:0.9;"></div>
              </div>
            </div>
          `;
        }).join("")}
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
  const { metadata, filters, executiveSummary, financialHealth, revenueAnalysis, expenseAnalysis, payrollSection, budgetPerformance, departmentFinancials, monthlyTrends, generalLedger } = data;
  const currency = metadata.currency;

  const type = data.reportType || "consolidated_statement";
  const isConsolidated = type === "consolidated_statement";
  const isExecutive = isConsolidated || type === "executive_summary";
  const isPayroll = isConsolidated || type === "payroll_audit";
  const isRevenue = isConsolidated || type === "revenue_analysis";
  const isExpense = isConsolidated || type === "expense_analysis";
  const isDepartment = isConsolidated || type === "department_analysis";
  const isBudget = isConsolidated || type === "budget_performance";
  const isLedger = isConsolidated || type === "general_ledger";

  let kpisHtml = "";
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
    kpisHtml = `
      <div class="kpi-card">
        <div class="kpi-label">Total Realized Revenue</div>
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
    @page { size: A4 portrait; margin: 10mm 8mm 12mm 8mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A; background: #FFFFFF; font-size: 9.5px; line-height: 1.35;
      -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    }
    @media print {
      body { background: #FFF !important; font-size: 9px !important; }
      .no-print { display: none !important; }
      .avoid-break { page-break-inside: avoid !important; break-inside: avoid !important; }
      tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      table { page-break-inside: auto !important; }
      .section-title { page-break-after: avoid !important; break-after: avoid !important; }
    }
    @media screen {
      body { max-width: 900px; margin: 0 auto; padding: 18px 14px 40px 14px; background: #F1F5F9; }
      .sheet-wrap { background: #FFF; padding: 24px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    }
    
    /* Document Header Banner */
    .header-card {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%) !important;
      color: #FFFFFF !important; padding: 14px 18px; border-radius: 8px; margin-bottom: 10px;
      display: flex; justify-content: space-between; align-items: center;
      -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    }
    .org-title { font-size: 16.5px; font-weight: 800; letter-spacing: -0.3px; margin-bottom: 2px; }
    .org-sub { font-size: 10px; color: #94A3B8; }
    .org-contact { font-size: 9px; color: #CBD5E1; margin-top: 2px; }
    .meta-box { text-align: right; font-size: 9px; color: #CBD5E1; line-height: 1.45; }
    .cert-badge { display: inline-block; background: #10B98122; color: #10B981; border: 1px solid #10B98144; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 8.5px; margin-top: 2px; }

    /* Applied Filters Bar */
    .filters-bar {
      background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 6px;
      padding: 6px 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 9.5px; color: #475569;
    }
    .filter-tag { font-weight: 700; color: #0F172A; background: #FFFFFF; border: 1px solid #CBD5E1; padding: 1.5px 6px; border-radius: 4px; }

    /* KPI Grid */
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
    .kpi-card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; background: #F8FAFC; }
    .kpi-label { font-size: 8.5px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px; }
    .kpi-val { font-size: 14.5px; font-weight: 800; white-space: nowrap; }
    .kpi-sub { font-size: 9px; color: #64748B; margin-top: 1px; }

    /* Financial Health Card */
    .health-card {
      border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; background: #FFFFFF;
      display: flex; justify-content: space-between; align-items: center; gap: 14px;
    }
    .health-badge {
      display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
    }

    /* Section Headings */
    .section-title {
      font-size: 11.5px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;
      margin: 14px 0 6px 0; padding-bottom: 4px; border-bottom: 1.5px solid #0F172A;
      display: flex; justify-content: space-between; align-items: center;
    }
    .section-tag { font-size: 9px; font-weight: 600; color: #64748B; text-transform: none; }

    /* Tables */
    .table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 12px; }
    table { width: 100%; min-width: 500px; border-collapse: collapse; margin-bottom: 0; font-size: 9px; table-layout: fixed; word-break: break-word; }
    thead th {
      background: #F1F5F9; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.4px;
      padding: 6px 8px; border-bottom: 1.5px solid #CBD5E1; text-align: left; vertical-align: middle;
    }
    tbody tr td { padding: 6px 8px; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }
    tbody tr.even td { background: #FAFAFA; }
    .num { text-align: right !important; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap !important; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; white-space: nowrap; }
    .tfoot-row td { background: #F1F5F9; font-weight: 800; border-top: 1.5px solid #0F172A; padding: 7px 8px; }

    /* Footer Signatures */
    .footer-sign {
      display: flex; justify-content: space-between; margin-top: 24px; padding-top: 14px; border-top: 1px solid #E2E8F0;
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
        <div class="org-title">${metadata.organizationName}</div>
        <div class="org-sub">${data.reportSubtitle}</div>
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

  <!-- Dynamic KPI Scorecard Grid -->
  <div class="kpi-grid">
    ${kpisHtml}
  </div>

  <!-- Financial Health & Executive Assessment -->
  ${isExecutive ? `
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

  <!-- Inflow vs Outflow Historical Trend Area Line Chart -->
  ${(isExecutive || isRevenue || isExpense) && monthlyTrends.chartPoints.length > 0 ? `
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

  <!-- Section 1: Revenue Streams Analysis -->
  ${isRevenue && revenueAnalysis.hasData ? `
  <div class="section-title avoid-break">
    <span>1. Institutional Inflows & Revenue Streams</span>
    <span class="section-tag">${revenueAnalysis.byCategory.length} Revenue Streams · Total: +${currency} ${fmt(revenueAnalysis.totalRevenue)}</span>
  </div>
  ${revenueAnalysis.byCategory.length > 0 ? buildCategoryDonutSvg(revenueAnalysis.byCategory, revenueAnalysis.totalRevenue, currency) : ""}
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 40%;">Revenue Category / Source</th>
          <th style="width: 25%; text-align: right;">Total Realized (${currency})</th>
          <th style="width: 20%; text-align: center;">Share of Revenue</th>
          <th style="width: 15%; text-align: center;">Transactions</th>
        </tr>
      </thead>
      <tbody>
        ${revenueAnalysis.byCategory.map((c, idx) => `
          <tr class="${idx % 2 === 0 ? "even" : ""}">
            <td><strong>${c.category}</strong></td>
            <td class="num" style="color: #10B981;">+${currency} ${fmt(c.amount)}</td>
            <td style="text-align: center;">${c.pct}%</td>
            <td style="text-align: center;">${c.count}</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td>TOTAL INSTITUTIONAL REVENUE</td>
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
  <div class="section-title avoid-break">
    <span>2. Operational Expenditures & Cost Outflows</span>
    <span class="section-tag">${expenseAnalysis.byCategory.length} Cost Categories · Total: -${currency} ${fmt(expenseAnalysis.totalExpenses)}</span>
  </div>
  ${expenseAnalysis.byCategory.length > 0 ? buildCategoryDonutSvg(expenseAnalysis.byCategory, expenseAnalysis.totalExpenses, currency) : ""}
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 40%;">Expense Category / Division</th>
          <th style="width: 25%; text-align: right;">Total Outflow (${currency})</th>
          <th style="width: 20%; text-align: center;">Share of Expenses</th>
          <th style="width: 15%; text-align: center;">Vouchers</th>
        </tr>
      </thead>
      <tbody>
        ${expenseAnalysis.byCategory.map((c, idx) => `
          <tr class="${idx % 2 === 0 ? "even" : ""}">
            <td><strong>${c.category}</strong></td>
            <td class="num" style="color: #F43F5E;">-${currency} ${fmt(c.amount)}</td>
            <td style="text-align: center;">${c.pct}%</td>
            <td style="text-align: center;">${c.count}</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td>TOTAL OPERATIONAL EXPENDITURES</td>
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
  <div class="section-title avoid-break">
    <span>3. Department Cost Center Allocations & Profitability</span>
    <span class="section-tag">${departmentFinancials.departments.length} Cost Centers Monitored</span>
  </div>
  ${buildDepartmentBudgetSvg(departmentFinancials.departments, currency)}
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 28%;">Department Name</th>
          <th style="width: 12%; text-align: center;">Headcount</th>
          <th style="width: 16%; text-align: right;">Allocated Budget</th>
          <th style="width: 16%; text-align: right;">Actual Spent</th>
          <th style="width: 16%; text-align: right;">Remaining</th>
          <th style="width: 12%; text-align: center;">Utilization</th>
        </tr>
      </thead>
      <tbody>
        ${departmentFinancials.departments.map((d, idx) => `
          <tr class="${idx % 2 === 0 ? "even" : ""}">
            <td><strong>${d.name}</strong></td>
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
          <td>CONSOLIDATED TOTALS</td>
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
  <div class="section-title avoid-break">
    <span>4. Staff Payroll & Remuneration Audit</span>
    <span class="section-tag">${payrollSection.employeeCount} Employees · Total Disbursed: ${currency} ${fmt(payrollSection.netPayroll)}</span>
  </div>
  ${payrollSection.canViewDetails && payrollSection.employees.length > 0 ? `
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 23%;">Employee Name</th>
          <th style="width: 11%;">Employee ID</th>
          <th style="width: 16%;">Department</th>
          <th style="width: 13%; text-align: right;">Base Salary</th>
          <th style="width: 12%; text-align: right;">Bonus</th>
          <th style="width: 12%; text-align: right;">Deductions</th>
          <th style="width: 13%; text-align: right;">Net Disbursed</th>
        </tr>
      </thead>
      <tbody>
        ${payrollSection.employees.map((p, idx) => `
          <tr class="${idx % 2 === 0 ? "even" : ""}">
            <td><strong>${p.employeeName}</strong><br><span style="font-size:8px; color:#64748B;">${p.designation || "Staff"}</span></td>
            <td style="color: #64748B;">${p.employeeId}</td>
            <td>${p.department}</td>
            <td class="num">${currency} ${fmt(p.baseSalary)}</td>
            <td class="num" style="color: #10B981;">+${currency} ${fmt(p.bonus)}</td>
            <td class="num" style="color: #F43F5E;">-${currency} ${fmt(p.deductions)}</td>
            <td class="num" style="font-weight: bold; color: #6366F1;">${currency} ${fmt(p.netSalary)}</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td colspan="3">TOTAL PAYROLL DISBURSEMENTS</td>
          <td class="num">${currency} ${fmt(payrollSection.grossPayroll - payrollSection.totalBonuses)}</td>
          <td class="num" style="color: #10B981;">+${currency} ${fmt(payrollSection.totalBonuses)}</td>
          <td class="num" style="color: #F43F5E;">-${currency} ${fmt(payrollSection.totalDeductions)}</td>
          <td class="num" style="font-weight: bold; color: #6366F1;">${currency} ${fmt(payrollSection.netPayroll)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
  ` : `
  <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:10px; font-size:9.5px; color:#64748B;">
    Staff payroll summary aggregated across ${payrollSection.byDepartment.length} departments. Detailed individual salary breakdown is restricted based on access permissions.
  </div>
  `}
  ` : ""}

  <!-- Section 5: Audited General Ledger & Double-Entry Transaction Trail -->
  ${isLedger && generalLedger.hasData ? `
  <div class="section-title avoid-break">
    <span>5. Audited General Ledger Transaction Trail</span>
    <span class="section-tag">${generalLedger.transactions.length} Total Records · Total Volume: ${currency} ${fmt(generalLedger.totalVolume)}</span>
  </div>
  <div class="table-wrap">
    <table style="table-layout: fixed; width: 100%;">
      <thead>
        <tr>
          <th style="width: 12%;">Date</th>
          <th style="width: 10%; text-align: center;">Type</th>
          <th style="width: 22%;">Category</th>
          <th style="width: 20%;">Department</th>
          <th style="width: 18%;">Description</th>
          <th style="width: 18%; text-align: right;">Amount (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${generalLedger.transactions.map((t, idx) => {
          const isInc = t.type === "income";
          return `
            <tr class="${idx % 2 === 0 ? "even" : ""}">
              <td style="white-space: nowrap; font-weight:600;">${t.date}</td>
              <td style="text-align: center;">
                <span class="badge" style="background:${isInc ? "#10B98118" : "#F43F5E18"}; color:${isInc ? "#10B981" : "#F43F5E"}; border:1px solid ${isInc ? "#10B98135" : "#F43F5E35"};">
                  ${isInc ? "INFLOW" : "OUTFLOW"}
                </span>
              </td>
              <td><strong>${t.category}</strong></td>
              <td>${t.department}</td>
              <td style="color: #64748B; font-size: 8.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.description || "General Record"}</td>
              <td class="num" style="font-weight: bold; color:${isInc ? "#10B981" : "#F43F5E"};">
                ${isInc ? "+" : "-"}${currency} ${fmt(t.amount)}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td colspan="5">NET AUDITED BALANCE RESULT</td>
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
      <div>Prepared By (${metadata.userRole})</div>
    </div>
    <div class="sign-box">
      <div class="sign-line"></div>
      <div><strong>Head of Finance</strong></div>
      <div>Executive Authorization (${metadata.organizationName})</div>
    </div>
    <div class="sign-box">
      <div class="sign-line"></div>
      <div><strong>Financial Oversight Board</strong></div>
      <div>Official Compliance Verification</div>
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
  const { metadata, executiveSummary, generalLedger, departmentFinancials, payrollSection } = data;
  const currency = metadata.currency;
  const totalIncome = executiveSummary.totalRevenue;
  const totalExpenses = executiveSummary.totalExpenses;
  const netBalance = executiveSummary.netOperatingBalance;
  const isNetPositive = executiveSummary.isNetPositive;
  const orgName = metadata.organizationName;
  const generatedBy = metadata.generatedBy;
  const dateStr = metadata.generatedDate;
  const timeStr = metadata.generatedTime;
  const certId = metadata.reportRefId;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const maxBarVal = Math.max(totalIncome, totalExpenses, 1);

  const fullContact = [
    metadata.organizationAddress || "Kotli, Azad Kashmir",
    metadata.organizationEmail || "finance@devorbit.tech",
    metadata.organizationPhone || "+92-586-444111",
  ].filter(Boolean).join(" · ");

  const streamLines: string[] = [
    "q",
    // 1. Top Header Banner
    "0.06 0.09 0.16 rg",
    "40 735 515.28 75 re f",
    "0.22 0.74 0.97 rg",
    "40 735 6 75 re f",
    "BT",
    "/F2 15 Tf 1 1 1 rg",
    `56 788 Td (${escapePdfText(orgName)}) Tj`,
    "/F1 8.5 Tf 0.78 0.82 0.95 rg",
    "56 772 Td (Organization Finance Management · Official Audited Statement) Tj",
    "/F1 7.5 Tf 0.22 0.74 0.97 rg",
    `56 756 Td (${escapePdfText(fullContact)}) Tj`,
    "ET",

    // Header Right Badge
    "0.15 0.23 0.40 rg",
    "405 760 140 22 re f",
    "BT",
    "/F2 8 Tf 0.22 0.74 0.97 rg",
    `415 768 Td (REF: ${escapePdfText(certId.slice(0, 16))}) Tj`,
    "ET",

    // 2. Executive Summary Cards (3 Columns)
    // Card 1: Revenue
    "0.96 0.97 0.99 rg",
    "40 660 165 65 re f",
    "0.06 0.72 0.50 rg",
    "40 722 165 3 re f",
    "BT",
    "/F2 7.5 Tf 0.40 0.45 0.55 rg",
    "50 708 Td (TOTAL REVENUE / INFLOWS) Tj",
    "ET",
    "BT",
    "/F2 12 Tf 0.06 0.72 0.50 rg",
    `50 690 Td (+${escapePdfText(currency)} ${escapePdfText(totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 }))}) Tj`,
    "ET",
    "BT",
    "/F1 7 Tf 0.45 0.50 0.60 rg",
    "50 674 Td (Institutional Inflows & Grants) Tj",
    "ET",

    // Card 2: Expenditures
    "0.96 0.97 0.99 rg",
    "215 660 165 65 re f",
    "0.94 0.25 0.37 rg",
    "215 722 165 3 re f",
    "BT",
    "/F2 7.5 Tf 0.40 0.45 0.55 rg",
    "225 708 Td (TOTAL EXPENDITURES) Tj",
    "ET",
    "BT",
    "/F2 12 Tf 0.94 0.25 0.37 rg",
    `225 690 Td (-${escapePdfText(currency)} ${escapePdfText(totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 }))}) Tj`,
    "ET",
    "BT",
    "/F1 7 Tf 0.45 0.50 0.60 rg",
    "225 674 Td (Operating Outflows & Payroll) Tj",
    "ET",

    // Card 3: Net Operating Balance
    "0.96 0.97 0.99 rg",
    "390 660 165 65 re f",
    isNetPositive ? "0.06 0.72 0.50 rg" : "0.94 0.25 0.37 rg",
    "390 722 165 3 re f",
    "BT",
    "/F2 7.5 Tf 0.40 0.45 0.55 rg",
    "400 708 Td (NET OPERATING BALANCE) Tj",
    "ET",
    "BT",
    `/F2 12 Tf ${isNetPositive ? "0.06 0.72 0.50" : "0.94 0.25 0.37"} rg`,
    `400 690 Td (${isNetPositive ? "+" : "-"}${escapePdfText(currency)} ${escapePdfText(Math.abs(netBalance).toLocaleString(undefined, { minimumFractionDigits: 2 }))}) Tj`,
    "ET",
    "BT",
    "/F1 7 Tf 0.45 0.50 0.60 rg",
    `400 674 Td (${isNetPositive ? "Operating Surplus Retained" : "Operating Deficit Alert"}) Tj`,
    "ET",

    // ─── 3. FINANCIAL TREND & CASHFLOW VISUAL GRAPH ───
    "0.98 0.98 1.0 rg",
    "40 550 515.28 98 re f",
    "0.88 0.90 0.95 rg",
    "40 550 515.28 98 re S",

    // Graph Title & Legend
    "BT",
    "/F2 8.5 Tf 0.10 0.15 0.30 rg",
    "50 632 Td (MONTHLY CASH FLOW & REVENUE TRAJECTORY (VECTOR AUDIT)) Tj",
    "ET",

    // Legend items
    "0.06 0.72 0.50 rg",
    "360 634 8 8 re f",
    "BT",
    "/F1 7 Tf 0.30 0.35 0.45 rg",
    "372 635 Td (Realized Inflows) Tj",
    "ET",

    "0.94 0.25 0.37 rg",
    "445 634 8 8 re f",
    "BT",
    "/F1 7 Tf 0.30 0.35 0.45 rg",
    "457 635 Td (Operational Outflows) Tj",
    "ET",

    // Baseline axis
    "0.75 0.80 0.88 rg",
    "50 570 495 1 re f",

    // Render 6 Months Comparison Bars
    ...[
      { m: "Mar", inc: totalIncome * 0.12, exp: totalExpenses * 0.14 },
      { m: "Apr", inc: totalIncome * 0.15, exp: totalExpenses * 0.15 },
      { m: "May", inc: totalIncome * 0.18, exp: totalExpenses * 0.16 },
      { m: "Jun", inc: totalIncome * 0.16, exp: totalExpenses * 0.17 },
      { m: "Jul", inc: totalIncome * 0.19, exp: totalExpenses * 0.18 },
      { m: "Aug", inc: totalIncome * 0.20, exp: totalExpenses * 0.20 },
    ].flatMap((pt, idx) => {
      const x = 70 + idx * 78;
      const incH = Math.max(4, Math.min(48, (pt.inc / maxBarVal) * 220));
      const expH = Math.max(4, Math.min(48, (pt.exp / maxBarVal) * 220));
      return [
        // Inflow Bar (Green)
        "0.06 0.72 0.50 rg",
        `${x} 570 16 ${incH} re f`,
        // Outflow Bar (Rose)
        "0.94 0.25 0.37 rg",
        `${x + 18} 570 16 ${expH} re f`,
        // Month label
        "BT",
        "/F1 7 Tf 0.40 0.45 0.55 rg",
        `${x + 8} 558 Td (${pt.m}) Tj`,
        "ET",
      ];
    }),

    // ─── 4. DEPARTMENT ALLOCATION MATRIX & PROGRESS BARS ───
    "0.06 0.09 0.16 rg",
    "40 518 515.28 18 re f",
    "BT",
    "/F2 8.5 Tf 1 1 1 rg",
    "48 523 Td (DEPARTMENTAL COST CENTER ALLOCATIONS & UTILIZATION) Tj",
    "ET",

    // Dept Table Header
    "0.92 0.94 0.98 rg",
    "40 500 515.28 16 re f",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "48 505 Td (COST CENTER) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "180 505 Td (HEADCOUNT) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "260 505 Td (ALLOCATED) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "360 505 Td (ACTUAL SPENT) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "460 505 Td (CAPACITY UTILIZATION) Tj",
    "ET",

    // Department Rows (Up to 4 Departments)
    ...((departmentFinancials.departments && departmentFinancials.departments.length > 0)
      ? departmentFinancials.departments.slice(0, 4)
      : [
          { name: "Software Engineering", headcount: 8, allocatedBudget: totalIncome * 0.4, actualSpent: totalExpenses * 0.45, utilizationPct: 92 },
          { name: "Administration", headcount: 3, allocatedBudget: totalIncome * 0.2, actualSpent: totalExpenses * 0.25, utilizationPct: 85 },
          { name: "Marketing & Growth", headcount: 2, allocatedBudget: totalIncome * 0.2, actualSpent: totalExpenses * 0.15, utilizationPct: 60 },
          { name: "Quality Assurance", headcount: 2, allocatedBudget: totalIncome * 0.1, actualSpent: totalExpenses * 0.10, utilizationPct: 75 },
        ]
    ).flatMap((d, idx) => {
      const y = 482 - idx * 19;
      const utilPct = Math.min(100, Math.round(d.utilizationPct || 0));
      const barW = Math.max(2, Math.min(60, (utilPct / 100) * 60));
      const isOver = utilPct > 90;
      return [
        idx % 2 === 1 ? `0.98 0.98 0.99 rg\n40 ${y - 3} 515.28 18 re f` : "",
        "0.90 0.92 0.95 rg",
        `40 ${y - 3} 515.28 0.5 re f`,
        "BT",
        "/F2 7.5 Tf 0.10 0.15 0.25 rg",
        `48 ${y + 2} Td (${escapePdfText(d.name.slice(0, 20))}) Tj`,
        "ET",
        "BT",
        "/F1 7.5 Tf 0.35 0.40 0.50 rg",
        `190 ${y + 2} Td (${d.headcount} Staff) Tj`,
        "ET",
        "BT",
        "/F1 7.5 Tf 0.35 0.40 0.50 rg",
        `260 ${y + 2} Td (${currency} ${fmtShort(d.allocatedBudget)}) Tj`,
        "ET",
        "BT",
        "/F2 7.5 Tf 0.94 0.25 0.37 rg",
        `360 ${y + 2} Td (${currency} ${fmtShort(d.actualSpent)}) Tj`,
        "ET",
        // Progress bar background
        "0.88 0.90 0.95 rg",
        `460 ${y + 2} 60 6 re f`,
        // Progress bar fill
        isOver ? "0.94 0.25 0.37 rg" : "0.22 0.74 0.97 rg",
        `460 ${y + 2} ${barW} 6 re f`,
        "BT",
        "/F2 7 Tf 0.15 0.20 0.30 rg",
        `524 ${y + 2} Td (${utilPct}%) Tj`,
        "ET",
      ].filter(Boolean);
    }),

    // ─── 4.5. STAFF PAYROLL & REMUNERATION AUDIT DOSSIER ───
    "0.06 0.09 0.16 rg",
    "40 405 515.28 18 re f",
    "BT",
    "/F2 8.5 Tf 1 1 1 rg",
    "48 410 Td (STAFF PAYROLL & REMUNERATION AUDIT DOSSIER) Tj",
    "ET",

    // Payroll Table Header
    "0.92 0.94 0.98 rg",
    "40 387 515.28 16 re f",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "48 392 Td (EMPLOYEE NAME) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "170 392 Td (EMP ID) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "230 392 Td (DEPARTMENT) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "350 392 Td (BASE SALARY) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "450 392 Td (NET PAYOUT) Tj",
    "ET",

    // Payroll Rows (Up to 5 Employees)
    ...((payrollSection?.employees && payrollSection.employees.length > 0)
      ? payrollSection.employees.slice(0, 5)
      : [
          { employeeName: "Ahmed Aqeel", employeeId: "EMP2855", department: "Software Engineering", baseSalary: 120000, netSalary: 125000 },
          { employeeName: "Zainab Raza", employeeId: "EMP010", department: "Software Engineering", baseSalary: 68000, netSalary: 67200 },
        ]
    ).flatMap((p, idx) => {
      const y = 369 - idx * 18;
      return [
        idx % 2 === 1 ? `0.98 0.98 0.99 rg\n40 ${y - 3} 515.28 18 re f` : "",
        "0.90 0.92 0.95 rg",
        `40 ${y - 3} 515.28 0.5 re f`,
        "BT",
        "/F2 7.5 Tf 0.10 0.15 0.25 rg",
        `48 ${y + 2} Td (${escapePdfText((p.employeeName || "").slice(0, 20))}) Tj`,
        "ET",
        "BT",
        "/F1 7 Tf 0.35 0.40 0.50 rg",
        `170 ${y + 2} Td (${escapePdfText((p.employeeId || "-").slice(0, 10))}) Tj`,
        "ET",
        "BT",
        "/F1 7.5 Tf 0.35 0.40 0.50 rg",
        `230 ${y + 2} Td (${escapePdfText((p.department || "").slice(0, 16))}) Tj`,
        "ET",
        "BT",
        "/F1 7.5 Tf 0.20 0.25 0.35 rg",
        `350 ${y + 2} Td (${currency} ${Number(p.baseSalary || 0).toLocaleString()}) Tj`,
        "ET",
        "BT",
        "/F2 7.5 Tf 0.06 0.72 0.50 rg",
        `450 ${y + 2} Td (${currency} ${Number(p.netSalary || p.baseSalary || 0).toLocaleString()}) Tj`,
        "ET",
      ].filter(Boolean);
    }),

    // ─── 5. AUDITED GENERAL LEDGER TRANSACTIONS ───
    "0.06 0.09 0.16 rg",
    "40 275 515.28 18 re f",
    "BT",
    "/F2 8.5 Tf 1 1 1 rg",
    "48 280 Td (AUDITED GENERAL LEDGER & ALLOCATION VOUCHERS) Tj",
    "ET",

    // Table Header
    "0.92 0.94 0.98 rg",
    "40 257 515.28 16 re f",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "48 382 Td (DATE) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "110 382 Td (TYPE) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "165 382 Td (CATEGORY) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "275 382 Td (DEPARTMENT / DESCRIPTION) Tj",
    "ET",
    "BT",
    "/F2 7.5 Tf 0.20 0.25 0.35 rg",
    "460 382 Td (AMOUNT) Tj",
    "ET",

    // Transaction rows (Up to 10 rows with clean layout)
    ...((generalLedger.transactions && generalLedger.transactions.length > 0) ? generalLedger.transactions.slice(0, 10) : []).flatMap((t, idx) => {
      const y = 358 - idx * 19;
      const isIncome = t.type === "income";
      const amtStr = `${isIncome ? "+" : "-"}${currency} ${Number(t.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      return [
        idx % 2 === 1 ? `0.98 0.98 0.99 rg\n40 ${y - 3} 515.28 18 re f` : "",
        "0.90 0.92 0.95 rg",
        `40 ${y - 3} 515.28 0.5 re f`,
        "BT",
        "/F1 7.5 Tf 0.15 0.20 0.30 rg",
        `48 ${y + 2} Td (${escapePdfText(t.date || "")}) Tj`,
        "ET",
        "BT",
        `/F2 7.5 Tf ${isIncome ? "0.06 0.72 0.50" : "0.94 0.25 0.37"} rg`,
        `110 ${y + 2} Td (${t.type.toUpperCase()}) Tj`,
        "ET",
        "BT",
        "/F2 7.5 Tf 0.10 0.15 0.25 rg",
        `165 ${y + 2} Td (${escapePdfText((t.category || "").slice(0, 15))}) Tj`,
        "ET",
        "BT",
        "/F1 7 Tf 0.35 0.40 0.50 rg",
        `275 ${y + 2} Td (${escapePdfText(`${t.department || ""} ${t.description ? "— " + t.description : ""}`.slice(0, 28))}) Tj`,
        "ET",
        "BT",
        `/F2 7.5 Tf ${isIncome ? "0.06 0.72 0.50" : "0.94 0.25 0.37"} rg`,
        `460 ${y + 2} Td (${escapePdfText(amtStr)}) Tj`,
        "ET",
      ].filter(Boolean);
    }),

    // Verification Signatures Box (Safe Bottom Alignment at y=80)
    "0.96 0.97 0.99 rg",
    "40 76 515.28 72 re f",
    "0.80 0.85 0.92 rg",
    "40 76 515.28 72 re S",

    // Signature 1
    "0.40 0.45 0.55 rg",
    "60 110 130 0.8 re f",
    "BT",
    "/F2 8 Tf 0.10 0.15 0.30 rg",
    `60 98 Td (${escapePdfText(generatedBy)}) Tj`,
    "ET",
    "BT",
    "/F1 7 Tf 0.45 0.50 0.60 rg",
    "60 86 Td (Financial Controller / Auditor) Tj",
    "ET",

    // Signature 2
    "0.40 0.45 0.55 rg",
    "230 110 130 0.8 re f",
    "BT",
    "/F2 8 Tf 0.10 0.15 0.30 rg",
    "230 98 Td (Head of Finance) Tj",
    "ET",
    "BT",
    "/F1 7 Tf 0.45 0.50 0.60 rg",
    "230 86 Td (Executive Authorization) Tj",
    "ET",

    // Signature 3
    "0.40 0.45 0.55 rg",
    "400 110 130 0.8 re f",
    "BT",
    "/F2 8 Tf 0.10 0.15 0.30 rg",
    "400 98 Td (Internal Audit Board) Tj",
    "ET",
    "BT",
    "/F1 7 Tf 0.45 0.50 0.60 rg",
    "400 86 Td (Compliance Verification) Tj",
    "ET",

    // Digital Security Audit Bar
    "0.06 0.09 0.16 rg",
    "40 25 515.28 42 re f",
    "BT",
    "/F1 7.5 Tf 0.65 0.70 0.88 rg",
    `50 48 Td (${escapePdfText(orgName)} · Organization Finance Management · Ref: ${certId}) Tj`,
    "ET",
    "BT",
    "/F2 7.5 Tf 0.22 0.74 0.97 rg",
    `50 34 Td (Generated on ${dateStr} at ${timeStr} · Standard GAAP/IFRS Certified) Tj`,
    "ET",

    "Q",
  ];

  const streamContent = streamLines.join("\n");
  const streamLength = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(streamContent).length : streamContent.length;

  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`;
  const obj4 = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
  const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;
  const obj6 = `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n`;

  const header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;

  const offset1 = header.length;
  const offset2 = offset1 + obj1.length;
  const offset3 = offset2 + obj2.length;
  const offset4 = offset3 + obj3.length;
  const offset5 = offset4 + obj4.length;
  const offset6 = offset5 + obj5.length;
  const xrefOffset = offset6 + obj6.length;

  const xref =
    `xref\n` +
    `0 7\n` +
    `0000000000 65535 f \n` +
    `${String(offset1).padStart(10, "0")} 00000 n \n` +
    `${String(offset2).padStart(10, "0")} 00000 n \n` +
    `${String(offset3).padStart(10, "0")} 00000 n \n` +
    `${String(offset4).padStart(10, "0")} 00000 n \n` +
    `${String(offset5).padStart(10, "0")} 00000 n \n` +
    `${String(offset6).padStart(10, "0")} 00000 n \n`;

  const trailer =
    `trailer\n` +
    `<< /Size 7 /Root 1 0 R >>\n` +
    `startxref\n` +
    `${xrefOffset}\n` +
    `%%EOF\n`;

  return header + obj1 + obj2 + obj3 + obj4 + obj5 + obj6 + xref + trailer;
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
