import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { Department, useFinance, PayrollEntry } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import {
  SvgUsers,
  SvgX,
  SvgBriefcase,
  SvgCheck,
  SvgTrendingUp,
} from "../SvgIcons";

interface WebDepartmentStaffModalProps {
  visible: boolean;
  onClose: () => void;
  department: Department | null;
  onEditDepartment?: (dept: Department) => void;
}

export function WebDepartmentStaffModal({
  visible,
  onClose,
  department,
  onEditDepartment,
}: WebDepartmentStaffModalProps) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { settings } = useSettings();
  const { payroll } = useFinance();

  if (!department) return null;

  // Filter staff members assigned to this department
  const deptStaff = payroll.filter(
    (p) => p.department?.trim().toLowerCase() === department.name?.trim().toLowerCase()
  );

  const totalMonthlyPayroll = deptStaff.reduce((sum, p) => sum + (p.netSalary || p.baseSalary || 0), 0);
  const registeredCount = deptStaff.length;
  const totalHeadcount = department.headCount || registeredCount;
  const unassignedSlots = Math.max(0, totalHeadcount - registeredCount);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, isMobile && { padding: 12 }]}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              width: isMobile ? "100%" : 580,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.headerIconWrap, { backgroundColor: "#0EA5E918" }]}>
                <SvgUsers size={20} color="#0EA5E9" />
              </View>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {department.name} — Staff & Roster
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                  {totalHeadcount} Total Personnel Assigned • {registeredCount} Payroll Profiles
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <SvgX size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Quick Stats Grid */}
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>TOTAL HEADCOUNT</Text>
              <Text style={[styles.statValue, { color: "#0EA5E9" }]}>{totalHeadcount}</Text>
              <Text style={[styles.statSub, { color: colors.mutedForeground }]}>Operational positions</Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>MONTHLY PAYROLL</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {settings.currency} {totalMonthlyPayroll.toLocaleString()}
              </Text>
              <Text style={[styles.statSub, { color: colors.mutedForeground }]}>Disbursed compensation</Text>
            </View>
          </View>

          {/* Personnel List */}
          <ScrollView style={styles.listContainer} contentContainerStyle={{ gap: 10, paddingVertical: 6 }}>
            <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>
              REGISTERED EMPLOYEES ({registeredCount})
            </Text>

            {deptStaff.length === 0 ? (
              <View style={[styles.emptyRoster, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <SvgBriefcase size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyRosterText, { color: colors.foreground }]}>
                  No individual staff payroll entries mapped yet.
                </Text>
                <Text style={[styles.emptyRosterSub, { color: colors.mutedForeground }]}>
                  This department currently tracks {totalHeadcount} operational personnel. Individual profiles can be added in the Staff Payroll tab.
                </Text>
              </View>
            ) : (
              deptStaff.map((staff) => (
                <View
                  key={staff.id}
                  style={[styles.staffCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <View style={styles.staffAvatar}>
                    <Text style={styles.staffAvatarText}>
                      {staff.employeeName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.staffName, { color: colors.foreground }]}>{staff.employeeName}</Text>
                    <Text style={[styles.staffMeta, { color: colors.mutedForeground }]}>
                      {staff.employeeId} • {staff.designation || "Staff Member"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.staffSalary, { color: colors.foreground }]}>
                      {settings.currency} {(staff.netSalary || staff.baseSalary).toLocaleString()}
                    </Text>
                    <View style={styles.paidBadge}>
                      <SvgCheck size={10} color="#10B981" />
                      <Text style={styles.paidBadgeText}>Active</Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            {unassignedSlots > 0 && (
              <View style={[styles.unassignedBox, { borderColor: colors.border }]}>
                <Text style={[styles.unassignedText, { color: colors.mutedForeground }]}>
                  + {unassignedSlots} additional operational personnel positions assigned to this department
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
            {onEditDepartment && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={() => {
                  onClose();
                  onEditDepartment(department);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Adjust Headcount</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: "#0EA5E9" }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
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
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    maxHeight: "90%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 4,
  },
  statSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  listContainer: {
    paddingHorizontal: 20,
    maxHeight: 320,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  staffCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0EA5E920",
    alignItems: "center",
    justifyContent: "center",
  },
  staffAvatarText: {
    color: "#0EA5E9",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  staffName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  staffMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  staffSalary: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  paidBadgeText: {
    color: "#10B981",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  emptyRoster: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    textAlign: "center",
    gap: 6,
  },
  emptyRosterText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  emptyRosterSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
  },
  unassignedBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    marginTop: 4,
  },
  unassignedText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  primaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
});
