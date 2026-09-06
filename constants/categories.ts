/**
 * constants/categories.ts
 *
 * Authoritative Unified Categories for Web & Mobile Synchronization.
 * Ensures Web and Mobile always query, display, and filter by the exact same category definitions.
 */

export const DEFAULT_INCOME_CATEGORIES: string[] = [
  "Government Grant",
  "Fee Collection",
  "Research Grant",
  "Donation",
  "Investment Return",
  "Service Charges",
  "Other Income",
];

export const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  "Salaries",
  "Utilities",
  "Equipment",
  "Research",
  "Maintenance",
  "Travel",
  "Marketing",
  "Software Licenses",
  "Office Supplies",
  "Other Expense",
];

export function getUnifiedCategories(
  type: "income" | "expense",
  customIncomeOrList: string[] = [],
  customExpenseOrTxs: string[] | Array<{ type: string; category?: string }> = [],
  transactions: Array<{ type: string; category?: string }> = []
): string[] {
  const base = type === "income" ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES;
  const set = new Set<string>(base);

  // If argument 3 is an array of strings, it's (type, customIncome, customExpense, [txs])
  if (Array.isArray(customExpenseOrTxs) && customExpenseOrTxs.length > 0 && typeof customExpenseOrTxs[0] === "string") {
    const list = type === "income" ? customIncomeOrList : (customExpenseOrTxs as string[]);
    if (Array.isArray(list)) {
      list.forEach((c) => {
        if (c && typeof c === "string" && c.trim()) {
          set.add(c.trim());
        }
      });
    }
  } else if (Array.isArray(customIncomeOrList)) {
    // Single list passed for this specific type
    customIncomeOrList.forEach((c) => {
      if (c && typeof c === "string" && c.trim()) {
        set.add(c.trim());
      }
    });
  }

  // Transactions list for extracting existing transaction categories
  const txList = Array.isArray(transactions) && transactions.length > 0
    ? transactions
    : (Array.isArray(customExpenseOrTxs) && customExpenseOrTxs.length > 0 && typeof customExpenseOrTxs[0] === "object"
        ? (customExpenseOrTxs as Array<{ type: string; category?: string }>)
        : []);

  if (Array.isArray(txList)) {
    txList
      .filter((t) => t && t.type === type && t.category && t.category.trim())
      .forEach((t) => set.add(t.category!.trim()));
  }

  return Array.from(set);
}
