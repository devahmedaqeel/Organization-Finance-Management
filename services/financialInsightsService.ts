/**
 * services/financialInsightsService.ts
 *
 * Intelligent Deterministic Financial Insights Engine for OFM.
 * Synthesizes real-time ledger entries, department allocations, budget limits,
 * and payroll records into actionable, prioritized, mathematically verified insights.
 *
 * ZERO GENERIC/MOCK AI TEXT: All insights are derived strictly from authoritative financial data.
 * Fully adapts dynamically to all 6 data availability scenarios:
 * 1. Zero Data (clean empty state)
 * 2. Income Only (inflow recognition without unsupported expense/budget claims)
 * 3. Income + Expense (surplus, deficit, break-even balance)
 * 4. Budget + Expense (overall institutional utilization and category/pool limits)
 * 5. Department Data (spending concentration, budget adherence, unbudgeted expenditure)
 * 6. Payroll Data (remuneration share of expenses and revenue alignment)
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
  calculateUnallocatedFunds,
  calculateBudgetUsed,
  safeNumber,
} from "./FinancialCalculationEngine";

export type InsightSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

export type InsightCategory =
  | "revenue"
  | "expense"
  | "budget"
  | "department"
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
  summary: string;           // WHAT: Short executive summary
  details?: string;          // Extended financial explanation
  whyItMatters: string;      // WHY: Significance of the metric
  recommendedAction: string; // ACTION: What action the user should take
  category: InsightCategory;
  metric: string;            // DATA CONTEXT: Exact amount, percentage, or comparison
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
 * Generates prioritized, authoritative financial insights strictly from verified database records.
 * Adapts dynamically to whatever real data is available.
 */
