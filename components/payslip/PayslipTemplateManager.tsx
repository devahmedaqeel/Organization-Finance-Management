import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { usePayslipOrganizationProfile, usePayslipTemplates } from "@/hooks/usePayslipTemplates";
import { getSalaryComponents } from "@/services/SalaryComponentService";
import {
  deletePayslipTemplate,
  duplicatePayslipTemplate,
  renamePayslipTemplate,
  restoreBuiltInTemplate,
  savePayslipTemplate,
  setDefaultPayslipTemplate,
  setPayslipTemplateActive,
} from "@/services/PayslipTemplateService";
import { PayslipTemplate, cloneTemplate, createBuiltInTemplate } from "@/services/payslipTemplateConfig";
import { buildSamplePayslipData, renderPayslipHtml } from "@/services/payslipTemplateRenderer";
import { EditorComponentRef, PayslipTemplateEditor } from "./PayslipTemplateEditor";
import { PayslipPreview } from "./PayslipPreview";
import { PayslipTemplateWizard } from "./PayslipTemplateWizard";
import { ACCENT, ConfirmDialog, PromptDialog, SmallButton } from "./controls";

type Confirm =
  | { kind: "delete"; t: PayslipTemplate }
  | { kind: "restore"; t: PayslipTemplate }
  | null;

/**
 * "Payslip Templates" section of the Payroll module. Shared by web and mobile.
 */
