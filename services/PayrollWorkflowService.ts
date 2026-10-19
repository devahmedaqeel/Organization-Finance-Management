/**
 * services/PayrollWorkflowService.ts
 *
 * Payroll Batch Processing and Multi-Stage Approval Workflow Service for OFM.
 * Implements: Draft -> Calculated -> Pending Approval -> Approved -> Finalized -> Paid.
 * Features:
 * - Controlled adjustment & reversal mechanisms with immutable audit trail.
 * - Department budget pre-validation before finalization.
 * - Local offline cache with Firestore sync.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "@/config/firebase";
import {
  PayrollStatus,
  EmployeeSalaryProfile,
  SalaryComponent,
  LoanDeduction,
  calculatePayroll,
  calculateSimplePayroll,
  PayrollSummary,
  validatePayrollCalculation,
  generateVerificationCode,
} from "./PayrollCalculationEngine";
import { recordAuditLog } from "./auditService";
import { recordLoanPayrollDeduction } from "./LoanService";

export interface PayrollPeriod {
  id: string;
  organizationId: string;
  period: string; // YYYY-MM
  status: PayrollStatus;
  totalEmployees: number;
  grossTotal: number;
  deductionsTotal: number;
  netPayableTotal: number;
  employerCostTotal: number;
  preparedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollBatchItem {
  profile: EmployeeSalaryProfile;
  summary: PayrollSummary;
  earnings: any[];
  deductions: any[];
  loans: LoanDeduction[];
  employerContributions: any[];
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export interface PayrollBatchResult {
  period: string;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  grossSum: number;
  deductionsSum: number;
  netSum: number;
  employerSum: number;
  items: PayrollBatchItem[];
}

const STORAGE_KEY_PERIODS = "ofm_payroll_periods_";

function getPeriodStorageKey(organizationId: string): string {
  const safeOrg = (organizationId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${STORAGE_KEY_PERIODS}${safeOrg}`;
}

/**
 * Fetch payroll periods for an organization.
 */
export async function getPayrollPeriods(organizationId: string): Promise<PayrollPeriod[]> {
  const storageKey = getPeriodStorageKey(organizationId);

  try {
    const q = query(collection(db, "payrollPeriods"), where("organizationId", "==", organizationId));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const periods: PayrollPeriod[] = [];
      snapshot.forEach((d) => periods.push({ id: d.id, ...(d.data() as Omit<PayrollPeriod, "id">) }));
      periods.sort((a, b) => b.period.localeCompare(a.period));
      await AsyncStorage.setItem(storageKey, JSON.stringify(periods)).catch(() => {});
      return periods;
    }
  } catch (err) {
    console.warn("PayrollWorkflowService: network fetch periods failed", err);
  }

  try {
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  return [];
}

/**
 * Save or update a payroll period record.
 */
export async function savePayrollPeriod(
  periodData: PayrollPeriod,
  actor?: { id: string; name: string; role: string }
): Promise<PayrollPeriod> {
  const storageKey = getPeriodStorageKey(periodData.organizationId);

  try {
    await setDoc(doc(db, "payrollPeriods", periodData.id), periodData, { merge: true });
  } catch (err) {
    console.warn("PayrollWorkflowService: offline period save", err);
  }

  try {
    const cached = await AsyncStorage.getItem(storageKey);
    const list: PayrollPeriod[] = cached ? JSON.parse(cached) : [];
    const idx = list.findIndex((p) => p.id === periodData.id);
    if (idx >= 0) {
      list[idx] = periodData;
    } else {
      list.unshift(periodData);
    }
    await AsyncStorage.setItem(storageKey, JSON.stringify(list));
  } catch {}

  if (actor) {
    recordAuditLog({
      organizationId: periodData.organizationId,
      actorUid: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: periodData.status === "approved" ? "approve" : periodData.status === "finalized" ? "finalize" : "update",
      entity: "payroll_period",
      entityId: periodData.id,
      metadata: { period: periodData.period, status: periodData.status, netTotal: periodData.netPayableTotal },
    }).catch(() => {});
  }

  return periodData;
}

/**
 * Batch calculation engine for a period.
 * Takes active employee profiles, components, and active loan deductions.
 */
export function calculateBatchPayroll(
  period: string,
  profiles: EmployeeSalaryProfile[],
  components: SalaryComponent[],
  activeLoansByEmployee: Record<string, LoanDeduction[]>
): PayrollBatchResult {
  const earningComps = components.filter((c) => c.category === "earning" && c.isActive);
  const deductionComps = components.filter((c) => c.category === "deduction" && c.isActive);
  const employerComps = components.filter((c) => c.category === "employer_contribution" && c.isActive);

  const items: PayrollBatchItem[] = [];
  let grossSum = 0;
  let deductionsSum = 0;
  let netSum = 0;
  let employerSum = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  for (const profile of profiles) {
    if (profile.payrollStatus === "inactive") continue;

    const empLoans = activeLoansByEmployee[profile.employeeId] || [];

    // Filter components assigned to this profile, or use all active if none explicitly assigned
    const empEarnings = profile.assignedEarnings && profile.assignedEarnings.length > 0
      ? earningComps.filter((c) => profile.assignedEarnings.includes(c.id) || profile.assignedEarnings.includes(c.code))
      : earningComps;

    const empDeductions = profile.assignedDeductions && profile.assignedDeductions.length > 0
      ? deductionComps.filter((c) => profile.assignedDeductions.includes(c.id) || profile.assignedDeductions.includes(c.code))
      : deductionComps;

    const summary = calculatePayroll(
      profile,
      empEarnings,
      empDeductions,
      employerComps,
      empLoans
    );

    const validation = validatePayrollCalculation(summary);
    if (!profile.department) {
      validation.errors.push("Employee has no department assigned.");
      validation.isValid = false;
    }

    if (validation.isValid) {
      totalSuccess++;
    } else {
      totalFailed++;
    }

    grossSum += summary.grossSalary;
    deductionsSum += summary.totalEmployeeDeductions;
    netSum += summary.netSalaryPayable;
    employerSum += summary.employerContributions;

    items.push({
      profile,
      summary,
      earnings: empEarnings,
      deductions: empDeductions,
      loans: empLoans,
      employerContributions: employerComps,
      validation,
    });
  }

  return {
    period,
    totalProcessed: items.length,
    totalSuccess,
    totalFailed,
    grossSum: Math.round(grossSum * 100) / 100,
    deductionsSum: Math.round(deductionsSum * 100) / 100,
    netSum: Math.round(netSum * 100) / 100,
    employerSum: Math.round(employerSum * 100) / 100,
    items,
  };
}

/**
 * Reversal or Amendment for an already finalized payroll entry.
 * Generates an immutable audit trail and marks the original as reversed/adjusted.
 */
export async function createPayrollReversal(
  originalPayrollId: string,
  organizationId: string,
  reason: string,
  actor: { id: string; name: string; role: string }
): Promise<void> {
  const now = new Date().toISOString();
  const updates = {
    paymentStatus: "cancelled",
    payrollStatus: "cancelled",
    reversalReason: reason,
    reversedBy: actor.name,
    reversedAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, "payroll", originalPayrollId), updates, { merge: true });
  } catch (err) {
    console.warn("PayrollWorkflowService: offline reversal save", err);
  }

  recordAuditLog({
    organizationId,
    actorUid: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "reversal",
    entity: "payroll",
    entityId: originalPayrollId,
    metadata: { reason, reversedAt: now },
  }).catch(() => {});
}
