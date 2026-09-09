# OFM — System Architecture & Technical Specifications

> **Organization Finance Management (OFM)** is an enterprise financial accounting, multi-role governance, and real-time ledger intelligence ecosystem engineered for institutional transparency, departmental budget compliance, staff remuneration, and cross-platform fidelity between Web and Mobile platforms.

---

## System Overview

OFM provides an authoritative, double-entry financial management platform engineered with a single unified codebase supporting:
* **Web Application**: Enterprise desktop widescreen and tablet responsive web interface deployed on Firebase Hosting.
* **Mobile Application**: Native Android standalone APK, iOS client bundle, and Expo development runtime with responsive card layouts and touch-first interactions.
* **Central Cloud Backend**: Google Firebase Cloud Firestore and Firebase Authentication acting as the authoritative, real-time single source of truth (SSOT).

### Core Functional Capabilities:
1. **General Ledger & Financial Accounting**: Inflow (Revenue/Grants) and Outflow (Operational Expenses) double-entry bookkeeping with voucher proofs and category classification.
2. **Departmental Cost Centers**: Allocation of fiscal budget ceilings, spend tracking, and automatic over-budget alerting.
3. **Staff Payroll Management**: Automated remuneration calculations (Base, Overtime, Allowances, Statutory Deductions) with instant official PDF & PNG payslip generation.
4. **Fiscal Intelligence & Executive KPIs**: Real-time evaluation of Operating Surplus, Retention Margin, Burn Rates, and Liquidity Runways.
5. **Two-Way Real-Time Data Synchronization**: Seamless cross-platform live replication between Web and Mobile clients.

---

## Web Architecture

The Web Application is built using **React Native for Web** integrated with **Expo Router v4**.
* **Responsive Layout Controller (`components/web/WebShell.tsx`)**:
  - Dynamically detects desktop viewports ($\ge 1024\text{px}$) and renders a dual-pane enterprise layout: a collapsible navigation sidebar (`WebSidebar.tsx`), an institutional top header (`WebHeader.tsx`), and a dedicated main workspace.
  - On viewports below $1024\text{px}$, gracefully switches to an adaptive layout with drawer navigation.
* **Dedicated Web Modules (`components/web/`)**:
  - `WebDashboard.tsx`: Executive KPI grid, dynamic operating balance card, concentric budget distribution donut charts, and transaction feeds.
  - `WebIncome.tsx` & `WebExpenses.tsx`: High-density tabular ledgers with multi-column sorting, date filters, and transaction receipt viewing.
  - `WebDepartments.tsx` & `WebBudgets.tsx`: Department allocation matrices, cost center creation, and staff headcount management.
  - `WebPayroll.tsx`: Payroll disbursal table with batch processing, slip previews, and instant downloads.
  - `WebReports.tsx`: Multi-period compliance auditing with native browser and base64 print/PDF exports.
* **State & Refresh Resilience**:
  - Auth token rehydration uses `indexedDBLocalPersistence` and `browserLocalPersistence`.
  - The `WebShell` incorporates an explicit `isLoading` gate preventing premature redirection to login during session rehydration.

---

## Mobile Architecture

The Mobile Application is engineered with **Expo SDK 54** and **React Native**, adhering to strict mobile design patterns:
* **Navigation Stack (`app/`)**:
  - `app/index.tsx`: Ultra-lightweight 0ms root redirector evaluating cached auth tokens to eliminate initial bundle stalls.
  - `app/_layout.tsx`: Root application shell wrapping providers (`AuthProvider`, `FinanceProvider`, `SettingsProvider`), managing safe area insets, and controlling splash screen unlock.
  - `app/(tabs)/`: Tab-based bottom navigation (`Dashboard`, `Income`, `Expenses`, `Reports`, `More`).
  - Feature screens: `app/budget.tsx`, `app/departments.tsx`, `app/payroll.tsx`, `app/team.tsx`, `app/settings.tsx`, `app/ai-insights.tsx`.
* **Mobile Responsiveness & Viewport Optimization**:
  - Full visibility for all financial figures and tags without clipping (normalized font padding, `adjustsFontSizeToFit`, `minimumFontScale={0.85}`, `numberOfLines={2}`).
  - Card minimum width set to $178\text{dp}$ to prevent abbreviation of KPI labels (`Inflow`, `Within Budget`, `10% Used`).
* **Keyboard Management**:
  - Implements `KeyboardAvoidingView` with platform-specific offsets (`padding` for iOS, dynamic bottom spacing for Android).
  - Automatically scrolls active input fields above the keyboard with multi-frame timers (60ms, 180ms, 320ms) ensuring fields like *Confirm Password* remain accessible.

---

## Backend Architecture

The backend is serverless, relying on **Google Cloud & Firebase Services**:
* **Firebase Authentication**: Manages identity tokens, password encryption, session expiration, and Google OAuth federation.
* **Cloud Firestore**: High-performance NoSQL document database providing real-time document listeners via WebSocket connections.
* **Cloud Functions (`functions/`)**: Serverless background compute for backend tasks and document processing.
* **Firebase Hosting**: Worldwide CDN serving production web bundles with SSL termination, HTTP/2 multiplexing, and clean routing rewrites.
* **Security & Authorization Layer (`firestore.rules`)**:
  - Enforces database-level access control based on `request.auth.uid` and document `organizationId`.
  - Prohibits cross-tenant access and prevents unauthorized mutations.

---

## Database

Firestore is structured with top-level collections partitioned by `organizationId`:

