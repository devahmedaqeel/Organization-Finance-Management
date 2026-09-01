/**
 * services/pdfTemplates/payslipTemplate.ts
 *
 * Professional HTML Template for Official Payslips.
 * Designed with A4 print CSS, exact color reproduction, and high-fidelity typography.
 */

import { PayrollEntry } from "@/context/FinanceContext";
import { OrganizationInfo } from "@/services/payslipPdfService";

export function buildPayslipHtml(payslip: PayrollEntry, orgInfo?: OrganizationInfo): string {
  const orgName = orgInfo?.name || payslip.organization || "DevOrbit Tech Kotli";
  const orgAddress = orgInfo?.address || "Kotli, Azad Kashmir";
  const orgEmail = orgInfo?.email || "finance@devorbit.tech";
  const currency = orgInfo?.currency || "PKR";

  const baseSalary = Number(payslip.baseSalary || 0);
  const bonus = Number(payslip.bonus || 0);
  const deductions = Number(payslip.deductions || 0);
  const netSalary = Number(payslip.netSalary || (baseSalary + bonus - deductions));

  const now = new Date();
  const printDate = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const verificationCode = `OFM-${(payslip.id || "0000").slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payslip - ${payslip.employeeName}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background: #FFFFFF;
      line-height: 1.4;
      font-size: 13px;
      padding: 10px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #3B82F6;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .org-title {
      font-size: 22px;
      font-weight: 800;
      color: #1E293B;
      letter-spacing: -0.5px;
    }
    .org-sub {
      color: #64748B;
      font-size: 12px;
      margin-top: 2px;
    }
    .doc-badge {
      text-align: right;
    }
    .doc-title {
      font-size: 20px;
      font-weight: 800;
      color: #3B82F6;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-period {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      margin-top: 2px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    .info-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 14px;
    }
    .info-card h4 {
      font-size: 11px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 12.5px;
    }
    .info-row:last-child {
      margin-bottom: 0;
    }
    .info-label {
      color: #64748B;
    }
    .info-value {
      font-weight: 600;
      color: #0F172A;
    }
    .table-section {
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: #1E293B;
      color: #FFFFFF;
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 14px;
      text-align: left;
    }
    th.num, td.num {
      text-align: right;
    }
    td {
      padding: 10px 14px;
      border-bottom: 1px solid #E2E8F0;
      font-size: 12.5px;
    }
    tr:nth-child(even) td {
      background: #F8FAFC;
    }
    .payout-hero {
      background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
      color: #FFFFFF;
      border-radius: 8px;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .payout-label {
      font-size: 13px;
      font-weight: 600;
      color: #94A3B8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .payout-amount {
      font-size: 26px;
      font-weight: 800;
      color: #10B981;
      letter-spacing: -0.5px;
    }
    .footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #64748B;
    }
    .status-stamp {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      background: #DCFCE7;
      color: #166534;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="org-title">${orgName}</div>
      <div class="org-sub">${orgAddress} · ${orgEmail}</div>
    </div>
    <div class="doc-badge">
      <div class="doc-title">Official Payslip</div>
      <div class="doc-period">Period: ${payslip.month}</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="info-card">
      <h4>Employee Identification</h4>
      <div class="info-row">
        <span class="info-label">Full Name:</span>
        <span class="info-value">${payslip.employeeName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Employee ID:</span>
        <span class="info-value">${payslip.employeeId}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Department:</span>
        <span class="info-value">${payslip.department}</span>
      </div>
    </div>

    <div class="info-card">
      <h4>Payment & Disbursal Details</h4>
      <div class="info-row">
        <span class="info-label">Disbursal Status:</span>
        <span class="status-stamp">Disbursed / Paid</span>
      </div>
      <div class="info-row">
        <span class="info-label">Statement Date:</span>
        <span class="info-value">${printDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Auth Code:</span>
        <span class="info-value">${verificationCode}</span>
      </div>
    </div>
  </div>

  <div class="table-section">
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Classification</th>
          <th class="num">Amount (${currency})</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Basic Remuneration</strong></td>
          <td>Contractual Base</td>
          <td class="num">${currency} ${baseSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td><strong>Performance Incentives & Allowances</strong></td>
          <td>Earnings Addition</td>
          <td class="num">+${currency} ${bonus.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td><strong>Statutory & Operational Deductions</strong></td>
          <td>Payroll Withholding</td>
          <td class="num" style="color: #EF4444;">-${currency} ${deductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="payout-hero">
    <div>
      <div class="payout-label">Net Take-Home Disbursal</div>
      <div style="font-size: 11px; color: #94A3B8; margin-top: 2px;">Direct Electronic Fund Transfer</div>
    </div>
    <div class="payout-amount">${currency} ${netSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
  </div>

  <div class="footer">
    <div>Generated by Organization Finance Management (OFM) · Secure System Verification</div>
    <div>Page 1 of 1</div>
  </div>
</body>
</html>`;
}
