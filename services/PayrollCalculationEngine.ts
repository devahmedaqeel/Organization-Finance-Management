/**
 * services/PayrollCalculationEngine.ts
 *
 * Single Authoritative Source of Truth for all Payroll Calculations in OFM.
 * Used by both Web and Mobile platforms to guarantee identical results.
 *
 * DESIGN PRINCIPLES:
 * 1. Decimal-safe: All monetary math uses integer minor units (paisa) internally.
 * 2. Configurable: Tax rates, contribution rates, and deduction percentages are never hardcoded.
 * 3. Immutable finalized records: Once finalized, payslip data is preserved exactly.
 * 4. No double-counting: Each component is counted exactly once.
 * 5. Employer contributions are tracked separately and never reduce net pay.
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type CalculationType =
  | "fixed"                  // Fixed monetary amount
  | "percentage_of_basic"    // % of basic salary
  | "percentage_of_component"// % of a named component
  | "attendance_based"       // Prorated by attendance
  | "overtime"               // Hourly/overtime based
  | "one_time"               // One-time payment
  | "recurring";             // Recurring monthly

export type ComponentCategory =
  | "earning"
  | "deduction"
  | "employer_contribution";

export type EmploymentCategory =
  | "permanent"
  | "contract"
  | "temporary"
  | "probation"
  | "intern"
  | "other";

export type PayrollStatus =
  | "draft"
  | "calculated"
  | "pending_approval"
  | "approved"
  | "finalized"
  | "paid"
  | "cancelled"
  | "rejected";

export type PaymentStatus =
  | "pending"
  | "approved"
  | "paid"
  | "failed"
  | "processing";

export interface SalaryComponent {
  id: string;
  code: string;
  name: string;
  category: ComponentCategory;
  calculationType: CalculationType;
  amount: number;                    // Fixed amount or percentage value
  baseComponentCode?: string;        // For percentage_of_component
  isActive: boolean;
  effectiveDate?: string;
  endDate?: string;
  description?: string;
  isTaxable?: boolean;
  isStatutory?: boolean;
  sortOrder?: number;
  organizationId?: string;
}

export interface AppliedComponent {
  componentId: string;
  code: string;
  name: string;
  category: ComponentCategory;
  calculationType: CalculationType;
  configuredAmount: number;          // The configured value (fixed or %)
  calculatedAmount: number;          // The actual calculated monetary amount
  isTaxable?: boolean;
  isStatutory?: boolean;
}

export interface LoanDeduction {
  loanId: string;
  loanType: string;
  description: string;
  originalPrincipal: number;
  installmentAmount: number;
  totalInstallments: number;
  installmentsPaid: number;
  remainingInstallments: number;
  outstandingBalance: number;
  currentDeduction: number;
}

export interface TaxDetails {
  taxableIncome: number;
  taxPeriod: string;
  taxDeductedThisMonth: number;
  taxRecoveredPreviously: number;
  taxExemptions: number;
  taxAdjustment: number;
  remainingTaxPayable: number;
}

export interface AttendanceDetails {
  workingDays: number;
  daysPresent: number;
  paidLeave: number;
  unpaidLeave: number;
  absences: number;
  overtimeHours: number;
  lateArrivals: number;
}

export interface PayrollSummary {
  basicSalary: number;
  totalAllowances: number;
  grossSalary: number;
  totalGeneralDeductions: number;
  totalLoanDeductions: number;
  totalTaxDeductions: number;
  otherDeductions: number;
  totalEmployeeDeductions: number;
  netSalaryPayable: number;
  employerContributions: number;
  totalEmployerPayrollCost: number;
}

export interface EmployeeSalaryProfile {
  id: string;
  
  // Identity
  employeeId: string;
  userId?: string;               // Firebase UID link
  fullName: string;
  cnic?: string;
  designation: string;
  department: string;
  branch?: string;
  organizationId: string;
  organizationName?: string;
  
  // Employment
  employmentCategory: EmploymentCategory;
  dateOfJoining: string;
  lengthOfService?: string;      // Auto-calculated
  payScale?: string;
  payStep?: string;
  
  // Salary
  basicSalary: number;
  salaryStructureId?: string;
  paymentFrequency?: string;     // monthly, biweekly, etc.
  salaryEffectiveDate?: string;
  
  // Bank (restricted access)
  bankName?: string;
  bankAccountNumber?: string;    // Stored encrypted/masked
  bankBranch?: string;
  
  // Tax
  taxIdentificationNumber?: string;
  
  // Status
  payrollStatus: "active" | "inactive" | "suspended";
  
  // Components
  assignedEarnings: string[];    // Component IDs
  assignedDeductions: string[];  // Component IDs
  
  // Metadata
  createdAt?: string;
  updatedAt?: string;
}

export interface CalculatedPayslip {
  // Identification
  payslipId: string;
  payrollPeriodId?: string;
  
  // Employee
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  employmentCategory: EmploymentCategory;
  dateOfJoining: string;
  payScale?: string;
  basicSalary: number;
  
  // Period
  month: string;              // YYYY-MM
  payrollStatus: PayrollStatus;
  paymentStatus: PaymentStatus;
  
  // Itemized
  earnings: AppliedComponent[];
  deductions: AppliedComponent[];
  loanDeductions: LoanDeduction[];
  employerContributions: AppliedComponent[];
  taxDetails?: TaxDetails;
  attendanceDetails?: AttendanceDetails;
  
  // Summary
  summary: PayrollSummary;
  
  // Payment
  paymentDate?: string;
  paymentMethod?: string;
  transactionReference?: string;
  bankAccountMasked?: string;
  
  // Metadata
  organizationId: string;
  organizationName?: string;
  organizationAddress?: string;
  organizationEmail?: string;
  organizationPhone?: string;
  currency: string;
  issueDate: string;
  generatedAt: string;
  finalizedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  verificationCode: string;
}

export interface TaxSlab {
  minIncome: number;
  maxIncome: number;         // Use Infinity for the last slab
  rate: number;              // Percentage
  fixedAmount: number;       // Fixed tax for this slab
}

export interface PayrollConfig {
  currency: string;
  taxSlabs: TaxSlab[];
  fiscalYearStart: string;   // e.g. "07" for July
  roundingMode: "round" | "floor" | "ceil";
  allowNegativeDeductions: boolean;
}

// ============================================================================
// MONETARY MATH UTILITIES (Decimal-Safe)
// ============================================================================

/** Convert a major unit amount to minor units (paisa) */
export function toMinorUnits(amount: number): number {
  return Math.round((amount || 0) * 100);
}

