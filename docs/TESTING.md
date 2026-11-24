# OFM — Testing

## 1. Strategy

| Level | Tool | What it proves |
|---|---|---|
| Static analysis | `npm run typecheck` (TypeScript) | Code compiles with no type errors |
| Automated unit / integration | `npm test` → `services/__tests__/runAllTests.ts` (run with `tsx`) | Business logic is correct and consistent across platforms |
| Build verification | Metro bundles for Android, iOS and web | App builds for every platform |
| Manual functional | Web browser + Expo Go / APK | Screens, roles and flows behave as specified |

Current status: **TypeScript 0 errors · 17/17 suites pass · Android, iOS and web bundles build.**

---

## 2. Automated test suites

| # | Suite (`services/__tests__/`) | Covers |
|---|---|---|
| 1 | `FinancialCalculationEngine.test.ts` | Income/expense totals, budget allocation & usage, department metrics |
| 2 | `financialEngine.test.ts` | Engine edge cases (empty data, negatives, rounding) |
| 3 | `NetOperatingBalanceHealth.test.ts` | Net operating balance and health classification |
| 4 | `financialFlowsAndParity.test.ts` | End-to-end money flows; web and mobile produce identical figures |
| 5 | `financialInsights.test.ts` | Insight generation for all data scenarios, trend gating, anomalies, duplicates |
| 6 | `payrollCalculationEngine.test.ts` | Net salary, components, tax, rounding |
| 7 | `payrollExpenseIntegration.test.ts` | Payroll posts the matching ledger expense; updates and reversals |
| 8 | `payslipTemplates.test.ts` | Template model, rendering and defaults |
| 9 | `payslipDirectEditing.test.ts` | Direct payslip edits |
| 10 | `pdfService.test.ts` | PDF generation |
| 11 | `reportSystemAudit.test.ts` | Report data compilation, sections, role restrictions |
| 12 | `offlineFirstSync.test.ts` | Local cache, outbox, retry, tombstones, reconciliation |
| 13 | `crossPlatformSync.test.ts` | Web ↔ mobile synchronization behaviour |
| 14 | `newOrgCleanState.test.ts` | New organization starts with clean data |
| 15 | `orgBadgeHeader.test.ts` | Organization identity in headers |
| 16 | `PasswordResetEngine.test.ts` | Password reset tokens and flow |
| 17 | `googleAuthFlow.test.ts` | Google sign-in: callback validation, cancelled popups vs real errors, profile lookup deadlines |

Run:

```bash
npm test
# MASTER TEST SUMMARY: 17/17 SUITES PASSED
```

---

## 3. Manual test cases

| ID | Module | Steps | Expected result |
|---|---|---|---|
| TC-01 | Sign-up (Admin) | Create account as Admin with org name | Organization created, Dashboard opens |
| TC-02 | Sign-up (invite) | Admin invites email as Manager; user signs up with that email + admin email as code | User joins as Manager (even if another role was picked) |
| TC-03 | Sign-up (no invite) | Sign up with admin e-mail as code, no invitation | Joins as Employee |
| TC-04 | Sign-in | Valid credentials | Role home opens |
| TC-05 | Sign-in | Wrong password | Clear error message, no crash |
| TC-06 | Forgot password | Enter e-mail | Success message; reset e-mail sent |
| TC-07 | Income | Record income 10,000 | Appears in ledger; Income card and Available cash increase |
| TC-08 | Expense | Record expense in a department with a budget | Budget spent increases; status updates |
| TC-09 | Budget alert | Push a budget past 80 %, 90 %, 100 % | Warning, critical, over-budget notifications |
| TC-10 | Real-time sync | Add income on web while mobile is open | Mobile updates without refresh |
| TC-11 | Real-time sync (reverse) | Add expense on mobile | Web updates without refresh |
| TC-12 | Offline | Turn off phone internet, add expense, reconnect | Shows pending, then uploads and appears on web |
| TC-13 | Delete | Delete a transaction offline then reconnect | Stays deleted on all devices |
| TC-14 | Payroll | Add payroll | Net salary calculated; payroll expense added to ledger |
| TC-15 | Payslip | Generate payslip with a chosen template | PDF shows correct data and template |
| TC-16 | Employee access | Sign in as Employee | Only My payslips; other pages show "no access" |
| TC-17 | Manager access | Open Income by URL as Manager | "You don't have access" panel |
| TC-18 | Team | Invite an existing member's e-mail | Blocked with "already on your team" |
| TC-19 | Departments | Expense uses a department with no card | "Not set up yet" notice; Set up creates it |
| TC-20 | Reports PDF | Export PDF (web / Android / iOS) | File downloads / saves / shares |
| TC-21 | Reports CSV | Export CSV on Android | Folder picker; file saved and opens in Excel/Sheets |
| TC-22 | Fiscal year (web) | Choose a future fiscal year | Pages show empty state; switching back shows data |
| TC-23 | Settings | Change currency and start month | All amounts and fiscal ranges update |
| TC-24 | Theme | Switch to dark | Whole app follows theme |
| TC-25 | Responsiveness | Web at 375 px, 768 px, 1280 px | Layout adapts (bottom bar / sidebar), text readable |

Record actual results and screenshots in your report's testing chapter.

---

## 4. Test environment

| Item | Value |
|---|---|
| Node.js | 18+ (tested with 25) |
| Expo SDK | 58 |
| Browsers | Chrome / Edge |
| Mobile | Android (APK, Expo Go), iOS (Expo Go) |
| Backend | Firebase project `ofmapp-main` |
