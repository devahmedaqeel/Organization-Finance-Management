# OFM — Database Design (Cloud Firestore)

Firestore is a NoSQL document database. Data is stored in **collections** of **documents**. OFM keeps every organization's data in the same collections and separates organizations with the `organizationId` field — every query the app makes filters on it.

ERD diagram: [DIAGRAMS.md §4](DIAGRAMS.md#4-entity-relationship-diagram-erd).

---

## Collections overview

| Collection | Document id | Written by | Read by |
|---|---|---|---|
| `users` | Firebase uid (or `u_<email>` placeholder for invites) | Sign-up, Team | Auth, Team |
| `organizations` | organizationId | Admin sign-up | Auth |
| `orgSettings` | organizationId | Settings | SettingsContext (live) |
| `invitations` | invitee e-mail | Team (invite) | Sign-up |
| `transactions` | auto id | Income, Expenses, Payroll | FinanceContext (live) |
| `budgets` | auto id | Budgets | FinanceContext (live) |
| `departments` | auto id | Departments | FinanceContext (live) |
| `payroll` | auto id | Payroll | FinanceContext (live) |
| `payrollPeriods` | auto id | Payroll workflow | Payroll |
| `salaryComponents` | auto id | Salary components | Payroll engine |
| `employeeLoans` | auto id | Loans | Payroll (loan deductions) |
| `loanRepayments` | auto id | Loans | Loans |
| `payslipTemplates` | auto id | Payslip template editor | Payslip export |
| `payslipTemplateSettings` | organizationId | Template manager (default template) | Payslip export |
| `notifications` | auto / idempotency key | notificationService | All members (live) |
| `auditLogs` | auto id | auditService | Admin |
| `email_audit_logs` | auto id | emailNotificationService | Admin |
| `tombstones` | record id | offlineSyncService | Sync |

---

## Field reference

### `users`
| Field | Type | Notes |
|---|---|---|
| id | string | Firebase uid |
| name | string | |
| email | string | lower-case |
| role | string | `admin` · `accountant` · `manager` · `employee` |
| organization | string | organization name |
| organizationId | string | **tenant key** |
| department | string? | optional |

### `orgSettings`
| Field | Type | Notes |
|---|---|---|
| organizationName, organizationAddress, organizationEmail, organizationPhone | string | Company profile |
| currency | string | e.g. `PKR` |
| fiscalYear | string | e.g. `2025-2026` |
| fiscalYearStartMonth | number | 1–12, default 7 (July) |
| organizationLogo | string? | image data / URL |
| theme | string? | `light` · `dark` · `system` |
| customIncomeCategories, customExpenseCategories | string[]? | |
| emailAutomatedEnabled, emailjs* | optional | E-mail automation settings |

### `transactions`
| Field | Type | Notes |
|---|---|---|
| id | string | |
| type | `income` \| `expense` | |
| category | string | |
| amount | number | exact value |
| date | string | `YYYY-MM-DD` |
| department | string | department name |
| title, description | string | |
| addedBy | string | user |
| paymentMethod, referenceNumber | string? | |
| status | `completed` · `pending` · `reconciled` · `failed` | |
| budgetId | string? | link to a budget line |
| expenseSource | `manual` · `payroll` · `reimbursement` · `invoice` | |
| payrollId, employeeId, employeeName | string? | set when created by payroll |
| organizationId | string | tenant key |
| createdAt, updatedAt | string | ISO time |

### `budgets`
| Field | Type | Notes |
|---|---|---|
| department | string | |
| category | string | |
| allocated | number | |
| period | string | e.g. monthly / quarterly / annual |
| fiscalYear | string? | |
| alertThreshold | number? | |
| notes | string? | |
| organizationId | string | |

### `departments`
| Field | Type |
|---|---|
| name | string |
| headCount | number |
| budgetAllocated | number |
| headOfDepartment, contactEmail, code | string? |
| categories | string[]? |
| organizationId | string |

### `payroll`
| Field | Type | Notes |
|---|---|---|
| employeeName, employeeId, department, designation | string | |
| baseSalary, bonus, deductions | number | |
| netSalary | number | calculated |
| month | string | `YYYY-MM` |
| payrollStatus | `draft` · `calculated` · `pending_approval` · `approved` · `finalized` · `paid` · `cancelled` | workflow |
| paymentStatus | `paid` · `pending` · `processing` · `failed` · `cancelled` | |
| expenseId | string? | ledger expense created for this payroll |
| bankName, bankAccountNumber, paymentMethod, cnic | string? | sensitive (Admin/Accountant only) |
| itemizedEarnings, itemizedDeductions, customAllowances, customDeductions, loanDeductions, employerContributions | array? | breakdown |
| taxDetails, attendanceDetails | object? | |
| verificationCode | string? | printed on payslip |
| reversalReason, reversedBy, reversedAt | string? | for reversals |
| organizationId | string | |

### `invitations`
| Field | Type |
|---|---|
| email | string (document id) |
| name | string |
| role | string |
| organization, organizationId | string |
| invitedBy | string (admin e-mail) |
| status | `pending` / `accepted` |
| createdAt | timestamp |

### `notifications`
| Field | Type |
|---|---|
| title, message | string |
| type / severity | string |
| read | boolean (per user state) |
| organizationId | string |
| createdAt | timestamp |

---

## Relationships

| From | To | How |
|---|---|---|
| User → Organization | many-to-one | `users.organizationId` |
| Transaction / Budget / Payroll / Department → Organization | many-to-one | `organizationId` |
| Transaction → Department | many-to-one | `department` name |
| Budget → Department | many-to-one | `department` name |
| Payroll → Transaction | one-to-one | `transactions.payrollId` and `payroll.expenseId` |
| Transaction → Budget | optional | `transactions.budgetId` |
| Loan → Repayments | one-to-many | `loanRepayments.loanId` |

---

## Indexes and rules

- Composite indexes: `firestore.indexes.json`
- Security rules: `firestore.rules`

> The current rules allow public reads on several collections and authenticated writes. Before real production use, restrict reads/writes to members of the same `organizationId` and check roles (see FYP report §17).

---

## Local (device) storage

| Store | Platform | Contents |
|---|---|---|
| AsyncStorage | Android / iOS | Session, cached entities per organization, outbox, tombstones |
| localStorage / IndexedDB | Web | Session, fiscal-year scope, UI preferences |
