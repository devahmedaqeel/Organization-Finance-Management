import React, { useState, useEffect } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { Department, useFinance } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import {
  SvgLayers,
  SvgPlus,
  SvgCheck,
  SvgX,
} from "../SvgIcons";

interface WebDepartmentModalProps {
  visible: boolean;
  onClose: () => void;
  deptToEdit?: Department | null;
}

export function WebDepartmentModal({ visible, onClose, deptToEdit }: WebDepartmentModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { settings } = useSettings();
  const { addDepartment, updateDepartment } = useFinance();

  const isEditing = Boolean(deptToEdit);

  const [name, setName] = useState("");
  const [headCount, setHeadCount] = useState("");
  const [budgetAllocated, setBudgetAllocated] = useState("");
  const [code, setCode] = useState("");
  const [headOfDepartment, setHeadOfDepartment] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (deptToEdit) {
      setName(deptToEdit.name);
      setHeadCount(String(deptToEdit.headCount || ""));
      setBudgetAllocated(String(deptToEdit.budgetAllocated || ""));
      setCode(deptToEdit.code || "");
      setHeadOfDepartment(deptToEdit.headOfDepartment || "");
      setContactEmail(deptToEdit.contactEmail || "");
    } else {
      setName("");
      setHeadCount("10");
      setBudgetAllocated("");
      setCode("");
      setHeadOfDepartment("");
      setContactEmail("");
    }
    setError("");
  }, [deptToEdit, visible]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!name.trim()) {
      setError("Please enter a department name");
      return;
    }
    const numHeadCount = parseInt(headCount) || 0;
    const numBudget = parseFloat(budgetAllocated) || 0;

    setSubmitting(true);
    setError("");

    try {
      if (isEditing && deptToEdit) {
        updateDepartment(deptToEdit.id, {
          name: name.trim(),
          headCount: numHeadCount,
          budgetAllocated: numBudget,
          code: code.trim(),
          headOfDepartment: headOfDepartment.trim(),
          contactEmail: contactEmail.trim(),
        });
      } else {
        addDepartment({
          name: name.trim(),
          headCount: numHeadCount,
          budgetAllocated: numBudget,
          code: code.trim(),
          headOfDepartment: headOfDepartment.trim(),
          contactEmail: contactEmail.trim(),
        });
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to commit department.");
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
              <View style={[styles.iconWrap, { backgroundColor: "#0EA5E920" }]}>
                <SvgLayers size={20} color="#0EA5E9" />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  {isEditing ? "Modify Cost Center" : "Register Department / Cost Center"}
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Organizational unit configuration
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
              <SvgX size={16} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Department Name */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>DEPARTMENT NAME *</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="e.g. Faculty of Engineering"
                  placeholderTextColor={colors.mutedForeground + "80"}
                  value={name}
                  onChangeText={setName}
                  autoFocus={!isEditing}
                />
              </View>
            </View>

            {/* Code & Headcount */}
            <View style={[styles.row, isMobile && { flexDirection: "column" }]}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>UNIT CODE</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="e.g. ENG-01"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={code}
                    onChangeText={setCode}
                  />
                </View>
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>STAFF HEADCOUNT</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="e.g. 24"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    keyboardType="numeric"
                    value={headCount}
                    onChangeText={setHeadCount}
                  />
                </View>
              </View>
            </View>

            {/* Budget Ceiling */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>BUDGET ALLOCATED CEILING ({settings.currency})</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.currencyPrefix, { color: colors.mutedForeground }]}>{settings.currency}</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground + "80"}
                  keyboardType="numeric"
                  value={budgetAllocated}
                  onChangeText={setBudgetAllocated}
                />
              </View>
            </View>

            {/* Head of Department & Contact */}
            <View style={[styles.row, isMobile && { flexDirection: "column" }]}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>HEAD OF DEPARTMENT</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="e.g. Dr. Tariq Mahmood"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={headOfDepartment}
                    onChangeText={setHeadOfDepartment}
                  />
                </View>
              </View>

              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>CONTACT EMAIL</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="dept@organization.com"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    keyboardType="email-address"
                    value={contactEmail}
                    onChangeText={setContactEmail}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            {/* Error Banner */}
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
                  backgroundColor: "#0EA5E9",
                  opacity: submitting ? 0.7 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <SvgPlus size={15} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>
                {submitting ? "Saving..." : isEditing ? "Update Department" : "Save Department"}
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
    maxWidth: 580,
    maxHeight: "90%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
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
    flex: 1,
    flexShrink: 1,
  },
  bodyContent: {
    padding: 20,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
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
  currencyPrefix: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  input: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    height: "100%",
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
