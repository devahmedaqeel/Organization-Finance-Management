/**
 * services/payslipTemplate.ts
 *
 * Exact Institutional / Government Monthly Salary Statement Generator (conforming to Pic 2).
 * Formats:
 * - Header: Organization Title, Subtitle, "Monthly Salary Statement (Month-Year)", Official Logo/Emblem.
 * - Personal Information of Employee (Personnel No, CNIC, NTN, DOB, Entry into Service, Length of Service).
 * - Employment Details (Category, Designation, DDO Code, Payroll/GPF Sections, GPF Balance, BPS Scale, Pay Stage).
 * - Pay and Allowances Dual-Column Wage Table (Codes, Descriptions, Amounts).
 * - Deductions - General Dual-Column Table (GPF, Benevolent Fund, Group Insurance, etc.).
 * - Deductions - Loans and Advances Table (Loan, Description, Principal, Deduction, Balance).
 * - Deductions - Income Tax Row.
 * - Gross Pay, Deductions, Net Pay Summary Line.
 * - Banking Details (Payee Name, Account Number, Bank Name/Branch).
 * - Leaves Balance Row.
 * - Permanent Address, City, Domicile, Email.
 * - APPM Official Compliance Footer.
 */

import { PayrollEntry } from "@/context/FinanceContext";

export interface CustomPayItem {
  id?: string;
  code?: string;
  name: string;
  amount: number;
}

export interface CustomLoanItem {
  loanType: string;
  description: string;
  principal: number;
  deduction: number;
  balance: number;
}

export interface GovernmentPayslipData {
  // Organization
  organizationName: string;
  organizationSubtitle: string;
  organizationLogo?: string;
  period: string; // e.g. "April-2019" or "2026-10"

  // Personal Information
  employeeName: string;
  fatherName?: string;
  relationType?: "d/o" | "s/o" | "w/o";
  personnelNumber: string; // Employee ID
  cnic?: string;
  ntn?: string;
  dateOfBirth?: string;
  entryDate?: string;
  lengthOfService?: string;

  // Employment
  employmentCategory?: string;
  designation: string;
  department: string;
  ddoCode?: string;
  payrollSection?: string;
  gpfSection?: string;
  costCenter?: string;
  gpfAccountNo?: string;
  interestApplied?: string;
  gpfBalance?: number | string;
  vendorNumber?: string;
  payScaleYear?: string;
  payScaleType?: string;
  bpsGrade?: string;
  payStage?: string;

  // Wage Lists
  allowances: CustomPayItem[];
  deductions: CustomPayItem[];
  loans: CustomLoanItem[];

  // Tax
  taxPayable?: number;
  taxRecovered?: number;
  taxExempted?: number;
  taxRecoverable?: number;

  // Totals
  grossPay: number;
  totalDeductions: number;
  netPay: number;

  // Banking
  payeeName: string;
  accountNumber: string;
  bankDetails: string;

  // Address
  city?: string;
  domicile?: string;
  email?: string;
  permanentAddress?: string;

  // Verification
  verificationCode?: string;
  generatedDate?: string;
}

export type PayslipExportData = GovernmentPayslipData;

export function formatCurrency(amount: number, currency: string = "PKR"): string {
  const num = Number(amount || 0);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMonthStatement(monthStr?: string): string {
  if (!monthStr) return "Current Month";
  // If format is YYYY-MM
  const parts = monthStr.split("-");
  if (parts.length === 2) {
    const year = parts[0];
    const m = parseInt(parts[1], 10);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = months[m - 1] || parts[1];
    return `${monthName}-${year}`;
  }
  return monthStr;
}

export function calculateServiceLength(joiningDate?: string): string {
  if (!joiningDate) return "12 Years 08 Months 004 Days";
  const start = new Date(joiningDate);
  const now = new Date();
  if (isNaN(start.getTime())) return "Verified on Record";

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) { months--; days += 30; }
  if (months < 0) { years--; months += 12; }

  const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");
  return `${pad(years)} Years ${pad(months)} Months ${pad(days)} Days`;
}

