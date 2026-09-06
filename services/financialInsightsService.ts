/**
 * services/financialInsightsService.ts
 *
 * Intelligent Deterministic Financial Insights Engine for OFM.
 * Synthesizes real-time ledger entries, department allocations, budget limits,
 * and payroll records into actionable, prioritized, mathematically verified insights.
 *
 * ZERO GENERIC/MOCK AI TEXT: All insights are derived strictly from authoritative financial data.
 */

import { Transaction, Budget, PayrollEntry, Department } from "@/context/FinanceContext";
import { NormalizedPeriod, filterTransactionsByPeriod, computePeriodMetrics } from "./DatePeriodService";
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetOperatingResult,
  calculateBudgetAllocation,
  calculateBudgetSpentForCategory,
  calculateBudgetRemaining,
  calculateBudgetUtilization,
  calculatePayrollCost,
  safeNumber,
} from "./FinancialCalculationEngine";

export type InsightSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

export type InsightCategory =
  | "revenue"
  | "expense"
  | "budget"
  | "payroll"
  | "cashflow"
  | "health"
  | "anomaly"
  | "duplicate"
  | "forecast";

export interface ActionableInsight {
  id: string;
  organizationId?: string;
  type: string;
  severity: InsightSeverity;
  title: string;
  summary: string;           // Short executive summary
  details?: string;          // Extended financial explanation
  whyItMatters: string;      // WHY this metric is significant
  recommendedAction: string; // WHAT action the user should take
  category: InsightCategory;
  metric: string;
  currentValue?: number;
  previousValue?: number;
  changeAmount?: number;
  changePercent?: number;
  period: string;
  sourceReference: string;
  actionRoute?: string;
  timestamp: string;
  isActionable: boolean;
  confidence: number;        // 0..1 confidence score
  isRead?: boolean;
  isDismissed?: boolean;
}

/**
 * Generates prioritized, authoritative financial insights from verified ledger data.
 */
