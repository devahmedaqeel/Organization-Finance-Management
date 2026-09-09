# OFM — Project Structure & Folder Hierarchy

This document provides a comprehensive, verified overview of the actual directory layout and file responsibilities in the **Organization Finance Management (OFM)** project.

---

## High-Level Directory Overview

```
project-root/
├── app/                                 # Expo Router file-based navigation & screens
│   ├── (tabs)/                          # Tab-based bottom navigation (Mobile)
│   ├── auth/                            # OAuth & authentication routing handlers
│   ├── _layout.tsx                      # Root application layout shell & safe area provider
│   ├── index.tsx                        # Fast 0ms root redirect handler
│   ├── login.tsx                        # Native mobile authentication & demo switcher
│   ├── login.web.tsx                    # Web authentication screen
│   ├── budget.tsx                       # Department budget allocations
│   ├── departments.tsx                  # Department cost center management
│   ├── payroll.tsx                      # Staff payroll & payslips
│   ├── team.tsx                         # Personnel & RBAC management
│   ├── settings.tsx                     # Organization profile & branding
│   ├── ai-insights.tsx                  # Predictive fiscal health & insights
│   ├── onboarding.tsx                   # Initial organization setup wizard
│   ├── +html.tsx                        # Web HTML template (meta tags, fonts, styling)
│   └── +not-found.tsx                   # 404 Not Found fallback screen
│
├── assets/                              # Static media, icons, and fonts
│   ├── icon.png                         # Primary application icon
│   ├── adaptive-icon.png                # Android adaptive launcher icon
│   ├── splash.png                       # Application launch splash screen
│   ├── favicon.png                      # Web browser favicon
│   └── fonts/                           # Bundled typography
│
├── components/                          # Reusable UI component hierarchy
│   ├── analytics/                       # Analytics suite & visual health indicators
│   ├── web/                             # Desktop widescreen enterprise views
│   │   ├── modals/                      # Dedicated web modal dialogs
│   │   ├── navigation/                  # Web navigation & edge swipe indicators
│   │   ├── animations/                  # Web skeleton, count-up, and transition helpers
│   │   └── ...                          # Web shell, sidebar, header, and tabular views
│   └── ...                              # Shared native & cross-platform cards, charts, and modals
│
├── config/                              # Configuration & SDK initialization
│   └── firebase.ts                      # Firebase Auth, Firestore, and multi-persistence setup
│
├── constants/                           # Application constants & tokens
│   ├── brand.ts                         # Brand names & institutional metadata
│   ├── categories.ts                    # Inflow & outflow categories, icons, and colors
│   ├── colors.ts                        # Light and Dark theme color palettes
│   └── currencies.ts                    # 150+ international currency configurations
│
├── context/                             # React Context state management providers
│   ├── AuthContext.tsx                  # User authentication, RBAC roles, and session persistence
│   ├── FinanceContext.tsx               # Real-time Firestore sync, CRUD, and tombstones
│   └── SettingsContext.tsx              # Organization branding, currency, and theme settings
│
├── functions/                           # Firebase Cloud Functions (Backend)
│   ├── src/                             # Cloud Functions source code
│   │   ├── index.ts                     # Cloud Functions export entry point
│   │   └── pdfMonkeyService.ts          # Server-side PDF generation service
│   ├── package.json                     # Cloud Functions dependencies
│   └── tsconfig.json                    # Cloud Functions TypeScript config
│
├── hooks/                               # Custom React hooks
│   ├── useResponsive.ts                 # Viewport breakpoint detection (Mobile/Tablet/Desktop)
│   ├── useKeyboardHeight.ts             # Keyboard offset management
│   ├── useColors.ts                     # Theme color resolution
│   └── NotificationHelper.ts            # Local notification triggers
│
├── services/                            # Core business logic & authoritative engines
│   ├── FinancialCalculationEngine.ts    # Single authoritative financial calculation engine
│   ├── DatePeriodService.ts             # Fiscal period filtering & date range calculations
│   ├── ReportExportService.ts           # PDF dossier generator & compiler
│   ├── payslipExportService.ts          # Native PDF and high-resolution PNG payslip exporter
│   ├── payslipPdfService.ts             # HTML-to-PDF payslip compiler
│   ├── payslipTemplate.ts               # Institutional payslip markup template
│   ├── financialInsightsService.ts      # Predictive financial insights & anomaly detection
│   ├── financialHealthService.ts        # Financial health scoring algorithm
│   ├── auditService.ts                  # System activity audit logger
│   ├── permissionService.ts             # Role-based access control (RBAC) permission check helper
│   ├── notificationService.ts           # In-app notifications manager
│   ├── notificationRules.ts             # Automated notification triggers
│   ├── craftMyPdfService.ts             # External CraftMyPDF API integration
│   ├── pdfMonkeyService.ts              # External PDFMonkey API integration
│   ├── pdfService.ts                    # Native print PDF generator wrapper
│   ├── pdfDownloadService.ts            # Cross-platform PDF download and sharing dispatcher
│   ├── mobileWebPdfRedirectService.ts   # Mobile-to-web PDF redirect handler
│   ├── firestoreRestService.ts          # REST fallback for Firestore queries
│   ├── settingsHelper.ts                # Organization settings helper
│   └── __tests__/                       # Automated test suites (10 comprehensive suites)
│
├── stubs/                               # Web compatibility stubs
│   └── react-native-keyboard-controller.web.js # Prevents web bundler crashes
│
├── utils/                               # Shared formatting and helper functions
│   ├── finance.ts                       # Currency and number formatting
│   ├── dateRanges.ts                    # Date calculations and ISO conversions
│   └── toast.ts                         # Cross-platform toast notifications
│
├── app.json                             # Expo project configuration
├── eas.json                             # EAS Build configuration (Android APK & AAB)
├── firebase.json                        # Firebase Hosting & Cloud Functions config
├── firestore.indexes.json               # Firestore composite index definitions
├── firestore.rules                      # Firestore security rules (tenant isolation)
├── metro.config.js                      # Metro bundler config with web stubs
├── babel.config.js                      # Babel configuration
├── tsconfig.json                        # TypeScript project configuration
├── package.json                         # Project dependencies, scripts, and metadata
└── ensure_assets.js                     # Asset validation script executed before startup
```

