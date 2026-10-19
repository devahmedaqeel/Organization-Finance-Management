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
  arrayUnion,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import {
  EvaluatedNotificationEvent,
  NotificationType,
  evaluateBudgetEvent,
  evaluateTransactionEvent,
} from "./notificationRules";
import { generateFinancialInsights } from "./financialInsightsService";
import { getPresetPeriod } from "./DatePeriodService";
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
  /** Members who have read this notification (read state is per person, not shared) */
  readBy?: string[];
  /** Members who removed it from their own list (it stays for everyone else) */
  hiddenFor?: string[];
}

/** Newest notifications kept in each member's list */
const MAX_NOTIFICATIONS = 50;

const STORAGE_NOTIF_KEY = "@ofm_cached_notifications";
const PROCESSED_KEYS_KEY = "@ofm_processed_idempotency_keys";

// In-memory processed cache & active subscription listeners
const processedKeysSet = new Set<string>();
const activeListeners = new Set<(notifications: AppNotification[]) => void>();
let currentNotificationsCache: AppNotification[] = [];
// Signed-in member, used for per-person read / hide state
let currentNotifUserId: string | null = null;

/** Stable document id for an event, so every member's device writes the SAME notification (no duplicates). */
function notificationDocId(idempotencyKey?: string): string {
  if (!idempotencyKey) return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return `notif_k_${idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 300)}`;
}

/** Applies this member's own read / hidden state to the shared organization notifications. */
function personalize(list: AppNotification[]): AppNotification[] {
  const uid = currentNotifUserId;
  return list
    .filter((n) => !(uid && n.hiddenFor?.includes(uid)))
    .map((n) => ({
      ...n,
      // Older records only had a shared `read` flag; keep honouring it when no per-person list exists
      read: uid && Array.isArray(n.readBy) ? n.readBy.includes(uid) : n.read === true,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_NOTIFICATIONS);
}

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

  const notifId = notificationDocId(event.idempotencyKey);

  // 1.2 Another member's device may already have created this exact event: then don't create it again
  if (event.idempotencyKey) {
    try {
      const existing = await getDoc(doc(db, "notifications", notifId));
      if (existing.exists()) return false;
    } catch {}
  }

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
    readBy: [],
    hiddenFor: [],
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
      if (list.length > MAX_NOTIFICATIONS) list = list.slice(0, MAX_NOTIFICATIONS);
      await AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(list));
      broadcastNotifications(personalize(list));
    }
  } catch {}

  // 2. Persist to Firestore asynchronously
  try {
    const notifRef = doc(db, "notifications", notifId);
    const cleanNotification: Record<string, any> = {};
    for (const [k, v] of Object.entries(notification)) {
      if (v !== undefined) cleanNotification[k] = v;
    }
    await setDoc(notifRef, cleanNotification);
  } catch (err: any) {
    console.log("[NOTIFICATIONS] Firestore save note:", err?.message || err);
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
  userId?: string,
  departments?: any[]
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

  // 5. Evaluate AI Insights Recommendations & Actionable Advisories
  try {
    const currentPeriod = getPresetPeriod("this_month");
    const aiInsights = generateFinancialInsights(
      transactions || [],
      budgets || [],
      payroll || [],
      departments || [],
      currentPeriod,
      undefined,
      currency,
      orgId
    );

    (aiInsights || []).forEach((insight) => {
      // Dispatch actionable recommendations and alerts
      if (insight.isActionable || insight.severity === "CRITICAL" || insight.severity === "WARNING") {
        const aiNotifKey = `ai_insight_${orgId}_${insight.id}`;
        dispatchNotification(
          {
            type: insight.severity === "CRITICAL" ? "BUDGET_CRITICAL" : insight.severity === "WARNING" ? "BUDGET_WARNING" : "SYSTEM_ALERT",
            title: `AI Recommendation: ${insight.title}`,
            message: `${insight.summary} Action: ${insight.recommendedAction}`,
            severity: insight.severity === "CRITICAL" ? "CRITICAL" : insight.severity === "WARNING" ? "WARNING" : "INFO",
            actionRoute: insight.actionRoute || "/ai-insights",
            entityId: insight.id,
            idempotencyKey: aiNotifKey,
          },
          orgId,
          userId
        ).catch(() => {});
      }
    });
  } catch (err) {
    console.warn("[NOTIFICATIONS] AI Insights notification evaluation warning:", err);
  }
}

/**
 * Subscribes to real-time notifications for an organization. Every member (web and mobile, any role)
 * receives the organization's notifications; read / hidden state is kept per member via `userId`.
 */
