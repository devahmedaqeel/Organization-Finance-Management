import React, { useMemo, useState } from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  DATE_FORMATS,
  FONT_FAMILIES,
  MAPPABLE_FIELDS,
  PayslipCustomField,
  PayslipSectionKey,
  PayslipTextBlock,
  PayslipTemplate,
  REORDERABLE_SECTIONS,
  cloneTemplate,
  componentKey,
  createTextBlock,
  isRequiredField,
  isSensitiveField,
  moveField,
  moveSection,
  validateTemplate,
} from "@/services/payslipTemplateConfig";
import {
  PayslipOrganizationProfile,
  buildPayslipRenderData,
  buildSamplePayslipData,
  renderPayslipHtml,
} from "@/services/payslipTemplateRenderer";
import { PayslipPreview } from "./PayslipPreview";
import {
  ACCENT,
  FieldLabel,
  IconBtn,
  Input,
  Panel,
  Segmented,
  SmallButton,
  Stepper,
  ToggleRow,
} from "./controls";

export interface EditorComponentRef {
  code?: string;
  name: string;
  category: "earning" | "deduction" | "employer_contribution";
}

const ACCENT_SWATCHES = ["#000000", "#1E3A8A", "#065F46", "#7C2D12", "#4C1D95", "#334155"];

/** Lines that legacy (non-itemized) payroll records produce; listed so they can be relabelled too. */
const LEGACY_LINES: EditorComponentRef[] = [
  { name: "Basic Pay", category: "earning" },
  { name: "Bonus / Allowances", category: "earning" },
  { name: "Deductions", category: "deduction" },
];

