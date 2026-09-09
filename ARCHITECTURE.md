# OFM — System Architecture & Technical Specifications

> **Organization Finance Management (OFM)** is an enterprise financial accounting, multi-role governance, and real-time ledger intelligence ecosystem engineered for institutional transparency, departmental budget compliance, staff remuneration, and cross-platform fidelity between Web and Mobile platforms.

---

## 1. Project Overview
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

## 2. Web Architecture
The Web Application is built using **React Native for Web** integrated with **Expo Router v4**.
* **Responsive Layout Controller (`components/web/WebShell.tsx`)**:
  - Dynamically detects desktop viewports ($\ge 1024\text{px}$) and renders a dual-pane enterprise layout: a collapsible navigation sidebar (`WebSidebar.tsx`), an institutional top header (`WebHeader.tsx`), and a dedicated main workspace.
  - On viewports below $1024\text{px}$, gracefully switches to an adaptive layout with drawer navigation.
* **Dedicated Web Modules (`components/web/`)**:
  - `WebDashboard.tsx`: Executive KPI grid, dynamic operating balance card, concentric budget distribution donut charts, and transaction feeds.
  - `WebIncome.tsx` & `WebExpenses.tsx`: High-density tabular ledgers with multi-column sorting, date filters, and transaction receipt viewing.
  - `WebDepartments.tsx` & `WebBudget.tsx`: Department allocation matrices, cost center creation, and staff headcount management.
  - `WebPayroll.tsx`: Payroll disbursal table with batch processing, slip previews, and instant downloads.
  - `WebReports.tsx`: Multi-period compliance auditing with native browser and base64 print/PDF exports.
* **State & Refresh Resilience**:
  - Auth token rehydration uses `indexedDBLocalPersistence` and `browserLocalPersistence`.
  - The `WebShell` incorporates an explicit `isLoading` gate preventing premature redirection to login during session rehydration.

---

## 3. Mobile Architecture
The Mobile Application is engineered with **Expo SDK 54** and **React Native**, adhering to strict mobile design patterns:
* **Navigation Stack (`app/`)**:
  - `app/index.tsx`: Ultra-lightweight 0ms root redirector evaluating cached auth tokens to eliminate initial bundle stalls.
  - `app/_layout.tsx`: Root application shell wrapping providers (`AuthProvider`, `FinanceProvider`, `ThemeProvider`), managing safe area insets, and controlling splash screen unlock.
  - `app/(tabs)/`: Tab-based bottom navigation (`Dashboard`, `Income`, `Expenses`, `Reports`, `More`).
  - Feature screens: `app/budget.tsx`, `app/departments.tsx`, `app/payroll.tsx`, `app/team.tsx`, `app/settings.tsx`, `app/ai-insights.tsx`.
* **Mobile Responsiveness & Viewport Optimization**:
  - Full visibility for all financial figures and tags without clipping (normalized font padding, `adjustsFontSizeToFit`, `minimumFontScale={0.85}`, `numberOfLines={2}`).
  - Card minimum width set to $178\text{dp}$ to prevent abbreviation of KPI labels (`Inflow`, `Within Budget`, `10% Used`).
* **Keyboard Management**:
  - Implements `KeyboardAvoidingView` with platform-specific offsets (`padding` for iOS, dynamic bottom spacing for Android).
  - Automatically scrolls active input fields above the keyboard with multi-frame timers (60ms, 180ms, 320ms) ensuring fields like *Confirm Password* remain accessible.

---

## 4. Backend Architecture
The backend is serverless, relying on **Google Cloud & Firebase Services**:
* **Firebase Authentication**: Manages identity tokens, password encryption, session expiration, and Google OAuth federation.
* **Cloud Firestore**: High-performance NoSQL document database providing real-time document listeners via WebSocket connections.
* **Firebase Hosting**: Worldwide CDN serving production web bundles with SSL termination, HTTP/2 multiplexing, and clean routing rewrites.
* **Security & Authorization Layer (`firestore.rules`)**:
  - Enforces database-level access control based on `request.auth.uid` and document `organizationId`.
  - Prohibits cross-tenant access and prevents unauthorized mutations.

---

## 5. Database Architecture
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

## 6. API Architecture
OFM uses direct, optimized SDK calls through the Firebase Client SDK rather than an intermediary REST proxy, ensuring minimal latency and native WebSocket streaming:
* **Authentication API**:
  - `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signOut`
  - `GoogleAuthProvider.credential` & `signInWithCredential`
  - `sendPasswordResetEmail`
* **Data Mutation API**:
  - `collection`, `doc`, `setDoc`, `updateDoc`, `deleteDoc`
  - `runTransaction` / `writeBatch` for atomic operations
* **Data Retrieval & Query API**:
  - `query(collection(db, "transactions"), where("organizationId", "==", activeOrgId))`
  - Real-time streaming via `onSnapshot` subscriptions.

---

## 7. Authentication Flow
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
4. User identity is dispatched to `AuthContext` and cached locally in `AsyncStorage`.

---

## 8. Authorization / Role Flow
OFM implements a strict Role-Based Access Control (RBAC) matrix:

```
                            [ Super Administrator ]
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 │                     │                     │
                 ▼                     ▼                     ▼
           [ Accountant ]        [ Manager ]           [ Employee ]
```

| Action / Permission | Admin | Accountant | Manager | Employee |
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

