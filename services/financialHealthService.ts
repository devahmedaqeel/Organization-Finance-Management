/**
 * services/financialHealthService.ts
 *
 * Deterministic Financial Health Engine for OFM.
 * Evaluates Revenue Growth, Expense Trajectory, Operating Margin, Cash Flow,
 * Budget Adherence, and Payroll Burden to produce an authoritative health score and diagnostic.
 */

import { Transaction, Budget, PayrollEntry } from "@/context/FinanceContext";
import { NormalizedPeriod, filterTransactionsByPeriod, computePeriodMetrics } from "./DatePeriodService";
import { calculateBudgetAllocation, calculateBudgetUsed } from "./FinancialCalculationEngine";

export type HealthStatus = "Excellent" | "Healthy" | "Watch" | "At Risk" | "Critical" | "No Data";

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
  hasData: boolean;
  healthScore: number | null; // 0 to 100 or null when no financial data
  displayScore: string; // "85" or "N/A"
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
 * When no financial records exist (0 transactions, 0 budgets, 0 payroll), it cleanly returns
 * an empty/neutral state (hasData: false, healthScore: null, displayScore: "N/A", status: "No Data")
 * without fabricating arbitrary filler scores such as 66.
 */
export function calculateFinancialHealth(
  transactions: Transaction[],
  budgets: Budget[],
  payroll: PayrollEntry[],
  currentPeriod?: NormalizedPeriod,
  previousPeriod?: NormalizedPeriod
): FinancialHealthReport {
  // Exclude deleted, void, or cancelled records
  const activeTxs = (transactions || []).filter(
    (t) => t && (t as any).status !== "deleted" && (t as any).status !== "void" && (t as any).status !== "cancelled"
  );
  const activeBudgets = (budgets || []).filter((b) => Number(b.allocated || 0) > 0);
  const activePayroll = (payroll || []).filter((p) => Number(p.baseSalary || 0) > 0);

  const currentTxs = currentPeriod ? filterTransactionsByPeriod(activeTxs, currentPeriod) : activeTxs;
  const prevTxs = previousPeriod ? filterTransactionsByPeriod(activeTxs, previousPeriod) : [];

  const currentMetrics = computePeriodMetrics(activeTxs, currentPeriod);
  const prevMetrics = previousPeriod ? computePeriodMetrics(activeTxs, previousPeriod) : null;

  const income = currentMetrics.totalIncome || 0;
  const expense = currentMetrics.totalExpense || 0;
  const net = currentMetrics.netBalance || 0;

  const prevIncome = prevMetrics ? (prevMetrics.totalIncome || 0) : 0;
  const prevExpense = prevMetrics ? (prevMetrics.totalExpense || 0) : 0;

  const totalBudget = calculateBudgetAllocation(activeBudgets);
  const totalBudgetSpent = calculateBudgetUsed(currentTxs, activeBudgets, currentPeriod);
  const totalPayroll = activePayroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0);

  // 1. Operating Margin (Dynamic Weight: 35 when applicable)
  const hasIncomeOrExpense = income > 0 || expense > 0;
  const marginPct = income > 0 ? (net / income) * 100 : (net >= 0 ? 0 : -100);
  let marginScore = 0;
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
  } else if (hasIncomeOrExpense) {
    marginScore = 10;
    marginStatus = "negative";
  }

  // 2. Budget Adherence (Dynamic Weight: 25 when applicable)
  const budgetUtil = totalBudget > 0 ? (totalBudgetSpent / totalBudget) * 100 : 0;
  let budgetScore = 0;
  let budgetStatus: "positive" | "neutral" | "warning" | "negative" = "neutral";
  if (totalBudget > 0) {
    if (budgetUtil <= 80) {
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
  }

  // 3. Cash Flow Stability & Liquidity (Dynamic Weight: 25 when applicable)
  let cashFlowScore = 0;
  let cashFlowStatus: "positive" | "neutral" | "warning" | "negative" = "neutral";
  if (hasIncomeOrExpense) {
    if (net > 0 && income >= expense * 1.2) {
      cashFlowScore = 95;
      cashFlowStatus = "positive";
    } else if (net > 0) {
      cashFlowScore = 85;
      cashFlowStatus = "positive";
    } else if (net === 0 && income > 0) {
      cashFlowScore = 60;
      cashFlowStatus = "neutral";
    } else if (net < 0 && Math.abs(net) < expense * 0.2) {
      cashFlowScore = 40;
      cashFlowStatus = "warning";
    } else {
      cashFlowScore = 15;
      cashFlowStatus = "negative";
    }
  }

  // 4. Payroll Burden Ratio (Dynamic Weight: 15 when applicable)
  const payrollRatio = expense > 0 ? (totalPayroll / expense) * 100 : 0;
  let payrollScore = 0;
  let payrollStatus: "positive" | "neutral" | "warning" | "negative" = "neutral";
  if (totalPayroll > 0 && expense > 0) {
    if (payrollRatio <= 40) {
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
  }

  // 5. Revenue Growth / Momentum (Dynamic Weight: 10 when applicable)
  let revGrowthScore = 0;
  let revGrowthStatus: "positive" | "neutral" | "warning" | "negative" = "neutral";
  let revGrowthPct = 0;
  if (prevIncome > 0 && income > 0) {
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

  // Dynamic Applicable Weighted Calculation:
  // Instead of injecting arbitrary filler defaults (e.g. 60, 65, 70, 80) which falsely sum to 66,
  // we ONLY sum the weights of dimensions that actually have underlying financial activity.
  let totalWeightedScore = 0;
  let totalApplicableWeight = 0;

  if (hasIncomeOrExpense) {
    totalWeightedScore += marginScore * 35;
    totalApplicableWeight += 35;
  }

  if (totalBudget > 0) {
    totalWeightedScore += budgetScore * 25;
    totalApplicableWeight += 25;
  }

  if (hasIncomeOrExpense) {
    totalWeightedScore += cashFlowScore * 25;
    totalApplicableWeight += 25;
  }

  if (totalPayroll > 0 && expense > 0) {
    totalWeightedScore += payrollScore * 15;
    totalApplicableWeight += 15;
  }

  if (prevIncome > 0 && income > 0) {
    totalWeightedScore += revGrowthScore * 10;
    totalApplicableWeight += 10;
  }

  // ZERO DATA STATE: If no financial metrics are applicable, return clean empty/neutral state
  if (totalApplicableWeight === 0) {
    return {
      hasData: false,
      healthScore: null,
      displayScore: "N/A",
      status: "No Data",
      statusColor: "#94A3B8",
      summary: "No financial data available yet. Add income, expenses, or budgets to generate financial intelligence.",
      metrics: {
        operatingMargin: {
          name: "Operating Margin",
          value: 0,
          displayValue: "N/A",
          score: 0,
          weight: 0,
          status: "neutral",
          description: "No revenue or expenses recorded to calculate operating margin.",
        },
        budgetAdherence: {
          name: "Budget Adherence",
          value: 0,
          displayValue: "N/A",
          score: 0,
          weight: 0,
          status: "neutral",
          description: "No budget allocations configured.",
        },
        cashFlowStability: {
          name: "Cash Flow Stability",
          value: 0,
          displayValue: "N/A",
          score: 0,
          weight: 0,
          status: "neutral",
          description: "No cash flow movements recorded.",
        },
        payrollBurden: {
          name: "Payroll Burden",
          value: 0,
          displayValue: "N/A",
          score: 0,
          weight: 0,
          status: "neutral",
          description: "No payroll records configured.",
        },
        revenueGrowth: {
          name: "Revenue Momentum",
          value: 0,
          displayValue: "N/A",
          score: 0,
          weight: 0,
          status: "neutral",
          description: "No historical revenue data available for trend analysis.",
        },
      },
      reasons: [],
      warnings: [],
      recommendations: ["Add income, expenses or budgets to generate financial insights."],
      calculatedAt: new Date().toISOString(),
    };
  }

  const compositeScore = Math.round(totalWeightedScore / totalApplicableWeight);
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

  if (income > 0 && marginPct > 15) {
    reasons.push(`Robust operating margin of ${marginPct.toFixed(1)}% providing strong reinvestment capacity.`);
  } else if (income > 0 && marginPct < 0) {
    warnings.push(`Operating deficit of ${Math.abs(marginPct).toFixed(1)}% detected; expenditures exceed revenue.`);
    recommendations.push("Implement spending freeze on discretionary operational cost centers.");
  } else if (expense > 0 && income === 0) {
    warnings.push("Expenditures are occurring without recorded revenue in this period.");
    recommendations.push("Record incoming grant or revenue receipts to balance operating accounts.");
  }

  if (totalBudget > 0 && budgetUtil > 90) {
    warnings.push(`Budget utilization is elevated at ${budgetUtil.toFixed(1)}% of total allocation.`);
    recommendations.push("Review department allocations and reallocate buffer funds if necessary.");
  } else if (totalBudget > 0) {
    reasons.push(`Budget spending is contained at ${budgetUtil.toFixed(1)}% of planned limits.`);
  }

  if (totalPayroll > 0 && expense > 0 && payrollRatio > 65) {
    warnings.push(`Payroll represents ${payrollRatio.toFixed(1)}% of total monthly expenses.`);
  }

  if (prevIncome > 0 && income > 0 && revGrowthPct > 10) {
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
    hasData: true,
    healthScore: clampedScore,
    displayScore: clampedScore.toString(),
    status,
    statusColor,
    summary,
    metrics: {
      operatingMargin: {
        name: "Operating Margin",
        value: marginPct,
        displayValue: hasIncomeOrExpense ? `${marginPct >= 0 ? "+" : ""}${marginPct.toFixed(1)}%` : "N/A",
        score: marginScore,
        weight: hasIncomeOrExpense ? 35 : 0,
        status: marginStatus,
        description: "Net operating surplus as a percentage of total institutional revenue.",
      },
      budgetAdherence: {
        name: "Budget Adherence",
        value: budgetUtil,
        displayValue: totalBudget > 0 ? `${budgetUtil.toFixed(1)}%` : "N/A",
        score: budgetScore,
        weight: totalBudget > 0 ? 25 : 0,
        status: budgetStatus,
        description: "Actual cost center consumption relative to authorized financial allocations.",
      },
      cashFlowStability: {
        name: "Cash Flow Stability",
        value: net,
        displayValue: hasIncomeOrExpense ? `${net >= 0 ? "+" : "-"}${Math.abs(net).toLocaleString()}` : "N/A",
        score: cashFlowScore,
        weight: hasIncomeOrExpense ? 25 : 0,
        status: cashFlowStatus,
        description: "Net inflow surplus and buffer against recurring operational obligations.",
      },
      payrollBurden: {
        name: "Payroll Burden",
        value: payrollRatio,
        displayValue: totalPayroll > 0 && expense > 0 ? `${payrollRatio.toFixed(1)}%` : "N/A",
        score: payrollScore,
        weight: totalPayroll > 0 && expense > 0 ? 15 : 0,
        status: payrollStatus,
        description: "Staff remuneration commitment as a proportion of total operational outflows.",
      },
      revenueGrowth: {
        name: "Revenue Momentum",
        value: revGrowthPct,
        displayValue: prevIncome > 0 && income > 0 ? `${revGrowthPct >= 0 ? "+" : ""}${revGrowthPct.toFixed(1)}%` : "Baseline",
        score: revGrowthScore,
        weight: prevIncome > 0 && income > 0 ? 10 : 0,
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