---

## Detailed Directory Breakdown

### 1. `app/` — Routing and Screens
- **Purpose**: File-based routing powered by **Expo Router v4**.
- **Main Responsibility**: Maps file paths directly to mobile screens and web URLs.
- **Important Files**:
  - `index.tsx`: Ultra-fast 0ms root redirector that checks authentication state and directs users to `/(tabs)` or `/login`.
  - `_layout.tsx`: Root wrapper containing `AuthProvider`, `FinanceProvider`, and `SettingsProvider`, with safe-area insets.
  - `(tabs)/index.tsx`: Main financial executive dashboard.
  - `(tabs)/income.tsx`: Inflow/revenue ledger screen.
  - `(tabs)/expenses.tsx`: Outflow/operational expense ledger screen.
  - `(tabs)/reports.tsx`: Compliance and financial reporting screen.
  - `(tabs)/more.tsx`: Extended module switcher.
  - `login.tsx` & `login.web.tsx`: Platform-specific authentication screens with demo role switcher.
  - `auth/google.tsx` & `auth/google.web.tsx`: Google OAuth redirect and federation handlers.

### 2. `components/` — UI Component Hierarchy
- **Purpose**: Modular, reusable user interface components for both mobile and web.
- **Main Responsibility**: Presenting financial data, handling form inputs, rendering interactive charts, and managing modal dialogs.
- **Important Files & Subdirectories**:
  - `web/WebShell.tsx`: Desktop widescreen wrapper with persistent sidebar and top navigation.
  - `web/WebDashboard.tsx`: High-density desktop dashboard with KPI grids and charts.
  - `web/WebIncome.tsx` & `web/WebExpenses.tsx`: High-density tabular ledgers for desktop.
  - `web/WebReports.tsx`: Desktop statement generator and compliance export hub.
  - `analytics/FinancialAnalyticsSuite.tsx`: Advanced analytics suite with radial health gauges.
  - `FinancialStatementViewerModal.tsx`: Interactive statement viewer modal.
  - `NetBalanceBreakdownModal.tsx`: Granular breakdown of cash flow and operational balance.
  - `AddTransactionModal.tsx`: Comprehensive transaction creation and edit modal.
  - `DownloadReportModal.tsx`: PDF and CSV export modal with date range presets.

