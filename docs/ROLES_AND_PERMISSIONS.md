# OFM — Roles and Permissions

Source of truth: `services/permissionService.ts` (permissions) and `components/web/WebShell.tsx` `NAV_ITEMS` (web navigation). The mobile **More** menu (`app/(tabs)/more.tsx`) uses the same navigation rules as the web.

Flow diagram: [DIAGRAMS.md §21](DIAGRAMS.md#21-role-based-access-flow).

---

## Roles

| Role | Who | How they get it |
|---|---|---|
| **Admin** | Organization owner | Signs up as Admin (creates the organization) or promoted by an admin |
| **Accountant** | Bookkeeper | Invited by an admin with this role |
| **Manager** | Department / finance manager | Invited by an admin with this role |
| **Employee** | Staff member | Invited as employee, or joins with the admin's e-mail as invite code without an invitation |

> A joining member's role always comes from the admin's invitation — they cannot choose a higher role themselves.

---

## Page access

| Page | Admin | Accountant | Manager | Employee |
|---|:-:|:-:|:-:|:-:|
| Dashboard | ✅ | ✅ | ✅ | — (home is *My payslips*) |
| Income | ✅ | ✅ | — | — |
| Expenses | ✅ | ✅ | ✅ | — |
| Transactions | ✅ | ✅ | ✅ | — |
| Budgets | ✅ | ✅ | ✅ | — |
| Departments | ✅ | ✅ | ✅ | — |
| Payroll | ✅ | ✅ | ✅ | ✅ *(My payslips)* |
| Team | ✅ | — | — | — |
| Reports | ✅ | ✅ | ✅ | — |
| AI Insights | ✅ | — | ✅ | — |
| Settings | ✅ | — | — | — |

Opening a page that isn't allowed shows a **"You don't have access"** panel with a button back to the role's home page.

---

## Permission matrix

| Permission | Admin | Accountant | Manager | Employee |
|---|:-:|:-:|:-:|:-:|
| manage_organization | ✅ | | | |
| manage_team | ✅ | | | |
| invite_members | ✅ | | | |
| change_roles | ✅ | | | |
| manage_settings | ✅ | | | |
| create_transaction | ✅ | ✅ | | |
| edit_transaction | ✅ | ✅ | | |
| delete_transaction | ✅ | ✅ | | |
| manage_budgets | ✅ | ✅ | | |
| view_budgets | ✅ | ✅ | ✅ | |
| manage_departments | ✅ | | | |
| view_departments | ✅ | ✅ | ✅ | |
| manage_payroll | ✅ | ✅ | | |
| view_payroll | ✅ | ✅ | ✅ | |
| approve_payroll | ✅ | | ✅ | |
| view_reports | ✅ | ✅ | ✅ | ✅ |
| export_reports | ✅ | ✅ | ✅ | |
| view_insights | ✅ | ✅ | ✅ | |
| manage_salary_components | ✅ | ✅ | | |
| manage_employee_salary | ✅ | ✅ | | |
| manage_loans | ✅ | ✅ | | |
| view_own_payslip | ✅ | ✅ | ✅ | ✅ |
| manage_payslip_templates | ✅ | ✅ | | |
| set_default_payslip_template | ✅ | | | |
| select_payslip_template | ✅ | ✅ | ✅ | |
| view_sensitive_payroll_data | ✅ | ✅ | | |

**Total:** 26 permissions — Admin 26, Accountant 18, Manager 9, Employee 2.

---

## Where checks happen

| Layer | Mechanism |
|---|---|
| Web navigation | `NAV_ITEMS[].roleRestriction` — hidden from sidebar and bottom bar |
| Web page guard | `allowedTabs` / `shownTab` in `WebShell.tsx` — blocks direct links |
| Mobile screens | `useRequirePermission("...")` at the top of protected screens |
| Mobile More menu | Same role rules as web sidebar |
| Buttons / actions | `can(user, "delete_transaction")` etc. hide or disable actions |
| Sign-up | Joining role comes from `invitations/{email}` |
| Database | `firestore.rules` *(currently permissive — see FYP report §17)* |
