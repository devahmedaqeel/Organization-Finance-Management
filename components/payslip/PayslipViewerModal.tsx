import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { PayrollEntry } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { usePayslipOrganizationProfile, usePayslipTemplates } from "@/hooks/usePayslipTemplates";
import { getLastUsedTemplateId, setLastUsedTemplateId } from "@/services/PayslipTemplateService";
import { buildPayslipRenderData, renderPayslipDocument } from "@/services/payslipTemplateRenderer";
import { generatePayslipsPdf, preparePayslipProfile, printPayslips } from "@/services/payslipDocumentService";
import { openPdfFile, savePdfToPhone, sharePdfFile } from "@/services/pdfDownloadService";
import { PayslipPreview } from "./PayslipPreview";
import { ACCENT, Segmented, SmallButton } from "./controls";

/**
 * Generate salary slips from payroll records with a chosen template:
 * preview → print / download PDF / share. One entry = individual slip; many = bulk PDF.
 */
export function PayslipViewerModal({
  visible,
  entries,
  onClose,
}: {
  visible: boolean;
  entries: PayrollEntry[];
  onClose: () => void;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const narrow = width < 720;
  const { user } = useAuth();
  const lib = usePayslipTemplates();
  const org = usePayslipOrganizationProfile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "pdf" | "print" | "share">(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [lastFile, setLastFile] = useState<{ uri: string; filename: string } | null>(null);

  // Remember each user's last choice; otherwise use the organization default.
  useEffect(() => {
    if (!visible || !user?.organizationId) return;
    setMessage(null);
    setLastFile(null);
    getLastUsedTemplateId(user.organizationId, user.id).then((id) => setSelectedId(id));
  }, [visible, user?.organizationId, user?.id]);

  const template = lib.resolve(lib.canSelect ? selectedId : null);
  // Employees only ever receive their own records, so they may see their own details unmasked.
  const canViewSensitive = lib.canViewSensitive || user?.role === "employee";

  const slips = useMemo(() => {
    try {
      return entries.map((e) => buildPayslipRenderData(e, org, { canViewSensitive }));
    } catch {
      return [];
    }
  }, [entries, org, canViewSensitive]);

  const html = useMemo(
    () => (visible && slips.length ? renderPayslipDocument(template, slips, { mode: "screen" }) : ""),
    [visible, template, slips]
  );
  const warnings = useMemo(() => Array.from(new Set(slips.flatMap((s) => s.warnings))), [slips]);

  const choose = (id: string) => {
    setSelectedId(id);
    if (user?.organizationId) setLastUsedTemplateId(user.organizationId, user.id, id);
  };

  const preparedSlips = async () => {
    const prepared = await preparePayslipProfile(org);
    return entries.map((e) => buildPayslipRenderData(e, prepared, { canViewSensitive }));
  };

  const handlePdf = async (share: boolean) => {
    setBusy(share ? "share" : "pdf");
    setMessage(null);
    try {
      const result = await generatePayslipsPdf(template, await preparedSlips(), { organizationId: user?.organizationId });
      if (result.method === "file" && result.uri && Platform.OS !== "web") {
        setLastFile({ uri: result.uri, filename: result.filename });
        if (share) {
          // Opens WhatsApp / Gmail / Drive etc. with the real PDF attached
          await sharePdfFile(result.uri, result.filename);
          setMessage({ tone: "ok", text: `PDF ready to share (${result.filename}).` });
        } else {
          // Save into a folder the user can find (Android: chosen folder, iOS: Files app)
          const saved = await savePdfToPhone(result.uri, result.filename);
          setMessage({ tone: saved.saved ? "ok" : "err", text: saved.saved ? `${saved.message} (${result.filename})` : saved.message });
        }
        return;
      }
      if (result.method === "file" && result.uri) setLastFile({ uri: result.uri, filename: result.filename });
      setMessage({ tone: "ok", text: result.method === "file" ? `${result.message} (${result.filename})` : result.message });
    } catch (err: any) {
      setMessage({ tone: "err", text: err?.message || "Unable to generate the PDF." });
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = async () => {
    setBusy("print");
    setMessage(null);
    try {
      await printPayslips(template, await preparedSlips());
    } catch (err: any) {
      setMessage({ tone: "err", text: err?.message || "Unable to print." });
    } finally {
      setBusy(null);
    }
  };

  const title =
    entries.length === 1
      ? `${entries[0].employeeName} · ${entries[0].month}`
      : `${entries.length} payslips (bulk)`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: narrow ? 6 : 20 }}>
        <View style={{ width: "100%", maxWidth: 1000, height: "94%", backgroundColor: colors.card, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
          <View style={{ padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 15 }}>
                  Salary Slip
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  {title} · Template: {template.name}
                </Text>
              </View>
              <SmallButton label="Close" onPress={onClose} />
            </View>

            {lib.canSelect && lib.activeTemplates.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Segmented
                  value={template.id}
                  options={lib.activeTemplates.map((t) => ({
                    value: t.id,
                    label: t.id === lib.defaultTemplateId ? `${t.name} (default)` : t.name,
                  }))}
                  onChange={choose}
                />
              </ScrollView>
            ) : null}

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <SmallButton label={busy === "pdf" ? "Generating…" : "Download PDF"} tone="primary" disabled={Boolean(busy) || !slips.length} onPress={() => handlePdf(false)} />
              <SmallButton label={busy === "print" ? "Opening…" : "Print"} disabled={Boolean(busy) || !slips.length} onPress={handlePrint} />
              {Platform.OS !== "web" ? (
                <SmallButton label={busy === "share" ? "Preparing…" : "Share PDF"} disabled={Boolean(busy) || !slips.length} onPress={() => handlePdf(true)} />
              ) : null}
              {Platform.OS !== "web" && lastFile ? (
                <SmallButton label="Open PDF" onPress={() => openPdfFile(lastFile.uri, lastFile.filename).catch(() => {})} />
              ) : null}
              {busy ? <ActivityIndicator color={ACCENT} /> : null}
            </View>
            {message ? (
              <Text accessibilityLiveRegion="polite" style={{ color: message.tone === "ok" ? colors.income : colors.expense, fontSize: 12 }}>
                {message.text}
              </Text>
            ) : null}
            {warnings.map((w) => (
              <Text key={w} style={{ color: colors.warning, fontSize: 11 }}>
                ⚠ {w}
              </Text>
            ))}
          </View>
          {slips.length ? (
            <PayslipPreview html={html} />
          ) : (
            <View style={{ padding: 24 }}>
              <Text style={{ color: colors.mutedForeground }}>No payroll record selected.</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