export function PayslipTemplateEditor({
  initial,
  org,
  components,
  previewEntries,
  canViewSensitive,
  saving,
  onSave,
  onCancel,
}: {
  initial: PayslipTemplate;
  org: PayslipOrganizationProfile;
  components: EditorComponentRef[];
  previewEntries: any[];
  canViewSensitive: boolean;
  saving: boolean;
  onSave: (t: PayslipTemplate) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const wide = width >= 960;
  const isNative = Platform.OS !== "web";
  // Native app and narrow browsers: the page itself scrolls, so the editor renders inline (no nested scroll view)
  const inline = isNative || !wide;
  const narrow = width < 560;
  const [t, setT] = useState<PayslipTemplate>(() => cloneTemplate(initial));
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [previewId, setPreviewId] = useState<string>("sample");
  const [openSection, setOpenSection] = useState<PayslipSectionKey | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);

  const update = (fn: (draft: PayslipTemplate) => void) =>
    setT((prev) => {
      const next = cloneTemplate(prev);
      fn(next);
      return next;
    });

  const errors = useMemo(() => validateTemplate(t), [t]);
  const dirty = useMemo(() => !initial.id || JSON.stringify(t) !== JSON.stringify(initial), [t, initial]);

  const html = useMemo(() => {
    const entry = previewEntries.find((e) => e.id === previewId);
    const data = entry
      ? buildPayslipRenderData(entry, org, { canViewSensitive })
      : buildSamplePayslipData(org);
    return renderPayslipHtml(t, data, { mode: "screen", showLogoPlaceholder: true });
  }, [t, org, previewEntries, previewId, canViewSensitive]);

  const componentRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<EditorComponentRef & { key: string }> = [];
    for (const c of [...components, ...LEGACY_LINES]) {
      const key = componentKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...c, key });
    }
    return rows;
  }, [components]);

  const bodySections = t.sections.filter((s) => s.key !== "header" && s.key !== "footer");

  const ControlsContainer: any = inline ? View : ScrollView;
  const containerProps = inline
    ? { style: { gap: 10, paddingBottom: 24 } }
    : { contentContainerStyle: { gap: 10, paddingBottom: 40 }, keyboardShouldPersistTaps: "handled" };

  const controls = (
    <ControlsContainer {...containerProps}>
      {!wide ? (
        <View style={{ padding: 12, borderRadius: 10, backgroundColor: ACCENT + "10", borderWidth: 1, borderColor: ACCENT + "40", gap: 4 }}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800" }}>How to edit this template</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            1. Tap a section below to open it and change its settings.{"\n"}
            2. Switch to “Preview” at the top any time to see the slip.{"\n"}
            3. Tap “Save Template” when you are happy. Salary amounts are never changed.
          </Text>
        </View>
      ) : null}
      <Panel title="General" subtitle="Name, description and availability" defaultOpen>
        <View>
          <FieldLabel>Template name</FieldLabel>
          <Input value={t.name} onChangeText={(v) => update((d) => void (d.name = v))} maxLength={120} placeholder="e.g. Head Office Payslip" />
        </View>
        <View>
          <FieldLabel>Description</FieldLabel>
          <Input value={t.description || ""} onChangeText={(v) => update((d) => void (d.description = v))} multiline maxLength={500} />
        </View>
        <ToggleRow label="Active (available when generating slips)" value={t.isActive} onChange={(v) => update((d) => void (d.isActive = v))} />
      </Panel>

      <Panel title="Page & Typography">
        <FieldLabel>Page size</FieldLabel>
        <Segmented value={t.page.size} options={[{ value: "A4", label: "A4" }, { value: "Letter", label: "Letter" }]} onChange={(v) => update((d) => void (d.page.size = v))} />
        <FieldLabel>Orientation</FieldLabel>
        <Segmented
          value={t.page.orientation}
          options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]}
          onChange={(v) => update((d) => void (d.page.orientation = v))}
        />
        <FieldLabel>Font</FieldLabel>
        <Segmented value={t.page.fontFamily} options={FONT_FAMILIES.map((f) => ({ value: f.key, label: f.label }))} onChange={(v) => update((d) => void (d.page.fontFamily = v))} />
        <Stepper label="Font size" value={t.page.fontSizePt} step={0.5} min={6} max={14} suffix=" pt" onChange={(v) => update((d) => void (d.page.fontSizePt = v))} />
        <Stepper label="Page margins" value={t.page.marginMm} min={4} max={30} suffix=" mm" onChange={(v) => update((d) => void (d.page.marginMm = v))} />
        <Stepper label="Section spacing" value={t.page.sectionSpacingPx} min={0} max={40} suffix=" px" onChange={(v) => update((d) => void (d.page.sectionSpacingPx = v))} />
        <FieldLabel>Table borders</FieldLabel>
        <Segmented
          value={t.page.tableBorders}
          options={[{ value: "grid", label: "Full grid" }, { value: "horizontal", label: "Row lines" }, { value: "none", label: "None" }]}
          onChange={(v) => update((d) => void (d.page.tableBorders = v))}
        />
        <FieldLabel>Accent colour</FieldLabel>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {ACCENT_SWATCHES.map((c) => (
            <TouchableOpacity
              key={c}
              accessibilityLabel={`Accent colour ${c}`}
              onPress={() => update((d) => void (d.page.accentColor = c))}
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: t.page.accentColor === c ? 3 : 1, borderColor: t.page.accentColor === c ? ACCENT : colors.border }}
            />
          ))}
          <Input
            value={t.page.accentColor}
            onChangeText={(v) => update((d) => void (d.page.accentColor = v))}
            maxLength={7}
            accessibilityLabel="Accent colour hex"
            style={{ width: 96 }}
          />
        </View>
      </Panel>

      <Panel title="Header & Logo" subtitle="The logo always comes from your Organization Profile">
        <View style={{ padding: 10, borderRadius: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
            {org.logo ? "✓ Using the logo saved in Settings → Organization Profile" : "No logo saved in your Organization Profile"}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 3 }}>
            {org.logo
              ? "Change it in Settings and every template updates automatically. These settings only control how it is displayed."
              : "Upload a logo in Settings → Organization Profile. Until then, slips show a clean text header."}
          </Text>
        </View>
        <ToggleRow label="Show logo" value={t.logo.visible} onChange={(v) => update((d) => void (d.logo.visible = v))} />
        <Stepper label="Logo height" value={t.logo.heightPx} step={4} min={20} max={160} suffix=" px" onChange={(v) => update((d) => void (d.logo.heightPx = v))} />
        <FieldLabel>Logo position</FieldLabel>
        <Segmented
          value={t.logo.position}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Top centre" }, { value: "right", label: "Right" }]}
          onChange={(v) => update((d) => void (d.logo.position = v))}
        />
        <Stepper label="Space around logo" value={t.logo.spacingPx} step={2} min={0} max={48} suffix=" px" onChange={(v) => update((d) => void (d.logo.spacingPx = v))} />
        <FieldLabel>Header text alignment</FieldLabel>
        <Segmented
          value={t.header.align}
          options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]}
          onChange={(v) => update((d) => void (d.header.align = v))}
        />
        <View>
          <FieldLabel>Document title</FieldLabel>
          <Input value={t.header.documentTitle} onChangeText={(v) => update((d) => void (d.header.documentTitle = v))} maxLength={120} placeholder="Monthly Salary Statement" />
        </View>
        <ToggleRow label="Divider line under header" value={t.header.showDivider} onChange={(v) => update((d) => void (d.header.showDivider = v))} />
      </Panel>

      <Panel title="Numbers & Dates">
        <FieldLabel>Currency display</FieldLabel>
        <Segmented
          value={t.format.currencyDisplay}
          options={[{ value: "none", label: "1,000.00" }, { value: "code", label: `${org.currency} 1,000.00` }, { value: "symbol", label: "Symbol" }]}
          onChange={(v) => update((d) => void (d.format.currencyDisplay = v))}
        />
        <FieldLabel>Decimals</FieldLabel>
        <Segmented value={t.format.decimals} options={[{ value: 2, label: "2 decimals" }, { value: 0, label: "Whole numbers" }]} onChange={(v) => update((d) => void (d.format.decimals = v))} />
        <FieldLabel>Deduction style</FieldLabel>
        <Segmented
          value={t.format.negativeStyle}
          options={[{ value: "minus", label: "-1,000" }, { value: "parentheses", label: "(1,000)" }]}
          onChange={(v) => update((d) => void (d.format.negativeStyle = v))}
        />
        <FieldLabel>Date format</FieldLabel>
        <Segmented value={t.format.dateFormat} options={DATE_FORMATS.map((f) => ({ value: f, label: f }))} onChange={(v) => update((d) => void (d.format.dateFormat = v))} />
      </Panel>

      <Panel title="Sections & Fields" subtitle="Show/hide, rename and reorder. Hiding never changes calculations.">
        {[t.sections.find((s) => s.key === "header")!, ...bodySections, t.sections.find((s) => s.key === "footer")!].map((s) => {
          const reorderable = REORDERABLE_SECTIONS.includes(s.key);
          const idx = bodySections.findIndex((b) => b.key === s.key);
          const expanded = openSection === s.key;
          return (
            <View key={s.key} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setOpenSection(expanded ? null : s.key)} accessibilityRole="button">
                  <Text style={{ color: s.visible ? colors.foreground : colors.mutedForeground, fontWeight: "700", fontSize: 13 }}>
                    {expanded ? "▾ " : "▸ "}
                    {s.title}
                  </Text>
                </TouchableOpacity>
                {reorderable ? (
                  <>
                    <IconBtn label="↑" a11y={`Move ${s.title} up`} disabled={idx <= 0} onPress={() => setT((p) => moveSection(p, s.key, -1))} />
                    <IconBtn label="↓" a11y={`Move ${s.title} down`} disabled={idx >= bodySections.length - 1} onPress={() => setT((p) => moveSection(p, s.key, 1))} />
                  </>
                ) : null}
                <SwitchInline
                  value={s.visible}
                  label={`Show ${s.title}`}
                  disabled={s.key === "summary"}
                  onChange={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.visible = v))}
                />
              </View>
              {expanded ? (
                <View style={{ gap: 8 }}>
                  {s.key !== "header" && s.key !== "footer" ? (
                    <View>
                      <FieldLabel>Section heading</FieldLabel>
                      <Input
                        value={s.title}
                        maxLength={120}
                        onChangeText={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.title = v))}
                      />
                    </View>
                  ) : null}
                  {s.fields.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Add fields to this section under “Custom Fields”.</Text>
                  ) : null}
                  {s.fields.map((f, fi) => {
                    const required = isRequiredField(s.key, f.key);
                    const sensitive = isSensitiveField(s.key, f.key);
                    const noteKey = `${s.key}.${f.key}`;
                    const hasNote = Boolean((f.prefix || "").trim() || (f.suffix || "").trim());
                    const fieldControls = (
                      <>
                        <IconBtn label="↑" a11y={`Move ${f.label} up`} disabled={fi === 0} onPress={() => setT((p) => moveField(p, s.key, f.key, -1))} />
                        <IconBtn label="↓" a11y={`Move ${f.label} down`} disabled={fi === s.fields.length - 1} onPress={() => setT((p) => moveField(p, s.key, f.key, 1))} />
                        <IconBtn
                          label={hasNote ? "✎•" : "✎"}
                          a11y={`Add your own text next to ${f.label}`}
                          onPress={() => setNoteOpen(noteOpen === noteKey ? null : noteKey)}
                        />
                      </>
                    );
                    if (narrow) {
                      // Phone layout: label on its own row, actions on a second row so nothing is squeezed
                      return (
                        <View key={f.key} style={{ gap: 8, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <SwitchInline
                              value={f.visible}
                              disabled={required}
                              label={`Show ${f.label}`}
                              onChange={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.fields[fi].visible = v))}
                            />
                            <Input
                              value={f.label}
                              maxLength={120}
                              accessibilityLabel={`Label for ${f.key}`}
                              style={{ flex: 1, paddingVertical: 6 }}
                              onChangeText={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.fields[fi].label = v))}
                            />
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 11 }}>
                              {sensitive ? "🔒 " : ""}
                              {required ? "Required · always shown" : f.visible ? "Shown on slip" : "Hidden from slip"}
                            </Text>
                            {fieldControls}
                          </View>
                          {noteOpen === noteKey ? (
                            <View style={{ gap: 6 }}>
                              <Input
                                value={f.prefix || ""}
                                placeholder="Text before value"
                                maxLength={200}
                                style={{ paddingVertical: 6 }}
                                onChangeText={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.fields[fi].prefix = v || undefined))}
                              />
                              <Input
                                value={f.suffix || ""}
                                placeholder="Text after value"
                                maxLength={200}
                                style={{ paddingVertical: 6 }}
                                onChangeText={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.fields[fi].suffix = v || undefined))}
                              />
                            </View>
                          ) : null}
                        </View>
                      );
                    }
                    return (
                      <View key={f.key} style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <SwitchInline
                          value={f.visible}
                          disabled={required}
                          label={`Show ${f.label}`}
                          onChange={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.fields[fi].visible = v))}
                        />
                        <Input
                          value={f.label}
                          maxLength={120}
                          accessibilityLabel={`Label for ${f.key}`}
                          style={{ flex: 1, paddingVertical: 6 }}
                          onChangeText={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.fields[fi].label = v))}
                        />
                        {sensitive ? <Text style={{ fontSize: 11, color: colors.warning }}>🔒</Text> : null}
                        <IconBtn label="↑" a11y={`Move ${f.label} up`} disabled={fi === 0} onPress={() => setT((p) => moveField(p, s.key, f.key, -1))} />
                        <IconBtn label="↓" a11y={`Move ${f.label} down`} disabled={fi === s.fields.length - 1} onPress={() => setT((p) => moveField(p, s.key, f.key, 1))} />
                        <IconBtn
                          label={hasNote ? "✎•" : "✎"}
                          a11y={`Add your own text next to ${f.label}`}
                          onPress={() => setNoteOpen(noteOpen === noteKey ? null : noteKey)}
                        />
                      </View>
                      {noteOpen === noteKey ? (
                        <View style={{ flexDirection: "row", gap: 6, paddingLeft: 42 }}>
                          <Input
                            value={f.prefix || ""}
                            placeholder="Text before value"
                            maxLength={200}
                            style={{ flex: 1, paddingVertical: 6 }}
                            onChangeText={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.fields[fi].prefix = v || undefined))}
                          />
                          <Input
                            value={f.suffix || ""}
                            placeholder="Text after value"
                            maxLength={200}
                            style={{ flex: 1, paddingVertical: 6 }}
                            onChangeText={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.fields[fi].suffix = v || undefined))}
                          />
                        </View>
                      ) : null}
                      </View>
                    );
                  })}
                  {t.textBlocks
                    .map((b, bi) => ({ b, bi }))
                    .filter(({ b }) => b.anchor === s.key)
                    .map(({ b, bi }) => (
                      <TextBlockEditor
                        key={b.id}
                        block={b}
                        onChange={(next) => update((d) => void (d.textBlocks[bi] = next))}
                        onRemove={() => update((d) => void d.textBlocks.splice(bi, 1))}
                      />
                    ))}
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    <SmallButton label="+ Text above section" onPress={() => update((d) => void d.textBlocks.push(createTextBlock(s.key, "before")))} />
                    <SmallButton label="+ Text below section" onPress={() => update((d) => void d.textBlocks.push(createTextBlock(s.key, "after")))} />
                  </View>
                  {s.fields.some((f) => isSensitiveField(s.key, f.key)) ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                      🔒 Sensitive: shown in full only to users allowed to view sensitive payroll data; masked for everyone else.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </Panel>

      <Panel title="Earnings & Deductions Tables" subtitle="Display labels, order and grouping. Payroll components are not changed.">
        <ToggleRow label="Show component codes" value={t.components.showCodes} onChange={(v) => update((d) => void (d.components.showCodes = v))} />
        <ToggleRow label="Show zero-value rows" value={t.components.showZeroRows} onChange={(v) => update((d) => void (d.components.showZeroRows = v))} />
        <ToggleRow label="Show section totals" value={t.components.showSectionTotals} onChange={(v) => update((d) => void (d.components.showSectionTotals = v))} />
        <FieldLabel>Table layout</FieldLabel>
        <Segmented
          value={t.components.layout}
          options={[{ value: "dual", label: "Two columns (government)" }, { value: "single", label: "Single column" }]}
          onChange={(v) => update((d) => void (d.components.layout = v))}
        />
        <Stepper label="Code column width" value={t.components.columnWidths.code} min={5} max={40} suffix="%" onChange={(v) => update((d) => void (d.components.columnWidths.code = v))} />
        <Stepper label="Name column width" value={t.components.columnWidths.name} min={20} max={80} suffix="%" onChange={(v) => update((d) => void (d.components.columnWidths.name = v))} />
        <Stepper label="Amount column width" value={t.components.columnWidths.amount} min={10} max={50} suffix="%" onChange={(v) => update((d) => void (d.components.columnWidths.amount = v))} />
        <FieldLabel>Components</FieldLabel>
        {componentRows.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No salary components configured yet.</Text>
        ) : null}
        {componentRows.map((c) => {
          const o = t.components.overrides[c.key] || {};
          const setO = (patch: Partial<typeof o>) =>
            update((d) => {
              const cur = { ...(d.components.overrides[c.key] || {}), ...patch };
              Object.keys(cur).forEach((k) => (cur as any)[k] === undefined || (cur as any)[k] === "" ? delete (cur as any)[k] : null);
              if (Object.keys(cur).length === 0) delete d.components.overrides[c.key];
              else d.components.overrides[c.key] = cur;
            });
          return (
            <View key={c.key} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <SwitchInline value={!o.hidden} label={`Show ${c.name}`} onChange={(v) => setO({ hidden: v ? undefined : true })} />
                <Text style={{ flex: 1, color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                  {c.code ? `${c.code} · ` : ""}
                  {c.name}
                </Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                  {c.category === "earning" ? "Earning" : c.category === "deduction" ? "Deduction" : "Employer"}
                </Text>
              </View>
              {narrow ? (
                // Phone layout: 2 × 2 grid instead of four squeezed inputs in one row
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Input value={o.label || ""} placeholder="Display label" onChangeText={(v) => setO({ label: v || undefined })} style={{ flex: 1, paddingVertical: 6 }} />
                    <Input value={o.note || ""} placeholder="Note after name" onChangeText={(v) => setO({ note: v || undefined })} style={{ flex: 1, paddingVertical: 6 }} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Input value={o.group || ""} placeholder="Group" onChangeText={(v) => setO({ group: v || undefined })} style={{ flex: 1, paddingVertical: 6 }} />
                    <Input
                      value={o.order === undefined ? "" : String(o.order)}
                      placeholder="Order"
                      accessibilityLabel={`Display order for ${c.name}`}
                      onChangeText={(v) => setO({ order: v.trim() === "" || isNaN(Number(v)) ? undefined : Number(v) })}
                      style={{ width: 84, paddingVertical: 6 }}
                    />
                  </View>
                </View>
              ) : (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Input value={o.label || ""} placeholder="Display label" onChangeText={(v) => setO({ label: v || undefined })} style={{ flex: 2, paddingVertical: 6 }} />
                <Input value={o.note || ""} placeholder="Note after name" onChangeText={(v) => setO({ note: v || undefined })} style={{ flex: 2, paddingVertical: 6 }} />
                <Input value={o.group || ""} placeholder="Group" onChangeText={(v) => setO({ group: v || undefined })} style={{ flex: 1, paddingVertical: 6 }} />
                <Input
                  value={o.order === undefined ? "" : String(o.order)}
                  placeholder="Order"
                  accessibilityLabel={`Display order for ${c.name}`}
                  onChangeText={(v) => setO({ order: v.trim() === "" || isNaN(Number(v)) ? undefined : Number(v) })}
                  style={{ width: 64, paddingVertical: 6 }}
                />
              </View>
              )}
            </View>
          );
        })}
      </Panel>

      <Panel
        title="Your Own Text (anywhere on the slip)"
        subtitle="Write any text above or below any section. Edit or delete it any time. It never changes payroll figures."
      >
        {t.textBlocks.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            No custom text yet. Tip: you can also add text next to any single field with the ✎ button under “Sections & Fields”.
          </Text>
        ) : null}
        {t.textBlocks.map((b, bi) => (
          <TextBlockEditor
            key={b.id}
            block={b}
            showAnchor
            sections={t.sections.map((x) => ({ key: x.key, title: x.title }))}
            onChange={(next) => update((d) => void (d.textBlocks[bi] = next))}
            onRemove={() => update((d) => void d.textBlocks.splice(bi, 1))}
          />
        ))}
        <SmallButton label="+ Add text" onPress={() => update((d) => void d.textBlocks.push(createTextBlock("summary", "after")))} />
      </Panel>

      <Panel title="Custom Fields" subtitle="Extra presentation fields. They never create payroll transactions.">
        {t.customFields.map((cf, i) => (
          <CustomFieldEditor
            key={cf.id}
            field={cf}
            onChange={(next) => update((d) => void (d.customFields[i] = next))}
            onRemove={() => update((d) => void d.customFields.splice(i, 1))}
          />
        ))}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <SmallButton
            label="+ Text field"
            onPress={() =>
              update((d) =>
                void d.customFields.push({ id: `cf_${Date.now().toString(36)}`, label: "Reference No.", visible: true, source: "text", value: "", placement: "custom" })
              )
            }
          />
          <SmallButton
            label="+ Payroll value"
            onPress={() =>
              update((d) =>
                void d.customFields.push({
                  id: `cf_${Date.now().toString(36)}`,
                  label: "Net Salary",
                  visible: true,
                  source: "mapped",
                  mappedKey: "totals.netSalary",
                  placement: "custom",
                })
              )
            }
          />
        </View>
      </Panel>

      <Panel title="Footer">
        <ToggleRow label="Signature lines" value={t.footer.showSignatures} onChange={(v) => update((d) => void (d.footer.showSignatures = v))} />
        {t.footer.showSignatures ? (
          <View>
            <FieldLabel>Signature labels (comma separated, max 4)</FieldLabel>
            <Input
              value={t.footer.signatureLabels.join(", ")}
              onChangeText={(v) =>
                update((d) => void (d.footer.signatureLabels = v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4)))
              }
            />
          </View>
        ) : null}
        <View>
          <FieldLabel>Notes</FieldLabel>
          <Input value={t.footer.notes} onChangeText={(v) => update((d) => void (d.footer.notes = v))} multiline maxLength={1000} />
        </View>
        <View>
          <FieldLabel>Digital document notice</FieldLabel>
          <Input value={t.footer.digitalNotice} onChangeText={(v) => update((d) => void (d.footer.digitalNotice = v))} multiline maxLength={500} />
        </View>
        <View>
          <FieldLabel>Additional footer text</FieldLabel>
          <Input value={t.footer.customText} onChangeText={(v) => update((d) => void (d.footer.customText = v))} multiline maxLength={1000} />
        </View>
      </Panel>
    </ControlsContainer>
  );

  const preview = inline ? (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "700" }}>PREVIEW WITH</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <Segmented
          value={previewId}
          options={[
            { value: "sample", label: "Sample data" },
            ...previewEntries.slice(0, 15).map((e) => ({ value: e.id as string, label: `${e.employeeName} · ${e.month}` })),
          ]}
          onChange={setPreviewId}
        />
      </ScrollView>
      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Full page shown to fit your screen — pinch to zoom in.</Text>
      <View style={{ height: Math.max(420, Math.round(height * 0.68)), borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
        <PayslipPreview html={html} />
      </View>
    </View>
  ) : (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "700" }}>PREVIEW WITH</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Segmented
            value={previewId}
            options={[
              { value: "sample", label: "Sample data" },
              ...previewEntries.slice(0, 15).map((e) => ({ value: e.id as string, label: `${e.employeeName} · ${e.month}` })),
            ]}
            onChange={setPreviewId}
          />
        </ScrollView>
      </View>
      <View style={{ flex: 1, minHeight: 420, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
        <PayslipPreview html={html} />
      </View>
    </View>
  );

  const errorBox =
    submitted && errors.length > 0 ? (
      <View style={{ padding: 10, borderRadius: 8, backgroundColor: colors.expense + "14", borderWidth: 1, borderColor: colors.expense + "55" }}>
        {errors.map((e) => (
          <Text key={e} style={{ color: colors.expense, fontSize: 12 }}>• {e}</Text>
        ))}
      </View>
    ) : null;

  if (!wide) {
    // Phone layout: title, full-width Edit/Preview tabs, then evenly sized Cancel / Save buttons
    return (
      <View style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800" }} numberOfLines={2}>
            {initial.id ? `Edit: ${initial.name}` : "New Template"}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            {initial.isBuiltIn ? "Built-in template — saving stores your organization's customized version (restorable)." : "Custom template"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 3, backgroundColor: colors.background }}>
          {([["edit", "✎  Edit settings"], ["preview", "👁  Preview slip"]] as const).map(([key, label]) => {
            const active = mobileView === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setMobileView(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center", backgroundColor: active ? ACCENT : "transparent" }}
              >
                <Text style={{ color: active ? "#FFF" : colors.foreground, fontSize: 13, fontWeight: "700" }}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SmallButton label="Cancel" onPress={onCancel} />
          </View>
          <View style={{ flex: 1 }}>
            <SmallButton
              label={saving ? "Saving…" : "Save Template"}
              tone="primary"
              disabled={saving || !dirty}
              onPress={() => {
                setSubmitted(true);
                if (errors.length === 0) onSave(t);
              }}
            />
          </View>
        </View>
        {errorBox}
        {mobileView === "edit" ? controls : preview}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800" }}>
            {initial.id ? `Edit: ${initial.name}` : "New Template"}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {initial.isBuiltIn ? "Built-in template — saving stores your organization's customized version (restorable)." : "Custom template"}
          </Text>
        </View>
        {!wide ? (
          <Segmented value={mobileView} options={[{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }]} onChange={setMobileView} />
        ) : null}
        <SmallButton label="Cancel" onPress={onCancel} />
        <SmallButton
          label={saving ? "Saving…" : "Save Template"}
          tone="primary"
          disabled={saving || !dirty}
          onPress={() => {
            setSubmitted(true);
            if (errors.length === 0) onSave(t);
          }}
        />
      </View>
      {submitted && errors.length > 0 ? (
        <View style={{ padding: 10, borderRadius: 8, backgroundColor: colors.expense + "14", borderWidth: 1, borderColor: colors.expense + "55" }}>
          {errors.map((e) => (
            <Text key={e} style={{ color: colors.expense, fontSize: 12 }}>• {e}</Text>
          ))}
        </View>
      ) : null}
      {wide ? (
        <View style={{ flex: 1, flexDirection: "row", gap: 14 }}>
          <View style={{ width: 420 }}>{controls}</View>
          {preview}
        </View>
      ) : mobileView === "edit" ? (
        <View style={{ flex: 1 }}>{controls}</View>
      ) : (
        preview
      )}
    </View>
  );
}

function SwitchInline({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={() => !disabled && onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      style={{
        width: 36,
        height: 22,
        borderRadius: 11,
        padding: 2,
        backgroundColor: value ? ACCENT : colors.border,
        opacity: disabled ? 0.5 : 1,
        alignItems: value ? "flex-end" : "flex-start",
      }}
    >
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFF" }} />
    </TouchableOpacity>
  );
}

function CustomFieldEditor({ field, onChange, onRemove }: { field: PayslipCustomField; onChange: (f: PayslipCustomField) => void; onRemove: () => void }) {
  const colors = useColors();
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <SwitchInline value={field.visible} label={`Show ${field.label}`} onChange={(v) => onChange({ ...field, visible: v })} />
        <Input value={field.label} placeholder="Label" maxLength={120} onChangeText={(v) => onChange({ ...field, label: v })} style={{ flex: 1, paddingVertical: 6 }} />
        <SmallButton label="Remove" tone="danger" onPress={onRemove} />
      </View>
      {field.source === "text" ? (
        <Input value={field.value || ""} placeholder="Value printed on every slip" maxLength={1000} onChangeText={(v) => onChange({ ...field, value: v })} />
      ) : (
        <View>
          <FieldLabel>Shows payroll value (read-only)</FieldLabel>
          <Segmented value={field.mappedKey || ""} options={MAPPABLE_FIELDS.map((m) => ({ value: m.key, label: m.label }))} onChange={(v) => onChange({ ...field, mappedKey: v })} />
        </View>
      )}
      <FieldLabel>Placement</FieldLabel>
      <Segmented
        value={field.placement}
        options={[
          { value: "employee", label: "Employee info" },
          { value: "payment", label: "Payment" },
          { value: "attendance", label: "Attendance" },
          { value: "tax", label: "Income tax" },
          { value: "custom", label: "Additional info" },
          { value: "footer", label: "Footer" },
        ]}
        onChange={(v) => onChange({ ...field, placement: v })}
      />
    </View>
  );
}

const TEXT_COLORS = ["#000000", "#334155", "#1E3A8A", "#065F46", "#B91C1C", "#7C2D12"];

function TextBlockEditor({
  block,
  onChange,
  onRemove,
  showAnchor,
  sections,
}: {
  block: PayslipTextBlock;
  onChange: (b: PayslipTextBlock) => void;
  onRemove: () => void;
  showAnchor?: boolean;
  sections?: Array<{ key: PayslipSectionKey; title: string }>;
}) {
  const colors = useColors();
  const set = (patch: Partial<PayslipTextBlock>) => onChange({ ...block, ...patch });
  return (
    <View style={{ borderWidth: 1, borderColor: ACCENT + "66", borderRadius: 8, padding: 8, gap: 8, backgroundColor: ACCENT + "08" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <SwitchInline value={block.visible} label="Show this text" onChange={(v) => set({ visible: v })} />
        <Text style={{ flex: 1, color: colors.foreground, fontSize: 12, fontWeight: "700" }}>
          Your text · {block.position === "before" ? "above" : "below"}{" "}
          {sections?.find((x) => x.key === block.anchor)?.title || block.anchor}
        </Text>
        <SmallButton label="Delete" tone="danger" onPress={onRemove} />
      </View>
      <Input value={block.text} onChangeText={(v) => set({ text: v })} placeholder="Write anything here…" multiline maxLength={2000} />
      {showAnchor && sections ? (
        <View>
          <FieldLabel>Place near section</FieldLabel>
          <Segmented value={block.anchor} options={sections.map((x) => ({ value: x.key, label: x.title }))} onChange={(v) => set({ anchor: v })} />
        </View>
      ) : null}
      <Segmented
        value={block.position}
        options={[{ value: "before", label: "Above section" }, { value: "after", label: "Below section" }]}
        onChange={(v) => set({ position: v })}
      />
      <Segmented
        value={block.align}
        options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]}
        onChange={(v) => set({ align: v })}
      />
      <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        {([["bold", "Bold"], ["italic", "Italic"], ["boxed", "Box"]] as const).map(([k, label]) => (
          <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <SwitchInline value={block[k]} label={label} onChange={(v) => set({ [k]: v } as Partial<PayslipTextBlock>)} />
            <Text style={{ color: colors.foreground, fontSize: 12 }}>{label}</Text>
          </View>
        ))}
      </View>
      <Stepper label="Text size" value={block.scale} step={0.1} min={0.6} max={2.5} suffix="×" onChange={(v) => set({ scale: v })} />
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Colour</Text>
        {TEXT_COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            accessibilityLabel={`Text colour ${c}`}
            onPress={() => set({ color: c })}
            style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c, borderWidth: block.color === c ? 3 : 1, borderColor: block.color === c ? ACCENT : colors.border }}
          />
        ))}
      </View>
    </View>
  );
}
