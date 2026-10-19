/**
 * services/__tests__/payslipTemplates.test.ts
 *
 * Payslip Template Management: configuration, normalization, rendering, logo
 * handling, security masking and financial-figure integrity.
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import {
  DEFAULT_TEMPLATE_ID,
  builtInTemplateId,
  cloneTemplate,
  componentKey,
  createBuiltInTemplate,
  mergeTemplateDocs,
  moveSection,
  normalizeTemplate,
  resolveTemplate,
  validateTemplate,
  PayslipTemplate,
} from "../payslipTemplateConfig";
import {
  buildPayslipRenderData,
  buildSamplePayslipData,
  formatAmount,
  renderPayslipDocument,
  renderPayslipHtml,
  PayslipOrganizationProfile,
} from "../payslipTemplateRenderer";

const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const NOW = new Date(2026, 9, 14);

const org: PayslipOrganizationProfile = {
  organizationId: "org-1",
  name: "Test Organization",
  address: "1 Main Road",
  email: "hr@test.org",
  phone: "+92-000",
  logo: LOGO,
  currency: "PKR",
};

const legacyEntry = {
  id: "pay_1",
  organizationId: "org-1",
  employeeName: "Ayesha Khan",
  employeeId: "EMP-77",
  department: "Finance",
  designation: "Accountant",
  baseSalary: 60000,
  bonus: 5000,
  deductions: 3000,
  netSalary: 62000,
  month: "2026-09",
  paymentStatus: "paid",
};

const itemizedEntry = {
  id: "pay_2",
  organizationId: "org-1",
  employeeName: "Bilal Ahmed",
  employeeId: "EMP-88",
  department: "Ops",
  month: "2026-09",
  cnic: "12345-1234567-1",
  bankAccountNumber: "PK00TEST000123456789",
  itemizedEarnings: [
    { code: "0001", name: "Basic Pay", calculatedAmount: 50000 },
    { code: "1000", name: "House Rent Allowance", calculatedAmount: 20000 },
    { code: "1300", name: "Medical Allowance", calculatedAmount: 0 },
  ],
  itemizedDeductions: [{ code: "3014", name: "Provident Fund", calculatedAmount: 4000 }],
  loanDeductions: [{ loanId: "L1", description: "Advance", originalPrincipal: 20000, currentDeduction: 2000, outstandingBalance: 10000 }],
  taxDetails: { taxableIncome: 70000, taxDeductedThisMonth: 1500 },
  employerContributions: [{ code: "EOBI", name: "EOBI Employer", calculatedAmount: 1200 }],
  netSalary: 62500,
};

const gov = () => createBuiltInTemplate("government");
const render = (t: PayslipTemplate, entry: any, canViewSensitive = true, o = org) =>
  renderPayslipHtml(t, buildPayslipRenderData(entry, o, { canViewSensitive, now: NOW }), { mode: "print" });

describe("Built-in templates & normalization", () => {
  test("government and corporate built-ins exist and are valid", () => {
    for (const t of [gov(), createBuiltInTemplate("corporate")]) {
      assert.deepStrictEqual(validateTemplate(t), []);
      assert.strictEqual(t.sections[0].key, "header");
      assert.strictEqual(t.sections[t.sections.length - 1].key, "footer");
    }
    assert.strictEqual(DEFAULT_TEMPLATE_ID, builtInTemplateId("government"));
  });

  test("corrupted / partial configs normalize to a renderable template", () => {
    const t = normalizeTemplate({ name: "", page: { size: "A0", fontSizePt: 999 }, sections: "nope", logo: { heightPx: -5 } });
    assert.strictEqual(t.page.size, "A4");
    assert.strictEqual(t.page.fontSizePt, 14);
    assert.strictEqual(t.logo.heightPx, 20);
    assert.ok(t.name.length > 0);
    assert.ok(render(t, legacyEntry).includes("Ayesha Khan"));
    assert.strictEqual(normalizeTemplate(null).id, DEFAULT_TEMPLATE_ID);
  });

  test("required fields cannot be hidden through stored config", () => {
    const raw = cloneTemplate(gov());
    raw.sections.find((s) => s.key === "summary")!.fields.find((f) => f.key === "netSalary")!.visible = false;
    const t = normalizeTemplate(raw);
    assert.strictEqual(t.sections.find((s) => s.key === "summary")!.fields.find((f) => f.key === "netSalary")!.visible, true);
  });

  test("validation blocks hiding the summary section and empty names", () => {
    const t = cloneTemplate(gov());
    t.name = " ";
    t.sections.find((s) => s.key === "summary")!.visible = false;
    const errors = validateTemplate(t);
    assert.ok(errors.some((e) => /name/i.test(e)));
    assert.ok(errors.some((e) => /Net salary/i.test(e)));
  });

  test("header stays first and footer last when moving sections", () => {
    let t = gov();
    t = moveSection(t, "employee", -1);
    assert.strictEqual(t.sections[0].key, "header");
    assert.strictEqual(t.sections[1].key, "employee");
    t = moveSection(t, "summary", -1);
    const keys = t.sections.map((s) => s.key);
    assert.ok(keys.indexOf("summary") < keys.indexOf("tax"));
    assert.strictEqual(keys[keys.length - 1], "footer");
  });
});

describe("Library merging, defaults and isolation", () => {
  test("override of a built-in keeps the stable id and is restorable", () => {
    const override = { ...cloneTemplate(gov()), name: "Our Statement", isBuiltInOverride: true, builtInKey: "government", organizationId: "org-1" };
    const lib = mergeTemplateDocs([override], "org-1");
    const g = lib.find((t) => t.id === DEFAULT_TEMPLATE_ID)!;
    assert.strictEqual(g.name, "Our Statement");
    assert.strictEqual(g.isBuiltIn, true);
    assert.strictEqual(g.isCustomizedBuiltIn, true);
    assert.strictEqual(lib.filter((t) => t.builtInKey === "government" && t.isBuiltIn).length, 1);
  });

  test("other organizations' templates are ignored", () => {
    const foreign = { ...cloneTemplate(gov()), id: "tpl_x", name: "Foreign", organizationId: "org-2" };
    const mine = { ...cloneTemplate(gov()), id: "tpl_y", name: "Mine", organizationId: "org-1" };
    const lib = mergeTemplateDocs([foreign, mine], "org-1");
    assert.ok(lib.some((t) => t.name === "Mine"));
    assert.ok(!lib.some((t) => t.name === "Foreign"));
  });

  test("resolveTemplate falls back to default, then built-in government", () => {
    const custom = normalizeTemplate({ ...cloneTemplate(gov()), id: "tpl_a", name: "A", isActive: false });
    const lib = [...mergeTemplateDocs([], "org-1"), custom];
    assert.strictEqual(resolveTemplate(lib, "tpl_a", builtInTemplateId("corporate")).id, builtInTemplateId("corporate"));
    assert.strictEqual(resolveTemplate(lib, "missing", "also-missing").id, DEFAULT_TEMPLATE_ID);
  });
});

describe("Financial integrity", () => {
  test("legacy record: figures match stored payroll, nothing invented", () => {
    const d = buildPayslipRenderData(legacyEntry, org, { canViewSensitive: true, now: NOW });
    assert.strictEqual(d.totals.grossSalary, 65000);
    assert.strictEqual(d.totals.totalEmployeeDeductions, 3000);
    assert.strictEqual(d.totals.netSalary, 62000);
    assert.deepStrictEqual(d.warnings, []);
    const html = render(gov(), legacyEntry);
    for (const fake of ["HASNAT", "3720116410589", "MUSLIM COMMERCIAL", "CHAKWAL", "OFFICIAL</text>"]) {
      assert.ok(!html.includes(fake), `must not contain fabricated value ${fake}`);
    }
    assert.ok(!html.includes("CNIC"), "CNIC row hidden when record has no CNIC");
  });

  test("itemized record: tax & loans separate, employer contributions do not reduce net", () => {
    const d = buildPayslipRenderData(itemizedEntry, org, { canViewSensitive: true, now: NOW });
    assert.strictEqual(d.totals.grossSalary, 70000);
    assert.strictEqual(d.totals.totalGeneralDeductions, 4000);
    assert.strictEqual(d.totals.totalLoanDeductions, 2000);
    assert.strictEqual(d.totals.totalTaxDeductions, 1500);
    assert.strictEqual(d.totals.totalEmployeeDeductions, 7500);
    assert.strictEqual(d.totals.netSalary, 62500);
    assert.strictEqual(d.totals.employerContributions, 1200);
    assert.strictEqual(d.totals.totalEmployerCost, 71200);
  });

  test("legacy lump deduction is not double-counted with itemized loans", () => {
    const entry = { ...legacyEntry, deductions: 5000, loanDeductions: [{ loanId: "L", description: "Adv", currentDeduction: 2000 }], netSalary: 60000 };
    const d = buildPayslipRenderData(entry, org, { canViewSensitive: true, now: NOW });
    assert.strictEqual(d.totals.totalGeneralDeductions, 3000);
    assert.strictEqual(d.totals.totalEmployeeDeductions, 5000);
    assert.strictEqual(d.totals.netSalary, 60000);
  });

  test("stored (finalized) net salary is never recalculated", () => {
    const entry = { ...legacyEntry, netSalary: 61000, payrollStatus: "finalized" };
    const d = buildPayslipRenderData(entry, org, { canViewSensitive: true, now: NOW });
    assert.strictEqual(d.totals.netSalary, 61000);
    assert.strictEqual(d.warnings.length, 1);
  });

  test("renaming, hiding and reordering do not change figures", () => {
    const base = buildPayslipRenderData(itemizedEntry, org, { canViewSensitive: true, now: NOW });
    const t = cloneTemplate(gov());
    t.sections.find((s) => s.key === "summary")!.fields.find((f) => f.key === "netSalary")!.label = "Net Salary Payable";
    t.sections.find((s) => s.key === "deductions")!.title = "Monthly Deductions";
    t.components.overrides[componentKey({ code: "1000", name: "" })] = { label: "HRA", order: 0 };
    t.components.overrides[componentKey({ code: "3014", name: "" })] = { hidden: true };
    const moved = moveSection(t, "summary", -1);
    const html = render(moved, itemizedEntry);
    assert.ok(html.includes("Net Salary Payable"));
    assert.ok(html.includes("Monthly Deductions") === false, "deductions table hidden when all its rows are hidden");
    assert.ok(html.includes("HRA"));
    assert.ok(!html.includes("Provident Fund"));
    assert.ok(html.includes("62,500.00"));
    const after = buildPayslipRenderData(itemizedEntry, org, { canViewSensitive: true, now: NOW });
    assert.deepStrictEqual(after.totals, base.totals);
    assert.ok(html.indexOf("HRA") < html.indexOf("Basic Pay"), "component order override applied");
  });

  test("zero-value rows hidden by default and shown when enabled", () => {
    assert.ok(!render(gov(), itemizedEntry).includes("Medical Allowance"));
    const t = cloneTemplate(gov());
    t.components.showZeroRows = true;
    assert.ok(render(t, itemizedEntry).includes("Medical Allowance"));
  });

  test("currency formatting options", () => {
    const t = cloneTemplate(gov());
    t.format.currencyDisplay = "code";
    t.format.negativeStyle = "parentheses";
    assert.strictEqual(formatAmount(1234.5, t, "PKR", true), "(PKR 1,234.50)");
    t.format.decimals = 0;
    t.format.currencyDisplay = "none";
    assert.strictEqual(formatAmount(1234.5, t, "PKR"), "1,235");
  });
});

describe("Organization logo", () => {
  test("profile logo appears in built-in and custom templates", () => {
    const custom = normalizeTemplate({ ...cloneTemplate(createBuiltInTemplate("corporate")), id: "tpl_c", name: "Custom" });
    for (const t of [gov(), createBuiltInTemplate("corporate"), custom]) {
      assert.ok(render(t, legacyEntry).includes(`src="${LOGO}"`));
    }
  });

  test("changing the profile logo changes the output (no stored copy)", () => {
    const newLogo = LOGO.replace("iVBOR", "iVBXX");
    const html = render(gov(), legacyEntry, true, { ...org, logo: newLogo });
    assert.ok(html.includes(newLogo));
    assert.ok(!JSON.stringify(gov()).includes("data:image"), "templates never store image data");
  });

  test("missing logo renders a clean text header with no emblem", () => {
    const html = render(gov(), legacyEntry, true, { ...org, logo: "" });
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes("<svg"));
    assert.ok(html.includes("Test Organization"));
  });

  test("hidden logo setting removes it; size/position are applied", () => {
    const t = cloneTemplate(gov());
    t.logo.visible = false;
    assert.ok(!render(t, legacyEntry).includes("<img"));
    t.logo.visible = true;
    t.logo.heightPx = 90;
    t.logo.position = "center";
    const html = render(t, legacyEntry);
    assert.ok(html.includes("height: 90px"));
    assert.ok(html.includes("hdr-center-logo"));
    assert.ok(html.includes("object-fit: contain"), "aspect ratio preserved");
  });

  test("another organization's record never shows this organization's logo", () => {
    const html = render(gov(), { ...legacyEntry, organizationId: "org-2" });
    assert.ok(!html.includes("<img"));
  });

  test("unsafe logo sources are rejected", () => {
    const html = render(gov(), legacyEntry, true, { ...org, logo: 'javascript:alert(1)"' });
    assert.ok(!html.includes("<img"));
  });
});

describe("Security & presentation", () => {
  test("sensitive data is masked for viewers without permission", () => {
    const html = render(gov(), itemizedEntry, false);
    assert.ok(!html.includes("12345-1234567-1"));
    assert.ok(!html.includes("PK00TEST000123456789"));
    assert.ok(html.includes("6789"));
    const full = render(gov(), itemizedEntry, true);
    assert.ok(full.includes("12345-1234567-1"));
  });

  test("user-provided text is HTML-escaped", () => {
    const t = cloneTemplate(gov());
    t.footer.customText = "<b>x</b>";
    const html = render(t, { ...legacyEntry, employeeName: "<script>alert(1)</script>" });
    assert.ok(!html.includes("<script>alert(1)"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("<b>x</b>"));
  });

  test("custom text and mapped fields render without touching payroll data", () => {
    const t = cloneTemplate(gov());
    t.customFields = [
      { id: "a", label: "File No", visible: true, source: "text", value: "HR/2026/14", placement: "custom" },
      { id: "b", label: "Take Home", visible: true, source: "mapped", mappedKey: "totals.netSalary", placement: "footer" },
    ];
    const html = render(normalizeTemplate(t), itemizedEntry);
    assert.ok(html.includes("HR/2026/14"));
    assert.ok(html.includes("Take Home: 62,500.00"));
  });

  test("page size, orientation and bulk page breaks", () => {
    const t = cloneTemplate(gov());
    t.page.size = "Letter";
    t.page.orientation = "landscape";
    const d1 = buildPayslipRenderData(legacyEntry, org, { canViewSensitive: true, now: NOW });
    const d2 = buildPayslipRenderData(itemizedEntry, org, { canViewSensitive: true, now: NOW });
    const html = renderPayslipDocument(t, [d1, d2], { mode: "print" });
    assert.ok(html.includes("size: Letter landscape"));
    assert.strictEqual((html.match(/class="sheet"/g) || []).length, 2);
    assert.ok(html.includes("page-break-before: always"));
  });

  test("preview and PDF share identical figures and verification code", () => {
    const a = buildPayslipRenderData(itemizedEntry, org, { canViewSensitive: true, now: NOW });
    const b = buildPayslipRenderData(itemizedEntry, org, { canViewSensitive: true, now: NOW });
    assert.strictEqual(a.meta.verificationCode, b.meta.verificationCode);
    const screen = renderPayslipHtml(gov(), a, { mode: "screen" });
    const print = renderPayslipHtml(gov(), b, { mode: "print" });
    const strip = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/, "");
    assert.strictEqual(strip(screen), strip(print));
  });

  test("sample preview data is clearly marked", () => {
    const s = buildSamplePayslipData(org, NOW);
    assert.strictEqual(s.employee.employeeName, "Sample Employee");
    assert.strictEqual(s.meta.verificationCode, "SAMPLE-PREVIEW");
  });
});

describe("Your own text anywhere", () => {
  test("text before/after a field value", () => {
    const t = cloneTemplate(gov());
    const f = t.sections.find((s) => s.key === "employee")!.fields.find((x) => x.key === "designation")!;
    f.prefix = "Senior";
    f.suffix = "(acting)";
    const html = render(normalizeTemplate(t), legacyEntry);
    assert.ok(html.includes("Senior Accountant (acting)"));
  });

  test("text after the net salary keeps the amount unchanged", () => {
    const t = cloneTemplate(gov());
    t.sections.find((s) => s.key === "summary")!.fields.find((x) => x.key === "netSalary")!.suffix = "only";
    const html = render(normalizeTemplate(t), legacyEntry);
    assert.ok(html.includes("62,000.00</strong> only"));
    const d = buildPayslipRenderData(legacyEntry, org, { canViewSensitive: true, now: NOW });
    assert.strictEqual(d.totals.netSalary, 62000);
  });

  test("note after a component name", () => {
    const t = cloneTemplate(gov());
    t.components.overrides[componentKey({ code: "1000", name: "" })] = { note: "(45% of basic)" };
    assert.ok(render(normalizeTemplate(t), itemizedEntry).includes("House Rent Allowance (45% of basic)"));
  });

  test("text blocks appear above/below the chosen section, and deleting removes them", () => {
    const t = cloneTemplate(gov());
    t.textBlocks = [
      { id: "a", text: "TOP NOTICE", visible: true, anchor: "header", position: "before", align: "center", bold: true, italic: false, scale: 1.2, color: "#B91C1C", boxed: true },
      { id: "b", text: "Below summary note", visible: true, anchor: "summary", position: "after", align: "left", bold: false, italic: true, scale: 1, color: "#000000", boxed: false },
      { id: "c", text: "Hidden text", visible: false, anchor: "summary", position: "after", align: "left", bold: false, italic: false, scale: 1, color: "#000000", boxed: false },
    ];
    const html = render(normalizeTemplate(t), legacyEntry);
    const body = html.slice(html.indexOf("<body>"));
    assert.ok(body.indexOf("TOP NOTICE") < body.indexOf("Test Organization"));
    assert.ok(body.indexOf("Below summary note") > body.indexOf("62,000.00"));
    assert.ok(!html.includes("Hidden text"));
    assert.ok(html.includes("font-weight:bold") && html.includes("tblock boxed"));
    t.textBlocks = t.textBlocks.filter((b) => b.id !== "a");
    assert.ok(!render(normalizeTemplate(t), legacyEntry).includes("TOP NOTICE"));
  });

  test("text blocks are escaped and keep line breaks", () => {
    const t = cloneTemplate(gov());
    t.textBlocks = [{ id: "x", text: "Line 1\n<img src=x>", visible: true, anchor: "footer", position: "after", align: "left", bold: false, italic: false, scale: 1, color: "#000000", boxed: false }];
    const html = render(normalizeTemplate(t), legacyEntry);
    assert.ok(html.includes("Line 1<br/>&lt;img src=x&gt;"));
  });

  test("custom fields can be placed in payment, attendance and tax sections", () => {
    const t = cloneTemplate(gov());
    t.customFields = [
      { id: "p", label: "Cheque No", visible: true, source: "text", value: "CHQ-991", placement: "payment" },
      { id: "q", label: "Remarks", visible: true, source: "text", value: "Full month", placement: "attendance" },
    ];
    const html = render(normalizeTemplate(t), legacyEntry);
    assert.ok(html.includes("CHQ-991"));
    assert.ok(html.includes("Full month"), "attendance section shown even when the record has no attendance data");
  });

  test("invalid stored text blocks are cleaned up", () => {
    const t = normalizeTemplate({ ...cloneTemplate(gov()), textBlocks: [{ anchor: "nowhere", text: "x" }, { anchor: "summary", text: "ok", scale: 99, color: "red" }, null] });
    assert.strictEqual(t.textBlocks.length, 1);
    assert.strictEqual(t.textBlocks[0].scale, 2.5);
    assert.strictEqual(t.textBlocks[0].color, "#000000");
    assert.strictEqual(normalizeTemplate({}).textBlocks.length, 0, "older saved templates still load");
  });
});
