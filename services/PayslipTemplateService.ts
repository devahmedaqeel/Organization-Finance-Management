/**
 * services/PayslipTemplateService.ts
 *
 * Persistence & real-time sync for payslip templates (web + mobile share this file).
 *
 * Firestore layout (organization-scoped):
 *   payslipTemplates/{docId}             custom templates and customizations of built-ins
 *   payslipTemplateSettings/{orgId}      { defaultTemplateId } — organization-wide default
 *
 * Built-in templates live in code (payslipTemplateConfig.ts) and therefore can never be
 * deleted. Editing a built-in stores an override doc; "Restore" deletes that override.
 * Templates never contain the logo image — it is always read from the organization profile.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "@/config/firebase";
import { User } from "@/context/AuthContext";
import { can } from "./permissionService";
import { recordAuditLog } from "./auditService";
import {
  DEFAULT_TEMPLATE_ID,
  PayslipTemplate,
  BuiltInTemplateKey,
  cloneTemplate,
  createBuiltInTemplate,
  isBuiltInTemplateId,
  mergeTemplateDocs,
  normalizeTemplate,
  validateTemplate,
} from "./payslipTemplateConfig";

export const PAYSLIP_TEMPLATES_COLLECTION = "payslipTemplates";
export const PAYSLIP_TEMPLATE_SETTINGS_COLLECTION = "payslipTemplateSettings";

const WRITE_TIMEOUT_MS = 8000;

export interface PayslipTemplateLibrary {
  templates: PayslipTemplate[];
  defaultTemplateId: string;
  /** "cache" until the first server snapshot arrives. */
  source: "cache" | "server";
  error?: string;
}

