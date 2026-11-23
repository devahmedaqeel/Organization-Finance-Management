import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/useColors";
import { PayslipTemplate, PayslipSectionKey, MAPPABLE_FIELDS, cloneTemplate, createTextBlock, isRequiredField, moveSection } from "@/services/payslipTemplateConfig";
import { applyPayslipTextEdit, applyPayslipPreviewEdit, createAddedPayslipSection, moveAddedPayslipSection, payslipPageOrder, PayslipEditTarget, PayslipTextEdit } from "@/services/payslipTemplateEditing";
import type { PayslipRenderData } from "@/services/payslipTemplateRenderer";
import { EditablePayslipCanvas, PayslipCanvasHandle } from "./EditablePayslipCanvas";
import { Input, SelectInput, SmallButton, ToggleRow } from "./controls";

const COLOURS = [
  { name: "Black", value: "#000000" }, { name: "Blue", value: "#1E3A8A" },
  { name: "Green", value: "#065F46" }, { name: "Brown", value: "#7C2D12" },
  { name: "Purple", value: "#4C1D95" }, { name: "Grey", value: "#334155" },
];
const SPACING = [{ value: "compact", label: "Compact", margin: 10, gap: 8 }, { value: "normal", label: "Normal", margin: 14, gap: 14 }, { value: "roomy", label: "More space", margin: 18, gap: 22 }];

