import { PayslipTemplate, PayslipSectionKey, PayslipAddedSection, cloneTemplate } from "./payslipTemplateConfig";
import { componentKey } from "./payslipTemplateConfig";
import type { PayslipRenderData } from "./payslipTemplateRenderer";

/** Only template text can be changed on the page. Payroll/profile values have no edit target. */
export type PayslipEditTarget =
  | { kind: "document-title" }
  | { kind: "section-title"; section: PayslipSectionKey }
  | { kind: "field-label"; section: PayslipSectionKey; key: string }
  | { kind: "text-block"; id: string }
  | { kind: "signature"; index: number }
  | { kind: "footer"; key: "notes" | "digitalNotice" | "customText" }
  | { kind: "custom-label" | "custom-value"; id: string }
  | { kind: "component-label"; key: string }
  | { kind: "added-section-title"; id: string }
  | { kind: "added-field-label" | "added-field-value"; id: string; fieldId: string }
  | { kind: "preview-value"; path: string };

export interface PayslipTextEdit { target: PayslipEditTarget; value: string }

export function payslipEditTextLimit(target: PayslipEditTarget): number {
  if (target.kind === "text-block") return 2000;
  if (target.kind === "signature") return 80;
  if (target.kind === "footer") return target.key === "digitalNotice" ? 500 : 1000;
  if (target.kind === "custom-value" || target.kind === "added-field-value") return 1000;
  return 120;
}

export function applyPayslipTextEdit(template: PayslipTemplate, target: unknown, value: unknown): PayslipTemplate {
  if (!target || typeof target !== "object" || typeof value !== "string") return template;
  const edit = target as Record<string, unknown>;
  if (typeof edit.kind !== "string" || value.length > 2000) return template;
  const next = cloneTemplate(template);
  const line = value.replace(/[\r\n]+/g, " ");
  switch (edit.kind) {
    case "added-section-title": {
      const section = next.addedSections?.find((s) => s.id === edit.id);
      if (!section || line.length > 120) return template;
      section.title = line;
      break;
    }
    case "added-field-label":
    case "added-field-value": {
      const field = next.addedSections?.find((s) => s.id === edit.id)?.fields.find((f) => f.id === edit.fieldId);
      if (!field) return template;
      if (edit.kind === "added-field-label") {
        if (line.length > 120) return template;
        field.label = line;
      } else {
        if (field.source !== "text" || value.length > 1000) return template;
        field.value = value;
      }
      break;
    }
    case "document-title":
      if (line.length > 120) return template;
      next.header.documentTitle = line;
      break;
    case "section-title": {
      const section = next.sections.find((s) => s.key === edit.section);
      if (!section || line.length > 120) return template;
      section.title = line;
      break;
    }
    case "field-label": {
      const field = next.sections.find((s) => s.key === edit.section)?.fields.find((f) => f.key === edit.key);
      if (!field || line.length > 120) return template;
      field.label = line;
      break;
    }
    case "text-block": {
      const block = next.textBlocks.find((b) => b.id === edit.id);
      if (!block) return template;
      block.text = value.replace(/\r\n?/g, "\n");
      break;
    }
    case "signature":
      if (!Number.isInteger(edit.index) || Number(edit.index) < 0 || Number(edit.index) >= next.footer.signatureLabels.length || line.length > 80) return template;
      next.footer.signatureLabels[Number(edit.index)] = line;
      break;
    case "footer":
      if (edit.key !== "notes" && edit.key !== "digitalNotice" && edit.key !== "customText") return template;
      if (value.length > (edit.key === "digitalNotice" ? 500 : 1000)) return template;
      next.footer[edit.key] = value.replace(/\r\n?/g, "\n");
      break;
    case "custom-label":
    case "custom-value": {
      const field = next.customFields.find((f) => f.id === edit.id);
      if (!field) return template;
      if (edit.kind === "custom-label") {
        if (line.length > 120) return template;
        field.label = line;
      } else {
        if (field.source !== "text" || value.length > 1000) return template;
        field.value = value;
      }
      break;
    }
    case "component-label": {
      if (typeof edit.key !== "string" || !edit.key || edit.key.length > 200 || ["__proto__", "prototype", "constructor"].includes(edit.key) || line.length > 120) return template;
      next.components.overrides = { ...next.components.overrides, [edit.key]: { ...next.components.overrides[edit.key], label: line } };
      break;
    }
    default: return template;
  }
  return next;
}

export function createAddedPayslipSection(anchor: PayslipSectionKey): PayslipAddedSection {
  const id = "section_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  return { id, title: "New section", visible: true, anchor, position: "after", fields: [{ id: id + "_detail", label: "Detail", value: "", visible: true, source: "text" }] };
}

