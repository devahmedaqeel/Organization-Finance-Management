# OFM — System Architecture & Technical Specifications

This document outlines the architectural blueprints, real-time cloud data pipelines, security models, mathematical calculation engines, and cross-platform component hierarchy of the **Organization Finance Management (OFM)** ecosystem.

---

## 1. High-Level System Architecture

```
                               ┌────────────────────────────────────────┐
                               │       GOOGLE CLOUD & FIREBASE          │
                               │                                        │
                               │  ┌──────────────────────────────────┐  │
                               │  │   Cloud Firestore Real-Time DB   │  │
                               │  │   (Scoped by Organization ID)    │  │
                               │  └──────────────────────────────────┘  │
                               │  ┌──────────────────────────────────┐  │
                               │  │   Firebase Authentication        │  │
                               │  │   (Email/Pass, Google OAuth)     │  │
                               │  └──────────────────────────────────┘  │
                               │  ┌──────────────────────────────────┐  │
                               │  │   Firebase Hosting (Production)  │  │
                               │  │   https://ofmapp-main.web.app/   │  │
                               │  └──────────────────────────────────┘  │
                               └───────────────────┬────────────────────┘
                                                   │
                       ┌───────────────────────────┴───────────────────────────┐
                       │                                                       │
                       ▼                                                       ▼
        ┌─────────────────────────────┐                         ┌─────────────────────────────┐
        │        WEB PLATFORM         │                         │       NATIVE PLATFORM       │
        │      (React Native Web)     │                         │      (Expo SDK 54 / EAS)    │
        │                             │                         │                             │
        │  * Widescreen Desktop       │                         │  * Android Standalone APK   │
        │  * Tablet (768px - 1080px)  │                         │  * iOS Client Bundle        │
        │  * Mobile PWA (320px-480px) │                         │  * Expo Go Client Dev       │
        └──────────────┬──────────────┘                         └──────────────┬──────────────┘
                       │                                                       │
                       └────────────────── 2-WAY REAL-TIME SYNC ───────────────┘
```

---

## 2. Real-Time Data Synchronization Engine (`FinanceContext.tsx`)

### A. Organization-Scoped Cloud Firestore Isolation
Every organization's financial records are isolated via `organizationId`:
* `transactions` collection — Double-entry revenue inflows, operational expense outflows, voucher invoices, and timestamps.
* `budgets` collection — Department allocated ceilings, monitored spend thresholds, and fiscal year tags.
* `departments` collection — Cost centers, department managers, and staff headcounts.
* `payroll` collection — Employee monthly compensation, base salary, overtime bonuses, statutory deductions, and net disbursals.
* `settings` collection — System theme, active currency code, fiscal period, and organization identity logo.

### B. Optimistic Local State & Offline Fallback
* Real-time listeners (`onSnapshot`) listen to collection queries filtered by `organizationId`.
* On network disconnection, `@react-native-async-storage/async-storage` provides immediate local persistence so the UI remains interactive and fast.
* On network reconnection, mutations are dispatched to Firestore and synced across all connected devices simultaneously.

---

## 3. Route Resolution & Lifecycle Architecture

### Root Redirect Layer (`app/index.tsx`)
```
                          ┌────────────────────────┐
                          │   App Launch / Boot    │
                          └───────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │      app/index.tsx      │
                         │ (0ms Initial Redirect)  │
                         └────────────┬────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
            ▼                         ▼                         ▼
   [ Authenticated ]       [ First-Time Launch ]      [ Unauthenticated ]
           │                          │                         │
           ▼                          ▼                         ▼
      /(tabs)/index             /onboarding                   /login
```

* **Zero-Bundle-Lock**: Eliminates initial bundle stalls in Expo Go by preventing the 2000-line dashboard from mounting before `useAuth()` resolves.
* **Instant Routing**: Redirects within 0ms based on cached AsyncStorage auth tokens.

---

## 4. Multi-Role Personnel & Security Matrix

