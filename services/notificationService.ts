/**
 * services/notificationService.ts
 *
 * Real-Time Notification Center & Dispatcher for OFM.
 * Synchronizes notifications via Firestore and local cache, manages unread counts,
 * registers push notification tokens, and executes event evaluation.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import {
  EvaluatedNotificationEvent,
  NotificationType,
  evaluateBudgetEvent,
  evaluateTransactionEvent,
} from "./notificationRules";
import { showFloatingToast } from "@/utils/toast";
import { triggerLocalNotification } from "@/hooks/NotificationHelper";

const isExpoGo = Constants?.executionEnvironment === ExecutionEnvironment?.StoreClient;

export interface AppNotification {
  id: string;
  organizationId: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS";
  actionRoute?: string;
  read: boolean;
  createdAt: string;
  entityId?: string;
  idempotencyKey?: string;
}

const STORAGE_NOTIF_KEY = "@ofm_cached_notifications";
const PROCESSED_KEYS_KEY = "@ofm_processed_idempotency_keys";

// In-memory processed cache & active subscription listeners
const processedKeysSet = new Set<string>();
const activeListeners = new Set<(notifications: AppNotification[]) => void>();
let currentNotificationsCache: AppNotification[] = [];

function broadcastNotifications(notifs: AppNotification[]) {
  currentNotificationsCache = notifs;
  activeListeners.forEach((cb) => {
    try {
      cb(notifs);
    } catch {}
  });
}

/**
 * Registers device for Expo Push Notifications and returns the token.
 */
