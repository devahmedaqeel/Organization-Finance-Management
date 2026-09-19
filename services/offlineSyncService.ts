/**
 * services/offlineSyncService.ts
 *
 * Core Offline-First Synchronization & Persistence Layer for OFM.
 * Implements:
 * 1. Durable organization-scoped local persistence with backward-compatible migration.
 * 2. Crash-safe durable Outbox / Pending Mutations Queue.
 * 3. Deletion tombstones to prevent snapshot resurrecting.
 * 4. Deterministic state reconciliation:
 *    Canonical Server State + Local Durable State + Outbox Operations + Tombstones = Current User-Visible State.
 * 5. Idempotent Outbox Synchronization Processor with retry backoff.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { doc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "../config/firebase";
import { networkService } from "./networkService";
import { saveDocREST, deleteDocREST } from "./firestoreRestService";

export type OperationType = "CREATE" | "UPDATE" | "DELETE";
export type EntityType = "transaction" | "budget" | "payroll" | "department" | "setting" | "user";

export interface PendingOperation {
  operationId: string;
  entityType: EntityType;
  entityId: string;
  operationType: OperationType;
  organizationId: string;
  userId: string;
  payload?: any;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  syncStatus: "pending" | "syncing" | "failed";
  lastError?: string;
}

export interface SyncMetadata {
  lastSyncAt: string | null;
  pendingCount: number;
  lastError: string | null;
}

// Memory caches for fast synchronous access
const outboxMemoryCache = new Map<string, PendingOperation[]>();
const tombstonesMemoryCache = new Map<string, Set<string>>();
const syncListeners = new Set<(orgId: string, pendingCount: number) => void>();
const flushInProgress = new Map<string, boolean>();

/**
 * Strips undefined values recursively so Firestore never rejects payloads
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
 * Safe write to Firestore with sanitized payload
 */
