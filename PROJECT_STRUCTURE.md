# OFM — Project Structure

```
Organization-Finance-Management/
├── app/                         Mobile screens & routes (Expo Router, file-based)
├── components/                  Shared UI, charts, modals, payslip editor
│   ├── analytics/               Donut-ring analytics suite (Budget, Margin, Spending)
│   ├── payslip/                 Payslip template editor, preview, viewer
│   └── web/                     Web application (shell, pages, modals, icons)
├── config/                      Firebase initialization
├── constants/                   Colors, categories, currencies, branding
├── context/                     Global state: Auth, Finance, Settings
├── docs/                        FYP documentation, diagrams, database, roles, guide, testing
├── functions/                   Firebase Cloud Functions (PDF, password reset)
├── hooks/                       Reusable hooks (colors, keyboard, layout, permissions)
├── public/                      Static web files (favicon)
├── scripts/                     Helper scripts (icons, PDF verification)
├── services/                    Business logic (calculations, payroll, reports, sync…)
│   └── __tests__/               17 automated test suites
├── stubs/                       Platform stubs for web/native differences
├── utils/                       Formatting, dates, layout, toast helpers
├── assets/                      Images, icon, adaptive icon, fonts
├── app.json                     Expo app config (name, icons, scheme, plugins)
├── eas.json                     EAS build profiles (development, preview APK, production AAB)
├── firebase.json                Firebase Hosting + Firestore config
├── firestore.rules              Firestore security rules
├── firestore.indexes.json       Firestore composite indexes
├── metro.config.js              Metro bundler config
├── babel.config.js              Babel config
├── tsconfig.json                TypeScript config
└── package.json                 Dependencies & npm scripts
```

---

## `app/` — mobile screens (Expo Router)

| File | Screen |
|---|---|
| `_layout.tsx` | Root providers (Auth, Settings, Finance), fonts, status bar, auth redirects |
| `index.tsx` | Entry redirect (dashboard / onboarding / login) |
| `login.tsx` | Mobile sign in / sign up (web uses `login.web.tsx` → `WebAuth`) |
| `reset-password.tsx` | Set a new password from the reset link |
| `onboarding.tsx` | First-run introduction |
| `(tabs)/_layout.tsx` | Bottom tabs (web: `_layout.web.tsx` → `WebShell`) |
| `(tabs)/index.tsx` | Dashboard |
| `(tabs)/income.tsx` | Income |
| `(tabs)/expenses.tsx` | Expenses (employees: claims) |
| `(tabs)/reports.tsx` | Reports & export |
| `(tabs)/more.tsx` | More menu (same groups as web sidebar) |
| `budget.tsx` | Budgets |
| `departments.tsx` | Departments |
| `payroll.tsx` | Payroll & payslips |
| `payslip-templates.tsx` | Payslip template manager |
| `team.tsx` | Team, roles, invitations |
| `settings.tsx` | Organization settings |
| `ai-insights.tsx` | AI insights |
| `auth/google*.tsx` | Google sign-in callback (native / web) |
| `+html.tsx`, `+not-found.tsx` | Web HTML shell, 404 page |

## `components/web/` — web application

| File | Purpose |
|---|---|
| `WebShell.tsx` | Sidebar, top bar, fiscal-year picker, role guard, page router |
| `WebAuth.tsx` | Web sign in / sign up |
| `WebDashboard.tsx` | Web dashboard |
| `WebIncome.tsx`, `WebExpenses.tsx`, `WebTransactions.tsx` | Ledger pages |
| `WebBudgets.tsx`, `WebDepartments.tsx` | Budgets and departments |
| `WebPayroll.tsx` | Payroll and payslips |
| `WebTeam.tsx` | Team management |
| `WebReports.tsx`, `WebAIInsights.tsx` | Reports and insights |
| `WebSettings.tsx` | Settings |
| `WebCashFlowBarChart.tsx` / `.native.tsx` | Income vs expenses bar chart (web SVG / phone SVG) |
| `FiscalScope.tsx` | Fiscal-year filtering provider |
| `FitText.tsx` | Single-line shrink-to-fit text |
| `BrandMark.tsx` | OFM logo |
| `SvgIcons.tsx` | Icon set (works on web and mobile) |
| `modals/*` | Transaction, budget, department, payroll, invite, member role, payslip, confirm, staff roster |
| `animations/webStyles.ts` | Global web CSS (fonts, focus, transitions) |
| `WebLoanManagement.tsx`, `WebSalaryComponents.tsx` | Loan and salary-component screens (not linked in navigation yet) |

## `components/` — shared

Charts: `AreaLineChart`, `HBarChart`, `DonutChart`, `RingProgress`, `MiniBarChart` · Modals: `AddTransactionModal`, `AllTransactionsModal`, `DatePeriodSelectorModal`, `DownloadReportModal`, `FinancialDrillDownModal`, `NetBalanceBreakdownModal`, `NotificationCenterModal`, `FinancialStatementViewerModal`, `PdfViewerModal`, `PdfSuccessModal`, `ReportHtmlPreviewModal`, `ConfirmDeleteModal` · Others: `TransactionItem`, `StatCard`, `ProgressBar`, `ErrorBoundary`, `UniversalIcon`, `OFMBrandLogo`, `GoogleIcon`.

## `context/`

| File | Purpose |
|---|---|
| `AuthContext.tsx` | User session, sign-in/up, Google, password reset, permissions |
| `FinanceContext.tsx` | Live organization data, CRUD, sync status, notifications |
| `SettingsContext.tsx` | Organization settings (live) |

## `services/`

See [ARCHITECTURE.md §5](ARCHITECTURE.md#5-service-layer-services) for the grouped list. Tests live in `services/__tests__/` and run with `npm test`.

## `hooks/`

`useColors` (shared palette), `useRequirePermission`, `useResponsive`, `useWebLayout`, `useKeyboardAwareScroll`, `useKeyboardHeight`, `useBottomSheetLayout`, `usePayslipTemplates`, `NotificationHelper`.

## `docs/`

| File | Contents |
|---|---|
| `FYP_DOCUMENTATION.md` | Full FYP report |
| `DIAGRAMS.md` | All diagrams (Mermaid) |
| `DATABASE.md` | Firestore collections and fields |
| `ROLES_AND_PERMISSIONS.md` | Role/permission matrix |
| `USER_GUIDE.md` | How to use each module |
| `TESTING.md` | Test strategy, suites, test cases |