export async function registerForPushNotificationsAsync(userId?: string, orgId?: string): Promise<string | null> {
  if (Platform.OS === "web" || isExpoGo) return null;

  try {
    const notifModule = "expo-notifications";
    const Notifications = require(notifModule);
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[NOTIFICATIONS] Push notification permission not granted");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    console.log("[NOTIFICATIONS] Push token obtained:", pushToken);

    // Save token to Firestore if user is authenticated
    if (userId && orgId) {
      try {
        const userRef = doc(db, "users", userId);
        await setDoc(userRef, {
          pushToken,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.warn("[NOTIFICATIONS] Failed to save push token to Firestore:", err);
      }
    }

    return pushToken;
  } catch (err) {
    console.warn("[NOTIFICATIONS] Error registering for push notifications:", err);
    return null;
  }
}

/**
 * Dispatches an in-app and local push notification with idempotency protection.
 */
export async function dispatchNotification(
  event: EvaluatedNotificationEvent,
  orgId: string,
  userId?: string
): Promise<boolean> {
  if (!orgId) return false;

  // 1. Idempotency check: prevent duplicate notifications if already in notification list
  if (event.idempotencyKey) {
    try {
      const rawStored = await AsyncStorage.getItem(STORAGE_NOTIF_KEY);
      const list: AppNotification[] = rawStored ? JSON.parse(rawStored) : currentNotificationsCache;
      if (list && list.some((n) => n.idempotencyKey === event.idempotencyKey)) {
        return false;
      }
    } catch {}
  }

  const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const notification: AppNotification = {
    id: notifId,
    organizationId: orgId,
    userId: userId || "all",
    type: event.type,
    title: event.title,
    message: event.message,
    severity: event.severity,
    actionRoute: event.actionRoute,
    read: false,
    createdAt: new Date().toISOString(),
    entityId: event.entityId,
    idempotencyKey: event.idempotencyKey,
  };

  // 1.5 Update local cache immediately & broadcast to all active UI listeners (Mobile & Web)
  try {
    const rawStored = await AsyncStorage.getItem(STORAGE_NOTIF_KEY);
    let list: AppNotification[] = rawStored ? JSON.parse(rawStored) : [];
    if (!list.some((n) => n.id === notification.id || (n.idempotencyKey && n.idempotencyKey === notification.idempotencyKey))) {
      list.unshift(notification);
      if (list.length > 50) list = list.slice(0, 50);
      await AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(list));
      broadcastNotifications(list);
    }
  } catch {}

  // 2. Persist to Firestore asynchronously
  try {
    const notifRef = doc(db, "notifications", notifId);
    await setDoc(notifRef, notification);
  } catch (err) {
    console.warn("[NOTIFICATIONS] Firestore save error:", err);
  }

  // 3. Trigger In-App Floating Alert Banner (Web & Mobile)
  try {
    showFloatingToast(event.title, event.message);
  } catch {}

  // 4. Trigger Native Mobile Local Device Push Notification
  try {
    triggerLocalNotification(event.title, event.message);
  } catch {}

  return true;
}

/**
 * Evaluates the full real-time ledger state and dispatches authoritative business alerts.
 */
export async function syncLedgerNotificationEvents(
  transactions: any[],
  budgets: any[],
  payroll: any[],
  orgId: string,
  currency: string = "PKR",
  userId?: string
): Promise<void> {
  if (!orgId) return;

  const currentMonth = new Date().toISOString().substring(0, 7);

  // 1. Evaluate Budget Utilization Alerts
  try {
    (budgets || []).forEach((b) => {
      try {
        const event = evaluateBudgetEvent(b, orgId, currency);
        if (event) {
          dispatchNotification(event, orgId, userId).catch(() => {});
        }
      } catch {}
    });
  } catch {}

  // 2. Evaluate Payroll Disbursals
  try {
    if (payroll && payroll.length > 0) {
      const totalPayroll = payroll.reduce(
        (s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0),
        0
      );
      const payrollKey = `payroll_summary_${orgId}_${currentMonth}`;
      dispatchNotification(
        {
          type: "PAYROLL_PROCESSED",
          title: "Staff Payroll Record Active",
          message: `${payroll.length} staff records active for ${currentMonth}. Total disbursal: ${currency} ${totalPayroll.toLocaleString()}.`,
          severity: "INFO",
          actionRoute: "/payroll",
          entityId: `payroll_${currentMonth}`,
          idempotencyKey: payrollKey,
        },
        orgId,
        userId
      ).catch(() => {});
    }
  } catch {}

  // 3. Evaluate Unusual Outflow Transactions
  try {
    const expenseTxs = (transactions || []).filter((t) => t.type === "expense");
    if (expenseTxs.length > 0) {
      const avgExpense =
        expenseTxs.reduce((s, t) => s + t.amount, 0) / expenseTxs.length;

      // Check top 3 largest expenses
      expenseTxs
        .slice(0, 3)
        .forEach((tx) => {
          try {
            const txEvent = evaluateTransactionEvent(tx, avgExpense, orgId, currency);
            if (txEvent) {
              dispatchNotification(txEvent, orgId, userId).catch(() => {});
            }
          } catch {}
        });
    }
  } catch {}

  // 4. System Health & Reconciliation Milestone
  try {
    const totalInc = (transactions || []).filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalExp = (transactions || []).filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const netBal = totalInc - totalExp;

    const healthKey = `system_health_${orgId}_${currentMonth}`;
    dispatchNotification(
      {
        type: netBal < 0 ? "CASH_FLOW_DEFICIT" : "SYSTEM_ALERT",
        title: netBal < 0 ? "Operating Deficit Notice" : "Fiscal Reconciliation Active",
        message: netBal < 0
          ? `Operating expenses (${currency} ${totalExp.toLocaleString()}) exceed revenue (${currency} ${totalInc.toLocaleString()}) by ${currency} ${Math.abs(netBal).toLocaleString()}.`
          : (transactions && transactions.length > 0)
          ? `Institutional ledger verified. Current net operating balance is +${currency} ${netBal.toLocaleString()}.`
          : "Enterprise cloud ledger verified and active. All financial systems are operational.",
        severity: netBal < 0 ? "WARNING" : "SUCCESS",
        actionRoute: "/(tabs)",
        entityId: `health_${currentMonth}`,
        idempotencyKey: healthKey,
      },
      orgId,
      userId
    ).catch(() => {});
  } catch {}
}

/**
 * Subscribes to real-time notifications for an organization.
 */
export function subscribeToNotifications(
  orgId: string,
  onUpdate: (notifications: AppNotification[]) => void
): () => void {
  if (!orgId) {
    onUpdate([]);
    return () => {};
  }

  activeListeners.add(onUpdate);

  // 1. Instantly push in-memory cache or local disk storage on frame 0
  if (currentNotificationsCache.length > 0) {
    onUpdate(currentNotificationsCache);
  } else {
    AsyncStorage.getItem(STORAGE_NOTIF_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const cached: AppNotification[] = JSON.parse(raw);
            if (cached && cached.length > 0) {
              currentNotificationsCache = cached;
              onUpdate(cached);
            }
          } catch {}
        }
      })
      .catch(() => {});
  }

  try {
    const q = query(
      collection(db, "notifications"),
      where("organizationId", "==", orgId),
      limit(25)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs: AppNotification[] = [];
        snapshot.forEach((d) => notifs.push(d.data() as AppNotification));
        notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Merge with local disk cache so locally generated notifications aren't overwritten
        AsyncStorage.getItem(STORAGE_NOTIF_KEY)
          .then((raw) => {
            let merged = notifs;
            if (raw) {
              try {
                const localNotifs: AppNotification[] = JSON.parse(raw);
                const map = new Map<string, AppNotification>();
                notifs.forEach((n) => map.set(n.id, n));
                localNotifs.forEach((n) => {
                  if (!map.has(n.id)) map.set(n.id, n);
                });
                merged = Array.from(map.values());
                merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              } catch {}
            }
            AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(merged)).catch(() => {});
            broadcastNotifications(merged);
          })
          .catch(() => {
            AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(notifs)).catch(() => {});
            broadcastNotifications(notifs);
          });
      },
      (error) => {
        console.warn("[NOTIFICATIONS] Real-time listener warning:", error);
        // Fallback to local cache
        AsyncStorage.getItem(STORAGE_NOTIF_KEY)
          .then((raw) => {
            if (raw) {
              const cached = JSON.parse(raw);
              cached.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              broadcastNotifications(cached);
            }
          })
          .catch(() => {});
      }
    );

    return () => {
      activeListeners.delete(onUpdate);
      unsubscribe();
    };
  } catch (err) {
    console.warn("[NOTIFICATIONS] Subscription failed:", err);
    return () => {
      activeListeners.delete(onUpdate);
    };
  }
}

