import {
  computeNetOperatingBalanceHealth,
  NormalizedPeriod,
  isOperatingIncome,
  isOperatingExpense,
} from "../DatePeriodService";
import { Transaction } from "@/context/FinanceContext";

const mockPeriod: NormalizedPeriod = {
  startDate: "2026-01-01",
  endDate: "2026-06-30",
  label: "Last 6 Months",
  mode: "presets",
  granularity: "month",
};

describe("Net Operating Balance Health Engine", () => {
  test("Test 1 — Positive Balance (Income: 556K, Expenses: 53K)", () => {
    const txs: Transaction[] = [
      {
        id: "tx1",
        title: "Tuition Fee Batch A",
        amount: 300000,
        type: "income",
        category: "Tuition",
        date: "2026-03-10",
      },
      {
        id: "tx2",
        title: "Tuition Fee Batch B",
        amount: 256000,
        type: "income",
        category: "Tuition",
        date: "2026-04-15",
      },
      {
        id: "tx3",
        title: "Staff Payroll",
        amount: 50000,
        type: "expense",
        category: "Salaries",
        date: "2026-04-30",
      },
      {
        id: "tx4",
        title: "Utility Bill",
        amount: 3000,
        type: "expense",
        category: "Utilities",
        date: "2026-05-05",
      },
    ];

    const result = computeNetOperatingBalanceHealth(txs, mockPeriod);

    expect(result.totalIncome).toBe(556000);
    expect(result.operatingExpenses).toBe(53000);
    expect(result.netOperatingBalance).toBe(503000);
    expect(result.isDeficit).toBe(false);
    expect(result.status).toBe("healthy");
    expect(Number(result.operatingMargin.toFixed(1))).toBe(90.5);
    expect(Number(result.expenseRatio.toFixed(1))).toBe(9.5);
    expect(result.transactionCount).toBe(4);
    expect(result.incomeCount).toBe(2);
    expect(result.expenseCount).toBe(2);
  });

  test("Test 2 — Zero Income (Expenses only)", () => {
    const txs: Transaction[] = [
      {
        id: "tx1",
        title: "Office Rent",
        amount: 53000,
        type: "expense",
        category: "Rent",
        date: "2026-02-01",
      },
    ];

    const result = computeNetOperatingBalanceHealth(txs, mockPeriod);

    expect(result.totalIncome).toBe(0);
    expect(result.operatingExpenses).toBe(53000);
    expect(result.netOperatingBalance).toBe(-53000);
    expect(result.isDeficit).toBe(true);
    expect(result.status).toBe("critical");
    expect(result.operatingMargin).toBe(0);
    expect(result.expenseRatio).toBe(100);
  });

  test("Test 3 — Equal Income and Expenses", () => {
    const txs: Transaction[] = [
      {
        id: "tx1",
        title: "Income",
        amount: 100000,
        type: "income",
        category: "Sales",
        date: "2026-03-01",
      },
      {
        id: "tx2",
        title: "Expense",
        amount: 100000,
        type: "expense",
        category: "Supplies",
        date: "2026-03-05",
      },
    ];

    const result = computeNetOperatingBalanceHealth(txs, mockPeriod);

    expect(result.totalIncome).toBe(100000);
    expect(result.operatingExpenses).toBe(100000);
    expect(result.netOperatingBalance).toBe(0);
    expect(result.operatingMargin).toBe(0);
    expect(result.expenseRatio).toBe(100);
    expect(result.isDeficit).toBe(false);
  });

  test("Test 4 — Operating Deficit", () => {
    const txs: Transaction[] = [
      {
        id: "tx1",
        title: "Income",
        amount: 100000,
        type: "income",
        category: "Sales",
        date: "2026-03-01",
      },
      {
        id: "tx2",
        title: "Expense",
        amount: 130000,
        type: "expense",
        category: "Operations",
        date: "2026-03-05",
      },
    ];

    const result = computeNetOperatingBalanceHealth(txs, mockPeriod);

    expect(result.totalIncome).toBe(100000);
    expect(result.operatingExpenses).toBe(130000);
    expect(result.netOperatingBalance).toBe(-30000);
    expect(result.isDeficit).toBe(true);
    expect(result.status).toBe("critical");
  });

  test("Test 5 — Period & Void/Cancelled Filtering", () => {
    const txs: Transaction[] = [
      {
        id: "tx1",
        title: "Valid Inflow",
        amount: 50000,
        type: "income",
        category: "Donation",
        date: "2026-03-01",
      },
      {
        id: "tx2",
        title: "Future Inflow Outside Period",
        amount: 999999,
        type: "income",
        category: "Donation",
        date: "2026-11-01",
      },
      {
        id: "tx3",
        title: "Cancelled Expense",
        amount: 40000,
        type: "expense",
        category: "Travel",
        date: "2026-03-15",
        status: "cancelled",
      } as any,
    ];

    const result = computeNetOperatingBalanceHealth(txs, mockPeriod);

    expect(result.totalIncome).toBe(50000);
    expect(result.operatingExpenses).toBe(0);
    expect(result.netOperatingBalance).toBe(50000);
    expect(result.transactionCount).toBe(1);
  });
});
