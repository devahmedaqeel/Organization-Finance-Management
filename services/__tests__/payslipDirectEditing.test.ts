import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { applyPayslipTextEdit } from "../payslipTemplateEditing";
import { cloneTemplate, createBuiltInTemplate, createTextBlock } from "../payslipTemplateConfig";
import { buildSamplePayslipData, renderPayslipHtml } from "../payslipTemplateRenderer";

const org = { name: "Test Organization", currency: "PKR" };
const sample = () => buildSamplePayslipData(org);

describe("Direct payslip editing", () => {
  test("edits template labels without mutating the original or its identity", () => {
    const original = createBuiltInTemplate("corporate");
    const snapshot = JSON.stringify(original);
    let edited = applyPayslipTextEdit(original, { kind: "document-title" }, "Monthly pay statement");
    edited = applyPayslipTextEdit(edited, { kind: "field-label", section: "summary", key: "netSalary" }, "Take-home pay");
    assert.equal(edited.header.documentTitle, "Monthly pay statement");
    assert.equal(edited.sections.find((s) => s.key === "summary")!.fields.find((f) => f.key === "netSalary")!.label, "Take-home pay");
    assert.equal(edited.id, original.id);
    assert.equal(edited.isBuiltIn, original.isBuiltIn);
    assert.equal(JSON.stringify(original), snapshot);
    const data = sample();
    const html = renderPayslipHtml(edited, data, { mode: "print" });
    assert.ok(html.includes("Take-home pay"));
    assert.ok(html.includes(data.totals.netSalary.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  });

  test("salary and profile targets cannot be written through the editor", () => {
    const original = createBuiltInTemplate("corporate");
    for (const target of [
      { kind: "netSalary" }, { kind: "amount", key: "netSalary" }, { kind: "organizationName" },
      { kind: "footer", key: "__proto__" }, { kind: "component-label", key: "__proto__" },
      { kind: "field-label", section: "summary", key: "unknown" }, { kind: "signature", index: -1 },
      { kind: "signature", index: 100 }, { kind: "text-block", id: "missing" },
    ]) assert.strictEqual(applyPayslipTextEdit(original, target, "999999"), original);
    assert.strictEqual(applyPayslipTextEdit(original, null, "x"), original);
    assert.strictEqual(applyPayslipTextEdit(original, { kind: "document-title" }, 123), original);
    assert.strictEqual(applyPayslipTextEdit(original, { kind: "document-title" }, "x".repeat(121)), original);
  });

  test("mapped payroll fields stay read-only while custom text remains editable", () => {
    const original = createBuiltInTemplate("corporate");
    original.customFields = [
      { id: "mapped", label: "Net salary", visible: true, placement: "custom", source: "mapped", mappedKey: "totals.netSalary" },
      { id: "text", label: "Message", visible: true, placement: "custom", source: "text", value: "Original" },
    ];
    assert.strictEqual(applyPayslipTextEdit(original, { kind: "custom-value", id: "mapped" }, "999999"), original);
    const edited = applyPayslipTextEdit(original, { kind: "custom-value", id: "text" }, "Updated message");
    assert.equal(edited.customFields[1].value, "Updated message");
    assert.equal(edited.customFields[0].mappedKey, "totals.netSalary");
  });

  test("notes, signatures and salary row labels edit independently", () => {
    const original = createBuiltInTemplate("corporate");
    const block = createTextBlock("summary", "after");
    original.textBlocks.push(block);
    let edited = applyPayslipTextEdit(original, { kind: "text-block", id: block.id }, "Line one\nLine two");
    edited = applyPayslipTextEdit(edited, { kind: "signature", index: 0 }, "Received by");
    edited = applyPayslipTextEdit(edited, { kind: "component-label", key: "basic_pay" }, "Basic salary");
    assert.equal(edited.textBlocks[0].text, "Line one\nLine two");
    assert.equal(edited.footer.signatureLabels[0], "Received by");
    assert.equal(edited.components.overrides.basic_pay.label, "Basic salary");
    assert.deepEqual(edited.page, original.page);
  });

  test("editor markers appear only in editable screen output", () => {
    const template = createBuiltInTemplate("corporate");
    const data = sample();
    assert.ok(renderPayslipHtml(template, data, { mode: "screen", editable: true }).includes("data-ofm-edit="));
    assert.ok(renderPayslipHtml(template, data, { mode: "screen", editable: true }).includes('data-ofm-section="summary"'));
    for (const options of [{ mode: "print" as const, editable: true }, { mode: "print" as const }, { mode: "screen" as const }]) {
      assert.ok(!renderPayslipHtml(template, data, options).includes("data-ofm-"));
    }
  });

  test("an empty new note can be edited on the page and is omitted from print", () => {
    const template = createBuiltInTemplate("corporate");
    template.textBlocks = [createTextBlock("summary", "after")];
    const data = sample();
    const before = renderPayslipHtml(template, data, { mode: "print" });
    assert.equal(before, renderPayslipHtml({ ...cloneTemplate(template), textBlocks: [] }, data, { mode: "print" }));
    assert.ok(renderPayslipHtml(template, data, { mode: "screen", editable: true }).includes("text-block"));
  });

  test("typed markup is escaped in both editor and printed output", () => {
    const template = applyPayslipTextEdit(createBuiltInTemplate("corporate"), { kind: "document-title" }, '<img src=x onerror="alert(1)">');
    for (const editable of [false, true]) {
      const html = renderPayslipHtml(template, sample(), { mode: "screen", editable });
      assert.ok(html.includes("&lt;img src=x onerror=&quot;"));
      assert.ok(!html.includes('<img src=x onerror="alert(1)">'));
    }
  });
});
