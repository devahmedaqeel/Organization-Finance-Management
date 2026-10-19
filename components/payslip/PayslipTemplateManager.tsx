import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Text, View, useWindowDimensions } from "react-native";
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
      <View style={{ flex: 1, minHeight: 600 }}>
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

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800" }}>Payslip Templates</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
            Templates control how salary slips look. They never change salary calculations. Logo is taken from your Organization Profile.
          </Text>
        </View>
        {lib.canManage ? (
          <View style={narrow ? { width: "100%" } : undefined}>
            <SmallButton
              label="+ Create Template"
              tone="primary"
              onPress={() => setWizard(true)}
            />
          </View>
        ) : null}
      </View>

      {notice ? <Notice notice={notice} /> : null}
      {lib.error ? <Text style={{ color: colors.warning, fontSize: 12 }}>{lib.error}</Text> : null}
      {lib.loading ? <ActivityIndicator color={ACCENT} /> : null}

      {lib.templates.map((t) => {
        const isDefault = t.id === lib.defaultTemplateId;
        const busy = busyId === t.id;
        return (
          <View
            key={t.id}
            style={{
              borderWidth: 1,
              borderColor: isDefault ? ACCENT : colors.border,
              backgroundColor: colors.card,
              borderRadius: 12,
              padding: 14,
              gap: 10,
              opacity: t.isActive ? 1 : 0.7,
            }}
          >
            <View style={{ flexDirection: narrow ? "column" : "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>{t.name}</Text>
                  {isDefault ? <Badge text="Default" color={ACCENT} /> : null}
                  {t.isBuiltIn ? <Badge text="Built-in" color="#0EA5E9" /> : <Badge text="Custom" color="#10B981" />}
                  {t.isCustomizedBuiltIn ? <Badge text="Customized" color="#F59E0B" /> : null}
                  {!t.isActive ? <Badge text="Inactive" color="#64748B" /> : null}
                </View>
                {t.description ? <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>{t.description}</Text> : null}
                <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>
                  {t.page.size} · {t.page.orientation} · {t.components.layout === "dual" ? "two-column tables" : "single-column tables"}
                  {t.updatedAt ? ` · Updated ${new Date(t.updatedAt).toLocaleDateString()}${t.updatedByName ? ` by ${t.updatedByName}` : ""}` : ""}
                </Text>
              </View>
              {busy ? <ActivityIndicator color={ACCENT} /> : null}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <SmallButton label="Preview" onPress={() => setPreviewing(t)} />
              {lib.canManage ? (
                <>
                  <SmallButton label="Edit" onPress={() => setEditing(cloneTemplate(t))} disabled={busy} />
                  <SmallButton label="Duplicate" onPress={() => run(t.id, () => duplicatePayslipTemplate(user, t), `Duplicated "${t.name}".`)} disabled={busy} />
                  <SmallButton label="Rename" onPress={() => setRenaming(t)} disabled={busy} />
                  <SmallButton
                    label={t.isActive ? "Deactivate" : "Activate"}
                    disabled={busy || (isDefault && t.isActive)}
                    onPress={() =>
                      run(t.id, () => setPayslipTemplateActive(user, t, !t.isActive, lib.defaultTemplateId), t.isActive ? "Template deactivated." : "Template activated.")
                    }
                  />
                </>
              ) : null}
              {lib.canSetDefault && !isDefault ? (
                <SmallButton
                  label="Set as Default"
                  disabled={busy || !t.isActive}
                  onPress={() => run(t.id, () => setDefaultPayslipTemplate(user, t.id), `"${t.name}" is now the organization default.`)}
                />
              ) : null}
              {lib.canManage && t.isCustomizedBuiltIn ? (
                <SmallButton label="Restore Original" onPress={() => setConfirm({ kind: "restore", t })} disabled={busy} />
              ) : null}
              {lib.canManage && !t.isBuiltIn ? (
                <SmallButton label="Delete" tone="danger" onPress={() => setConfirm({ kind: "delete", t })} disabled={busy} />
              ) : null}
            </View>
          </View>
        );
      })}

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
                <Text style={{ color: colors.foreground, fontWeight: "800" }}>{previewing?.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Preview with sample data</Text>
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
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: color + "1F" }}>
      <Text style={{ color, fontSize: 11, fontWeight: "800" }}>{text}</Text>
    </View>
  );
}

function Notice({ notice }: { notice: { tone: "ok" | "err"; text: string } }) {
  const colors = useColors();
  const c = notice.tone === "ok" ? colors.income : colors.expense;
  return (
    <View accessibilityLiveRegion="polite" style={{ padding: 10, borderRadius: 8, backgroundColor: c + "14", borderWidth: 1, borderColor: c + "55" }}>
      <Text style={{ color: c, fontSize: 12, fontWeight: "600" }}>{notice.text}</Text>
    </View>
  );
}
