/**
 * services/SalaryComponentService.ts
 *
 * Manages configurable salary components (earnings, deductions, employer contributions).
 * Supports offline storage, local caching, and synchronization with Firestore.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDocs, query, setDoc, deleteDoc, where } from "firebase/firestore";
import { db } from "@/config/firebase";
import {
  SalaryComponent,
  DEFAULT_EARNING_COMPONENTS,
  DEFAULT_DEDUCTION_COMPONENTS,
  DEFAULT_EMPLOYER_COMPONENTS,
} from "./PayrollCalculationEngine";
import { recordAuditLog } from "./auditService";

const STORAGE_KEY_PREFIX = "ofm_salary_components_";

function getStorageKey(organizationId: string): string {
  const safeOrg = (organizationId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${STORAGE_KEY_PREFIX}${safeOrg}`;
}

/**
 * Fetch all salary components for an organization.
 * Falls back to local AsyncStorage cache if offline or on network error.
 * Seeds standard default components if the organization has no components yet.
 */
export async function getSalaryComponents(organizationId: string): Promise<SalaryComponent[]> {
  const storageKey = getStorageKey(organizationId);

  try {
    const q = query(collection(db, "salaryComponents"), where("organizationId", "==", organizationId));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const components: SalaryComponent[] = [];
      snapshot.forEach((docSnap) => {
        components.push({ id: docSnap.id, ...(docSnap.data() as Omit<SalaryComponent, "id">) });
      });
      // Sort components by sortOrder or name
      components.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
      await AsyncStorage.setItem(storageKey, JSON.stringify(components)).catch(() => {});
      return components;
    }
  } catch (err) {
    console.warn("SalaryComponentService: network fetch failed, using local cache", err);
  }

  // Fallback to local cache
  try {
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // ignore
  }

  // Seed default components if none exist
  return await seedDefaultComponents(organizationId);
}

/**
 * Seed default standard components for a new or uninitialized organization.
 */
export async function seedDefaultComponents(organizationId: string): Promise<SalaryComponent[]> {
  const storageKey = getStorageKey(organizationId);
  const now = new Date().toISOString();

  const allDefaults: Omit<SalaryComponent, "id">[] = [
    ...DEFAULT_EARNING_COMPONENTS.map((c) => ({
      ...c,
      organizationId,
      effectiveDate: now,
    })),
    ...DEFAULT_DEDUCTION_COMPONENTS.map((c) => ({
      ...c,
      organizationId,
      effectiveDate: now,
    })),
    ...DEFAULT_EMPLOYER_COMPONENTS.map((c) => ({
      ...c,
      organizationId,
      effectiveDate: now,
    })),
  ];

  const seeded: SalaryComponent[] = [];

  for (const item of allDefaults) {
    const id = `comp_${item.code.toLowerCase()}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const comp: SalaryComponent = { id, ...item };
    seeded.push(comp);

    // Save to Firestore non-blockingly
    setDoc(doc(db, "salaryComponents", id), comp).catch(() => {});
  }

  await AsyncStorage.setItem(storageKey, JSON.stringify(seeded)).catch(() => {});
  return seeded;
}

/**
 * Create or update a salary component.
 */
export async function saveSalaryComponent(
  component: Partial<SalaryComponent> & { organizationId: string; name: string; category: SalaryComponent["category"]; calculationType: SalaryComponent["calculationType"]; amount: number },
  actor?: { id: string; name: string; role: string }
): Promise<SalaryComponent> {
  const id = component.id || `comp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const cleanCode = (component.code || component.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)).toUpperCase();

  const fullComponent: SalaryComponent = {
    id,
    code: cleanCode,
    name: component.name.trim(),
    category: component.category,
    calculationType: component.calculationType,
    amount: Number(component.amount || 0),
    baseComponentCode: component.baseComponentCode,
    isActive: component.isActive !== false,
    effectiveDate: component.effectiveDate || new Date().toISOString(),
    description: component.description,
    isTaxable: component.isTaxable,
    isStatutory: component.isStatutory,
    sortOrder: component.sortOrder ?? 50,
    organizationId: component.organizationId,
  };

  // Save to Firestore
  try {
    await setDoc(doc(db, "salaryComponents", id), fullComponent);
  } catch (err) {
    console.warn("SalaryComponentService: offline Firestore save fallback", err);
  }

  // Update local cache
  const storageKey = getStorageKey(component.organizationId);
  try {
    const cached = await AsyncStorage.getItem(storageKey);
    const list: SalaryComponent[] = cached ? JSON.parse(cached) : [];
    const idx = list.findIndex((c) => c.id === id);
    if (idx >= 0) {
      list[idx] = fullComponent;
    } else {
      list.push(fullComponent);
    }
    await AsyncStorage.setItem(storageKey, JSON.stringify(list));
  } catch (err) {
    console.error("SalaryComponentService: cache update error", err);
  }

  // Audit trail
  if (actor) {
    recordAuditLog({
      organizationId: component.organizationId,
      actorUid: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: component.id ? "update" : "create",
      entity: "salary_component",
      entityId: id,
      metadata: { code: fullComponent.code, name: fullComponent.name, category: fullComponent.category },
    }).catch(() => {});
  }

  return fullComponent;
}

/**
 * Delete or deactivate a salary component.
 */
export async function deleteSalaryComponent(
  id: string,
  organizationId: string,
  actor?: { id: string; name: string; role: string }
): Promise<void> {
  try {
    await deleteDoc(doc(db, "salaryComponents", id));
  } catch (err) {
    console.warn("SalaryComponentService: failed deleting remote doc", err);
  }

  // Update cache
  const storageKey = getStorageKey(organizationId);
  try {
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) {
      const list: SalaryComponent[] = JSON.parse(cached);
      const updated = list.filter((c) => c.id !== id);
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
    }
  } catch (err) {
    console.error("SalaryComponentService: cache delete error", err);
  }

  if (actor) {
    recordAuditLog({
      organizationId,
      actorUid: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: "delete",
      entity: "salary_component",
      entityId: id,
    }).catch(() => {});
  }
}
