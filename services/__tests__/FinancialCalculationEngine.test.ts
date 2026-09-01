import {
  calculateBudgetUtilization,
  calculateNetOperatingMargin,
  calculateExpenseDistribution,
  buildAuthoritativeFinancialModel,
} from "../FinancialCalculationEngine";
import { Transaction } from "@/types";
import { Budget } from "@/services/BudgetService";
import { NormalizedPeriod } from "../DatePeriodService";

describe("FinancialCalculationEngine - Authoritative Test Suite", () => {
  // ==========================================================================
  // 1. BUDGET UTILIZATION TESTS
  // ==========================================================================
  describe("1. Budget Utilization Calculation", () => {
    test("Scenario 1: Budget = 100,000, Expense = 50,000 => 50% (On Track)", () => {
      const result = calculateBudgetUtilization(50000, 100000, "PKR");
      expect(result.rawUtilizationPct).toBe(50);
      expect(result.displayPct).toBe("50.0%");
      expect(result.clampedRingPct).toBe(50);
      expect(result.status).toBe("on_track");
      expect(result.statusLabel).toBe("On Track");
      expect(result.remainingAmount).toBe(50000);
      expect(result.excessAmount).toBe(0);
      expect(result.isOverBudget).toBe(false);
      expect(result.remainingText).toContain("50.0K Remaining");
    });

    test("Scenario 2: Budget = 100,000, Expense = 100,000 => 100% (Near Limit)", () => {
      const result = calculateBudgetUtilization(100000, 100000, "PKR");
      expect(result.rawUtilizationPct).toBe(100);
      expect(result.displayPct).toBe("100.0%");
      expect(result.clampedRingPct).toBe(100);
      expect(result.status).toBe("near_limit");
      expect(result.statusLabel).toBe("Near Limit");
      expect(result.remainingAmount).toBe(0);
      expect(result.excessAmount).toBe(0);
      expect(result.remainingText).toBe("Budget Fully Used");
    });

    test("Scenario 3: Budget = 100,000, Expense = 125,000 => 125% (Over Budget)", () => {
      const result = calculateBudgetUtilization(125000, 100000, "PKR");
      expect(result.rawUtilizationPct).toBe(125);
      expect(result.displayPct).toBe("125.0%");
      expect(result.clampedRingPct).toBe(100); // Clamped for visual ring integrity
      expect(result.status).toBe("over_budget");
      expect(result.statusLabel).toBe("Over Budget");
      expect(result.isOverBudget).toBe(true);
      expect(result.remainingAmount).toBe(0);
      expect(result.excessAmount).toBe(25000);
      expect(result.remainingText).toContain("25.0K Over Budget");
    });

    test("Scenario 4: Budget = 0 => No Budget / N/A (Never NaN or Infinity)", () => {
      const result = calculateBudgetUtilization(50000, 0, "PKR");
      expect(result.utilizationPct).toBeNull();
      expect(result.displayPct).toBe("N/A");
      expect(result.status).toBe("no_budget");
      expect(result.statusLabel).toBe("No Budget Configured");
      expect(result.isValid).toBe(false);
      expect(result.remainingText).toBe("No Budget Configured");
    });
  });

  // ==========================================================================
  // 2. NET OPERATING MARGIN TESTS
  // ==========================================================================
  describe("2. Net Operating Margin Calculation", () => {
    test("Scenario 1: Revenue = 1,000,000, Expenses = 700,000 => 30% (Healthy Surplus)", () => {
      const result = calculateNetOperatingMargin(1000000, 700000, "PKR");
      expect(result.operatingIncome).toBe(300000);
      expect(result.rawMarginPct).toBe(30);
      expect(result.displayMargin).toBe("+30.0%");
      expect(result.status).toBe("healthy");
      expect(result.statusLabel).toBe("Healthy Surplus");
      expect(result.isLoss).toBe(false);
      expect(result.hasRevenue).toBe(true);
    });

    test("Scenario 2: Revenue = 1,000,000, Expenses = 1,100,000 => -10% (Operating Loss)", () => {
      const result = calculateNetOperatingMargin(1000000, 1100000, "PKR");
      expect(result.operatingIncome).toBe(-100000);
      expect(result.rawMarginPct).toBe(-10);
      expect(result.displayMargin).toBe("-10.0%");
      expect(result.status).toBe("critical");
      expect(result.statusLabel).toBe("Operating Loss");
      expect(result.isLoss).toBe(true);
    });

    test("Scenario 3: Revenue = 0 => N/A (Never NaN or Infinity)", () => {
      const result = calculateNetOperatingMargin(0, 50000, "PKR");
      expect(result.operatingMarginPct).toBeNull();
      expect(result.displayMargin).toBe("N/A");
      expect(result.status).toBe("no_revenue");
      expect(result.statusLabel).toBe("No Operating Revenue");
      expect(result.hasRevenue).toBe(false);
    });

    test("Scenario 4: Trend comparison vs previous period", () => {
      // Current: 1M Rev, 700k Exp -> 30%
      // Previous: 1M Rev, 732k Exp -> 26.8%
      // Change: +3.2%
      const result = calculateNetOperatingMargin(1000000, 700000, "PKR", 1000000, 732000);
      expect(result.rawMarginPct).toBe(30);
      expect(result.previousPeriodMarginPct).toBeCloseTo(26.8, 1);
      expect(result.marginChangeVsPrevious).toBeCloseTo(3.2, 1);
      expect(result.trendDirection).toBe("up");
    });
  });

  // ==========================================================================
  // 3. EXPENSE DISTRIBUTION TESTS
  // ==========================================================================
  describe("3. Expense Distribution Calculation", () => {
    test("Scenario 1: Total = 100,000, A = 50,000 (50%), B = 30,000 (30%), C = 20,000 (20%) => Sum = 100%", () => {
      const mockTxs: Transaction[] = [
        { id: "1", type: "expense", amount: 50000, category: "Salaries", date: "2026-08-01" },
        { id: "2", type: "expense", amount: 30000, category: "Rent", date: "2026-08-05" },
        { id: "3", type: "expense", amount: 20000, category: "Utilities", date: "2026-08-10" },
      ];

      const result = calculateExpenseDistribution(mockTxs);
      expect(result.totalExpenses).toBe(100000);
      expect(result.categories.length).toBe(3);
      expect(result.categories[0].category).toBe("Salaries");
      expect(result.categories[0].pct).toBe(50);
      expect(result.categories[1].category).toBe("Rent");
      expect(result.categories[1].pct).toBe(30);
      expect(result.categories[2].category).toBe("Utilities");
      expect(result.categories[2].pct).toBe(20);
      expect(result.sumPercentages).toBe(100);
      expect(result.hasExpenses).toBe(true);
    });

    test("Scenario 2: Empty transactions => Clean empty state", () => {
      const result = calculateExpenseDistribution([]);
      expect(result.totalExpenses).toBe(0);
      expect(result.categories.length).toBe(0);
      expect(result.hasExpenses).toBe(false);
      expect(result.explanation).toContain("No expense disbursements");
    });
  });
});
