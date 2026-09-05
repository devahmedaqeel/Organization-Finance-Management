import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "./AuthContext";
import { useSettings } from "./SettingsContext";
import { showFloatingToast } from "@/utils/toast";
import { triggerLocalNotification } from "../hooks/NotificationHelper";

import {
  fetchCollectionREST,
  saveDocREST,
  deleteDocREST,
} from "@/services/firestoreRestService";

import {
  AppNotification,
  subscribeToNotifications,
  dispatchNotification,
  registerForPushNotificationsAsync,
  syncLedgerNotificationEvents,
} from "@/services/notificationService";
import {
  evaluateBudgetEvent,
  evaluateTransactionEvent,
} from "@/services/notificationRules";
import { recordAuditLog } from "@/services/auditService";
import { can } from "@/services/permissionService";
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetOperatingResult,
  calculateActualCash,
  calculateBudgetSpentForCategory,
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateBudgetRemaining,
} from "@/services/FinancialCalculationEngine";

export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  amount: number;
  date: string;
  department: string;
  title?: string;
  description: string;
  addedBy?: string;
  organizationId?: string;
  organization?: string;
  createdAt?: string;
  updatedAt?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  status?: "completed" | "pending" | "reconciled" | "failed";
}

export interface Budget {
  id: string;
  department: string;
  category: string;
  allocated: number;
  period: string;
  spent?: number;
  organizationId?: string;
  organization?: string;
  createdAt?: string;
  updatedAt?: string;
  fiscalYear?: string;
  alertThreshold?: number;
  notes?: string;
}

export interface PayrollEntry {
  id: string;
  employeeName: string;
  employeeId: string;
  department: string;
  baseSalary: number;
  bonus: number;
  deductions: number;
  netSalary?: number;
  month: string;
  organizationId?: string;
  organization?: string;
  createdAt?: string;
  updatedAt?: string;
  designation?: string;
  paymentStatus?: "paid" | "pending" | "processing";
  status?: "paid" | "pending" | "processing";
  bankAccountNumber?: string;
}

export interface Department {
  id: string;
  name: string;
  headCount: number;
  budgetAllocated: number;
  organizationId?: string;
  organization?: string;
  createdAt?: string;
  updatedAt?: string;
  headOfDepartment?: string;
  contactEmail?: string;
  code?: string;
}

export type SyncStatus = "synced" | "syncing" | "offline_pending" | "error";