```
FIRESTORE ROOT
│
├── users/ {uid}
│     ├── uid: string
│     ├── email: string
│     ├── displayName: string
│     ├── role: "admin" | "accountant" | "manager" | "employee"
│     ├── organizationId: string
│     └── createdAt: timestamp
│
├── transactions/ {txId}
│     ├── id: string
│     ├── organizationId: string
│     ├── type: "income" | "expense"
│     ├── amount: number
│     ├── category: string
│     ├── department: string
│     ├── description: string
│     ├── date: string (ISO 8601)
│     ├── payrollId?: string
│     ├── createdAt: timestamp
│     └── updatedAt: timestamp
│
├── budgets/ {budgetId}
│     ├── id: string
│     ├── organizationId: string
│     ├── departmentId: string
│     ├── amount: number
│     ├── period: string
│     └── updatedAt: timestamp
│
├── departments/ {deptId}
│     ├── id: string
│     ├── organizationId: string
│     ├── name: string
│     ├── code: string
│     ├── manager: string
│     ├── budget: number
│     └── staffCount: number
│
├── payroll/ {payrollId}
│     ├── id: string
│     ├── organizationId: string
│     ├── employeeName: string
│     ├── employeeId: string
│     ├── department: string
│     ├── baseSalary: number
│     ├── allowances: number
│     ├── deductions: number
│     ├── netPay: number
│     ├── month: string
│     └── status: "paid" | "pending"
│
└── settings/ {orgId}
      ├── organizationName: string
      ├── currency: string ("PKR", "USD", etc.)
      ├── fiscalYearStart: string
      ├── logoUrl?: string
      └── updatedAt: timestamp
```

---

## Authentication

```
                     ┌───────────────────────┐
                     │   User Enters App     │
                     └──────────┬────────────┘
                                │
                   ┌────────────▼────────────┐
                   │  Check Cached Identity  │
                   │ (AsyncStorage / Web DB) │
                   └────────────┬────────────┘
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
   [ Valid Token ]                              [ Token Absent ]
         │                                             │
┌────────▼────────────────┐                 ┌──────────▼────────────┐
│ Rehydrate Canonical Org │                 │ Route to /login Page  │
│ (users/{uid} -> OrgId)  │                 └──────────┬────────────┘
└────────┬────────────────┘                            │
         │                                 ┌───────────┴───────────┐
         ▼                                 ▼                       ▼
┌─────────────────────────┐      [ Email + Password ]       [ Google OAuth ]
│ Enter Authenticated App │                │                       │
│ Mount Live Listeners    │                └───────────┬───────────┘
└─────────────────────────┘                            │
                                           ┌───────────▼───────────┐
                                           │ Validate Credentials  │
                                           │ Query Canonical Org   │
                                           │ Store in Auth State   │
                                           └───────────────────────┘
```

1. Client boots and queries `onAuthStateChanged`.
2. Auth profile is canonicalized via `resolveCanonicalUserProfile` against Firestore `users/{uid}`.
3. Active `organizationId` is verified.
4. User identity is dispatched to `AuthContext` and cached locally in `AsyncStorage` / `localStorage`.

### User Roles and Permission Matrix

| Action / Permission | Super Admin | Accountant | Manager | Employee |
| :--- | :---: | :---: | :---: | :---: |
| **System Settings & Org Branding** | ✅ Full Control | ❌ Denied | ❌ Denied | ❌ Denied |
| **User Role Assignment & Invites** | ✅ Full Control | ❌ Denied | ❌ Denied | ❌ Denied |
| **Record Revenue Inflow** | ✅ Create/Edit | ✅ Create/Edit | ❌ Denied | ❌ Denied |
| **Record Expense Outflow** | ✅ Create/Edit | ✅ Create/Edit | ✅ Department | ✅ Expense Claim |
| **Modify / Delete Ledger Records** | ✅ Full Control | ✅ Full Control | ❌ Denied | ❌ Denied |
| **Department Budget Allocation** | ✅ Full Control | ✅ Full Control | ❌ Denied | ❌ Denied |
| **Staff Payroll & Disbursals** | ✅ Full Control | ✅ Full Control | ✅ View Dept | ✅ View Own Slip |
| **Compliance Audits & Reports** | ✅ Full Access | ✅ Full Access | ✅ Department | ❌ Denied |

---

## Data Flow

```
WEB APPLICATION
       │
       ▼
API / BACKEND
       │
       ▼
DATABASE
       ▲
       │
MOBILE APPLICATION
```

### Detailed Operational Data Flows:

#### 1. Create Flow
```
User (Web or Mobile) ──> Form Submit ──> Validation ──> Firebase SDK (setDoc) ──> Cloud Firestore ──> onSnapshot Broadcast ──> UI Reactive Refresh
```

#### 2. Read Flow
```
User (Web or Mobile) ──> Auth Context (Active Org) ──> onSnapshot Query ──> Firestore Stream ──> Tombstone Filtering ──> Calculation Engine ──> Render UI
```

#### 3. Update Flow
```
User (Web or Mobile) ──> Edit Modal ──> Validation ──> Firebase SDK (updateDoc) ──> Cloud Firestore ──> Delta Event ──> Calculation Engine ──> In-Place UI Update
```

#### 4. Delete Flow ("Deleted Data Never Returns")
```
User (Web or Mobile) ──> Confirm Delete ──> deleteDoc() ──> Remote Firestore Deletion ──> Add to Local Tombstones ──> Filter from In-Memory State ──> Permanent Removal Across Restarts
```
