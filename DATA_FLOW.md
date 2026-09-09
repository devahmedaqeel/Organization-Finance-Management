# OFM — Data Flow Specifications

This document outlines the **real, verified data flows** of the Organization Finance Management (OFM) platform across its Web and Mobile applications, central Firebase backend, and local storage layers.

---

## 1. High-Level Data Architecture

The central Google Cloud Firestore database acts as the single authoritative source of truth (SSOT). Both Web and Mobile applications interact directly with Firestore using the Firebase Client SDK with real-time WebSocket listeners (`onSnapshot`).

```
┌────────────────────────────────────────────────────────┐
│                   WEB APPLICATION                      │
│            (React Native Web / WebShell)               │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                 FIREBASE CLIENT SDK / API              │
│       (setDoc, updateDoc, deleteDoc, onSnapshot)       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             CENTRAL CLOUD FIRESTORE DATABASE           │
│             (Single Authoritative SSOT)                │
└───────────────────────────▲────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                 FIREBASE CLIENT SDK / API              │
│       (setDoc, updateDoc, deleteDoc, onSnapshot)       │
└───────────────────────────▲────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│                  MOBILE APPLICATION                    │
│            (React Native / Expo SDK 54)                │
└────────────────────────────────────────────────────────┘
```

---

## 2. Core Operational Data Flows

### 2.1 Create Flow

When a user creates a new record (transaction, budget, department, or payroll entry):

```
User enters data into Modal/Form (Web or Mobile)
                      │
                      ▼
Client-side field validation in UI & FinanceContext
(Amount > 0, required fields, date formatting)
                      │
                      ▼
Generate unique record ID & assign organizationId
                      │
                      ▼
Write to Firestore via Firebase SDK: setDoc() / addDoc()
                      │
                      ▼
Central Cloud Firestore receives and commits document
                      │
                      ▼
Firestore triggers real-time WebSocket event (onSnapshot)
                      │
                      ▼
FinanceContext receives updated document list
                      │
                      ▼
FinancialCalculationEngine recalculates all KPIs
(Net Operating Balance, Cash Flow, Burn Rate, Runway)
                      │
                      ▼
UI updates automatically across Web and Mobile in real time
```

---

### 2.2 Read Flow

When a user opens the application or navigates to a screen:

```
User accesses Screen or Dashboard (Web or Mobile)
                      │
                      ▼
AuthContext provides active authenticated user & organizationId
                      │
                      ▼
FinanceContext initializes query scoped by organizationId:
query(collection(db, "transactions"), where("organizationId", "==", orgId))
                      │
                      ▼
Firebase Client SDK establishes persistent onSnapshot listener
                      │
                      ▼
Firestore streams authoritative document set from cloud
                      │
                      ▼
FinanceContext filters out any records present in local Tombstones
                      │
                      ▼
In-memory state (transactions, budgets, departments, payroll) updated
                      │
                      ▼
FinancialCalculationEngine computes aggregated totals & KPIs
                      │
                      ▼
UI renders populated tables, charts, and metric cards
```

---

### 2.3 Update Flow

When a user edits an existing record:

```
User submits changes via Edit Modal (Web or Mobile)
                      │
                      ▼
Client-side validation of updated fields
                      │
                      ▼
Call updateDoc() or setDoc(..., { merge: true }) via Firebase SDK
                      │
                      ▼
Firestore updates document and increments server timestamp
                      │
                      ▼
Firestore dispatches snapshot delta to all subscribed clients
                      │
                      ▼
FinanceContext receives modified document
                      │
                      ▼
In-memory state array updated with new document values
                      │
                      ▼
FinancialCalculationEngine updates dependent financial metrics
                      │
                      ▼
Web and Mobile interfaces refresh in-place with zero reload
```

---

### 2.4 Delete Flow ("Deleted Data Never Returns")

To guarantee that deleted records are permanently removed and never re-appear after refresh, login, or app restart:

```
User confirms deletion in ConfirmDeleteModal
                      │
                      ▼
Call deleteDoc(doc(db, collectionName, id)) via Firebase SDK
                      │
                      ▼
Central Cloud Firestore confirms remote document deletion
                      │
                      ▼
Record ID is immediately registered in persistent local Tombstones:
(AsyncStorage on Mobile, localStorage on Web)
Keys: ofm_deleted_tx_ids, ofm_deleted_budget_ids, etc.
                      │
                      ▼
Target item filtered out from in-memory state arrays
                      │
                      ▼
Firestore onSnapshot broadcasts document removal to counterpart platform
                      │
                      ▼
Counterpart platform removes record and recomputes balance
                      │
                      ▼
[ON APP RESTART / REFRESH / RE-LOGIN]
Local Tombstone filter cross-references incoming Firestore queries,
guaranteeing deleted records NEVER resurface.
```

---

## 3. Web ↔ Mobile Cross-Platform Synchronization

Because both platforms connect to the same central Firestore collections with real-time `onSnapshot` subscriptions:

1. **Web to Mobile Inflow/Expense**:
   - An accountant enters an expense invoice on the Web dashboard.
   - Within milliseconds, the Firestore listener on the Mobile device triggers.
   - The Mobile app re-calculates department burn rate and Net Operating Balance without requiring manual pull-to-refresh.

2. **Mobile to Web Expense Claims**:
   - A manager approves a department expense on the Mobile app.
   - The Web application immediately receives the snapshot update.
   - The high-density tabular ledger and donut charts update live in the browser.

3. **Payroll & Budget Synchronization**:
   - Payroll runs processed on Web automatically create corresponding expense entries that factor directly into departmental budget utilization on Mobile.

---

## 4. Multi-Tenant Organization Scoping

1. **Tenant Isolation**: Every database operation is strictly scoped by `organizationId`.
2. **Query Filtering**: All live listeners attach explicit constraints: `where("organizationId", "==", activeOrgId)`.
3. **Clean Initialization**: When a new organization is registered, it begins with an entirely clean ledger ($0$ transactions, $0$ budgets, $0$ departments).
4. **Session Teardown**: Upon logout, local in-memory states and listener subscriptions are cleanly destroyed, preventing cross-tenant data contamination.
