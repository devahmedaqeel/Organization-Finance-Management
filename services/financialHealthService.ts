/**
 * services/financialHealthService.ts
 *
 * Deterministic Financial Health Engine for OFM.
 * Evaluates Revenue Growth, Expense Trajectory, Operating Margin, Cash Flow,
 * Budget Adherence, and Payroll Burden to produce an authoritative health score and diagnostic.
 */

import { Transaction, Budget, PayrollEntry } from "@/context/FinanceContext";
import { NormalizedPeriod, filterTransactionsByPeriod, computePeriodMetrics } from "./DatePeriodService";

export type HealthStatus = "Excellent" | "Healthy" | "Watch" | "At Risk" | "Critical";

export interface HealthMetricDetail {
  name: string;
  value: number;
  displayValue: string;
  score: number; // 0 to 100
  weight: number; // percentage weight in composite score
  status: "positive" | "neutral" | "warning" | "negative";
  description: string;
}

export interface FinancialHealthReport {
  healthScore: number; // 0 to 100
  status: HealthStatus;
  statusColor: string;
  summary: string;
  metrics: {
    operatingMargin: HealthMetricDetail;
    budgetAdherence: HealthMetricDetail;
    cashFlowStability: HealthMetricDetail;
    payrollBurden: HealthMetricDetail;
    revenueGrowth: HealthMetricDetail;
  };
  reasons: string[];
  warnings: string[];
  recommendations: string[];
  calculatedAt: string;
}

/**
 * Calculates comprehensive financial health score and diagnostic metrics deterministically.
 */
