# OFM — Organization Finance Management
### Enterprise Institutional Accounting, Real-Time Cloud Synchronization, Multi-Role Access Control & Executive Financial Dossiers

[![Live Web Application](https://img.shields.io/badge/Live_Web_App-ofmapp--main.web.app-38BDF8?style=for-the-badge&logo=firebase&logoColor=white)](https://ofmapp-main.web.app/)
[![Platform](https://img.shields.io/badge/Platform-Native_Android_%7C_iOS_%7C_Web_%7C_Tablet-10B981?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![Cloud Firestore](https://img.shields.io/badge/Database-Firebase_Cloud_Firestore-F59E0B?style=for-the-badge&logo=firebase&logoColor=white)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-8B5CF6?style=for-the-badge)](LICENSE)

**OFM (Organization Finance Management)** is an enterprise financial intelligence and general ledger ecosystem built with **React Native / Expo SDK 54**, **React Native Web**, and **Google Cloud Firestore**. It delivers real-time double-entry ledger accounting, department budget allocation ceilings, staff payroll and automated payslip generation (PDF & High-Res Image), multi-period compliance reporting, role-based personnel security matrix, and **instant 2-way real-time data synchronization between Mobile and Web platforms**.

---

## 🌐 Live Production Deployments

* **Official Production Web App**: [https://ofmapp-main.web.app/](https://ofmapp-main.web.app/)
* **GitHub Repository**: [https://github.com/devahmedaqeel/Organization-Finance-Management](https://github.com/devahmedaqeel/Organization-Finance-Management)
* **Firebase Console**: [Project `ofmapp-main`](https://console.firebase.google.com/project/ofmapp-main/overview)

---

## ⚡ Architecture & Real-Time Sync

```
                           FIREBASE FIRESTORE CLOUD
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           │                          │                          │
      DESKTOP WEB              MOBILE WEB / PWA            NATIVE MOBILE
    (1080px - 1920px)           (320px - 480px)         (Android APK / iOS)
           │                          │                          │
           └─────────────── 2-WAY REAL-TIME SYNC ────────────────┘
```

* **Instant Propagation**: Any revenue inflow, expense outflow, budget change, or payroll disbursal recorded on Mobile immediately reflects on Web in real-time without requiring a page refresh.
* **Resilient Offline Cache**: Scoped to the organization boundary with optimistic UI mutations and automatic `@react-native-async-storage/async-storage` local caching.
* **Instant Root Resolution**: Features a 0ms root redirect in `app/index.tsx` preventing initial bundle locks and ensuring smooth startup across Expo Go and Native APK builds.

---

## 🛡️ Multi-Role Security & Permissions Matrix

| Feature / Module | Admin | Accountant | Manager | Employee |
| :--- | :---: | :---: | :---: | :---: |
| **Executive Financial Dashboard & KPIs** | ✅ Full Access | ✅ Full Access | ✅ Department Only | ✅ Personal View |
| **Record Inflow (Revenue & Grants)** | ✅ Create / Edit | ✅ Create / Edit | ❌ Restricted | ❌ Restricted |
| **Record Outflow (Operational Expenses)** | ✅ Create / Edit | ✅ Create / Edit | ✅ Department Only | ✅ Claim Submission |
| **General Ledger & Double-Entry Audit Trail** | ✅ Full Audit | ✅ Full Audit | ✅ View Only | ❌ Restricted |
| **Department Budget Allocation Ceilings** | ✅ Manage | ✅ Manage | ✅ View & Track | ❌ Restricted |
| **Monitored Cost Centers & Headcounts** | ✅ Full Control | ✅ View & Audit | ✅ View & Audit | ❌ Restricted |
| **Staff Payroll & Disbursals** | ✅ Full Control | ✅ Full Control | ✅ View Only | ✅ View Own Slip |
| **Official Payslip Generation (PDF & Image)** | ✅ All Staff | ✅ All Staff | ✅ Department Staff | ✅ Own Salary Slip |
| **Institutional Audit Dossiers & PDF Statements** | ✅ Full Suite | ✅ Full Suite | ✅ Department View | ❌ Restricted |
| **Team Management & Role Reassignment** | ✅ Full Control | ❌ Restricted | ❌ Restricted | ❌ Restricted |
| **AI Fiscal Forecasting & Health Metrics** | ✅ Full Suite | ❌ Restricted | ✅ Department View | ❌ Restricted |
| **Organization Identity & Global Branding** | ✅ Full Control | ❌ Restricted | ❌ Restricted | ❌ Restricted |

---

## 📱 Key Modules & Capabilities

### 1. 📊 Executive Financial Overview & Dossier
* **Dynamic Operating Result Card**: Real-time Surplus Retained vs Total Outflows toggling with interactive growth badges and retention margin meters.
* **Net Operating Balance Health Engine**: Mathematical evaluation of liquidity ratios, cash burn rates, savings velocity, and runway estimation.

### 2. 📑 Universal General Ledger & Transaction Trail
* Double-entry bookkeeping ledger supporting voucher references, department cost centers, and multi-category filters.
* One-click PDF & CSV statement exports with cryptographic ledger timestamps.

### 3. 🎯 Department Budget Ceilings & Allocations
* Visual utilization gauges, expenditure ceilings, and real-time overrun alert thresholds.
* Interactive symmetrical concentric Donut charts with multi-metric toggling (`% Used`, `Spent Amount`, `Remaining Budget`).

### 4. 👥 Staff Payroll & Instant Payslip Generator
* Base salary, allowances, overtime bonuses, and statutory deduction breakdowns.
* Direct generation of **Official Salary Slips** as both formatted **PDFs** and **High-Resolution Images** saved directly to the device Gallery.

### 5. 🏢 Institutional Branding & Customization
* Direct 1-click device logo upload (PNG, JPG, SVG, WEBP).
* Multi-currency support across 150+ international currencies with live formatting.
* Dark, Light, and System adaptive theme switching.

---

## 📁 Repository Directory Structure

```
├── app/                                 # Expo Router file-based mobile navigation
│   ├── index.tsx                        # ⚡ Instant lightweight root redirect handler
│   ├── _layout.tsx                      # Root layout with platform safety & splash unlock
│   ├── (tabs)/                          # Bottom navigation stack
│   │   ├── index.tsx                    # Executive Financial Dashboard
│   │   ├── income.tsx                   # Revenue & Grant Inflow Ledger
│   │   ├── expenses.tsx                 # Expenditure & Claim Outflows
│   │   ├── reports.tsx                  # Financial Auditing & Multi-Period Reports
│   │   └── more.tsx                     # Extended Features & Navigation Matrix
│   ├── login.tsx                        # Authentication & Multi-Role Demo Switcher
│   ├── onboarding.tsx                   # Institutional Onboarding Presentation
│   ├── budget.tsx                       # Department Budget Allocations
│   ├── departments.tsx                  # Monitored Cost Centers
│   ├── payroll.tsx                      # Staff Payroll & Remuneration Audit
│   ├── team.tsx                         # Personnel Permissions & Role Assignment
│   ├── settings.tsx                     # Organization Identity & System Settings
│   └── ai-insights.tsx                  # Predictive Fiscal Intelligence Engine
├── components/                          # Core UI components & charts
│   ├── analytics/                       # Financial Analytics & Donut Suite
│   ├── web/                             # Enterprise Web Platform Architecture
│   │   ├── WebShell.tsx                 # Responsive Header, Sidebar & Bottom Nav
│   │   ├── WebDashboard.tsx             # Widescreen Dashboard with Live KPIs
│   │   ├── WebIncome.tsx                # Institutional Revenue Suite
│   │   ├── WebExpenses.tsx              # Outflow Tracking & Category Filters
│   │   ├── WebTransactions.tsx          # Double-Entry General Ledger Table
│   │   ├── WebBudgets.tsx               # Budget Allocation Ceilings
│   │   ├── WebDepartments.tsx           # Cost Center Headcounts & Stats
│   │   ├── WebPayroll.tsx               # Staff Payroll & Compensation
│   │   ├── WebTeam.tsx                  # Personnel & Security Matrix
│   │   ├── WebReports.tsx               # Statement Generator & Export Suite
│   │   ├── WebAIInsights.tsx            # Fiscal Health Analysis
│   │   ├── WebSettings.tsx              # Organization Identity & Theme Settings
│   │   ├── SvgIcons.tsx                 # Pure Vector SVG System for Web
│   │   └── modals/                      # Responsive Form & Confirmation Modals
│   ├── DonutChart.tsx                   # Concentric Circular Donut Chart
│   ├── RingProgress.tsx                 # Proportional Circular Gauge
│   └── ErrorBoundary.tsx                # React Exception Isolation Boundary
├── context/                             # React State & Real-Time Context
│   ├── AuthContext.tsx                  # User Authentication & Role Matrix
│   ├── FinanceContext.tsx               # Firestore Real-Time Synchronizer
│   └── SettingsContext.tsx              # Organization Branding & Currency State
├── services/                            # Financial & Export Engines
│   ├── DatePeriodService.ts             # Multi-Period Normalization Engine
│   ├── FinancialCalculationEngine.ts    # Authoritative Mathematical Models
│   ├── payslipExportService.ts          # Payslip PDF & Image Generator
│   └── ReportExportService.ts           # PDF Financial Statement Compiler
├── config/                              # Firebase Configuration & Security
├── firestore.rules                      # Cloud Firestore Security Rules
├── firebase.json                        # Firebase Hosting & Rewrites
├── eas.json                             # EAS Android APK Build Profiles
└── package.json                         # Project Dependencies & Scripts
```

---

## 🚀 Development & Build Guide

### 1. Prerequisites & Installation
```bash
# Clone the repository
git clone https://github.com/devahmedaqeel/Organization-Finance-Management.git
cd Organization-Finance-Management

# Install project dependencies
npm install
```

### 2. Run Local Development Server
```bash
# Start Expo development server (cleans Metro cache)
npx expo start -c

# Press 'w' in terminal for Web Browser (http://localhost:8081/)
# Press 'a' in terminal for Android Emulator / Expo Go
# Press 'i' in terminal for iOS Simulator
```

### 3. 📱 Build Standalone Android APK (EAS Build)
```bash
# Direct Cloud APK Build (Recommended)
npx eas-cli build -p android --profile preview

# Or Local Build (Requires Android SDK & Studio)
npx eas-cli build -p android --profile preview --local
```

### 4. 🌐 Export Web Bundle & Deploy to Firebase Hosting
```bash
# Export static web bundle
npx expo export -p web

# Deploy to Firebase Hosting
npx firebase deploy --only hosting
```

---

## 🔐 Instant Demo Testing Credentials

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Executive Admin** | `admin@ofm.com` | `Admin123` | Full Institutional Superuser |
| **Staff Accountant** | `accountant@ofm.com` | `Account123` | General Ledger & Financial Dossiers |
| **Department Manager** | `manager@ofm.com` | `Manager123` | Department Cost Centers & Outflows |
| **Standard Employee** | `employee@ofm.com` | `Employee123` | Personal Salary Slip & Expense Claims |

---

## 👨‍💻 Author & Repository

* **Project**: Organization Finance Management (OFM)
* **GitHub**: [@devahmedaqeel](https://github.com/devahmedaqeel)
* **Live Deployment**: [https://ofmapp-main.web.app/](https://ofmapp-main.web.app/)

---

## 📄 License

This project is licensed under the **MIT License** — open and extensible for institutional finance management.
