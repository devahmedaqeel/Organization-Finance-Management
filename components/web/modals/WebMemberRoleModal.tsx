import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { User, UserRole } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  SvgShield,
  SvgCheck,
  SvgX,
} from "../SvgIcons";

interface WebMemberRoleModalProps {
  visible: boolean;
  onClose: () => void;
  member: User | null;
  onUpdateSuccess?: (updatedMember: User) => void;
}

const ROLES: { id: UserRole; label: string; desc: string; color: string }[] = [
  {
    id: "admin",
    label: "Administrator",
    desc: "Full institutional system control: Manage staff, allocations, financial settings, and approvals.",
    color: "#6366F1",
  },
  {
    id: "accountant",
    label: "Accountant",
    desc: "Operational finance access: Record income, expenses, view reports, and track department budgets.",
    color: "#F59E0B",
  },
  {
    id: "manager",
    label: "Department Manager",
    desc: "Executive view-only clearance: Inspect institutional trends, financial reports, and departmental budgets.",
    color: "#8B5CF6",
  },
  {
    id: "employee",
    label: "Employee",
    desc: "Staff member access: Inspect department budgets and personal salary compensation slips.",
    color: "#10B981",
  },
];

export function WebMemberRoleModal({ visible, onClose, member, onUpdateSuccess }: WebMemberRoleModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [selectedRole, setSelectedRole] = useState<UserRole>(member?.role || "accountant");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (member) setSelectedRole(member.role);
    setError("");
  }, [member, visible]);

  if (!visible || !member) return null;

  const handleUpdate = async () => {
    if (submitting || selectedRole === member.role) {
      onClose();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const { setDoc } = require("firebase/firestore");
      if (member.id) {
        await setDoc(
          doc(db, "users", member.id),
          {
            id: member.id,
            name: member.name,
            email: member.email,
            organization: member.organization || "Organization Finance Management",
            organizationId: member.organizationId || "demo-org",
            role: selectedRole,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      if (onUpdateSuccess) {
        onUpdateSuccess({ ...member, role: selectedRole });
      }

      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to update member role in Firestore.");
    } finally {
      setSubmitting(false);
    }
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
                <Text style={[styles.title, { color: colors.foreground }]}>Modify Access Role</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{member.name} ({member.email})</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
              <SvgX size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Role Selection Options */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 10 }}>
              {ROLES.map((r) => {
                const isSelected = selectedRole === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.roleOption,
                      {
                        backgroundColor: isSelected ? r.color + "14" : colors.background,
                        borderColor: isSelected ? r.color : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedRole(r.id)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[styles.roleLabel, { color: isSelected ? r.color : colors.foreground }]}>
                        {r.label}
                      </Text>
                      <Text style={[styles.roleDesc, { color: colors.mutedForeground }]}>{r.desc}</Text>
                    </View>

                    <View
                      style={[
                        styles.radioCircle,
                        {
                          borderColor: isSelected ? r.color : colors.border,
                          backgroundColor: isSelected ? r.color : "transparent",
                        },
                      ]}
                    >
                      {isSelected && <SvgCheck size={12} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.expense + "18", borderColor: colors.expense + "40" }]}>
                <Text style={[styles.errorText, { color: colors.expense }]}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer */}
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
              onPress={handleUpdate}
              disabled={submitting}
            >
              <SvgCheck size={15} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>
                {submitting ? "Updating..." : "Save Role Permissions"}
              </Text>
            </TouchableOpacity>
          </View>
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
  roleOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  roleLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  roleDesc: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
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