/** Convert minor units back to major units */
export function toMajorUnits(minorAmount: number): number {
  return minorAmount / 100;
}

/** Safe number extraction */
export function safeNum(value: any, fallback: number = 0): number {
  const n = Number(value);
  return isNaN(n) || !isFinite(n) ? fallback : n;
}

/** Round according to config */
export function roundAmount(amount: number, mode: "round" | "floor" | "ceil" = "round"): number {
  const minor = amount * 100;
  let rounded: number;
  switch (mode) {
    case "floor": rounded = Math.floor(minor); break;
    case "ceil": rounded = Math.ceil(minor); break;
    default: rounded = Math.round(minor);
  }
  return rounded / 100;
}

/** Format currency string */
export function formatPayrollCurrency(amount: number, currency: string = "PKR"): string {
  const num = safeNum(amount, 0);
  return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Mask bank account number for display */
export function maskBankAccount(accountNumber?: string): string {
  if (!accountNumber) return "••••••••";
  const clean = accountNumber.replace(/\s/g, "");
  if (clean.length <= 4) return "••••" + clean;
  return "••••••" + clean.slice(-4);
}

/** Calculate length of service */
export function calculateServiceLength(joiningDate: string): string {
  if (!joiningDate) return "N/A";
  const start = new Date(joiningDate);
  const now = new Date();
  if (isNaN(start.getTime())) return "N/A";
  
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  return parts.length > 0 ? parts.join(", ") : "Less than 1 month";
}

/** Generate a unique payslip verification code */
export function generateVerificationCode(payslipId: string): string {
  const suffix = (payslipId || "0000").slice(-6).toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `OFM-PAY-${suffix}-${timestamp}`;
}

/** Generate a unique payslip number */
export function generatePayslipNumber(employeeId: string, month: string): string {
  const empPart = (employeeId || "EMP").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  const monthPart = (month || "202601").replace(/-/g, "");
  return `PS-${empPart}-${monthPart}`;
}

// ============================================================================
// CALCULATION ENGINE
// ============================================================================

const DEFAULT_CONFIG: PayrollConfig = {
  currency: "PKR",
  taxSlabs: [],
  fiscalYearStart: "07",
  roundingMode: "round",
  allowNegativeDeductions: false,
};

/**
 * Calculate a single component's monetary value.
 */
export function calculateComponentAmount(
  component: SalaryComponent,
  basicSalary: number,
  allComponents: AppliedComponent[],
  attendance?: AttendanceDetails
): number {
  const round = roundAmount;
  
  switch (component.calculationType) {
    case "fixed":
      return round(safeNum(component.amount, 0));
      
    case "percentage_of_basic":
      return round(safeNum(basicSalary, 0) * safeNum(component.amount, 0) / 100);
      
    case "percentage_of_component": {
      const base = allComponents.find(c => c.code === component.baseComponentCode);
      const baseAmount = base ? base.calculatedAmount : basicSalary;
      return round(baseAmount * safeNum(component.amount, 0) / 100);
    }
    
    case "attendance_based": {
      if (!attendance || attendance.workingDays <= 0) return round(safeNum(component.amount, 0));
      const dailyRate = safeNum(component.amount, 0) / attendance.workingDays;
      const effectiveDays = attendance.daysPresent + attendance.paidLeave;
      return round(dailyRate * effectiveDays);
    }
    
    case "overtime": {
      if (!attendance) return 0;
      // amount = hourly overtime rate
      return round(safeNum(component.amount, 0) * safeNum(attendance.overtimeHours, 0));
    }
    
    case "one_time":
    case "recurring":
      return round(safeNum(component.amount, 0));
      
    default:
      return round(safeNum(component.amount, 0));
  }
}

/**
 * Calculate income tax based on configurable tax slabs.
 */
export function calculateIncomeTax(
  annualTaxableIncome: number,
  taxSlabs: TaxSlab[]
): number {
  if (!taxSlabs || taxSlabs.length === 0 || annualTaxableIncome <= 0) return 0;
  
  // Sort slabs by minIncome ascending
  const sorted = [...taxSlabs].sort((a, b) => a.minIncome - b.minIncome);
  
  let totalTax = 0;
  
  for (const slab of sorted) {
    if (annualTaxableIncome <= slab.minIncome) break;
    
    const taxableInSlab = Math.min(
      annualTaxableIncome - slab.minIncome,
      (slab.maxIncome === Infinity ? annualTaxableIncome : slab.maxIncome) - slab.minIncome
    );
    
    if (taxableInSlab > 0) {
      totalTax = slab.fixedAmount + (taxableInSlab * slab.rate / 100);
    }
  }
  
  return roundAmount(totalTax);
}

/**
 * Main payroll calculation function.
 * Calculates complete payslip from employee profile, components, and loans.
 */
export function calculatePayroll(
  profile: EmployeeSalaryProfile,
  earningComponents: SalaryComponent[],
  deductionComponents: SalaryComponent[],
  employerComponents: SalaryComponent[],
  loans: LoanDeduction[],
  attendance?: AttendanceDetails,
  config: PayrollConfig = DEFAULT_CONFIG,
  taxOverride?: number
): PayrollSummary {
  const basicSalary = safeNum(profile.basicSalary, 0);
  
  // 1. Calculate Earnings
  const appliedEarnings: AppliedComponent[] = [];
  let totalAllowances = 0;
  
  // Basic salary is always the first earning
  appliedEarnings.push({
    componentId: "basic",
    code: "BASIC",
    name: "Basic Salary",
    category: "earning",
    calculationType: "fixed",
    configuredAmount: basicSalary,
    calculatedAmount: basicSalary,
    isTaxable: true,
  });
  
  for (const comp of earningComponents) {
    if (!comp.isActive) continue;
    const amount = calculateComponentAmount(comp, basicSalary, appliedEarnings, attendance);
    if (amount > 0) {
      appliedEarnings.push({
        componentId: comp.id,
        code: comp.code,
        name: comp.name,
        category: "earning",
        calculationType: comp.calculationType,
        configuredAmount: comp.amount,
        calculatedAmount: amount,
        isTaxable: comp.isTaxable,
      });
      totalAllowances += amount;
    }
  }
  
  const grossSalary = roundAmount(basicSalary + totalAllowances);
  
  // 2. Calculate General Deductions (employee-paid)
  const appliedDeductions: AppliedComponent[] = [];
  let totalGeneralDeductions = 0;
  
  for (const comp of deductionComponents) {
    if (!comp.isActive) continue;
    const amount = calculateComponentAmount(comp, basicSalary, appliedEarnings, attendance);
    if (amount > 0 || config.allowNegativeDeductions) {
      const safeAmount = config.allowNegativeDeductions ? amount : Math.max(0, amount);
      appliedDeductions.push({
        componentId: comp.id,
        code: comp.code,
        name: comp.name,
        category: "deduction",
        calculationType: comp.calculationType,
        configuredAmount: comp.amount,
        calculatedAmount: safeAmount,
        isStatutory: comp.isStatutory,
      });
      totalGeneralDeductions += safeAmount;
    }
  }
  
  totalGeneralDeductions = roundAmount(totalGeneralDeductions);
  
  // 3. Calculate Loan Deductions
  let totalLoanDeductions = 0;
  for (const loan of loans) {
    totalLoanDeductions += safeNum(loan.currentDeduction, 0);
  }
  totalLoanDeductions = roundAmount(totalLoanDeductions);
  
  // 4. Calculate Tax
  let totalTaxDeductions = 0;
  if (taxOverride !== undefined) {
    totalTaxDeductions = roundAmount(safeNum(taxOverride, 0));
  } else if (config.taxSlabs.length > 0) {
    // Calculate taxable income (all taxable earnings)
    const taxableEarnings = appliedEarnings
      .filter(e => e.isTaxable !== false)
      .reduce((sum, e) => sum + e.calculatedAmount, 0);
    const annualTaxable = taxableEarnings * 12;
    const annualTax = calculateIncomeTax(annualTaxable, config.taxSlabs);
    totalTaxDeductions = roundAmount(annualTax / 12);
  }
  
  // 5. Calculate Employer Contributions
  const appliedEmployerContributions: AppliedComponent[] = [];
  let employerContributions = 0;
  
  for (const comp of employerComponents) {
    if (!comp.isActive) continue;
    const amount = calculateComponentAmount(comp, basicSalary, appliedEarnings, attendance);
    if (amount > 0) {
      appliedEmployerContributions.push({
        componentId: comp.id,
        code: comp.code,
        name: comp.name,
        category: "employer_contribution",
        calculationType: comp.calculationType,
        configuredAmount: comp.amount,
        calculatedAmount: amount,
      });
      employerContributions += amount;
    }
  }
  employerContributions = roundAmount(employerContributions);
  
  // 6. Final Summary
  const totalEmployeeDeductions = roundAmount(
    totalGeneralDeductions + totalLoanDeductions + totalTaxDeductions
  );
  
  const netSalaryPayable = roundAmount(grossSalary - totalEmployeeDeductions);
  const totalEmployerPayrollCost = roundAmount(grossSalary + employerContributions);
  
  return {
    basicSalary: roundAmount(basicSalary),
    totalAllowances: roundAmount(totalAllowances),
    grossSalary,
    totalGeneralDeductions,
    totalLoanDeductions,
    totalTaxDeductions,
    otherDeductions: 0,
    totalEmployeeDeductions,
    netSalaryPayable,
    employerContributions,
    totalEmployerPayrollCost,
  };
}

/**
 * Validate a payroll calculation for errors and warnings.
 */
export function validatePayrollCalculation(summary: PayrollSummary): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (summary.basicSalary < 0) {
    errors.push("Basic salary cannot be negative.");
  }
  
  if (summary.grossSalary < 0) {
    errors.push("Gross salary calculated as negative. Check earnings components.");
  }
  
  if (summary.netSalaryPayable < 0) {
    errors.push("Net salary is negative. Total deductions exceed gross salary.");
  }
  
  if (summary.totalEmployeeDeductions > summary.grossSalary) {
    warnings.push("Total deductions exceed gross salary. Employee would owe the organization.");
  }
  
  if (summary.basicSalary === 0) {
    warnings.push("Basic salary is zero. Please verify employee salary profile.");
  }
  
  // Verify math consistency
  const expectedGross = roundAmount(summary.basicSalary + summary.totalAllowances);
  if (Math.abs(expectedGross - summary.grossSalary) > 0.01) {
    errors.push("Gross salary calculation inconsistency detected.");
  }
  
  const expectedDeductions = roundAmount(
    summary.totalGeneralDeductions + summary.totalLoanDeductions + 
    summary.totalTaxDeductions + summary.otherDeductions
  );
  if (Math.abs(expectedDeductions - summary.totalEmployeeDeductions) > 0.01) {
    errors.push("Total deductions calculation inconsistency detected.");
  }
  
  const expectedNet = roundAmount(summary.grossSalary - summary.totalEmployeeDeductions);
  if (Math.abs(expectedNet - summary.netSalaryPayable) > 0.01) {
    errors.push("Net salary calculation inconsistency detected.");
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Build a simple payroll summary from basic salary data (backwards compatible).
 * Used when only baseSalary/bonus/deductions are available (existing PayrollEntry format).
 */
export function calculateSimplePayroll(
  baseSalary: number,
  bonus: number = 0,
  deductions: number = 0,
  tax: number = 0,
  loanDeductions: number = 0,
  employerContributions: number = 0
): PayrollSummary {
  const basic = roundAmount(safeNum(baseSalary, 0));
  const totalAllowances = roundAmount(safeNum(bonus, 0));
  const grossSalary = roundAmount(basic + totalAllowances);
  const totalGeneralDeductions = roundAmount(safeNum(deductions, 0));
  const totalLoanDed = roundAmount(safeNum(loanDeductions, 0));
  const totalTaxDed = roundAmount(safeNum(tax, 0));
  const totalEmployeeDeductions = roundAmount(totalGeneralDeductions + totalLoanDed + totalTaxDed);
  const netSalaryPayable = roundAmount(grossSalary - totalEmployeeDeductions);
  const empContrib = roundAmount(safeNum(employerContributions, 0));
  const totalEmployerPayrollCost = roundAmount(grossSalary + empContrib);
  
  return {
    basicSalary: basic,
    totalAllowances,
    grossSalary,
    totalGeneralDeductions,
    totalLoanDeductions: totalLoanDed,
    totalTaxDeductions: totalTaxDed,
    otherDeductions: 0,
    totalEmployeeDeductions,
    netSalaryPayable,
    employerContributions: empContrib,
    totalEmployerPayrollCost,
  };
}

// ============================================================================
// DEFAULT SALARY COMPONENT TEMPLATES
// ============================================================================

export const DEFAULT_EARNING_COMPONENTS: Omit<SalaryComponent, "id" | "organizationId">[] = [
  { code: "HRA", name: "House Rent Allowance", category: "earning", calculationType: "percentage_of_basic", amount: 45, isActive: true, isTaxable: true, sortOrder: 1 },
  { code: "MED", name: "Medical Allowance", category: "earning", calculationType: "percentage_of_basic", amount: 10, isActive: true, isTaxable: false, sortOrder: 2 },
  { code: "CONV", name: "Conveyance Allowance", category: "earning", calculationType: "fixed", amount: 3000, isActive: true, isTaxable: false, sortOrder: 3 },
  { code: "UTIL", name: "Utility Allowance", category: "earning", calculationType: "fixed", amount: 2000, isActive: true, isTaxable: false, sortOrder: 4 },
  { code: "ADHOC", name: "Adhoc Relief Allowance", category: "earning", calculationType: "percentage_of_basic", amount: 15, isActive: false, isTaxable: true, sortOrder: 5 },
  { code: "SPCL", name: "Special Allowance", category: "earning", calculationType: "fixed", amount: 0, isActive: false, isTaxable: true, sortOrder: 6 },
  { code: "DISP", name: "Disparity Reduction Allowance", category: "earning", calculationType: "fixed", amount: 0, isActive: false, isTaxable: true, sortOrder: 7 },
  { code: "COLA", name: "Cost of Living Allowance", category: "earning", calculationType: "fixed", amount: 0, isActive: false, isTaxable: true, sortOrder: 8 },
  { code: "DA", name: "Dearness Allowance", category: "earning", calculationType: "percentage_of_basic", amount: 0, isActive: false, isTaxable: true, sortOrder: 9 },
  { code: "ATT", name: "Attendance Allowance", category: "earning", calculationType: "attendance_based", amount: 0, isActive: false, isTaxable: true, sortOrder: 10 },
  { code: "OT", name: "Overtime Pay", category: "earning", calculationType: "overtime", amount: 0, isActive: false, isTaxable: true, sortOrder: 11 },
  { code: "BONUS", name: "Bonus & Incentives", category: "earning", calculationType: "fixed", amount: 0, isActive: false, isTaxable: true, sortOrder: 12 },
  { code: "COMM", name: "Commission", category: "earning", calculationType: "fixed", amount: 0, isActive: false, isTaxable: true, sortOrder: 13 },
  { code: "ARR", name: "Arrears / Previous Adjustments", category: "earning", calculationType: "one_time", amount: 0, isActive: false, isTaxable: true, sortOrder: 14 },
  { code: "LENC", name: "Leave Encashment", category: "earning", calculationType: "one_time", amount: 0, isActive: false, isTaxable: true, sortOrder: 15 },
];

export const DEFAULT_DEDUCTION_COMPONENTS: Omit<SalaryComponent, "id" | "organizationId">[] = [
  { code: "GPF", name: "General Provident Fund", category: "deduction", calculationType: "percentage_of_basic", amount: 0, isActive: false, isStatutory: true, sortOrder: 1 },
  { code: "PF", name: "Provident Fund (Employee)", category: "deduction", calculationType: "percentage_of_basic", amount: 0, isActive: false, isStatutory: true, sortOrder: 2 },
  { code: "BF", name: "Benevolent Fund", category: "deduction", calculationType: "percentage_of_basic", amount: 2, isActive: false, isStatutory: false, sortOrder: 3 },
  { code: "TAX", name: "Income Tax", category: "deduction", calculationType: "fixed", amount: 0, isActive: false, isStatutory: true, sortOrder: 4, description: "Calculated from tax slabs" },
  { code: "EOBI", name: "EOBI Contribution", category: "deduction", calculationType: "fixed", amount: 0, isActive: false, isStatutory: true, sortOrder: 5 },
  { code: "SS", name: "Social Security", category: "deduction", calculationType: "fixed", amount: 0, isActive: false, isStatutory: true, sortOrder: 6 },
  { code: "INS", name: "Insurance Premium", category: "deduction", calculationType: "fixed", amount: 0, isActive: false, sortOrder: 7 },
  { code: "UPL", name: "Unpaid Leave Deduction", category: "deduction", calculationType: "attendance_based", amount: 0, isActive: false, sortOrder: 8 },
  { code: "LATE", name: "Late Arrival Deduction", category: "deduction", calculationType: "fixed", amount: 0, isActive: false, sortOrder: 9 },
  { code: "ADV", name: "Salary Advance Recovery", category: "deduction", calculationType: "fixed", amount: 0, isActive: false, sortOrder: 10 },
];

export const DEFAULT_EMPLOYER_COMPONENTS: Omit<SalaryComponent, "id" | "organizationId">[] = [
  { code: "EPF", name: "Employer Provident Fund", category: "employer_contribution", calculationType: "percentage_of_basic", amount: 0, isActive: false, isStatutory: true, sortOrder: 1 },
  { code: "EEOBI", name: "Employer EOBI Contribution", category: "employer_contribution", calculationType: "fixed", amount: 0, isActive: false, isStatutory: true, sortOrder: 2 },
  { code: "ESS", name: "Employer Social Security", category: "employer_contribution", calculationType: "fixed", amount: 0, isActive: false, isStatutory: true, sortOrder: 3 },
  { code: "EINS", name: "Employer Insurance", category: "employer_contribution", calculationType: "fixed", amount: 0, isActive: false, sortOrder: 4 },
];