interface FinanceContextValue {
  transactions: Transaction[];
  budgets: Budget[];
  payroll: PayrollEntry[];
  departments: Department[];
  notifications: AppNotification[];
  unreadNotificationCount: number;
  syncStatus: SyncStatus;
  loaded: boolean;
  isLoading: boolean;
  refreshData: () => Promise<void>;
  addTransaction: (t: Omit<Transaction, "id" | "addedBy"> & { addedBy?: string }) => Promise<void>;
  updateTransaction: (id: string, t: Partial<Omit<Transaction, "id">>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addBudget: (b: Omit<Budget, "id">) => Promise<void>;
  updateBudget: (id: string, b: Partial<Omit<Budget, "id">>) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  addPayroll: (p: Omit<PayrollEntry, "id">) => Promise<void>;
  updatePayroll: (id: string, p: Partial<Omit<PayrollEntry, "id">>) => Promise<void>;
  deletePayroll: (id: string) => Promise<void>;
  addDepartment: (d: Omit<Department, "id">) => Promise<void>;
  updateDepartment: (id: string, d: Partial<Omit<Department, "id">>) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  budgetUtilization: number;
  totalBudgeted: number;
  totalLineBudgeted: number;
  totalDeptBudgeted: number;
  totalBudgetSpent: number;
  totalBudgetRemaining: number;
}

function generateSafeId(collectionName: string = "transactions"): string {
  try {
    return doc(collection(db, collectionName)).id;
  } catch (e) {
    return "ofm_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
  }
}

const SEED_DEPARTMENTS: Department[] = [
  { id: "d1", name: "Software Engineering", headCount: 45, budgetAllocated: 850000 },
  { id: "d2", name: "Administration", headCount: 12, budgetAllocated: 250000 },
  { id: "d3", name: "Research & Development", headCount: 20, budgetAllocated: 650000 },
  { id: "d4", name: "Finance", headCount: 8, budgetAllocated: 180000 },
];

const SEED_TRANSACTIONS: Transaction[] = [
  { id: "t1", type: "income", category: "Government Grant", amount: 500000, date: "2026-05-01", department: "Administration", description: "Annual HEC funding", addedBy: "admin" },
  { id: "t2", type: "income", category: "Fee Collection", amount: 320000, date: "2026-05-03", department: "Finance", description: "Spring semester fees", addedBy: "accountant" },
  { id: "t3", type: "income", category: "Research Grant", amount: 150000, date: "2026-05-07", department: "Research & Development", description: "NRPU research grant", addedBy: "accountant" },
  { id: "t4", type: "income", category: "Fee Collection", amount: 280000, date: "2026-04-15", department: "Finance", description: "Fall semester fees", addedBy: "accountant" },
  { id: "t5", type: "income", category: "Donation", amount: 75000, date: "2026-04-20", department: "Administration", description: "Alumni donation", addedBy: "admin" },
  { id: "t6", type: "expense", category: "Salaries", amount: 420000, date: "2026-05-02", department: "Software Engineering", description: "May faculty salaries", addedBy: "accountant" },
  { id: "t7", type: "expense", category: "Utilities", amount: 35000, date: "2026-05-05", department: "Administration", description: "Electricity & water", addedBy: "accountant" },
  { id: "t8", type: "expense", category: "Equipment", amount: 120000, date: "2026-05-10", department: "Software Engineering", description: "New computers lab", addedBy: "admin" },
  { id: "t9", type: "expense", category: "Research", amount: 85000, date: "2026-05-12", department: "Research & Development", description: "Lab supplies & equipment", addedBy: "accountant" },
  { id: "t10", type: "expense", category: "Maintenance", amount: 28000, date: "2026-05-15", department: "Administration", description: "Building maintenance", addedBy: "accountant" },
  { id: "t11", type: "expense", category: "Salaries", amount: 390000, date: "2026-04-02", department: "Software Engineering", description: "April faculty salaries", addedBy: "accountant" },
  { id: "t12", type: "expense", category: "Travel", amount: 45000, date: "2026-04-18", department: "Research & Development", description: "Conference attendance", addedBy: "accountant" },
];

const SEED_BUDGETS: Budget[] = [
  { id: "b1", department: "Software Engineering", category: "Salaries", allocated: 500000, period: "2026-05" },
  { id: "b2", department: "Software Engineering", category: "Equipment", allocated: 150000, period: "2026-05" },
  { id: "b3", department: "Administration", category: "Utilities", allocated: 50000, period: "2026-05" },
  { id: "b4", department: "Research & Development", category: "Research", allocated: 120000, period: "2026-05" },
  { id: "b5", department: "Research & Development", category: "Travel", allocated: 60000, period: "2026-05" },
];

const SEED_PAYROLL: PayrollEntry[] = [
  { id: "p1", employeeName: "Dr. Sundas Iftikhar", employeeId: "EMP001", department: "Software Engineering", designation: "Head of Software Engineering", baseSalary: 120000, bonus: 15000, deductions: 12000, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456789" },
  { id: "p2", employeeName: "Prof. Ali Hassan", employeeId: "EMP002", department: "Software Engineering", designation: "Senior Full-Stack Architect", baseSalary: 95000, bonus: 10000, deductions: 9500, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456790" },
  { id: "p3", employeeName: "Ahmed Aqeel", employeeId: "EMP003", department: "Software Engineering", designation: "Software Engineer II", baseSalary: 65000, bonus: 5000, deductions: 6500, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456791" },
  { id: "p4", employeeName: "Maryam Naz", employeeId: "EMP004", department: "Finance", designation: "Senior Financial Controller", baseSalary: 85000, bonus: 8000, deductions: 8500, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456792" },
  { id: "p5", employeeName: "Dr. Tariq Mahmood", employeeId: "EMP005", department: "Administration", designation: "Director of Operations", baseSalary: 110000, bonus: 12000, deductions: 11000, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456793" },
  { id: "p6", employeeName: "Fatima Malik", employeeId: "EMP006", department: "Research & Development", designation: "Principal AI Research Scientist", baseSalary: 90000, bonus: 10000, deductions: 9000, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456794" },
  { id: "p7", employeeName: "Usman Ghani", employeeId: "EMP007", department: "Software Engineering", designation: "DevOps & Cloud Specialist", baseSalary: 75000, bonus: 6000, deductions: 7500, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456795" },
  { id: "p8", employeeName: "Ayesha Khan", employeeId: "EMP008", department: "Finance", designation: "Accounts & Payroll Auditor", baseSalary: 58000, bonus: 4500, deductions: 5800, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456796" },
  { id: "p9", employeeName: "Bilal Shah", employeeId: "EMP009", department: "Administration", designation: "Human Resources Lead", baseSalary: 70000, bonus: 5000, deductions: 7000, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456797" },
  { id: "p10", employeeName: "Zainab Raza", employeeId: "EMP010", department: "Research & Development", designation: "Data Analyst & Modeler", baseSalary: 68000, bonus: 6000, deductions: 6800, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456798" },
  { id: "p11", employeeName: "Hamza Siddiqui", employeeId: "EMP011", department: "Software Engineering", designation: "Mobile App Developer", baseSalary: 72000, bonus: 7000, deductions: 7200, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456799" },
  { id: "p12", employeeName: "Sana Mir", employeeId: "EMP012", department: "Administration", designation: "Executive Office Administrator", baseSalary: 48000, bonus: 3500, deductions: 4800, month: "2026-05", paymentStatus: "paid", bankAccountNumber: "PK36HABB000123456800" },
];

function getWebInitialCache<T>(keySub: string, fallback: T): T {
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes(keySub)) {
          const raw = localStorage.getItem(k);
          if (raw) return JSON.parse(raw);
        }
      }
    }
  } catch {}
  return fallback;
}

const FinanceContext = createContext<FinanceContextValue>({} as FinanceContextValue);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [transactions, setTransactions] = useState<Transaction[]>(() => getWebInitialCache("transactions", []));
  const [budgets, setBudgets] = useState<Budget[]>(() => getWebInitialCache("budgets", []));
  const [payroll, setPayroll] = useState<PayrollEntry[]>(() => getWebInitialCache("payroll", []));
  const [departments, setDepartments] = useState<Department[]>(() => getWebInitialCache("departments", []));
  const [notifications, setNotifications] = useState<AppNotification[]>(() => getWebInitialCache("notifications", []));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [loaded, setLoaded] = useState(() => (typeof window !== "undefined" && Boolean(window.localStorage)));

  const prevTransactionsRef = useRef<Transaction[]>([]);
  const deletedIdsRef = useRef<Set<string>>(new Set());

  const activeOrgId = user?.organizationId || "demo-org";
  const cachePrefix = `ofm_cache:${activeOrgId}:`;

  // Push Token Registration
  useEffect(() => {
    if (user?.id && user?.organizationId) {
      registerForPushNotificationsAsync(user.id, activeOrgId).catch(() => {});
    }
  }, [user?.id, user?.organizationId, activeOrgId]);

  // Real-time Notification Subscription
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const unsub = subscribeToNotifications(activeOrgId, (notifs) => {
      setNotifications(notifs);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [user?.id, activeOrgId]);

  // Automated evaluation of ledger notification events (Mobile & Web)
  useEffect(() => {
    if (loaded && activeOrgId) {
      syncLedgerNotificationEvents(
        transactions,
        budgets,
        payroll,
        activeOrgId,
        settings.currency || "PKR",
        user?.id || "current_user"
      ).catch(() => {});
    }
  }, [loaded, activeOrgId, transactions.length, budgets.length, payroll.length, settings.currency, user?.id]);

  // 1. Organization-Scoped Initial Local Cache Load + Instant REST Cloud Sync
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setBudgets([]);
      setPayroll([]);
      setDepartments([]);
      setLoaded(true);
      return;
    }

    Promise.all([
      AsyncStorage.getItem(`${cachePrefix}transactions`),
      AsyncStorage.getItem(`${cachePrefix}budgets`),
      AsyncStorage.getItem(`${cachePrefix}payroll`),
      AsyncStorage.getItem(`${cachePrefix}departments`),
    ]).then(([t, b, p, d]) => {
      if (t) setTransactions(JSON.parse(t));
      if (b) setBudgets(JSON.parse(b));
      if (p) setPayroll(JSON.parse(p));
      if (d) setDepartments(JSON.parse(d));
      setLoaded(true);
    }).catch(() => {
      setLoaded(true);
    });

    // Instant direct REST sync with Firebase Cloud (scoped to activeOrgId)
    Promise.all([
      fetchCollectionREST<Transaction>("transactions", activeOrgId),
      fetchCollectionREST<Budget>("budgets", activeOrgId),
      fetchCollectionREST<Department>("departments", activeOrgId),
      fetchCollectionREST<PayrollEntry>("payroll", activeOrgId),
    ]).then(([restTxs, restBudgets, restDepts, restPayroll]) => {
      const validTxs = restTxs.filter((t) => !deletedIdsRef.current.has(t.id));
      if (validTxs.length > 0) {
        validTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(validTxs);
        AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(validTxs)).catch(() => {});
      }
      const validBudgets = restBudgets.filter((b) => !deletedIdsRef.current.has(b.id));
      if (validBudgets.length > 0) {
        setBudgets(validBudgets);
        AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(validBudgets)).catch(() => {});
      }
      const validDepts = restDepts.filter((d) => !deletedIdsRef.current.has(d.id));
      if (validDepts.length > 0) {
        setDepartments(validDepts);
        AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(validDepts)).catch(() => {});
      }
      const validPayroll = restPayroll.filter((p) => !deletedIdsRef.current.has(p.id));
      if (validPayroll.length > 0) {
        setPayroll(validPayroll);
        AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(validPayroll)).catch(() => {});
      }
      setSyncStatus("synced");
    }).catch(() => {});
  }, [activeOrgId, user?.id]);

  // 2. Real-time Firebase Synchronization (Web ↔ Mobile ↔ Desktop)
  useEffect(() => {
    if (!loaded || !user || !user.organizationId) {
      if (!user) {
        setTransactions([]);
        setBudgets([]);
        setPayroll([]);
        setDepartments([]);
      }
      return;
    }

    setSyncStatus("synced");
    const canonicalOrgId = user.organizationId;

    // Real-time listener for Transactions strictly scoped to organization
    const qTransactions = query(
      collection(db, "transactions"),
      where("organizationId", "==", canonicalOrgId)
    );

    const unsubTransactions = onSnapshot(
      qTransactions,
      (snapshot) => {
        setSyncStatus("synced");
        const remoteItems: Transaction[] = [];
        snapshot.forEach((d) => {
          if (!deletedIdsRef.current.has(d.id)) {
            remoteItems.push({ id: d.id, ...d.data() } as Transaction);
          }
        });

        remoteItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(remoteItems);
        prevTransactionsRef.current = remoteItems;
        AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(remoteItems)).catch(() => {});
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Transactions live sync notice:", err.message);
        }
      }
    );

    // Real-time listener for Budgets strictly scoped to organization
    const qBudgets = query(
      collection(db, "budgets"),
      where("organizationId", "==", canonicalOrgId)
    );

    const unsubBudgets = onSnapshot(
      qBudgets,
      (snapshot) => {
        const remoteItems: Budget[] = [];
        snapshot.forEach((d) => {
          if (!deletedIdsRef.current.has(d.id)) {
            remoteItems.push({ id: d.id, ...d.data() } as Budget);
          }
        });

        setBudgets(remoteItems);
        AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(remoteItems)).catch(() => {});
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Budgets live sync notice:", err.message);
        }
      }
    );

    // Real-time listener for Payroll strictly scoped to organization
    const qPayroll = query(
      collection(db, "payroll"),
      where("organizationId", "==", canonicalOrgId)
    );

    const unsubPayroll = onSnapshot(
      qPayroll,
      (snapshot) => {
        const remoteItems: PayrollEntry[] = [];
        snapshot.forEach((d) => {
          if (!deletedIdsRef.current.has(d.id)) {
            remoteItems.push({ id: d.id, ...d.data() } as PayrollEntry);
          }
        });

        setPayroll(remoteItems);
        AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(remoteItems)).catch(() => {});
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Payroll live sync notice:", err.message);
        }
      }
    );

    // Real-time listener for Departments strictly scoped to organization
    const qDepartments = query(
      collection(db, "departments"),
      where("organizationId", "==", canonicalOrgId)
    );

    const unsubDepartments = onSnapshot(
      qDepartments,
      (snapshot) => {
        const remoteItems: Department[] = [];
        snapshot.forEach((d) => {
          if (!deletedIdsRef.current.has(d.id)) {
            remoteItems.push({ id: d.id, ...d.data() } as Department);
          }
        });

        setDepartments(remoteItems);
        AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(remoteItems)).catch(() => {});
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Departments live sync notice:", err.message);
        }
      }
    );

    return () => {
      unsubTransactions();
      unsubBudgets();
      unsubPayroll();
      unsubDepartments();
    };
  }, [loaded, user?.id, user?.organizationId, activeOrgId]);

  // 3. Organization-Scoped Local Cache Write
  useEffect(() => {
    if (loaded && user) {
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(transactions)).catch(() => {});
    }
  }, [transactions, loaded, cachePrefix]);

  useEffect(() => {
    if (loaded && user) {
      AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(budgets)).catch(() => {});
    }
  }, [budgets, loaded, cachePrefix]);

  useEffect(() => {
    if (loaded && user) {
      AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(payroll)).catch(() => {});
    }
  }, [payroll, loaded, cachePrefix]);

  useEffect(() => {
    if (loaded && user) {
      AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(departments)).catch(() => {});
    }
  }, [departments, loaded, cachePrefix]);

  // --- CRUD Operations ---

  const addTransaction = async (t: Omit<Transaction, "id" | "addedBy"> & { addedBy?: string }) => {
    if (!can(user, "create_transaction")) {
      showFloatingToast("Permission Denied", "You do not have permission to add transactions.");
      throw new Error("Permission denied: cannot create transaction");
    }

    const id = generateSafeId("transactions");
    const now = new Date().toISOString();
    const orgName = user?.organization || "OFM — Organization Finance Management";
    const orgId = user?.organizationId || "default_org";

    const newTx: Transaction = {
      ...t,
      id,
      addedBy: user?.name || user?.email || t.addedBy || "Finance Officer",
      organizationId: orgId,
      organization: orgName,
      createdAt: t.createdAt || now,
      updatedAt: now,
      paymentMethod: t.paymentMethod || "Electronic Transfer",
      referenceNumber: t.referenceNumber || `TXN-${id.slice(-6).toUpperCase()}`,
      status: t.status || "completed",
    };

    setTransactions((prev) => [newTx, ...prev.filter((item) => item.id !== id)]);

    try {
      await setDoc(doc(db, "transactions", id), newTx);
      setSyncStatus("synced");
      recordAuditLog({
        organizationId: orgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "create",
        entity: "transaction",
        entityId: id,
        metadata: { type: newTx.type, amount: newTx.amount, category: newTx.category, department: newTx.department },
      }).catch(() => {});
    } catch (err) {
      setSyncStatus("offline_pending");
      console.log("Transaction saved to offline local queue:", err);
    }

    // Direct background REST write for instant cloud sync across mobile & web
    saveDocREST("transactions", id, newTx).then(() => setSyncStatus("synced")).catch(() => {});

    // Budget overrun real-time validation & automated notification evaluation
    if (newTx.type === "expense") {
      // 1. Unusual Outflow Event Evaluation
      const expenseTxs = transactions.filter((item) => item.type === "expense");
      const histAvg = expenseTxs.length > 0 ? expenseTxs.reduce((s, item) => s + item.amount, 0) / expenseTxs.length : 0;
      const unusualEvent = evaluateTransactionEvent(newTx, histAvg, orgId, settings.currency);
      if (unusualEvent) {
        dispatchNotification(unusualEvent, orgId, user?.id).catch(() => {});
      }

      // 2. Line-item category budget check
      const matchBudget = budgets.find(
        (b) =>
          (!b.department || b.department === "All" || b.department?.trim().toLowerCase() === newTx.department?.trim().toLowerCase()) &&
          (!b.category || b.category === "All" || b.category?.trim().toLowerCase() === newTx.category?.trim().toLowerCase())
      );
      if (matchBudget && matchBudget.allocated > 0) {
        const newSpent = (matchBudget.spent || 0) + newTx.amount;
        const ratio = (newSpent / matchBudget.allocated) * 100;
        
        const bEvent = evaluateBudgetEvent({ ...matchBudget, spent: newSpent }, orgId, settings.currency);
        if (bEvent) {
          dispatchNotification(bEvent, orgId, user?.id).catch(() => {});
        }

        if (ratio >= 100) {
          showFloatingToast("Budget Exceeded", `⚠️ ${matchBudget.department} (${matchBudget.category}) has exceeded its allocated limit.`);
          triggerLocalNotification("Budget Limit Exceeded", `${matchBudget.department} has reached ${ratio.toFixed(0)}% of its ${matchBudget.category} budget limit.`);
        } else if (ratio >= 80) {
          showFloatingToast("Budget Alert", `⚡ ${matchBudget.department} (${matchBudget.category}) is at ${ratio.toFixed(0)}% capacity.`);
        }
      }

      // 3. Department-level allocation cap check
      const matchDept = departments.find(
        (d) => d.name?.trim().toLowerCase() === newTx.department?.trim().toLowerCase()
      );
      if (matchDept && (matchDept.budgetAllocated || 0) > 0) {
        const allocated = matchDept.budgetAllocated || 0;
        const currentDeptSpent = transactions
          .filter((t) => t.type === "expense" && t.department?.trim().toLowerCase() === matchDept.name?.trim().toLowerCase())
          .reduce((s, t) => s + t.amount, 0) + newTx.amount;
        const deptRatio = (currentDeptSpent / allocated) * 100;
        if (deptRatio >= 100) {
          showFloatingToast("Department Cap Exceeded", `⚠️ ${matchDept.name} Department Budget Cap Exceeded (${deptRatio.toFixed(0)}%).`);
          triggerLocalNotification("Department Budget Exceeded", `${matchDept.name} has exceeded its allocated ceiling of ${settings.currency} ${allocated.toLocaleString()}.`);
        } else if (deptRatio >= 80) {
          showFloatingToast("Department Alert", `⚡ ${matchDept.name} has utilized ${deptRatio.toFixed(0)}% of its budget ceiling.`);
        }
      }
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Omit<Transaction, "id">>) => {
    if (!can(user, "edit_transaction")) {
      showFloatingToast("Permission Denied", "You do not have permission to edit transactions.");
      throw new Error("Permission denied: cannot edit transaction");
    }

    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...enrichedUpdates } : t)));
    try {
      await setDoc(doc(db, "transactions", id), enrichedUpdates, { merge: true });
      saveDocREST("transactions", id, enrichedUpdates).catch(() => {});
      recordAuditLog({
        organizationId: activeOrgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "update",
        entity: "transaction",
        entityId: id,
        metadata: updates,
      }).catch(() => {});
    } catch (err) {
      console.log("Transaction update queued offline:", err);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!can(user, "delete_transaction")) {
      showFloatingToast("Permission Denied", "You do not have permission to delete transactions.");
      throw new Error("Permission denied: cannot delete transaction");
    }

    deletedIdsRef.current.add(id);
    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const aliasId = `tx_${id}_${orgKey}`;
    deletedIdsRef.current.add(aliasId);

    setTransactions((prev) => prev.filter((t) => t.id !== id && t.id !== aliasId));
    try {
      await deleteDoc(doc(db, "transactions", id)).catch(() => {});
      await deleteDoc(doc(db, "transactions", aliasId)).catch(() => {});
      deleteDocREST("transactions", id).catch(() => {});
      deleteDocREST("transactions", aliasId).catch(() => {});
      recordAuditLog({
        organizationId: activeOrgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "delete",
        entity: "transaction",
        entityId: id,
      }).catch(() => {});
    } catch (err) {
      console.log("Transaction deletion queued offline:", err);
    }
  };

  const addBudget = async (b: Omit<Budget, "id">) => {
    if (!can(user, "manage_budgets")) {
      showFloatingToast("Permission Denied", "You do not have permission to add budgets.");
      throw new Error("Permission denied: cannot add budget");
    }

    const id = generateSafeId("budgets");
    const now = new Date().toISOString();
    const orgName = user?.organization || "OFM — Organization Finance Management";
    const orgId = user?.organizationId || "default_org";

    const newBudget: Budget = {
      ...b,
      id,
      organizationId: orgId,
      organization: orgName,
      createdAt: b.createdAt || now,
      updatedAt: now,
      fiscalYear: b.fiscalYear || settings.fiscalYear || "2025-2026",
      alertThreshold: b.alertThreshold || 80,
    };

    setBudgets((prev) => [{ ...newBudget, spent: 0 }, ...prev.filter((item) => item.id !== id)]);
    try {
      await setDoc(doc(db, "budgets", id), newBudget);
      saveDocREST("budgets", id, newBudget).catch(() => {});
      recordAuditLog({
        organizationId: orgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "create",
        entity: "budget",
        entityId: id,
        metadata: { category: newBudget.category, department: newBudget.department, allocated: newBudget.allocated },
      }).catch(() => {});
    } catch (err) {
      console.log("Budget saved offline:", err);
    }
  };

  const updateBudget = async (id: string, updates: Partial<Omit<Budget, "id">>) => {
    if (!can(user, "manage_budgets")) {
      showFloatingToast("Permission Denied", "You do not have permission to edit budgets.");
      throw new Error("Permission denied: cannot edit budget");
    }

    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...enrichedUpdates } : b)));
    try {
      await setDoc(doc(db, "budgets", id), enrichedUpdates, { merge: true });
      saveDocREST("budgets", id, enrichedUpdates).catch(() => {});
      recordAuditLog({
        organizationId: activeOrgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "update",
        entity: "budget",
        entityId: id,
        metadata: updates,
      }).catch(() => {});
    } catch (err) {
      console.log("Budget update queued offline:", err);
    }
  };

  const deleteBudget = async (id: string) => {
    if (!can(user, "manage_budgets")) {
      showFloatingToast("Permission Denied", "You do not have permission to delete budgets.");
      throw new Error("Permission denied: cannot delete budget");
    }

    deletedIdsRef.current.add(id);
    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const aliasId = `budget_${id}_${orgKey}`;
    deletedIdsRef.current.add(aliasId);

    setBudgets((prev) => prev.filter((b) => b.id !== id && b.id !== aliasId));
    try {
      await deleteDoc(doc(db, "budgets", id)).catch(() => {});
      await deleteDoc(doc(db, "budgets", aliasId)).catch(() => {});
      deleteDocREST("budgets", id).catch(() => {});
      deleteDocREST("budgets", aliasId).catch(() => {});
      recordAuditLog({
        organizationId: activeOrgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "delete",
        entity: "budget",
        entityId: id,
      }).catch(() => {});
    } catch (err) {
      console.log("Budget delete queued offline:", err);
    }
  };

  const addPayroll = async (p: Omit<PayrollEntry, "id">) => {
    if (!can(user, "manage_payroll")) {
      showFloatingToast("Permission Denied", "You do not have permission to manage payroll.");
      throw new Error("Permission denied: cannot create payroll");
    }

    const id = generateSafeId("payroll");
    const now = new Date().toISOString();
    const orgName = user?.organization || "OFM — Organization Finance Management";
    const orgId = user?.organizationId || "default_org";
    const netSalary = p.baseSalary + (p.bonus || 0) - (p.deductions || 0);

    const newPayroll: PayrollEntry = {
      ...p,
      id,
      organizationId: orgId,
      organization: orgName,
      netSalary,
      createdAt: p.createdAt || now,
      updatedAt: now,
      paymentStatus: p.paymentStatus || "paid",
    };

    setPayroll((prev) => [newPayroll, ...prev.filter((item) => item.id !== id)]);

    // ─── Automatic Ledger Expense Transaction Sync ───
    const txId = `tx_pay_${id}`;
    const salaryTx: Transaction = {
      id: txId,
      type: "expense",
      amount: netSalary,
      category: "Salaries",
      department: p.department || "General",
      date: p.month ? `${p.month}-01` : now.split("T")[0],
      title: `Salary — ${p.employeeName} (${p.month || "Current"})`,
      description: `Staff payroll disbursement for ${p.employeeName} (${p.employeeId || "Staff"}). Base: ${p.baseSalary}, Bonus: ${p.bonus || 0}, Deductions: ${p.deductions || 0}`,
      addedBy: user?.name || user?.email || "Payroll System",
      organizationId: orgId,
      organization: orgName,
      createdAt: now,
      updatedAt: now,
      paymentMethod: "Bank Transfer",
      status: "completed",
    };

    setTransactions((prev) => [salaryTx, ...prev.filter((t) => t.id !== txId)]);

    try {
      await setDoc(doc(db, "payroll", id), newPayroll);
      await setDoc(doc(db, "transactions", txId), salaryTx).catch(() => {});
      saveDocREST("payroll", id, newPayroll).catch(() => {});
      saveDocREST("transactions", txId, salaryTx).catch(() => {});
      recordAuditLog({
        organizationId: orgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "create",
        entity: "payroll",
        entityId: id,
        metadata: { employeeName: p.employeeName, month: p.month, netSalary, department: p.department },
      }).catch(() => {});
      
      dispatchNotification(
        {
          type: "PAYROLL_PROCESSED",
          title: "Payroll Disbursal Deducted",
          message: `Deducted ${settings.currency || "PKR"} ${netSalary.toLocaleString()} from ${p.department} budget for ${p.employeeName} (${p.month}).`,
          severity: "INFO",
          actionRoute: "/payroll",
          entityId: id,
          idempotencyKey: `payroll_${orgId}_${id}`,
        },
        orgId,
        user?.id
      ).catch(() => {});
    } catch (err) {
      console.log("Payroll saved offline:", err);
    }
  };

  const updatePayroll = async (id: string, updates: Partial<Omit<PayrollEntry, "id">>) => {
    if (!can(user, "manage_payroll")) {
      showFloatingToast("Permission Denied", "You do not have permission to manage payroll.");
      throw new Error("Permission denied: cannot update payroll");
    }

    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    let updatedNetSalary: number | undefined;

    setPayroll((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const merged = { ...p, ...enrichedUpdates };
          const base = merged.baseSalary || 0;
          const bonus = merged.bonus || 0;
          const deductions = merged.deductions || 0;
          merged.netSalary = base + bonus - deductions;
          updatedNetSalary = merged.netSalary;
          return merged;
        }
        return p;
      })
    );

    // Also update linked transaction in transactions list
    const txId = `tx_pay_${id}`;
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id === txId) {
          return {
            ...t,
            amount: updatedNetSalary ?? t.amount,
            department: updates.department ?? t.department,
            title: updates.employeeName ? `Salary — ${updates.employeeName} (${updates.month || "Current"})` : t.title,
            updatedAt: new Date().toISOString(),
          };
        }
        return t;
      })
    );

    try {
      await setDoc(doc(db, "payroll", id), enrichedUpdates, { merge: true });
      saveDocREST("payroll", id, enrichedUpdates).catch(() => {});
      if (updatedNetSalary !== undefined || updates.department || updates.employeeName) {
        const txUpdates = {
          amount: updatedNetSalary,
          department: updates.department,
          title: updates.employeeName ? `Salary — ${updates.employeeName} (${updates.month || "Current"})` : undefined,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, "transactions", txId), txUpdates, { merge: true }).catch(() => {});
        saveDocREST("transactions", txId, txUpdates).catch(() => {});
      }
      recordAuditLog({
        organizationId: activeOrgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "update",
        entity: "payroll",
        entityId: id,
        metadata: updates,
      }).catch(() => {});
    } catch (err) {
      console.log("Payroll update queued offline:", err);
    }
  };

  const deletePayroll = async (id: string) => {
    if (!can(user, "manage_payroll")) {
      showFloatingToast("Permission Denied", "You do not have permission to delete payroll.");
      throw new Error("Permission denied: cannot delete payroll");
    }

    deletedIdsRef.current.add(id);
    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const aliasId = `payroll_${id}_${orgKey}`;
    deletedIdsRef.current.add(aliasId);

    const txId = `tx_pay_${id}`;
    deletedIdsRef.current.add(txId);

    setPayroll((prev) => prev.filter((p) => p.id !== id && p.id !== aliasId));
    setTransactions((prev) => prev.filter((t) => t.id !== txId));

    try {
      await deleteDoc(doc(db, "payroll", id)).catch(() => {});
      await deleteDoc(doc(db, "payroll", aliasId)).catch(() => {});
      await deleteDoc(doc(db, "transactions", txId)).catch(() => {});
      deleteDocREST("payroll", id).catch(() => {});
      deleteDocREST("payroll", aliasId).catch(() => {});
      deleteDocREST("transactions", txId).catch(() => {});
      recordAuditLog({
        organizationId: activeOrgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "delete",
        entity: "payroll",
        entityId: id,
      }).catch(() => {});
    } catch (err) {
      console.log("Payroll delete queued offline:", err);
    }
  };

  const addDepartment = async (d: Omit<Department, "id">) => {
    if (!can(user, "manage_departments")) {
      showFloatingToast("Permission Denied", "You do not have permission to manage departments.");
      throw new Error("Permission denied: cannot create department");
    }

    const id = generateSafeId("departments");
    const now = new Date().toISOString();
    const orgName = user?.organization || "OFM — Organization Finance Management";
    const orgId = user?.organizationId || "default_org";

    const newDept: Department = {
      ...d,
      id,
      organizationId: orgId,
      organization: orgName,
      createdAt: d.createdAt || now,
      updatedAt: now,
      code: d.code || `DEPT-${d.name.substring(0, 3).toUpperCase()}`,
    };

    setDepartments((prev) => [...prev.filter((item) => item.id !== id), newDept]);
    try {
      await setDoc(doc(db, "departments", id), newDept);
      saveDocREST("departments", id, newDept).catch(() => {});
      recordAuditLog({
        organizationId: orgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "create",
        entity: "department",
        entityId: id,
        metadata: { name: newDept.name, budgetAllocated: newDept.budgetAllocated },
      }).catch(() => {});
    } catch (err) {
      console.log("Department save queued offline:", err);
    }
  };

  const updateDepartment = async (id: string, updates: Partial<Omit<Department, "id">>) => {
    if (!can(user, "manage_departments")) {
      showFloatingToast("Permission Denied", "You do not have permission to update departments.");
      throw new Error("Permission denied: cannot update department");
    }

    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setDepartments((prev) => prev.map((d) => (d.id === id ? { ...d, ...enrichedUpdates } : d)));
    try {
      await setDoc(doc(db, "departments", id), enrichedUpdates, { merge: true });
      saveDocREST("departments", id, enrichedUpdates).catch(() => {});
      recordAuditLog({
        organizationId: activeOrgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "update",
        entity: "department",
        entityId: id,
        metadata: updates,
      }).catch(() => {});
    } catch (err) {
      console.log("Department update queued offline:", err);
    }
  };

  const deleteDepartment = async (id: string) => {
    if (!can(user, "manage_departments")) {
      showFloatingToast("Permission Denied", "You do not have permission to delete departments.");
      throw new Error("Permission denied: cannot delete department");
    }

    deletedIdsRef.current.add(id);
    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const aliasId = `dept_${id}_${orgKey}`;
    deletedIdsRef.current.add(aliasId);

    setDepartments((prev) => prev.filter((d) => d.id !== id && d.id !== aliasId));
    try {
      await deleteDoc(doc(db, "departments", id)).catch(() => {});
      await deleteDoc(doc(db, "departments", aliasId)).catch(() => {});
      deleteDocREST("departments", id).catch(() => {});
      deleteDocREST("departments", aliasId).catch(() => {});
      recordAuditLog({
        organizationId: activeOrgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "delete",
        entity: "department",
        entityId: id,
      }).catch(() => {});
    } catch (err) {
      console.log("Department delete queued offline:", err);
    }
  };

  // Authoritative Central Financial Calculations (FinancialCalculationEngine)
  const totalIncome = useMemo(() => calculateTotalIncome(transactions), [transactions]);
  const totalExpenses = useMemo(() => calculateTotalExpenses(transactions), [transactions]);
  const netBalance = useMemo(() => calculateNetOperatingResult(transactions), [transactions]);

  const budgetsWithSpent = useMemo(() => {
    return budgets.map((b) => {
      const spent = calculateBudgetSpentForCategory(b, transactions);
      return { ...b, spent };
    });
  }, [budgets, transactions]);

  const totalLineBudgeted = useMemo(() => {
    return budgets.reduce((s, b) => s + Number(b.allocated || 0), 0);
  }, [budgets]);

  const totalDeptBudgeted = useMemo(() => {
    return departments.reduce((s, d) => s + Number(d.budgetAllocated || 0), 0);
  }, [departments]);

  const totalBudgeted = totalLineBudgeted > 0 ? totalLineBudgeted : totalDeptBudgeted;
  const actualCash = useMemo(() => calculateActualCash(transactions), [transactions]);
  const totalBudgetSpent = useMemo(() => {
    return budgetsWithSpent.reduce((sum, b) => sum + Number(b.spent || 0), 0);
  }, [budgetsWithSpent]);
  const totalBudgetRemaining = useMemo(() => calculateBudgetRemaining(totalBudgeted, totalBudgetSpent), [totalBudgeted, totalBudgetSpent]);
  const budgetUtilization = useMemo(() => totalBudgeted > 0 ? (totalBudgetSpent / totalBudgeted) * 100 : 0, [totalBudgeted, totalBudgetSpent]);
  const unreadNotificationCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const refreshData = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const fetchPromise = Promise.all([
        fetchCollectionREST<Transaction>("transactions", activeOrgId),
        fetchCollectionREST<Budget>("budgets", activeOrgId),
        fetchCollectionREST<Department>("departments", activeOrgId),
        fetchCollectionREST<PayrollEntry>("payroll", activeOrgId),
      ]);
      const timeoutPromise = new Promise<any[]>((resolve) =>
        setTimeout(() => resolve([[], [], [], []]), 2500)
      );
      const [restTxs, restBudgets, restDepts, restPayroll] = await Promise.race([
        fetchPromise,
        timeoutPromise,
      ]);

      if (restTxs && restTxs.length > 0) {
        const validTxs = restTxs.filter((t: Transaction) => !deletedIdsRef.current.has(t.id));
        validTxs.sort((a: Transaction, b: Transaction) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(validTxs);
        AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(validTxs)).catch(() => {});
      }
      if (restBudgets && restBudgets.length > 0) {
        const validBudgets = restBudgets.filter((b: Budget) => !deletedIdsRef.current.has(b.id));
        setBudgets(validBudgets);
        AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(validBudgets)).catch(() => {});
      }
      if (restDepts && restDepts.length > 0) {
        const validDepts = restDepts.filter((d: Department) => !deletedIdsRef.current.has(d.id));
        setDepartments(validDepts);
        AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(validDepts)).catch(() => {});
      }
      if (restPayroll && restPayroll.length > 0) {
        const validPayroll = restPayroll.filter((p: PayrollEntry) => !deletedIdsRef.current.has(p.id));
        setPayroll(validPayroll);
        AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(validPayroll)).catch(() => {});
      }
    } catch (e) {
    } finally {
      setSyncStatus("synced");
    }
  }, [cachePrefix, activeOrgId]);

  const financeValue = useMemo(() => ({
    transactions,
    budgets: budgetsWithSpent,
    payroll,
    departments,
    notifications,
    unreadNotificationCount,
    syncStatus,
    loaded,
    isLoading: !loaded,
    refreshData,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addBudget,
    updateBudget,
    deleteBudget,
    addPayroll,
    updatePayroll,
    deletePayroll,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    totalIncome,
    totalExpenses,
    netBalance,
    budgetUtilization,
    totalBudgeted,
    totalLineBudgeted,
    totalDeptBudgeted,
    totalBudgetSpent,
    totalBudgetRemaining,
  }), [
    transactions,
    budgetsWithSpent,
    payroll,
    departments,
    notifications,
    unreadNotificationCount,
    syncStatus,
    loaded,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addBudget,
    updateBudget,
    deleteBudget,
    addPayroll,
    updatePayroll,
    deletePayroll,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    totalIncome,
    totalExpenses,
    netBalance,
    budgetUtilization,
    totalBudgeted,
    totalLineBudgeted,
    totalDeptBudgeted,
    totalBudgetSpent,
    totalBudgetRemaining,
  ]);

  return (
    <FinanceContext.Provider value={financeValue}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  return useContext(FinanceContext);
}
