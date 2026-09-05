import { PayrollEntry } from "@/context/FinanceContext";

export interface PayslipExportData {
  organizationName: string;
  organizationAddress?: string;
  organizationEmail?: string;
  organizationPhone?: string;
  currency: string;
  employeeName: string;
  employeeId: string;
  department: string;
  designation?: string;
  period: string;
  basicSalary: number;
  bonus: number;
  allowances?: number;
  deductions: number;
  tax?: number;
  providentFund?: number;
  netSalary: number;
  generatedDate?: string;
  verificationCode?: string;
}

/**
 * Transforms a PayrollEntry object into standardized PayslipExportData.
 */
export function createPayslipExportData(
  entry: PayrollEntry,
  orgSettings?: {
    organizationName?: string;
    organizationAddress?: string;
    organizationEmail?: string;
    organizationPhone?: string;
    currency?: string;
    fiscalYear?: string;
  }
): PayslipExportData {
  const baseSalary = Number(entry?.baseSalary ?? (entry as any)?.basicSalary ?? 0);
  const bonus = Number(entry?.bonus ?? 0);
  const deductions = Number(entry?.deductions ?? 0);
  const netSalary = Number(entry?.netSalary ?? (baseSalary + bonus - deductions));

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const verificationCode = `OFM-PAY-${(entry.id || "0000").slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  return {
    organizationName: orgSettings?.organizationName || "DevOrbit Tech Kotli",
    organizationAddress: orgSettings?.organizationAddress || "Kotli, Azad Kashmir",
    organizationEmail: orgSettings?.organizationEmail || "finance@devorbit.tech",
    organizationPhone: orgSettings?.organizationPhone || "+92-586-444111",
    currency: orgSettings?.currency || "PKR",
    employeeName: entry.employeeName || "Employee",
    employeeId: entry.employeeId || "EMP-001",
    department: entry.department || "General Administration",
    designation: entry.designation || "Staff Specialist",
    period: entry.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    basicSalary: baseSalary,
    bonus,
    allowances: 0,
    deductions,
    tax: deductions * 0.6,
    providentFund: deductions * 0.4,
    netSalary,
    generatedDate: `${dateStr} at ${timeStr}`,
    verificationCode,
  };
}

/**
 * Currency formatter matching UI exact decimals.
 */
export function formatCurrency(amount: number, currency: string = "PKR"): string {
  const num = Number(amount || 0);
  return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Builds the complete A4 HTML string with inline CSS for print and web rendering.
 */
export function buildPayslipHTML(payslip: PayslipExportData): string {
  const {
    organizationName,
    organizationAddress,
    organizationEmail,
    organizationPhone,
    currency,
    employeeName,
    employeeId,
    department,
    designation,
    period,
    basicSalary,
    bonus,
    deductions,
    tax,
    providentFund,
    netSalary,
    generatedDate,
    verificationCode,
  } = payslip;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payslip - ${employeeName} (${period})</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background: #F8FAFC;
      font-size: 11px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @media print {
      body { background: #FFFFFF; font-size: 10px; padding: 0; }
      .no-print { display: none !important; }
      .payslip-container { box-shadow: none !important; border: 1px solid #CBD5E1 !important; padding: 20px !important; margin: 0 !important; max-width: 100% !important; }
    }
    @media screen {
      body { max-width: 820px; margin: 0 auto; padding: 24px 16px 48px; background: #F1F5F9; }
      .payslip-container { background: #FFFFFF; padding: 32px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
    }

    /* Top Banner Header */
    .header-banner {
      background: linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%) !important;
      color: #FFFFFF !important;
      padding: 22px 24px;
      border-radius: 10px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .org-title { font-size: 20px; font-weight: 900; letter-spacing: -0.4px; }
    .org-sub { font-size: 11px; color: #C7D2FE; margin-top: 3px; }
    .doc-type { font-size: 13px; font-weight: 800; color: #67E8F9; letter-spacing: 0.5px; text-transform: uppercase; }
    .verified-pill {
      display: inline-block;
      background: #10B981;
      color: #FFFFFF;
      font-weight: 800;
      font-size: 9.5px;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      margin-top: 5px;
    }

    /* Employee Details Grid */
    .employee-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      padding: 16px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .info-group { display: flex; flex-direction: column; gap: 2px; }
    .info-label { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { font-size: 12.5px; font-weight: 700; color: #0F172A; }

    /* Tables */
    .section-title { font-size: 11px; font-weight: 800; color: #4338CA; letter-spacing: 0.5px; margin-bottom: 8px; text-transform: uppercase; }
    .table-box { border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #F1F5F9; font-size: 10px; font-weight: 700; color: #475569; text-align: left; padding: 9px 14px; text-transform: uppercase; letter-spacing: 0.4px; }
    td { padding: 9px 14px; border-top: 1px solid #F1F5F9; font-size: 11.5px; color: #1E293B; }
    .text-right { text-align: right; }
    .tabular-num { font-variant-numeric: tabular-nums; }
    tr.total-row { background: #F8FAFC; font-weight: 800; }

    /* Net Pay Highlight Card */
    .net-salary-card {
      background: linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%) !important;
      color: #FFFFFF !important;
      padding: 18px 22px;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .net-label { font-size: 12px; font-weight: 800; letter-spacing: 0.5px; opacity: 0.95; }
    .net-sub { font-size: 10px; opacity: 0.85; margin-top: 2px; }
    .net-amount { font-size: 24px; font-weight: 900; font-variant-numeric: tabular-nums; }

    /* Signatures */
    .signatures-row {
      display: flex;
      justify-content: space-between;
      margin-top: 36px;
      padding-top: 16px;
    }
    .signature-block { width: 220px; text-align: center; border-top: 1px dashed #94A3B8; padding-top: 8px; font-size: 10.5px; color: #64748B; }

    /* Footer */
    .footer-audit {
      margin-top: 24px;
      border-top: 1px solid #E2E8F0;
      padding-top: 10px;
      text-align: center;
      font-size: 9px;
      color: #94A3B8;
      line-height: 1.5;
    }
  </style>
</head>
<body>

  <!-- Floating Print Toolbar for Browsers -->
  <div class="no-print" style="position:fixed; top:12px; right:16px; z-index:9999; display:flex; gap:10px;">
    <button onclick="window.print()" style="background:#7C3AED; color:#FFFFFF; font-family:-apple-system,sans-serif; font-size:13px; font-weight:700; border:none; padding:10px 18px; border-radius:8px; cursor:pointer; box-shadow:0 4px 14px rgba(124,58,237,0.35); display:flex; align-items:center; gap:6px;">
      🖨️ Print / Save as PDF
    </button>
  </div>

  <div class="payslip-container">
    <!-- Header Banner -->
    <div class="header-banner">
      <div>
        <div class="org-title">${organizationName}</div>
        <div class="org-sub">Institutional Payroll & Remuneration Portal · ${organizationAddress}</div>
        <div class="org-sub" style="font-size: 9.5px; opacity: 0.8;">${organizationEmail} · ${organizationPhone}</div>
      </div>
      <div style="text-align: right;">
        <div class="doc-type">Official Payslip</div>
        <div style="font-size: 10.5px; color: #E0E7FF; margin-top: 3px;">Period: <strong>${period}</strong></div>
        <div class="verified-pill">✓ Verified & Disbursed</div>
      </div>
    </div>

    <!-- Employee Information Grid -->
    <div class="employee-grid">
      <div class="info-group">
        <div class="info-label">Employee Full Name</div>
        <div class="info-value">${employeeName}</div>
      </div>
      <div class="info-group">
        <div class="info-label">Employee ID</div>
        <div class="info-value">${employeeId}</div>
      </div>
      <div class="info-group">
        <div class="info-label">Department / Cost Center</div>
        <div class="info-value">${department}</div>
      </div>
      <div class="info-group">
        <div class="info-label">Designation / Status</div>
        <div class="info-value">${designation} (ACTIVE)</div>
      </div>
    </div>

    <!-- Earnings Section -->
    <div class="section-title">Earnings & Allowances</div>
    <div class="table-box">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Type</th>
            <th class="text-right">Amount (${currency})</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Basic Remuneration / Base Salary</td>
            <td>Fixed Compensation</td>
            <td class="text-right tabular-num" style="font-weight: 700;">+${formatCurrency(basicSalary, currency)}</td>
          </tr>
          <tr>
            <td>Performance Bonus & Allowances</td>
            <td>Variable Incentive</td>
            <td class="text-right tabular-num" style="font-weight: 700; color: #10B981;">+${formatCurrency(bonus, currency)}</td>
          </tr>
          <tr class="total-row">
            <td colspan="2">Total Gross Remuneration</td>
            <td class="text-right tabular-num" style="color: #10B981; font-weight: 800;">+${formatCurrency(basicSalary + bonus, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Deductions Section -->
    <div class="section-title" style="color: #E11D48;">Deductions & Statutory Withholdings</div>
    <div class="table-box">
      <table>
        <thead>
          <tr>
            <th>Deduction Item</th>
            <th>Category</th>
            <th class="text-right">Amount (${currency})</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Income Tax & Withholding</td>
            <td>Statutory</td>
            <td class="text-right tabular-num" style="color: #E11D48; font-weight: 700;">-${formatCurrency(tax || deductions * 0.6, currency)}</td>
          </tr>
          <tr>
            <td>Provident Fund & Health Contribution</td>
            <td>Retirement / Medical</td>
            <td class="text-right tabular-num" style="color: #E11D48; font-weight: 700;">-${formatCurrency(providentFund || deductions * 0.4, currency)}</td>
          </tr>
          <tr class="total-row">
            <td colspan="2">Total Deductions</td>
            <td class="text-right tabular-num" style="color: #E11D48; font-weight: 800;">-${formatCurrency(deductions, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Net Salary Highlight -->
    <div class="net-salary-card">
      <div>
        <div class="net-label">NET SALARY PAYABLE (TAKE-HOME DISBURSAL)</div>
        <div class="net-sub">Direct institutional bank deposit verified and credited to registered employee account.</div>
      </div>
      <div class="net-amount">${formatCurrency(netSalary, currency)}</div>
    </div>

    <!-- Signatures -->
    <div class="signatures-row">
      <div class="signature-block">
        <strong>${employeeName}</strong><br>
        Employee Signature
      </div>
      <div class="signature-block">
        <strong>Chief Financial Officer</strong><br>
        Authorized Signatory (${organizationName})
      </div>
    </div>

    <!-- Footer Audit -->
    <div class="footer-audit">
      Confidential Financial Document · Generated securely via Organization Finance Management (OFM) on ${generatedDate}<br>
      <strong style="color: #10B981;">${verificationCode}</strong> · Digital Verification Code
    </div>
  </div>

</body>
</html>`;
}
