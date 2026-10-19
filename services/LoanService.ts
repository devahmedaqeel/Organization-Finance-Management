/**
 * services/LoanService.ts
 *
 * Comprehensive Loan and Salary Advance Management Service for OFM.
 * Supports loan requests, approvals, monthly payroll deductions, and repayment schedules.
 * Ensures idempotent deductions and immutable audit trails.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "@/config/firebase";
import { LoanDeduction } from "./PayrollCalculationEngine";
import { recordAuditLog } from "./auditService";

export type LoanStatus = "pending" | "approved" | "active" | "completed" | "defaulted" | "cancelled";
export type LoanType = "Salary Advance" | "Personal Loan" | "Provident Fund Advance" | "Emergency Aid" | "Equipment Loan";

export interface EmployeeLoan {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  loanType: LoanType | string;
  principalAmount: number;
  monthlyInstallment: number;
  totalInstallments: number;
  installmentsPaid: number;
  remainingInstallments: number;
  outstandingBalance: number;
  startDate: string; // YYYY-MM
  status: LoanStatus;
  approvedBy?: string;
  approvedAt?: string;
  purpose?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanRepayment {
  id: string;
  organizationId: string;
  loanId: string;
  employeeId: string;
  payrollId?: string;
  period: string; // YYYY-MM
  amount: number;
  repaymentDate: string;
  repaymentType: "payroll_deduction" | "manual_payment";
  recordedBy?: string;
  notes?: string;
}

const STORAGE_KEY_LOANS = "ofm_employee_loans_";
const STORAGE_KEY_REPAYMENTS = "ofm_loan_repayments_";

function getLoanStorageKey(organizationId: string): string {
  const safeOrg = (organizationId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${STORAGE_KEY_LOANS}${safeOrg}`;
}

function getRepaymentStorageKey(organizationId: string): string {
  const safeOrg = (organizationId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${STORAGE_KEY_REPAYMENTS}${safeOrg}`;
}

/**
 * Fetch active and historical loans for an organization (or specific employee).
 */
export async function getLoans(organizationId: string, employeeId?: string): Promise<EmployeeLoan[]> {
  const storageKey = getLoanStorageKey(organizationId);

  try {
    let q = query(collection(db, "employeeLoans"), where("organizationId", "==", organizationId));
    if (employeeId) {
      q = query(collection(db, "employeeLoans"), where("organizationId", "==", organizationId), where("employeeId", "==", employeeId));
    }
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const loans: EmployeeLoan[] = [];
      snapshot.forEach((d) => loans.push({ id: d.id, ...(d.data() as Omit<EmployeeLoan, "id">) }));
      loans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      await AsyncStorage.setItem(storageKey, JSON.stringify(loans)).catch(() => {});
      return loans;
    }
  } catch (err) {
    console.warn("LoanService: network fetch failed, using local cache", err);
  }

  try {
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) {
      const all: EmployeeLoan[] = JSON.parse(cached);
      return employeeId ? all.filter((l) => l.employeeId === employeeId) : all;
    }
  } catch {
    // ignore
  }

  return [];
}

/**
 * Create a new loan or advance application.
 */