export function calculateFinancialHealth(
  transactions: Transaction[],
  budgets: Budget[],
  payroll: PayrollEntry[],
  currentPeriod?: NormalizedPeriod,
  previousPeriod?: NormalizedPeriod
): FinancialHealthReport {
  const currentTxs = currentPeriod ? filterTransactionsByPeriod(transactions, currentPeriod) : transactions;
  const prevTxs = previousPeriod ? filterTransactionsByPeriod(transactions, previousPeriod) : [];

  const currentMetrics = computePeriodMetrics(transactions, currentPeriod);
  const prevMetrics = previousPeriod ? computePeriodMetrics(transactions, previousPeriod) : null;

  const income = currentMetrics.totalIncome;
  const expense = currentMetrics.totalExpenses;
  const net = currentMetrics.netBalance;

  const prevIncome = prevMetrics ? prevMetrics.totalIncome : 0;
  const prevExpense = prevMetrics ? prevMetrics.totalExpenses : 0;

  // 1. Operating Margin (30% weight)
  const marginPct = income > 0 ? (net / income) * 100 : (net >= 0 ? 0 : -100);
  let marginScore = 50;
  let marginStatus: "positive" | "neutral" | "warning" | "negative" = "neutral";
  if (income <= 0 && expense > 0) {
    marginScore = 15;
    marginStatus = "negative";
  } else if (marginPct >= 25) {
    marginScore = 100;
    marginStatus = "positive";
  } else if (marginPct >= 10) {
    marginScore = 80;
    marginStatus = "positive";
  } else if (marginPct >= 0) {
    marginScore = 60;
    marginStatus = "neutral";
  } else if (marginPct >= -15) {
    marginScore = 35;
    marginStatus = "warning";
  } else {
    marginScore = 10;
    marginStatus = "negative";
  }

  // 2. Budget Adherence (25% weight)
  const totalBudget = budgets.reduce((s, b) => s + (b.allocated || 0), 0);
  const totalBudgetSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);
  const budgetUtil = totalBudget > 0 ? (totalBudgetSpent / totalBudget) * 100 : 0;
  let budgetScore = 70;
  let budgetStatus: "positive" | "neutral" | "warning" | "negative" = "neutral";
  if (totalBudget === 0) {
    budgetScore = 65; // neutral default if no budget limits set
    budgetStatus = "neutral";
  } else if (budgetUtil <= 80) {
    budgetScore = 95;
    budgetStatus = "positive";
  } else if (budgetUtil <= 95) {
    budgetScore = 75;
    budgetStatus = "neutral";
  } else if (budgetUtil <= 100) {
    budgetScore = 50;
    budgetStatus = "warning";
  } else {
    budgetScore = Math.max(10, 50 - (budgetUtil - 100) * 1.5);
    budgetStatus = "negative";
  }

  // 3. Cash Flow Stability & Liquidity (20% weight)
  let cashFlowScore = 50;
  let cashFlowStatus: "positive" | "neutral" | "warning" | "negative" = "neutral";
  if (net > 0 && income >= expense * 1.2) {
    cashFlowScore = 95;
    cashFlowStatus = "positive";
  } else if (net >= 0) {
    cashFlowScore = 70;
    cashFlowStatus = "neutral";
  } else if (net < 0 && Math.abs(net) < expense * 0.2) {
    cashFlowScore = 40;
    cashFlowStatus = "warning";
  } else {
    cashFlowScore = 15;
    cashFlowStatus = "negative";
  }

  // 4. Payroll Burden Ratio (15% weight)
  const totalPayroll = payroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0);
  const payrollRatio = expense > 0 ? (totalPayroll / expense) * 100 : 0;
  let payrollScore = 70;
  let payrollStatus: "positive" | "neutral" | "warning" | "negative" = "neutral";
  if (expense === 0) {
    payrollScore = 80;
  } else if (payrollRatio <= 40) {
    payrollScore = 90;
    payrollStatus = "positive";
  } else if (payrollRatio <= 65) {
    payrollScore = 75;
    payrollStatus = "neutral";
  } else if (payrollRatio <= 85) {
    payrollScore = 45;
    payrollStatus = "warning";
  } else {
    payrollScore = 20;
    payrollStatus = "negative";
  }

  // 5. Revenue Growth / Momentum (10% weight)
  let revGrowthScore = 60;
  let revGrowthStatus: "positive" | "neutral" | "warning" | "negative" = "neutral";
  let revGrowthPct = 0;
  if (prevIncome > 0) {
    revGrowthPct = ((income - prevIncome) / prevIncome) * 100;
    if (revGrowthPct >= 15) {
      revGrowthScore = 100;
      revGrowthStatus = "positive";
    } else if (revGrowthPct >= 0) {
      revGrowthScore = 75;
      revGrowthStatus = "neutral";
    } else if (revGrowthPct >= -15) {
      revGrowthScore = 45;
      revGrowthStatus = "warning";
    } else {
      revGrowthScore = 20;
      revGrowthStatus = "negative";
    }
  }

  // Composite Weighted Calculation
  const compositeScore = Math.round(
    marginScore * 0.30 +
    budgetScore * 0.25 +
    cashFlowScore * 0.20 +
    payrollScore * 0.15 +
    revGrowthScore * 0.10
  );

  const clampedScore = Math.min(Math.max(compositeScore, 0), 100);

  // Status mapping
  let status: HealthStatus = "Watch";
  let statusColor = "#F59E0B";

  if (clampedScore >= 80) {
    status = "Excellent";
    statusColor = "#10B981";
  } else if (clampedScore >= 65) {
    status = "Healthy";
    statusColor = "#3B82F6";
  } else if (clampedScore >= 50) {
    status = "Watch";
    statusColor = "#F59E0B";
  } else if (clampedScore >= 35) {
    status = "At Risk";
    statusColor = "#F97316";
  } else {
    status = "Critical";
    statusColor = "#EF4444";
  }

  // Dynamic Reasons, Warnings & Actionable Recommendations
  const reasons: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (marginPct > 15) {
    reasons.push(`Robust operating margin of ${marginPct.toFixed(1)}% providing strong reinvestment capacity.`);
  } else if (marginPct < 0) {
    warnings.push(`Operating deficit of ${Math.abs(marginPct).toFixed(1)}% detected; expenditures exceed revenue.`);
    recommendations.push("Implement spending freeze on discretionary operational cost centers.");
  }

  if (budgetUtil > 90) {
    warnings.push(`Budget utilization is elevated at ${budgetUtil.toFixed(1)}% of total allocation.`);
    recommendations.push("Review department allocations and reallocate buffer funds if necessary.");
  } else if (totalBudget > 0) {
    reasons.push(`Budget spending is contained at ${budgetUtil.toFixed(1)}% of planned limits.`);
  }

  if (payrollRatio > 65) {
    warnings.push(`Payroll represents ${payrollRatio.toFixed(1)}% of total monthly expenses.`);
  }

  if (prevIncome > 0 && revGrowthPct > 10) {
    reasons.push(`Revenue expanded +${revGrowthPct.toFixed(1)}% compared to the prior period.`);
  }

  if (recommendations.length === 0) {
    recommendations.push("Maintain existing cost controls and monitor upcoming cyclical commitments.");
  }

  const summary =
    status === "Excellent"
      ? "Financial operations are performing exceptionally with strong operating margins and controlled budget variance."
      : status === "Healthy"
      ? "Institutional balance is stable with balanced cash flow and sustainable expenditure patterns."
      : status === "Watch"
      ? "Operating metrics are acceptable, but minor cost pressures or budget boundaries warrant monitoring."
      : status === "At Risk"
      ? "Outflows are outpacing revenue; immediate corrective budget controls are advised."
      : "Severe deficit and elevated expenditure burn rate require executive financial intervention.";

  return {
    healthScore: clampedScore,
    status,
    statusColor,
    summary,
    metrics: {
      operatingMargin: {
        name: "Operating Margin",
        value: marginPct,
        displayValue: `${marginPct >= 0 ? "+" : ""}${marginPct.toFixed(1)}%`,
        score: marginScore,
        weight: 30,
        status: marginStatus,
        description: "Net operating surplus as a percentage of total institutional revenue.",
      },
      budgetAdherence: {
        name: "Budget Adherence",
        value: budgetUtil,
        displayValue: totalBudget > 0 ? `${budgetUtil.toFixed(1)}%` : "N/A",
        score: budgetScore,
        weight: 25,
        status: budgetStatus,
        description: "Actual cost center consumption relative to authorized financial allocations.",
      },
      cashFlowStability: {
        name: "Cash Flow Stability",
        value: net,
        displayValue: `${net >= 0 ? "+" : "-"}${Math.abs(net).toLocaleString()}`,
        score: cashFlowScore,
        weight: 20,
        status: cashFlowStatus,
        description: "Net inflow surplus and buffer against recurring operational obligations.",
      },
      payrollBurden: {
        name: "Payroll Burden",
        value: payrollRatio,
        displayValue: `${payrollRatio.toFixed(1)}%`,
        score: payrollScore,
        weight: 15,
        status: payrollStatus,
        description: "Staff remuneration commitment as a proportion of total operational outflows.",
      },
      revenueGrowth: {
        name: "Revenue Momentum",
        value: revGrowthPct,
        displayValue: prevIncome > 0 ? `${revGrowthPct >= 0 ? "+" : ""}${revGrowthPct.toFixed(1)}%` : "Baseline",
        score: revGrowthScore,
        weight: 10,
        status: revGrowthStatus,
        description: "Period-over-period top-line revenue velocity.",
      },
    },
    reasons,
    warnings,
    recommendations,
    calculatedAt: new Date().toISOString(),
  };
}
