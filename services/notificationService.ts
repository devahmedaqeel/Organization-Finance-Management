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
import { EvaluatedNotificationEvent, NotificationType } from "./notificationRules";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

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

// In-memory processed cache
const processedKeysSet = new Set<string>();

/**
 * Configure default notification handler for foreground notifications.
 */
if (Platform.OS !== "web" && !isExpoGo) {
  try {
    const Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Ignored in unsupported environments
  }
}

/**
 * Registers device for Expo Push Notifications and returns the token.
 */
export async function registerForPushNotificationsAsync(userId?: string, orgId?: string): Promise<string | null> {
  if (Platform.OS === "web" || isExpoGo) return null;

  try {
    const Notifications = require("expo-notifications");
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
    if (userId && orgId && pushToken) {
      try {
        const tokenRef = doc(db, "push_tokens", `${userId}_${Platform.OS}`);
        await setDoc(tokenRef, {
          userId,
          organizationId: orgId,
          pushToken,
          platform: Platform.OS,
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

  // 1. Idempotency check: prevent duplicate notifications
  if (event.idempotencyKey) {
    if (processedKeysSet.has(event.idempotencyKey)) {
      return false;
    }
    // Check local storage for persistent idempotency
    try {
      const rawStored = await AsyncStorage.getItem(PROCESSED_KEYS_KEY);
      const storedKeys: string[] = rawStored ? JSON.parse(rawStored) : [];
      if (storedKeys.includes(event.idempotencyKey)) {
        processedKeysSet.add(event.idempotencyKey);
        return false;
      }
      storedKeys.push(event.idempotencyKey);
      if (storedKeys.length > 200) storedKeys.shift(); // keep max 200 recent keys
      await AsyncStorage.setItem(PROCESSED_KEYS_KEY, JSON.stringify(storedKeys));
      processedKeysSet.add(event.idempotencyKey);
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

  // 2. Persist to Firestore
  try {
    const notifRef = doc(db, "notifications", notifId);
    await setDoc(notifRef, notification);
  } catch (err) {
    console.warn("[NOTIFICATIONS] Firestore save error:", err);
  }

  // 3. Trigger Local Device Push Notification
  if (Platform.OS !== "web") {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: event.title,
          body: event.message,
          data: { route: event.actionRoute, id: notifId },
          sound: true,
        },
        trigger: null, // trigger immediately
      });
    } catch (pushErr) {
      console.warn("[NOTIFICATIONS] Local push error:", pushErr);
    }
  }

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
  budgets.forEach((b) => {
    const event = evaluateBudgetEvent(b, orgId, currency);
    if (event) {
      dispatchNotification(event, orgId, userId).catch(() => {});
    }
  });

  // 2. Evaluate Payroll Disbursals
  if (payroll.length > 0) {
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

  // 3. Evaluate Unusual Outflow Transactions
  const expenseTxs = transactions.filter((t) => t.type === "expense");
  if (expenseTxs.length > 0) {
    const avgExpense =
      expenseTxs.reduce((s, t) => s + t.amount, 0) / expenseTxs.length;

    // Check top 3 largest expenses
    expenseTxs
      .slice(0, 3)
      .forEach((tx) => {
        const txEvent = evaluateTransactionEvent(tx, avgExpense, orgId, currency);
        if (txEvent) {
          dispatchNotification(txEvent, orgId, userId).catch(() => {});
        }
      });
  }

  // 4. System Health & Reconciliation Milestone
  const totalInc = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExp = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const netBal = totalInc - totalExp;

  if (transactions.length > 0) {
    const healthKey = `system_health_${orgId}_${currentMonth}`;
    dispatchNotification(
      {
        type: netBal < 0 ? "CASH_FLOW_DEFICIT" : "SYSTEM_ALERT",
        title: netBal < 0 ? "Operating Deficit Notice" : "Fiscal Reconciliation Active",
        message: netBal < 0
          ? `Operating expenses (${currency} ${totalExp.toLocaleString()}) exceed revenue (${currency} ${totalInc.toLocaleString()}) by ${currency} ${Math.abs(netBal).toLocaleString()}.`
          : `Institutional ledger verified. Current net operating balance is +${currency} ${netBal.toLocaleString()}.`,
        severity: netBal < 0 ? "WARNING" : "SUCCESS",
        actionRoute: "/(tabs)",
        entityId: `health_${currentMonth}`,
        idempotencyKey: healthKey,
      },
      orgId,
      userId
    ).catch(() => {});
  }
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
        // Sort descending by creation date
        notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(notifs)).catch(() => {});
        onUpdate(notifs);
      },
      (error) => {
        console.warn("[NOTIFICATIONS] Real-time listener warning:", error);
        // Fallback to local cache
        AsyncStorage.getItem(STORAGE_NOTIF_KEY)
          .then((raw) => {
            if (raw) {
              const cached = JSON.parse(raw);
              cached.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              onUpdate(cached);
            }
          })
          .catch(() => {});
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn("[NOTIFICATIONS] Subscription failed:", err);
    return () => {};
  }
}

/**
 * Marks a notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<void> {
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
  try {
    await deleteDoc(doc(db, "notifications", id));
  } catch (err) {
    console.warn("[NOTIFICATIONS] Error deleting notification:", err);
  }
}