export function generateFinancialInsights(
  transactions: Transaction[] = [],
  budgets: Budget[] = [],
  payroll: PayrollEntry[] = [],
  departments: Department[] = [],
  currentPeriod: NormalizedPeriod,
  previousPeriod?: NormalizedPeriod,
  currency: string = "PKR",
  orgId: string = "default_org"
): ActionableInsight[] {
  // Exclude deleted, void, or cancelled records
  const validTxs = (transactions || []).filter((t) => {
    if (!t) return false;
    const status = (t as any).status;
    return status !== "deleted" && status !== "void" && status !== "cancelled";
  });
  const validBudgets = (budgets || []).filter((b) => b && Number(b.allocated || 0) > 0);
  const validDepts = (departments || []).filter((d) => d && (d.name || "").trim().length > 0);
  const validDeptBudgets = validDepts.filter((d) => Number(d.budgetAllocated || 0) > 0);
  const validPayroll = (payroll || []).filter((p) => p && Number(p.baseSalary || 0) > 0);

  // ──────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: ZERO FINANCIAL DATA (Clean State)
  // ──────────────────────────────────────────────────────────────────────────
  if (
    validTxs.length === 0 &&
    validBudgets.length === 0 &&
    validDeptBudgets.length === 0 &&
    validPayroll.length === 0
  ) {
    return [];
  }

  const insights: ActionableInsight[] = [];
  const nowStr = new Date().toISOString();

  const currentTxs = filterTransactionsByPeriod(validTxs, currentPeriod);
  const prevTxs = previousPeriod ? filterTransactionsByPeriod(validTxs, previousPeriod) : [];

  const income = calculateTotalIncome(currentTxs);
  const expense = calculateTotalExpenses(currentTxs);
  const net = calculateNetOperatingResult(currentTxs);

  const prevIncome = previousPeriod ? calculateTotalIncome(prevTxs) : 0;
  const prevExpense = previousPeriod ? calculateTotalExpenses(prevTxs) : 0;

  const totalBudgeted = calculateBudgetAllocation(validBudgets, validDepts);
  const totalBudgetSpent = calculateBudgetUsed(currentTxs, validBudgets, undefined, validDepts);
  const netBudgetRemaining = calculateBudgetRemaining(totalBudgeted, totalBudgetSpent);
  const unallocatedFunds = Math.max(0, net - totalBudgeted);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CASH FLOW & OPERATING BALANCE INSIGHTS (Scenarios 2 & 3)
  // ──────────────────────────────────────────────────────────────────────────
  if (income > 0 && expense === 0) {
    // SCENARIO 2: INCOME ONLY (Zero Outflows)
    insights.push({
      id: `cf-inflow-only-${currentPeriod.label}`,
      organizationId: orgId,
      type: "INFLOW_RECOGNITION",
      title: "Recognized Inflow Surplus",
      summary: `Recognized institutional inflows of ${currency} ${income.toLocaleString()} recorded during ${currentPeriod.label} with zero operational disbursements to date.`,
      whyItMatters: `Operating with zero outflows preserves 100% of recognized capital (${currency} ${income.toLocaleString()} liquid cash), available for planned departmental or operational allocations.`,
      recommendedAction: totalBudgeted > 0
        ? "Review authorized department budget allocations before disbursing funds."
        : "Configure department budget targets in Budgets to guide planned operational deployment.",
      severity: "SUCCESS",
      category: "cashflow",
      metric: `+${currency} ${income.toLocaleString()} (0 Outflows)`,
      currentValue: income,
      changePercent: 100,
      period: currentPeriod.label,
      sourceReference: "Inflow Transactions Ledger",
      actionRoute: totalBudgeted > 0 ? "/(tabs)/reports" : "/budget",
      timestamp: nowStr,
      isActionable: true,
      confidence: 1.0,
    });
  } else if (net < 0 && expense > 0) {
    // SCENARIO 3A: OPERATING DEFICIT (Outflows > Inflows)
    const isBudgetCovered = totalBudgeted > 0 && totalBudgetSpent <= totalBudgeted;
    const excessOverRevenue = income > 0 ? ((expense - income) / income) * 100 : 100;
    const burnRatio = income > 0 ? (expense / income) * 100 : 100;

    insights.push({
      id: `cf-deficit-${currentPeriod.label}`,
      organizationId: orgId,
      type: "OPERATING_DEFICIT",
      title: isBudgetCovered ? "Operating Deficit (Within Department Budget)" : "Operating Deficit Notice",
      summary: isBudgetCovered
        ? `Disbursements exceed recognized inflows by ${currency} ${Math.abs(net).toLocaleString()} during ${currentPeriod.label}, but remain authorized within departmental budget allocations (${currency} ${netBudgetRemaining.toLocaleString()} remaining).`
        : `Disbursements of ${currency} ${expense.toLocaleString()} exceed recognized institutional inflows (${currency} ${income.toLocaleString()}) by ${currency} ${Math.abs(net).toLocaleString()} during ${currentPeriod.label}.`,
      whyItMatters: isBudgetCovered
        ? `Disbursements exceed incoming revenue by ${excessOverRevenue.toFixed(1)}%, but are authorized within pre-allocated budget reserves (${currency} ${netBudgetRemaining.toLocaleString()} remaining).`
        : income > 0
        ? `Disbursements exceed incoming revenue by ${excessOverRevenue.toFixed(1)}% (outflows are ${burnRatio.toFixed(1)}% of inflows), creating a deficit that degrades cash reserves.`
        : `Operating with zero incoming revenue while disbursing ${currency} ${expense.toLocaleString()}, which directly depletes treasury reserves.`,
      recommendedAction: isBudgetCovered
        ? "Continue planned budget execution while tracking category disbursements against department caps."
        : "Review discretionary disbursements in Expenses and pause non-essential requisitions.",
      severity: "CRITICAL",
      category: "cashflow",
      metric: isBudgetCovered
        ? `-${currency} ${Math.abs(net).toLocaleString()} (${currency} ${netBudgetRemaining.toLocaleString()} Budget Left)`
        : `-${currency} ${Math.abs(net).toLocaleString()} (-${excessOverRevenue.toFixed(1)}% Deficit)`,
      currentValue: net,
      period: currentPeriod.label,
      sourceReference: isBudgetCovered ? "Department Budget Ledger" : "Executive Cash Flow Ledger",
      actionRoute: "/(tabs)/expenses",
      timestamp: nowStr,
      isActionable: true,
      confidence: 1.0,
    });
  } else if (net > 0 && income > 0 && expense > 0) {
    // SCENARIO 3B: OPERATING SURPLUS (Inflows > Outflows)
    const margin = (net / income) * 100;
    const isBudgetCovered = totalBudgeted > 0;
    const unallocatedPct = net > 0 ? (unallocatedFunds / net) * 100 : 0;

    insights.push({
      id: `cf-surplus-${currentPeriod.label}`,
      organizationId: orgId,
      type: "OPERATING_SURPLUS",
      title: isBudgetCovered ? "Positive Operating Cashflow & Budget Allocation" : "Positive Operating Surplus",
      summary: isBudgetCovered
        ? `Net operating cashflow of ${currency} ${net.toLocaleString()} (+${margin.toFixed(1)}% margin) achieved. Department budgets allocated: ${currency} ${totalBudgeted.toLocaleString()} (${currency} ${unallocatedFunds.toLocaleString()} unallocated reserve).`
        : `Net operating surplus of ${currency} ${net.toLocaleString()} achieved with a +${margin.toFixed(1)}% operating margin.`,
      whyItMatters: isBudgetCovered
        ? `Operating with positive cashflow preserves liquidity while retaining ${currency} ${unallocatedFunds.toLocaleString()} (${unallocatedPct.toFixed(0)}%) in unallocated reserve capital.`
        : "Healthy operating margins maintain liquid capital reserves for planned institutional development.",
      recommendedAction: "Maintain current expenditure controls and review the consolidated statement for capital reserve allocations.",
      severity: "SUCCESS",
      category: "cashflow",
      metric: isBudgetCovered
        ? `+${currency} ${net.toLocaleString()} (${currency} ${unallocatedFunds.toLocaleString()} Available)`
        : `+${currency} ${net.toLocaleString()} (+${margin.toFixed(1)}% NOM)`,
      currentValue: net,
      changePercent: margin,
      period: currentPeriod.label,
      sourceReference: isBudgetCovered ? "Department Budget Allocation Ledger" : "Statement of Financial Operations",
      actionRoute: "/(tabs)/reports",
      timestamp: nowStr,
      isActionable: true,
      confidence: 1.0,
    });
  } else if (net === 0 && income > 0 && expense > 0) {
    // SCENARIO 3C: BREAK-EVEN BALANCE (Inflows === Outflows)
    insights.push({
      id: `cf-breakeven-${currentPeriod.label}`,
      organizationId: orgId,
      type: "BALANCED_OPERATIONS",
      title: "Break-Even Operating Balance",
      summary: `Recognized inflows of ${currency} ${income.toLocaleString()} exactly match operational disbursements of ${currency} ${expense.toLocaleString()} during ${currentPeriod.label}.`,
      whyItMatters: "Operating at exact break-even preserves existing cash reserves but provides 0.0% financial buffer against unforeseen operational obligations.",
      recommendedAction: "Review discretionary disbursements in Expenses to generate an operating surplus margin.",
      severity: "INFO",
      category: "cashflow",
      metric: `Balanced: ${currency} ${income.toLocaleString()} (0 Net)`,
      currentValue: 0,
      changePercent: 0,
      period: currentPeriod.label,
      sourceReference: "Operating Ledger Balance",
      actionRoute: "/(tabs)/expenses",
      timestamp: nowStr,
      isActionable: true,
      confidence: 1.0,
    });
  } else if (income === 0 && expense === 0 && currentTxs.length === 0 && validTxs.length > 0) {
    // Current period has 0 records but other periods have records
    insights.push({
      id: `period-inactive-${currentPeriod.label}`,
      organizationId: orgId,
      type: "PERIOD_INACTIVE",
      title: `No Recorded Activity in ${currentPeriod.label}`,
      summary: `Zero revenue and zero disbursements recorded for ${currentPeriod.label}.`,
      whyItMatters: "Financial monitoring requires continuous ledger recording to detect variance and preserve institutional runway.",
      recommendedAction: "Record new inflows or expense receipts for this period, or switch timeline range to All Time.",
      severity: "INFO",
      category: "cashflow",
      metric: "0 Transactions",
      period: currentPeriod.label,
      sourceReference: "Period Timeline Filter",
      actionRoute: "/(tabs)/income",
      timestamp: nowStr,
      isActionable: true,
      confidence: 1.0,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. PERIOD-OVER-PERIOD HISTORICAL TRENDS (STRICTLY GATED)
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
        summary: `Inflows grew by +${incChangePct.toFixed(1)}% (${currency} ${diff.toLocaleString()}) compared to ${previousPeriod.label} (${currency} ${prevIncome.toLocaleString()}).`,
        whyItMatters: "Higher institutional revenue strengthens operational stability and enables expanded department allocations.",
        recommendedAction: "Review high-performing revenue categories and verify timely receivable collections.",
        severity: "SUCCESS",
        category: "revenue",
        metric: `+${incChangePct.toFixed(1)}% Inflows (+${currency} ${diff.toLocaleString()})`,
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
        summary: `Inflows declined by ${Math.abs(incChangePct).toFixed(1)}% (${currency} ${Math.abs(diff).toLocaleString()}) compared to ${previousPeriod.label} (${currency} ${prevIncome.toLocaleString()}).`,
        whyItMatters: "Sustained revenue contraction requires proactive expense rationalization to avoid operating deficits.",
        recommendedAction: "Audit outstanding client grants/invoices and review collection follow-ups.",
        severity: "WARNING",
        category: "revenue",
        metric: `${incChangePct.toFixed(1)}% Inflow Contraction (-${currency} ${Math.abs(diff).toLocaleString()})`,
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
        summary: `Operational spending increased by +${expChangePct.toFixed(1)}% (${currency} ${diff.toLocaleString()}) vs ${previousPeriod.label} (${currency} ${prevExpense.toLocaleString()}).`,
        whyItMatters: "Rapid cost growth can quickly outpace revenue growth and deplete operating cash reserves.",
        recommendedAction: "Examine department-level expenditure variance and verify all large purchase orders.",
        severity: expChangePct >= 35 ? "CRITICAL" : "WARNING",
        category: "expense",
        metric: `+${expChangePct.toFixed(1)}% Outflows (+${currency} ${diff.toLocaleString()})`,
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
        summary: `Operating costs decreased by ${Math.abs(expChangePct).toFixed(1)}% (${currency} ${Math.abs(diff).toLocaleString()}) compared to ${previousPeriod.label} (${currency} ${prevExpense.toLocaleString()}).`,
        whyItMatters: "Prudent spending discipline expands available net operating margin.",
        recommendedAction: "Acknowledge cost-effective procurement practices across active departments.",
        severity: "SUCCESS",
        category: "expense",
        metric: `${expChangePct.toFixed(1)}% Reduced Outflow (-${currency} ${Math.abs(diff).toLocaleString()})`,
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
  const totalPayroll = calculatePayrollCost(validPayroll);

  if (sortedCats.length > 0 && expense > 0) {
    const [topCat, topData] = sortedCats[0];
    const topPct = (topData.amount / expense) * 100;
    const isPayrollCat = /salary|salaries|payroll|wage|compensation|stipend/i.test(topCat);

    // If this category is payroll/salaries and payroll records exist, skip here to avoid duplicating Section 6
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
        metric: `${topPct.toFixed(1)}% of Outflows (${currency} ${topData.amount.toLocaleString()})`,
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
  // 4. OVERALL & CATEGORY BUDGET UTILIZATION (SCENARIO 4)
  // ──────────────────────────────────────────────────────────────────────────
  // 4A. Overall Institutional Budget Utilization
  if (totalBudgeted > 0 && expense > 0) {
    const overallUtil = (totalBudgetSpent / totalBudgeted) * 100;
    if (overallUtil > 100) {
      const overallExcess = totalBudgetSpent - totalBudgeted;
      insights.push({
        id: `overall-budget-overrun-${currentPeriod.label}`,
        organizationId: orgId,
        type: "OVERALL_BUDGET_OVERRUN",
        title: "Institutional Budget Limit Exceeded",
        summary: `Total departmental spending of ${currency} ${totalBudgetSpent.toLocaleString()} has exceeded the institutional allocation of ${currency} ${totalBudgeted.toLocaleString()} by ${currency} ${overallExcess.toLocaleString()} (${overallUtil.toFixed(1)}% utilized).`,
        whyItMatters: "Cumulative budget overruns compromise organizational solvency and drain capital reserves.",
        recommendedAction: "Review active departmental disbursements in Budget and enforce spending freezes on depleted cost centers.",
        severity: "CRITICAL",
        category: "budget",
        metric: `+${(overallUtil - 100).toFixed(1)}% Over Cap (${currency} ${overallExcess.toLocaleString()})`,
        currentValue: totalBudgetSpent,
        previousValue: totalBudgeted,
        changeAmount: overallExcess,
        changePercent: overallUtil,
        period: currentPeriod.label,
        sourceReference: "Institutional Budget Consolidation",
        actionRoute: "/budget",
        timestamp: nowStr,
        isActionable: true,
        confidence: 1.0,
      });
    } else if (overallUtil >= 85) {
      insights.push({
        id: `overall-budget-warning-${currentPeriod.label}`,
        organizationId: orgId,
        type: "OVERALL_BUDGET_WARNING",
        title: "Institutional Budget Approaching Ceiling",
        summary: `Total expenditure has reached ${overallUtil.toFixed(1)}% of the institutional budget ceiling (${currency} ${totalBudgetSpent.toLocaleString()} of ${currency} ${totalBudgeted.toLocaleString()}), leaving ${currency} ${netBudgetRemaining.toLocaleString()} remaining.`,
        whyItMatters: "Overall budget buffer is constrained before concluding the active financial cycle.",
        recommendedAction: "Audit upcoming requisitions across departments to avoid organizational budget exhaustion.",
        severity: "WARNING",
        category: "budget",
        metric: `${overallUtil.toFixed(1)}% Utilized (${currency} ${netBudgetRemaining.toLocaleString()} Left)`,
        currentValue: totalBudgetSpent,
        previousValue: totalBudgeted,
        changeAmount: netBudgetRemaining,
        changePercent: overallUtil,
        period: currentPeriod.label,
        sourceReference: "Institutional Budget Consolidation",
        actionRoute: "/budget",
        timestamp: nowStr,
        isActionable: true,
        confidence: 0.95,
      });
    }
  }

  // 4B. Line-Item & Department Pool Budget Inspection
  const budgetInspectionList: { id: string; category: string; department?: string; allocated: number; isDepartmentPool?: boolean }[] = [];
  validBudgets.forEach((b) => {
    budgetInspectionList.push({
      id: b.id,
      category: b.category || "General",
      department: b.department,
      allocated: safeNumber(b.allocated, 0),
      isDepartmentPool: false,
    });
  });

  validDepts.forEach((d) => {
    const dName = (d.name || "").trim();
    const dAlloc = safeNumber(d.budgetAllocated, 0);
    if (dAlloc <= 0 || !dName) return;
    const dNameLower = dName.toLowerCase();
    const lineItemSum = budgetInspectionList
      .filter((b) => (b.department || "").trim().toLowerCase() === dNameLower)
      .reduce((s, b) => s + b.allocated, 0);

    if (lineItemSum === 0) {
      budgetInspectionList.push({
        id: `dept_${d.id || dNameLower}`,
        category: dName,
        department: dName,
        allocated: dAlloc,
        isDepartmentPool: true,
      });
    } else if (dAlloc > lineItemSum) {
      budgetInspectionList.push({
        id: `dept_pool_${d.id || dNameLower}`,
        category: "Department Pool",
        department: dName,
        allocated: dAlloc - lineItemSum,
        isDepartmentPool: true,
      });
    }
  });

  budgetInspectionList.forEach((b) => {
    const allocated = safeNumber(b.allocated, 0);
    let spent = 0;
    if (b.isDepartmentPool) {
      const bDept = (b.department || "").trim().toLowerCase();
      spent = currentTxs
        .filter((t) => t.type === "expense" && (t.department || "").trim().toLowerCase() === bDept)
        .reduce((s, t) => s + safeNumber(t.amount, 0), 0);
    } else {
      spent = calculateBudgetSpentForCategory(b as any, currentTxs, currentPeriod);
    }
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
          summary: `${b.category || b.department} has utilized ${util.toFixed(1)}% of its allocated budget (${currency} ${spent.toLocaleString()} of ${currency} ${allocated.toLocaleString()}), leaving ${currency} ${remaining.toLocaleString()} remaining.`,
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
          whyItMatters: "Pre-allocated capital reserves are preserved for scheduled operational initiatives.",
          recommendedAction: "Review departmental milestones in Budget Allocations to deploy planned capital.",
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
  // 5. DEPARTMENT SPENDING & COST CENTERS (SCENARIO 5)
  // ──────────────────────────────────────────────────────────────────────────
  const deptSpendingMap: Record<string, number> = {};
  currentTxs
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const deptName = (t.department || "General").trim();
      deptSpendingMap[deptName] = (deptSpendingMap[deptName] || 0) + safeNumber(t.amount, 0);
    });

  const sortedDeptSpending = Object.entries(deptSpendingMap).sort((a, b) => b[1] - a[1]);

  if (sortedDeptSpending.length > 0 && expense > 0) {
    const [topDeptName, topDeptAmt] = sortedDeptSpending[0];
    const topDeptPct = (topDeptAmt / expense) * 100;

    // 5A. Top Department Spending Concentration
    if (topDeptPct >= 40 && sortedDeptSpending.length >= 2) {
      insights.push({
        id: `dept-concentration-${topDeptName}`,
        organizationId: orgId,
        type: "DEPARTMENT_CONCENTRATION",
        title: `Primary Cost Driver: ${topDeptName}`,
        summary: `${topDeptName} represents ${topDeptPct.toFixed(1)}% of all organizational disbursements (${currency} ${topDeptAmt.toLocaleString()}) during ${currentPeriod.label}.`,
        whyItMatters: "High expenditure concentration in a single department increases reliance on that unit's operational efficiency.",
        recommendedAction: `Inspect line-item requisitions in ${topDeptName} to confirm expenditures match deliverable milestones.`,
        severity: net < 0 && topDeptPct >= 55 ? "WARNING" : "INFO",
        category: "department",
        metric: `${topDeptPct.toFixed(1)}% of Outflows (${currency} ${topDeptAmt.toLocaleString()})`,
        currentValue: topDeptAmt,
        changePercent: topDeptPct,
        period: currentPeriod.label,
        sourceReference: `Cost Center / ${topDeptName}`,
        actionRoute: "/departments",
        timestamp: nowStr,
        isActionable: true,
        confidence: 0.9,
      });
    }

    // 5B. Unbudgeted Department Spending Alert
    sortedDeptSpending.forEach(([dName, dSpend]) => {
      if (dSpend >= 1000) {
        const dMatch = validDepts.find((d) => (d.name || "").trim().toLowerCase() === dName.toLowerCase());
        const hasBudgetDoc = validBudgets.some((b) => (b.department || "").trim().toLowerCase() === dName.toLowerCase());
        const dAlloc = dMatch ? safeNumber(dMatch.budgetAllocated, 0) : 0;

        if (dAlloc <= 0 && !hasBudgetDoc) {
          insights.push({
            id: `dept-unbudgeted-${dName}`,
            organizationId: orgId,
            type: "UNBUDGETED_DEPARTMENT_SPEND",
            title: `Unbudgeted Disbursements: ${dName}`,
            summary: `${dName} has recorded ${currency} ${dSpend.toLocaleString()} in operational disbursements without an authorized budget allocation cap.`,
            whyItMatters: "Uncapped departmental disbursements risk unauthorized capital drain.",
            recommendedAction: `Navigate to Departments or Budget to establish an authorized allocation cap for ${dName}.`,
            severity: "WARNING",
            category: "department",
            metric: `${currency} ${dSpend.toLocaleString()} Unbudgeted`,
            currentValue: dSpend,
            period: currentPeriod.label,
            sourceReference: `Unbudgeted Cost Center / ${dName}`,
            actionRoute: "/departments",
            timestamp: nowStr,
            isActionable: true,
            confidence: 0.95,
          });
        }
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. PAYROLL DISBURSAL WEIGHT (SCENARIO 6 - ONLY IF PAYROLL EXISTS)
  // ──────────────────────────────────────────────────────────────────────────
  if (expense > 0 && validPayroll.length > 0 && totalPayroll > 0) {
    const payrollPct = (totalPayroll / expense) * 100;
    const revPct = income > 0 ? (totalPayroll / income) * 100 : null;
    if (payrollPct >= 35) {
      insights.push({
        id: `payroll-weight-${currentPeriod.label}`,
        organizationId: orgId,
        type: "PAYROLL_WEIGHT",
        title: "Staff Compensation Commitment",
        summary: `Staff compensation represents ${payrollPct.toFixed(1)}% of total period disbursements (${currency} ${totalPayroll.toLocaleString()} across ${validPayroll.length} staff)${revPct !== null ? `, accounting for ${revPct.toFixed(1)}% of revenue` : ""}.`,
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
        sourceReference: `Payroll Disbursals (${validPayroll.length} Staff)`,
        actionRoute: "/payroll",
        timestamp: nowStr,
        isActionable: true,
        confidence: 0.95,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. STATISTICAL OUTLIER DETECTION (ANOMALY)
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
  // 8. POTENTIAL DUPLICATE TRANSACTION DETECTION
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