export function generateFinancialInsights(
  transactions: Transaction[],
  budgets: Budget[],
  payroll: PayrollEntry[] = [],
  departments: Department[] = [],
  currentPeriod: NormalizedPeriod,
  previousPeriod?: NormalizedPeriod,
  currency: string = "PKR",
  orgId: string = "default_org"
): ActionableInsight[] {
  // If no transactions or budgets exist, return empty (clean state for new users)
  if ((!transactions || transactions.length === 0) && (!budgets || budgets.length === 0)) {
    return [];
  }

  const insights: ActionableInsight[] = [];
  const nowStr = new Date().toISOString();

  const currentTxs = filterTransactionsByPeriod(transactions, currentPeriod);
  const prevTxs = previousPeriod ? filterTransactionsByPeriod(transactions, previousPeriod) : [];

  const income = calculateTotalIncome(currentTxs);
  const expense = calculateTotalExpenses(currentTxs);
  const net = calculateNetOperatingResult(currentTxs);

  const prevIncome = previousPeriod ? calculateTotalIncome(prevTxs) : 0;
  const prevExpense = previousPeriod ? calculateTotalExpenses(prevTxs) : 0;

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CASH FLOW & OPERATING RESULT INSIGHTS
  // ──────────────────────────────────────────────────────────────────────────
  const totalBudgeted = calculateBudgetAllocation(budgets, departments);
  const totalPool = income + totalBudgeted;
  const poolNet = totalPool - expense;

  if (net < 0 && expense > 0) {
    const isBudgetCovered = totalBudgeted > 0 && poolNet >= 0;
    const burnRatio = income > 0 ? (expense / income) * 100 : 100;
    const excessOverRevenue = income > 0 ? ((expense - income) / income) * 100 : 100;
    insights.push({
      id: `cf-deficit-${currentPeriod.label}`,
      organizationId: orgId,
      type: "OPERATING_DEFICIT",
      title: isBudgetCovered ? "Operating Deficit (Budget-Covered)" : "Operating Deficit Notice",
      summary: isBudgetCovered
        ? `Disbursements exceed recognized inflows by ${currency} ${Math.abs(net).toLocaleString()} during ${currentPeriod.label}, but remain fully funded by the approved budget capital pool (${currency} ${poolNet.toLocaleString()} surplus remaining).`
        : `Disbursements exceed recognized institutional inflows by ${currency} ${Math.abs(net).toLocaleString()} during ${currentPeriod.label}.`,
      whyItMatters: isBudgetCovered
        ? `Disbursements exceed incoming revenue by ${excessOverRevenue.toFixed(1)}%, but are authorized and funded by pre-allocated institutional budget capital (${currency} ${poolNet.toLocaleString()} surplus remaining).`
        : income > 0
        ? `Disbursements exceed incoming revenue by ${excessOverRevenue.toFixed(1)}% (total spending is ${burnRatio.toFixed(1)}% of inflows), creating a deficit that degrades treasury reserves.`
        : `Operating with zero incoming revenue (${currency} ${expense.toLocaleString()} disbursed), which depletes cash reserves.`,
      recommendedAction: isBudgetCovered
        ? "Continue planned budget execution while tracking category disbursements against department caps."
        : "Review discretionary disbursements in Expenses and pause non-essential requisitions.",
      severity: "CRITICAL",
      category: "cashflow",
      metric: isBudgetCovered
        ? `+${currency} ${poolNet.toLocaleString()} (Pool Surplus)`
        : `-${currency} ${Math.abs(net).toLocaleString()} (-${excessOverRevenue.toFixed(1)}% Deficit)`,
      currentValue: isBudgetCovered ? poolNet : net,
      period: currentPeriod.label,
      sourceReference: isBudgetCovered ? "Executive Capital Pool Ledger" : "Executive Cash Flow Ledger",
      actionRoute: "/(tabs)/expenses",
      timestamp: nowStr,
      isActionable: true,
      confidence: 1.0,
    });
  } else if (net > 0 && income > 0) {
    const margin = (net / income) * 100;
    const isBudgetCovered = totalBudgeted > 0;
    const poolRetainedPct = totalPool > 0 ? (poolNet / totalPool) * 100 : 0;
    insights.push({
      id: `cf-surplus-${currentPeriod.label}`,
      organizationId: orgId,
      type: "OPERATING_SURPLUS",
      title: isBudgetCovered ? "Positive Operating Surplus & Capital Pool" : "Positive Operating Surplus",
      summary: isBudgetCovered
        ? `Net operating surplus of ${currency} ${net.toLocaleString()} (+${margin.toFixed(1)}% operating margin) achieved. Combined with the approved ${currency} ${totalBudgeted.toLocaleString()} budget, total institutional capital stands at ${currency} ${poolNet.toLocaleString()} (${poolRetainedPct.toFixed(0)}% retained).`
        : `Net operating surplus of ${currency} ${net.toLocaleString()} achieved with a +${margin.toFixed(1)}% operating margin.`,
      whyItMatters: isBudgetCovered
        ? `Operating strictly within recognized revenues preserves 100% of approved budget reserves for scheduled milestones.`
        : "Healthy operating margins maintain liquid capital reserves for planned infrastructure.",
      recommendedAction: "Maintain current expenditure controls and review the consolidated statement for capital reserve allocations.",
      severity: "SUCCESS",
      category: "cashflow",
      metric: isBudgetCovered
        ? `+${currency} ${poolNet.toLocaleString()} (${poolRetainedPct.toFixed(0)}% Retained)`
        : `+${currency} ${net.toLocaleString()} (${margin.toFixed(1)}% NOM)`,
      currentValue: isBudgetCovered ? poolNet : net,
      changePercent: margin,
      period: currentPeriod.label,
      sourceReference: isBudgetCovered ? "Executive Capital Pool Ledger" : "Statement of Financial Operations",
      actionRoute: "/(tabs)/reports",
      timestamp: nowStr,
      isActionable: true,
      confidence: 1.0,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. PERIOD-OVER-PERIOD INCOME & EXPENSE VELOCITY
  // ──────────────────────────────────────────────────────────────────────────
  if (previousPeriod && prevIncome > 0 && income > 0) {
    const incChangePct = ((income - prevIncome) / prevIncome) * 100;
    const diff = income - prevIncome;
    if (incChangePct >= 15) {
      insights.push({
        id: `inc-growth-${currentPeriod.label}`,
        organizationId: orgId,
        type: "INCOME_GROWTH",
        title: "Revenue Expansion",
        summary: `Inflows grew by +${incChangePct.toFixed(1)}% (${currency} ${diff.toLocaleString()}) compared to prior period.`,
        whyItMatters: "Higher institutional revenue strengthens operational stability and enables expanded department allocations.",
        recommendedAction: "Review high-performing revenue categories and verify timely receivable collections.",
        severity: "SUCCESS",
        category: "revenue",
        metric: `+${incChangePct.toFixed(1)}% Inflows`,
        currentValue: income,
        previousValue: prevIncome,
        changeAmount: diff,
        changePercent: incChangePct,
        period: currentPeriod.label,
        sourceReference: "Inflow Transactions Ledger",
        actionRoute: "/(tabs)/income",
        timestamp: nowStr,
        isActionable: false,
        confidence: 0.95,
      });
    } else if (incChangePct <= -15) {
      insights.push({
        id: `inc-decline-${currentPeriod.label}`,
        organizationId: orgId,
        type: "INCOME_DECLINE",
        title: "Revenue Contraction Warning",
        summary: `Inflows declined by ${Math.abs(incChangePct).toFixed(1)}% (${currency} ${Math.abs(diff).toLocaleString()}) compared to prior period.`,
        whyItMatters: "Sustained revenue contraction requires proactive expense rationalization to avoid deficits.",
        recommendedAction: "Audit outstanding client grants/invoices and review collection follow-ups.",
        severity: "WARNING",
        category: "revenue",
        metric: `${incChangePct.toFixed(1)}% Inflow Contraction`,
        currentValue: income,
        previousValue: prevIncome,
        changeAmount: diff,
        changePercent: incChangePct,
        period: currentPeriod.label,
        sourceReference: "Inflow Transactions Ledger",
        actionRoute: "/(tabs)/income",
        timestamp: nowStr,
        isActionable: true,
        confidence: 0.95,
      });
    }
  }

  if (previousPeriod && prevExpense > 0 && expense > 0) {
    const expChangePct = ((expense - prevExpense) / prevExpense) * 100;
    const diff = expense - prevExpense;
    if (expChangePct >= 20) {
      insights.push({
        id: `exp-surge-${currentPeriod.label}`,
        organizationId: orgId,
        type: "EXPENSE_SURGE",
        title: "Outflow Acceleration Alert",
        summary: `Operational spending increased by +${expChangePct.toFixed(1)}% (${currency} ${diff.toLocaleString()}) vs prior period.`,
        whyItMatters: "Rapid cost growth can quickly outpace revenue growth and deplete operating buffers.",
        recommendedAction: "Examine department-level expenditure variance and verify all large purchase orders.",
        severity: expChangePct >= 35 ? "CRITICAL" : "WARNING",
        category: "expense",
        metric: `+${expChangePct.toFixed(1)}% Outflows`,
        currentValue: expense,
        previousValue: prevExpense,
        changeAmount: diff,
        changePercent: expChangePct,
        period: currentPeriod.label,
        sourceReference: "Outflow Transactions Ledger",
        actionRoute: "/(tabs)/expenses",
        timestamp: nowStr,
        isActionable: true,
        confidence: 0.95,
      });
    } else if (expChangePct <= -15) {
      insights.push({
        id: `exp-reduction-${currentPeriod.label}`,
        organizationId: orgId,
        type: "EXPENSE_OPTIMIZATION",
        title: "Expenditure Reduction Achieved",
        summary: `Operating costs decreased by ${Math.abs(expChangePct).toFixed(1)}% (${currency} ${Math.abs(diff).toLocaleString()}) compared to prior period.`,
        whyItMatters: "Prudent spending discipline expands available net operating margin.",
        recommendedAction: "Acknowledge cost-effective procurement practices across active departments.",
        severity: "SUCCESS",
        category: "expense",
        metric: `${expChangePct.toFixed(1)}% Reduced Outflow`,
        currentValue: expense,
        previousValue: prevExpense,
        changeAmount: diff,
        changePercent: expChangePct,
        period: currentPeriod.label,
        sourceReference: "Outflow Transactions Ledger",
        actionRoute: "/(tabs)/expenses",
        timestamp: nowStr,
        isActionable: false,
        confidence: 0.95,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. EXPENSE CATEGORY CONCENTRATION
  // ──────────────────────────────────────────────────────────────────────────
  const catTotals: Record<string, { amount: number; count: number }> = {};
  currentTxs
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const cat = t.category || "General Operations";
      if (!catTotals[cat]) catTotals[cat] = { amount: 0, count: 0 };
      catTotals[cat].amount += safeNumber(t.amount, 0);
      catTotals[cat].count += 1;
    });

  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1].amount - a[1].amount);
  const totalPayroll = calculatePayrollCost(payroll);

  if (sortedCats.length > 0 && expense > 0) {
    const [topCat, topData] = sortedCats[0];
    const topPct = (topData.amount / expense) * 100;
    const isPayrollCat = /salary|salaries|payroll|wage|compensation|stipend/i.test(topCat);

    // If this category is payroll/salaries and payroll records exist, skip here to avoid duplicating Section 5
    if (topPct >= 35 && (!isPayrollCat || totalPayroll === 0)) {
      insights.push({
        id: `cat-concentration-${topCat}`,
        organizationId: orgId,
        type: "CATEGORY_CONCENTRATION",
        title: isPayrollCat ? `Remuneration Outflow Concentration: ${topCat}` : `Heavy Outflow Concentration: ${topCat}`,
        summary: `${topCat} represents ${topPct.toFixed(1)}% of all period disbursements (${currency} ${topData.amount.toLocaleString()}).`,
        whyItMatters: isPayrollCat
          ? "Fixed staff remuneration requires stable recurring receipts to maintain timely disbursements."
          : "High concentration in a single expense line item reduces overall budgetary flexibility.",
        recommendedAction: isPayrollCat
          ? "Review recurring compensation schedules in Payroll to align upcoming disbursements with revenue milestones."
          : `Inspect individual vendor disbursements within ${topCat} to evaluate recurring service contracts.`,
        severity: net < 0 && topPct >= 55 ? "WARNING" : "INFO",
        category: isPayrollCat ? "payroll" : "expense",
        metric: `${topPct.toFixed(1)}% of Total Outflows`,
        currentValue: topData.amount,
        changePercent: topPct,
        period: currentPeriod.label,
        sourceReference: `Expense Category / ${topCat}`,
        actionRoute: isPayrollCat ? "/payroll" : "/(tabs)/expenses",
        timestamp: nowStr,
        isActionable: true,
        confidence: 0.9,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. BUDGET LIMITS, UTILIZATION & VELOCITY FORECAST
  // ──────────────────────────────────────────────────────────────────────────
  budgets.forEach((b) => {
    const allocated = safeNumber(b.allocated, 0);
    const spent = calculateBudgetSpentForCategory(b, currentTxs, currentPeriod);
    if (allocated > 0) {
      const util = (spent / allocated) * 100;
      const remaining = calculateBudgetRemaining(allocated, spent);

      if (util > 100) {
        const excess = spent - allocated;
        const overrunPct = (excess / allocated) * 100;
        insights.push({
          id: `budget-over-${b.id}`,
          organizationId: orgId,
          type: "BUDGET_OVERRUN",
          title: `Budget Limit Exceeded: ${b.category || b.department}`,
          summary: `${b.category || b.department} has spent ${currency} ${spent.toLocaleString()} (${util.toFixed(1)}% of allocated budget), exceeding its limit of ${currency} ${allocated.toLocaleString()} by ${currency} ${excess.toLocaleString()} (+${overrunPct.toFixed(1)}% over budget).`,
          whyItMatters: "Unauthorized budget overruns directly degrade institutional operating margin.",
          recommendedAction: "Request formal budget expansion authorization or freeze unapproved disbursements.",
          severity: "CRITICAL",
          category: "budget",
          metric: `+${overrunPct.toFixed(1)}% Over Budget (${util.toFixed(1)}% Utilized)`,
          currentValue: spent,
          previousValue: allocated,
          changeAmount: excess,
          changePercent: overrunPct,
          period: currentPeriod.label,
          sourceReference: `Budget Control / ${b.category || b.department}`,
          actionRoute: "/budget",
          timestamp: nowStr,
          isActionable: true,
          confidence: 1.0,
        });
      } else if (util >= 85) {
        insights.push({
          id: `budget-warn-${b.id}`,
          organizationId: orgId,
          type: "BUDGET_WARNING",
          title: `Budget Approaching Ceiling: ${b.category || b.department}`,
          summary: `${b.category || b.department} is at ${util.toFixed(1)}% capacity with ${currency} ${remaining.toLocaleString()} remaining.`,
          whyItMatters: "Cost center is close to exhaustion before period conclusion.",
          recommendedAction: "Review scheduled requisitions to avoid budget overrun.",
          severity: "WARNING",
          category: "budget",
          metric: `${util.toFixed(1)}% Utilized (${currency} ${remaining.toLocaleString()} Left)`,
          currentValue: spent,
          previousValue: allocated,
          changeAmount: remaining,
          changePercent: util,
          period: currentPeriod.label,
          sourceReference: `Budget Control / ${b.category || b.department}`,
          actionRoute: "/budget",
          timestamp: nowStr,
          isActionable: true,
          confidence: 0.95,
        });
      } else if (spent === 0) {
        insights.push({
          id: `budget-unspent-${b.id}`,
          organizationId: orgId,
          type: "BUDGET_UNSPENT",
          title: `Approved Budget Reserves Intact: ${b.category || b.department}`,
          summary: `Approved budget allocation of ${currency} ${allocated.toLocaleString()} remains 100% intact with zero disbursements recorded.`,
          whyItMatters: "Operations are presently self-funded from recognized revenue, preserving pre-allocated capital reserves for scheduled initiatives.",
          recommendedAction: "Review departmental milestones in Budget Allocations to track project execution or deploy capital.",
          severity: "INFO",
          category: "budget",
          metric: `0% Disbursed (${currency} ${allocated.toLocaleString()} Intact)`,
          currentValue: 0,
          previousValue: allocated,
          changeAmount: allocated,
          changePercent: 0,
          period: currentPeriod.label,
          sourceReference: `Budget Control / ${b.category || b.department}`,
          actionRoute: "/budget",
          timestamp: nowStr,
          isActionable: true,
          confidence: 1.0,
        });
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. PAYROLL DISBURSAL WEIGHT
  // ──────────────────────────────────────────────────────────────────────────
  if (expense > 0 && totalPayroll > 0) {
    const payrollPct = (totalPayroll / expense) * 100;
    const revPct = income > 0 ? (totalPayroll / income) * 100 : null;
    if (payrollPct >= 45) {
      insights.push({
        id: `payroll-weight-${currentPeriod.label}`,
        organizationId: orgId,
        type: "PAYROLL_WEIGHT",
        title: "Staff Compensation Commitment",
        summary: `Staff compensation represents ${payrollPct.toFixed(1)}% of total period disbursements (${currency} ${totalPayroll.toLocaleString()})${revPct !== null ? `, accounted at ${revPct.toFixed(1)}% of revenue` : ""}.`,
        whyItMatters: revPct !== null && revPct <= 50
          ? `Remuneration commitments are well-calibrated against operating revenue (${revPct.toFixed(1)}% of inflows), ensuring stable liquidity.`
          : "Fixed remuneration obligations require stable recurring cash receipts to ensure timely disbursement.",
        recommendedAction: "Verify upcoming monthly payroll cycles and ensure scheduled disbursements align with milestone receivables.",
        severity: net < 0 && payrollPct >= 65 ? "WARNING" : "INFO",
        category: "payroll",
        metric: `${payrollPct.toFixed(1)}% of Outflows${revPct !== null ? ` (${revPct.toFixed(1)}% of Inflows)` : ""}`,
        currentValue: totalPayroll,
        changePercent: payrollPct,
        period: currentPeriod.label,
        sourceReference: `Payroll Disbursals (${payroll.length} Staff)`,
        actionRoute: "/payroll",
        timestamp: nowStr,
        isActionable: true,
        confidence: 0.95,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. ANOMALY DETECTION (STATISTICAL OUTLIER DETECTION)
  // ──────────────────────────────────────────────────────────────────────────
  const expenseTxs = currentTxs.filter((t) => t.type === "expense");
  // Outlier detection requires sufficient sample size (>= 5 transactions) for statistical validity
  if (expenseTxs.length >= 5) {
    const amounts = expenseTxs.map((t) => safeNumber(t.amount, 0));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const maxTx = expenseTxs.reduce((prev, curr) => (curr.amount > prev.amount ? curr : prev));

    if (maxTx.amount >= avg * 2.5 && maxTx.amount >= 15000) {
      insights.push({
        id: `tx-anomaly-${maxTx.id}`,
        organizationId: orgId,
        type: "TRANSACTION_ANOMALY",
        title: `Unusually Large Outflow: ${maxTx.category}`,
        summary: `Disbursement of ${currency} ${maxTx.amount.toLocaleString()} for ${maxTx.category} is ${(maxTx.amount / avg).toFixed(1)}x higher than average ticket size (${currency} ${Math.round(avg).toLocaleString()}).`,
        whyItMatters: "Outlier transactions can indicate unbudgeted capital outlays or miscategorized entries.",
        recommendedAction: `Verify invoice documentation and authorization for entry "${maxTx.description || maxTx.category}".`,
        severity: "WARNING",
        category: "anomaly",
        metric: `${currency} ${maxTx.amount.toLocaleString()} (${(maxTx.amount / avg).toFixed(1)}x avg)`,
        currentValue: maxTx.amount,
        period: currentPeriod.label,
        sourceReference: `Transaction Ref: ${maxTx.id.slice(-6).toUpperCase()}`,
        actionRoute: "/(tabs)/expenses",
        timestamp: nowStr,
        isActionable: true,
        confidence: 0.9,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. POTENTIAL DUPLICATE TRANSACTION DETECTION
  // ──────────────────────────────────────────────────────────────────────────
  for (let i = 0; i < currentTxs.length; i++) {
    for (let j = i + 1; j < currentTxs.length; j++) {
      const t1 = currentTxs[i];
      const t2 = currentTxs[j];
      if (
        t1.type === t2.type &&
        t1.amount === t2.amount &&
        t1.category === t2.category &&
        t1.department === t2.department &&
        t1.amount >= 1000
      ) {
        const d1 = new Date(t1.date).getTime();
        const d2 = new Date(t2.date).getTime();
        const daysDiff = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);

        if (daysDiff <= 3) {
          insights.push({
            id: `tx-dup-${t1.id}-${t2.id}`,
            organizationId: orgId,
            type: "POTENTIAL_DUPLICATE",
            title: `Potential Duplicate Transaction: ${t1.category}`,
            summary: `Two identical ${t1.type} entries of ${currency} ${t1.amount.toLocaleString()} recorded within ${Math.round(daysDiff)} days (${t1.date} and ${t2.date}).`,
            whyItMatters: "Accidental double-posting inflates expenses or revenues and distorts financial statements.",
            recommendedAction: "Inspect both transactions and remove or reconcile any duplicate ledger record.",
            severity: "WARNING",
            category: "duplicate",
            metric: `2x ${currency} ${t1.amount.toLocaleString()}`,
            currentValue: t1.amount,
            period: currentPeriod.label,
            sourceReference: `Entries: ${t1.id.slice(-4)} & ${t2.id.slice(-4)}`,
            actionRoute: t1.type === "income" ? "/(tabs)/income" : "/(tabs)/expenses",
            timestamp: nowStr,
            isActionable: true,
            confidence: 0.85,
          });
          break; // Flag one duplicate pair per batch
        }
      }
    }
  }

  // Sort insights strictly by severity priority: CRITICAL -> WARNING -> SUCCESS -> INFO
  const severityOrder: Record<InsightSeverity, number> = {
    CRITICAL: 0,
    WARNING: 1,
    SUCCESS: 2,
    INFO: 3,
  };

  return insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
