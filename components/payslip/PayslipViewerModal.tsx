import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
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

  const periods = Array.from(new Set(entries.map((e) => e.month).filter(Boolean)));
  const title = entries.length === 1 ? `Payslip · ${entries[0].employeeName}` : `Payslips · ${entries.length} employees`;
  const subtitle =
    entries.length === 1
      ? `${entries[0].employeeId || ""}${entries[0].employeeId ? " · " : ""}Period ${entries[0].month}`
      : `${periods.length === 1 ? `Period ${periods[0]}` : `${periods.length} periods`} · one PDF with a page per employee`;
  const choices = lib.canSelect ? lib.activeTemplates : [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: narrow ? 6 : 20 }}>
        <View style={{ width: "100%", maxWidth: 1040, height: "94%", backgroundColor: colors.card, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
          {/* Title bar */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: narrow ? 14 : 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 17 }}>{title}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>
            </View>
            <SmallButton label="Close" onPress={onClose} />
          </View>

          <View style={{ paddingHorizontal: narrow ? 14 : 20, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {/* Step 1: template */}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.foreground, fontSize: 13.5, fontFamily: "Inter_600SemiBold" }}>
                1. Choose a template
              </Text>
              {choices.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {choices.map((t) => {
                    const isSel = t.id === template.id;
                    const isDefault = t.id === lib.defaultTemplateId;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => choose(t.id)}
                        disabled={Boolean(busy)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSel }}
                        activeOpacity={0.8}
                        style={{
                          width: narrow ? 220 : 250,
                          padding: 12,
                          borderRadius: 8,
                          borderWidth: isSel ? 2 : 1,
                          borderColor: isSel ? colors.primary : colors.border,
                          backgroundColor: isSel ? colors.primary + "0F" : colors.background,
                          flexDirection: "row",
                          gap: 10,
                        }}
                      >
                        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: isSel ? colors.primary : colors.mutedForeground, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                          {isSel ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                          <Text style={{ color: colors.foreground, fontSize: 13.5, fontFamily: "Inter_600SemiBold" }}>{t.name}</Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                            {t.page.size} · {t.page.orientation === "landscape" ? "Landscape" : "Portrait"} · {t.components.layout === "dual" ? "Two-column" : "Single-column"}
                          </Text>
                          {isDefault ? <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Organization default</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  {template.name} — set by your organization.
                </Text>
              )}
              {choices.length > 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  The preview below updates instantly. Your choice is remembered next time.
                </Text>
              ) : null}
            </View>

            {/* Step 2: output */}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.foreground, fontSize: 13.5, fontFamily: "Inter_600SemiBold" }}>2. Download or print</Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <SmallButton
                  label={busy === "pdf" ? "Generating PDF…" : `Download PDF${entries.length > 1 ? ` (${entries.length})` : ""}`}
                  tone="primary"
                  disabled={Boolean(busy) || !slips.length}
                  accessibilityLabel={`Download PDF using ${template.name}`}
                  onPress={() => handlePdf(false)}
                />
                <SmallButton label={busy === "print" ? "Opening…" : "Print"} disabled={Boolean(busy) || !slips.length} onPress={handlePrint} />
                {Platform.OS !== "web" ? (
                  <SmallButton label={busy === "share" ? "Preparing…" : "Share PDF"} disabled={Boolean(busy) || !slips.length} onPress={() => handlePdf(true)} />
                ) : null}
                {Platform.OS !== "web" && lastFile ? (
                  <SmallButton label="Open PDF" onPress={() => openPdfFile(lastFile.uri, lastFile.filename).catch(() => {})} />
                ) : null}
                {busy ? <ActivityIndicator color={colors.primary} /> : null}
                <Text style={{ color: colors.mutedForeground, fontSize: 12.5 }}>
                  Using <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{template.name}</Text>
                </Text>
              </View>
            </View>

            {message ? (
              <View
                accessibilityLiveRegion="polite"
                style={{ padding: 10, borderRadius: 6, backgroundColor: (message.tone === "ok" ? colors.income : colors.expense) + "14" }}
              >
                <Text style={{ color: message.tone === "ok" ? colors.income : colors.expense, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                  {message.tone === "ok" ? "✓ " : "⚠ "}
                  {message.text}
                </Text>
              </View>
            ) : null}
            {warnings.map((w) => (
              <Text key={w} style={{ color: colors.warning, fontSize: 12.5 }}>
                ⚠ {w}
              </Text>
            ))}
          </View>

          {/* Live preview */}
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
