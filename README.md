# OFM — Organization Finance Management

> **Enterprise Institutional Accounting, Real-Time Cloud Synchronization, Multi-Role Access Control & Executive Financial Dossiers**

[![Live Production Web App](https://img.shields.io/badge/Live_Web_App-ofmapp--main.web.app-38BDF8?style=for-the-badge&logo=firebase&logoColor=white)](https://ofmapp-main.web.app/)
[![Platform](https://img.shields.io/badge/Platform-Native_Android_%7C_iOS_%7C_Web_%7C_Tablet-10B981?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![Cloud Firestore](https://img.shields.io/badge/Database-Firebase_Cloud_Firestore-F59E0B?style=for-the-badge&logo=firebase&logoColor=white)](https://firebase.google.com/)
[![EAS Build](https://img.shields.io/badge/EAS_Build-Android_APK_Ready-8B5CF6?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![License](https://img.shields.io/badge/License-MIT-3B82F6?style=for-the-badge)](LICENSE)

---

## Project Overview

**OFM (Organization Finance Management)** is an enterprise financial intelligence and general ledger platform built with **React Native / Expo SDK 54**, **React Native Web**, and **Google Cloud Firestore**. 

It delivers real-time double-entry ledger accounting, department budget allocation ceilings, staff payroll and automated payslip generation (PDF & High-Resolution Image), multi-period compliance reporting, a granular role-based personnel security matrix, and **instant two-way real-time data synchronization between Mobile and Web platforms**.

---

## Features

- **Double-Entry General Ledger**: Record Revenue Inflows and Operational Expense Outflows with voucher references, category tagging, and receipt verification.
- **Department Cost Centers**: Allocate fiscal expenditure ceilings, track department burn rates, and receive real-time budget overrun warnings.
- **Staff Payroll & Payslip Engine**: Automated calculation of base salaries, allowances, bonuses, and statutory deductions with 1-click official PDF & High-Res Image exports.
- **Executive Financial Dossiers**: Real-time Net Operating Balance, Operating Surplus, Retention Margin, Savings Velocity, and Runway estimation.
- **Two-Way Real-Time Synchronization**: Central Cloud Firestore serves as the single source of truth; any change created, edited, or deleted on Web immediately updates Mobile, and vice-versa.
- **Permanent Deletion Guarantee**: Successfully deleted records are purged from the database and registered in persistent tombstones, ensuring deleted records never resurrect after logout, login, refresh, or restart.
- **Multi-Role Security (RBAC)**: Distinct permissions for Administrator, Accountant, Manager, and Employee.
- **Institutional Branding & Customization**: Support for 150+ international currencies (with default PKR formatting), custom organization logo upload, and dark/light adaptive themes.
- **0ms Instant Startup**: Ultra-lightweight root redirector prevents bundle stalls on native startup.

---

## Technology Stack

- **Framework**: [React Native](https://reactnative.dev/) with [Expo SDK 54](https://docs.expo.dev/)
- **Routing**: [Expo Router v4](https://docs.expo.dev/router/introduction/) (file-based navigation with typed routes)
- **Web Engine**: React Native for Web with custom enterprise desktop shell (`WebShell.tsx`, `WebDashboard.tsx`)
- **Database**: [Google Cloud Firestore](https://firebase.google.com/docs/firestore) (real-time NoSQL document store)
- **Authentication**: [Firebase Authentication](https://firebase.google.com/docs/auth) (Email/Password, Google OAuth federation, session rehydration via IndexedDB and Browser Local Persistence)
- **Hosting**: [Firebase Hosting](https://firebase.google.com/docs/hosting) (global CDN with automated SSL)
- **Build Pipeline**: [EAS Build](https://docs.expo.dev/build/introduction/) for native Android standalone APK generation and iOS client bundles
- **PDF & Graphic Exports**: Native print compiler via `expo-print`, base64 image rendering, and institutional payslip templating

---

## Project Structure

```
├── app/                                 # Expo Router file-based navigation
│   ├── index.tsx                        # ⚡ Instant 0ms root redirect handler
│   ├── _layout.tsx                      # Root provider shell & platform safe areas
│   ├── (tabs)/                          # Bottom tab navigator (Mobile)
│   │   ├── index.tsx                    # Executive Financial Dashboard
│   │   ├── income.tsx                   # Revenue & Grant Inflow Ledger
│   │   ├── expenses.tsx                 # Expenditure & Claim Outflows
│   │   ├── reports.tsx                  # Financial Auditing & Multi-Period Reports
│   │   └── more.tsx                     # Extended Features & Module Switcher
│   ├── login.tsx                        # Authentication & Multi-Role Demo Switcher
│   ├── budget.tsx                       # Department Budget Allocations
│   ├── departments.tsx                  # Monitored Cost Centers & Headcounts
│   ├── payroll.tsx                      # Staff Payroll & Remuneration Audit
│   ├── team.tsx                         # Personnel Management & Role Invites
│   ├── settings.tsx                     # Organization Profile, Currency & Branding
│   └── ai-insights.tsx                  # Predictive Intelligence & Health Engine
├── components/                          # UI Component Hierarchy
│   ├── web/                             # Enterprise Desktop Widescreen Shell & Views
│   │   ├── WebShell.tsx                 # Desktop layout, auth gate & loading spinner
│   │   ├── WebDashboard.tsx             # Desktop KPI cards & charts
│   │   ├── WebIncome.tsx                # Desktop revenue tabular ledger
│   │   ├── WebExpenses.tsx              # Desktop expense tabular ledger
│   │   ├── WebDepartments.tsx           # Desktop cost center allocation matrix
│   │   ├── WebPayroll.tsx               # Desktop staff payroll and batch slips
│   │   └── WebReports.tsx               # Desktop statement generator & exports
│   ├── analytics/                       # Donut & Radial Fiscal Health Gauges
│   └── modals/                          # Responsive Modal Dialogs
├── context/                             # Global State Providers
│   ├── AuthContext.tsx                  # Firebase Auth, token persistence & RBAC
│   ├── FinanceContext.tsx               # Firestore live sync, ledger CRUD & tombstones
│   └── ThemeContext.tsx                 # Dark/Light theme tokens & styling
├── services/                            # Business Logic & Authoritative Engines
│   ├── FinancialCalculationEngine.ts    # Authoritative financial math & KPI formulas
│   ├── DatePeriodService.ts             # Fiscal period filtering & date range maths
│   ├── ReportExportService.ts           # PDF dossier generator & compiler
│   └── payslipExportService.ts          # Native PDF & PNG slip exporter
├── config/firebase.ts                   # Firebase initialization & multi-persistence setup
├── eas.json                             # EAS Android APK & production build profiles
└── firestore.rules                      # Cloud Firestore security rules
```

---

## Architecture

OFM employs a **Single Unified Backend Architecture** where the Central Google Cloud Firestore database is the single authoritative source of truth for all clients:

```
                 WEB APPLICATION (Desktop / Tablet / PWA)
                                  │
                                  ▼
                        FIREBASE CLIENT SDK
                                  │
                                  ▼
                 CENTRAL FIRESTORE CLOUD DATABASE
                                  ▲
                                  │
                        FIREBASE CLIENT SDK
                                  ▲
                                  │
                MOBILE APPLICATION (Android APK / iOS)
```

Both clients share:
1. The same central database collections (`transactions`, `budgets`, `departments`, `payroll`, `settings`).
2. The same organization-scoped tenant boundaries (`organizationId`).
3. The same authoritative financial calculation engine (`services/FinancialCalculationEngine.ts`).

---

## Data Synchronization

Data synchronization between Web and Mobile is bidirectional and real-time:
* **Web → Mobile**: When an Admin or Accountant records or updates an item on Web, Firestore dispatches the modification event through active WebSocket listeners (`onSnapshot`). The Mobile application immediately receives the change and re-evaluates all KPIs without manual refresh.
* **Mobile → Web**: When an expense or department allocation is submitted on Mobile, Firestore immediately emits the change to the Web client, updating tables and charts instantly.
* **Delete Synchronization**: When a record is deleted on either platform, it is confirmed removed from Firestore, purged from counterpart mirrors, and indexed in persistent local tombstones (`AsyncStorage` / `localStorage`). **Deleted records never return** after refresh, logout/login, or app restart.

---

## Authentication

Authentication is powered by **Firebase Authentication** with multi-tier persistence:
* **Web Persistence**: Configured with `[indexedDBLocalPersistence, browserLocalPersistence]` to guarantee sessions survive browser refreshes and tab closures.
* **Mobile Persistence**: Managed via `@react-native-async-storage/async-storage` for seamless instant resume.
* **Canonical Profile Resolution**: Resolves user email and UID against `users/{uid}` in Firestore to associate the account with the correct canonical organization ID (`org-9icgv4ijp`).
* **Session Lifecycle**: Explicit `logout()` purges local tokens without altering central database records. On subsequent login, the latest records are streamed directly from Firestore.

---

## User Roles

| Role | Access Level | Responsibilities |
| :--- | :--- | :--- |
| **Super Administrator** | Full Access | Organization branding, personnel roles, general ledger, budgets, payroll, compliance audits. |
| **Accountant** | Financial Operations | Revenue inflows, operational expenses, ledger audit, budget ceilings, payslips, financial reports. |
| **Manager** | Departmental Oversight | Departmental expense monitoring, staff headcount tracking, department budget review. |
| **Employee** | Personal Access | Expense claim submission, personal payslip download (PDF/Image), self profile. |

---

## Installation

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli eas-cli`)

### Setup
```bash
# Clone repository
git clone https://github.com/devahmedaqeel/Organization-Finance-Management.git

# Enter project directory
cd Organization-Finance-Management

# Install dependencies
npm install
```

---

## Environment Variables

Create a `.env` file in the root directory with your Firebase configuration:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyDPpbHAUApFuyq-u1L891fvl95C5mHeSKY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=ofmapp-main.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=ofmapp-main
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=ofmapp-main.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=940511583527
EXPO_PUBLIC_FIREBASE_APP_ID=1:940511583527:web:7aa8d59fc3e2a8939c1d02
EXPO_PUBLIC_CRAFTMYPDF_API_KEY=7832MjA6MTE6UjlkM3h4emxpTExzeFR0aQ=
```

---

## Development

```bash
# Start local Metro bundler with cleared cache
npx expo start -c

# Run on Web (Browser)
Press 'w' in terminal or navigate to http://localhost:8081

# Run on Android Emulator / Physical Device
Press 'a' in terminal (requires Expo Go or Android SDK)

# Run Automated Test Suite (10 Comprehensive Suites)
npm test
```

---

## Build

### Web Production Export
```bash
# Build production web bundle into 'dist' directory
npm run build:web
```

### Mobile Android Standalone APK Build (via EAS)
```bash
# Generate standalone Android APK (configured in eas.json)
eas build --platform android --profile preview
```

---

## Production Deployment

### Deploy Web Application to Firebase Hosting
```bash
# Deploy static bundle to production hosting URL
npx firebase-tools deploy --only hosting
```
- **Live Production URL**: [https://ofmapp-main.web.app/](https://ofmapp-main.web.app/)
- **Console**: [https://console.firebase.google.com/project/ofmapp-main/overview](https://console.firebase.google.com/project/ofmapp-main/overview)
