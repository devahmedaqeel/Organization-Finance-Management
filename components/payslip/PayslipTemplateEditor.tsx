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
  PayslipRenderData,
  buildPayslipRenderData,
  buildSamplePayslipData,
  renderPayslipHtml,
} from "@/services/payslipTemplateRenderer";
import { PayslipPreview } from "./PayslipPreview";
import { DirectPayslipTemplateEditor } from "./DirectPayslipTemplateEditor";
import {
  ACCENT,
  ConfirmDialog,
  FieldLabel,
  Input,
  Panel,
  Segmented,
  SelectInput,
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
const SPACING_PRESETS = [
  { value: "compact", label: "Compact", margin: 10, spacing: 8 },
  { value: "balanced", label: "Balanced", margin: 14, spacing: 14 },
  { value: "spacious", label: "Spacious", margin: 18, spacing: 22 },
];
const EDITOR_TABS = [
  { key: "basics", label: "Style" },
  { key: "sections", label: "Sections" },
  { key: "header", label: "Header & footer" },
  { key: "items", label: "Salary rows" },
] as const;

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
  const [editorWidth, setEditorWidth] = useState(0);
  const availableWidth = editorWidth || width;
  const isNative = Platform.OS !== "web";
  const wide = !isNative && availableWidth >= 960;
  // Phones use the page scroll; larger browsers keep the toolbar and preview in view.
  const inline = isNative || availableWidth < 640;
  const narrow = availableWidth < 560;
  const [t, setT] = useState<PayslipTemplate>(() => cloneTemplate(initial));
  const [editingMode, setEditingMode] = useState<"direct" | "settings">(isNative ? "settings" : "direct");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [previewId, setPreviewId] = useState<string>("sample");
  const [previewDraft, setPreviewDraft] = useState<PayslipRenderData | null>(null);
  const [editingSample, setEditingSample] = useState(false);
  const [openSection, setOpenSection] = useState<PayslipSectionKey | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  // Settings are grouped into tabs so users only see one topic at a time
  const [tab, setTab] = useState<"basics" | "header" | "sections" | "items">("basics");
  const [compQuery, setCompQuery] = useState("");
  const [compCat, setCompCat] = useState<"all" | "earning" | "deduction" | "employer">("all");
  const [compOpen, setCompOpen] = useState<string | null>(null);

  const update = (fn: (draft: PayslipTemplate) => void) =>
    setT((prev) => {
      const next = cloneTemplate(prev);
      fn(next);
      return next;
    });

  const errors = useMemo(() => validateTemplate(t), [t]);
  const dirty = useMemo(() => !initial.id || JSON.stringify(t) !== JSON.stringify(initial), [t, initial]);

  const previewData = useMemo(() => {
    const entry = previewEntries.find((e) => e.id === previewId);
    return previewDraft || (entry && editingMode !== "direct"
      ? buildPayslipRenderData(entry, org, { canViewSensitive })
      : buildSamplePayslipData(org));
  }, [org, previewEntries, previewId, canViewSensitive, editingMode, previewDraft]);
  const html = useMemo(() => renderPayslipHtml(t, previewData, { mode: "screen", showLogoPlaceholder: true, editable: editingMode === "direct", editablePreview: editingSample }), [t, previewData, editingMode, editingSample]);

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

  if (editingMode === "direct") {
    return <DirectPayslipTemplateEditor template={t} html={html} dirty={dirty} saving={saving} errors={submitted ? errors : []}
      previewData={previewData} editingSample={editingSample} onPreviewChange={setPreviewDraft} onSampleEditingChange={setEditingSample}
      onChange={setT} onCancel={onCancel} onMore={() => setEditingMode("settings")}
      onSave={(draft) => { setSubmitted(true); if (validateTemplate(draft).length === 0) onSave(draft); }} />;
  }

  const ControlsContainer: any = inline ? View : ScrollView;
  const containerProps = inline
    ? { style: { gap: 10, paddingBottom: 24 } }
    : { style: { flex: 1, minHeight: 0 }, contentContainerStyle: { gap: 12, paddingBottom: 20 }, keyboardShouldPersistTaps: "handled" };

  const navigation = (
      <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {EDITOR_TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ flexBasis: "47%", flexGrow: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "10" : colors.card }}
            >
              <Text style={{ color: active ? colors.primary : colors.foreground, fontSize: 13.5, fontFamily: "Inter_600SemiBold" }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
  );

  const controls = (
    <ControlsContainer {...containerProps}>
      {tab === "basics" && (
      <Panel title="Template details" subtitle={t.name || "Name and availability"}>
        <View>
          <FieldLabel>Template name</FieldLabel>
          <Input value={t.name} onChangeText={(v) => update((d) => void (d.name = v))} maxLength={120} placeholder="e.g. Head Office Payslip" />
        </View>
        <View>
          <FieldLabel>Description</FieldLabel>
          <Input value={t.description || ""} onChangeText={(v) => update((d) => void (d.description = v))} multiline maxLength={500} />
        </View>
        <ToggleRow label="Available for payslips" value={t.isActive} onChange={(v) => update((d) => void (d.isActive = v))} />
      </Panel>
      )}

      {tab === "basics" && (
      <Panel defaultOpen title="Appearance" subtitle="Choose the look of your payslip">
        <View>
          <FieldLabel>Font</FieldLabel>
          <SelectInput label="Payslip font" value={t.page.fontFamily} options={FONT_FAMILIES.map((f) => ({ value: f.key, label: f.label }))} onChange={(v) => update((d) => void (d.page.fontFamily = v))} />
        </View>
        <View>
          <FieldLabel>Spacing</FieldLabel>
          <Segmented
            value={SPACING_PRESETS.find((p) => p.margin === t.page.marginMm && p.spacing === t.page.sectionSpacingPx)?.value || "custom"}
            options={SPACING_PRESETS}
            onChange={(v) => {
              const preset = SPACING_PRESETS.find((p) => p.value === v);
              if (preset) update((d) => { d.page.marginMm = preset.margin; d.page.sectionSpacingPx = preset.spacing; });
            }}
          />
          {!SPACING_PRESETS.some((p) => p.margin === t.page.marginMm && p.spacing === t.page.sectionSpacingPx) ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>Custom spacing · adjust it in Page settings below.</Text>
          ) : null}
        </View>
        <View>
          <FieldLabel>Accent colour</FieldLabel>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {ACCENT_SWATCHES.map((c) => (
              <TouchableOpacity
                key={c} accessibilityRole="button" accessibilityState={{ selected: t.page.accentColor === c }}
                accessibilityLabel={"Accent colour " + c}
                onPress={() => update((d) => void (d.page.accentColor = c))}
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: t.page.accentColor === c ? 3 : 1, borderColor: t.page.accentColor === c ? colors.primary : colors.border }}
              />
            ))}
            <Input value={t.page.accentColor} onChangeText={(v) => update((d) => void (d.page.accentColor = v))} maxLength={7} accessibilityLabel="Custom accent colour hex" style={{ width: 96 }} />
          </View>
        </View>
      </Panel>
      )}

      {tab === "basics" && (
      <Panel title="Page settings" subtitle="Paper size, text size and fine adjustments">
        <View>
          <FieldLabel>Paper size</FieldLabel>
          <Segmented value={t.page.size} options={[{ value: "A4", label: "A4" }, { value: "Letter", label: "Letter" }]} onChange={(v) => update((d) => void (d.page.size = v))} />
        </View>
        <View>
          <FieldLabel>Orientation</FieldLabel>
          <Segmented value={t.page.orientation} options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]} onChange={(v) => update((d) => void (d.page.orientation = v))} />
        </View>
        <Stepper label="Text size" value={t.page.fontSizePt} step={0.5} min={6} max={14} suffix=" pt" onChange={(v) => update((d) => void (d.page.fontSizePt = v))} />
        <Stepper label="Page margins" value={t.page.marginMm} min={4} max={30} suffix=" mm" onChange={(v) => update((d) => void (d.page.marginMm = v))} />
        <Stepper label="Section spacing" value={t.page.sectionSpacingPx} min={0} max={40} suffix=" px" onChange={(v) => update((d) => void (d.page.sectionSpacingPx = v))} />
        <View>
          <FieldLabel>Table borders</FieldLabel>
          <Segmented value={t.page.tableBorders} options={[{ value: "grid", label: "Full grid" }, { value: "horizontal", label: "Row lines" }, { value: "none", label: "None" }]} onChange={(v) => update((d) => void (d.page.tableBorders = v))} />
        </View>
      </Panel>
      )}

      {tab === "header" && (
      <Panel defaultOpen title="Header & logo" subtitle="The first part of your payslip">
        <View>
          <FieldLabel>Document title</FieldLabel>
          <Input value={t.header.documentTitle} onChangeText={(v) => update((d) => void (d.header.documentTitle = v))} maxLength={120} placeholder="Monthly Salary Statement" />
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
          {org.logo ? "Using your Organization Profile logo. Change the image in Settings." : "Add your logo in Settings → Organization Profile."}
        </Text>
        <ToggleRow label="Show logo" value={t.logo.visible} onChange={(v) => update((d) => void (d.logo.visible = v))} />
        {t.logo.visible ? (
          <View>
            <FieldLabel>Logo position</FieldLabel>
            <Segmented value={t.logo.position} options={[{ value: "left", label: "Left" }, { value: "center", label: "Top centre" }, { value: "right", label: "Right" }]} onChange={(v) => update((d) => void (d.logo.position = v))} />
          </View>
        ) : null}
        <Panel title="Size & alignment" subtitle="Optional header adjustments">
          {t.logo.visible ? (
            <>
              <Stepper label="Logo height" value={t.logo.heightPx} step={4} min={20} max={160} suffix=" px" onChange={(v) => update((d) => void (d.logo.heightPx = v))} />
              <Stepper label="Space around logo" value={t.logo.spacingPx} step={2} min={0} max={48} suffix=" px" onChange={(v) => update((d) => void (d.logo.spacingPx = v))} />
            </>
          ) : null}
          <View>
            <FieldLabel>Header text alignment</FieldLabel>
            <Segmented value={t.header.align} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} onChange={(v) => update((d) => void (d.header.align = v))} />
          </View>
          <ToggleRow label="Divider line under header" value={t.header.showDivider} onChange={(v) => update((d) => void (d.header.showDivider = v))} />
        </Panel>
      </Panel>
      )}

      {tab === "basics" && (
      <Panel title="Numbers & dates" subtitle="Currency, decimals and date display">
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
        <SelectInput label="Payslip date format" value={t.format.dateFormat} options={DATE_FORMATS.map((f) => ({ value: f, label: f }))} onChange={(v) => update((d) => void (d.format.dateFormat = v))} />
      </Panel>
      )}

      {tab === "sections" && (
      <Panel defaultOpen title="Payslip sections" subtitle="Use the switches to show or hide a section. Select Edit to change its details or position.">
        {[t.sections.find((s) => s.key === "header")!, ...bodySections, t.sections.find((s) => s.key === "footer")!].map((s) => {
          const reorderable = REORDERABLE_SECTIONS.includes(s.key);
          const idx = bodySections.findIndex((b) => b.key === s.key);
          const expanded = openSection === s.key;
          const shownCount = s.fields.filter((f) => f.visible).length;
          const setField = (fi: number, patch: Partial<(typeof s.fields)[number]>) =>
            update((d) => void Object.assign(d.sections.find((x) => x.key === s.key)!.fields[fi], patch));
          return (
            <View
              key={s.key}
              style={{ borderWidth: 1, borderColor: expanded ? colors.primary : colors.border, borderRadius: 10, overflow: "hidden", backgroundColor: colors.card }}
            >
              {/* Section header row */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: expanded ? colors.primary + "0C" : "transparent" }}>
                <SwitchInline
                  value={s.visible}
                  label={`Show ${s.title} on payslips`}
                  disabled={s.key === "summary"}
                  onChange={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.visible = v))}
                />
                <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => setOpenSection(expanded ? null : s.key)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={"Edit " + s.title}>
                  <Text style={{ color: s.visible ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>{s.title}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 1 }}>
                    {!s.visible
                      ? "Hidden from payslips"
                      : s.fields.length
                      ? `${shownCount} of ${s.fields.length} details shown`
                      : s.key === "summary"
                      ? "Always shown"
                      : "Shown"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setOpenSection(expanded ? null : s.key)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={"Edit " + s.title + " settings"} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{expanded ? "Close ▴" : "Edit ▾"}</Text>
                </TouchableOpacity>
              </View>

              {expanded ? (
                <View style={{ gap: 12, padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  {reorderable ? (
                    <View style={{ gap: 6 }}>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Section {idx + 1} of {bodySections.length}</Text>
                      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                        <SmallButton label="↑ Move up" accessibilityLabel={"Move " + s.title + " up"} disabled={idx <= 0} onPress={() => setT((p) => moveSection(p, s.key, -1))} />
                        <SmallButton label="↓ Move down" accessibilityLabel={"Move " + s.title + " down"} disabled={idx >= bodySections.length - 1} onPress={() => setT((p) => moveSection(p, s.key, 1))} />
                      </View>
                    </View>
                  ) : null}
                  {s.key !== "header" && s.key !== "footer" ? (
                    <View>
                      <FieldLabel>Heading on the payslip</FieldLabel>
                      <Input value={s.title} maxLength={120} onChangeText={(v) => update((d) => void (d.sections.find((x) => x.key === s.key)!.title = v))} />
                    </View>
                  ) : null}

                  {s.fields.length === 0 ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12.5 }}>This part has no details to choose. You can add your own fields under “Custom Fields”.</Text>
                  ) : (
                    <View style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <FieldLabel>Details to show</FieldLabel>
                        <View style={{ flexDirection: "row", gap: 14 }}>
                          <TouchableOpacity onPress={() => update((d) => d.sections.find((x) => x.key === s.key)!.fields.forEach((f) => (f.visible = true)))}>
                            <Text style={{ color: colors.primary, fontSize: 12.5, fontFamily: "Inter_600SemiBold" }}>Show all</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              update((d) =>
                                d.sections.find((x) => x.key === s.key)!.fields.forEach((f) => {
                                  if (!isRequiredField(s.key, f.key)) f.visible = false;
                                })
                              )
                            }
                          >
                            <Text style={{ color: colors.primary, fontSize: 12.5, fontFamily: "Inter_600SemiBold" }}>Hide optional</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" }}>
                        {s.fields.map((f, fi) => {
                          const required = isRequiredField(s.key, f.key);
                          const sensitive = isSensitiveField(s.key, f.key);
                          const noteKey = `${s.key}.${f.key}`;
                          const editing = noteOpen === noteKey;
                          const hasExtra = Boolean((f.prefix || "").trim() || (f.suffix || "").trim());
                          return (
                            <View key={f.key} style={{ borderTopWidth: fi === 0 ? 0 : 1, borderTopColor: colors.border, backgroundColor: editing ? colors.background : "transparent" }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                                <SwitchInline value={f.visible} disabled={required} label={`Show ${f.label}`} onChange={(v) => setField(fi, { visible: v })} />
                                <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <Text style={{ color: f.visible ? colors.foreground : colors.mutedForeground, fontSize: 13.5 }}>{f.label}</Text>
                                  {required ? <Tag text="Always shown" color={colors.mutedForeground} /> : null}
                                  {sensitive ? <Tag text="🔒 Private" color={colors.warning} /> : null}
                                  {hasExtra ? <Tag text="+ extra text" color={colors.info} /> : null}
                                </View>
                                <TouchableOpacity onPress={() => setNoteOpen(editing ? null : noteKey)} accessibilityRole="button" accessibilityState={{ expanded: editing }} accessibilityLabel={"Edit " + f.label} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                  <Text style={{ color: colors.primary, fontSize: 12.5, fontFamily: "Inter_600SemiBold" }}>{editing ? "Done" : "Edit"}</Text>
                                </TouchableOpacity>
                              </View>
                              {editing ? (
                                <View style={{ paddingHorizontal: 10, paddingBottom: 10, gap: 8 }}>
                                  <View>
                                    <FieldLabel>Name on the payslip</FieldLabel>
                                    <Input value={f.label} maxLength={120} accessibilityLabel={`Label for ${f.key}`} onChangeText={(v) => setField(fi, { label: v })} />
                                  </View>
                                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                                    <SmallButton label="↑ Move up" accessibilityLabel={"Move " + f.label + " up"} disabled={fi === 0} onPress={() => setT((p) => moveField(p, s.key, f.key, -1))} />
                                    <SmallButton label="↓ Move down" accessibilityLabel={"Move " + f.label + " down"} disabled={fi === s.fields.length - 1} onPress={() => setT((p) => moveField(p, s.key, f.key, 1))} />
                                  </View>
                                  <Panel title="Extra text" subtitle="Optional text before or after the value">
                                    <View style={{ flex: 1 }}>
                                      <FieldLabel>Text before the value (optional)</FieldLabel>
                                      <Input value={f.prefix || ""} placeholder="e.g. Rs." maxLength={200} onChangeText={(v) => setField(fi, { prefix: v || undefined })} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <FieldLabel>Text after the value (optional)</FieldLabel>
                                      <Input value={f.suffix || ""} placeholder="e.g. (approved)" maxLength={200} onChangeText={(v) => setField(fi, { suffix: v || undefined })} />
                                    </View>
                                  </Panel>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Text blocks attached to this section */}
                  {t.textBlocks
                    .map((b, bi) => ({ b, bi }))
                    .filter(({ b }) => b.anchor === s.key)
                    .map(({ b, bi }) => (
                      <TextBlockEditor
                        key={b.id}
                        block={b}
                        sections={t.sections.map((x) => ({ key: x.key, title: x.title }))}
                        onChange={(next) => update((d) => void (d.textBlocks[bi] = next))}
                        onRemove={() => update((d) => void d.textBlocks.splice(bi, 1))}
                      />
                    ))}
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <SmallButton label="+ Add text above" onPress={() => update((d) => void d.textBlocks.push(createTextBlock(s.key, "before")))} />
                    <SmallButton label="+ Add text below" onPress={() => update((d) => void d.textBlocks.push(createTextBlock(s.key, "after")))} />
                  </View>

                  {s.fields.some((f) => isSensitiveField(s.key, f.key)) ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                      🔒 Private details are shown in full only to people allowed to see sensitive payroll data. Everyone else sees them masked.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </Panel>
      )}

      {tab === "items" && (
      <Panel defaultOpen title="Salary rows" subtitle="Choose the items to show, then edit their labels or grouping.">
        <ToggleRow label="Show component codes" value={t.components.showCodes} onChange={(v) => update((d) => void (d.components.showCodes = v))} />
        <ToggleRow label="Show zero-value rows" value={t.components.showZeroRows} onChange={(v) => update((d) => void (d.components.showZeroRows = v))} />
        <ToggleRow label="Show section totals" value={t.components.showSectionTotals} onChange={(v) => update((d) => void (d.components.showSectionTotals = v))} />
        <FieldLabel>Table layout</FieldLabel>
        <Segmented
          value={t.components.layout}
          options={[{ value: "dual", label: "Two columns" }, { value: "single", label: "Single column" }]}
          onChange={(v) => update((d) => void (d.components.layout = v))}
        />
        <Panel title="Column widths" subtitle="Optional table adjustments">
        <Stepper label="Code column width" value={t.components.columnWidths.code} min={5} max={40} suffix="%" onChange={(v) => update((d) => void (d.components.columnWidths.code = v))} />
        <Stepper label="Name column width" value={t.components.columnWidths.name} min={20} max={80} suffix="%" onChange={(v) => update((d) => void (d.components.columnWidths.name = v))} />
        <Stepper label="Amount column width" value={t.components.columnWidths.amount} min={10} max={50} suffix="%" onChange={(v) => update((d) => void (d.components.columnWidths.amount = v))} />
        </Panel>
        <FieldLabel>Salary items on the slip</FieldLabel>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
          Turn an item off to hide it from payslips, or click “Customize” to rename it, add a note, group it or change its order.
        </Text>
        <Input value={compQuery} onChangeText={setCompQuery} placeholder="Search items, e.g. allowance, tax, EOBI" />
        <Segmented
          value={compCat}
          options={[
            { value: "all", label: `All (${componentRows.length})` },
            { value: "earning", label: `Earnings (${componentRows.filter((r) => r.category === "earning").length})` },
            { value: "deduction", label: `Deductions (${componentRows.filter((r) => r.category === "deduction").length})` },
            { value: "employer", label: `Employer (${componentRows.filter((r) => r.category !== "earning" && r.category !== "deduction").length})` },
          ]}
          onChange={setCompCat}
        />
        {componentRows.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No salary components configured yet.</Text>
        ) : null}
        {(() => {
          const q = compQuery.trim().toLowerCase();
          const rows = componentRows.filter((r) => {
            const cat = r.category === "earning" || r.category === "deduction" ? r.category : "employer";
            if (compCat !== "all" && cat !== compCat) return false;
            if (q && !(`${r.code || ""} ${r.name}`.toLowerCase().includes(q))) return false;
            return true;
          });
          if (componentRows.length > 0 && rows.length === 0) {
            return <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>No items match your search.</Text>;
          }
          return rows.map((c) => {
          const o = t.components.overrides[c.key] || {};
          const setO = (patch: Partial<typeof o>) =>
            update((d) => {
              const cur = { ...(d.components.overrides[c.key] || {}), ...patch };
              Object.keys(cur).forEach((k) => (cur as any)[k] === undefined || (cur as any)[k] === "" ? delete (cur as any)[k] : null);
              if (Object.keys(cur).length === 0) delete d.components.overrides[c.key];
              else d.components.overrides[c.key] = cur;
            });
          const open = compOpen === c.key;
          const customized = Boolean(o.label || o.note || o.group || o.order !== undefined);
          const catLabel = c.category === "earning" ? "Earning" : c.category === "deduction" ? "Deduction" : "Employer";
          const catColor = c.category === "earning" ? colors.income : c.category === "deduction" ? colors.expense : colors.info;
          return (
            <View key={c.key} style={{ borderWidth: 1, borderColor: open ? colors.primary : colors.border, borderRadius: 8, padding: 10, gap: 8, opacity: o.hidden ? 0.6 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <SwitchInline value={!o.hidden} label={`Show ${c.name}`} onChange={(v) => setO({ hidden: v ? undefined : true })} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{o.label || c.name}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11.5 }}>
                    {c.code ? `${c.code} · ` : ""}
                    {o.label ? `Original: ${c.name}` : o.hidden ? "Hidden from payslips" : "Shown on payslips"}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: catColor + "16" }}>
                  <Text style={{ color: catColor, fontSize: 11.5, fontFamily: "Inter_600SemiBold" }}>{catLabel}</Text>
                </View>
                <TouchableOpacity onPress={() => setCompOpen(open ? null : c.key)} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text style={{ color: colors.primary, fontSize: 12.5, fontFamily: "Inter_600SemiBold" }}>
                    {open ? "Done" : customized ? "Edit ✓" : "Customize"}
                  </Text>
                </TouchableOpacity>
              </View>
              {open ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: narrow ? "column" : "row", gap: 8 }}>
                    <View style={{ flex: 2 }}>
                      <FieldLabel>Name on payslip</FieldLabel>
                      <Input value={o.label || ""} placeholder={c.name} onChangeText={(v) => setO({ label: v || undefined })} style={{ paddingVertical: 6 }} />
                    </View>
                    <View style={{ flex: 2 }}>
                      <FieldLabel>Note after name</FieldLabel>
                      <Input value={o.note || ""} placeholder="e.g. 45% of basic" onChangeText={(v) => setO({ note: v || undefined })} style={{ paddingVertical: 6 }} />
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 2 }}>
                      <FieldLabel>Group heading</FieldLabel>
                      <Input value={o.group || ""} placeholder="e.g. Allowances" onChangeText={(v) => setO({ group: v || undefined })} style={{ paddingVertical: 6 }} />
                    </View>
                    <View style={{ width: 110 }}>
                      <FieldLabel>Position</FieldLabel>
                      <Input
                        value={o.order === undefined ? "" : String(o.order)}
                        placeholder="1, 2, 3…"
                        accessibilityLabel={`Display order for ${c.name}`}
                        onChangeText={(v) => setO({ order: v.trim() === "" || isNaN(Number(v)) ? undefined : Number(v) })}
                        style={{ paddingVertical: 6 }}
                      />
                    </View>
                  </View>
                  {customized ? (
                    <TouchableOpacity onPress={() => setO({ label: undefined, note: undefined, group: undefined, order: undefined })}>
                      <Text style={{ color: colors.expense, fontSize: 12.5, fontFamily: "Inter_600SemiBold" }}>Reset this item</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
          });
        })()}
      </Panel>
      )}

      {tab === "sections" && (
      <Panel
        title="Notes & messages"
        subtitle="Add your own text above or below a section"
      >
        {t.textBlocks.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            No text added yet. Click “+ Add a text block” to write your first note.
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
        <SmallButton label="+ Add a text block" tone="primary" onPress={() => update((d) => void d.textBlocks.push(createTextBlock("summary", "after")))} />
      </Panel>
      )}

      {tab === "sections" && (
      <Panel title="Extra fields" subtitle="Add fixed text or an existing payroll value">
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
      )}

      {tab === "header" && (
      <Panel title="Footer & signatures" subtitle="Signatures, notes and document notices">
        <ToggleRow label="Signature lines" value={t.footer.showSignatures} onChange={(v) => update((d) => void (d.footer.showSignatures = v))} />
        {t.footer.showSignatures ? (
          <View style={{ gap: 8 }}>
            <FieldLabel>Signature labels</FieldLabel>
            {t.footer.signatureLabels.map((label, index) => (
              <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Input value={label} accessibilityLabel={"Signature label " + (index + 1)} placeholder="e.g. Approved by" maxLength={80} style={{ flex: 1, minWidth: 0 }} onChangeText={(v) => update((d) => void (d.footer.signatureLabels[index] = v))} />
                <SmallButton label="Remove" accessibilityLabel={"Remove signature " + (index + 1)} onPress={() => update((d) => void d.footer.signatureLabels.splice(index, 1))} />
              </View>
            ))}
            <SmallButton label="+ Add signature" disabled={t.footer.signatureLabels.length >= 4} onPress={() => update((d) => void d.footer.signatureLabels.push("Signature"))} />
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
      )}
    </ControlsContainer>
  );

  const preview = (
    <View style={{ flex: inline ? undefined : 1, minWidth: 0, minHeight: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden", backgroundColor: colors.card }}>
      <View style={{ padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Live preview</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Updates as you edit</Text>
        </View>
        <SelectInput
          label="Preview employee"
          value={previewId}
          options={[
            { value: "sample", label: "Sample employee" },
            ...previewEntries.slice(0, 15).map((e) => ({ value: e.id as string, label: e.employeeName + " · " + e.month })),
          ]}
          onChange={(id) => { setPreviewId(id); setPreviewDraft(null); setEditingSample(false); }}
        />
      </View>
      <View style={inline ? { height: Math.max(320, Math.min(720, Math.round(height * 0.68))) } : { flex: 1, minHeight: 0 }}>
        <PayslipPreview html={html} />
      </View>
    </View>
  );

  const save = () => {
    setSubmitted(true);
    if (errors.length === 0) onSave(t);
  };

  return (
    <View
      onLayout={(event) => {
        const measured = Math.round(event.nativeEvent.layout.width);
        if (measured && Math.abs(measured - editorWidth) > 2) setEditorWidth(measured);
      }}
      style={{ gap: 12, minWidth: 0, ...(inline ? {} : { height: Math.max(400, Math.min(820, height - 252)) }) }}
    >
      <View style={{ padding: 14, gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
        <View style={{ flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", gap: 12 }}>
          <View style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: 4 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>PAYSLIP TEMPLATE</Text>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_600SemiBold" }} numberOfLines={2}>{t.name || "Untitled template"}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
              {initial.isBuiltIn ? "Built-in template · Saves as your organization's own version." : "Edit the style and content, check the preview, then save."}
            </Text>
          </View>
          <View style={{ gap: 8, alignItems: wide ? "flex-end" : "flex-start" }}>
            <Text accessibilityLiveRegion="polite" style={{ color: dirty ? colors.warning : colors.mutedForeground, fontSize: 12 }}>{saving ? "Saving…" : dirty ? "● Unsaved changes" : "All changes saved"}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {!isNative ? <SmallButton label="Edit on page" disabled={saving} onPress={() => setEditingMode("direct")} /> : null}
              {dirty ? <SmallButton label="Reset" accessibilityLabel="Reset unsaved template changes" disabled={saving} onPress={() => setResetOpen(true)} /> : null}
              <SmallButton label="Cancel" disabled={saving} onPress={onCancel} />
              <SmallButton label={saving ? "Saving…" : "Save changes"} tone="primary" disabled={saving || !dirty} onPress={save} />
            </View>
          </View>
        </View>
      </View>

      {submitted && errors.length > 0 ? (
        <View accessibilityLiveRegion="polite" style={{ padding: 10, borderRadius: 8, backgroundColor: colors.expense + "14", borderWidth: 1, borderColor: colors.expense + "55" }}>
          <Text style={{ color: colors.expense, fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 4 }}>Please check these settings</Text>
          {errors.map((error) => <Text key={error} style={{ color: colors.expense, fontSize: 12 }}>• {error}</Text>)}
        </View>
      ) : null}

      {!wide ? (
        <View accessibilityRole="tablist" style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 3, backgroundColor: colors.card }}>
          {([{ key: "edit", label: "Edit template" }, { key: "preview", label: "Preview payslip" }] as const).map(({ key, label }) => (
            <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: mobileView === key }} onPress={() => setMobileView(key)} style={{ flex: 1, paddingVertical: 9, borderRadius: 6, alignItems: "center", backgroundColor: mobileView === key ? colors.primary : "transparent" }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: mobileView === key ? "#FFFFFF" : colors.foreground }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={{ flex: inline ? undefined : 1, minHeight: 0, flexDirection: wide ? "row" : "column", gap: 14 }}>
        <View style={{ ...(wide ? { width: Math.min(440, Math.round(availableWidth * 0.4)) } : { flex: inline ? undefined : 1 }), display: wide || mobileView === "edit" ? "flex" : "none", minWidth: 0, minHeight: 0, gap: 10 }}>
          {navigation}
          {controls}
        </View>
        <View style={{ flex: inline ? undefined : 1, minWidth: 0, minHeight: 0, display: wide || mobileView === "preview" ? "flex" : "none" }}>
          {preview}
        </View>
      </View>

      <ConfirmDialog
        visible={resetOpen}
        title="Reset your changes?"
        message="This returns the editor to the version you opened. Your saved template stays the same."
        confirmLabel="Reset changes"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => { setT(cloneTemplate(initial)); setSubmitted(false); setResetOpen(false); }}
      />
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
        <Input value={field.label} placeholder="Label" maxLength={120} onChangeText={(v) => onChange({ ...field, label: v })} style={{ flex: 1, minWidth: 0, paddingVertical: 6 }} />
        <SmallButton label="Remove" tone="danger" onPress={onRemove} />
      </View>
      {field.source === "text" ? (
        <Input value={field.value || ""} placeholder="Value printed on every slip" maxLength={1000} onChangeText={(v) => onChange({ ...field, value: v })} />
      ) : (
        <View>
          <FieldLabel>Shows payroll value (read-only)</FieldLabel>
          <SelectInput label="Payroll value to display" value={field.mappedKey || ""} options={MAPPABLE_FIELDS.map((m) => ({ value: m.key, label: m.label }))} onChange={(v) => onChange({ ...field, mappedKey: v })} />
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
  const sectionTitle = sections?.find((x) => x.key === block.anchor)?.title || block.anchor;

  // Friendly size choices instead of a raw multiplier
  const SIZES = [
    { label: "Small", value: 0.85 },
    { label: "Normal", value: 1 },
    { label: "Large", value: 1.25 },
    { label: "X-Large", value: 1.5 },
  ];
  const nearestSize = SIZES.reduce((a, b) => (Math.abs(b.value - block.scale) < Math.abs(a.value - block.scale) ? b : a));
  const QUICK = [
    "Salary is credited to your bank account on the 1st working day of each month.",
    "This payslip is confidential. Please do not share it.",
    "For any payroll query, contact the HR / Accounts office.",
    "Thank you for your hard work this month.",
  ];

  const Tool = ({ active, label, onPress, a11y, style }: { active: boolean; label: string; onPress: () => void; a11y: string; style?: any }) => (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: active }}
      style={{
        minWidth: 34,
        height: 32,
        paddingHorizontal: 10,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary + "14" : colors.card,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={[{ color: active ? colors.primary : colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }, style]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 12, backgroundColor: colors.card, opacity: block.visible ? 1 : 0.65 }}>
      {/* Title row */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <SwitchInline value={block.visible} label="Show this text on payslips" onChange={(v) => set({ visible: v })} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.foreground, fontSize: 13.5, fontFamily: "Inter_600SemiBold" }}>Text block</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {block.visible ? "Shown" : "Hidden"} · {block.position === "before" ? "above" : "below"} {sectionTitle}
          </Text>
        </View>
        <TouchableOpacity onPress={onRemove} accessibilityRole="button" accessibilityLabel="Delete this text" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={{ color: colors.expense, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* 1. Text */}
      <View style={{ gap: 6 }}>
        <FieldLabel>Your text</FieldLabel>
        <Input
          value={block.text}
          onChangeText={(v) => set({ text: v })}
          placeholder="Type the text you want on the payslip…"
          multiline
          maxLength={2000}
          style={{ minHeight: 70 }}
        />
        {!block.text.trim() ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Or start with a suggestion:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {QUICK.map((q) => (
                <TouchableOpacity
                  key={q}
                  onPress={() => set({ text: q })}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, maxWidth: "100%" }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 12 }}>{q.length > 46 ? q.slice(0, 44) + "…" : q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* 2. Where */}
      <View style={{ gap: 6 }}>
        <FieldLabel>Where on the payslip</FieldLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <Tool active={block.position === "before"} label="Above" a11y="Place above the section" onPress={() => set({ position: "before" })} />
          <Tool active={block.position === "after"} label="Below" a11y="Place below the section" onPress={() => set({ position: "after" })} />
          <Text style={{ color: colors.mutedForeground, fontSize: 12.5 }}>{showAnchor && sections ? "the section:" : sectionTitle}</Text>
        </View>
        {showAnchor && sections ? (
          <SelectInput label="Section for this note" value={block.anchor} options={sections.map((section) => ({ value: section.key, label: section.title }))} onChange={(anchor) => set({ anchor })} />
        ) : null}
      </View>

      {/* 3. Style toolbar */}
      <Panel title="Text appearance" subtitle="Size, colour and alignment">
        <FieldLabel>Style</FieldLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <Tool active={block.bold} label="B" a11y="Bold" onPress={() => set({ bold: !block.bold })} style={{ fontFamily: "Inter_700Bold" }} />
          <Tool active={block.italic} label="I" a11y="Italic" onPress={() => set({ italic: !block.italic })} style={{ fontStyle: "italic" }} />
          <Tool active={block.boxed} label="☐ Box" a11y="Draw a box around the text" onPress={() => set({ boxed: !block.boxed })} />
          <View style={{ width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 2 }} />
          <Tool active={block.align === "left"} label="Left" a11y="Align left" onPress={() => set({ align: "left" })} />
          <Tool active={block.align === "center"} label="Centre" a11y="Align centre" onPress={() => set({ align: "center" })} />
          <Tool active={block.align === "right"} label="Right" a11y="Align right" onPress={() => set({ align: "right" })} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {SIZES.map((sz) => (
            <Tool key={sz.label} active={nearestSize.label === sz.label} label={sz.label} a11y={`Text size ${sz.label}`} onPress={() => set({ scale: sz.value })} />
          ))}
          <View style={{ width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 2 }} />
          {TEXT_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              accessibilityLabel={`Text colour ${c}`}
              onPress={() => set({ color: c })}
              style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c, borderWidth: block.color === c ? 3 : 1, borderColor: block.color === c ? colors.primary : colors.border }}
            />
          ))}
        </View>
      </Panel>

      {/* Mini preview */}
      {block.text.trim() ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>How it looks</Text>
          <View style={{ backgroundColor: "#FFFFFF", borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
            <View style={block.boxed ? { borderWidth: 1, borderColor: "#A1A1AA", borderRadius: 3, padding: 6 } : undefined}>
              <Text
                style={{
                  color: block.color,
                  textAlign: block.align,
                  fontWeight: block.bold ? "700" : "400",
                  fontStyle: block.italic ? "italic" : "normal",
                  fontSize: Math.round(12 * block.scale),
                  lineHeight: Math.round(17 * block.scale),
                }}
              >
                {block.text}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}


/** Small inline label used in the field list (e.g. "Always shown", "Private"). */
function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: color + "16" }}>
      <Text style={{ color, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{text}</Text>
    </View>
  );
}
