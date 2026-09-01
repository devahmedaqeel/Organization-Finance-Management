# OFM — Organization Finance Management
### Enterprise Financial Management, Multi-Role Access Control & Real-Time Cloud Synchronization

[![Live Web Application](https://img.shields.io/badge/Live_Web_App-ofmapp--main.web.app-blue?style=for-the-badge&logo=firebase)](https://ofmapp-main.web.app/)
[![Platform](https://img.shields.io/badge/Platform-Web_%7C_iOS_%7C_Android_%7C_Tablet-success?style=for-the-badge&logo=expo)](https://expo.dev/)
[![Firestore](https://img.shields.io/badge/Database-Cloud_Firestore_Real--Time-orange?style=for-the-badge&logo=firebase)](https://firebase.google.com/)

**OFM (Organization Finance Management)** is a cross-platform enterprise financial management platform built with React Native / Expo SDK 54, React Native Web, and Firebase Cloud Firestore. It delivers real-time ledger accounting, department budget allocations, payroll processing, role-based personnel access control, and instant **2-way multi-device synchronization between Mobile and Web**.

---

## 🌐 Live Web Deployment

* **Production URL**: [https://ofmapp-main.web.app/](https://ofmapp-main.web.app/)
* **Firebase Console**: [Firebase Project `ofmapp-main`](https://console.firebase.google.com/project/ofmapp-main/overview)

---

## ⚡ Key Highlights & Architecture

```
                       FIREBASE FIRESTORE CLOUD
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
    DESKTOP WEB               MOBILE WEB / PWA          NATIVE MOBILE
  (1280px - 1920px)            (320px - 480px)         (iOS / Android Expo)
         │                         │                         │
         └────────────── 2-WAY REAL-TIME SYNC ───────────────┘
```

### 1. Two-Way Real-Time Data Sync (Web ↔ Mobile)
* **Instant Propagation**: Any transaction, budget update, department cost adjustment, or payroll entry added on **Web** appears immediately on **Mobile**, and vice versa without needing a manual refresh.
* **Firestore `onSnapshot` Listeners**: Scoped to the organization boundary with optimistic local UI updates.
* **Offline Resilience**: Automatic cache-fallback via `@react-native-async-storage/async-storage` prevents data loss during network interruptions.

### 2. Multi-Role Permission & Security Matrix

| Feature / Capability | Admin | Accountant | Manager | Employee |
| :--- | :---: | :---: | :---: | :---: |
| **Institutional Dashboard & KPI Cards** | ✅ | ✅ | ✅ | ✅ |
| **Record Inflow (Income & Grants)** | ✅ | ✅ | ❌ | ❌ |
| **Record Outflow (Expenses & Claims)** | ✅ | ✅ | ✅ | ✅ |
| **Edit / Delete Financial Transactions** | ✅ | ✅ | ❌ | ❌ |
| **Department Budget Allocation** | ✅ | ✅ | ✅ | ❌ |
| **Department Cost Center Intelligence** | ✅ | ✅ | ✅ | ❌ |
| **Staff Payroll Records & Slips** | ✅ | ✅ | ✅ | ✅ *(Own slip)* |
| **Team Management & Role Assignment** | ✅ | ❌ | ❌ | ❌ |
| **Invite New Team Members** | ✅ | ❌ | ❌ | ❌ |
| **Financial Statements & Reports (PDF/CSV)** | ✅ | ✅ | ✅ | ❌ |
| **AI Fiscal Forecasting & Analytics** | ✅ | ❌ | ✅ | ❌ |
| **Organization Branding & System Settings** | ✅ | ❌ | ❌ | ❌ |

---

## 📁 Repository Structure

```
├── app/                        # Expo Router file-based mobile navigation
│   ├── (tabs)/                 # Bottom tab screens (Dashboard, Income, Expenses, More)
│   ├── _layout.tsx             # Root layout with platform safety & font guards
│   ├── login.tsx               # Authentication & demo account switcher
│   ├── onboarding.tsx          # Institutional welcome flow
│   ├── budget.tsx              # Mobile budget management
│   ├── departments.tsx         # Mobile departments view
│   ├── payroll.tsx             # Mobile staff payroll
│   ├── team.tsx                # Mobile team management & role assignment
│   ├── settings.tsx            # Mobile settings
│   └── ai-insights.tsx         # Mobile AI fiscal intelligence
├── components/                 # Shared UI components & charts
│   ├── web/                    # Enterprise Web platform suite
│   │   ├── WebShell.tsx        # Responsive desktop/tablet/mobile navigation shell
│   │   ├── WebDashboard.tsx    # Desktop dashboard with live charts & KPIs
│   │   ├── WebIncome.tsx       # Institutional revenue & grant ledger
│   │   ├── WebExpenses.tsx     # Expense tracking with category filters
│   │   ├── WebTransactions.tsx # Universal financial records table
│   │   ├── WebBudgets.tsx      # Budget allocation cards & progress indicators
│   │   ├── WebDepartments.tsx  # Department performance & headcounts
│   │   ├── WebPayroll.tsx      # Staff payroll compensation records
│   │   ├── WebTeam.tsx         # Personnel matrix & role assignment
│   │   ├── WebReports.tsx      # Multi-period financial statements & export
│   │   ├── WebAIInsights.tsx   # Fiscal health score & predictive insights
│   │   ├── WebSettings.tsx     # Organization branding & currency settings
│   │   ├── SvgIcons.tsx        # Pure vector SVG icon system for Web
│   │   └── modals/             # Web modals (Transactions, Budgets, Invites, Roles)
│   └── ErrorBoundary.tsx       # Production React error boundary
├── context/                    # React Context providers
│   ├── AuthContext.tsx         # Authentication state & role matrix
│   ├── FinanceContext.tsx      # Real-time ledger, budgets & Firestore sync
│   └── SettingsContext.tsx     # Theme, currency, and organization profile
├── config/                     # Firebase credentials & initialization
├── stubs/                      # Web-safe polyfills & stubs
│   └── react-native-keyboard-controller.web.js
├── firestore.rules             # Cloud Firestore security rules
├── firebase.json               # Firebase hosting & rewrite configuration
└── metro.config.js             # Metro configuration with web stubs
```

---

## 🚀 Quick Start & Development

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/devahmedaqeel/Organization-Finance-Management.git
cd Organization-Finance-Management

# Install dependencies
npm install
```

### 2. Run Local Development Server
```bash
# Start Expo development server (clears cache)
npx expo start -c

# Run on Web (Browser)
Press 'w' in terminal or visit http://localhost:8081/

# Run on Android / iOS
Press 'a' for Android emulator or 'i' for iOS simulator
```

### 3. Build & Deploy to Firebase Hosting
```bash
# Export static web bundle
npx expo export -p web

# Deploy to Firebase Hosting and Firestore
npx firebase-tools deploy
```

---

## 🔐 Demo Credentials for Instant Testing

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@ofm.com` | `Admin123` |
| **Accountant** | `accountant@ofm.com` | `Account123` |
| **Manager** | `manager@ofm.com` | `Manager123` |
| **Employee** | `employee@ofm.com` | `Employee123` |

---

## 👨‍💻 Author & Repository
* **GitHub Repository**: [https://github.com/devahmedaqeel/Organization-Finance-Management](https://github.com/devahmedaqeel/Organization-Finance-Management)
* **Author**: Ahmed Aqeel ([@devahmedaqeel](https://github.com/devahmedaqeel))

---

## 📄 License
MIT License. Developed for Organization Finance Management (OFM). All rights reserved.