function safeKey(value: string): string {
  return (value || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function cacheKey(orgId: string): string {
  return `ofm_payslip_templates:${safeKey(orgId)}`;
}

function lastUsedKey(orgId: string, userId: string): string {
  return `ofm_payslip_template_last:${safeKey(orgId)}:${safeKey(userId)}`;
}

function overrideDocId(orgId: string, key: BuiltInTemplateKey): string {
  return `${safeKey(orgId)}__builtin_${key}`;
}

function generateTemplateId(): string {
  try {
    return `tpl_${doc(collection(db, PAYSLIP_TEMPLATES_COLLECTION)).id}`;
  } catch {
    return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Firestore resolves writes only after the server acknowledges them. Offline, the
 * write is queued locally (and already reflected in onSnapshot), so we stop waiting
 * after a timeout instead of blocking the UI.
 */
async function settleWrite(p: Promise<unknown>): Promise<"saved" | "queued"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"queued">((resolve) => {
    timer = setTimeout(() => resolve("queued"), WRITE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([p.then(() => "saved" as const), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function friendlyError(err: any): Error {
  const code = err?.code || "";
  if (code === "permission-denied") return new Error("You don't have permission to change payslip templates.");
  if (code === "unavailable") return new Error("Network unavailable. Your change will sync when you are back online.");
  return new Error(err?.message || "Unable to save payslip template.");
}

function assertCan(user: User | null | undefined, permission: Parameters<typeof can>[1]) {
  if (!user) throw new Error("You must be signed in.");
  if (!can(user, permission)) throw new Error("You don't have permission to perform this action.");
}

function orgOf(user: User): string {
  if (!user.organizationId) throw new Error("Your account is not linked to an organization.");
  return user.organizationId;
}

function audit(user: User, action: Parameters<typeof recordAuditLog>[0]["action"], templateId: string, metadata?: Record<string, any>) {
  recordAuditLog({
    organizationId: user.organizationId,
    actorUid: user.id,
    actorName: user.name,
    actorRole: user.role,
    action,
    entity: "payslip_template",
    entityId: templateId,
    metadata,
  }).catch(() => {});
}

async function readCache(orgId: string): Promise<{ docs: any[]; defaultTemplateId?: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(orgId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(orgId: string, docs: any[], defaultTemplateId?: string) {
  AsyncStorage.setItem(cacheKey(orgId), JSON.stringify({ docs, defaultTemplateId })).catch(() => {});
}

/**
 * Subscribes to the organization's template library. Emits cached data first
 * (offline support), then live Firestore updates from web and mobile.
 */
export function subscribePayslipTemplates(
  organizationId: string,
  onChange: (library: PayslipTemplateLibrary) => void
): () => void {
  let docs: any[] = [];
  let defaultTemplateId: string | undefined;
  let gotTemplates = false;
  let gotSettings = false;
  let disposed = false;
  let lastError: string | undefined;

  const emit = (source: "cache" | "server") => {
    if (disposed) return;
    onChange({
      templates: mergeTemplateDocs(docs, organizationId),
      defaultTemplateId: defaultTemplateId || DEFAULT_TEMPLATE_ID,
      source,
      error: lastError,
    });
  };

  readCache(organizationId).then((cached) => {
    if (disposed || gotTemplates) return;
    if (cached) {
      docs = cached.docs || [];
      defaultTemplateId = cached.defaultTemplateId;
    }
    emit("cache");
  });

  const unsubTemplates = onSnapshot(
    query(collection(db, PAYSLIP_TEMPLATES_COLLECTION), where("organizationId", "==", organizationId)),
    (snap) => {
      docs = snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
      gotTemplates = true;
      lastError = undefined;
      writeCache(organizationId, docs, defaultTemplateId);
      emit(gotSettings ? "server" : "cache");
    },
    (err) => {
      lastError = err?.code === "permission-denied" ? "You don't have access to this organization's templates." : "Templates could not be refreshed; showing saved copy.";
      emit("cache");
    }
  );

  const unsubSettings = onSnapshot(
    doc(db, PAYSLIP_TEMPLATE_SETTINGS_COLLECTION, organizationId),
    (snap) => {
      const data = snap.exists() ? (snap.data() as any) : undefined;
      defaultTemplateId = typeof data?.defaultTemplateId === "string" ? data.defaultTemplateId : undefined;
      gotSettings = true;
      writeCache(organizationId, docs, defaultTemplateId);
      emit(gotTemplates ? "server" : "cache");
    },
    () => {
      gotSettings = true;
    }
  );

  return () => {
    disposed = true;
    unsubTemplates();
    unsubSettings();
  };
}

function toDocPayload(template: PayslipTemplate, orgId: string, user: User, existing?: PayslipTemplate) {
  const now = new Date().toISOString();
  const clean = cloneTemplate(normalizeTemplate(template));
  delete (clean as any).isCustomizedBuiltIn;
  return {
    ...clean,
    organizationId: orgId,
    createdAt: existing?.createdAt || clean.createdAt || now,
    createdBy: existing?.createdBy || clean.createdBy || user.id,
    createdByName: existing?.createdByName || clean.createdByName || user.name,
    updatedAt: now,
    updatedBy: user.id,
    updatedByName: user.name,
  };
}

/**
 * Creates or updates a template. Saving a built-in stores an organization override.
 * Returns the saved template id and whether the write reached the server.
 */
export async function savePayslipTemplate(
  user: User | null | undefined,
  template: PayslipTemplate,
  existing?: PayslipTemplate
): Promise<{ id: string; status: "saved" | "queued" }> {
  assertCan(user, "manage_payslip_templates");
  const orgId = orgOf(user!);
  const normalized = normalizeTemplate(template);
  const errors = validateTemplate(normalized);
  if (errors.length) throw new Error(errors.join("\n"));

  try {
    if (template.isBuiltIn && template.builtInKey) {
      const key = template.builtInKey;
      const payload = {
        ...toDocPayload({ ...normalized, id: template.id }, orgId, user!, existing),
        builtInKey: key,
        isBuiltIn: true,
        isBuiltInOverride: true,
      };
      const status = await settleWrite(setDoc(doc(db, PAYSLIP_TEMPLATES_COLLECTION, overrideDocId(orgId, key)), payload));
      audit(user!, "update", template.id, { name: payload.name, builtIn: key });
      return { id: template.id, status };
    }

    const id = template.id && !isBuiltInTemplateId(template.id) ? template.id : generateTemplateId();
    const payload = { ...toDocPayload({ ...normalized, id }, orgId, user!, existing), id, isBuiltIn: false, isBuiltInOverride: false };
    const status = await settleWrite(setDoc(doc(db, PAYSLIP_TEMPLATES_COLLECTION, id), payload));
    audit(user!, existing ? "update" : "create", id, { name: payload.name });
    return { id, status };
  } catch (err) {
    throw friendlyError(err);
  }
}

export async function duplicatePayslipTemplate(
  user: User | null | undefined,
  source: PayslipTemplate,
  name?: string
): Promise<{ id: string; status: "saved" | "queued" }> {
  const copy: PayslipTemplate = {
    ...cloneTemplate(source),
    id: "",
    name: (name || `${source.name} (Copy)`).slice(0, 120),
    isBuiltIn: false,
    isCustomizedBuiltIn: false,
    isActive: true,
    createdAt: undefined,
    createdBy: undefined,
    createdByName: undefined,
  };
  return savePayslipTemplate(user, copy);
}

export async function renamePayslipTemplate(user: User | null | undefined, template: PayslipTemplate, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Template name is required.");
  return savePayslipTemplate(user, { ...template, name: trimmed }, template);
}

export async function setPayslipTemplateActive(
  user: User | null | undefined,
  template: PayslipTemplate,
  isActive: boolean,
  defaultTemplateId: string
) {
  if (!isActive && template.id === defaultTemplateId) {
    throw new Error("The default template cannot be deactivated. Choose another default first.");
  }
  return savePayslipTemplate(user, { ...template, isActive }, template);
}

export async function deletePayslipTemplate(
  user: User | null | undefined,
  template: PayslipTemplate,
  defaultTemplateId: string
): Promise<void> {
  assertCan(user, "manage_payslip_templates");
  if (template.isBuiltIn || isBuiltInTemplateId(template.id)) {
    throw new Error("Built-in templates cannot be deleted. Use Restore to undo customizations.");
  }
  const orgId = orgOf(user!);
  try {
    if (template.id === defaultTemplateId) {
      // Fall back to the built-in default so payslips keep generating.
      if (can(user!, "set_default_payslip_template")) {
        await setDefaultPayslipTemplate(user, DEFAULT_TEMPLATE_ID);
      } else {
        throw new Error("This template is the organization default. Ask an admin to choose another default first.");
      }
    }
    await settleWrite(deleteDoc(doc(db, PAYSLIP_TEMPLATES_COLLECTION, template.id)));
    audit(user!, "delete", template.id, { name: template.name, organizationId: orgId });
  } catch (err) {
    throw friendlyError(err);
  }
}

/** Removes an organization's customizations of a built-in template. */
export async function restoreBuiltInTemplate(user: User | null | undefined, key: BuiltInTemplateKey): Promise<PayslipTemplate> {
  assertCan(user, "manage_payslip_templates");
  const orgId = orgOf(user!);
  try {
    await settleWrite(deleteDoc(doc(db, PAYSLIP_TEMPLATES_COLLECTION, overrideDocId(orgId, key))));
    audit(user!, "restore", createBuiltInTemplate(key).id, { builtIn: key });
    return createBuiltInTemplate(key);
  } catch (err) {
    throw friendlyError(err);
  }
}

export async function setDefaultPayslipTemplate(user: User | null | undefined, templateId: string) {
  assertCan(user, "set_default_payslip_template");
  const orgId = orgOf(user!);
  try {
    const status = await settleWrite(
      setDoc(
        doc(db, PAYSLIP_TEMPLATE_SETTINGS_COLLECTION, orgId),
        { organizationId: orgId, defaultTemplateId: templateId, updatedAt: new Date().toISOString(), updatedBy: user!.id },
        { merge: true }
      )
    );
    audit(user!, "set_default", templateId);
    return status;
  } catch (err) {
    throw friendlyError(err);
  }
}

/** Per-user memory of the last template chosen when generating slips. */
export async function getLastUsedTemplateId(orgId: string, userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(lastUsedKey(orgId, userId));
  } catch {
    return null;
  }
}

export function setLastUsedTemplateId(orgId: string, userId: string, templateId: string) {
  AsyncStorage.setItem(lastUsedKey(orgId, userId), templateId).catch(() => {});
}