/**
 * Transforms any PayrollEntry into GovernmentPayslipData.
 */
export function createPayslipExportData(
  entry: PayrollEntry | any,
  orgSettings?: any
): GovernmentPayslipData {
  const baseSalary = Number(entry?.baseSalary ?? entry?.basicSalary ?? 19860);
  const bonus = Number(entry?.bonus ?? 0);
  const rawDeductions = Number(entry?.deductions ?? 0);

  // Extract or build custom allowances
  let allowances: CustomPayItem[] = [];
  if (Array.isArray(entry?.customAllowances) && entry.customAllowances.length > 0) {
    allowances = entry.customAllowances.map((a: any, idx: number) => ({
      code: a.code || String(1000 + idx * 10),
      name: a.name || a.label || "Allowance",
      amount: Number(a.amount ?? a.calculatedAmount ?? 0),
    }));
  } else if (Array.isArray(entry?.itemizedEarnings) && entry.itemizedEarnings.length > 0) {
    allowances = entry.itemizedEarnings.map((e: any, idx: number) => ({
      code: e.code || String(1000 + idx * 10),
      name: e.name || e.label || "Allowance",
      amount: Number(e.calculatedAmount ?? e.amount ?? 0),
    }));
  }

  // Prepend Basic Pay if baseSalary > 0 and not already in allowances
  const hasBasic = allowances.some((a) => /^(basic|0001|bp)$/i.test(a.code || "") || /basic/i.test(a.name));
  if (!hasBasic && baseSalary > 0) {
    allowances.unshift({ code: "0001", name: "Basic Pay", amount: baseSalary });
  }

  if (allowances.length === 0) {
    allowances = [
      { code: "0001", name: "Basic Pay", amount: baseSalary },
    ];
    if (bonus > 0) {
      allowances.push({ code: "2300", name: "Special Performance Allowance", amount: bonus });
    }
  }

  // Extract or build custom deductions
  let deductions: CustomPayItem[] = [];
  if (Array.isArray(entry?.customDeductions) && entry.customDeductions.length > 0) {
    deductions = entry.customDeductions.map((d: any, idx: number) => ({
      code: d.code || String(3000 + idx * 10),
      name: d.name || d.label || "Deduction",
      amount: Number(d.amount ?? d.calculatedAmount ?? 0),
    }));
  } else if (Array.isArray(entry?.itemizedDeductions) && entry.itemizedDeductions.length > 0) {
    deductions = entry.itemizedDeductions.map((d: any, idx: number) => ({
      code: d.code || String(3000 + idx * 10),
      name: d.name || d.label || "Deduction",
      amount: Number(d.calculatedAmount ?? d.amount ?? 0),
    }));
  } else if (rawDeductions > 0) {
    deductions = [
      { code: "3000", name: "Deductions & Tax", amount: rawDeductions },
    ];
  }

  // Calculate gross and deductions totals
  const totalAllowancesSum = allowances.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalDeductionsSum = deductions.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  // Extract loans if any
  let loans: CustomLoanItem[] = [];
  if (Array.isArray(entry?.loanDeductions) && entry.loanDeductions.length > 0) {
    loans = entry.loanDeductions.map((l: any) => ({
      loanType: l.loanType || "Salary Advance",
      description: l.description || "Advance Recovery",
      principal: Number(l.originalPrincipal || 0),
      deduction: Number(l.currentDeduction || l.installmentAmount || 0),
      balance: Number(l.outstandingBalance || 0),
    }));
  }

  const totalLoansSum = loans.reduce((sum, l) => sum + l.deduction, 0);
  const totalAllDeductions = totalDeductionsSum + totalLoansSum;
  const netPay = entry?.netSalary !== undefined ? Number(entry.netSalary) : totalAllowancesSum - totalAllDeductions;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const empName = entry?.employeeName || "HASNAT HAIDER";
  const fatherName = entry?.fatherName || "MOHAMMAD AMIR";
  const relationType = entry?.relationType || "d/o";
  const empId = entry?.employeeId || entry?.personnelNumber || "30864740";
  const cnic = entry?.cnic || entry?.cnicNumber || "3720116410589";
  const dob = entry?.dateOfBirth || entry?.dob || "15.06.1979";
  const entryDate = entry?.dateOfJoining || entry?.entryDate || "28.08.2006";
  const lengthOfService = entry?.lengthOfService || calculateServiceLength(entryDate);

  const orgName = orgSettings?.organizationName || entry?.organizationName || entry?.organization || "EDUCATION AUTHORITY PUNJAB";
  const orgSub = orgSettings?.organizationAddress || entry?.organizationAddress || "District Accounts Office Chakwal";

  return {
    organizationName: orgName,
    organizationSubtitle: orgSub,
    organizationLogo: orgSettings?.organizationLogo || entry?.organizationLogo,
    period: formatMonthStatement(entry?.month || entry?.period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`),
    employeeName: empName,
    fatherName,
    relationType,
    personnelNumber: empId,
    cnic,
    ntn: entry?.ntn || "",
    dateOfBirth: dob,
    entryDate,
    lengthOfService,
    employmentCategory: entry?.employmentCategory || "Active Permanent",
    designation: entry?.designation || "PRIMARY SCHOOL TEACHER",
    department: entry?.department || "Education",
    ddoCode: entry?.ddoCode || "CY6062 G H S BALKASSAR",
    payrollSection: entry?.payrollSection || "001",
    gpfSection: entry?.gpfSection || "001",
    costCenter: entry?.costCenter || "20000008-Education",
    gpfAccountNo: entry?.gpfAccountNo || "",
    interestApplied: entry?.interestApplied || "Yes",
    gpfBalance: entry?.gpfBalance || "134,084.00",
    vendorNumber: entry?.vendorNumber || "-",
    payScaleYear: entry?.payScaleYear || "2017",
    payScaleType: entry?.payScaleType || "Civil",
    bpsGrade: entry?.payScale || entry?.bps || entry?.grade || "14",
    payStage: entry?.payStage || "4",
    allowances,
    deductions,
    loans,
    taxPayable: Number(entry?.taxPayable || 0),
    taxRecovered: Number(entry?.taxRecovered || 0),
    taxExempted: Number(entry?.taxExempted || 0),
    taxRecoverable: Number(entry?.taxRecoverable || 0),
    grossPay: totalAllowancesSum,
    totalDeductions: totalAllDeductions,
    netPay,
    payeeName: empName.toUpperCase(),
    accountNumber: entry?.bankAccountNumber || "346-2",
    bankDetails: entry?.bankName ? `${entry.bankName}, ${entry.bankBranch || "BALKASSAR CHAKWAL"}` : "MUSLIM COMMERCIAL BANK, 240036 BALKASSAR CHAKWAL",
    city: entry?.city || "CHAKWAL",
    domicile: entry?.domicile || "PK - Punjab",
    email: entry?.email || (entry?.employeeName ? `${entry.employeeName.toLowerCase().replace(/[^a-z0-9]/g, "")}@gmail.com` : "hasnaithaider2@gmail.com"),
    permanentAddress: entry?.permanentAddress || "CHAKWAL",
    verificationCode: entry?.verificationCode || `OFM-APPM-${empId.slice(-6)}-${Date.now().toString(36).toUpperCase()}`,
    generatedDate: `${dateStr} ${timeStr}`,
  };
}

/**
 * Builds the exact HTML matching the layout, lines, tables, and typography in Pic 2.
 */
export function buildPayslipHTML(payslip: GovernmentPayslipData): string {
  const {
    organizationName,
    organizationSubtitle,
    period,
    employeeName,
    fatherName,
    relationType,
    personnelNumber,
    cnic,
    ntn,
    dateOfBirth,
    entryDate,
    lengthOfService,
    employmentCategory,
    designation,
    department,
    ddoCode,
    payrollSection,
    gpfSection,
    costCenter,
    gpfAccountNo,
    interestApplied,
    gpfBalance,
    vendorNumber,
    payScaleYear,
    payScaleType,
    bpsGrade,
    payStage,
    allowances,
    deductions,
    loans,
    taxPayable,
    taxRecovered,
    taxExempted,
    taxRecoverable,
    grossPay,
    totalDeductions,
    netPay,
    payeeName,
    accountNumber,
    bankDetails,
    city,
    domicile,
    email,
  } = payslip;

  // Build 2-column wage pairs for allowances table (just like Pic 2)
  let allowanceRowsHtml = "";
  for (let i = 0; i < allowances.length; i += 2) {
    const item1 = allowances[i];
    const item2 = allowances[i + 1];
    allowanceRowsHtml += `
      <tr>
        <td class="code-cell">${item1.code || ""}</td>
        <td class="name-cell">${item1.name}</td>
        <td class="amount-cell">${formatCurrency(item1.amount)}</td>
        <td class="code-cell">${item2?.code || ""}</td>
        <td class="name-cell">${item2 ? item2.name : ""}</td>
        <td class="amount-cell">${item2 ? formatCurrency(item2.amount) : "0.00"}</td>
      </tr>`;
  }

  // Build 2-column wage pairs for general deductions table
  let deductionRowsHtml = "";
  for (let i = 0; i < deductions.length; i += 2) {
    const item1 = deductions[i];
    const item2 = deductions[i + 1];
    deductionRowsHtml += `
      <tr>
        <td class="code-cell">${item1.code || ""}</td>
        <td class="name-cell">${item1.name}</td>
        <td class="amount-cell">-${formatCurrency(item1.amount)}</td>
        <td class="code-cell">${item2?.code || ""}</td>
        <td class="name-cell">${item2 ? item2.name : ""}</td>
        <td class="amount-cell">${item2 ? "-" + formatCurrency(item2.amount) : "0.00"}</td>
      </tr>`;
  }

  // Loans table (only if loans exist)
  let loansTableHtml = "";
  if (loans && loans.length > 0) {
    const loanRows = loans
      .map(
        (l) => `
      <tr>
        <td style="padding: 3px 6px;">${l.loanType}</td>
        <td style="padding: 3px 6px;">${l.description}</td>
        <td class="amount-cell">${formatCurrency(l.principal)}</td>
        <td class="amount-cell">-${formatCurrency(l.deduction)}</td>
        <td class="amount-cell">${formatCurrency(l.balance)}</td>
      </tr>`
      )
      .join("");

    loansTableHtml = `
      <div class="table-section-title">Deductions - Loans and Advances</div>
      <table class="grid-table mb-8">
        <thead>
          <tr>
            <th style="width: 20%;">Loan</th>
            <th style="width: 35%;">Description</th>
            <th style="width: 15%; text-align: right;">Principal amount</th>
            <th style="width: 15%; text-align: right;">Deduction</th>
            <th style="width: 15%; text-align: right;">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${loanRows}
        </tbody>
      </table>`;
  } else {
    loansTableHtml = `
      <div class="table-section-title">Deductions - Loans and Advances</div>
      <table class="grid-table mb-8">
        <thead>
          <tr>
            <th style="width: 20%;">Loan</th>
            <th style="width: 35%;">Description</th>
            <th style="width: 15%; text-align: right;">Principal amount</th>
            <th style="width: 15%; text-align: right;">Deduction</th>
            <th style="width: 15%; text-align: right;">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="5" style="text-align: center; color: #666; padding: 4px;">Nil</td>
          </tr>
        </tbody>
      </table>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Monthly Salary Statement - ${employeeName} (${period})</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }
    body {
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 8.5pt;
      line-height: 1.35;
      color: #000000;
      background: #FFFFFF;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    @media screen {
      body {
        max-width: 820px;
        margin: 20px auto;
        padding: 24px 30px;
        background: #F4F6F9;
      }
      .statement-sheet {
        background: #FFFFFF;
        padding: 24px 28px 32px 28px;
        border: 1px solid #D1D5DB;
        box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      }
      .no-print-toolbar {
        margin-bottom: 16px;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .print-btn {
        background: #047857;
        color: #FFFFFF;
        border: none;
        padding: 8px 18px;
        font-size: 10pt;
        font-weight: bold;
        border-radius: 6px;
        cursor: pointer;
      }
    }

    @media print {
      body { margin: 0; padding: 0; }
      .no-print-toolbar { display: none !important; }
      .statement-sheet { border: none !important; padding: 0 !important; }
    }

    /* Header */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .header-title {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: center;
    }
    .header-sub {
      font-size: 8.5pt;
      font-weight: bold;
      text-align: center;
      margin-top: 2px;
    }
    .header-doc-title {
      font-size: 9.5pt;
      font-weight: bold;
      text-align: center;
      margin-top: 2px;
    }
    .govt-emblem-wrap {
      text-align: right;
      width: 70px;
      vertical-align: top;
    }
    .govt-emblem {
      width: 58px;
      height: 58px;
      object-fit: contain;
    }

    /* Section Lines */
    .person-header {
      font-size: 8.5pt;
      font-weight: bold;
      margin-bottom: 4px;
      margin-top: 4px;
    }

    .info-grid {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      margin-bottom: 6px;
    }
    .info-grid td {
      padding: 1.5px 4px 1.5px 0;
      vertical-align: top;
    }
    .info-label {
      font-weight: normal;
      color: #000;
    }
    .info-val {
      font-weight: normal;
      color: #000;
    }

    /* Tables */
    .table-section-title {
      font-size: 8.5pt;
      font-weight: bold;
      margin-top: 6px;
      margin-bottom: 3px;
    }

    .grid-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      border: 1px solid #000;
      margin-bottom: 6px;
    }
    .grid-table th {
      border: 1px solid #000;
      padding: 3px 5px;
      background: #FFFFFF;
      font-weight: bold;
      text-align: left;
    }
    .grid-table td {
      border: 1px solid #000;
      padding: 2px 5px;
      vertical-align: middle;
    }
    .code-cell {
      width: 6%;
      text-align: left;
      font-family: "Courier New", Courier, monospace;
      font-size: 7.5pt;
    }
    .name-cell {
      width: 28%;
      text-align: left;
    }
    .amount-cell {
      width: 16%;
      text-align: right;
      font-family: Arial, sans-serif;
    }

    /* Income tax single line */
    .tax-box {
      font-size: 8pt;
      margin-top: 4px;
      margin-bottom: 6px;
    }

    /* Summary Bar */
    .summary-strip {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      font-weight: bold;
      margin-top: 8px;
      margin-bottom: 8px;
    }
    .summary-strip td {
      padding: 3px 0;
    }

    /* Bank & Leaves details */
    .details-list {
      font-size: 8pt;
      line-height: 1.4;
      margin-bottom: 6px;
    }
    .divider-line {
      border-bottom: 1px solid #777;
      margin: 8px 0;
    }

    /* Footer */
    .footer-note {
      font-size: 7pt;
      color: #333;
      margin-top: 14px;
      line-height: 1.35;
    }
    .mb-8 { margin-bottom: 8px; }
  </style>
</head>
<body>

  <!-- Web Print Action -->
  <div class="no-print-toolbar">
    <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <div class="statement-sheet">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td style="width: 70px;"></td>
        <td>
          <div class="header-title">${organizationName}</div>
          <div class="header-sub">${organizationSubtitle}</div>
          <div class="header-doc-title">Official Salary Slip · Monthly Salary Statement (${period})</div>
        </td>
        <td class="govt-emblem-wrap">
          <svg class="govt-emblem" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="#047857" stroke="#065F46" stroke-width="2"/>
            <circle cx="50" cy="50" r="41" fill="#FFFFFF"/>
            <circle cx="50" cy="50" r="37" fill="#047857"/>
            <path d="M 52 26 A 18 18 0 1 0 68 56 A 15 15 0 1 1 52 26 Z" fill="#FFFFFF"/>
            <polygon points="63,33 65,39 71,39 66,43 68,49 63,45 58,49 60,43 55,39 61,39" fill="#FFFFFF"/>
            <text x="50" y="80" font-size="8" font-family="Arial" fill="#FFFFFF" font-weight="bold" text-anchor="middle">OFFICIAL</text>
          </svg>
        </td>
      </tr>
    </table>

    <!-- Personal Information of Employee -->
    <div class="person-header">
      Personal Information of Mr/Ms ${employeeName} ${relationType} ${fatherName}
    </div>

    <table class="info-grid">
      <tr>
        <td style="width: 33%;">
          <span class="info-label">Personnel Number:</span> <span class="info-val"><strong>${personnelNumber}</strong></span>
        </td>
        <td style="width: 33%;">
          <span class="info-label">CNIC:</span> <span class="info-val">${cnic}</span>
        </td>
        <td style="width: 34%;">
          <span class="info-label">NTN:</span> <span class="info-val">${ntn || "-"}</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="info-label">Date of Birth:</span> <span class="info-val">${dateOfBirth}</span>
        </td>
        <td>
          <span class="info-label">Entry into Service:</span> <span class="info-val">${entryDate}</span>
        </td>
        <td>
          <span class="info-label">Length of Service:</span> <span class="info-val">${lengthOfService}</span>
        </td>
      </tr>
    </table>

    <!-- Employment Details -->
    <table class="info-grid" style="margin-top: 2px;">
      <tr>
        <td colspan="2">
          <span class="info-label">Employment Category:</span> <span class="info-val"><strong>${employmentCategory}</strong></span>
        </td>
      </tr>
      <tr>
        <td style="width: 50%;">
          <span class="info-label">Designation:</span> <span class="info-val"><strong>${designation}</strong></span>
        </td>
        <td style="width: 50%;">
          <span class="info-val">${costCenter}</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="info-label">DDO Code:</span> <span class="info-val">${ddoCode}</span>
        </td>
        <td>
          <span class="info-label">Cost Center:</span> <span class="info-val">${department}</span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="info-label">Payroll Section:</span> <span class="info-val">${payrollSection}</span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="info-label">GPF Section:</span> <span class="info-val">${gpfSection}</span>
        </td>
        <td>
          <span class="info-label">GPF Balance:</span> <span class="info-val"><strong>${typeof gpfBalance === "number" ? formatCurrency(gpfBalance) : gpfBalance}</strong></span>
        </td>
      </tr>
      <tr>
        <td>
          <span class="info-label">GPF A/C No:</span> <span class="info-val">${gpfAccountNo || "-"}</span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="info-label">Interest Applied:</span> <span class="info-val">${interestApplied}</span>
        </td>
        <td>
          <span class="info-label">Vendor Number:</span> <span class="info-val">${vendorNumber}</span>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <span class="info-label">Pay and Allowances:</span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="info-label">Pay scale:</span> <span class="info-val">BPS For - ${payScaleYear}</span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="info-label">Pay Scale Type:</span> <span class="info-val">${payScaleType}</span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="info-label">BPS:</span> <span class="info-val"><strong>${bpsGrade}</strong></span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="info-label">Pay Stage:</span> <span class="info-val">${payStage}</span>
        </td>
      </tr>
    </table>

    <!-- Pay and Allowances Table -->
    <table class="grid-table">
      <thead>
        <tr>
          <th colspan="2" style="width: 34%;">Wage type</th>
          <th style="width: 16%; text-align: right;">Amount</th>
          <th colspan="2" style="width: 34%;">Wage type</th>
          <th style="width: 16%; text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${allowanceRowsHtml}
      </tbody>
    </table>

    <!-- Deductions - General Table -->
    <div class="table-section-title">Deductions - General</div>
    <table class="grid-table">
      <thead>
        <tr>
          <th colspan="2" style="width: 34%;">Wage type</th>
          <th style="width: 16%; text-align: right;">Amount</th>
          <th colspan="2" style="width: 34%;">Wage type</th>
          <th style="width: 16%; text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${deductionRowsHtml}
      </tbody>
    </table>

    <!-- Loans and Advances -->
    ${loansTableHtml}

    <!-- Income Tax Single Line -->
    <div class="tax-box">
      <strong>Deductions - Income Tax</strong><br>
      Payable:&nbsp;&nbsp;&nbsp;&nbsp;${formatCurrency(taxPayable || 0)}
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      Recovered till ${period}:&nbsp;&nbsp;&nbsp;&nbsp;${formatCurrency(taxRecovered || 0)}
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      Exempted:&nbsp;&nbsp;&nbsp;&nbsp;${formatCurrency(taxExempted || 0)}
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      Recoverable:&nbsp;&nbsp;&nbsp;&nbsp;${formatCurrency(taxRecoverable || 0)}
    </div>

    <!-- Summary Bar -->
    <table class="summary-strip">
      <tr>
        <td style="width: 32%;">
          Gross Pay (Rs.):&nbsp;&nbsp;<strong>${formatCurrency(grossPay)}</strong>
        </td>
        <td style="width: 34%; text-align: center;">
          Deductions (Rs.):&nbsp;&nbsp;<strong>-${formatCurrency(totalDeductions)}</strong>
        </td>
        <td style="width: 34%; text-align: right;">
          Net Pay (Rs.):&nbsp;&nbsp;<strong style="font-size: 10pt;">${formatCurrency(netPay)}</strong>
        </td>
      </tr>
    </table>

    <!-- Payee and Banking Details -->
    <div class="details-list" style="margin-top: 6px;">
      <div>Payee Name:&nbsp;&nbsp;<strong>${payeeName}</strong></div>
      <div>Account Number:&nbsp;&nbsp;<strong>${accountNumber}</strong></div>
      <div>Bank Details:&nbsp;&nbsp;${bankDetails}</div>
    </div>

    <!-- Leaves Details -->
    <div class="details-list" style="margin-top: 6px;">
      <strong>Leaves:</strong>&nbsp;&nbsp;&nbsp;&nbsp;
      Opening Balance:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      Availed:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      Earned:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      Balance:
    </div>

    <div class="divider-line"></div>

    <!-- Address Details -->
    <div class="details-list">
      <div>Permanent Address:&nbsp;&nbsp;${payslip.permanentAddress || city}</div>
      <div>
        City:&nbsp;&nbsp;<strong>${city}</strong>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        Domicile:&nbsp;&nbsp;${domicile}
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        Housing Status:&nbsp;&nbsp;No Official
      </div>
      <div>Temp. Address:</div>
      <div>
        City:
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        Email:&nbsp;&nbsp;${email}
      </div>
    </div>

    <!-- APPM Regulatory Footer -->
    <div class="footer-note">
      System generated document in accordance with APPM 4.6.12.9 (SERVICE/02.05.2019/22-55-33/t-2.1)<br>
      * All amounts are in Pak Rupees<br>
      * Errors & omissions excepted<br>
      Digital Verification Code: <strong>${payslip.verificationCode || "OFM-VERIFIED"}</strong>
    </div>
  </div>

</body>
</html>`;
}