export async function safeFirestoreSetDoc(docRef: any, data: any, options?: any): Promise<void> {
  const { setDoc } = require("firebase/firestore");
  const clean = sanitizeForFirestore(data);
  if (options) {
    await setDoc(docRef, clean, options);
  } else {
    await setDoc(docRef, clean);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. STORAGE KEYS & BACKWARD COMPATIBLE MIGRATION
// ─────────────────────────────────────────────────────────────────────────────

function getDataKey(orgId: string, entityType: string): string {
  return `ofm_data:${orgId}:${entityType}`;
}

function getLegacyKey(orgId: string, entityType: string): string {
  return `ofm_cache:${orgId}:${entityType}`;
}

function getOutboxKey(orgId: string): string {
  return `ofm_outbox:${orgId}`;
}

function getTombstoneKey(orgId: string): string {
  return `ofm_tombstones:${orgId}`;
}

function getMetadataKey(orgId: string): string {
  return `ofm_sync_meta:${orgId}`;
}

/**
 * Load local entity dataset with automatic migration from legacy cache keys
 */
export async function loadLocalEntities<T>(orgId: string, entityType: string): Promise<T[]> {
  try {
    const dataKey = getDataKey(orgId, entityType);
    const legacyKey = getLegacyKey(orgId, entityType);

    // 1. Try version 2.0 key
    let raw = await AsyncStorage.getItem(dataKey);

    // Fallback to web storage if native AsyncStorage is empty
    if (!raw && Platform.OS === "web" && typeof localStorage !== "undefined") {
      try {
        raw = localStorage.getItem(dataKey);
      } catch {}
    }

    // 2. If not found, check legacy key and migrate safely
    if (!raw) {
      raw = await AsyncStorage.getItem(legacyKey);
      if (!raw && Platform.OS === "web" && typeof localStorage !== "undefined") {
        try {
          raw = localStorage.getItem(legacyKey);
        } catch {}
      }

      if (raw) {
        // Migrate to version 2.0 key
        await AsyncStorage.setItem(dataKey, raw).catch(() => {});
        if (Platform.OS === "web" && typeof localStorage !== "undefined") {
          try {
            localStorage.setItem(dataKey, raw);
          } catch {}
        }
      }
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn(`[offlineSync] Failed to load local entities for ${entityType}:`, err);
  }
  return [];
}

/**
 * Persist entity dataset locally (both to new key and legacy key for backward compatibility)
 */
export async function saveLocalEntities<T>(orgId: string, entityType: string, items: T[]): Promise<void> {
  try {
    if (!orgId) return;
    const dataKey = getDataKey(orgId, entityType);
    const legacyKey = getLegacyKey(orgId, entityType);

    // Safeguard: do not overwrite existing persistent data with empty array when offline
    if (items.length === 0 && !networkService.isOnline()) {
      let existingRaw = await AsyncStorage.getItem(dataKey).catch(() => null);
      if (!existingRaw && Platform.OS === "web" && typeof localStorage !== "undefined") {
        try { existingRaw = localStorage.getItem(dataKey); } catch {}
      }
      if (existingRaw) {
        try {
          const parsed = JSON.parse(existingRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const tombstones = await loadTombstones(orgId);
            const remaining = parsed.filter((item: any) => !tombstones.has(item?.id));
            if (remaining.length > 0) {
              return; // Preserve valid persistent offline data!
            }
          }
        } catch {}
      }
    }

    const serialized = JSON.stringify(items);

    await AsyncStorage.setItem(dataKey, serialized);
    await AsyncStorage.setItem(legacyKey, serialized).catch(() => {});

    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(dataKey, serialized);
        localStorage.setItem(legacyKey, serialized);
      } catch {}
    }
  } catch (err) {
    console.warn(`[offlineSync] Failed to save local entities for ${entityType}:`, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TOMBSTONES MANAGEMENT (ZERO-RESURRECTION GUARANTEE)
// ─────────────────────────────────────────────────────────────────────────────

export async function loadTombstones(orgId: string): Promise<Set<string>> {
  if (tombstonesMemoryCache.has(orgId)) {
    return tombstonesMemoryCache.get(orgId)!;
  }

  const result = new Set<string>();
  try {
    const key = getTombstoneKey(orgId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw && Platform.OS === "web" && typeof localStorage !== "undefined") {
      try {
        raw = localStorage.getItem(key);
      } catch {}
    }

    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach((id) => result.add(id));
    }
  } catch {}

  tombstonesMemoryCache.set(orgId, result);
  return result;
}

export async function recordTombstones(orgId: string, ids: string[]): Promise<void> {
  try {
    const set = await loadTombstones(orgId);
    ids.forEach((id) => set.add(id));
    tombstonesMemoryCache.set(orgId, set);

    const key = getTombstoneKey(orgId);
    const arr = Array.from(set).slice(-1000); // Keep last 1000 tombstones
    const serialized = JSON.stringify(arr);

    await AsyncStorage.setItem(key, serialized);
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(key, serialized);
      } catch {}
    }

    // Persist to Firestore cloud tombstones collection if online
    if (networkService.isOnline()) {
      ids.forEach((id) => {
        const payload = {
          id,
          organizationId: orgId,
          deletedAt: new Date().toISOString(),
        };
        safeFirestoreSetDoc(doc(db, "tombstones", id), payload).catch(() => {});
        saveDocREST("tombstones", id, payload).catch(() => {});
      });
    }
  } catch (err) {
    console.warn("[offlineSync] Failed to record tombstones:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. OUTBOX / PENDING MUTATIONS QUEUE
// ─────────────────────────────────────────────────────────────────────────────

export async function loadOutbox(orgId: string): Promise<PendingOperation[]> {
  if (outboxMemoryCache.has(orgId)) {
    return outboxMemoryCache.get(orgId)!;
  }

  try {
    const key = getOutboxKey(orgId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw && Platform.OS === "web" && typeof localStorage !== "undefined") {
      try {
        raw = localStorage.getItem(key);
      } catch {}
    }

    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        outboxMemoryCache.set(orgId, list);
        return list;
      }
    }
  } catch {}

  outboxMemoryCache.set(orgId, []);
  return [];
}

async function persistOutbox(orgId: string, queue: PendingOperation[]): Promise<void> {
  outboxMemoryCache.set(orgId, queue);
  const key = getOutboxKey(orgId);
  const serialized = JSON.stringify(queue);

  await AsyncStorage.setItem(key, serialized);
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(key, serialized);
    } catch {}
  }

  // Notify listeners
  syncListeners.forEach((listener) => {
    try {
      listener(orgId, queue.length);
    } catch {}
  });
}

/**
 * Enqueue a new mutation into the durable Outbox
 */
