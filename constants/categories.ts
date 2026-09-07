/**
 * constants/categories.ts
 *
 * Authoritative Unified Categories for Web & Mobile Synchronization.
 * Ensures Web and Mobile always query, display, and filter by the exact same category definitions.
 * Department-scoped categories ensure expenses are mapped directly to department budgets.
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
  "Salary / Payroll",
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

export function isSalaryExpenseCategory(cat?: string | null): boolean {
  if (!cat) return false;
  const c = cat.trim().toLowerCase();
  return c === "salary / payroll" || c === "salaries" || c === "salary" || c === "payroll";
}

export const DEFAULT_DEPARTMENT_CATEGORIES: Record<string, string[]> = {
  marketing: [
    "Advertising",
    "Social Media",
    "Equipment",
    "Travel",
    "Campaigns",
    "Content Creation",
    "Promotions",
    "Other Marketing Expense",
  ],
  operations: [
    "Utilities",
    "Maintenance",
    "Rent",
    "Office Supplies",
    "Logistics",
    "Facility Management",
    "Other Operations Expense",
  ],
  it: [
    "Software Licenses",
    "Cloud Infrastructure",
    "Hardware",
    "Equipment",
    "Network & Security",
    "R&D",
    "Other IT Expense",
  ],
  engineering: [
    "Software Licenses",
    "Cloud Infrastructure",
    "Hardware",
    "Equipment",
    "Prototyping",
    "R&D",
    "Other Engineering Expense",
  ],
  "human resources": [
    "Recruitment",
    "Training & Development",
    "Employee Benefits",
    "Salaries",
    "Team Events",
    "Workplace Wellbeing",
    "Other HR Expense",
  ],
  hr: [
    "Recruitment",
    "Training & Development",
    "Employee Benefits",
    "Salaries",
    "Team Events",
    "Workplace Wellbeing",
    "Other HR Expense",
  ],
  finance: [
    "Auditing",
    "Banking Fees",
    "Legal & Compliance",
    "Accounting Software",
    "Tax Advisory",
    "Other Finance Expense",
  ],
  academic: [
    "Research",
    "Laboratory Supplies",
    "Grants",
    "Books & Journals",
    "Conferences",
    "Student Support",
    "Other Academic Expense",
  ],
  research: [
    "Research",
    "Laboratory Supplies",
    "Grants",
    "Field Work",
    "Conferences",
    "Other Research Expense",
  ],
  sales: [
    "Client Entertainment",
    "Travel",
    "Commissions",
    "Presentations",
    "Lead Generation",
    "Other Sales Expense",
  ],
  admin: [
    "Office Supplies",
    "Utilities",
    "Postal & Delivery",
    "Maintenance",
    "Subscription",
    "Other Admin Expense",
  ],
  administration: [
    "Office Supplies",
    "Utilities",
    "Postal & Delivery",
    "Maintenance",
    "Subscription",
    "Other Admin Expense",
  ],
  legal: [
    "Legal Counsel",
    "Contract Review",
    "Regulatory Filings",
    "Compliance",
    "Other Legal Expense",
  ],
  healthcare: [
    "Medical Supplies",
    "Equipment",
    "Pharmaceuticals",
    "Hygiene",
    "Clinical Staff",
    "Other Medical Expense",
  ],
  medical: [
    "Medical Supplies",
    "Equipment",
    "Pharmaceuticals",
    "Hygiene",
    "Clinical Staff",
    "Other Medical Expense",
  ],
};

/**
 * Returns strictly scoped expense categories for a given department.
 * Prioritizes department's explicitly configured categories, standard department categories,
 * and custom category overrides.
 */
export function getDepartmentCategories(
  deptName?: string,
  departments?: Array<{ name: string; categories?: string[] }>,
  customCategories: string[] = []
): string[] {
  if (!deptName || !deptName.trim()) {
    return DEFAULT_EXPENSE_CATEGORIES;
  }

  const cleanDept = deptName.trim().toLowerCase();
  const categorySet = new Set<string>();

  // 1. Check if department object exists with custom configured categories
  if (departments && Array.isArray(departments)) {
    const matchedDept = departments.find(
      (d) => d && d.name && d.name.trim().toLowerCase() === cleanDept
    );
    if (matchedDept && Array.isArray(matchedDept.categories) && matchedDept.categories.length > 0) {
      matchedDept.categories.forEach((cat) => {
        if (cat && cat.trim()) categorySet.add(cat.trim());
      });
    }
  }

  // 2. Check DEFAULT_DEPARTMENT_CATEGORIES map
  let foundDefault = false;
  for (const [key, catList] of Object.entries(DEFAULT_DEPARTMENT_CATEGORIES)) {
    if (cleanDept === key || cleanDept.includes(key) || key.includes(cleanDept)) {
      catList.forEach((cat) => categorySet.add(cat));
      foundDefault = true;
      break;
    }
  }

  // 3. Fallback if no matching standard department categories found
  if (!foundDefault && categorySet.size === 0) {
    DEFAULT_EXPENSE_CATEGORIES.forEach((cat) => categorySet.add(cat));
  }

  // 4. Append any organization custom categories
  if (Array.isArray(customCategories)) {
    customCategories.forEach((cat) => {
      if (cat && typeof cat === "string" && cat.trim()) {
        categorySet.add(cat.trim());
      }
    });
  }

  // 5. Ensure Salary / Payroll is universally available to all departments
  categorySet.add("Salary / Payroll");

  return Array.from(categorySet);
}

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
