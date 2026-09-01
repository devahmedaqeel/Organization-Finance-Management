import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "./AuthContext";
import { useSettings } from "./SettingsContext";
import { showFloatingToast } from "@/utils/toast";
import { triggerLocalNotification } from "../hooks/NotificationHelper";

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
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetOperatingResult,
  calculateBudgetAllocation,
  calculateBudgetSpentForCategory,
  calculateBudgetUsed,
  calculateBudgetRemaining,
  calculateActualCash,
} from "@/services/FinancialCalculationEngine";

export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  amount: number;
  date: string;
  department: string;
  description: string;
  addedBy: string;
  organizationId?: string;
  organization?: string;
  createdAt?: string;
  updatedAt?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  status?: "completed" | "pending" | "reconciled";
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
  addTransaction: (t: Omit<Transaction, "id">) => Promise<void>;
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

const FinanceContext = createContext<FinanceContextValue>({} as FinanceContextValue);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [loaded, setLoaded] = useState(false);

  const prevTransactionsRef = useRef<Transaction[]>([]);

  const isDemoOrg = user?.organizationId === "demo-org";
  const activeOrgId = user?.organizationId || "default_org";
  const cachePrefix = `ofm_cache:${activeOrgId}:`;

  // Push Token Registration
  useEffect(() => {
    if (user?.id && user?.organizationId) {
      registerForPushNotificationsAsync(user.id, activeOrgId).catch(() => {});
    }
  }, [user?.id, user?.organizationId, activeOrgId]);

  // Real-time Notification Subscription
  useEffect(() => {
    if (!user || !user.organizationId) {
      setNotifications([]);
      return;
    }
    const unsub = subscribeToNotifications(activeOrgId, (notifs) => {
      setNotifications(notifs);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [user?.organizationId, activeOrgId]);

  // Automated evaluation of ledger notification events
  useEffect(() => {
    if (loaded && user?.organizationId && (transactions.length > 0 || budgets.length > 0 || payroll.length > 0)) {
      syncLedgerNotificationEvents(
        transactions,
        budgets,
        payroll,
        activeOrgId,
        settings.currency || "PKR",
        user.id
      ).catch(() => {});
    }
  }, [loaded, user?.organizationId, transactions.length, budgets.length, payroll.length, activeOrgId, settings.currency]);

  // 1. Organization-Scoped Initial Local Cache Load
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
      setTransactions(t ? JSON.parse(t) : (isDemoOrg ? SEED_TRANSACTIONS : []));
      setBudgets(b ? JSON.parse(b) : SEED_BUDGETS);
      const parsedPayroll = p ? JSON.parse(p) : [];
      setPayroll(parsedPayroll.length >= SEED_PAYROLL.length ? parsedPayroll : SEED_PAYROLL);
      const parsedDepts = d ? JSON.parse(d) : [];
      setDepartments(parsedDepts.length >= SEED_DEPARTMENTS.length ? parsedDepts : SEED_DEPARTMENTS);
      setLoaded(true);
    }).catch(() => {
      setPayroll(SEED_PAYROLL);
      setDepartments(SEED_DEPARTMENTS);
      setBudgets(SEED_BUDGETS);
      setLoaded(true);
    });
  }, [activeOrgId, user?.id, isDemoOrg]);

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

    setSyncStatus("syncing");
    const canonicalOrgName = user.organization || "Organization Finance Management";
    const canonicalOrgId = user.organizationId;

    // Real-time listener for Transactions
    const qTransactions = isDemoOrg
      ? query(
          collection(db, "transactions"),
          where("organizationId", "in", ["demo-org", "default_org", "Organization Finance Management", "OFM — Organization Finance Management"])
        )
      : query(
          collection(db, "transactions"),
          where("organizationId", "==", canonicalOrgId)
        );

    const unsubTransactions = onSnapshot(
      qTransactions,
      (snapshot) => {
        setSyncStatus("synced");
        if (snapshot.empty && isDemoOrg) {
          SEED_TRANSACTIONS.forEach((st) => {
            setDoc(doc(db, "transactions", st.id), {
              ...st,
              organizationId: canonicalOrgId,
              organization: canonicalOrgName,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }).catch(() => {});
          });
          return;
        }

        const items: Transaction[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...d.data() } as Transaction);
        });
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Multi-device notification (don't notify user of their own addition)
        if (prevTransactionsRef.current.length > 0 && items.length > prevTransactionsRef.current.length) {
          const newT = items.find((t) => !prevTransactionsRef.current.some((p) => p.id === t.id));
          if (newT && newT.addedBy !== user?.email && newT.addedBy !== user?.name) {
            const amtStr = `${settings.currency || "PKR"} ${newT.amount.toLocaleString()}`;
            const typeTitle = newT.type === "income" ? "New Income Recorded 💰" : "New Expense Recorded 💸";
            const bodyMsg = `${newT.addedBy} added ${amtStr} for ${newT.category} (${newT.department})`;
            triggerLocalNotification(typeTitle, bodyMsg);
            showFloatingToast(typeTitle, bodyMsg);
          }
        }

        prevTransactionsRef.current = items;
        setTransactions(items);
      },
      (err) => {
        setSyncStatus("offline_pending");
        if (err.code !== "permission-denied") {
          console.log("Transactions live sync notice:", err.message);
        }
      }
    );

    // Real-time listener for Budgets
    const qBudgets = isDemoOrg
      ? query(
          collection(db, "budgets"),
          where("organizationId", "in", ["demo-org", "default_org", "Organization Finance Management", "OFM — Organization Finance Management"])
        )
      : query(
          collection(db, "budgets"),
          where("organizationId", "==", canonicalOrgId)
        );

    const unsubBudgets = onSnapshot(
      qBudgets,
      (snapshot) => {
        if (snapshot.empty) {
          SEED_BUDGETS.forEach((sb) => {
            const docId = `budget_${sb.id}_${canonicalOrgId.replace(/[^a-zA-Z0-9]/g, "_")}`;
            setDoc(doc(db, "budgets", docId), {
              ...sb,
              id: docId,
              organizationId: canonicalOrgId,
              organization: canonicalOrgName,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});
          });
          setBudgets(SEED_BUDGETS);
          return;
        }

        const items: Budget[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...d.data() } as Budget);
        });
        setBudgets(items.length > 0 ? items : SEED_BUDGETS);
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Budgets live sync notice:", err.message);
        }
        setBudgets(SEED_BUDGETS);
      }
    );

    // Real-time listener for Payroll
    const qPayroll = isDemoOrg
      ? query(
          collection(db, "payroll"),
          where("organizationId", "in", ["demo-org", "default_org", "Organization Finance Management", "OFM — Organization Finance Management"])
        )
      : query(
          collection(db, "payroll"),
          where("organizationId", "==", canonicalOrgId)
        );

    const unsubPayroll = onSnapshot(
      qPayroll,
      (snapshot) => {
        const items: PayrollEntry[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...d.data() } as PayrollEntry);
        });

        if (items.length < SEED_PAYROLL.length) {
          const existingEmployeeNames = new Set(items.map((it) => (it.employeeName || "").trim().toLowerCase()));
          const missingSeed = SEED_PAYROLL.filter((sp) => !existingEmployeeNames.has(sp.employeeName.trim().toLowerCase()));

          if (missingSeed.length > 0) {
            missingSeed.forEach((sp) => {
              const docId = `payroll_${sp.id}_${canonicalOrgId.replace(/[^a-zA-Z0-9]/g, "_")}`;
              setDoc(doc(db, "payroll", docId), {
                ...sp,
                id: docId,
                organizationId: canonicalOrgId,
                organization: canonicalOrgName,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }, { merge: true }).catch(() => {});
            });

            // Instant combined state so badge shows 12 immediately
            setPayroll([...items, ...missingSeed]);
            return;
          }
        }

        setPayroll(items.length > 0 ? items : SEED_PAYROLL);
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Payroll live sync notice:", err.message);
        }
        setPayroll(SEED_PAYROLL);
      }
    );

    // Real-time listener for Departments
    const qDepartments = isDemoOrg
      ? query(
          collection(db, "departments"),
          where("organizationId", "in", ["demo-org", "default_org", "Organization Finance Management", "OFM — Organization Finance Management"])
        )
      : query(
          collection(db, "departments"),
          where("organizationId", "==", canonicalOrgId)
        );

    const unsubDepartments = onSnapshot(
      qDepartments,
      (snapshot) => {
        if (snapshot.empty) {
          SEED_DEPARTMENTS.forEach((sd) => {
            const docId = `dept_${sd.id}_${canonicalOrgId.replace(/[^a-zA-Z0-9]/g, "_")}`;
            setDoc(doc(db, "departments", docId), {
              ...sd,
              id: docId,
              organizationId: canonicalOrgId,
              organization: canonicalOrgName,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});
          });
          setDepartments(SEED_DEPARTMENTS);
          return;
        }

        const items: Department[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...d.data() } as Department);
        });
        setDepartments(items.length > 0 ? items : SEED_DEPARTMENTS);
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Departments live sync notice:", err.message);
        }
        setDepartments(SEED_DEPARTMENTS);
      }
    );

    return () => {
      unsubTransactions();
      unsubBudgets();
      unsubPayroll();
      unsubDepartments();
    };
  }, [loaded, user?.id, user?.organizationId, activeOrgId, isDemoOrg]);

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

  const addTransaction = async (t: Omit<Transaction, "id">) => {
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
          showFloatingToast(`⚠️ Budget Exceeded for ${matchBudget.department} (${matchBudget.category})`);
          triggerLocalNotification("Budget Limit Exceeded", `${matchBudget.department} has reached ${ratio.toFixed(0)}% of its ${matchBudget.category} budget limit.`);
        } else if (ratio >= 80) {
          showFloatingToast(`⚡ Budget Alert: ${matchBudget.department} (${matchBudget.category}) is at ${ratio.toFixed(0)}% capacity`);
        }
      }

      // 3. Department-level allocation cap check
      const matchDept = departments.find(
        (d) => d.name?.trim().toLowerCase() === newTx.department?.trim().toLowerCase()
      );
      if (matchDept && (matchDept.budgetAllocated || 0) > 0) {
        const currentDeptSpent = transactions
          .filter((t) => t.type === "expense" && t.department?.trim().toLowerCase() === matchDept.name?.trim().toLowerCase())
          .reduce((s, t) => s + t.amount, 0) + newTx.amount;
        const deptRatio = (currentDeptSpent / matchDept.budgetAllocated) * 100;
        if (deptRatio >= 100) {
          showFloatingToast(`⚠️ ${matchDept.name} Department Budget Cap Exceeded (${deptRatio.toFixed(0)}%)`);
          triggerLocalNotification("Department Budget Exceeded", `${matchDept.name} has exceeded its allocated ceiling of ${settings.currency} ${matchDept.budgetAllocated.toLocaleString()}.`);
        } else if (deptRatio >= 80) {
          showFloatingToast(`⚡ Department Alert: ${matchDept.name} has utilized ${deptRatio.toFixed(0)}% of its budget ceiling.`);
        }
      }
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Omit<Transaction, "id">>) => {
    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...enrichedUpdates } : t)));
    try {
      await setDoc(doc(db, "transactions", id), enrichedUpdates, { merge: true });
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
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteDoc(doc(db, "transactions", id));
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
    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...enrichedUpdates } : b)));
    try {
      await setDoc(doc(db, "budgets", id), enrichedUpdates, { merge: true });
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
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    try {
      await deleteDoc(doc(db, "budgets", id));
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
    try {
      await setDoc(doc(db, "payroll", id), newPayroll);
      recordAuditLog({
        organizationId: orgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "create",
        entity: "payroll",
        entityId: id,
        metadata: { employeeName: p.employeeName, month: p.month, netSalary },
      }).catch(() => {});
      
      dispatchNotification(
        {
          type: "PAYROLL_PROCESSED",
          title: "Payroll Disbursal Recorded",
          message: `Disbursed ${settings.currency || "PKR"} ${netSalary.toLocaleString()} for ${p.employeeName} (${p.month}).`,
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
    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setPayroll((prev) => prev.map((p) => (p.id === id ? { ...p, ...enrichedUpdates } : p)));
    try {
      await setDoc(doc(db, "payroll", id), enrichedUpdates, { merge: true });
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
    setPayroll((prev) => prev.filter((p) => p.id !== id));
    try {
      await deleteDoc(doc(db, "payroll", id));
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
    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setDepartments((prev) => prev.map((d) => (d.id === id ? { ...d, ...enrichedUpdates } : d)));
    try {
      await setDoc(doc(db, "departments", id), enrichedUpdates, { merge: true });
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
    setDepartments((prev) => prev.filter((d) => d.id !== id));
    try {
      await deleteDoc(doc(db, "departments", id));
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

  // Authoritative Aggregate Computations via Single Source of Truth
  const totalIncome = calculateTotalIncome(transactions);
  const totalExpenses = calculateTotalExpenses(transactions);
  const netBalance = calculateNetOperatingResult(transactions);
  const actualCash = calculateActualCash(transactions);

  const budgetsWithSpent = budgets.map((b) => {
    const spent = calculateBudgetSpentForCategory(b, transactions);
    return { ...b, spent };
  });

  const totalLineBudgeted = calculateBudgetAllocation(budgets);
  const totalDeptBudgeted = calculateBudgetAllocation([], departments);
  const totalBudgeted = totalLineBudgeted > 0 ? totalLineBudgeted : totalDeptBudgeted;
  const totalBudgetSpent = calculateBudgetUsed(transactions, budgets);
  const totalBudgetRemaining = calculateBudgetRemaining(totalBudgeted, totalBudgetSpent);
  const budgetUtilization = totalBudgeted > 0 ? (totalBudgetSpent / totalBudgeted) * 100 : 0;
  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        budgets: budgetsWithSpent,
        payroll,
        departments,
        notifications,
        unreadNotificationCount,
        syncStatus,
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
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  return useContext(FinanceContext);
}