## 9. Web-to-Mobile Data Flow
```
1. User creates an Expense on Web Application
   │
2. Client executes addTransaction() in FinanceContext
   │
3. Payload validated & written to Firestore: transactions/{newId}
   │
4. Firestore emits WebSocket change event to all active snapshot subscribers
   │
5. Mobile App's onSnapshot listener triggers in milliseconds
   │
6. Mobile FinanceContext receives updated document list
   │
7. FinancialCalculationEngine recomputes KPIs (Net Cash, Burn Rate, Margin)
   │
8. Mobile UI updates reactively — zero manual refresh required
```

---

## 10. Mobile-to-Web Data Flow
```
1. User records Revenue Inflow on Mobile App
   │
2. Mobile client dispatches addTransaction()
   │
3. Document saved to Firestore transactions collection
   │
4. Cloud Firestore dispatches real-time delta via Web Channel
   │
5. Web Application onSnapshot handler fires
   │
6. Web state updates; table rows, charts, and summary cards re-render
   │
7. Web Dashboard reflects exact matching balance
```

---

## 11. Data Synchronization Strategy
* **Central Database as Authoritative Truth**: No client holds a distinct permanent data store.
* **Dual-Tenant Cross-Mirroring**: All mutations in `FinanceContext` write to the primary organization (`org-9icgv4ijp`) and replicate across legacy aliases (`demo-org`) to guarantee 100% interoperability regardless of sign-in route.
* **Unconditional Listener Attachment**: Real-time snapshot listeners attach immediately upon user session resolution, ensuring live sync is active 100% of the time.

---

## 12. Create Flow
```
UI Form Input (Web / Mobile)
     │
     ▼
Client-Side Validation (Amount > 0, Valid Category, Non-empty Description)
     │
     ▼
Generate Unique Deterministic ID
     │
     ▼
Commit to Firestore Collection (transactions, budgets, departments, payroll)
     │
     ▼
Firestore Acknowledges Write
     │
     ▼
Optimistic Local State Confirmed -> Live Snapshot Broadcasts to Counterpart Platform
```

---

## 13. Update Flow
```
User Edits Existing Item
     │
     ▼
Validation of Modified Fields
     │
     ▼
Firestore updateDoc() / setDoc(..., { merge: true })
     │
     ▼
Remote Firestore Document Updated
     │
     ▼
Delta Snapshot Dispatched to All Connected Clients
     │
     ▼
Web & Mobile Views Refresh In-Place
```

---

## 14. Delete Flow ("Deleted Data Never Returns")
```
User Confirms Deletion
     │
     ▼
Execute Remote Firestore deleteDoc() on Target Document + Linked Records
     │
     ▼
Wait for Firestore Confirmation (Guaranteed Remote Deletion)
     │
     ▼
Add Document ID to Persistent Local Tombstones:
(ofm_deleted_tx_ids, ofm_deleted_budget_ids, etc. in AsyncStorage & localStorage)
     │
     ▼
Filter Out from Local State Memory
     │
     ▼
Counterpart Platform Receives Snapshot with Removed Document
     │
     ▼
ON REFRESH / LOGOUT / LOGIN / RESTART:
Tombstone Filter Guarantees Deleted Item Is Never Resurrected
```

---

## 15. Login/Logout Data Flow
* **Login Flow**:
  1. User enters credentials or executes Google Sign-In.
  2. Firebase Auth authenticates and returns user credential.
  3. `AuthContext` queries `users/{uid}` and determines canonical `organizationId`.
  4. User object is saved to `AsyncStorage` / `localStorage` (`ofm_user`).
  5. `FinanceContext` mounts real-time listeners for the active organization.
  6. Clean, authoritative records are loaded from Firestore.
* **Logout Flow**:
  1. `logout()` is triggered from UI.
  2. Firebase Auth signs out via `signOut(auth)`.
  3. Session token and user data are purged from `AsyncStorage` and `localStorage` (`ofm_user`).
  4. Real-time listeners unsubscribe cleanly.
  5. In-memory finance arrays are reset.
  6. Client redirects to `/login`. Central database records remain completely untouched.

---

## 16. Cache and State Strategy
* **In-Memory Reactive State**: Managed via React Context API (`AuthContext`, `FinanceContext`, `ThemeContext`).
* **Persistent Local Cache**: Uses `@react-native-async-storage/async-storage` on Native and `localStorage` on Web.
* **Tombstone Cache**: Explicit deleted IDs are retained locally to guard against transient offline sync re-population.
* **Cache Purging**: On organization change or explicit logout, volatile cache is purged to prevent cross-tenant data leakage.

---

## 17. Organization Data Isolation
Data isolation is strictly enforced at two distinct boundaries:
1. **Application Query Boundary**: All Firestore queries require `where("organizationId", "==", user.organizationId)`.
2. **Security Rules Boundary (`firestore.rules`)**:
   ```javascript
   match /transactions/{txId} {
     allow read, write: if request.auth != null &&
       (resource == null || resource.data.organizationId == request.auth.token.organizationId);
   }
   ```
3. **Clean New Organization State**: Newly created organizations start with $0$ transactions, $0$ budgets, and $0$ departments. No sample or demo data is ever injected into real user organizations.

---

## 18. Production Architecture
* **Web Hosting**: Firebase Hosting (`https://ofmapp-main.web.app`) backed by Google Global CDN with automatic SSL certificates and cache optimization.
* **Mobile Distribution**: EAS (Expo Application Services) build pipeline targeting Android standalone APK (`buildType: "apk"`) with production environment variables bundled securely.
* **Monitoring & Integrity**: Continuous verification through an automated 10-suite master regression test suite executing determinism, calculation parity, tenant isolation, and binary export verifications.