export function subscribeToNotifications(
  orgId: string,
  onUpdate: (notifications: AppNotification[]) => void,
  userId?: string
): () => void {
  if (!orgId) {
    onUpdate([]);
    return () => {};
  }

  currentNotifUserId = userId || null;
  activeListeners.add(onUpdate);

  // 1. Instantly push in-memory cache or local disk storage on frame 0
  if (currentNotificationsCache.length > 0) {
    onUpdate(personalize(currentNotificationsCache));
  } else {
    AsyncStorage.getItem(STORAGE_NOTIF_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const cached: AppNotification[] = JSON.parse(raw);
            if (cached && cached.length > 0) {
              currentNotificationsCache = cached;
              onUpdate(personalize(cached));
            }
          } catch {}
        }
      })
      .catch(() => {});
  }

  try {
    // No server-side limit: an unsorted limit returns the OLDEST documents (ids start with the time),
    // so new notifications would never arrive. Sorting + trimming to the newest happens in personalize().
    const q = query(collection(db, "notifications"), where("organizationId", "==", orgId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs: AppNotification[] = [];
        snapshot.forEach((d) => notifs.push({ ...(d.data() as AppNotification), id: d.id }));
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
                const cloudKeys = new Set(notifs.map((n) => n.idempotencyKey).filter(Boolean));
                localNotifs.forEach((n) => {
                  // Skip local copies of an event that already exists in the cloud under its shared id
                  if (!map.has(n.id) && !(n.idempotencyKey && cloudKeys.has(n.idempotencyKey))) map.set(n.id, n);
                });
                merged = Array.from(map.values());
                merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              } catch {}
            }
            merged = merged.slice(0, 200);
            AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(merged)).catch(() => {});
            broadcastNotifications(personalize(merged));
          })
          .catch(() => {
            AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(notifs.slice(0, 200))).catch(() => {});
            broadcastNotifications(personalize(notifs));
          });
      },
      (error) => {
        console.warn("[NOTIFICATIONS] Real-time listener warning:", error);
        // Fallback to local cache
        AsyncStorage.getItem(STORAGE_NOTIF_KEY)
          .then((raw) => {
            if (raw) {
              broadcastNotifications(personalize(JSON.parse(raw)));
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

/** Adds `field` (readBy / hiddenFor) for the current member to the given notifications, locally and in the cloud. */
async function addMemberMark(ids: string[], field: "readBy" | "hiddenFor"): Promise<void> {
  const uid = currentNotifUserId;
  if (ids.length === 0) return;
  const idSet = new Set(ids);

  // Optimistically update local storage & broadcast immediately
  try {
    const raw = await AsyncStorage.getItem(STORAGE_NOTIF_KEY);
    if (raw) {
      const list: AppNotification[] = JSON.parse(raw);
      const updated = list.map((n) => {
        if (!idSet.has(n.id)) return n;
        if (!uid) return field === "readBy" ? { ...n, read: true } : n;
        const current = Array.isArray(n[field]) ? (n[field] as string[]) : [];
        return current.includes(uid) ? n : { ...n, [field]: [...current, uid] };
      });
      await AsyncStorage.setItem(STORAGE_NOTIF_KEY, JSON.stringify(updated));
      broadcastNotifications(personalize(updated));
    }
  } catch {}

  await Promise.all(
    ids.map((id) =>
      updateDoc(
        doc(db, "notifications", id),
        uid
          ? { [field]: arrayUnion(uid), updatedAt: new Date().toISOString() }
          : field === "readBy"
          ? { read: true, updatedAt: new Date().toISOString() }
          : { updatedAt: new Date().toISOString() }
      ).catch((err) => console.warn(`[NOTIFICATIONS] Error updating ${field}:`, err))
    )
  );
}

/**
 * Marks a notification as read for the current member only (other members still see it as new).
 */
export async function markNotificationAsRead(id: string): Promise<void> {
  await addMemberMark([id], "readBy");
}

/**
 * Marks all of the current member's unread notifications as read (for this member only).
 */
export async function markAllNotificationsAsRead(notifications: AppNotification[]): Promise<void> {
  await addMemberMark(notifications.filter((n) => !n.read).map((n) => n.id), "readBy");
}

/**
 * Removes a notification from the current member's list only. It stays visible to everyone else
 * in the organization (deleting the shared record would remove it for the whole company).
 */
export async function deleteNotificationRecord(id: string): Promise<void> {
  await addMemberMark([id], "hiddenFor");
}