export function PayslipTemplateManager() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const narrow = width < 720;
  const { user } = useAuth();
  const { payroll } = useFinance();
  const lib = usePayslipTemplates();
  const org = usePayslipOrganizationProfile();

  const [editing, setEditing] = useState<PayslipTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [renaming, setRenaming] = useState<PayslipTemplate | null>(null);
  const [previewing, setPreviewing] = useState<PayslipTemplate | null>(null);
  // Guided step-by-step creation of a new template (web + mobile)
  const [wizard, setWizard] = useState(false);
  const [components, setComponents] = useState<EditorComponentRef[]>([]);

  useEffect(() => {
    if (!user?.organizationId || !lib.canManage) return;
    getSalaryComponents(user.organizationId)
      .then((list) => setComponents(list.map((c) => ({ code: c.code, name: c.name, category: c.category }))))
      .catch(() => setComponents([]));
  }, [user?.organizationId, lib.canManage]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  const previewHtml = useMemo(
    () => (previewing ? renderPayslipHtml(previewing, buildSamplePayslipData(org), { mode: "screen", showLogoPlaceholder: true }) : ""),
    [previewing, org]
  );

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      const res: any = await fn();
      setNotice({ tone: "ok", text: res?.status === "queued" ? `${ok} (offline — will sync when back online)` : ok });
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message || "Something went wrong." });
    } finally {
      setBusyId(null);
    }
  };

  if (!lib.canManage && !lib.canSelect) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: colors.mutedForeground }}>You don't have access to payslip templates.</Text>
      </View>
    );
  }

  if (wizard) {
    const base = (key: "government" | "corporate") => lib.templates.find((x) => x.builtInKey === key && x.isBuiltIn) || createBuiltInTemplate(key);
    return (
      <View style={{ gap: 12, width: "100%", maxWidth: 760, alignSelf: "center" }}>
        <PayslipTemplateWizard
          bases={{ government: base("government"), corporate: base("corporate") }}
          org={org}
          saving={saving}
          onCancel={() => setWizard(false)}
          onAdvanced={(t) => {
            setWizard(false);
            setEditing(t);
          }}
          onSave={async (t) => {
            setSaving(true);
            try {
              const res = await savePayslipTemplate(user, t, undefined);
              setNotice({ tone: "ok", text: res.status === "queued" ? "Template saved offline — it will sync when you're back online." : `"${t.name}" created.` });
              setWizard(false);
            } catch (err: any) {
              setNotice({ tone: "err", text: err?.message || "Unable to save template." });
            } finally {
              setSaving(false);
            }
          }}
        />
        {notice ? <Notice notice={notice} /> : null}
      </View>
    );
  }

  if (editing) {
    return (
      <View style={{ flex: 1, minWidth: 0 }}>
        <PayslipTemplateEditor
          initial={editing}
          org={org}
          components={components}
          previewEntries={payroll}
          canViewSensitive={lib.canViewSensitive}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={async (t) => {
            setSaving(true);
            try {
              const existing = lib.templates.find((x) => x.id === editing.id);
              const res = await savePayslipTemplate(user, t, existing);
              setNotice({ tone: "ok", text: res.status === "queued" ? "Template saved offline — it will sync when you're back online." : "Template saved." });
              setEditing(null);
            } catch (err: any) {
              setNotice({ tone: "err", text: err?.message || "Unable to save template." });
            } finally {
              setSaving(false);
            }
          }}
        />
        {notice ? <Notice notice={notice} /> : null}
      </View>
    );
  }

  const activeCount = lib.templates.filter((t) => t.isActive).length;
  const defaultTpl = lib.templates.find((t) => t.id === lib.defaultTemplateId);

  return (
    <View style={{ gap: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 240 }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_600SemiBold" }}>Payslip templates</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 2 }}>
            Choose how payslips look when you print or download them.
          </Text>
        </View>
        {lib.canManage ? (
          <View style={narrow ? { width: "100%" } : undefined}>
            <SmallButton label="+ New template" tone="primary" onPress={() => setWizard(true)} />
          </View>
        ) : null}
      </View>

      {/* Quick guide */}
      <View style={{ flexDirection: narrow ? "column" : "row", gap: 10 }}>
        {[
          { n: "1", title: "Preview", text: "See a template with sample salary data." },
          { n: "2", title: "Make default", text: "The default is used for every new payslip." },
          { n: "3", title: "Edit or duplicate", text: "Change layout, colours and fields. Amounts never change." },
        ].map((s) => (
          <View key={s.n} style={{ flex: 1, flexDirection: "row", gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.primary, fontSize: 12.5, fontFamily: "Inter_600SemiBold" }}>{s.n}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 13.5, fontFamily: "Inter_600SemiBold" }}>{s.title}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12.5, lineHeight: 18, marginTop: 1 }}>{s.text}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Status line */}
      <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
        {lib.templates.length} {lib.templates.length === 1 ? "template" : "templates"} · {activeCount} active
        {defaultTpl ? ` · Default: ${defaultTpl.name}` : ""} · Logo comes from Settings → Organization profile
      </Text>

      {notice ? <Notice notice={notice} /> : null}
      {lib.error ? <Text style={{ color: colors.warning, fontSize: 13 }}>{lib.error}</Text> : null}
      {lib.loading ? <ActivityIndicator color={colors.primary} /> : null}

      {/* Template cards */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        {lib.templates.map((t) => {
          const isDefault = t.id === lib.defaultTemplateId;
          const busy = busyId === t.id;
          const dual = t.components.layout === "dual";
          const canToggle = !(isDefault && t.isActive);
          return (
            <View
              key={t.id}
              style={{
                flexGrow: 1,
                flexBasis: narrow ? "100%" : 380,
                minWidth: narrow ? undefined : 320,
                borderWidth: isDefault ? 2 : 1,
                borderColor: isDefault ? colors.primary : colors.border,
                backgroundColor: colors.card,
                borderRadius: 10,
                padding: 16,
                gap: 14,
                opacity: t.isActive ? 1 : 0.75,
              }}
            >
              {/* Top: sketch + title */}
              <View style={{ flexDirection: "row", gap: 14 }}>
                <LayoutSketch dual={dual} landscape={t.page.orientation === "landscape"} color={colors.primary} />
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <Text style={{ color: colors.foreground, fontSize: 15.5, fontFamily: "Inter_600SemiBold", lineHeight: 21 }}>{t.name}</Text>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    {isDefault ? <Badge text="✓ Default" color={colors.primary} /> : null}
                    {t.isBuiltIn ? <Badge text="Built-in" color={colors.info} /> : <Badge text="Custom" color="#8B5CF6" />}
                    {t.isCustomizedBuiltIn ? <Badge text="Customized" color={colors.warning} /> : null}
                    {!t.isActive ? <Badge text="Inactive" color="#64748B" /> : null}
                  </View>
                  {t.description ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{t.description}</Text>
                  ) : null}
                </View>
                {busy ? <ActivityIndicator color={colors.primary} /> : null}
              </View>

              {/* Facts */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {[t.page.size, t.page.orientation === "landscape" ? "Landscape" : "Portrait", dual ? "Two-column tables" : "Single-column tables"].map((x) => (
                  <View key={x} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: colors.muted }}>
                    <Text style={{ color: colors.foreground, fontSize: 12 }}>{x}</Text>
                  </View>
                ))}
              </View>
              {t.updatedAt ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  Updated {new Date(t.updatedAt).toLocaleDateString()}
                  {t.updatedByName ? ` by ${t.updatedByName}` : ""}
                </Text>
              ) : null}

              {/* Main actions */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                <SmallButton label="Preview" onPress={() => setPreviewing(t)} />
                {lib.canSetDefault && !isDefault ? (
                  <SmallButton
                    label="Make default"
                    tone="primary"
                    disabled={busy || !t.isActive}
                    accessibilityLabel={t.isActive ? `Make ${t.name} the default template` : "Activate this template first to make it the default"}
                    onPress={() => run(t.id, () => setDefaultPayslipTemplate(user, t.id), `"${t.name}" is now the default template.`)}
                  />
                ) : null}
                {lib.canManage ? (
                  <SmallButton label="Edit" onPress={() => setEditing(cloneTemplate(t))} disabled={busy} />
                ) : null}
              </View>

              {/* More actions */}
              {lib.canManage ? (
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                    <TextAction label="Duplicate" color={colors.primary} disabled={busy} onPress={() => run(t.id, () => duplicatePayslipTemplate(user, t), `Copied "${t.name}".`)} />
                    <TextAction label="Rename" color={colors.primary} disabled={busy} onPress={() => setRenaming(t)} />
                    <TextAction
                      label={t.isActive ? "Turn off" : "Turn on"}
                      color={colors.primary}
                      disabled={busy || !canToggle}
                      onPress={() => run(t.id, () => setPayslipTemplateActive(user, t, !t.isActive, lib.defaultTemplateId), t.isActive ? "Template turned off." : "Template turned on.")}
                    />
                    {t.isCustomizedBuiltIn ? (
                      <TextAction label="Restore original" color={colors.primary} disabled={busy} onPress={() => setConfirm({ kind: "restore", t })} />
                    ) : null}
                    {!t.isBuiltIn ? (
                      <TextAction label="Delete" color={colors.expense} disabled={busy} onPress={() => setConfirm({ kind: "delete", t })} />
                    ) : null}
                  </View>
                  {!canToggle ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>The default template can't be turned off. Make another template the default first.</Text>
                  ) : !t.isActive && lib.canSetDefault ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Turn this template on to use it or make it the default.</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <ConfirmDialog
        visible={confirm?.kind === "delete"}
        title="Delete template?"
        message={`"${confirm?.t.name}" will be permanently deleted. Payroll records and amounts are not affected.${confirm?.t.id === lib.defaultTemplateId ? " It is currently the default; the built-in Government template will become the default." : ""}`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const t = confirm!.t;
          setConfirm(null);
          run(t.id, () => deletePayslipTemplate(user, t, lib.defaultTemplateId), `Deleted "${t.name}".`);
        }}
      />
      <ConfirmDialog
        visible={confirm?.kind === "restore"}
        title="Restore original template?"
        message={`Your organization's customizations to "${confirm?.t.name}" will be removed and the original built-in design restored.`}
        confirmLabel="Restore"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const t = confirm!.t;
          setConfirm(null);
          run(t.id, () => restoreBuiltInTemplate(user, t.builtInKey!), "Original template restored.");
        }}
      />
      <PromptDialog
        visible={Boolean(renaming)}
        title="Rename template"
        initialValue={renaming?.name || ""}
        confirmLabel="Rename"
        onCancel={() => setRenaming(null)}
        onSubmit={(name) => {
          const t = renaming!;
          setRenaming(null);
          run(t.id, () => renamePayslipTemplate(user, t, name), "Template renamed.");
        }}
      />

      <Modal visible={Boolean(previewing)} transparent animationType="fade" onRequestClose={() => setPreviewing(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: narrow ? 8 : 24 }}>
          <View style={{ width: "100%", maxWidth: 960, height: "92%", backgroundColor: colors.card, borderRadius: 14, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>{previewing?.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12.5 }}>Preview with sample salary data — your real payroll is not changed</Text>
              </View>
              <SmallButton label="Close" onPress={() => setPreviewing(null)} />
            </View>
            {previewing ? <PayslipPreview html={previewHtml} /> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: color + "18" }}>
      <Text style={{ color, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{text}</Text>
    </View>
  );
}

/** Small text-style action (used for secondary template actions). */
function TextAction({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} style={{ opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Tiny drawing of the page layout so users can tell templates apart at a glance. */
function LayoutSketch({ dual, landscape, color }: { dual: boolean; landscape: boolean; color: string }) {
  const colors = useColors();
  const w = landscape ? 76 : 58;
  const h = landscape ? 58 : 76;
  const bar = (width: number | string, op = 1) => (
    <View style={{ height: 4, width: width as any, borderRadius: 2, backgroundColor: color, opacity: op }} />
  );
  return (
    <View style={{ width: w, height: h, borderRadius: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: 6, gap: 4 }}>
      {bar("60%")}
      {bar("35%", 0.4)}
      <View style={{ flexDirection: "row", gap: 4, marginTop: 2, flex: 1 }}>
        <View style={{ flex: 1, gap: 3 }}>
          {[1, 2, 3].map((i) => <View key={i} style={{ height: 3, borderRadius: 2, backgroundColor: colors.mutedForeground, opacity: 0.35 }} />)}
        </View>
        {dual ? (
          <View style={{ flex: 1, gap: 3 }}>
            {[1, 2, 3].map((i) => <View key={i} style={{ height: 3, borderRadius: 2, backgroundColor: colors.mutedForeground, opacity: 0.35 }} />)}
          </View>
        ) : null}
      </View>
      {bar("45%", 0.7)}
    </View>
  );
}

function Notice({ notice }: { notice: { tone: "ok" | "err"; text: string } }) {
  const colors = useColors();
  const c = notice.tone === "ok" ? colors.income : colors.expense;
  return (
    <View accessibilityLiveRegion="polite" style={{ padding: 10, borderRadius: 8, backgroundColor: c + "14", borderWidth: 1, borderColor: c + "55" }}>
      <Text style={{ color: c, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{notice.tone === "ok" ? "✓ " : "⚠ "}{notice.text}</Text>
    </View>
  );
}
