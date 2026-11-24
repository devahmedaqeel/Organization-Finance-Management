# OFM — System Diagrams

All diagrams are written in **Mermaid**, which GitHub renders automatically. To export them as images for a report, paste any block into https://mermaid.live and download PNG/SVG.

Contents

1. [System architecture](#1-system-architecture)
2. [Component (layer) diagram](#2-component-layer-diagram)
3. [Use case diagram](#3-use-case-diagram)
4. [Entity relationship diagram (ERD)](#4-entity-relationship-diagram-erd)
5. [Class diagram](#5-class-diagram)
6. [Data flow diagram — Level 0 (context)](#6-data-flow-diagram--level-0-context)
7. [Data flow diagram — Level 1](#7-data-flow-diagram--level-1)
8. [Sequence — Sign in](#8-sequence--sign-in)
9. [Sequence — Sign up and join an organization](#9-sequence--sign-up-and-join-an-organization)
10. [Sequence — Add a transaction and real-time sync (web ↔ mobile)](#10-sequence--add-a-transaction-and-real-time-sync-web--mobile)
11. [Sequence — Offline change and outbox sync](#11-sequence--offline-change-and-outbox-sync)
12. [Sequence — Run payroll](#12-sequence--run-payroll)
13. [Sequence — Export a report (PDF / CSV)](#13-sequence--export-a-report-pdf--csv)
14. [Sequence — Invite a team member](#14-sequence--invite-a-team-member)
15. [Activity — Payroll run](#15-activity--payroll-run)
16. [Activity — Budget check when an expense is recorded](#16-activity--budget-check-when-an-expense-is-recorded)
17. [State — Payroll entry](#17-state--payroll-entry)
18. [State — Invitation](#18-state--invitation)
19. [Deployment diagram](#19-deployment-diagram)
20. [Navigation map (web and mobile)](#20-navigation-map-web-and-mobile)
21. [Role-based access flow](#21-role-based-access-flow)

---

## 1. System architecture

```mermaid
flowchart TB
  subgraph Users
    U1([Admin])
    U2([Accountant])
    U3([Manager])
    U4([Employee])
  end

  subgraph ClientApps["Client applications (one codebase)"]
    WEB["Web app<br/>React Native Web · Expo Router<br/>components/web/*"]
    MOB["Mobile app (Android / iOS)<br/>React Native · Expo SDK 58<br/>app/*"]
  end

  subgraph AppCore["Shared application core"]
    AC[AuthContext]
    FC[FinanceContext]
    SC[SettingsContext]
    ENG[FinancialCalculationEngine]
    PAY[Payroll engine & workflow]
    REP[Report export / PDF / CSV]
    INS[Insights & health score]
    NOT[Notification service]
    OFF[Offline sync service<br/>local cache · outbox · tombstones]
  end

  subgraph Firebase["Google Firebase (project: ofmapp-main)"]
    AUTH[(Authentication)]
    DB[(Cloud Firestore)]
    FN[Cloud Functions<br/>PDF · password reset]
    HOST[Hosting<br/>ofmapp-main.web.app]
  end

  U1 & U2 & U3 & U4 --> WEB
  U1 & U2 & U3 & U4 --> MOB
  WEB --> AC & FC & SC
  MOB --> AC & FC & SC
  FC --> ENG & PAY & INS & NOT & OFF
  WEB --> REP
  MOB --> REP
  AC <--> AUTH
  FC <-->|onSnapshot real-time| DB
  SC <-->|onSnapshot| DB
  NOT <--> DB
  OFF -->|flush outbox| DB
  REP --> FN
  AC --> FN
  HOST -. serves .-> WEB
```

---

## 2. Component (layer) diagram

```mermaid
flowchart TB
  subgraph Presentation["Presentation layer"]
    direction LR
    R1["app/ (Expo Router screens)<br/>(tabs)/index · income · expenses · reports · more<br/>budget · departments · payroll · team · settings · ai-insights · login"]
    R2["components/web/<br/>WebShell · WebDashboard · WebIncome · WebExpenses · WebTransactions<br/>WebBudgets · WebDepartments · WebPayroll · WebTeam · WebReports<br/>WebAIInsights · WebSettings · WebAuth · modals/*"]
    R3["components/ (shared)<br/>charts · modals · analytics suite · payslip editor"]
  end
  subgraph State["State layer (React Context)"]
    direction LR
    S1[AuthContext<br/>user · role · organization]
    S2[FinanceContext<br/>transactions · budgets · payroll · departments · notifications]
    S3[SettingsContext<br/>company profile · currency · fiscal year · theme]
    S4[FiscalScopeProvider web<br/>filters data to chosen fiscal year]
  end
  subgraph Domain["Domain / service layer (services/)"]
    direction LR
    D1[FinancialCalculationEngine]
    D2[PayrollCalculationEngine<br/>PayrollWorkflowService]
    D3[ReportExportService<br/>pdfDownloadService · reportDataService]
    D4[financialInsightsService<br/>financialHealthService]
    D5[notificationService<br/>notificationRules]
    D6[offlineSyncService<br/>networkService]
    D7[permissionService]
    D8[DatePeriodService · fiscalYear]
  end
  subgraph Data["Data layer"]
    direction LR
    X1[(Firestore)]
    X2[(AsyncStorage / localStorage)]
    X3[(Firebase Auth)]
  end
  Presentation --> State
  Presentation --> Domain
  State --> Domain
  State --> X1
  State --> X3
  D6 --> X2
  D6 --> X1
```

---

## 3. Use case diagram

```mermaid
flowchart LR
  Admin([Admin])
  Acc([Accountant])
  Mgr([Manager])
  Emp([Employee])

  subgraph OFM["OFM system"]
    UC1((Sign up / Sign in))
    UC2((Reset password))
    UC3((Manage organization settings))
    UC4((Invite members & change roles))
    UC5((Record income))
    UC6((Record expense))
    UC7((View transactions ledger))
    UC8((Manage budgets))
    UC9((Manage departments))
    UC10((Run payroll))
    UC11((Approve payroll))
    UC12((Manage payslip templates))
    UC13((View / download own payslip))
    UC14((View dashboard))
    UC15((View & export reports))
    UC16((View AI insights))
    UC17((Receive notifications))
    UC18((Choose fiscal year))
  end

  Admin --- UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8 & UC9 & UC10 & UC11 & UC12 & UC13 & UC14 & UC15 & UC16 & UC17 & UC18
  Acc --- UC1 & UC2 & UC5 & UC6 & UC7 & UC8 & UC10 & UC12 & UC13 & UC14 & UC15 & UC16 & UC17 & UC18
  Mgr --- UC1 & UC2 & UC7 & UC11 & UC13 & UC14 & UC15 & UC16 & UC17 & UC18
  Emp --- UC1 & UC2 & UC13 & UC17
```

---

## 4. Entity relationship diagram (ERD)

All business records carry `organizationId`; that is how data is separated per organization.

```mermaid
erDiagram
  ORGANIZATION ||--o{ USER : "has members"
  ORGANIZATION ||--|| ORG_SETTINGS : "configured by"
  ORGANIZATION ||--o{ DEPARTMENT : has
  ORGANIZATION ||--o{ TRANSACTION : records
  ORGANIZATION ||--o{ BUDGET : plans
  ORGANIZATION ||--o{ PAYROLL : pays
  ORGANIZATION ||--o{ INVITATION : sends
  ORGANIZATION ||--o{ NOTIFICATION : publishes
  ORGANIZATION ||--o{ PAYSLIP_TEMPLATE : designs
  ORGANIZATION ||--o{ SALARY_COMPONENT : defines
  ORGANIZATION ||--o{ PAYROLL_PERIOD : runs
  DEPARTMENT ||--o{ TRANSACTION : "tagged on (by name)"
  DEPARTMENT ||--o{ BUDGET : "budget lines (by name)"
  DEPARTMENT ||--o{ PAYROLL : "staff (by name)"
  PAYROLL ||--o| TRANSACTION : "creates expense (payrollId)"
  BUDGET ||--o{ TRANSACTION : "optional budgetId"
  USER ||--o{ TRANSACTION : "addedBy"
  EMPLOYEE_LOAN ||--o{ LOAN_REPAYMENT : has
  USER ||--o{ EMPLOYEE_LOAN : borrows

  ORGANIZATION {
    string id PK
    string name
  }
  USER {
    string id PK
    string name
    string email
    string role "admin / accountant / manager / employee"
    string organization
    string organizationId FK
    string department
  }
  ORG_SETTINGS {
    string id PK "organizationId"
    string organizationName
    string organizationAddress
    string organizationEmail
    string organizationPhone
    string currency
    string fiscalYear
    int fiscalYearStartMonth
    string organizationLogo
    string theme
  }
  DEPARTMENT {
    string id PK
    string name
    int headCount
    number budgetAllocated
    string headOfDepartment
    string contactEmail
    string organizationId FK
  }
  TRANSACTION {
    string id PK
    string type "income / expense"
    string category
    number amount
    string date
    string department
    string description
    string addedBy
    string paymentMethod
    string referenceNumber
    string status
    string budgetId FK
    string expenseSource "manual / payroll / reimbursement / invoice"
    string payrollId FK
    string organizationId FK
  }
  BUDGET {
    string id PK
    string department
    string category
    number allocated
    string period
    string fiscalYear
    number alertThreshold
    string organizationId FK
  }
  PAYROLL {
    string id PK
    string employeeName
    string employeeId
    string department
    number baseSalary
    number bonus
    number deductions
    number netSalary
    string month
    string payrollStatus
    string paymentStatus
    string expenseId FK
    string organizationId FK
  }
  INVITATION {
    string email PK
    string name
    string role
    string organizationId FK
    string invitedBy
    string status "pending / accepted"
  }
  NOTIFICATION {
    string id PK
    string title
    string message
    string type
    bool read
    string organizationId FK
  }
  PAYSLIP_TEMPLATE {
    string id PK
    string name
    string organizationId FK
  }
  SALARY_COMPONENT {
    string id PK
    string name
    string type
    string organizationId FK
  }
  PAYROLL_PERIOD {
    string id PK
    string month
    string status
    string organizationId FK
  }
  EMPLOYEE_LOAN {
    string id PK
    string employeeId
    number amount
    string organizationId FK
  }
  LOAN_REPAYMENT {
    string id PK
    string loanId FK
    number amount
  }
```

---

## 5. Class diagram

```mermaid
classDiagram
  class User {
    +string id
    +string name
    +string email
    +UserRole role
    +string organization
    +string organizationId
  }
  class AuthContext {
    +User user
    +login(email, password, role)
    +loginWithGoogle(role)
    +signUp(name, email, password, role, orgOrInvite)
    +forgotPassword(email)
    +logout()
    +hasPermission(p)
  }
  class FinanceContext {
    +Transaction[] transactions
    +Budget[] budgets
    +PayrollEntry[] payroll
    +Department[] departments
    +AppNotification[] notifications
    +SyncStatus syncStatus
    +addTransaction(t)
    +updateTransaction(id, t)
    +deleteTransaction(id)
    +addBudget(b)
    +addPayroll(p)
    +addDepartment(d)
    +refreshData()
  }
  class SettingsContext {
    +Settings settings
    +updateSettings(partial)
  }
  class Transaction {
    +string id
    +string type
    +string category
    +number amount
    +string date
    +string department
    +string expenseSource
    +string payrollId
  }
  class Budget {
    +string id
    +string department
    +number allocated
    +string period
  }
  class PayrollEntry {
    +string id
    +string employeeName
    +number baseSalary
    +number bonus
    +number deductions
    +number netSalary
    +string month
    +string payrollStatus
  }
  class Department {
    +string id
    +string name
    +number headCount
    +number budgetAllocated
  }
  class FinancialCalculationEngine {
    +calculateTotalIncome(txs)
    +calculateTotalExpenses(txs)
    +calculateBudgetAllocation(budgets, depts)
    +calculateBudgetUsed(txs, budgets, dept, depts)
    +calculateDepartmentMetrics()
  }
  class PayrollWorkflowService {
    +getPayrollPeriods(orgId)
    +savePayrollPeriod()
    +calculateBatchPayroll()
    +createPayrollReversal()
  }
  class ReportExportService {
    +generateFinancialHtmlReport(data)
    +buildFinancialPdfBinary(data)
    +downloadPdfReport(data)
    +downloadCsvReport(data)
  }
  class offlineSyncService {
    +loadLocalEntities()
    +saveLocalEntities()
    +enqueueOperation()
    +flushOutbox(orgId)
    +recordTombstones()
  }
  class notificationService {
    +registerForPushNotificationsAsync()
    +dispatchNotification()
    +syncLedgerNotificationEvents()
    +subscribeToNotifications()
  }
  class permissionService {
    +can(userOrRole, permission) bool
  }

  AuthContext --> User
  FinanceContext --> Transaction
  FinanceContext --> Budget
  FinanceContext --> PayrollEntry
  FinanceContext --> Department
  FinanceContext ..> FinancialCalculationEngine : uses
  FinanceContext ..> offlineSyncService : uses
  FinanceContext ..> notificationService : uses
  PayrollEntry ..> Transaction : creates expense
  ReportExportService ..> FinancialCalculationEngine
  PayrollWorkflowService ..> PayrollEntry
  permissionService ..> User
```

---

## 6. Data flow diagram — Level 0 (context)

```mermaid
flowchart LR
  A[Admin] -- settings, members, all records --> P((0<br/>OFM System))
  B[Accountant] -- income, expenses, budgets, payroll --> P
  C[Manager] -- approvals, report requests --> P
  D[Employee] -- payslip requests --> P
  P -- dashboards, reports, insights --> A & B & C
  P -- payslips, notifications --> D
  P <-- auth, records --> F[(Firebase<br/>Auth + Firestore)]
  P -- invitation e-mail --> M[E-mail client]
  P -- push notifications --> N[Device push service]
```

---

## 7. Data flow diagram — Level 1

```mermaid
flowchart TB
  U[Users] -->|credentials| P1((1.0<br/>Authenticate))
  P1 <--> D1[(D1 Users)]
  P1 -->|session + role| P2((2.0<br/>Record transactions))
  U -->|income / expense| P2
  P2 <--> D2[(D2 Transactions)]
  U -->|budget lines| P3((3.0<br/>Manage budgets & departments))
  P3 <--> D3[(D3 Budgets)]
  P3 <--> D4[(D4 Departments)]
  U -->|salary data| P4((4.0<br/>Process payroll))
  P4 <--> D5[(D5 Payroll)]
  P4 -->|payroll expense| D2
  D2 & D3 & D4 & D5 --> P5((5.0<br/>Calculate KPIs & insights))
  P5 -->|dashboard, health score, alerts| U
  P5 --> P6((6.0<br/>Notify))
  P6 <--> D6[(D6 Notifications)]
  P6 -->|alerts| U
  D2 & D3 & D4 & D5 --> P7((7.0<br/>Generate reports))
  U -->|period, sections, format| P7
  P7 -->|PDF / CSV file| U
  U -->|invite| P8((8.0<br/>Manage team))
  P8 <--> D7[(D7 Invitations)]
  P8 <--> D1
```

---

## 8. Sequence — Sign in

```mermaid
sequenceDiagram
  actor U as User
  participant UI as Sign-in screen
  participant AC as AuthContext
  participant FA as Firebase Auth
  participant FS as Firestore (users)
  participant R as Router
  U->>UI: Email + password, tap Sign in
  UI->>UI: Validate fields
  UI->>AC: login(email, password)
  AC->>FA: signInWithEmailAndPassword
  FA-->>AC: Firebase user
  AC->>FS: Read user profile (role, organizationId)
  FS-->>AC: Profile
  AC->>AC: Persist session (AsyncStorage / localStorage)
  AC-->>UI: success
  UI->>R: Go to dashboard (role home)
  Note over R: Employees land on "My payslips"
```

---

## 9. Sequence — Sign up and join an organization

```mermaid
sequenceDiagram
  actor U as New user
  participant UI as Create account
  participant AC as AuthContext
  participant FA as Firebase Auth
  participant FS as Firestore
  U->>UI: Choose role, name, email, password, org name or invite code
  UI->>UI: Validate (email, 6+ chars, passwords match)
  UI->>AC: signUp(name, email, password, role, orgOrInvite)
  AC->>FA: createUserWithEmailAndPassword
  alt Role = Admin
    AC->>FS: Create organization + users/{id} (admin)
  else Joining an existing organization
    AC->>FS: Read invitations/{email}
    alt Invitation found
      Note over AC: Role ALWAYS comes from the admin's invitation
      AC->>FS: Create users/{id} with invited role + organizationId
    else No invitation, valid admin e-mail as invite code
      AC->>FS: Find admin user by e-mail
      AC->>FS: Create users/{id} as Employee (admin can promote later)
    else Neither
      AC-->>UI: Error "Ask your admin to invite you"
    end
  end
  AC-->>UI: success → dashboard
```

---

## 10. Sequence — Add a transaction and real-time sync (web ↔ mobile)

```mermaid
sequenceDiagram
  actor A as Accountant (web)
  participant W as Web app
  participant FC as FinanceContext (web)
  participant FS as Firestore
  participant FM as FinanceContext (mobile)
  participant M as Mobile app
  A->>W: Fill "Record income" and save
  W->>FC: addTransaction(t)
  FC->>FC: Optimistic update (shows instantly)
  FC->>FS: setDoc transactions/{id} (organizationId)
  FS-->>FC: onSnapshot (confirmed)
  FS-->>FM: onSnapshot (same organization)
  FM->>FM: Reconcile + recalc totals
  FM-->>M: Dashboard, reports, budgets update
  Note over FS,M: The same path works in reverse (mobile → web)
```

---

## 11. Sequence — Offline change and outbox sync

```mermaid
sequenceDiagram
  actor U as User (mobile, offline)
  participant FC as FinanceContext
  participant OS as offlineSyncService
  participant LS as Local storage
  participant NS as networkService
  participant FS as Firestore
  U->>FC: Add / edit / delete record
  FC->>LS: Save to local cache (shows immediately)
  FC->>OS: enqueueOperation(op)
  OS->>LS: Store in outbox (idempotent id)
  Note over FC: syncStatus = offline_pending
  NS-->>OS: Back online
  OS->>FS: flushOutbox (retry with backoff)
  FS-->>OS: OK
  OS->>LS: Remove sent ops, record tombstones for deletes
  FS-->>FC: onSnapshot → reconcile
  Note over FC: syncStatus = synced
```

---

## 12. Sequence — Run payroll

```mermaid
sequenceDiagram
  actor A as Admin / Accountant
  participant P as Payroll screen
  participant ENG as PayrollCalculationEngine
  participant FC as FinanceContext
  participant FS as Firestore
  participant N as notificationService
  A->>P: Add employee salary (base, bonus, deductions, month)
  P->>ENG: Calculate net salary, tax, components
  ENG-->>P: Net + breakdown
  A->>P: Save
  P->>FC: addPayroll(entry)
  FC->>FS: payroll/{id}
  FC->>FS: transactions/{id} (expense, expenseSource = payroll, payrollId)
  FC->>N: Ledger/payroll notification
  FS-->>FC: onSnapshot → dashboard "Staff payroll", expenses, budgets update
  A->>P: View payslip → choose template → PDF / PNG
```

---

## 13. Sequence — Export a report (PDF / CSV)

```mermaid
sequenceDiagram
  actor U as User
  participant M as Export modal
  participant RD as reportDataService
  participant RE as ReportExportService
  participant OS as Device (browser / Android / iOS)
  U->>M: Pick report type, period, sections, format
  M->>RD: Compile data for period and role
  RD-->>M: Report data (summary, ledger, departments, payroll)
  alt PDF
    M->>RE: downloadPdfReport(data)
    RE->>RE: Build multi-page vector PDF
    RE->>OS: Web: download · Android: save to chosen folder · iOS: save + share
  else CSV
    M->>RE: downloadCsvReport(data)
    RE->>OS: Web: download · Android: save to chosen folder · iOS: share sheet
  end
  OS-->>U: File ready (open / share)
```

---

## 14. Sequence — Invite a team member

```mermaid
sequenceDiagram
  actor A as Admin
  participant T as Team screen
  participant FS as Firestore
  participant E as E-mail app
  actor N as New member
  A->>T: Enter email, name, role
  T->>T: Validate email, block if already a member
  T->>FS: invitations/{email} (pending)
  T->>FS: users/u_{email} placeholder (role)
  T->>E: Open pre-filled invitation e-mail
  E-->>N: Invitation with web link + invite code
  N->>N: Create account with same email and invite code
  N->>FS: Joins the same organization with the invited role
```

---

## 15. Activity — Payroll run

```mermaid
flowchart TD
  S([Start]) --> A[Open Payroll]
  A --> B{Has permission<br/>manage_payroll?}
  B -- No --> X[Show own payslips only] --> E([End])
  B -- Yes --> C[Enter / select employee and month]
  C --> D[Enter base, bonus, deductions, components, loans]
  D --> F[Engine calculates net salary]
  F --> G{Values valid?}
  G -- No --> D
  G -- Yes --> H[Save payroll entry]
  H --> I[Create payroll expense in ledger]
  I --> J[Update budgets and dashboard]
  J --> K{Needs approval?}
  K -- Yes --> L[Manager / Admin approves]
  K -- No --> M[Finalize / mark paid]
  L --> M
  M --> N[Generate payslip PDF / PNG]
  N --> E
```

---

## 16. Activity — Budget check when an expense is recorded

```mermaid
flowchart TD
  S([Expense saved]) --> A[Find department budget lines]
  A --> B{Budget exists?}
  B -- No --> Z([Done])
  B -- Yes --> C[Spent = sum of department expenses]
  C --> D[Utilization = spent / allocated]
  D --> E{Utilization}
  E -- "< 80%" --> F[Status: On track]
  E -- "80–90%" --> G[Warning notification]
  E -- "90–100%" --> G2[Critical notification]
  E -- "> 100%" --> H[Over budget notification<br/>with amount and % over]
  F & G & G2 & H --> I[Dashboard, Budgets, Departments, AI insights refresh]
  I --> Z
```

---

## 17. State — Payroll entry

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> calculated: calculate
  calculated --> pending_approval: submit
  pending_approval --> approved: approve
  pending_approval --> draft: send back
  approved --> finalized: finalize
  finalized --> paid: mark paid
  paid --> [*]
  draft --> cancelled
  calculated --> cancelled
  finalized --> finalized: reversal / amendment entry
```

---

## 18. State — Invitation

```mermaid
stateDiagram-v2
  [*] --> pending: admin invites
  pending --> accepted: member signs up with invited email
  pending --> removed: admin removes
  accepted --> [*]
  removed --> [*]
```

---

## 19. Deployment diagram

```mermaid
flowchart LR
  subgraph Dev["Developer machine"]
    SRC[Source code<br/>GitHub repository]
    CLI[Expo CLI · EAS CLI · Firebase CLI]
  end
  subgraph Expo["Expo Application Services"]
    EAS[EAS Build<br/>Android APK / AAB]
  end
  subgraph Google["Google Firebase"]
    HOST[Hosting CDN<br/>ofmapp-main.web.app]
    AUTH[(Authentication)]
    FS[(Cloud Firestore)]
    FN[Cloud Functions]
  end
  subgraph Devices
    BR[Browser<br/>desktop / tablet / phone]
    AN[Android phone<br/>APK]
    IO[iPhone<br/>Expo Go]
  end
  SRC --> CLI
  CLI -- "expo export -p web + firebase deploy" --> HOST
  CLI -- "eas build -p android" --> EAS
  EAS -- APK download --> AN
  HOST --> BR
  BR & AN & IO <--> AUTH
  BR & AN & IO <--> FS
  BR & AN & IO --> FN
```

---

## 20. Navigation map (web and mobile)

```mermaid
flowchart LR
  L[Sign in / Sign up] --> H{Role}
  H -- Admin / Accountant / Manager --> D[Dashboard]
  H -- Employee --> PS[My payslips]

  subgraph Web["Web sidebar"]
    D --> I[Income]
    D --> X[Expenses]
    D --> T[Transactions]
    D --> B[Budgets]
    D --> DP[Departments]
    D --> P[Payroll]
    D --> TM[Team]
    D --> R[Reports]
    D --> AI[AI Insights]
    D --> S[Settings]
  end

  subgraph Mobile["Mobile bottom tabs + More"]
    MD[Dashboard] --- MI[Income]
    MD --- MX[Expenses]
    MD --- MR[Reports]
    MD --- MM[More]
    MM --> MT[Transactions]
    MM --> MB[Budgets]
    MM --> MDp[Departments]
    MM --> MP[Payroll]
    MM --> MTm[Team]
    MM --> MN[Net operating balance]
    MM --> MAI[AI Insights]
    MM --> MS[Settings]
  end
```

---

## 21. Role-based access flow

```mermaid
flowchart TD
  A[User opens a page] --> B[Read role from AuthContext]
  B --> C{"Page allowed for role?<br/>(NAV_ITEMS roleRestriction /<br/>permissionService.can)"}
  C -- Yes --> D[Render page]
  C -- No, default page --> E[Redirect to role home<br/>Dashboard or My payslips]
  C -- No, direct link --> F["Show 'You don't have access' panel<br/>with button to home"]
  D --> G{Action needs permission?<br/>e.g. delete_transaction}
  G -- Yes, allowed --> H[Show button / perform action]
  G -- Not allowed --> I[Hide button]
```