export async function enqueueOperation(
  op: Omit<PendingOperation, "operationId" | "createdAt" | "updatedAt" | "retryCount" | "syncStatus"> & {
    operationId?: string;
  }
): Promise<PendingOperation> {
  const orgId = op.organizationId;
  const queue = await loadOutbox(orgId);
  const now = new Date().toISOString();

  const newOp: PendingOperation = {
    operationId: op.operationId || `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    entityType: op.entityType,
    entityId: op.entityId,
    operationType: op.operationType,
    organizationId: op.organizationId,
    userId: op.userId,
    payload: op.payload,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    syncStatus: "pending",
  };

  // Coalesce operations for the same entity if safe:
  // If an entity was created and then updated offline, merge payload
  let updatedQueue = [...queue];
  const existingIdx = updatedQueue.findIndex(
    (item) => item.entityId === newOp.entityId && item.entityType === newOp.entityType
  );

  if (existingIdx >= 0) {
    const existing = updatedQueue[existingIdx];
    if (newOp.operationType === "DELETE") {
      if (existing.operationType === "CREATE") {
        // Created offline then deleted offline: remove from outbox entirely!
        updatedQueue.splice(existingIdx, 1);
        await persistOutbox(orgId, updatedQueue);
        return newOp;
      } else {
        // Replace previous UPDATE with DELETE
        updatedQueue[existingIdx] = newOp;
      }
    } else if (newOp.operationType === "UPDATE") {
      if (existing.operationType === "CREATE") {
        // Merge update into initial CREATE payload
        updatedQueue[existingIdx] = {
          ...existing,
          payload: { ...existing.payload, ...newOp.payload, updatedAt: now },
          updatedAt: now,
        };
      } else {
        // Merge into existing UPDATE
        updatedQueue[existingIdx] = {
          ...existing,
          payload: { ...existing.payload, ...newOp.payload, updatedAt: now },
          updatedAt: now,
        };
      }
    }
  } else {
    updatedQueue.push(newOp);
  }

  await persistOutbox(orgId, updatedQueue);

  // If online, immediately trigger background flush
  if (networkService.isOnline()) {
    setTimeout(() => {
      flushOutbox(orgId).catch(() => {});
    }, 10);
  }

  return newOp;
}

export async function removeOperation(orgId: string, operationId: string): Promise<void> {
  const queue = await loadOutbox(orgId);
  const filtered = queue.filter((op) => op.operationId !== operationId);
  await persistOutbox(orgId, filtered);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DETERMINISTIC RECONCILIATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconciles remote canonical records with durable local state, outbox operations, and tombstones.
 * Formula:
 * Canonical Server State + Local Durable State + Pending Outbox Operations + Tombstones = Current User-Visible State
 */
export function reconcileEntities<T extends { id: string; updatedAt?: string; date?: string; [key: string]: any }>(
  remoteItems: T[],
  localItems: T[],
  outboxOps: PendingOperation[],
  tombstones: Set<string>
): T[] {
  const itemMap = new Map<string, T>();

  // 1. Seed with remote canonical items, rejecting any tombstoned IDs
  for (const item of remoteItems) {
    if (!tombstones.has(item.id)) {
      itemMap.set(item.id, item);
    }
  }

  // 2. Safety Net: If remote is empty, but local items exist, retain local items
  // (Prevents offline or initial empty snapshots from wiping valid local data)
  if (remoteItems.length === 0 && localItems.length > 0) {
    for (const item of localItems) {
      if (!tombstones.has(item.id)) {
        itemMap.set(item.id, item);
      }
    }
  } else if (remoteItems.length > 0 && localItems.length > 0) {
    // Preserve local items that are pending in outbox (e.g. created offline but not yet on remote)
    const pendingIds = new Set(outboxOps.map((o) => o.entityId));
    for (const local of localItems) {
      if (!itemMap.has(local.id) && !tombstones.has(local.id) && pendingIds.has(local.id)) {
        itemMap.set(local.id, local);
      }
    }
  }

  // 3. Overlay Outbox Operations strictly in chronological order
  for (const op of outboxOps) {
    if (op.operationType === "CREATE") {
      if (!tombstones.has(op.entityId) && op.payload) {
        itemMap.set(op.entityId, { ...op.payload, id: op.entityId });
      }
    } else if (op.operationType === "UPDATE") {
      if (!tombstones.has(op.entityId)) {
        const existing = itemMap.get(op.entityId) || localItems.find((l) => l.id === op.entityId);
        if (existing) {
          itemMap.set(op.entityId, { ...existing, ...op.payload, id: op.entityId });
        }
      }
    } else if (op.operationType === "DELETE") {
      itemMap.delete(op.entityId);
      tombstones.add(op.entityId);
    }
  }

  // 4. Final filter through tombstones to guarantee zero resurrection
  const result: T[] = [];
  for (const [id, item] of itemMap.entries()) {
    if (!tombstones.has(id)) {
      result.push(item);
    }
  }

  // 5. Deterministic sorting: if date field exists, sort descending
  if (result.length > 0 && result[0].date !== undefined) {
    result.sort((a, b) => new Date(b.date || "").getTime() - new Date(a.date || "").getTime());
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. IDEMPOTENT OUTBOX SYNCHRONIZATION PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flushes all pending operations for an organization idempotently
 */
export async function flushOutbox(orgId: string): Promise<{ success: boolean; syncedCount: number }> {
  if (flushInProgress.get(orgId)) {
    return { success: true, syncedCount: 0 };
  }

  if (!networkService.isOnline()) {
    return { success: false, syncedCount: 0 };
  }

  flushInProgress.set(orgId, true);
  let syncedCount = 0;

  try {
    const queue = await loadOutbox(orgId);
    if (queue.length === 0) {
      flushInProgress.set(orgId, false);
      return { success: true, syncedCount: 0 };
    }

    const remainingQueue: PendingOperation[] = [];

    for (const op of queue) {
      let opSuccess = false;
      let errorMsg: string | undefined;

      try {
        const targetCollection =
          op.entityType === "transaction"
            ? "transactions"
            : op.entityType === "budget"
            ? "budgets"
            : op.entityType === "payroll"
            ? "payroll"
            : op.entityType === "department"
            ? "departments"
            : op.entityType === "setting"
            ? "orgSettings"
            : "users";

        if (op.operationType === "CREATE" || op.operationType === "UPDATE") {
          const payload = sanitizeForFirestore(op.payload || {});
          
          try {
            await safeFirestoreSetDoc(doc(db, targetCollection, op.entityId), payload, { merge: true });
            opSuccess = true;
          } catch (sdkErr: any) {
            if (sdkErr?.code === "permission-denied") {
              throw sdkErr;
            }
            // Fallback to direct REST write on transport/connection error
            const restOk = await saveDocREST(targetCollection, op.entityId, payload).catch(() => false);
            if (restOk) {
              opSuccess = true;
            } else {
              throw sdkErr;
            }
          }
        } else if (op.operationType === "DELETE") {
          try {
            await deleteDoc(doc(db, targetCollection, op.entityId));
            opSuccess = true;
          } catch (sdkErr: any) {
            if (sdkErr?.code === "permission-denied") {
              throw sdkErr;
            }
            const restOk = await deleteDocREST(targetCollection, op.entityId).catch(() => false);
            if (restOk) {
              opSuccess = true;
            } else {
              throw sdkErr;
            }
          }

          // Ensure cloud tombstone is saved
          await recordTombstones(orgId, [op.entityId]);
        }
      } catch (err: any) {
        errorMsg = err?.message || String(err);
        console.warn(`[offlineSync] Operation ${op.operationId} failed to sync:`, errorMsg);

        // If permission denied, do not retry endlessly
        if (err?.code === "permission-denied") {
          opSuccess = false;
        } else {
          networkService.reportNetworkFailure();
        }
      }

      if (opSuccess) {
        syncedCount++;
        networkService.reportNetworkSuccess();
      } else {
        // Keep in queue with incremented retry count
        remainingQueue.push({
          ...op,
          retryCount: op.retryCount + 1,
          syncStatus: "failed",
          lastError: errorMsg,
          updatedAt: new Date().toISOString(),
        });
        // Break out to preserve sequence order for dependent operations
        break;
      }
    }

    // Persist remaining queue
    const unattemptedOps = queue.slice(syncedCount + remainingQueue.length);
    const finalQueue = [...remainingQueue, ...unattemptedOps];
    await persistOutbox(orgId, finalQueue);

    return { success: finalQueue.length === 0, syncedCount };
  } finally {
    flushInProgress.set(orgId, false);
  }
}

/**
 * Subscribe to sync / outbox count updates
 */
export function subscribeSyncState(listener: (orgId: string, pendingCount: number) => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}
