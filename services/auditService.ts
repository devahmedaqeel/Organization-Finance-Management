import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/config/firebase";

export interface AuditLogEntry {
  organizationId: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: "create" | "update" | "delete" | "invite" | "role_change";
  entity: "transaction" | "budget" | "payroll" | "department" | "member" | "settings";
  entityId: string;
  metadata?: Record<string, any>;
}

export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const logId = doc(collection(db, "auditLogs")).id;
    const cleanEntry: Record<string, any> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (v === undefined) continue;
      if (k === "metadata" && typeof v === "object" && v !== null) {
        const cleanMeta: Record<string, any> = {};
        for (const [mk, mv] of Object.entries(v)) {
          if (mv !== undefined) cleanMeta[mk] = mv;
        }
        cleanEntry[k] = cleanMeta;
      } else {
        cleanEntry[k] = v;
      }
    }

    await setDoc(doc(db, "auditLogs", logId), {
      ...cleanEntry,
      id: logId,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // Non-blocking for offline environments
    console.log("Audit log recording notice (offline fallback):", err);
  }
}