export function payslipPageOrder(template: PayslipTemplate) {
  const order: Array<{ key: PayslipSectionKey; addedId?: string; title: string; visible: boolean }> = [];
  for (const section of template.sections) {
    const additions = (template.addedSections || []).filter((s) => s.anchor === section.key);
    for (const added of additions.filter((s) => s.position === "before")) order.push({ key: section.key, addedId: added.id, title: added.title, visible: added.visible });
    order.push({ key: section.key, title: section.title, visible: section.visible });
    for (const added of additions.filter((s) => s.position === "after")) order.push({ key: section.key, addedId: added.id, title: added.title, visible: added.visible });
  }
  return order;
}

export function moveAddedPayslipSection(template: PayslipTemplate, id: string, direction: -1 | 1): PayslipTemplate {
  const order = payslipPageOrder(template).filter((s) => s.visible);
  const index = order.findIndex((s) => s.addedId === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= order.length) return template;
  [order[index], order[destination]] = [order[destination], order[index]];
  const next = cloneTemplate(template);
  let previous: PayslipSectionKey | undefined;
  const firstFixed = order.find((s) => !s.addedId);
  if (!firstFixed) return template;
  const first = firstFixed.key;
  const sorted: PayslipAddedSection[] = [];
  for (const item of order) {
    if (!item.addedId) previous = item.key;
    else {
      const added = next.addedSections!.find((s) => s.id === item.addedId)!;
      added.anchor = previous || first; added.position = previous ? "after" : "before";
      sorted.push(added);
    }
  }
  next.addedSections = [...sorted, ...(next.addedSections || []).filter((s) => !s.visible)];
  return next;
}

/** Preview edits are held in the editor only and cannot target a real payroll record. */
export function applyPayslipPreviewEdit(data: PayslipRenderData, path: string, text: string): PayslipRenderData {
  if (data.meta.recordId !== "sample" || data.meta.verificationCode !== "SAMPLE-PREVIEW" || typeof text !== "string") return data;
  const split = path.indexOf(":");
  const scope = split < 0 ? path : path.slice(0, split);
  const key = split < 0 ? "" : path.slice(split + 1);
  const next = cloneTemplate(data);
  if (scope === "employee") {
    if (!["employeeName", "employeeId", "designation", "department"].includes(key) || text.length > 120) return data;
    next.employee[key] = text.replace(/[\r\n]+/g, " ");
    return next;
  }
  const currency = data.org.currency.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
  const numeric = text.trim().replace(/^\((.*)\)$/, "$1").replace(/^[+-]\s*/, "").replace(new RegExp("^(?:" + currency + "|Rs\\.?|[$€£¥₨])\\s*", "i"), "").replace(/[,\s]/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(numeric)) return data;
  const amount = Math.abs(Number(numeric));
  if (!Number.isFinite(amount) || amount > 1e12) return data;
  if (scope === "earning" || scope === "deduction" || scope === "employer") {
    const rows = scope === "earning" ? next.earnings : scope === "deduction" ? next.deductions : next.employer;
    const row = rows.find((line) => componentKey(line) === key);
    if (!row) return data;
    row.amount = amount;
  } else if (scope === "loan") {
    const row = next.loans.find((loan) => loan.loanId === key);
    if (!row) return data;
    row.installment = amount;
  } else if (scope === "tax" && next.tax) next.tax.taxDeductedThisMonth = amount;
  else return data;
  const sum = (rows: Array<{ amount: number }>) => rows.reduce((total, row) => total + row.amount, 0);
  const totals = next.totals;
  totals.basicSalary = next.earnings[0]?.amount || 0;
  totals.grossSalary = sum(next.earnings);
  totals.totalAllowances = totals.grossSalary - totals.basicSalary;
  totals.totalGeneralDeductions = sum(next.deductions);
  totals.totalLoanDeductions = next.loans.reduce((total, row) => total + row.installment, 0);
  totals.totalTaxDeductions = next.tax?.taxDeductedThisMonth || 0;
  totals.totalEmployeeDeductions = totals.totalGeneralDeductions + totals.totalLoanDeductions + totals.totalTaxDeductions + totals.otherDeductions;
  totals.netSalary = totals.grossSalary - totals.totalEmployeeDeductions;
  totals.employerContributions = sum(next.employer);
  totals.totalEmployerCost = totals.grossSalary + totals.employerContributions;
  next.employee.basicSalary = String(totals.basicSalary);
  if (next.tax) next.tax.taxableIncome = totals.grossSalary;
  return next;
}
