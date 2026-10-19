import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  BuiltInTemplateKey,
  PayslipSectionKey,
  PayslipTemplate,
  cloneTemplate,
  validateTemplate,
} from "@/services/payslipTemplateConfig";
import { PayslipOrganizationProfile, buildSamplePayslipData, renderPayslipHtml } from "@/services/payslipTemplateRenderer";
import { PayslipPreview } from "./PayslipPreview";
import { ACCENT, FieldLabel, Input, Segmented, SmallButton, ToggleRow } from "./controls";

const ACCENT_SWATCHES = ["#000000", "#1E3A8A", "#065F46", "#7C2D12", "#4C1D95", "#334155"];

/** Plain-language explanation of each starting design. */
const BASE_INFO: Record<BuiltInTemplateKey, { title: string; text: string }> = {
  government: { title: "Official / Government style", text: "Formal layout with earnings and deductions side by side, like official pay slips." },
  corporate: { title: "Modern / Company style", text: "Clean, simple layout with one table under another. Easy to read on any screen." },
};

/** What each section contains, in everyday words. */
const SECTION_HELP: Partial<Record<PayslipSectionKey, string>> = {
  employee: "Name, employee ID, designation and department",
  earnings: "Basic pay and all allowances",
  deductions: "Provident fund, tax and other deductions",
  loans: "Loan or salary-advance recoveries and balance left",
  tax: "Income tax details for the month",
  employer: "Contributions paid by the employer (e.g. EOBI)",
  summary: "Gross pay, total deductions and NET salary",
  attendance: "Working days, leave and absences",
  payment: "Bank name, account and payment method",
  custom: "Extra fields you add yourself",
};

const STEPS = ["Pick a design", "Name & look", "What to show", "Preview & save"];

/**
 * Simple 4-step guide for creating a new payslip template on mobile.
 * Produces the same PayslipTemplate as the full editor (which stays available via "More options").
 */