export async function createLoan(
  loanData: Omit<EmployeeLoan, "id" | "installmentsPaid" | "remainingInstallments" | "outstandingBalance" | "createdAt" | "updatedAt">,
  actor?: { id: string; name: string; role: string }
): Promise<EmployeeLoan> {
  const id = `loan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const principal = Number(loanData.principalAmount || 0);
  const totalInstallments = Math.max(1, Number(loanData.totalInstallments || 1));
  const installment = Number(loanData.monthlyInstallment || Math.round(principal / totalInstallments));

  const newLoan: EmployeeLoan = {
    ...loanData,
    id,
    principalAmount: principal,
    monthlyInstallment: installment,
    totalInstallments,
    installmentsPaid: 0,
    remainingInstallments: totalInstallments,
    outstandingBalance: principal,
    status: loanData.status || "active",
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, "employeeLoans", id), newLoan);
  } catch (err) {
    console.warn("LoanService: offline Firestore save", err);
  }

  // Update local cache
  const storageKey = getLoanStorageKey(loanData.organizationId);
  try {
    const cached = await AsyncStorage.getItem(storageKey);
    const list: EmployeeLoan[] = cached ? JSON.parse(cached) : [];
    list.unshift(newLoan);
    await AsyncStorage.setItem(storageKey, JSON.stringify(list));
  } catch (err) {
    console.error("LoanService: cache error", err);
  }

  if (actor) {
    recordAuditLog({
      organizationId: loanData.organizationId,
      actorUid: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: "create",
      entity: "loan",
      entityId: id,
      metadata: { employeeName: loanData.employeeName, principal, loanType: loanData.loanType },
    }).catch(() => {});
  }

  return newLoan;
}

/**
 * Approve a pending loan.
 */
export async function approveLoan(
  loanId: string,
  organizationId: string,
  approver: { id: string; name: string; role: string }
): Promise<void> {
  const now = new Date().toISOString();
  const updates: Partial<EmployeeLoan> = {
    status: "active",
    approvedBy: approver.name,
    approvedAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, "employeeLoans", loanId), updates, { merge: true });
  } catch (err) {
    console.warn("LoanService: offline approval save", err);
  }

  const storageKey = getLoanStorageKey(organizationId);
  try {
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) {
      const list: EmployeeLoan[] = JSON.parse(cached);
      const updated = list.map((l) => (l.id === loanId ? { ...l, ...updates } : l));
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
    }
  } catch (err) {
    console.error("LoanService: cache error", err);
  }

  recordAuditLog({
    organizationId,
    actorUid: approver.id,
    actorName: approver.name,
    actorRole: approver.role,
    action: "approve",
    entity: "loan",
    entityId: loanId,
  }).catch(() => {});
}

/**
 * Get active loan deductions applicable for an employee during payroll processing.
 */
export async function getActiveLoanDeductionsForEmployee(
  organizationId: string,
  employeeId: string
): Promise<LoanDeduction[]> {
  const loans = await getLoans(organizationId, employeeId);
  const activeLoans = loans.filter((l) => (l.status === "active" || l.status === "approved") && l.outstandingBalance > 0);

  return activeLoans.map((loan) => {
    const deduction = Math.min(loan.monthlyInstallment, loan.outstandingBalance);
    return {
      loanId: loan.id,
      loanType: loan.loanType,
      description: `${loan.loanType} (Installment ${loan.installmentsPaid + 1}/${loan.totalInstallments})`,
      originalPrincipal: loan.principalAmount,
      installmentAmount: loan.monthlyInstallment,
      totalInstallments: loan.totalInstallments,
      installmentsPaid: loan.installmentsPaid,
      remainingInstallments: loan.remainingInstallments,
      outstandingBalance: loan.outstandingBalance,
      currentDeduction: deduction,
    };
  });
}

/**
 * Idempotently record a monthly payroll deduction for a loan.
 * Prevents double-deduction if payroll is re-calculated or re-saved.
 */
export async function recordLoanPayrollDeduction(
  organizationId: string,
  loanId: string,
  payrollId: string,
  period: string,
  deductionAmount: number,
  actor?: { id: string; name: string; role: string }
): Promise<void> {
  const repaymentId = `rep_${loanId}_${payrollId}`;

  // Check if already recorded
  const repStorageKey = getRepaymentStorageKey(organizationId);
  let existingRepayments: LoanRepayment[] = [];
  try {
    const cached = await AsyncStorage.getItem(repStorageKey);
    if (cached) existingRepayments = JSON.parse(cached);
  } catch {}

  if (existingRepayments.some((r) => r.id === repaymentId)) {
    return; // Already applied
  }

  const now = new Date().toISOString();
  const repayment: LoanRepayment = {
    id: repaymentId,
    organizationId,
    loanId,
    employeeId: "",
    payrollId,
    period,
    amount: deductionAmount,
    repaymentDate: now,
    repaymentType: "payroll_deduction",
    recordedBy: actor?.name,
  };

  try {
    await setDoc(doc(db, "loanRepayments", repaymentId), repayment);
  } catch (err) {
    console.warn("LoanService: offline repayment save", err);
  }

  existingRepayments.push(repayment);
  await AsyncStorage.setItem(repStorageKey, JSON.stringify(existingRepayments)).catch(() => {});

  // Update loan record
  const loanStorageKey = getLoanStorageKey(organizationId);
  try {
    const cached = await AsyncStorage.getItem(loanStorageKey);
    if (cached) {
      const list: EmployeeLoan[] = JSON.parse(cached);
      const target = list.find((l) => l.id === loanId);
      if (target) {
        const newPaid = target.installmentsPaid + 1;
        const newRem = Math.max(0, target.totalInstallments - newPaid);
        const newBalance = Math.max(0, target.outstandingBalance - deductionAmount);
        const newStatus: LoanStatus = newBalance <= 0 ? "completed" : target.status;

        const updatedLoan: EmployeeLoan = {
          ...target,
          installmentsPaid: newPaid,
          remainingInstallments: newRem,
          outstandingBalance: newBalance,
          status: newStatus,
          updatedAt: now,
        };

        const updatedList = list.map((l) => (l.id === loanId ? updatedLoan : l));
        await AsyncStorage.setItem(loanStorageKey, JSON.stringify(updatedList));

        // Sync to Firestore
        setDoc(doc(db, "employeeLoans", loanId), updatedLoan, { merge: true }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("LoanService: updating loan balance error", err);
  }
}