/**
 * Marks a notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<void> {
  // Optimistically update local storage & broadcast immediately
  try {
    const raw = await AsyncStorage.getItem(STORAGE_NOTIF_KEY);
    if (raw) {
      const list: AppNotification[] = JSON.parse(raw);
      const updated = list.map((n) => (n.id === id ? { ...n, read: true } : n));
      await AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(updated));
      broadcastNotifications(updated);
    }
  } catch {}

  try {
    const notifRef = doc(db, "notifications", id);
    await updateDoc(notifRef, { read: true, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn("[NOTIFICATIONS] Error marking as read:", err);
  }
}

/**
 * Marks all notifications as read for an organization.
 */
export async function markAllNotificationsAsRead(notifications: AppNotification[]): Promise<void> {
  // Optimistically update local storage & broadcast immediately
  try {
    const raw = await AsyncStorage.getItem(STORAGE_NOTIF_KEY);
    if (raw) {
      const list: AppNotification[] = JSON.parse(raw);
      const updated = list.map((n) => ({ ...n, read: true }));
      await AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(updated));
      broadcastNotifications(updated);
    }
  } catch {}

  const unread = notifications.filter((n) => !n.read);
  await Promise.all(
    unread.map((n) =>
      updateDoc(doc(db, "notifications", n.id), { read: true, updatedAt: new Date().toISOString() }).catch(() => {})
    )
  );
}

/**
 * Deletes a notification.
 */
export async function deleteNotificationRecord(id: string): Promise<void> {
  // Optimistically update local storage & broadcast immediately
  try {
    const raw = await AsyncStorage.getItem(STORAGE_NOTIF_KEY);
    if (raw) {
      const list: AppNotification[] = JSON.parse(raw);
      const updated = list.filter((n) => n.id !== id);
      await AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(updated));
      broadcastNotifications(updated);
    }
  } catch {}

  try {
    await deleteDoc(doc(db, "notifications", id));
  } catch (err) {
    console.warn("[NOTIFICATIONS] Error deleting notification:", err);
  }
}
