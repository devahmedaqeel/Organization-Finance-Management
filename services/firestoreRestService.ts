/**
 * Real-time Firestore REST Service
 * Provides direct HTTPS REST fallback and instant synchronization with Firebase Cloud Firestore.
 * Bypasses mobile ISP streaming/WebSocket blocks and 10s timeout warnings.
 */

const PROJECT_ID = "ofmapp-main";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      fields[key] = { stringValue: value };
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: String(value) };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map((v) =>
            typeof v === "string" ? { stringValue: v } : { integerValue: String(v) }
          ),
        },
      };
    }
  }
  return fields;
}

export function fromFirestoreDoc<T>(doc: any): T {
  const fields = doc.fields || {};
  const idFromPath = doc.name ? doc.name.split("/").pop() : "";
  const result: any = { id: fields.id?.stringValue || idFromPath };

  const NUMERIC_KEYS = new Set([
    "amount",
    "baseSalary",
    "bonus",
    "deductions",
    "netSalary",
    "allocated",
    "spent",
    "budgetAllocated",
    "headCount",
  ]);

  for (const [key, val] of Object.entries(fields) as [string, any][]) {
    if (NUMERIC_KEYS.has(key)) {
      result[key] = Number(val.integerValue ?? val.doubleValue ?? val.stringValue ?? 0);
    } else if (val.stringValue !== undefined) {
      result[key] = val.stringValue;
    } else if (val.integerValue !== undefined) {
      result[key] = Number(val.integerValue);
    } else if (val.doubleValue !== undefined) {
      result[key] = Number(val.doubleValue);
    } else if (val.booleanValue !== undefined) {
      result[key] = Boolean(val.booleanValue);
    } else if (val.timestampValue !== undefined) {
      result[key] = val.timestampValue;
    }
  }
  return result as T;
}

export async function fetchCollectionREST<T>(collectionName: string, organizationId?: string): Promise<T[]> {
  try {
    const res = await fetch(`${BASE_URL}/${collectionName}?pageSize=300`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.documents || !Array.isArray(data.documents)) return [];
    const docs = data.documents.map((d: any) => fromFirestoreDoc<T>(d));
    if (organizationId) {
      return docs.filter((d: any) => !d.organizationId || d.organizationId === organizationId);
    }
    return docs;
  } catch (err) {
    console.log(`REST fetch error for ${collectionName}:`, err);
    return [];
  }
}

/**
 * Save or update a document via REST API
 */
export async function saveDocREST(collectionName: string, docId: string, data: Record<string, any>): Promise<boolean> {
  try {
    const fields = toFirestoreFields(data);
    const res = await fetch(`${BASE_URL}/${collectionName}/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    return res.ok;
  } catch (err) {
    console.log(`REST save error for ${collectionName}/${docId}:`, err);
    return false;
  }
}

/**
 * Delete a document via REST API
 */
export async function deleteDocREST(collectionName: string, docId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/${collectionName}/${docId}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch (err) {
    console.log(`REST delete error for ${collectionName}/${docId}:`, err);
    return false;
  }
}
