# Changelog

## 1.0.3 — November 2026

### Platform
- Upgraded to **Expo SDK 58** (React Native 0.88, React 19.3, Expo Router 58); all native modules updated; `expo-doctor` 20/20.
- New app icon and Android adaptive icon (OFM green tile, rising bars, trend arrow).

### Web
- Accounting-style redesign: shared palette, sidebar groups, top bar, logo, tables on one line with shrink-to-fit text.
- Fiscal-year picker with custom start month; every page scoped to the selected fiscal year.
- Role-based page guard ("You don't have access" panel); employees land on *My payslips*.
- Redesigned dashboard (cash card, KPI cards, cash-flow bar chart, animated donut analytics), budgets (working filters), departments (one-click set-up of missing departments), payroll, payslip templates and editor, team, reports, AI insights, settings, modals.
- New sign-in / sign-up screen.

### Mobile
- Same palette and look as the web; lighter typography and compact sizes.
- Dashboard: web-style cash card and overview cards, shortcuts row, Bars/Trend cash flow, Budget/Margin/Spending analytics tabs.
- More: grouped list matching web navigation, SVG icons, role rules aligned with web.
- Reports: summary card, Export opens PDF/CSV options, analytics tabs.
- AI Insights: health → what needs attention → detail tabs.
- Team: duplicate-invite protection; role wording matches web.
- Departments: correct budget totals; set up missing departments.
- Settings: fiscal-year start month.
- Sign in / sign up redesigned to match the web.

### Fixes
- CSV export on Android/iOS now saves/shares the real file (previously Android shared only text).
- Department budget totals now include all budget lines.
- Fiscal-year end date for January start.

### Documentation
- Complete documentation set: FYP report, diagrams, database, roles, user guide, testing, architecture, data flow, structure, deployment.
