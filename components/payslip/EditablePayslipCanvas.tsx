import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { PayslipEditTarget, PayslipTextEdit, payslipEditTextLimit } from "@/services/payslipTemplateEditing";

export interface PayslipCanvasHandle { flush: () => PayslipTextEdit[]; scrollToSection: (section: string, addedId?: string) => void }

/** The parent edits the sandboxed document; scripts inside the payslip stay disabled. */
export const EditablePayslipCanvas = forwardRef<PayslipCanvasHandle, {
  html: string;
  revision?: number;
  zoom: "fit" | "actual";
  disabled?: boolean;
  selectedSection?: string;
  selectedAddedId?: string;
  focusTarget?: PayslipEditTarget | null;
  onEdits: (edits: PayslipTextEdit[]) => void;
  onSelect: (section: string, target?: PayslipEditTarget, addedId?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPendingChange: (pending: boolean) => void;
}>(function EditablePayslipCanvas(props, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const initialHtml = useRef(props.html);
  const [loaded, setLoaded] = useState(0);
  const [width, setWidth] = useState(0);
  const patching = useRef(false);
  const read = (element: HTMLElement) => (element.innerText || element.textContent || "").replace(/\r\n?/g, "\n");
  const flush = (): PayslipTextEdit[] => {
    const doc = frame.current?.contentDocument;
    if (!doc) return [];
    const edits: PayslipTextEdit[] = [];
    doc.querySelectorAll<HTMLElement>("[data-ofm-edit]").forEach((element) => {
      let value = read(element);
      if (value !== element.dataset.ofmOriginal) {
        try {
          const target: PayslipEditTarget = JSON.parse(element.dataset.ofmEdit || "");
          if (element.dataset.ofmMultiline !== "true") value = value.replace(/[\r\n]+/g, " ");
          value = value.slice(0, payslipEditTextLimit(target));
          edits.push({ target, value });
          if (read(element) !== value) element.textContent = value;
        } catch { /* invalid marker */ }
        element.dataset.ofmOriginal = value;
      }
    });
    latest.current.onPendingChange(false);
    return edits;
  };
  useImperativeHandle(ref, () => ({ flush, scrollToSection: (section, addedId) => {
    const nodes = Array.from(frame.current?.contentDocument?.querySelectorAll<HTMLElement>("[data-ofm-section]") || []);
    nodes.find((node) => node.dataset.ofmSection === section && (addedId ? node.dataset.ofmAddedSection === addedId : !node.dataset.ofmAddedSection))?.scrollIntoView({ block: "start", behavior: "smooth" });
  } }));

  const fit = () => {
    const doc = frame.current?.contentDocument;
    const sheet = doc?.querySelector<HTMLElement>(".sheet");
    if (!sheet) return;
    sheet.style.zoom = "1";
    sheet.style.maxWidth = "none";
    if (latest.current.zoom === "actual") return;
    const pageWidth = parseFloat(doc!.defaultView!.getComputedStyle(sheet).width);
    sheet.style.zoom = String(Math.min(1, Math.max(0.2, ((frame.current?.clientWidth || width) - 24) / pageWidth)));
  };
  const highlight = () => {
    frame.current?.contentDocument?.querySelectorAll<HTMLElement>("[data-ofm-section]").forEach((element) => {
      element.classList.toggle("ofm-selected", latest.current.selectedAddedId ? element.dataset.ofmAddedSection === latest.current.selectedAddedId : !element.dataset.ofmAddedSection && element.dataset.ofmSection === latest.current.selectedSection);
    });
  };
  const prepare = (doc: Document) => {
    doc.querySelectorAll<HTMLElement>("[data-ofm-edit]").forEach((element) => {
      element.contentEditable = latest.current.disabled ? "false" : "true";
      element.setAttribute("role", "textbox");
      element.setAttribute("aria-label", "Edit " + (read(element).trim() || "payslip text"));
      element.setAttribute("aria-multiline", String(element.dataset.ofmMultiline === "true"));
      element.title = "Click to edit this text";
      element.dataset.ofmOriginal = read(element);
    });
    if (!doc.getElementById("ofm-edit-style")) {
      const style = doc.createElement("style");
      style.id = "ofm-edit-style";
      style.textContent = 'body{padding:12px!important}[data-ofm-section]{position:relative}[data-ofm-section].ofm-selected{outline:1px dashed #2CA01C;outline-offset:4px}[data-ofm-edit]{display:inline-block;min-width:.6em;min-height:1em;border-radius:2px;cursor:text;white-space:pre-wrap;outline:none}[data-ofm-edit]:hover{outline:1px dashed #2CA01C}[data-ofm-edit]:focus{outline:2px solid #2CA01C;background:#F0FBEA}[data-ofm-edit]:empty:before{content:"Click to type";color:#6B6C72;font-weight:normal}';
      doc.head.appendChild(style);
    }
    fit();
    highlight();
  };

  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !loaded) return;
    prepare(doc);
    const editable = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-ofm-edit]") || null;
    const select = (event: Event) => {
      if (patching.current) return;
      const node = event.target as HTMLElement;
      const section = node.closest?.<HTMLElement>("[data-ofm-section]")?.dataset.ofmSection;
      if (!section) return;
      let target: PayslipEditTarget | undefined;
      try { target = JSON.parse(editable(event.target)?.dataset.ofmEdit || "null") || undefined; } catch { /* invalid marker */ }
      latest.current.onSelect(section, target, node.closest?.<HTMLElement>("[data-ofm-added-section]")?.dataset.ofmAddedSection);
    };
    const commit = () => { if (patching.current) return; const edits = flush(); if (edits.length) latest.current.onEdits(edits); };
    const input = () => {
      if (patching.current) return;
      const active = editable(doc.activeElement);
      let sample = false;
      try { sample = JSON.parse(active?.dataset.ofmEdit || "null")?.kind === "preview-value"; } catch { /* invalid marker */ }
      latest.current.onPendingChange(Boolean(active && !sample && read(active) !== active.dataset.ofmOriginal));
    };
    const keydown = (event: KeyboardEvent) => {
      const element = editable(event.target);
      if (!element) return;
      if (event.key === "Escape") { element.textContent = element.dataset.ofmOriginal || ""; element.blur(); event.preventDefault(); }
      if (event.key === "Enter" && element.dataset.ofmMultiline !== "true") { event.preventDefault(); element.blur(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && read(element) === element.dataset.ofmOriginal) {
        event.preventDefault();
        if (event.shiftKey) latest.current.onRedo(); else latest.current.onUndo();
      }
    };
    const paste = (event: ClipboardEvent) => {
      const element = editable(event.target);
      if (!element) return;
      event.preventDefault();
      const selection = doc.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!element.contains(range.commonAncestorContainer)) return;
      let text = event.clipboardData?.getData("text/plain") || "";
      if (element.dataset.ofmMultiline !== "true") text = text.replace(/[\r\n]+/g, " ");
      range.deleteContents();
      const node = doc.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node); range.collapse(true);
      selection.removeAllRanges(); selection.addRange(range);
      input();
    };
    const drop = (event: DragEvent) => { if (editable(event.target)) event.preventDefault(); };
    doc.addEventListener("click", select);
    doc.addEventListener("focusin", select);
    doc.addEventListener("focusout", commit);
    doc.addEventListener("keydown", keydown);
    doc.addEventListener("paste", paste);
    doc.addEventListener("drop", drop);
    doc.addEventListener("input", input);
    return () => {
      doc.removeEventListener("click", select); doc.removeEventListener("focusin", select);
      doc.removeEventListener("focusout", commit); doc.removeEventListener("keydown", keydown);
      doc.removeEventListener("paste", paste); doc.removeEventListener("drop", drop);
      doc.removeEventListener("input", input);
    };
  }, [loaded]);

  // Patch the existing document instead of reloading the iframe after each edit.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !loaded) return;
    const active = doc.activeElement as HTMLElement | null;
    const target = active?.dataset.ofmEdit;
    const pending = target ? read(active!) : undefined;
    const hasPending = Boolean(target && pending !== active?.dataset.ofmOriginal);
    const selection = doc.getSelection();
    let offset = 0;
    if (target && selection?.rangeCount && active?.contains(selection.focusNode)) {
      const range = selection.getRangeAt(0).cloneRange();
      range.selectNodeContents(active); range.setEnd(selection.focusNode!, selection.focusOffset);
      offset = range.toString().length;
    }
    const scroll = doc.scrollingElement?.scrollTop || 0;
    const parsed = new DOMParser().parseFromString(props.html, "text/html");
    patching.current = true;
    doc.body.innerHTML = parsed.body.innerHTML;
    const templateStyle = doc.head.querySelector("style:not(#ofm-edit-style)");
    if (templateStyle) templateStyle.textContent = parsed.head.querySelector("style")?.textContent || "";
    prepare(doc);
    if (target) {
      const next = Array.from(doc.querySelectorAll<HTMLElement>("[data-ofm-edit]")).find((element) => element.dataset.ofmEdit === target);
      if (next) {
        if (hasPending) next.textContent = pending || "";
        next.focus({ preventScroll: true });
        const walk = doc.createTreeWalker(next, 4);
        let node = walk.nextNode(); let remaining = offset;
        while (node && remaining > (node.textContent?.length || 0)) { remaining -= node.textContent?.length || 0; node = walk.nextNode(); }
        const range = doc.createRange();
        if (node) range.setStart(node, Math.min(remaining, node.textContent?.length || 0)); else range.selectNodeContents(next);
        range.collapse(true); selection?.removeAllRanges(); selection?.addRange(range);
      }
    }
    if (doc.scrollingElement) doc.scrollingElement.scrollTop = scroll;
    patching.current = false;
  }, [props.html, loaded, props.revision]);
  useEffect(() => { fit(); }, [width, loaded, props.zoom]);
  useEffect(() => {
    frame.current?.contentDocument?.querySelectorAll<HTMLElement>("[data-ofm-edit]").forEach((element) => { element.contentEditable = props.disabled ? "false" : "true"; });
  }, [props.disabled, loaded]);
  useEffect(() => { highlight(); }, [props.selectedSection, props.selectedAddedId, loaded, props.html]);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !props.focusTarget) return;
    const key = JSON.stringify(props.focusTarget);
    const node = Array.from(doc.querySelectorAll<HTMLElement>("[data-ofm-edit]")).find((element) => element.dataset.ofmEdit === key);
    node?.focus(); node?.scrollIntoView({ block: "nearest" });
  }, [props.focusTarget, loaded]);

  return <View style={{ flex: 1, minHeight: 280, backgroundColor: "#E5E7EB" }} onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
    {React.createElement("iframe", { ref: frame, title: "Click to edit payslip", srcDoc: initialHtml.current, sandbox: "allow-same-origin", onLoad: () => setLoaded((value) => value + 1), style: { width: "100%", height: "100%", border: 0, flex: 1 } })}
  </View>;
});