```
                      [ Super Administrator ]
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
    [ Accountant ]        [ Manager ]           [ Employee ]
```

### Granular Capabilities Matrix:

| Capability / Action | Admin | Accountant | Manager | Employee |
| :--- | :---: | :---: | :---: | :---: |
| **Manage Organization Identity & Logo** | ✅ | ❌ | ❌ | ❌ |
| **Manage Personnel Roles & Invites** | ✅ | ❌ | ❌ | ❌ |
| **View Consolidated Financial Statements** | ✅ | ✅ | ✅ *(Dept)* | ❌ |
| **Record Revenue Inflows (Grants/Income)** | ✅ | ✅ | ❌ | ❌ |
| **Record Operational Outflows (Expenses)** | ✅ | ✅ | ✅ *(Dept)* | ✅ *(Claim)* |
| **Modify / Delete General Ledger Records** | ✅ | ✅ | ❌ | ❌ |
| **Allocate Department Budget Ceilings** | ✅ | ✅ | ❌ | ❌ |
| **Generate Official Staff Payslips (PDF/Image)**| ✅ *(All)* | ✅ *(All)* | ✅ *(Dept)* | ✅ *(Own)* |
| **AI Predictive Forecasting & Health Score**| ✅ | ❌ | ✅ *(Dept)* | ❌ |

---

## 5. Mathematical Calculation & Fiscal Health Engine

Located in `services/FinancialCalculationEngine.ts` and `services/DatePeriodService.ts`:

### A. Net Operating Result & Retention Margin
$$\text{Net Surplus} = \sum \text{Revenue Inflows} - \sum \text{Operational Outflows}$$
$$\text{Retention Margin (\%)} = \left( \frac{\text{Net Surplus}}{\text{Total Revenue Inflows}} \right) \times 100$$

### B. Budget Utilization & Overrun Thresholds
$$\text{Department Utilization (\%)} = \left( \frac{\text{Disbursed Spend}}{\text{Allocated Budget Ceiling}} \right) \times 100$$
* **Normal**: $< 80\%$ (Green)
* **Warning / Approaching Limit**: $80\% - 100\%$ (Amber)
* **Overrun Alert**: $> 100\%$ (Crimson)

### C. Staff Net Remuneration Formula
$$\text{Net Pay} = (\text{Base Salary} + \text{Allowances} + \text{Bonuses}) - \text{Statutory Deductions}$$

---

## 6. Export Engines (PDF & Image Generation)

* **Financial Statement Compiler (`ReportExportService.ts`)**: Compiles structured HTML/CSS dossiers and exports multi-page consolidated PDFs via `expo-print` and browser print engines.
* **Payslip Generator (`payslipExportService.ts`)**: Produces official institutional salary slips with security badges, watermarks, and verification keys. Supports PDF download and High-Resolution PNG export to Android Photos/Gallery.

---

## 7. Cross-Platform Directory Structure

```
├── app/                        # Expo Router Native Navigation Stack
│   ├── index.tsx               # Root redirect layer
│   ├── _layout.tsx             # Root layout with platform safety
│   ├── (tabs)/                 # Bottom tab navigator
│   ├── login.tsx               # Auth controller
│   ├── budget.tsx              # Mobile budgets
│   ├── departments.tsx         # Mobile cost centers
│   ├── payroll.tsx             # Mobile staff payroll
│   ├── team.tsx                # Mobile personnel management
│   ├── settings.tsx            # Mobile settings
│   └── ai-insights.tsx         # Predictive intelligence
├── components/                 # Component System
│   ├── web/                    # Enterprise Web Shell & Modules
│   ├── analytics/              # Donut & Radial Gauges
│   └── modals/                 # Responsive Modal System
├── context/                    # State Providers (Auth, Finance, Settings)
├── services/                   # Business Logic & Export Engines
├── config/firebase.ts          # Cloud Firestore Config
├── eas.json                    # EAS Android APK Build Profiles
└── firestore.rules             # Cloud Security Rules
```
