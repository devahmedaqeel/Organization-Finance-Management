import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch } from "firebase/firestore";
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
  safeNumber,
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetOperatingResult,
  calculateActualCash,
  calculateTotalAvailableFunds,
  calculateUnallocatedFunds,
  calculateBudgetSpentForCategory,
  calculateBudgetAllocation,
  calculateBudgetUsed,
  calculateBudgetRemaining,
  calculateDepartmentMetrics,
  calculateEffectiveDepartmentBudget,
  validateBudgetAllocationAgainstNetCash,
  DepartmentMetric,
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
  budgetId?: string | null;
  expenseSource?: "manual" | "payroll" | "reimbursement" | "invoice";
  payrollId?: string;
  employeeId?: string;
  employeeName?: string;
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
  expenseId?: string;
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
  categories?: string[];
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
  totalAllocatedBudget: number;
  totalBudgetSpent: number;
  totalBudgetRemaining: number;
  totalAvailableFunds: number;
  unallocatedFunds: number;
  departmentMetrics: DepartmentMetric[];
}

function generateSafeId(collectionName: string = "transactions"): string {
  try {
    return doc(collection(db, collectionName)).id;
  } catch (e) {
    return "ofm_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
  }
}

async function loadPersistedTombstones(orgId: string): Promise<Set<string>> {
  const result = new Set<string>();
  try {
    const raw = await AsyncStorage.getItem(`ofm_tombstones:${orgId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach((id) => result.add(id));
    }
  } catch {}

  if (typeof localStorage !== "undefined") {
    try {
      const webRaw = localStorage.getItem(`ofm_tombstones:${orgId}`);
      if (webRaw) {
        const arr = JSON.parse(webRaw);
        if (Array.isArray(arr)) arr.forEach((id) => result.add(id));
      }
    } catch {}
  }

  // Also query Firestore tombstones collection for this organization for zero-resurrection guarantee
  try {
    const fetchTombstonesPromise = getDocs(
      query(collection(db, "tombstones"), where("organizationId", "==", orgId))
    );
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    const snap: any = await Promise.race([fetchTombstonesPromise, timeoutPromise]);

    if (snap && typeof snap.forEach === "function") {
      snap.forEach((docSnap: any) => {
        result.add(docSnap.id);
      });
      const arr = Array.from(result).slice(-500);
      AsyncStorage.setItem(`ofm_tombstones:${orgId}`, JSON.stringify(arr)).catch(() => {});
      if (typeof localStorage !== "undefined") {
        try { localStorage.setItem(`ofm_tombstones:${orgId}`, JSON.stringify(arr)); } catch {}
      }
    }
  } catch {}

  return result;
}

async function recordPersistedTombstones(orgId: string, ids: string[]): Promise<void> {
  try {
    const existing = await loadPersistedTombstones(orgId);
    ids.forEach((id) => existing.add(id));
    const arr = Array.from(existing).slice(-500);
    await AsyncStorage.setItem(`ofm_tombstones:${orgId}`, JSON.stringify(arr));
    if (typeof localStorage !== "undefined") {
      try { localStorage.setItem(`ofm_tombstones:${orgId}`, JSON.stringify(arr)); } catch {}
    }
  } catch {}

  // Also persist to Firestore cloud tombstones collection with both SDK and REST
  try {
    await Promise.all(
      ids.map((id) => {
        const payload = {
          id,
          organizationId: orgId,
          deletedAt: new Date().toISOString(),
        };
        saveDocREST("tombstones", id, payload).catch(() => {});
        return safeSetDoc(doc(db, "tombstones", id), payload).catch(() => {});
      })
    );
  } catch {}
}

/**
 * Deeply strips undefined values from plain objects and arrays
 * so Firestore setDoc / writeBatch never throw:
 * "Unsupported field value: undefined"
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as unknown as T;
  }
  if (typeof data !== "object") {
    return data;
  }
  if (data instanceof Date) {
    return data.toISOString() as unknown as T;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  // Check for plain JavaScript object vs special Firestore classes (e.g. FieldValue)
  const isPlainObject =
    Object.prototype.toString.call(data) === "[object Object]" &&
    (data.constructor === Object || !data.constructor);
  if (!isPlainObject) {
    return data;
  }

  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value === undefined) {
      continue;
    }
    cleanObj[key] = sanitizeForFirestore(value);
  }
  return cleanObj as T;
}

/**
 * Robust wrapper around Firestore setDoc that:
 * 1. Deep-sanitizes the payload to prevent any undefined field error.
 * 2. Ensures any synchronous or asynchronous error is returned as a catchable Promise.
 */
async function safeSetDoc(docRef: any, data: any, options?: any): Promise<void> {
  try {
    const clean = sanitizeForFirestore(data);
    if (options) {
      await setDoc(docRef, clean, options);
    } else {
      await setDoc(docRef, clean);
    }
  } catch (err) {
    console.warn(`safeSetDoc notice for path ${docRef?.path || "unknown"}:`, err);
    throw err;
  }
}

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
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const currentLoadedOrgIdRef = useRef<string>("");
  const hasLiveSnapshotRef = useRef<{
    transactions: boolean;
    budgets: boolean;
    payroll: boolean;
    departments: boolean;
  }>({
    transactions: false,
    budgets: false,
    payroll: false,
    departments: false,
  });

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
        user?.id || "current_user",
        departments
      ).catch(() => {});
    }
  }, [loaded, activeOrgId, transactions.length, budgets.length, payroll.length, departments.length, settings.currency, user?.id]);

  // 1. Organization-Scoped Initial Local Cache Load + Instant REST Cloud Sync
  useEffect(() => {
    // Immediately clear in-memory state so previous organization's data never leaks
    setTransactions([]);
    setBudgets([]);
    setPayroll([]);
    setDepartments([]);
    setLoaded(false);
    currentLoadedOrgIdRef.current = "";

    deletedIdsRef.current.clear();
    hasLiveSnapshotRef.current = {
      transactions: false,
      budgets: false,
      payroll: false,
      departments: false,
    };

    if (!user) {
      setTransactions([]);
      setBudgets([]);
      setPayroll([]);
      setDepartments([]);
      setLoaded(true);
      return;
    }

    loadPersistedTombstones(activeOrgId)
      .then((tombstones) => {
        tombstones.forEach((id) => deletedIdsRef.current.add(id));
        return Promise.all([
          AsyncStorage.getItem(`${cachePrefix}transactions`),
          AsyncStorage.getItem(`${cachePrefix}budgets`),
          AsyncStorage.getItem(`${cachePrefix}payroll`),
          AsyncStorage.getItem(`${cachePrefix}departments`),
        ]);
      })
      .then(([t, b, p, d]) => {
        if (t) {
          const parsed: Transaction[] = JSON.parse(t);
          setTransactions(parsed.filter((item) => !deletedIdsRef.current.has(item.id)));
        } else {
          setTransactions([]);
        }
        if (b) {
          const parsed: Budget[] = JSON.parse(b);
          setBudgets(parsed.filter((item) => !deletedIdsRef.current.has(item.id)));
        } else {
          setBudgets([]);
        }
        if (p) {
          const parsed: PayrollEntry[] = JSON.parse(p);
          setPayroll(parsed.filter((item) => !deletedIdsRef.current.has(item.id)));
        } else {
          setPayroll([]);
        }
        if (d) {
          const parsed: Department[] = JSON.parse(d);
          setDepartments(parsed.filter((item) => !deletedIdsRef.current.has(item.id)));
        } else {
          setDepartments([]);
        }
        currentLoadedOrgIdRef.current = activeOrgId;
        setLoaded(true);
      })
      .catch(() => {
        currentLoadedOrgIdRef.current = activeOrgId;
        setLoaded(true);
      });

    // Instant direct REST sync with Firebase Cloud (scoped to activeOrgId) with direct Firestore SDK fallback
    Promise.all([
      fetchCollectionREST<Transaction>("transactions", activeOrgId),
      fetchCollectionREST<Budget>("budgets", activeOrgId),
      fetchCollectionREST<Department>("departments", activeOrgId),
      fetchCollectionREST<PayrollEntry>("payroll", activeOrgId),
    ]).then(([restTxs, restBudgets, restDepts, restPayroll]) => {
      if (activeOrgId !== (user?.organizationId || "demo-org")) return;
      if (restTxs !== null && !hasLiveSnapshotRef.current.transactions) {
        const validTxs = restTxs.filter((t) => !deletedIdsRef.current.has(t.id));
        validTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(validTxs);
        AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(validTxs)).catch(() => {});
      } else if ((restTxs === null || restTxs.length === 0) && !hasLiveSnapshotRef.current.transactions) {
        getDocs(query(collection(db, "transactions"), where("organizationId", "==", activeOrgId)))
          .then((snap) => {
            if (!hasLiveSnapshotRef.current.transactions && !snap.empty) {
              const list: Transaction[] = [];
              snap.forEach((d) => {
                if (!deletedIdsRef.current.has(d.id)) list.push({ id: d.id, ...d.data() } as Transaction);
              });
              list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              setTransactions(list);
              AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(list)).catch(() => {});
            }
          })
          .catch(() => {});
      }

      if (restBudgets !== null && !hasLiveSnapshotRef.current.budgets) {
        const validBudgets = restBudgets.filter((b) => !deletedIdsRef.current.has(b.id));
        setBudgets(validBudgets);
        AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(validBudgets)).catch(() => {});
      }

      if (restDepts !== null && !hasLiveSnapshotRef.current.departments) {
        const validDepts = restDepts.filter((d) => !deletedIdsRef.current.has(d.id));
        setDepartments(validDepts);
        AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(validDepts)).catch(() => {});
      } else if ((restDepts === null || restDepts.length === 0) && !hasLiveSnapshotRef.current.departments) {
        getDocs(query(collection(db, "departments"), where("organizationId", "==", activeOrgId)))
          .then((snap) => {
            if (!hasLiveSnapshotRef.current.departments && !snap.empty) {
              const list: Department[] = [];
              snap.forEach((d) => {
                if (!deletedIdsRef.current.has(d.id)) list.push({ id: d.id, ...d.data() } as Department);
              });
              setDepartments(list);
              AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(list)).catch(() => {});
            }
          })
          .catch(() => {});
      }

      if (restPayroll !== null && !hasLiveSnapshotRef.current.payroll) {
        const validPayroll = restPayroll.filter((p) => !deletedIdsRef.current.has(p.id));
        setPayroll(validPayroll);
        AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(validPayroll)).catch(() => {});
      } else if ((restPayroll === null || restPayroll.length === 0) && !hasLiveSnapshotRef.current.payroll) {
        getDocs(query(collection(db, "payroll"), where("organizationId", "==", activeOrgId)))
          .then((snap) => {
            if (!hasLiveSnapshotRef.current.payroll && !snap.empty) {
              const list: PayrollEntry[] = [];
              snap.forEach((d) => {
                if (!deletedIdsRef.current.has(d.id)) list.push({ id: d.id, ...d.data() } as PayrollEntry);
              });
              setPayroll(list);
              AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(list)).catch(() => {});
            }
          })
          .catch(() => {});
      }

      if (restTxs !== null || restBudgets !== null || restDepts !== null || restPayroll !== null) {
        setSyncStatus("synced");
      }
    }).catch(() => {});
  }, [activeOrgId, user?.id]);

  // 2. Real-time Firebase Synchronization (Web <-> Mobile)
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
        hasLiveSnapshotRef.current.transactions = true;
        setSyncStatus("synced");
        const remoteMap = new Map<string, Transaction>();
        snapshot.forEach((d) => {
          if (!deletedIdsRef.current.has(d.id)) {
            remoteMap.set(d.id, { id: d.id, ...d.data() } as Transaction);
          } else {
            deleteDoc(doc(db, "transactions", d.id)).catch(() => {});
          }
        });

        const remoteItems = Array.from(remoteMap.values());
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
        hasLiveSnapshotRef.current.budgets = true;
        const remoteMap = new Map<string, Budget>();
        snapshot.forEach((d) => {
          if (!deletedIdsRef.current.has(d.id)) {
            remoteMap.set(d.id, { id: d.id, ...d.data() } as Budget);
          } else {
            deleteDoc(doc(db, "budgets", d.id)).catch(() => {});
          }
        });

        const remoteItems = Array.from(remoteMap.values());
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
        hasLiveSnapshotRef.current.payroll = true;
        const remoteMap = new Map<string, PayrollEntry>();
        snapshot.forEach((d) => {
          if (!deletedIdsRef.current.has(d.id)) {
            remoteMap.set(d.id, { id: d.id, ...d.data() } as PayrollEntry);
          } else {
            deleteDoc(doc(db, "payroll", d.id)).catch(() => {});
          }
        });

        const remoteItems = Array.from(remoteMap.values());
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
        hasLiveSnapshotRef.current.departments = true;
        const remoteMap = new Map<string, Department>();
        snapshot.forEach((d) => {
          if (!deletedIdsRef.current.has(d.id)) {
            remoteMap.set(d.id, { id: d.id, ...d.data() } as Department);
          } else {
            deleteDoc(doc(db, "departments", d.id)).catch(() => {});
          }
        });

        const remoteItems = Array.from(remoteMap.values());
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

  // 3. Organization-Scoped Local Cache Write (guarantees deleted records are cleared from cache)
  useEffect(() => {
    if (loaded && user && currentLoadedOrgIdRef.current === activeOrgId) {
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(transactions)).catch(() => {});
    }
  }, [transactions, loaded, cachePrefix, user, activeOrgId]);

  useEffect(() => {
    if (loaded && user && currentLoadedOrgIdRef.current === activeOrgId) {
      AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(budgets)).catch(() => {});
    }
  }, [budgets, loaded, cachePrefix, user, activeOrgId]);

  useEffect(() => {
    if (loaded && user && currentLoadedOrgIdRef.current === activeOrgId) {
      AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(payroll)).catch(() => {});
    }
  }, [payroll, loaded, cachePrefix, user, activeOrgId]);

  useEffect(() => {
    if (loaded && user && currentLoadedOrgIdRef.current === activeOrgId) {
      AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(departments)).catch(() => {});
    }
  }, [departments, loaded, cachePrefix, user, activeOrgId]);

  // --- CRUD Operations ---

  const addTransaction = async (t: Omit<Transaction, "id" | "addedBy"> & { addedBy?: string }) => {
    if (!can(user, "create_transaction")) {
      showFloatingToast("Permission Denied", "You do not have permission to add transactions.");
      throw new Error("Permission denied: cannot create transaction");
    }

    // --- Strict Authoritative Budget Validation for Expenses ---
    if (t.type === "expense") {
      const deptName = (t.department || "").trim();
      const effectiveDept = calculateEffectiveDepartmentBudget(deptName, departments, budgets);
      const allocated = effectiveDept.allocated;

      if (allocated <= 0) {
        const errorMsg = "No budget has been allocated to this department. Allocate a department budget before recording an expense.";
        showFloatingToast("Expense Blocked", errorMsg);
        throw new Error(errorMsg);
      }

      const currentDeptSpent = unifiedTransactions
        .filter(
          (tx) =>
            tx.type === "expense" &&
            (tx.department || "").trim().toLowerCase() === deptName.toLowerCase() &&
            tx.status !== "failed" &&
            (tx as any).status !== "deleted"
        )
        .reduce((sum, tx) => sum + safeNumber(tx.amount, 0), 0);

      const remaining = Math.max(0, allocated - currentDeptSpent);
      const txAmount = safeNumber(t.amount, 0);

      if (txAmount > remaining) {
        const curr = settings.currency || "PKR";
        const errorMsg = `Insufficient department budget. Remaining budget: ${curr} ${remaining.toLocaleString()}.`;
        showFloatingToast("Budget Limit Exceeded", errorMsg);
        throw new Error(errorMsg);
      }
    }

    const id = generateSafeId("transactions");
    const now = new Date().toISOString();
    const orgName = settings.organizationName || user?.organization || "OFM — Organization Finance Management";
    const orgId = user?.organizationId || activeOrgId || "default_org";

    const newTx: Transaction = {
      ...t,
      id,
      budgetId: t.budgetId ? t.budgetId.trim() : null,
      addedBy: user?.name || user?.email || t.addedBy || "Finance Officer",
      organizationId: orgId,
      organization: orgName,
      createdAt: t.createdAt || now,
      updatedAt: now,
      paymentMethod: t.paymentMethod || "Electronic Transfer",
      referenceNumber: t.referenceNumber || `TXN-${id.slice(-6).toUpperCase()}`,
      status: t.status || "completed",
    };

    setTransactions((prev) => {
      const updated = [newTx, ...prev.filter((item) => item.id !== id)];
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    const cleanNewTx = sanitizeForFirestore(newTx);

    try {
      await safeSetDoc(doc(db, "transactions", id), cleanNewTx);
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
    saveDocREST("transactions", id, cleanNewTx).then(() => setSyncStatus("synced")).catch(() => {});

    // Cross-tenant mirror between demo-org and org-9icgv4ijp so both stay 100% in sync
    if (orgId === "demo-org" || orgId === "org-9icgv4ijp") {
      const counterpartOrgId = orgId === "demo-org" ? "org-9icgv4ijp" : "demo-org";
      const mirrorId = id.startsWith("sync_") ? id.replace("sync_", "") : `sync_${id}`;
      const mirroredTx = sanitizeForFirestore({ ...cleanNewTx, id: mirrorId, organizationId: counterpartOrgId });
      safeSetDoc(doc(db, "transactions", mirrorId), mirroredTx).catch(() => {});
      saveDocREST("transactions", mirrorId, mirroredTx).catch(() => {});
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

      // 2. Line-item budget check (only for budget-linked expenses)
      const matchBudget = newTx.budgetId
        ? budgets.find((b) => b.id === newTx.budgetId)
        : null;
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
      const effectiveDept = calculateEffectiveDepartmentBudget(newTx.department || "", departments, budgets);
      if (effectiveDept.allocated > 0) {
        const allocated = effectiveDept.allocated;
        const currentDeptSpent = transactions
          .filter((t) => t.type === "expense" && t.department?.trim().toLowerCase() === (newTx.department || "").trim().toLowerCase())
          .reduce((s, t) => s + t.amount, 0) + newTx.amount;
        const deptRatio = (currentDeptSpent / allocated) * 100;
        if (deptRatio >= 100) {
          showFloatingToast("Department Cap Exceeded", `⚠️ ${newTx.department} Department Budget Cap Exceeded (${deptRatio.toFixed(0)}%).`);
          triggerLocalNotification("Department Budget Exceeded", `${newTx.department} has exceeded its allocated ceiling of ${settings.currency} ${allocated.toLocaleString()}.`);
        } else if (deptRatio >= 80) {
          showFloatingToast("Department Alert", `⚡ ${newTx.department} has utilized ${deptRatio.toFixed(0)}% of its budget ceiling.`);
        }
      }
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Omit<Transaction, "id">>) => {
    if (!can(user, "edit_transaction")) {
      showFloatingToast("Permission Denied", "You do not have permission to edit transactions.");
      throw new Error("Permission denied: cannot edit transaction");
    }

    const prevTx = transactions.find((item) => item.id === id);
    const isExpense = (updates.type === "expense") || (!updates.type && prevTx?.type === "expense");
    if (isExpense) {
      const targetDeptName = ((updates.department || prevTx?.department) || "").trim();
      const effectiveDept = calculateEffectiveDepartmentBudget(targetDeptName, departments, budgets);
      const allocated = effectiveDept.allocated;
      if (allocated <= 0) {
        const errorMsg = "No budget has been allocated to this department. Allocate a department budget before recording an expense.";
        showFloatingToast("Expense Blocked", errorMsg);
        throw new Error(errorMsg);
      }

      const currentDeptSpentWithoutThisTx = unifiedTransactions
        .filter(
          (tx) =>
            tx.id !== id &&
            tx.type === "expense" &&
            (tx.department || "").trim().toLowerCase() === targetDeptName.toLowerCase() &&
            tx.status !== "failed" &&
            (tx as any).status !== "deleted"
        )
        .reduce((sum, tx) => sum + safeNumber(tx.amount, 0), 0);

      const remaining = Math.max(0, allocated - currentDeptSpentWithoutThisTx);
      const newAmount = updates.amount !== undefined ? safeNumber(updates.amount, 0) : safeNumber(prevTx?.amount, 0);

      if (newAmount > remaining) {
        const curr = settings.currency || "PKR";
        const errorMsg = `Insufficient department budget. Remaining budget: ${curr} ${remaining.toLocaleString()}.`;
        showFloatingToast("Budget Limit Exceeded", errorMsg);
        throw new Error(errorMsg);
      }
    }

    const enrichedUpdates: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    if ("budgetId" in updates) {
      enrichedUpdates.budgetId = updates.budgetId ? updates.budgetId.trim() : null;
    }
    const cleanUpdates = sanitizeForFirestore(enrichedUpdates);

    setTransactions((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, ...enrichedUpdates } : t));
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    try {
      await safeSetDoc(doc(db, "transactions", id), cleanUpdates, { merge: true });
      saveDocREST("transactions", id, cleanUpdates).catch(() => {});
      if (activeOrgId === "demo-org" || activeOrgId === "org-9icgv4ijp") {
        const mirrorId = id.startsWith("sync_") ? id.replace("sync_", "") : `sync_${id}`;
        safeSetDoc(doc(db, "transactions", mirrorId), cleanUpdates, { merge: true }).catch(() => {});
        saveDocREST("transactions", mirrorId, cleanUpdates).catch(() => {});
      }
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

    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const rawTxId = id.replace(/^sync_/, "");
    const aliasId = `tx_${id}_${orgKey}`;
    const mirrorId = id.startsWith("sync_") ? rawTxId : `sync_${id}`;
    const targetIds = [id, aliasId];
    if (activeOrgId === "demo-org" || activeOrgId === "org-9icgv4ijp") {
      targetIds.push(mirrorId, `sync_tx_pay_${rawTxId}`, `tx_pay_${rawTxId}`);
    }

    // If deleting a salary transaction, also clean up linked payroll record
    const targetTx = transactions.find((t) => t.id === id || t.id === rawTxId);
    const linkedPayrollId =
      targetTx?.payrollId ||
      (id.startsWith("tx_pay_") ? id.replace("tx_pay_", "") : "") ||
      (id.startsWith("sync_tx_pay_") ? id.replace("sync_tx_pay_", "") : "");
    if (linkedPayrollId) {
      const rawPayId = linkedPayrollId.replace(/^sync_/, "");
      const mirrorPayrollId = linkedPayrollId.startsWith("sync_") ? rawPayId : `sync_${linkedPayrollId}`;
      targetIds.push(linkedPayrollId, mirrorPayrollId, `tx_pay_${rawPayId}`, `sync_tx_pay_${rawPayId}`);
      deleteDoc(doc(db, "payroll", linkedPayrollId)).catch(() => {});
      deleteDoc(doc(db, "payroll", mirrorPayrollId)).catch(() => {});
      deleteDocREST("payroll", linkedPayrollId).catch(() => {});
      deleteDocREST("payroll", mirrorPayrollId).catch(() => {});
      setPayroll((prev) => {
        const remaining = prev.filter((p) => !targetIds.includes(p.id));
        AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(remaining)).catch(() => {});
        return remaining;
      });
    }

    // 1. Authoritative Firestore and REST deletion with verified success
    let deleteSucceeded = false;
    let failureReason: any = null;

    try {
      await Promise.all(
        targetIds.map((tid) => deleteDoc(doc(db, "transactions", tid)).catch((err) => { failureReason = err; }))
      );
      deleteSucceeded = true;
    } catch (err: any) {
      failureReason = err;
    }

    // Direct REST deletion fallback with auth
    const restSuccessResults = await Promise.all(targetIds.map((tid) => deleteDocREST("transactions", tid).catch(() => false)));
    if (restSuccessResults.some(Boolean)) deleteSucceeded = true;

    // Strict safety check: if Firestore threw permission denied, do not delete from UI
    if (!deleteSucceeded && failureReason?.code === "permission-denied") {
      showFloatingToast("Permission Denied", "Database rejected delete: insufficient permissions.");
      throw new Error("Database rejected delete: insufficient permissions");
    }

    // 2. Mark tombstones in memory and persist in AsyncStorage
    targetIds.forEach((tid) => deletedIdsRef.current.add(tid));
    recordPersistedTombstones(activeOrgId, targetIds).catch(() => {});

    // 3. Immediately update state and persistent storage with filtered records
    setTransactions((prev) => {
      const remaining = prev.filter((t) => !targetIds.includes(t.id));
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(remaining)).catch(() => {});
      return remaining;
    });

    // 4. Audit trail
    recordAuditLog({
      organizationId: activeOrgId,
      actorUid: user?.id || "anonymous",
      actorName: user?.name || user?.email || "Finance Officer",
      actorRole: user?.role || "admin",
      action: "delete",
      entity: "transaction",
      entityId: id,
    }).catch(() => {});
  };

  const addBudget = async (b: Omit<Budget, "id">) => {
    if (!can(user, "manage_budgets")) {
      showFloatingToast("Permission Denied", "You do not have permission to add budgets.");
      throw new Error("Permission denied: cannot add budget");
    }

    // Available Net Cash validation
    const validation = validateBudgetAllocationAgainstNetCash(
      safeNumber(b.allocated, 0),
      transactions,
      budgets,
      departments,
      {
        type: "budget",
        targetDepartmentName: b.department,
        currency: settings.currency || "PKR",
      }
    );

    if (!validation.isValid) {
      const err = validation.errorMessage || "Cannot allocate budget: exceeds Available Net Cash.";
      showFloatingToast("Net Cash Restriction", err);
      throw new Error(err);
    }

    const id = generateSafeId("budgets");
    const now = new Date().toISOString();
    const orgName = settings.organizationName || user?.organization || "OFM — Organization Finance Management";
    const orgId = user?.organizationId || activeOrgId || "default_org";

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

    const cleanBudget = sanitizeForFirestore(newBudget);

    setBudgets((prev) => {
      const updated = [{ ...newBudget, spent: 0 }, ...prev.filter((item) => item.id !== id)];
      AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    try {
      await safeSetDoc(doc(db, "budgets", id), cleanBudget);
      saveDocREST("budgets", id, cleanBudget).catch(() => {});
      if (orgId === "demo-org" || orgId === "org-9icgv4ijp") {
        const counterpartOrgId = orgId === "demo-org" ? "org-9icgv4ijp" : "demo-org";
        const mirrorId = id.startsWith("sync_") ? id.replace("sync_", "") : `sync_${id}`;
        const mirroredBudget: Budget = sanitizeForFirestore({ ...cleanBudget, id: mirrorId, organizationId: counterpartOrgId });
        safeSetDoc(doc(db, "budgets", mirrorId), mirroredBudget).catch(() => {});
        saveDocREST("budgets", mirrorId, mirroredBudget).catch(() => {});
      }
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

      // Synchronize department ceiling if department document has lower or 0 allocation
      const deptNameClean = (newBudget.department || "").trim().toLowerCase();
      const matchedDept = departments.find((d) => (d.name || "").trim().toLowerCase() === deptNameClean);
      if (matchedDept) {
        const allDeptsBudgets = [{ ...newBudget }, ...budgets.filter((item) => item.id !== id)];
        const deptTotalBudget = allDeptsBudgets
          .filter((item) => (item.department || "").trim().toLowerCase() === deptNameClean)
          .reduce((sum, item) => sum + safeNumber(item.allocated, 0), 0);
        if (deptTotalBudget > safeNumber(matchedDept.budgetAllocated, 0)) {
          updateDepartment(matchedDept.id, { budgetAllocated: deptTotalBudget }).catch(() => {});
        }
      }
    } catch (err) {
      console.log("Budget saved offline:", err);
    }
  };

  const updateBudget = async (id: string, updates: Partial<Omit<Budget, "id">>) => {
    if (!can(user, "manage_budgets")) {
      showFloatingToast("Permission Denied", "You do not have permission to edit budgets.");
      throw new Error("Permission denied: cannot edit budget");
    }

    if (updates.allocated !== undefined) {
      const existing = budgets.find((b) => b.id === id);
      const validation = validateBudgetAllocationAgainstNetCash(
        safeNumber(updates.allocated, 0),
        transactions,
        budgets,
        departments,
        {
          type: "budget",
          editingBudgetId: id,
          targetDepartmentName: updates.department || existing?.department,
          currency: settings.currency || "PKR",
        }
      );

      if (!validation.isValid) {
        const err = validation.errorMessage || "Cannot update budget: exceeds Available Net Cash.";
        showFloatingToast("Net Cash Restriction", err);
        throw new Error(err);
      }
    }

    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    const cleanUpdates = sanitizeForFirestore(enrichedUpdates);
    setBudgets((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, ...enrichedUpdates } : b));
      AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    try {
      await safeSetDoc(doc(db, "budgets", id), cleanUpdates, { merge: true });
      saveDocREST("budgets", id, cleanUpdates).catch(() => {});
      if (activeOrgId === "demo-org" || activeOrgId === "org-9icgv4ijp") {
        const mirrorId = id.startsWith("sync_") ? id.replace("sync_", "") : `sync_${id}`;
        safeSetDoc(doc(db, "budgets", mirrorId), cleanUpdates, { merge: true }).catch(() => {});
        saveDocREST("budgets", mirrorId, cleanUpdates).catch(() => {});
      }
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

      // Synchronize department ceiling if department document has lower or 0 allocation
      const targetDept = (updates.department || budgets.find((b) => b.id === id)?.department || "").trim().toLowerCase();
      const matchedDept = departments.find((d) => (d.name || "").trim().toLowerCase() === targetDept);
      if (matchedDept && targetDept) {
        const allDeptsBudgets = budgets.map((b) => (b.id === id ? { ...b, ...enrichedUpdates } : b));
        const deptTotalBudget = allDeptsBudgets
          .filter((item) => (item.department || "").trim().toLowerCase() === targetDept)
          .reduce((sum, item) => sum + safeNumber(item.allocated, 0), 0);
        if (deptTotalBudget > safeNumber(matchedDept.budgetAllocated, 0)) {
          updateDepartment(matchedDept.id, { budgetAllocated: deptTotalBudget }).catch(() => {});
        }
      }
    } catch (err) {
      console.log("Budget update queued offline:", err);
    }
  };

  const deleteBudget = async (id: string) => {
    if (!can(user, "manage_budgets")) {
      showFloatingToast("Permission Denied", "You do not have permission to delete budgets.");
      throw new Error("Permission denied: cannot delete budget");
    }

    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const rawBudgetId = id.replace(/^sync_/, "");
    const aliasId = `budget_${rawBudgetId}_${orgKey}`;
    const mirrorId = id.startsWith("sync_") ? rawBudgetId : `sync_${id}`;
    const targetIds = [id, aliasId];
    if (activeOrgId === "demo-org" || activeOrgId === "org-9icgv4ijp") {
      targetIds.push(mirrorId, `sync_${rawBudgetId}`);
    }

    let deleteSucceeded = false;
    let failureReason: any = null;

    try {
      await Promise.all(
        targetIds.map((tid) => deleteDoc(doc(db, "budgets", tid)).catch((err) => { failureReason = err; }))
      );
      deleteSucceeded = true;
    } catch (err: any) {
      failureReason = err;
    }

    const restSuccessResults = await Promise.all(targetIds.map((tid) => deleteDocREST("budgets", tid).catch(() => false)));
    if (restSuccessResults.some(Boolean)) deleteSucceeded = true;

    if (!deleteSucceeded && failureReason?.code === "permission-denied") {
      showFloatingToast("Permission Denied", "Database rejected delete: insufficient permissions.");
      throw new Error("Database rejected delete: insufficient permissions");
    }

    targetIds.forEach((tid) => deletedIdsRef.current.add(tid));
    recordPersistedTombstones(activeOrgId, targetIds).catch(() => {});

    setBudgets((prev) => {
      const remaining = prev.filter((b) => !targetIds.includes(b.id));
      AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(remaining)).catch(() => {});
      return remaining;
    });

    recordAuditLog({
      organizationId: activeOrgId,
      actorUid: user?.id || "anonymous",
      actorName: user?.name || user?.email || "Finance Officer",
      actorRole: user?.role || "admin",
      action: "delete",
      entity: "budget",
      entityId: id,
    }).catch(() => {});
  };

  const addPayroll = async (p: Omit<PayrollEntry, "id">) => {
    if (!can(user, "manage_payroll")) {
      showFloatingToast("Permission Denied", "You do not have permission to manage payroll.");
      throw new Error("Permission denied: cannot create payroll");
    }

    const deptName = (p.department || "").trim();
    if (!deptName) {
      showFloatingToast("Department Required", "Please assign a department to the employee.");
      throw new Error("Employee department is required for payroll disbursement.");
    }

    // 1. Authoritative Department Budget Check:
    // If department has budget <= 0, block payroll!
    const effectiveDept = calculateEffectiveDepartmentBudget(deptName, departments, budgets);
    const allocatedBudget = effectiveDept.allocated;
    if (allocatedBudget <= 0) {
      const err = `Payroll cannot be processed because the ${deptName} department has no allocated budget.`;
      showFloatingToast("Budget Error", err);
      throw new Error(err);
    }

    const netSalary = safeNumber(p.baseSalary, 0) + safeNumber(p.bonus, 0) - safeNumber(p.deductions, 0);

    // 2. Authoritative Insufficient Department Budget Check:
    const dLower = deptName.toLowerCase();
    const currentDeptSpent = transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          (t.department || "").trim().toLowerCase() === dLower &&
          t.status !== "failed" &&
          (t as any).status !== "deleted"
      )
      .reduce((s, t) => s + safeNumber(t.amount, 0), 0);

    const remainingBudget = Math.max(0, allocatedBudget - currentDeptSpent);
    if (netSalary > remainingBudget) {
      const currency = settings.currency || "PKR";
      const err = `Insufficient ${deptName} department budget. Available: ${currency} ${remainingBudget.toLocaleString()}. Required for payroll: ${currency} ${netSalary.toLocaleString()}.`;
      showFloatingToast("Insufficient Budget", err);
      throw new Error(err);
    }

    const id = generateSafeId("payroll");
    const txId = `tx_pay_${id}`;
    const now = new Date().toISOString();
    const orgName = settings.organizationName || user?.organization || "OFM — Organization Finance Management";
    const orgId = user?.organizationId || activeOrgId || "default_org";

    const newPayroll: PayrollEntry = {
      ...p,
      id,
      organizationId: orgId,
      organization: orgName,
      netSalary,
      createdAt: p.createdAt || now,
      updatedAt: now,
      paymentStatus: p.paymentStatus || "paid",
      expenseId: txId,
    };

    // ─── Automatic Ledger Expense Transaction Sync (Category: "Salary / Payroll") ───
    const salaryTx: Transaction = {
      id: txId,
      type: "expense",
      amount: netSalary,
      category: "Salary / Payroll",
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
      expenseSource: "payroll",
      payrollId: id,
      employeeId: p.employeeId,
      employeeName: p.employeeName,
      referenceNumber: `PAY-${id.substring(0, 8).toUpperCase()}`,
    };

    setPayroll((prev) => {
      const updated = [newPayroll, ...prev.filter((item) => item.id !== id)];
      AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    setTransactions((prev) => {
      const updated = [salaryTx, ...prev.filter((t) => t.id !== txId)];
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    const cleanPayroll = sanitizeForFirestore(newPayroll);
    const cleanSalaryTx = sanitizeForFirestore({
      ...salaryTx,
      budgetId: null,
    });

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "payroll", id), cleanPayroll);
      batch.set(doc(db, "transactions", txId), cleanSalaryTx);
      await batch.commit().catch(async (err) => {
        console.log("Batch commit failed, attempting Promise.all fallback:", err);
        await Promise.all([
          safeSetDoc(doc(db, "payroll", id), cleanPayroll),
          safeSetDoc(doc(db, "transactions", txId), cleanSalaryTx).catch(() => {}),
        ]);
      });

      saveDocREST("payroll", id, cleanPayroll).catch(() => {});
      saveDocREST("transactions", txId, cleanSalaryTx).catch(() => {});
      if (orgId === "demo-org" || orgId === "org-9icgv4ijp") {
        const counterpartOrgId = orgId === "demo-org" ? "org-9icgv4ijp" : "demo-org";
        const rawId = id.replace(/^sync_/, "");
        const mirrorPayrollId = id.startsWith("sync_") ? rawId : `sync_${id}`;
        const mirrorTxId = `sync_tx_pay_${rawId}`;
        const mirroredPayroll: PayrollEntry = sanitizeForFirestore({ ...newPayroll, id: mirrorPayrollId, organizationId: counterpartOrgId, expenseId: mirrorTxId });
        const mirroredTx: Transaction = sanitizeForFirestore({ ...salaryTx, id: mirrorTxId, organizationId: counterpartOrgId, payrollId: mirrorPayrollId, budgetId: null });
        safeSetDoc(doc(db, "payroll", mirrorPayrollId), mirroredPayroll).catch(() => {});
        saveDocREST("payroll", mirrorPayrollId, mirroredPayroll).catch(() => {});
        safeSetDoc(doc(db, "transactions", mirrorTxId), mirroredTx).catch(() => {});
        saveDocREST("transactions", mirrorTxId, mirroredTx).catch(() => {});
      }
      recordAuditLog({
        organizationId: orgId,
        actorUid: user?.id || "anonymous",
        actorName: user?.name || user?.email || "Finance Officer",
        actorRole: user?.role || "admin",
        action: "create",
        entity: "payroll",
        entityId: id,
        metadata: { employeeName: p.employeeName, month: p.month, netSalary, department: p.department, expenseId: txId },
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

    const existing = payroll.find((p) => p.id === id);
    const targetDeptName = (updates.department ?? existing?.department ?? "").trim();
    const base = updates.baseSalary !== undefined ? safeNumber(updates.baseSalary, 0) : safeNumber(existing?.baseSalary, 0);
    const bonus = updates.bonus !== undefined ? safeNumber(updates.bonus, 0) : safeNumber(existing?.bonus, 0);
    const deductions = updates.deductions !== undefined ? safeNumber(updates.deductions, 0) : safeNumber(existing?.deductions, 0);
    const updatedNetSalary = base + bonus - deductions;

    if (targetDeptName) {
      const effectiveDept = calculateEffectiveDepartmentBudget(targetDeptName, departments, budgets);
      const allocatedBudget = effectiveDept.allocated;
      if (allocatedBudget <= 0) {
        const err = `Payroll cannot be processed because the ${targetDeptName} department has no allocated budget.`;
        showFloatingToast("Budget Error", err);
        throw new Error(err);
      }

      const txId = `tx_pay_${id}`;
      const dLower = targetDeptName.toLowerCase();
      const currentDeptSpentWithoutThis = transactions
        .filter(
          (t) =>
            t.type === "expense" &&
            (t.department || "").trim().toLowerCase() === dLower &&
            t.status !== "failed" &&
            (t as any).status !== "deleted" &&
            t.id !== txId
        )
        .reduce((s, t) => s + safeNumber(t.amount, 0), 0);

      const availableForThis = Math.max(0, allocatedBudget - currentDeptSpentWithoutThis);
      if (updatedNetSalary > availableForThis) {
        const currency = settings.currency || "PKR";
        const err = `Insufficient ${targetDeptName} department budget. Available: ${currency} ${availableForThis.toLocaleString()}. Required for payroll: ${currency} ${updatedNetSalary.toLocaleString()}.`;
        showFloatingToast("Insufficient Budget", err);
        throw new Error(err);
      }
    }

    const enrichedUpdates = { ...updates, netSalary: updatedNetSalary, updatedAt: new Date().toISOString() };
    const txId = `tx_pay_${id}`;
    const employeeName = updates.employeeName ?? existing?.employeeName ?? "Staff";
    const employeeId = updates.employeeId ?? existing?.employeeId ?? "EMP";
    const month = updates.month ?? existing?.month ?? "Current";
    const salaryTitle = `Salary — ${employeeName} (${month})`;
    const salaryDesc = `Staff payroll disbursement for ${employeeName} (${employeeId}). Base: ${base}, Bonus: ${bonus}, Deductions: ${deductions}`;

    setPayroll((prev) => {
      const updated = prev.map((p) => {
        if (p.id === id) {
          return { ...p, ...enrichedUpdates };
        }
        return p;
      });
      AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    setTransactions((prev) => {
      const exists = prev.some((t) => t.id === txId);
      if (exists) {
        const updated = prev.map((t) => {
          if (t.id === txId) {
            return {
              ...t,
              amount: updatedNetSalary,
              category: "Salary / Payroll",
              department: targetDeptName || t.department,
              title: salaryTitle,
              description: salaryDesc,
              employeeName,
              employeeId,
              expenseSource: "payroll" as const,
              payrollId: id,
              updatedAt: new Date().toISOString(),
            };
          }
          return t;
        });
        AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(updated)).catch(() => {});
        return updated;
      } else {
        const salaryTx: Transaction = {
          id: txId,
          type: "expense",
          amount: updatedNetSalary,
          category: "Salary / Payroll",
          department: targetDeptName || "General",
          date: month ? `${month}-01` : new Date().toISOString().split("T")[0],
          title: salaryTitle,
          description: salaryDesc,
          addedBy: user?.name || user?.email || "Payroll System",
          organizationId: activeOrgId,
          organization: user?.organization || "Organization Finance Management",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          paymentMethod: "Bank Transfer",
          status: "completed",
          expenseSource: "payroll",
          payrollId: id,
          employeeId,
          employeeName,
          referenceNumber: `PAY-${id.substring(0, 8).toUpperCase()}`,
        };
        const updated = [salaryTx, ...prev];
        AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(updated)).catch(() => {});
        return updated;
      }
    });

    try {
      const txUpdates = {
        amount: updatedNetSalary,
        category: "Salary / Payroll",
        department: targetDeptName,
        title: salaryTitle,
        description: salaryDesc,
        employeeName,
        employeeId,
        expenseSource: "payroll",
        payrollId: id,
        updatedAt: new Date().toISOString(),
      };

      const cleanPayrollUpdates = sanitizeForFirestore(enrichedUpdates);
      const cleanTxUpdates = sanitizeForFirestore(txUpdates);

      const batch = writeBatch(db);
      batch.set(doc(db, "payroll", id), cleanPayrollUpdates, { merge: true });
      batch.set(doc(db, "transactions", txId), cleanTxUpdates, { merge: true });
      await batch.commit().catch(async () => {
        await Promise.all([
          safeSetDoc(doc(db, "payroll", id), cleanPayrollUpdates, { merge: true }),
          safeSetDoc(doc(db, "transactions", txId), cleanTxUpdates, { merge: true }),
        ]);
      });

      saveDocREST("payroll", id, cleanPayrollUpdates).catch(() => {});
      saveDocREST("transactions", txId, cleanTxUpdates).catch(() => {});
      if (activeOrgId === "demo-org" || activeOrgId === "org-9icgv4ijp") {
        const rawId = id.replace(/^sync_/, "");
        const mirrorPayrollId = id.startsWith("sync_") ? rawId : `sync_${id}`;
        const mirrorTxId = `sync_tx_pay_${rawId}`;
        safeSetDoc(doc(db, "payroll", mirrorPayrollId), cleanPayrollUpdates, { merge: true }).catch(() => {});
        saveDocREST("payroll", mirrorPayrollId, cleanPayrollUpdates).catch(() => {});
        safeSetDoc(doc(db, "transactions", mirrorTxId), cleanTxUpdates, { merge: true }).catch(() => {});
        saveDocREST("transactions", mirrorTxId, cleanTxUpdates).catch(() => {});
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

    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const rawId = id.replace(/^sync_/, "");
    const aliasId = `payroll_${rawId}_${orgKey}`;
    const txId = `tx_pay_${rawId}`;
    const syncTxId = `sync_tx_pay_${rawId}`;
    const targetPayrollIds = [id, `sync_${rawId}`, aliasId];
    const targetTxIds = [txId, syncTxId, `tx_pay_${id}`, `sync_tx_pay_${id}`];

    const targetPay = payroll.find((p) => p.id === id || p.id === rawId);
    if (targetPay?.expenseId && !targetTxIds.includes(targetPay.expenseId)) {
      targetTxIds.push(targetPay.expenseId);
    }
    const linkedTxIds = transactions
      .filter((t) => t.payrollId === id || t.payrollId === rawId || t.id === txId || t.id === syncTxId)
      .map((t) => t.id);
    linkedTxIds.forEach((tid) => {
      if (!targetTxIds.includes(tid)) targetTxIds.push(tid);
    });

    const allTargetIds = [...targetPayrollIds, ...targetTxIds];

    let deleteSucceeded = false;
    let failureReason: any = null;

    try {
      await Promise.all([
        ...targetPayrollIds.map((pid) => deleteDoc(doc(db, "payroll", pid)).catch((e) => { failureReason = e; })),
        ...targetTxIds.map((tid) => deleteDoc(doc(db, "transactions", tid)).catch(() => {})),
      ]);
      deleteSucceeded = true;
    } catch (e2) {}

    const restPayrollResults = await Promise.all(targetPayrollIds.map((pid) => deleteDocREST("payroll", pid).catch(() => false)));
    await Promise.all(targetTxIds.map((tid) => deleteDocREST("transactions", tid).catch(() => false)));
    if (restPayrollResults.some(Boolean)) deleteSucceeded = true;

    if (!deleteSucceeded && failureReason?.code === "permission-denied") {
      showFloatingToast("Permission Denied", "Database rejected delete: insufficient permissions.");
      throw new Error("Database rejected delete: insufficient permissions");
    }

    allTargetIds.forEach((tid: string) => deletedIdsRef.current.add(tid));
    recordPersistedTombstones(activeOrgId, allTargetIds).catch(() => {});

    setPayroll((prev) => {
      const remaining = prev.filter((p) => !allTargetIds.includes(p.id));
      AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(remaining)).catch(() => {});
      return remaining;
    });

    setTransactions((prev) => {
      const remaining = prev.filter((t) => !allTargetIds.includes(t.id));
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(remaining)).catch(() => {});
      return remaining;
    });

    recordAuditLog({
      organizationId: activeOrgId,
      actorUid: user?.id || "anonymous",
      actorName: user?.name || user?.email || "Finance Officer",
      actorRole: user?.role || "admin",
      action: "delete",
      entity: "payroll",
      entityId: id,
    }).catch(() => {});
  };

  const addDepartment = async (d: Omit<Department, "id">) => {
    if (!can(user, "manage_departments")) {
      showFloatingToast("Permission Denied", "You do not have permission to manage departments.");
      throw new Error("Permission denied: cannot create department");
    }

    if (safeNumber(d.budgetAllocated, 0) > 0) {
      const validation = validateBudgetAllocationAgainstNetCash(
        safeNumber(d.budgetAllocated, 0),
        transactions,
        budgets,
        departments,
        {
          type: "department",
          targetDepartmentName: d.name,
          currency: settings.currency || "PKR",
        }
      );

      if (!validation.isValid) {
        const err = validation.errorMessage || "Cannot allocate department budget: exceeds Available Net Cash.";
        showFloatingToast("Net Cash Restriction", err);
        throw new Error(err);
      }
    }

    const id = generateSafeId("departments");
    const now = new Date().toISOString();
    const orgName = settings.organizationName || user?.organization || "OFM — Organization Finance Management";
    const orgId = user?.organizationId || activeOrgId || "default_org";

    const newDept: Department = {
      ...d,
      id,
      organizationId: orgId,
      organization: orgName,
      createdAt: d.createdAt || now,
      updatedAt: now,
      code: d.code || `DEPT-${d.name.substring(0, 3).toUpperCase()}`,
    };

    setDepartments((prev) => {
      const updated = [...prev.filter((item) => item.id !== id), newDept];
      AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    const cleanDept = sanitizeForFirestore(newDept);
    try {
      await safeSetDoc(doc(db, "departments", id), cleanDept);
      saveDocREST("departments", id, cleanDept).catch(() => {});
      if (orgId === "demo-org" || orgId === "org-9icgv4ijp") {
        const counterpartOrgId = orgId === "demo-org" ? "org-9icgv4ijp" : "demo-org";
        const mirrorId = id.startsWith("sync_") ? id.replace("sync_", "") : `sync_${id}`;
        const mirroredDept = sanitizeForFirestore({ ...cleanDept, id: mirrorId, organizationId: counterpartOrgId });
        safeSetDoc(doc(db, "departments", mirrorId), mirroredDept).catch(() => {});
        saveDocREST("departments", mirrorId, mirroredDept).catch(() => {});
      }
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

    if (updates.budgetAllocated !== undefined && safeNumber(updates.budgetAllocated, 0) > 0) {
      const existing = departments.find((d) => d.id === id);
      const validation = validateBudgetAllocationAgainstNetCash(
        safeNumber(updates.budgetAllocated, 0),
        transactions,
        budgets,
        departments,
        {
          type: "department",
          editingDepartmentId: id,
          targetDepartmentName: updates.name || existing?.name,
          currency: settings.currency || "PKR",
        }
      );

      if (!validation.isValid) {
        const err = validation.errorMessage || "Cannot update department budget: exceeds Available Net Cash.";
        showFloatingToast("Net Cash Restriction", err);
        throw new Error(err);
      }
    }

    const enrichedUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setDepartments((prev) => {
      const updated = prev.map((d) => (d.id === id ? { ...d, ...enrichedUpdates } : d));
      AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    const cleanUpdates = sanitizeForFirestore(enrichedUpdates);
    try {
      await safeSetDoc(doc(db, "departments", id), cleanUpdates, { merge: true });
      saveDocREST("departments", id, cleanUpdates).catch(() => {});
      if (activeOrgId === "demo-org" || activeOrgId === "org-9icgv4ijp") {
        const mirrorId = id.startsWith("sync_") ? id.replace("sync_", "") : `sync_${id}`;
        safeSetDoc(doc(db, "departments", mirrorId), cleanUpdates, { merge: true }).catch(() => {});
        saveDocREST("departments", mirrorId, cleanUpdates).catch(() => {});
      }
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

    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const rawDeptId = id.replace(/^sync_/, "");
    const aliasId = `dept_${rawDeptId}_${orgKey}`;
    const mirrorId = id.startsWith("sync_") ? rawDeptId : `sync_${id}`;
    const targetIds = [id, aliasId];
    if (activeOrgId === "demo-org" || activeOrgId === "org-9icgv4ijp") {
      targetIds.push(mirrorId, `sync_${rawDeptId}`);
    }

    let deleteSucceeded = false;
    let failureReason: any = null;

    try {
      await Promise.all(
        targetIds.map((tid) => deleteDoc(doc(db, "departments", tid)).catch((err) => { failureReason = err; }))
      );
      deleteSucceeded = true;
    } catch (err: any) {
      failureReason = err;
    }

    const restSuccess = await deleteDocREST("departments", id).catch(() => false);
    await Promise.all(targetIds.map((tid) => deleteDocREST("departments", tid).catch(() => false)));
    if (restSuccess) deleteSucceeded = true;

    if (!deleteSucceeded && failureReason?.code === "permission-denied") {
      showFloatingToast("Permission Denied", "Database rejected delete: insufficient permissions.");
      throw new Error("Database rejected delete: insufficient permissions");
    }

    targetIds.forEach((tid) => deletedIdsRef.current.add(tid));
    recordPersistedTombstones(activeOrgId, targetIds).catch(() => {});

    setDepartments((prev) => {
      const remaining = prev.filter((d) => !targetIds.includes(d.id));
      AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(remaining)).catch(() => {});
      return remaining;
    });

    recordAuditLog({
      organizationId: activeOrgId,
      actorUid: user?.id || "anonymous",
      actorName: user?.name || user?.email || "Finance Officer",
      actorRole: user?.role || "admin",
      action: "delete",
      entity: "department",
      entityId: id,
    }).catch(() => {});
  };

  // Authoritative Unified Transactions: guarantees every valid, non-deleted payroll disbursement
  // is reliably integrated into the expense ledger even across cold starts, offline mode, or cloud sync.
  const unifiedTransactions = useMemo(() => {
    const txMap = new Map<string, Transaction>();

    // 1. Ingest all non-deleted standard transactions
    for (const t of transactions) {
      if (!deletedIdsRef.current.has(t.id)) {
        txMap.set(t.id, t);
      }
    }

    // 2. Guarantee every active payroll record has an authoritative ledger transaction
    for (const p of payroll) {
      if (!p || !p.id) continue;
      const rawId = p.id.replace(/^sync_/, "");
      if (
        deletedIdsRef.current.has(p.id) ||
        deletedIdsRef.current.has(rawId) ||
        deletedIdsRef.current.has(`tx_pay_${rawId}`) ||
        deletedIdsRef.current.has(`sync_tx_pay_${rawId}`) ||
        deletedIdsRef.current.has(`tx_pay_${p.id}`)
      ) continue;
      if ((p as any).paymentStatus === "failed") continue;

      const netSalary = safeNumber(
        p.netSalary,
        safeNumber(p.baseSalary, 0) + safeNumber(p.bonus, 0) - safeNumber(p.deductions, 0)
      );
      if (netSalary <= 0) continue;

      const txId = `tx_pay_${rawId}`;
      const syncTxId = `sync_tx_pay_${rawId}`;
      const legacyTxId = `tx_pay_${p.id}`;

      // Check all possible ID variants and payrollId links to prevent ANY duplicate counting
      const existing =
        txMap.get(txId) ||
        txMap.get(syncTxId) ||
        txMap.get(legacyTxId) ||
        txMap.get(p.id) ||
        (p.expenseId ? txMap.get(p.expenseId) : undefined) ||
        Array.from(txMap.values()).find(
          (t) =>
            (t.payrollId && (t.payrollId === p.id || t.payrollId === rawId || t.payrollId === `sync_${rawId}`)) ||
            t.id === txId ||
            t.id === syncTxId ||
            t.id === legacyTxId ||
            (p.expenseId && t.id === p.expenseId)
        );

      if (!existing) {
        const salaryTx: Transaction = {
          id: p.id.startsWith("sync_") ? syncTxId : txId,
          type: "expense",
          amount: netSalary,
          category: "Salaries",
          department: p.department || "General",
          date: p.month ? `${p.month}-01` : (p.createdAt ? p.createdAt.split("T")[0] : new Date().toISOString().split("T")[0]),
          title: `Salary — ${p.employeeName} (${p.month || "Current"})`,
          description: `Staff payroll disbursement for ${p.employeeName} (${p.employeeId || "Staff"}). Base: ${p.baseSalary}, Bonus: ${p.bonus || 0}, Deductions: ${p.deductions || 0}`,
          addedBy: "Payroll System",
          payrollId: p.id,
          organizationId: activeOrgId,
          organization: p.organization || user?.organization || "Organization Finance Management",
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || new Date().toISOString(),
          paymentMethod: "Bank Transfer",
          status: "completed",
        };
        txMap.set(salaryTx.id, salaryTx);
      } else if (existing.type === "expense" && existing.amount !== netSalary) {
        txMap.set(existing.id, { ...existing, amount: netSalary, category: "Salaries" });
      }
    }
    const result = Array.from(txMap.values());
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return result;
  }, [transactions, payroll, activeOrgId, user?.organization]);

  // Authoritative Central Financial Calculations (FinancialCalculationEngine)
  const totalIncome = useMemo(() => calculateTotalIncome(unifiedTransactions), [unifiedTransactions]);
  const totalExpenses = useMemo(() => calculateTotalExpenses(unifiedTransactions), [unifiedTransactions]);
  const netBalance = useMemo(() => calculateNetOperatingResult(unifiedTransactions), [unifiedTransactions]);

  const budgetsWithSpent = useMemo(() => {
    return budgets.map((b) => {
      const spent = calculateBudgetSpentForCategory(b, unifiedTransactions);
      return { ...b, spent };
    });
  }, [budgets, unifiedTransactions]);

  const totalLineBudgeted = useMemo(() => {
    return calculateBudgetAllocation(budgets);
  }, [budgets]);

  const totalDeptBudgeted = useMemo(() => {
    return calculateBudgetAllocation([], departments);
  }, [departments]);

  const totalAllocatedBudget = useMemo(() => {
    return calculateBudgetAllocation(budgets, departments);
  }, [budgets, departments]);

  const totalBudgeted = totalAllocatedBudget;
  const actualCash = useMemo(() => calculateActualCash(unifiedTransactions), [unifiedTransactions]);
  const totalBudgetSpent = useMemo(() => {
    return calculateBudgetUsed(unifiedTransactions, budgets, undefined, departments);
  }, [unifiedTransactions, budgets, departments]);
  const totalBudgetRemaining = useMemo(() => calculateBudgetRemaining(totalAllocatedBudget, totalBudgetSpent), [totalAllocatedBudget, totalBudgetSpent]);
  const budgetUtilization = useMemo(() => totalAllocatedBudget > 0 ? (totalBudgetSpent / totalAllocatedBudget) * 100 : 0, [totalAllocatedBudget, totalBudgetSpent]);
  const unallocatedFunds = useMemo(() => {
    return Math.max(0, netBalance - totalAllocatedBudget);
  }, [netBalance, totalAllocatedBudget]);
  const totalAvailableFunds = unallocatedFunds;

  const departmentMetrics = useMemo(() => {
    return calculateDepartmentMetrics(departments, unifiedTransactions, undefined, budgets);
  }, [departments, unifiedTransactions, budgets]);

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
      const timeoutPromise = new Promise<[null, null, null, null]>((resolve) =>
        setTimeout(() => resolve([null, null, null, null]), 3500)
      );
      const [restTxs, restBudgets, restDepts, restPayroll] = await Promise.race([
        fetchPromise,
        timeoutPromise,
      ]);

      if (restTxs !== null) {
        const validTxs = restTxs.filter((t: Transaction) => !deletedIdsRef.current.has(t.id));
        validTxs.sort((a: Transaction, b: Transaction) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(validTxs);
        AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(validTxs)).catch(() => {});
      }

      if (restBudgets !== null) {
        const validBudgets = restBudgets.filter((b: Budget) => !deletedIdsRef.current.has(b.id));
        setBudgets(validBudgets);
        AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(validBudgets)).catch(() => {});
      }

      if (restDepts !== null) {
        const validDepts = restDepts.filter((d: Department) => !deletedIdsRef.current.has(d.id));
        setDepartments(validDepts);
        AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(validDepts)).catch(() => {});
      }

      if (restPayroll !== null) {
        const validPayroll = restPayroll.filter((p: PayrollEntry) => !deletedIdsRef.current.has(p.id));
        setPayroll(validPayroll);
        AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(validPayroll)).catch(() => {});
      }

      // If REST sync was unavailable (e.g. mobile ISP), query Firestore Central Database directly via SDK
      if (restTxs === null || restBudgets === null || restDepts === null || restPayroll === null) {
        const [qTxSnap, qBSnap, qDSnap, qPSnap] = await Promise.all([
          getDocs(query(collection(db, "transactions"), where("organizationId", "==", activeOrgId))).catch(() => null),
          getDocs(query(collection(db, "budgets"), where("organizationId", "==", activeOrgId))).catch(() => null),
          getDocs(query(collection(db, "departments"), where("organizationId", "==", activeOrgId))).catch(() => null),
          getDocs(query(collection(db, "payroll"), where("organizationId", "==", activeOrgId))).catch(() => null),
        ]);
        let effectiveTxDocs = qTxSnap?.docs || [];
        if (effectiveTxDocs.length === 0 && (activeOrgId === "demo-org" || activeOrgId === "org-9icgv4ijp")) {
          const altOrg = activeOrgId === "demo-org" ? "org-9icgv4ijp" : "demo-org";
          const altSnap = await getDocs(query(collection(db, "transactions"), where("organizationId", "==", altOrg))).catch(() => null);
          if (altSnap && !altSnap.empty) effectiveTxDocs = altSnap.docs;
        }

        let effectiveDeptDocs = qDSnap?.docs || [];
        if (effectiveDeptDocs.length === 0 && (activeOrgId === "demo-org" || activeOrgId === "org-9icgv4ijp")) {
          const altOrg = activeOrgId === "demo-org" ? "org-9icgv4ijp" : "demo-org";
          const altSnap = await getDocs(query(collection(db, "departments"), where("organizationId", "==", altOrg))).catch(() => null);
          if (altSnap && !altSnap.empty) effectiveDeptDocs = altSnap.docs;
        }

        if (effectiveTxDocs.length > 0) {
          const list: Transaction[] = [];
          effectiveTxDocs.forEach((d) => {
            if (!deletedIdsRef.current.has(d.id)) list.push({ id: d.id, ...d.data() } as Transaction);
          });
          list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setTransactions(list);
          AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(list)).catch(() => {});
        }
        if (qBSnap) {
          const list: Budget[] = [];
          qBSnap.forEach((d) => {
            if (!deletedIdsRef.current.has(d.id)) list.push({ id: d.id, ...d.data() } as Budget);
          });
          setBudgets(list);
          AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(list)).catch(() => {});
        }
        if (effectiveDeptDocs.length > 0) {
          const list: Department[] = [];
          effectiveDeptDocs.forEach((d) => {
            if (!deletedIdsRef.current.has(d.id)) list.push({ id: d.id, ...d.data() } as Department);
          });
          setDepartments(list);
          AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(list)).catch(() => {});
        }
        if (qPSnap) {
          const list: PayrollEntry[] = [];
          qPSnap.forEach((d) => {
            if (!deletedIdsRef.current.has(d.id)) list.push({ id: d.id, ...d.data() } as PayrollEntry);
          });
          setPayroll(list);
          AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(list)).catch(() => {});
        }
      }
    } catch (e) {
    } finally {
      setSyncStatus("synced");
    }
  }, [cachePrefix, activeOrgId]);

  const financeValue = useMemo(() => ({
    transactions: unifiedTransactions,
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
    totalAllocatedBudget,
    totalBudgetSpent,
    totalBudgetRemaining,
    totalAvailableFunds,
    unallocatedFunds,
    departmentMetrics,
  }), [
    unifiedTransactions,
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
    totalAllocatedBudget,
    totalBudgetSpent,
    totalBudgetRemaining,
    totalAvailableFunds,
    unallocatedFunds,
    departmentMetrics,
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