export function PayslipTemplateWizard({
  bases,
  org,
  saving,
  onSave,
  onAdvanced,
  onCancel,
}: {
  bases: Record<BuiltInTemplateKey, PayslipTemplate>;
  org: PayslipOrganizationProfile;
  saving: boolean;
  onSave: (t: PayslipTemplate) => void;
  onAdvanced: (t: PayslipTemplate) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [baseKey, setBaseKey] = useState<BuiltInTemplateKey | null>(null);
  const [t, setT] = useState<PayslipTemplate | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const update = (fn: (draft: PayslipTemplate) => void) =>
    setT((prev) => {
      if (!prev) return prev;
      const next = cloneTemplate(prev);
      fn(next);
      return next;
    });

  const pickBase = (key: BuiltInTemplateKey) => {
    const base = bases[key];
    setBaseKey(key);
    setT({
      ...cloneTemplate(base),
      id: "",
      name: t?.name && baseKey ? t.name : `My ${base.name}`,
      isBuiltIn: false,
      isCustomizedBuiltIn: false,
      createdAt: undefined,
      updatedAt: undefined,
    });
  };

  const errors = useMemo(() => (t ? validateTemplate(t) : []), [t]);
  const html = useMemo(
    () => (t && step === 3 ? renderPayslipHtml(t, buildSamplePayslipData(org), { mode: "screen", showLogoPlaceholder: true }) : ""),
    [t, step, org]
  );

  const canNext = step === 0 ? Boolean(t) : step === 1 ? Boolean(t?.name.trim()) : true;
  const bodySections = (t?.sections || []).filter((s) => s.key !== "header" && s.key !== "footer");

  const card = { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 10 } as const;

  return (
    <View style={{ gap: 14 }}>
      {/* Title + progress */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 18, fontWeight: "800" }}>New Payslip Template</Text>
          <SmallButton label="Cancel" onPress={onCancel} />
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </Text>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {STEPS.map((s, i) => (
            <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? ACCENT : colors.border }} />
          ))}
        </View>
      </View>

      {/* Step 1 — starting design */}
      {step === 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>Which design do you want to start with?</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            Don't worry — you can change everything later. Salary amounts are never affected by the template.
          </Text>
          {(Object.keys(BASE_INFO) as BuiltInTemplateKey[]).map((key) => {
            const selected = baseKey === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => pickBase(key)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[card, { borderColor: selected ? ACCENT : colors.border, borderWidth: selected ? 2 : 1, backgroundColor: selected ? ACCENT + "0F" : colors.card }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: selected ? ACCENT : colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT }} /> : null}
                  </View>
                  <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, fontWeight: "800" }}>{BASE_INFO[key].title}</Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>{BASE_INFO[key].text}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Based on: {bases[key].name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Step 2 — name & look */}
      {step === 1 && t ? (
        <View style={card}>
          <View>
            <FieldLabel>Template name *</FieldLabel>
            <Input value={t.name} onChangeText={(v) => update((d) => void (d.name = v))} maxLength={120} placeholder="e.g. Head Office Payslip" />
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>Only you and your team see this name.</Text>
          </View>
          <View>
            <FieldLabel>Title printed on the slip</FieldLabel>
            <Input
              value={t.header.documentTitle}
              onChangeText={(v) => update((d) => void (d.header.documentTitle = v))}
              maxLength={120}
              placeholder="Monthly Salary Statement"
            />
          </View>
          <View>
            <FieldLabel>Main colour</FieldLabel>
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {ACCENT_SWATCHES.map((c) => (
                <TouchableOpacity
                  key={c}
                  accessibilityLabel={`Colour ${c}`}
                  onPress={() => update((d) => void (d.page.accentColor = c))}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: c,
                    borderWidth: t.page.accentColor === c ? 3 : 1,
                    borderColor: t.page.accentColor === c ? ACCENT : colors.border,
                  }}
                />
              ))}
            </View>
          </View>
          <ToggleRow
            label="Show organization logo"
            hint={org.logo ? "Uses the logo from Settings → Organization Profile" : "No logo saved yet — add one in Settings → Organization Profile"}
            value={t.logo.visible}
            onChange={(v) => update((d) => void (d.logo.visible = v))}
          />
          {t.logo.visible ? (
            <View>
              <FieldLabel>Logo position</FieldLabel>
              <Segmented
                value={t.logo.position}
                options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]}
                onChange={(v) => update((d) => void (d.logo.position = v))}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Step 3 — sections */}
      {step === 2 && t ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            Turn parts of the slip on or off. Hiding a part only hides it on the slip — the salary calculation stays the same.
          </Text>
          <View style={[card, { gap: 4 }]}>
            {bodySections.map((s) => {
              const locked = s.key === "summary";
              return (
                <ToggleRow
                  key={s.key}
                  label={s.title}
                  hint={locked ? `${SECTION_HELP[s.key] || ""} · always shown` : SECTION_HELP[s.key]}
                  value={s.visible}
                  disabled={locked}
                  onChange={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.visible = v))}
                />
              );
            })}
            <ToggleRow
              label="Signature lines"
              hint="Space at the bottom for signatures"
              value={t.footer.showSignatures}
              onChange={(v) => update((d) => void (d.footer.showSignatures = v))}
            />
          </View>
        </View>
      ) : null}

      {/* Step 4 — preview & save */}
      {step === 3 && t ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            This is how your slip will look (sample data). Pinch to zoom. Go back to change anything.
          </Text>
          <View style={{ height: Math.max(380, Math.round(height * 0.58)), borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
            <PayslipPreview html={html} />
          </View>
          {showErrors && errors.length > 0 ? (
            <View style={{ padding: 10, borderRadius: 8, backgroundColor: colors.expense + "14", borderWidth: 1, borderColor: colors.expense + "55" }}>
              {errors.map((e) => (
                <Text key={e} style={{ color: colors.expense, fontSize: 12 }}>• {e}</Text>
              ))}
            </View>
          ) : null}
          <SmallButton
            label={saving ? "Saving…" : "✓  Save Template"}
            tone="primary"
            disabled={saving}
            onPress={() => {
              setShowErrors(true);
              if (errors.length === 0) onSave(t);
            }}
          />
          <SmallButton label="More options (advanced editor)" onPress={() => onAdvanced(t)} disabled={saving} />
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
            Advanced editor lets you rename fields, reorder sections, add your own text, fonts, margins and more.
          </Text>
        </View>
      ) : null}

      {/* Back / Next */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          {step > 0 ? <SmallButton label="← Back" onPress={() => setStep((s) => s - 1)} disabled={saving} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          {step < STEPS.length - 1 ? (
            <SmallButton label="Next →" tone="primary" disabled={!canNext} onPress={() => setStep((s) => s + 1)} />
          ) : null}
        </View>
      </View>
      {step === 0 && !t ? <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: "center" }}>Tap a design to continue</Text> : null}
    </View>
  );
}
