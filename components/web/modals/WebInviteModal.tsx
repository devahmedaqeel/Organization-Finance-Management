import React, { useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import {
  SvgShield,
  SvgPlus,
  SvgCheck,
  SvgX,
  SvgMail,
} from "../SvgIcons";

interface WebInviteModalProps {
  visible: boolean;
  onClose: () => void;
  onInviteSuccess?: (newMember: any) => void;
  /** Emails already on the team, so the same person isn't invited twice. */
  existingEmails?: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLE_LABEL: Record<string, string> = { admin: "Admin", accountant: "Accountant", manager: "Manager", employee: "Employee" };

export function WebInviteModal({ visible, onClose, onInviteSuccess, existingEmails = [] }: WebInviteModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("accountant");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteSuccessData, setInviteSuccessData] = useState<{
    email: string;
    role: UserRole;
    name: string;
    orgName: string;
    inviteText: string;
    mailtoUrl: string;
    gmailUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSend = async () => {
    if (submitting) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Enter the person's email address.");
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      setError("That email doesn't look right. Check it, for example name@company.com.");
      return;
    }
    if (existingEmails.some((e) => (e || "").trim().toLowerCase() === cleanEmail)) {
      setError("This person is already on your team. Use “Change role” on the Team page instead.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const orgName = settings.organizationName || user?.organization || "Organization Finance Management";
      const orgId = user?.organizationId || "default-org";

      const newUserId = `u_${cleanEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const memberName = name.trim() || cleanEmail.split("@")[0];

      // Save invitation record in Firestore
      await setDoc(doc(db, "invitations", cleanEmail), {
        email: cleanEmail,
        invitedName: memberName,
        role,
        organization: orgName,
        organizationId: orgId,
        invitedByEmail: user?.email || "",
        invitedByName: user?.name || "Administrator",
        status: "pending",
        createdAt: Timestamp.now(),
      });

      // Save user profile stub for instant 2-way Web & Mobile sync
      await setDoc(doc(db, "users", newUserId), {
        id: newUserId,
        name: memberName,
        email: cleanEmail,
        role,
        organization: orgName,
        organizationId: orgId,
        createdAt: new Date().toISOString(),
        status: "active",
      }, { merge: true });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const appUrl = origin && !/localhost|127\.0\.0\.1/.test(origin) ? `${origin}/login` : "https://ofmapp-main.web.app/login";
      const roleName = ROLE_LABEL[role] || role;
      const inviteSubject = `You're invited to join ${orgName} on OFM as ${roleName}`;
      const inviteBody = `Hello ${memberName},

You have been invited by ${user?.name || "Administrator"} to join ${orgName} on the Organization Finance Management (OFM) platform.

Your role: ${roleName}
Sign-in page: ${appUrl}

How to get started:
1. Open ${appUrl}
2. Click "Create Account"
3. Sign up with this email address: ${cleanEmail}
4. When asked for an invite code, enter: ${user?.email || "admin@ofm.com"}

Your account will be set up with ${roleName} access automatically.

Best regards,
${user?.name || "Administrator"}
${orgName}`;

      const mailtoUrl = `mailto:${cleanEmail}?subject=${encodeURIComponent(inviteSubject)}&body=${encodeURIComponent(inviteBody)}`;
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(cleanEmail)}&su=${encodeURIComponent(inviteSubject)}&body=${encodeURIComponent(inviteBody)}`;

      if (onInviteSuccess) {
        onInviteSuccess({
          id: newUserId,
          name: memberName,
          email: cleanEmail,
          role,
          organization: orgName,
          organizationId: orgId,
        });
      }

      setInviteSuccessData({
        email: cleanEmail,
        role,
        name: memberName,
        orgName,
        inviteText: inviteBody,
        mailtoUrl,
        gmailUrl,
      });
    } catch (e: any) {
      setError(/permission/i.test(e?.message || "") ? "You don't have permission to invite people. Ask an admin." : e?.message || "The invitation couldn't be saved. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyInvite = () => {
    if (!inviteSuccessData) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(inviteSuccessData.inviteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleResetAndClose = () => {
    setInviteSuccessData(null);
    setName("");
    setEmail("");
    setError("");
    setCopied(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleResetAndClose}>
      <View {...({ dataSet: { ofmDialogOverlay: "" } } as any)} style={[styles.backdrop, isMobile && { padding: 10 }]}>
        <View {...({ dataSet: { ofmDialogCard: "" } } as any)} style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View {...({ dataSet: { ofmDialogHeader: "" } } as any)} style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.iconWrap, { backgroundColor: colors.primary + "16" }]}>
                <SvgShield size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>Invite a team member</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Choose what they can do, then send them an email
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={handleResetAndClose} accessibilityLabel="Close">
              <SvgX size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {inviteSuccessData ? (
            <ScrollView
              style={{ maxHeight: 540 }}
              contentContainerStyle={{ padding: 22, gap: 14, alignItems: "center" }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#10B98120", alignItems: "center", justifyContent: "center" }}>
                <SvgCheck size={24} color="#10B981" />
              </View>
              <View style={{ alignItems: "center", gap: 3 }}>
                <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" }}>
                  Invite ready — now send it
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 17 }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{inviteSuccessData.name}</Text> ({inviteSuccessData.email}) has been added to {inviteSuccessData.orgName} as <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary }}>{ROLE_LABEL[inviteSuccessData.role] || inviteSuccessData.role}</Text>. Send them the email below so they can sign up.
                </Text>
              </View>

              <View style={{ width: "100%", backgroundColor: colors.background, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
                <Text style={{ fontSize: 11.5, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.5 }}>
                  Email that will be sent
                </Text>
                <Text style={{ fontSize: 11.5, fontFamily: "Inter_500Medium", color: colors.foreground, lineHeight: 16 }}>
                  {inviteSuccessData.inviteText}
                </Text>
              </View>

              <View style={{ flexDirection: "column", gap: 8, width: "100%" }}>
                <TouchableOpacity
                  style={{
                    width: "100%",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    height: 44,
                    borderRadius: 10,
                    backgroundColor: "#EA4335",
                  }}
                  onPress={() => {
                    if (typeof window !== "undefined") {
                      window.open(inviteSuccessData.gmailUrl, "_blank");
                    }
                  }}
                >
                  <SvgMail size={16} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFFFFF" }}>
                    Send with Gmail
                  </Text>
                </TouchableOpacity>

                <View style={{ flexDirection: "row", gap: 8, width: "100%" }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: colors.cardAlt ?? colors.muted,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                    onPress={handleCopyInvite}
                  >
                    <SvgCheck size={14} color={copied ? "#10B981" : colors.foreground} />
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: copied ? "#10B981" : colors.foreground }}>
                      {copied ? "✓ Copied" : "Copy message"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: colors.cardAlt ?? colors.muted,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                    onPress={() => {
                      if (typeof window !== "undefined") {
                        window.location.href = inviteSuccessData.mailtoUrl;
                      }
                    }}
                  >
                    <SvgMail size={14} color={colors.foreground} />
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                      Open mail app
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: colors.primary + "15",
                  borderWidth: 1,
                  borderColor: colors.primary + "40",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                  marginBottom: 6,
                }}
                onPress={handleResetAndClose}
              >
                <Text style={{ fontSize: 13.5, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              <ScrollView {...({ dataSet: { ofmDialogBody: "" } } as any)} keyboardShouldPersistTaps="handled" style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Full name <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>(optional)</Text></Text>
                  <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.input, { color: colors.foreground }]}
                      placeholder="e.g. Maryam Naz"
                      placeholderTextColor={colors.mutedForeground + "80"}
                      value={name}
                      onChangeText={setName}
                      autoFocus
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Email address<Text style={{ color: colors.expense }}> *</Text></Text>
                  <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.input, { color: colors.foreground }]}
                      placeholder="colleague@organization.com"
                      placeholderTextColor={colors.mutedForeground + "80"}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        if (error) setError("");
                      }}
                    />
                  </View>
                  <Text style={[styles.hint, { color: colors.mutedForeground }]}>They'll sign up with this exact email to join your organization.</Text>
                </View>

                {/* Role Selection */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.foreground }]}>What can they do?<Text style={{ color: colors.expense }}> *</Text></Text>
                  <View style={{ gap: 8 }}>
                    {[
                      { id: "admin" as const, title: "Admin", desc: "Full access, including team, settings and payroll", color: "#4F46E5" },
                      { id: "accountant" as const, title: "Accountant", desc: "Records income, expenses, budgets and payroll", color: "#B45309" },
                      { id: "manager" as const, title: "Manager", desc: "Views reports, budgets and department spending", color: "#7C3AED" },
                      { id: "employee" as const, title: "Employee", desc: "Sees only their own payslips", color: "#047857" },
                    ].map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={[
                          styles.roleCard,
                          {
                            backgroundColor: role === r.id ? r.color + "14" : colors.background,
                            borderColor: role === r.id ? r.color : colors.border,
                          },
                        ]}
                        onPress={() => setRole(r.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: role === r.id }}
                      >
                        <View style={[styles.radio, { borderColor: role === r.id ? r.color : colors.border }]}>
                          {role === r.id ? <View style={[styles.radioDot, { backgroundColor: r.color }]} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.roleTitle, { color: role === r.id ? r.color : colors.foreground }]}>
                            {r.title}
                          </Text>
                          <Text style={[styles.roleDesc, { color: colors.mutedForeground }]}>{r.desc}</Text>
                        </View>

                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {error ? (
                  <View style={[styles.errorBanner, { backgroundColor: colors.expense + "18", borderColor: colors.expense + "40" }]}>
                    <Text style={[styles.errorText, { color: colors.expense }]}>{error}</Text>
                  </View>
                ) : null}
              </ScrollView>

              {/* Footer Actions */}
              <View {...({ dataSet: { ofmDialogFooter: "" } } as any)} style={[styles.footer, { borderTopColor: colors.border }]}>
                <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={handleResetAndClose} disabled={submitting}>
                  <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: submitting ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleSend}
                  disabled={submitting}
                >
                  <SvgPlus size={15} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>
                    {submitting ? "Creating invite…" : "Create invite"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  closeBtn: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  body: {
    maxHeight: 480,
  },
  bodyContent: {
    padding: 20,
    gap: 14,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    height: 42,
  },
  input: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    height: "100%",
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  roleTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  roleDesc: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginTop: 1,
  },
  roleCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
