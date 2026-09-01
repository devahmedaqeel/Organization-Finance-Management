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
}

export function WebInviteModal({ visible, onClose, onInviteSuccess }: WebInviteModalProps) {
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
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
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

      const appUrl = "https://ofmapp-main.web.app/login";
      const inviteSubject = `Invitation to join ${orgName} on OFM (${role.toUpperCase()})`;
      const inviteBody = `Hello ${memberName},

You have been invited by ${user?.name || "Administrator"} to join ${orgName} on the Organization Finance Management (OFM) platform.

Assigned Role: ${role.toUpperCase()}
Access Portal: ${appUrl}

How to activate your access:
1. Open ${appUrl}
2. Click "Create Account"
3. Register using this email address: ${cleanEmail}
4. Enter Admin email / Invite Code: ${user?.email || "admin@ofm.com"}

Your account will automatically be activated with ${role.toUpperCase()} permissions upon registration.

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
      setError(e?.message || "Failed to issue invitation.");
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, isMobile && { padding: 10 }]}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.iconWrap, { backgroundColor: "#6366F120" }]}>
                <SvgShield size={20} color="#6366F1" />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>Invite Team Member</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Assign role permissions and send authorization
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
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
                  Invitation Created & Ready to Send!
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 17 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", color: colors.foreground }}>{inviteSuccessData.email}</Text> is registered as <Text style={{ fontFamily: "Inter_700Bold", color: "#6366F1" }}>{inviteSuccessData.role.toUpperCase()}</Text> in {inviteSuccessData.orgName}.
                </Text>
              </View>

              <View style={{ width: "100%", backgroundColor: colors.background, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.5 }}>
                  INVITATION MESSAGE & ACCESS DETAILS
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
                    Send via Web Gmail
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
                      {copied ? "Copied!" : "Copy Details"}
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
                      Mail App
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
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary }}>Done / Close</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>COLLEAGUE FULL NAME</Text>
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
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>OFFICIAL EMAIL ADDRESS *</Text>
                  <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.input, { color: colors.foreground }]}
                      placeholder="colleague@organization.com"
                      placeholderTextColor={colors.mutedForeground + "80"}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={email}
                      onChangeText={setEmail}
                    />
                  </View>
                </View>

                {/* Role Selection */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>ASSIGNED ACCESS ROLE *</Text>
                  <View style={{ gap: 8 }}>
                    {[
                      { id: "admin" as const, title: "Administrator", desc: "Full root ledger & user access", color: "#6366F1" },
                      { id: "accountant" as const, title: "Accountant", desc: "Create/edit vouchers & financial statements", color: "#F59E0B" },
                      { id: "manager" as const, title: "Department Manager", desc: "Department budget allocation oversight", color: "#8B5CF6" },
                      { id: "employee" as const, title: "Employee", desc: "View department allocations and payroll slip", color: "#10B981" },
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
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.roleTitle, { color: role === r.id ? r.color : colors.foreground }]}>
                            {r.title}
                          </Text>
                          <Text style={[styles.roleDesc, { color: colors.mutedForeground }]}>{r.desc}</Text>
                        </View>
                        {role === r.id && (
                          <View style={[styles.roleCheck, { backgroundColor: r.color }]}>
                            <SvgCheck size={12} color="#FFFFFF" />
                          </View>
                        )}
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
              <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} disabled={submitting}>
                  <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    {
                      backgroundColor: "#6366F1",
                      opacity: submitting ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleSend}
                  disabled={submitting}
                >
                  <SvgPlus size={15} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>
                    {submitting ? "Inviting..." : "Send Invitation"}
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
    borderRadius: 20,
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
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 11.5,
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
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
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
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  roleTitle: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  roleDesc: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
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
