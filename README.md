# OFM — Organization Finance Management

> **Enterprise Institutional Accounting, Real-Time Cloud Synchronization, Multi-Role Access Control & Executive Financial Dossiers**

[![Platform](https://img.shields.io/badge/Platform-Native_Android_%7C_iOS_%7C_Web_%7C_Tablet-10B981?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![Database](https://img.shields.io/badge/Database-Firebase_Cloud_Firestore-F59E0B?style=for-the-badge&logo=firebase&logoColor=white)](https://firebase.google.com/)
[![EAS Build](https://img.shields.io/badge/EAS_Build-Android_APK_Ready-8B5CF6?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![License](https://img.shields.io/badge/License-MIT-3B82F6?style=for-the-badge)](LICENSE)

---

## Overview

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
- **Multi-Role Security (RBAC)**: Distinct permissions for Super Administrator, Accountant, Manager, and Employee.
- **Institutional Branding & Customization**: Support for 150+ international currencies (with default PKR formatting), custom organization logo upload, and dark/light adaptive themes.
- **0ms Instant Startup**: Ultra-lightweight root redirector prevents bundle stalls on native startup.

---

## Technology Stack

Documented strictly from the actual technologies implemented in this project:

- **Frontend & Web**: [React Native for Web](https://necolas.github.io/react-native-web/) (v0.21.0), [React 19](https://react.dev/) (v19.2.3), [Expo Router v4](https://docs.expo.dev/router/introduction/) (v57.0.19)
- **Mobile**: [React Native](https://reactnative.dev/) (v0.86.3), [Expo SDK 54](https://docs.expo.dev/) (v57.0.20), [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated/) (v4.5.1), [react-native-safe-area-context](https://github.com/th3rdwave/react-native-safe-area-context)
- **Backend**: Serverless architecture powered by [Firebase](https://firebase.google.com/) (v12.13.0) and Cloud Functions (`functions/`)
- **Database**: [Google Cloud Firestore](https://firebase.google.com/docs/firestore) (real-time document store with active snapshot listeners)
- **Authentication**: [Firebase Authentication](https://firebase.google.com/docs/auth) (Email/Password, Google OAuth Federation, multi-tier persistence via IndexedDB, LocalStorage, and AsyncStorage)
- **APIs & SDKs**: Firebase JavaScript SDK v12, Expo Print (`expo-print`), Expo Sharing (`expo-sharing`), CraftMyPDF REST API integration
- **Build Pipeline**: [EAS Build](https://docs.expo.dev/build/introduction/) (Expo Application Services) for standalone Android APK and AAB packages

---

## Project Structure

A concise overview of the core project structure:

```
├── app/                                 # Expo Router file-based navigation & routes
│   ├── (tabs)/                          # Bottom tab navigation (Dashboard, Income, Expenses, Reports, More)
│   ├── auth/                            # Google OAuth & authentication routing handlers
│   ├── _layout.tsx                      # Root application provider shell & safe area wrappers
│   ├── index.tsx                        # 0ms lightweight root route handler
│   ├── budget.tsx                       # Department budget allocations
│   ├── departments.tsx                  # Department cost center management
│   ├── payroll.tsx                      # Staff payroll & payslips
│   ├── team.tsx                         # Personnel & RBAC management
│   ├── settings.tsx                     # Organization profile & branding
│   └── ai-insights.tsx                  # Predictive fiscal health & insights
├── components/                          # Reusable UI component hierarchy
│   ├── analytics/                       # High-density financial analytics suite
│   ├── web/                             # Desktop widescreen enterprise views & modals
│   └── ...                              # Native & cross-platform cards, charts, and modals
├── config/                              # Configuration & Firebase initialization
│   └── firebase.ts                      # Multi-platform Firebase Auth & Firestore setup
├── constants/                           # Global constants (colors, currencies, categories, branding)
├── context/                             # Global state providers (AuthContext, FinanceContext, SettingsContext)
├── functions/                           # Firebase Cloud Functions backend service
├── hooks/                               # Custom hooks (responsive, keyboard, colors, notifications)
├── services/                            # Authoritative financial math, reports & PDF engines
│   ├── FinancialCalculationEngine.ts    # Authoritative calculation formulas & KPIs
│   ├── DatePeriodService.ts             # Fiscal period filtering & date range calculations
│   ├── ReportExportService.ts           # PDF dossier generator & compiler
│   └── payslipExportService.ts          # Native PDF & PNG slip exporter
├── stubs/                               # Web compatibility stubs (keyboard controller)
└── utils/                               # Shared date and financial formatting utilities
```

---

## Installation

### Prerequisites
- **Node.js**: v18 or higher (LTS recommended)
- **npm**: v9 or higher
- **Expo CLI**: `npm install -g expo-cli eas-cli` (optional global installation)

### Setup Steps
```bash
# 1. Clone the repository
git clone https://github.com/devahmedaqeel/Organization-Finance-Management.git

# 2. Navigate to project directory
cd Organization-Finance-Management

# 3. Install project dependencies
npm install
```

---

## Environment Configuration

Create a `.env` file in the root directory. Provide your own Firebase and external service credentials.

> **CRITICAL SECURITY NOTICE**: Never commit actual API keys, private credentials, or secrets to version control.

```env
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID

# Optional External PDF Generation Service
EXPO_PUBLIC_CRAFTMYPDF_API_KEY=YOUR_CRAFTMYPDF_API_KEY
```

---

## Running the Project

### Development Server
```bash
# Start local Metro bundler (clears cache and ensures assets)
npm start
# or: npx expo start -c
```

### Web Application
To run the Web application in your browser:
```bash
# Start Metro bundler targeting web
npm run web
# or navigate to http://localhost:8081 directly in your browser
```

### Mobile Application
To run the Mobile application on an emulator or physical device:
```bash
# For Android:
npm run android
# or press 'a' in the interactive terminal after running 'npm start'

# For iOS (macOS required):
npm run ios
# or press 'i' in the interactive terminal after running 'npm start'
```

---

## Available Scripts

The following scripts are defined in `package.json`:

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm start` | `node ensure_assets.js && expo start` | Syncs assets and starts the Metro development server |
| `npm run android` | `expo run:android` | Builds and runs the native Android project |
| `npm run ios` | `expo run:ios` | Builds and runs the native iOS project |
| `npm run web` | `expo start --web` | Starts the local Metro development server for Web |
| `npm run build:apk` | `eas build -p android --profile preview` | Builds a standalone Android APK via EAS Build |
| `npm run build:aab` | `eas build -p android --profile production` | Builds a production Android App Bundle (AAB) via EAS |
| `npm run build:web` | `expo export -p web` | Exports the static production web bundle into `dist/` |
| `npm run deploy:hosting`| `expo export -p web && firebase deploy --only hosting` | Exports web bundle and deploys to Firebase Hosting |
| `npm run typecheck` | `tsc -p tsconfig.json --noEmit` | Runs full TypeScript static type checking |
| `npm test` | `npx -y tsx services/__tests__/runAllTests.ts` | Runs the comprehensive 10-suite automated test suite |

---

## Build

### Web Bundle Export
```bash
npm run build:web
```
This command bundles all web assets into the `dist/` directory ready for static hosting.

### Mobile Standalone APK Build (EAS Build)
```bash
npm run build:apk
```
This initiates a cloud build using the `preview` profile configured in `eas.json` to generate an installable `.apk` file for Android devices.

---

## Architecture

OFM uses a **Single Unified Backend Architecture** where Google Cloud Firestore is the authoritative central source of truth for all clients:

```
┌────────────────────────────────────────────────────────┐
│               CENTRAL CLOUD FIRESTORE                  │
│             (Single Authoritative SSOT)                │
└───────────────────────────┬────────────────────────────┘
                            │
              WebSocket Real-Time Sync (onSnapshot)
                            │
         ┌──────────────────┴──────────────────┐
         ▼                                     ▼
┌──────────────────────────────┐     ┌──────────────────────────────┐
│       WEB APPLICATION        │     │      MOBILE APPLICATION      │
│  (Desktop / Tablet / PWA)    │     │    (Android APK / iOS)       │
│                              │     │                              │
│ • WebShell Enterprise Layout │     │ • Expo Router Tab Navigator  │
│ • High-Density Data Tables   │     │ • Touch-Optimized Cards      │
│ • IndexedDB Persistence      │     │ • AsyncStorage Persistence   │
│ • Direct Firestore SDK       │     │ • Direct Firestore SDK       │
└──────────────────────────────┘     └──────────────────────────────┘
```

Both clients share:
1. **Central Collections**: `transactions`, `budgets`, `departments`, `payroll`, `settings`.
2. **Organization Isolation**: Scoped by `organizationId` across all reads and writes.
3. **Deterministic Math Engine**: All financial computations are calculated through `services/FinancialCalculationEngine.ts`.
4. **Persistent Tombstones**: Deleted records are purged centrally and indexed locally to guarantee they never resurface.