### 3. `context/` — State Management Providers
- **Purpose**: Centralized application state management via React Context.
- **Main Responsibility**: Maintains active user identity, organization context, real-time Firestore listeners, and cache persistence.
- **Important Files**:
  - `AuthContext.tsx`: Manages authentication state, user roles (`admin`, `accountant`, `manager`, `employee`), organization scoping, and token persistence across sessions.
  - `FinanceContext.tsx`: Manages live Firestore subscriptions (`onSnapshot`), ledger CRUD operations, persistent local tombstones, and optimistic updates.
  - `SettingsContext.tsx`: Manages active currency (150+ options), theme (dark/light), and organization metadata.

### 4. `services/` — Business Logic and Processing
- **Purpose**: Authoritative domain logic, mathematical calculation, and external API services.
- **Main Responsibility**: Ensures calculations are identical across Web and Mobile, generates PDFs, manages notifications, and runs automated tests.
- **Important Files**:
  - `FinancialCalculationEngine.ts`: Central financial mathematical engine. Computes total income, total expenses, net operating balance, burn rates, runway, budget ceilings, and department spending.
  - `DatePeriodService.ts`: Period range calculations and date filters.
  - `ReportExportService.ts`: Generates printable, multi-page financial dossiers in PDF format.
  - `payslipExportService.ts`: Generates payslips in PDF and PNG formats for employee remuneration.
  - `permissionService.ts`: Role-based permission validation for menu items and mutations.
  - `__tests__/runAllTests.ts`: Automated test suite runner containing 10 comprehensive suites.

### 5. `config/` — Environment & SDK Configuration
- **Purpose**: Centralized configuration and SDK initialization.
- **Main Responsibility**: Configures Firebase Auth, Firestore, and platform-specific persistence layers.
- **Important Files**:
  - `firebase.ts`: Initializes the Firebase app, exports `auth` and `db`, and sets up `indexedDBLocalPersistence` / `browserLocalPersistence` for Web and `AsyncStorage` for Mobile.

### 6. `constants/` — Static Constants
- **Purpose**: Shared application constants, themes, and design tokens.
- **Main Responsibility**: Enforces consistent styling, category categorization, and currency rules.
- **Important Files**:
  - `categories.ts`: Inflow and outflow category metadata, icons, and color assignments.
  - `colors.ts`: Institutional color palette tokens for dark and light modes.
  - `currencies.ts`: Comprehensive definitions for 150+ international currencies with symbols, formats, and decimal configurations.
  - `brand.ts`: Institutional branding identifiers.

### 7. `hooks/` — Custom React Hooks
- **Purpose**: Encapsulated reactive logic and device listeners.
- **Main Responsibility**: Responsive layout detection, keyboard avoidance, and theme resolution.
- **Important Files**:
  - `useResponsive.ts`: Viewport breakpoints (`isMobile`, `isTablet`, `isDesktop`, `isWidescreen`).
  - `useKeyboardHeight.ts`: Real-time keyboard height tracking for smooth scrolling inputs.
  - `useColors.ts`: Active theme color resolver.

### 8. `utils/` — Utility Functions
- **Purpose**: Pure helper functions.
- **Main Responsibility**: Number formatting, currency display, date conversion, and UI toast alerts.
- **Important Files**:
  - `finance.ts`: Currency formatting with thousand separators and currency symbol placement.
  - `dateRanges.ts`: Date math, relative time, and ISO string utilities.
  - `toast.ts`: Toast notifications across platforms.

### 9. `stubs/` — Bundler Stubs
- **Purpose**: Build compatibility shims.
- **Main Responsibility**: Aliases native-only packages during Web compilation to prevent bundler errors.
- **Important Files**:
  - `react-native-keyboard-controller.web.js`: Web stub for native keyboard controller.