/** The page is the editor. The settings editor remains available for fine adjustments. */
export function DirectPayslipTemplateEditor({ template, html, dirty, saving, errors, previewData, editingSample, onPreviewChange, onSampleEditingChange, onChange, onSave, onCancel, onMore }: {
  template: PayslipTemplate; html: string; dirty: boolean; saving: boolean; errors: string[];
  previewData: PayslipRenderData; editingSample: boolean; onPreviewChange: (data: PayslipRenderData) => void; onSampleEditingChange: (editing: boolean) => void;
  onChange: (template: PayslipTemplate) => void; onSave: (template: PayslipTemplate) => void;
  onCancel: () => void; onMore: () => void;
}) {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const canvas = useRef<PayslipCanvasHandle>(null);
  const current = useRef(template);
  const currentData = useRef(previewData);
  const past = useRef<Array<{ template: PayslipTemplate; data: PayslipRenderData }>>([]);
  const future = useRef<Array<{ template: PayslipTemplate; data: PayslipRenderData }>>([]);
  const [, setHistoryVersion] = useState(0);
  const [tool, setTool] = useState<"appearance" | "sections" | "details" | null>(null);
  const [selected, setSelected] = useState<{ section: PayslipSectionKey; addedId?: string; target?: PayslipEditTarget } | null>(null);
  const [focusTarget, setFocusTarget] = useState<PayslipEditTarget | null>(null);
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const [hasPending, setHasPending] = useState(false);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [sampleError, setSampleError] = useState("");
  useEffect(() => { current.current = template; }, [template]);
  useEffect(() => { currentData.current = previewData; }, [previewData]);

  const snapshot = () => ({ template: cloneTemplate(current.current), data: cloneTemplate(currentData.current) });
  const record = (next: PayslipTemplate, data: PayslipRenderData) => {
    const changedTemplate = JSON.stringify(next) !== JSON.stringify(current.current);
    const changedData = JSON.stringify(data) !== JSON.stringify(currentData.current);
    if (!changedTemplate && !changedData) return;
    past.current = [...past.current.slice(-39), snapshot()]; future.current = [];
    current.current = next; currentData.current = data;
    if (changedTemplate) onChange(next);
    if (changedData) onPreviewChange(data);
    setHistoryVersion((v) => v + 1);
  };
  const commit = (next: PayslipTemplate) => record(next, currentData.current);
  const applyEdits = (edits: PayslipTextEdit[]) => {
    let next = current.current; let data = currentData.current;
    let invalidSample = false;
    for (const edit of edits) {
      if (edit.target.kind === "preview-value") { const changed = applyPayslipPreviewEdit(data, edit.target.path, edit.value); if (changed === data) invalidSample = true; data = changed; }
      else next = applyPayslipTextEdit(next, edit.target, edit.value);
    }
    record(next, data);
    if (edits.length) { setCanvasRevision((v) => v + 1); setSampleError(invalidSample ? "Enter a valid number for sample amounts." : ""); }
  };
  const flush = () => { applyEdits(canvas.current?.flush() || []); return current.current; };
  const change = (fn: (draft: PayslipTemplate) => void) => { const next = cloneTemplate(flush()); fn(next); commit(next); };
  const undo = () => {
    flush(); const previous = past.current.pop(); if (!previous) return;
    future.current.push(snapshot()); current.current = previous.template; currentData.current = previous.data;
    onChange(previous.template); onPreviewChange(previous.data); setHistoryVersion((v) => v + 1);
  };
  const redo = () => {
    flush(); const next = future.current.pop(); if (!next) return;
    past.current.push(snapshot()); current.current = next.template; currentData.current = next.data;
    onChange(next.template); onPreviewChange(next.data); setHistoryVersion((v) => v + 1);
  };
  const section = template.sections.find((s) => s.key === selected?.section);
  const added = template.addedSections?.find((s) => s.id === selected?.addedId);
  const pageItems = payslipPageOrder(template);
  const visibleItems = pageItems.filter((item) => item.visible);
  const addedPosition = visibleItems.findIndex((item) => item.addedId === added?.id && Boolean(item.addedId));
  const body = template.sections.filter((s) => s.key !== "header" && s.key !== "footer");
  const position = body.findIndex((s) => s.key === section?.key);
  const selectedTarget = selected?.target;
  const field = selectedTarget?.kind === "field-label" ? section?.fields.find((f) => f.key === selectedTarget.key) : undefined;
  const required = Boolean(field && section && isRequiredField(section.key, field.key));
  const hide = () => {
    const target = selected?.target;
    change((draft) => {
      if (added) {
        const selectedAdded = draft.addedSections!.find((s) => s.id === added.id)!;
        if (target?.kind === "added-field-label" || target?.kind === "added-field-value") selectedAdded.fields.find((f) => f.id === target.fieldId)!.visible = false;
        else selectedAdded.visible = false;
      } else if (target?.kind === "text-block") draft.textBlocks = draft.textBlocks.filter((block) => block.id !== target.id);
      else if (target?.kind === "field-label" && !isRequiredField(target.section, target.key)) {
        const item = draft.sections.find((s) => s.key === target.section)?.fields.find((f) => f.key === target.key);
        if (item) item.visible = false;
      } else if (target?.kind === "component-label") draft.components.overrides = { ...draft.components.overrides, [target.key]: { ...draft.components.overrides[target.key], hidden: true } };
      else if (section && section.key !== "summary") draft.sections.find((s) => s.key === section.key)!.visible = false;
    });
    setSelected(null);
  };
  const target = selected?.target;
  const hideLabel = target?.kind === "text-block" ? "Remove note" : field || target?.kind === "added-field-label" || target?.kind === "added-field-value" ? "Hide detail" : target?.kind === "component-label" ? "Hide salary item" : "Hide section";
  const cannotHide = !added && (required || (!field && target?.kind !== "text-block" && target?.kind !== "component-label" && section?.key === "summary"));
  const addDetail = () => {
    if (!added || added.fields.length >= 30) return;
    const id = "detail_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    change((draft) => { draft.addedSections!.find((s) => s.id === added.id)!.fields.push({ id, label: "Detail", value: "", visible: true, source: "text" }); });
    setTool(null); setFocusTarget({ kind: "added-field-value", id: added.id, fieldId: id });
  };
  const labelStyle = { color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" };

  return <Modal visible animationType="fade" onRequestClose={onCancel}><View style={{ flex: 1, minWidth: 0, overflow: "hidden", backgroundColor: colors.card }}>
    <View style={{ padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_600SemiBold" }}>{template.name || "Edit payslip"}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Click a title, label or note on the page and type.</Text>
        </View>
        <SmallButton label="Close" disabled={saving} onPress={onCancel} />
        <SmallButton label={saving ? "Saving…" : "Save changes"} tone="primary" disabled={saving || (!dirty && !hasPending)} onPress={() => onSave(flush())} />
      </View>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <SmallButton label="Undo" disabled={saving || (!past.current.length && !hasPending)} onPress={undo} />
        <SmallButton label="Redo" disabled={saving || !future.current.length} onPress={redo} />
        <SmallButton label="Look & colour" disabled={saving} onPress={() => { flush(); setTool("appearance"); }} />
        <SmallButton label="Show / hide" disabled={saving} onPress={() => { flush(); setTool("sections"); }} />
        <SmallButton label="+ Add section" disabled={saving || (template.addedSections || []).length >= 20} onPress={() => {
          const addition = createAddedPayslipSection(selected?.section || "summary");
          change((draft) => { draft.addedSections = [...(draft.addedSections || []), addition]; });
          setSelected({ section: addition.anchor, addedId: addition.id });
          setFocusTarget({ kind: "added-section-title", id: addition.id });
        }} />
        <SmallButton label="+ Add note" disabled={saving || template.textBlocks.length >= 40} onPress={() => {
          const block = createTextBlock(selected?.section || "summary", "after");
          change((draft) => { draft.textBlocks.push(block); });
          setFocusTarget({ kind: "text-block", id: block.id });
        }} />
        <SmallButton label={editingSample ? "Finish sample data" : "Edit sample data"} disabled={saving} onPress={() => { flush(); onSampleEditingChange(!editingSample); }} />
        <SmallButton label={zoom === "fit" ? "Zoom in" : "Fit page"} onPress={() => setZoom(zoom === "fit" ? "actual" : "fit")} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Text accessibilityLiveRegion="polite" style={{ color: dirty || hasPending ? colors.warning : colors.mutedForeground, fontSize: 12 }}>{dirty || hasPending ? "Unsaved template changes" : "Template saved"} · {editingSample ? "Editing sample data only. Totals update automatically." : "Sample payslip. Saved payroll stays unchanged."}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => { flush(); onMore(); }}><Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>More editing options</Text></TouchableOpacity>
      </View>
    </View>
    {sampleError ? <Text style={{ color: colors.expense, padding: 10, fontSize: 12 }}>{sampleError}</Text> : null}
    {errors.length ? <View accessibilityLiveRegion="polite" style={{ padding: 10, backgroundColor: colors.expense + "12" }}>{errors.map((error) => <Text key={error} style={{ color: colors.expense, fontSize: 12 }}>{error}</Text>)}</View> : null}
    {section ? <View style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.foreground, fontSize: 12, flex: 1, minWidth: 100 }}>{added?.title || section.title}</Text>
      {added || position >= 0 ? <>
        <SmallButton label="↑ Up" accessibilityLabel="Move selected section up" disabled={saving || (added ? addedPosition <= 0 : position === 0)} onPress={() => commit(added ? moveAddedPayslipSection(flush(), added.id, -1) : moveSection(flush(), section.key, -1))} />
        <SmallButton label="↓ Down" accessibilityLabel="Move selected section down" disabled={saving || (added ? addedPosition >= visibleItems.length - 1 : position === body.length - 1)} onPress={() => commit(added ? moveAddedPayslipSection(flush(), added.id, 1) : moveSection(flush(), section.key, 1))} />
      </> : null}
      <SmallButton label="Choose details" disabled={saving} onPress={() => { flush(); setTool("details"); }} />
      {added ? <SmallButton label="+ Add detail" disabled={saving || added.fields.length >= 30} onPress={addDetail} /> : null}
      <SmallButton label={hideLabel} disabled={saving || cannotHide} onPress={hide} />
    </View> : null}
    <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
    {width >= 1100 ? <View style={{ width: 220, padding: 12, gap: 12, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.background }}>
      <Text style={labelStyle}>On this payslip</Text>
      <ScrollView contentContainerStyle={{ gap: 4 }}>
        {pageItems.map((item) => <TouchableOpacity key={item.addedId || item.key} accessibilityRole="button" onPress={() => {
          flush(); setSelected({ section: item.key, addedId: item.addedId });
          if (item.visible) canvas.current?.scrollToSection(item.key, item.addedId); else setTool("sections");
        }} style={{ padding: 10, borderRadius: 6, backgroundColor: selected?.section === item.key && selected?.addedId === item.addedId ? colors.primary + "12" : "transparent" }}>
          <Text style={{ color: item.visible ? colors.foreground : colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>{item.title || "Untitled section"}{item.visible ? "" : " · Hidden"}</Text>
        </TouchableOpacity>)}
      </ScrollView>
    </View> : null}
    <EditablePayslipCanvas ref={canvas} html={html} revision={canvasRevision} zoom={zoom} disabled={saving} selectedSection={selected?.section} selectedAddedId={selected?.addedId} focusTarget={focusTarget} onEdits={applyEdits} onPendingChange={setHasPending} onUndo={undo} onRedo={redo} onSelect={(key, editTarget, addedId) => {
      if (template.sections.some((s) => s.key === key)) setSelected({ section: key as PayslipSectionKey, target: editTarget, addedId });
    }} />
    </View>
    <Modal visible={tool !== null} transparent animationType="fade" onRequestClose={() => setTool(null)}>
      <Pressable style={{ flex: 1, padding: 16, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" }} onPress={() => setTool(null)}>
        <Pressable style={{ width: "100%", maxWidth: 440, maxHeight: "88%", borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" }} onPress={() => {}}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={[labelStyle, { flex: 1 }]}>{tool === "appearance" ? "Look & colour" : tool === "details" ? added?.title || section?.title : "What should the payslip show?"}</Text>
            <SmallButton label="Done" onPress={() => setTool(null)} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }} keyboardShouldPersistTaps="handled">
            {tool === "appearance" ? <>
              <View style={{ gap: 6 }}><Text style={labelStyle}>Template name</Text><Input value={template.name} accessibilityLabel="Template name" maxLength={120} onChangeText={(value) => change((draft) => { draft.name = value; })} /></View>
              <View style={{ gap: 6 }}><Text style={labelStyle}>Main colour</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{COLOURS.map((colour) => <TouchableOpacity key={colour.value} accessibilityRole="button" accessibilityLabel={colour.name} accessibilityState={{ selected: template.page.accentColor.toUpperCase() === colour.value }} onPress={() => change((draft) => { draft.page.accentColor = colour.value; })} style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: template.page.accentColor.toUpperCase() === colour.value ? colors.primary : colors.border }}><View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colour.value }} /><Text style={{ color: colors.foreground, fontSize: 12 }}>{colour.name}</Text></TouchableOpacity>)}</View></View>
              <View style={{ gap: 6 }}><Text style={labelStyle}>Text size</Text><SelectInput label="Text size" value={template.page.fontSizePt} options={[...(![8, 9, 11].includes(template.page.fontSizePt) ? [{ value: template.page.fontSizePt, label: "Current size" }] : []), { value: 8, label: "Small" }, { value: 9, label: "Medium" }, { value: 11, label: "Large" }]} onChange={(value) => change((draft) => { draft.page.fontSizePt = value; })} /></View>
              <View style={{ gap: 6 }}><Text style={labelStyle}>Space between sections</Text><SelectInput label="Space between sections" value={SPACING.find((p) => p.margin === template.page.marginMm && p.gap === template.page.sectionSpacingPx)?.value || "current"} options={[{ value: "current", label: "Keep current spacing" }, ...SPACING]} onChange={(value) => { const spacing = SPACING.find((p) => p.value === value); if (spacing) change((draft) => { draft.page.marginMm = spacing.margin; draft.page.sectionSpacingPx = spacing.gap; }); }} /></View>
            </> : tool === "sections" ? pageItems.map((item) => <View key={item.addedId || item.key} style={{ gap: 6 }}>
              <ToggleRow label={item.title || item.key} value={item.visible} disabled={!item.addedId && item.key === "summary"} hint={!item.addedId && item.key === "summary" ? "Salary summary is always included" : undefined} onChange={(value) => change((draft) => { if (item.addedId) draft.addedSections!.find((s) => s.id === item.addedId)!.visible = value; else draft.sections.find((s) => s.key === item.key)!.visible = value; })} />
              <TouchableOpacity accessibilityRole="button" onPress={() => { setSelected({ section: item.key, addedId: item.addedId }); setTool("details"); }}><Text style={{ color: colors.primary, fontSize: 12 }}>Choose details</Text></TouchableOpacity>
            </View>) : tool === "details" && added ? <>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Click labels and fixed text on the page to edit them. Payroll values use each employee's saved data.</Text>
              {added.fields.map((item) => <View key={item.id} style={{ gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10 }}>
                <ToggleRow label={item.label || "Detail"} value={item.visible} onChange={(value) => change((draft) => { draft.addedSections!.find((s) => s.id === added.id)!.fields.find((f) => f.id === item.id)!.visible = value; })} />
                <SelectInput label={"Value type for " + item.label} value={item.source} options={[{ value: "text", label: "Fixed text — same on every payslip" }, { value: "mapped", label: "Payroll value — changes for each employee" }]} onChange={(value) => change((draft) => { const field = draft.addedSections!.find((s) => s.id === added.id)!.fields.find((f) => f.id === item.id)!; field.source = value; if (value === "mapped" && !field.mappedKey) field.mappedKey = "totals.netSalary"; })} />
                {item.source === "mapped" ? <SelectInput label={"Payroll value for " + item.label} value={item.mappedKey || "totals.netSalary"} options={MAPPABLE_FIELDS.map((field) => ({ value: field.key, label: field.label }))} onChange={(value) => change((draft) => { draft.addedSections!.find((s) => s.id === added.id)!.fields.find((f) => f.id === item.id)!.mappedKey = value; })} /> : null}
              </View>)}
              <SmallButton label="+ Add detail" disabled={added.fields.length >= 30} onPress={addDetail} />
            </> : tool === "details" && section ? <>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Choose what appears here. Rename labels by clicking them on the payslip.</Text>
              {section.fields.map((item) => <ToggleRow key={item.key} label={item.label || item.key} value={item.visible} disabled={isRequiredField(section.key, item.key)} hint={isRequiredField(section.key, item.key) ? "Always included" : undefined} onChange={(value) => change((draft) => { draft.sections.find((s) => s.key === section.key)!.fields.find((f) => f.key === item.key)!.visible = value; })} />)}
              {!section.fields.length ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Use Add note to place your own text here.</Text> : null}
            </> : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </View></Modal>;
}
