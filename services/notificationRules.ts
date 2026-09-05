/**
 * services/notificationRules.ts
 *
 * Configurable rule definitions, thresholds, and idempotency key generators
 * for real-time financial alerts and event triggers.
 */

import { Transaction, Budget, PayrollEntry } from "@/context/FinanceContext";

export interface NotificationRuleConfig {
  budgetWarningThreshold: number;  // default 0.80 (80%)
  budgetCriticalThreshold: number; // default 0.90 (90%)
  budgetOverThreshold: number;     // default 1.00 (100%)
  unusualExpenseMultiplier: number;// default 2.5x historical average
  minimumUnusualAmount: number;    // default 15,000 PKR
  negativeCashFlowThreshold: number; // default < 0
  largeTransactionThreshold: number; // default 50,000 PKR
}

export const DEFAULT_NOTIFICATION_RULES: NotificationRuleConfig = {
  budgetWarningThreshold: 0.80,
  budgetCriticalThreshold: 0.90,
  budgetOverThreshold: 1.00,
  unusualExpenseMultiplier: 2.5,
  minimumUnusualAmount: 15000,
  negativeCashFlowThreshold: 0,
  largeTransactionThreshold: 50000,
};

export type NotificationType =
  | "BUDGET_WARNING"
  | "BUDGET_CRITICAL"
  | "BUDGET_OVER"
  | "UNUSUAL_EXPENSE"
  | "LARGE_TRANSACTION"
  | "PAYROLL_PROCESSED"
  | "SALARY_UPDATED"
  | "CASH_FLOW_DEFICIT"
  | "NEW_TRANSACTION"
  | "SYSTEM_ALERT";

export interface EvaluatedNotificationEvent {
  type: NotificationType;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS";
  actionRoute: string;
  entityId: string;
  metadata?: Record<string, any>;
  idempotencyKey: string;
}

/**
 * Creates a unique deterministic idempotency key to prevent sending duplicate notifications.
 */
export function generateIdempotencyKey(
  orgId: string,
  type: NotificationType,
  entityId: string,
  periodOrDate: string
): string {
  return `${orgId || "ofm"}_${type}_${entityId}_${periodOrDate.slice(0, 10)}`;
}

/**
 * Evaluates budget status against threshold rules.
 */
export function evaluateBudgetEvent(
  budget: Budget,
  orgId: string,
  currency: string = "PKR",
  config: NotificationRuleConfig = DEFAULT_NOTIFICATION_RULES
): EvaluatedNotificationEvent | null {
  const allocated = budget.allocated || 0;
  const spent = budget.spent || 0;
  if (allocated <= 0) return null;

  const ratio = spent / allocated;
  const period = budget.period || new Date().toISOString().substring(0, 7);

  if (ratio >= config.budgetOverThreshold) {
    const excess = spent - allocated;
    const overrunPct = (excess / allocated) * 100;
    return {
      type: "BUDGET_OVER",
      title: "Budget Exceeded",
      message: `${budget.category || budget.department} has spent ${currency} ${spent.toLocaleString()} (${(ratio * 100).toFixed(0)}% of limit), exceeding its ${currency} ${allocated.toLocaleString()} budget by ${currency} ${excess.toLocaleString()} (+${overrunPct.toFixed(0)}% over budget).`,
      severity: "CRITICAL",
      actionRoute: "/budget",
      entityId: budget.id,
      idempotencyKey: generateIdempotencyKey(orgId, "BUDGET_OVER", budget.id, period),
    };
  }

  if (ratio >= config.budgetCriticalThreshold) {
    return {
      type: "BUDGET_CRITICAL",
      title: "Budget Near Capacity",
      message: `${budget.category || budget.department} is at ${(ratio * 100).toFixed(0)}% of limit with ${currency} ${(allocated - spent).toLocaleString()} remaining.`,
      severity: "CRITICAL",
      actionRoute: "/budget",
      entityId: budget.id,
      idempotencyKey: generateIdempotencyKey(orgId, "BUDGET_CRITICAL", budget.id, period),
    };
  }

  if (ratio >= config.budgetWarningThreshold) {
    return {
      type: "BUDGET_WARNING",
      title: "Budget Alert (80% Utilized)",
      message: `${budget.category || budget.department} has reached ${(ratio * 100).toFixed(0)}% of its authorized allocation.`,
      severity: "WARNING",
      actionRoute: "/budget",
      entityId: budget.id,
      idempotencyKey: generateIdempotencyKey(orgId, "BUDGET_WARNING", budget.id, period),
    };
  }

  return null;
}

/**
 * Evaluates individual transaction for unusual spikes or large amounts.
 */
export function evaluateTransactionEvent(
  tx: Transaction,
  historicalAvgExpense: number,
  orgId: string,
  currency: string = "PKR",
  config: NotificationRuleConfig = DEFAULT_NOTIFICATION_RULES
): EvaluatedNotificationEvent | null {
  if (tx.type === "expense") {
    if (
      historicalAvgExpense > 0 &&
      tx.amount >= historicalAvgExpense * config.unusualExpenseMultiplier &&
      tx.amount >= config.minimumUnusualAmount
    ) {
      return {
        type: "UNUSUAL_EXPENSE",
        title: "Unusual Expense Detected",
        message: `High outflow of ${currency} ${tx.amount.toLocaleString()} recorded in ${tx.category} by ${tx.addedBy || "Authorized User"}.`,
        severity: "WARNING",
        actionRoute: "/(tabs)/expenses",
        entityId: tx.id,
        idempotencyKey: generateIdempotencyKey(orgId, "UNUSUAL_EXPENSE", tx.id, tx.date),
      };
    }
  }

  return null;
}
