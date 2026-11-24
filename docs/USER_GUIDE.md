# OFM — User Guide

Web: **https://ofmapp-main.web.app** · Android: install the APK · iPhone: Expo Go (SDK 58).

The web and mobile apps show the **same data** for your organization. Anything you add on one appears on the other within a second or two.

---

## 1. Getting started

### Create an organization (Admin)
1. Open the app and choose **Create account**.
2. Select **Admin**.
3. Enter your name, **organization name**, email and a password (6+ characters), and confirm the password.
4. Tap **Create admin account**. You land on the Dashboard.

### Join an organization (Accountant / Manager / Employee)
1. Ask your admin to invite you (Team → Invite member).
2. Choose **Create account**, pick your role, and enter the **same email** the admin invited.
3. In **Invite code**, enter your **admin's email**.
4. Create the account. Your role is the one the admin chose in the invitation.

### Sign in
Email + password, or **Continue with Google**. Forgot your password? Tap **Forgot password?** and follow the e-mail.

---

## 2. Navigation

| Web (sidebar) | Mobile |
|---|---|
| Overview: Dashboard | Tab: Dashboard |
| Finance: Income, Expenses, Transactions, Budgets | Tabs: Income, Expenses · More: Transactions, Budgets |
| Organization: Departments, Payroll, Team | More: Departments, Payroll, Team |
| Insights: Reports, AI Insights | Tab: Reports · More: Net operating balance, AI Insights |
| System: Settings | More: Settings |

Pages you can't use are hidden. See [ROLES_AND_PERMISSIONS.md](ROLES_AND_PERMISSIONS.md).

---

## 3. Dashboard

- **Available cash** — income minus expenses. Switch **Net cash / Spending**, tap the eye to hide amounts, tap **Breakdown** for the full net-operating-balance view.
- **Overview cards** — Income, Expenses, Budget, Transactions, Staff payroll. Tap a card to open that page.
- **Cash flow** — bar chart of income (green) and expenses (red) per day/week/month/year; tap a bar to see its transactions. On mobile switch **Bars | Trend**; Trend lets you change the date range.
- **Analytics** — Budget, Margin and Spending donut cards. Tap a department to focus on it; tap **Details** for a drill-down.
- **Departments** and **Recent transactions** with **See all**.
- **Web:** use the fiscal-year chip in the top bar to view a single fiscal year or all time.

---

## 4. Income and expenses

1. Open **Income** or **Expenses** (or the **Add income / Add expense** shortcut).
2. Tap **Record income / Record expense**.
3. Enter amount, category, department, date and description (payment method and reference are optional).
4. Save. Totals, budgets, charts and reports update immediately on every device.

Edit or delete a row from the list (delete needs the Admin or Accountant role).

---

## 5. Transactions

Full ledger. Search by text, filter by **All / Income / Expenses**, choose a date range.

---

## 6. Budgets

1. **Allocate budget** → choose department, category, amount and period.
2. Each line shows allocated, spent, remaining and a status: **On track**, **Near limit**, **Over budget**.
3. Use the filters above the table to narrow by status, department or period.
4. Alerts are sent at 80 %, 90 % and 100 % of a budget.

---

## 7. Departments

- Cards show head count, budget, spending and utilization. Tap **Staff** for the roster.
- **Not set up yet** — if budgets, expenses or payroll mention a department that has no card, a notice appears. Tap **Set up** (or **Set up all**) to create it.

---

## 8. Payroll and payslips

1. **Add payroll** → employee, department, month, base salary, bonus, deductions (and optional components/loans).
2. Net salary is calculated automatically. Saving also adds a **payroll expense** to the ledger.
3. Move the entry through the workflow (calculated → approval → finalized → paid) where required.
4. **Payslip** → choose a template → download **PDF** or image.
5. **Payslip templates** (Admin/Accountant) → create, edit sections and text, set the default.

**Employees** see only **My payslips**.

---

## 9. Team (Admin)

- See every member with role and status (**Invite pending** for people who haven't signed up yet).
- Tap a member to change role or remove them.
- **Invite member** → email, name, role → your mail app opens with a ready invitation. The same email can't be invited twice.

---

## 10. Reports

1. Pick a period (1M, 3M, 6M, 1Y, All, or a custom range).
2. Read the **Summary**, **Trend**, **Analytics** and **Department spending**.
3. **Export** → choose report type, sections and **PDF** or **CSV**:
   - Web: file downloads.
   - Android: choose a folder (e.g. Downloads) to save; cancel to use the share sheet.
   - iPhone: share sheet (Save to Files, Mail, WhatsApp…).
4. The page icon next to Export makes a quick PDF of the current period.

---

## 11. AI Insights (Admin, Manager)

- **Financial health** score (0–100) with key numbers.
- **What needs attention** — critical alerts, advisories and positive findings, each with *why it matters* and a recommended action (tap **Resolve** to jump to the right page).
- **Details** tabs: Trend, Metrics, Spending, Budget, Transactions.

---

## 12. Notifications

Tap the bell. Budget alerts, payroll and ledger events are shared with everyone in the organization. On phones, push notifications appear even when the app is closed (after allowing notifications).

---

## 13. Settings (Admin)

Company name, address, email, phone, logo, **currency**, **fiscal year**, **fiscal year starts in** (month), and **theme** (light / dark / system). Tap **Save**.

---

## 14. Working offline (mobile)

Keep working without internet — new and edited records are stored on the phone and marked *pending*. When the connection returns they upload automatically. Deleted records stay deleted.

---

## 15. Troubleshooting

| Problem | Fix |
|---|---|
| "You don't have access" | Your role can't open that page — ask an admin. |
| Can't join an organization | Make sure the admin invited your exact email and you typed the admin's email as invite code. |
| Expo Go stuck loading | Phone and computer must be on the same network, and the PC network must be **Private** in Windows (firewall). Or install the APK. |
| Numbers differ between devices | Pull down to refresh; check the sync dot (green = synced). |
| CSV shows odd characters in Excel | Open the file with Excel's *Data → From Text/CSV* and choose UTF-8 (files include a UTF-8 marker). |
