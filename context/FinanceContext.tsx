import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocs } from "firebase/firestore";
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
  budgetId?: string | null;
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
  totalAvailableFunds: number;
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

  // Also query Firestore tombstones collection for this organization for zero-resurrection guarantee
  try {
    const snap = await getDocs(query(collection(db, "tombstones"), where("organizationId", "==", orgId)));
    snap.forEach((docSnap: any) => {
      result.add(docSnap.id);
    });
  } catch {}

  return result;
}

async function recordPersistedTombstones(orgId: string, ids: string[]): Promise<void> {
  try {
    const existing = await loadPersistedTombstones(orgId);
    ids.forEach((id) => existing.add(id));
    const arr = Array.from(existing).slice(-500);
    await AsyncStorage.setItem(`ofm_tombstones:${orgId}`, JSON.stringify(arr));
  } catch {}

  // Also persist to Firestore cloud tombstones collection
  try {
    await Promise.all(
      ids.map((id) =>
        setDoc(doc(db, "tombstones", id), {
          id,
          organizationId: orgId,
          deletedAt: new Date().toISOString(),
        }).catch(() => {})
      )
    );
  } catch {}
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
        }
        if (b) {
          const parsed: Budget[] = JSON.parse(b);
          setBudgets(parsed.filter((item) => !deletedIdsRef.current.has(item.id)));
        }
        if (p) {
          const parsed: PayrollEntry[] = JSON.parse(p);
          setPayroll(parsed.filter((item) => !deletedIdsRef.current.has(item.id)));
        }
        if (d) {
          const parsed: Department[] = JSON.parse(d);
          setDepartments(parsed.filter((item) => !deletedIdsRef.current.has(item.id)));
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });

    // Instant direct REST sync with Firebase Cloud (scoped to activeOrgId)
    Promise.all([
      fetchCollectionREST<Transaction>("transactions", activeOrgId),
      fetchCollectionREST<Budget>("budgets", activeOrgId),
      fetchCollectionREST<Department>("departments", activeOrgId),
      fetchCollectionREST<PayrollEntry>("payroll", activeOrgId),
    ]).then(([restTxs, restBudgets, restDepts, restPayroll]) => {
      if (restTxs !== null) {
        const validTxs = restTxs.filter((t) => !deletedIdsRef.current.has(t.id));
        validTxs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(validTxs);
        AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(validTxs)).catch(() => {});
      }

      if (restBudgets !== null) {
        const validBudgets = restBudgets.filter((b) => !deletedIdsRef.current.has(b.id));
        setBudgets(validBudgets);
        AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(validBudgets)).catch(() => {});
      }

      if (restDepts !== null) {
        const validDepts = restDepts.filter((d) => !deletedIdsRef.current.has(d.id));
        setDepartments(validDepts);
        AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(validDepts)).catch(() => {});
      }

      if (restPayroll !== null) {
        const validPayroll = restPayroll.filter((p) => !deletedIdsRef.current.has(p.id));
        setPayroll(validPayroll);
        AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(validPayroll)).catch(() => {});
      }

      if (restTxs !== null || restBudgets !== null || restDepts !== null || restPayroll !== null) {
        setSyncStatus("synced");
      }
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
          } else {
            deleteDoc(doc(db, "transactions", d.id)).catch(() => {});
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
          } else {
            deleteDoc(doc(db, "budgets", d.id)).catch(() => {});
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
          } else {
            deleteDoc(doc(db, "payroll", d.id)).catch(() => {});
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
          } else {
            deleteDoc(doc(db, "departments", d.id)).catch(() => {});
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

  // 3. Organization-Scoped Local Cache Write (guarded against writing empty arrays over non-deleted cache on mount)
  useEffect(() => {
    if (loaded && user && transactions.length > 0) {
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(transactions)).catch(() => {});
    }
  }, [transactions, loaded, cachePrefix, user]);

  useEffect(() => {
    if (loaded && user && budgets.length > 0) {
      AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(budgets)).catch(() => {});
    }
  }, [budgets, loaded, cachePrefix, user]);

  useEffect(() => {
    if (loaded && user && payroll.length > 0) {
      AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(payroll)).catch(() => {});
    }
  }, [payroll, loaded, cachePrefix, user]);

  useEffect(() => {
    if (loaded && user && departments.length > 0) {
      AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(departments)).catch(() => {});
    }
  }, [departments, loaded, cachePrefix, user]);

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

    setTransactions((prev) => {
      const updated = [newTx, ...prev.filter((item) => item.id !== id)];
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

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
    setTransactions((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, ...enrichedUpdates } : t));
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
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

    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const aliasId = `tx_${id}_${orgKey}`;
    const targetIds = [id, aliasId];

    // If deleting a salary transaction, also clean up linked payroll record
    if (id.startsWith("tx_pay_")) {
      const payId = id.replace("tx_pay_", "");
      targetIds.push(payId);
      deleteDoc(doc(db, "payroll", payId)).catch(() => {});
      deleteDocREST("payroll", payId).catch(() => {});
      setPayroll((prev) => {
        const remaining = prev.filter((p) => p.id !== payId);
        AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(remaining)).catch(() => {});
        return remaining;
      });
    }

    // 1. Authoritative Firestore and REST deletion with verified success
    let deleteSucceeded = false;
    let failureReason: any = null;

    try {
      await Promise.all([
        deleteDoc(doc(db, "transactions", id)).catch((err) => { failureReason = err; }),
        deleteDoc(doc(db, "transactions", aliasId)).catch(() => {}),
      ]);
      deleteSucceeded = true;
    } catch (err: any) {
      failureReason = err;
    }

    // Direct REST deletion fallback with auth
    const restSuccess = await deleteDocREST("transactions", id).catch(() => false);
    await deleteDocREST("transactions", aliasId).catch(() => false);
    if (restSuccess) deleteSucceeded = true;

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

    setBudgets((prev) => {
      const updated = [{ ...newBudget, spent: 0 }, ...prev.filter((item) => item.id !== id)];
      AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
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
    setBudgets((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, ...enrichedUpdates } : b));
      AsyncStorage.setItem(`${cachePrefix}budgets`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
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

    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const aliasId = `budget_${id}_${orgKey}`;
    const targetIds = [id, aliasId];

    let deleteSucceeded = false;
    let failureReason: any = null;

    try {
      await Promise.all([
        deleteDoc(doc(db, "budgets", id)).catch((err) => { failureReason = err; }),
        deleteDoc(doc(db, "budgets", aliasId)).catch(() => {}),
      ]);
      deleteSucceeded = true;
    } catch (err: any) {
      failureReason = err;
    }

    const restSuccess = await deleteDocREST("budgets", id).catch(() => false);
    await deleteDocREST("budgets", aliasId).catch(() => false);
    if (restSuccess) deleteSucceeded = true;

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

    const id = generateSafeId("payroll");
    const now = new Date().toISOString();
    const orgName = user?.organization || "OFM — Organization Finance Management";
    const orgId = activeOrgId;
    const netSalary = safeNumber(p.baseSalary, 0) + safeNumber(p.bonus, 0) - safeNumber(p.deductions, 0);

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

    setPayroll((prev) => {
      const updated = [newPayroll, ...prev.filter((item) => item.id !== id)];
      AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

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

    setTransactions((prev) => {
      const updated = [salaryTx, ...prev.filter((t) => t.id !== txId)];
      AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    try {
      await Promise.all([
        setDoc(doc(db, "payroll", id), newPayroll),
        setDoc(doc(db, "transactions", txId), salaryTx).catch(() => {}),
      ]);
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

    setPayroll((prev) => {
      const updated = prev.map((p) => {
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
      });
      AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    // Also update linked transaction in transactions list
    const txId = `tx_pay_${id}`;
    const salaryTitle = updates.employeeName ? `Salary — ${updates.employeeName} (${updates.month || "Current"})` : undefined;
    const salaryDesc = updates.employeeName ? `Staff payroll disbursement for ${updates.employeeName} (${updates.employeeId || "Staff"})` : undefined;

    setTransactions((prev) => {
      const exists = prev.some((t) => t.id === txId);
      if (exists) {
        const updated = prev.map((t) => {
          if (t.id === txId) {
            return {
              ...t,
              amount: updatedNetSalary ?? t.amount,
              department: updates.department ?? t.department,
              title: salaryTitle ?? t.title,
              description: salaryDesc ?? t.description,
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
          amount: updatedNetSalary || 0,
          category: "Salaries",
          department: updates.department || "General",
          date: updates.month ? `${updates.month}-01` : new Date().toISOString().split("T")[0],
          title: salaryTitle || `Salary — Staff (${updates.month || "Current"})`,
          description: salaryDesc || "Staff payroll disbursement",
          addedBy: user?.name || user?.email || "Payroll System",
          organizationId: activeOrgId,
          organization: user?.organization || "Organization Finance Management",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          paymentMethod: "Bank Transfer",
          status: "completed",
        };
        const updated = [salaryTx, ...prev];
        AsyncStorage.setItem(`${cachePrefix}transactions`, JSON.stringify(updated)).catch(() => {});
        return updated;
      }
    });

    try {
      await setDoc(doc(db, "payroll", id), enrichedUpdates, { merge: true });
      saveDocREST("payroll", id, enrichedUpdates).catch(() => {});
      if (updatedNetSalary !== undefined || updates.department || updates.employeeName) {
        const txUpdates = {
          amount: updatedNetSalary,
          department: updates.department,
          title: salaryTitle,
          description: salaryDesc,
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

    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const aliasId = `payroll_${id}_${orgKey}`;
    const txId = `tx_pay_${id}`;
    const targetIds = [id, aliasId, txId];

    let deleteSucceeded = false;
    let failureReason: any = null;

    try {
      await Promise.all([
        deleteDoc(doc(db, "payroll", id)).catch((err) => { failureReason = err; }),
        deleteDoc(doc(db, "payroll", aliasId)).catch(() => {}),
        deleteDoc(doc(db, "transactions", txId)).catch(() => {}),
      ]);
      deleteSucceeded = true;
    } catch (err: any) {
      failureReason = err;
    }

    const restSuccess = await deleteDocREST("payroll", id).catch(() => false);
    await deleteDocREST("payroll", aliasId).catch(() => false);
    await deleteDocREST("transactions", txId).catch(() => false);
    if (restSuccess) deleteSucceeded = true;

    if (!deleteSucceeded && failureReason?.code === "permission-denied") {
      showFloatingToast("Permission Denied", "Database rejected delete: insufficient permissions.");
      throw new Error("Database rejected delete: insufficient permissions");
    }

    targetIds.forEach((tid) => deletedIdsRef.current.add(tid));
    recordPersistedTombstones(activeOrgId, targetIds).catch(() => {});

    setPayroll((prev) => {
      const remaining = prev.filter((p) => p.id !== id && p.id !== aliasId);
      AsyncStorage.setItem(`${cachePrefix}payroll`, JSON.stringify(remaining)).catch(() => {});
      return remaining;
    });

    setTransactions((prev) => {
      const remaining = prev.filter((t) => t.id !== txId);
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

    setDepartments((prev) => {
      const updated = [...prev.filter((item) => item.id !== id), newDept];
      AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
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
    setDepartments((prev) => {
      const updated = prev.map((d) => (d.id === id ? { ...d, ...enrichedUpdates } : d));
      AsyncStorage.setItem(`${cachePrefix}departments`, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
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

    const orgKey = (user?.organizationId || "demo-org").replace(/[^a-zA-Z0-9]/g, "_");
    const aliasId = `dept_${id}_${orgKey}`;
    const targetIds = [id, aliasId];

    let deleteSucceeded = false;
    let failureReason: any = null;

    try {
      await Promise.all([
        deleteDoc(doc(db, "departments", id)).catch((err) => { failureReason = err; }),
        deleteDoc(doc(db, "departments", aliasId)).catch(() => {}),
      ]);
      deleteSucceeded = true;
    } catch (err: any) {
      failureReason = err;
    }

    const restSuccess = await deleteDocREST("departments", id).catch(() => false);
    await deleteDocREST("departments", aliasId).catch(() => false);
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
      if (deletedIdsRef.current.has(p.id) || deletedIdsRef.current.has(`tx_pay_${p.id}`)) continue;
      if ((p as any).paymentStatus === "failed") continue;

      const netSalary = safeNumber(
        p.netSalary,
        safeNumber(p.baseSalary, 0) + safeNumber(p.bonus, 0) - safeNumber(p.deductions, 0)
      );
      if (netSalary <= 0) continue;

      const txId = `tx_pay_${p.id}`;
      const existing = txMap.get(txId) || txMap.get(p.id);

      if (!existing) {
        const salaryTx: Transaction = {
          id: txId,
          type: "expense",
          amount: netSalary,
          category: "Salaries",
          department: p.department || "General",
          date: p.month ? `${p.month}-01` : (p.createdAt ? p.createdAt.split("T")[0] : new Date().toISOString().split("T")[0]),
          title: `Salary — ${p.employeeName} (${p.month || "Current"})`,
          description: `Staff payroll disbursement for ${p.employeeName} (${p.employeeId || "Staff"}). Base: ${p.baseSalary}, Bonus: ${p.bonus || 0}, Deductions: ${p.deductions || 0}`,
          addedBy: "Payroll System",
          organizationId: activeOrgId,
          organization: p.organization || user?.organization || "Organization Finance Management",
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || new Date().toISOString(),
          paymentMethod: "Bank Transfer",
          status: "completed",
        };
        txMap.set(txId, salaryTx);
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

  const totalBudgeted = totalLineBudgeted;
  const actualCash = useMemo(() => calculateActualCash(unifiedTransactions), [unifiedTransactions]);
  const totalBudgetSpent = useMemo(() => {
    return calculateBudgetUsed(unifiedTransactions, budgets);
  }, [unifiedTransactions, budgets]);
  const totalBudgetRemaining = useMemo(() => calculateBudgetRemaining(totalBudgeted, totalBudgetSpent), [totalBudgeted, totalBudgetSpent]);
  const budgetUtilization = useMemo(() => totalBudgeted > 0 ? (totalBudgetSpent / totalBudgeted) * 100 : 0, [totalBudgeted, totalBudgetSpent]);
  const totalAvailableFunds = useMemo(() => {
    return calculateTotalAvailableFunds(totalIncome, totalBudgeted, totalExpenses);
  }, [totalIncome, totalBudgeted, totalExpenses]);
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
    totalBudgetSpent,
    totalBudgetRemaining,
    totalAvailableFunds,
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
    totalBudgetSpent,
    totalBudgetRemaining,
    totalAvailableFunds,
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
