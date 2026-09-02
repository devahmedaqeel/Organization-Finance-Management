import React, { useState, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { useFinance, Department } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { WebDepartmentModal } from "./modals/WebDepartmentModal";
import { WebDepartmentStaffModal } from "./modals/WebDepartmentStaffModal";
import { WebConfirmModal } from "./modals/WebConfirmModal";
import {
  SvgLayers,
  SvgPlus,
  SvgUsers,
  SvgPieChart,
  SvgFileText,
} from "./SvgIcons";

export function WebDepartments() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();
  const { departments, transactions, deleteDepartment } = useFinance();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [staffModalDept, setStaffModalDept] = useState<Department | null>(null);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);

  const canEdit = user?.role === "admin";

  // Calculate actual spend for each department
  const deptsWithSpend = useMemo(() => {
    return (departments || []).map((d) => {
      const actualSpend = (transactions || [])
        .filter((t) => t && t.type === "expense" && t.department?.trim().toLowerCase() === d.name?.trim().toLowerCase())
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const ratio = (d.budgetAllocated || 0) > 0 ? (actualSpend / d.budgetAllocated) * 100 : 0;
      return {
        ...d,
        actualSpend,
        ratio,
        isOver: ratio >= 100,
        isWarning: ratio >= 80 && ratio < 100,
      };
    });
  }, [departments, transactions]);

  const totalHeadcount = useMemo(
    () => (departments || []).reduce((s, d) => s + (d.headCount || 0), 0),
    [departments]
  );

  const totalAllocated = useMemo(
    () => (departments || []).reduce((s, d) => s + (d.budgetAllocated || 0), 0),
    [departments]
  );

  const totalActualSpend = useMemo(
    () => (deptsWithSpend || []).reduce((s, d) => s + (d.actualSpend || 0), 0),
    [deptsWithSpend]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Page Title & Action Bar ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: "#0EA5E920" }]}>
              <SvgLayers size={20} color="#0EA5E9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Monitored Cost Centers</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                Headcount distribution, cost tracking, and unit leadership management
              </Text>
            </View>
          </View>
        </View>

        {canEdit && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: "#0EA5E9" }, isMobile && { width: "100%" }]}
            onPress={() => {
              setEditingDept(null);
              setModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <SvgPlus size={15} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Add Department</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Department KPIs ─── */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>ACTIVE COST CENTERS</Text>
          <Text style={[styles.metricValue, { color: "#0EA5E9" }]}>{departments.length} Units</Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Monitored Organizational Divisions
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}
          onPress={() => {
            if (departments.length > 0) {
              setStaffModalDept(departments[0]);
            }
          }}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL STAFF HEADCOUNT</Text>
            <SvgUsers size={14} color="#0EA5E9" />
          </View>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{totalHeadcount} Personnel</Text>
          <Text style={[styles.metricSub, { color: "#0EA5E9" }]}>
            Across all active units • Click to view roster
          </Text>
        </TouchableOpacity>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL BUDGETED CEILINGS</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>
            {settings.currency} {totalAllocated.toLocaleString()}
          </Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Disbursed: {settings.currency} {totalActualSpend.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* ─── Department Cards Grid ─── */}
      <View style={styles.deptGrid}>
        {deptsWithSpend.length === 0 ? (
          <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SvgFileText size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No cost centers found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Click "Add Department" to register an organizational division.
            </Text>
          </View>
        ) : (
          deptsWithSpend.map((dept) => {
            const pct = Math.min(Math.round(dept.ratio), 100);
            const statusColor = dept.isOver ? colors.expense : dept.isWarning ? colors.warning : "#0EA5E9";

            return (
              <View
                key={dept.id}
                style={[
                  styles.deptCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: dept.isOver ? colors.expense + "60" : colors.border,
                  },
                ]}
              >
                {/* Header */}
                <View style={styles.deptCardHeader}>
                  <View style={styles.deptIconBadge}>
                    <SvgLayers size={18} color="#0EA5E9" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.deptName, { color: colors.foreground }]} numberOfLines={1}>
                      {dept.name}
                    </Text>
                    <Text style={[styles.deptHead, { color: colors.mutedForeground }]}>
                      {dept.headOfDepartment ? `Head: ${dept.headOfDepartment}` : "No Head Appointed"}
                    </Text>
                  </View>
                  
                  {/* Interactive Headcount & Staff Roster Badge */}
                  <TouchableOpacity
                    style={[
                      styles.headcountBadge,
                      {
                        backgroundColor: "#0EA5E915",
                        borderColor: "#0EA5E940",
                      },
                    ]}
                    onPress={() => setStaffModalDept(dept)}
                    activeOpacity={0.7}
                  >
                    <SvgUsers size={13} color="#0EA5E9" />
                    <Text style={[styles.headcountText, { color: "#0EA5E9" }]}>
                      {dept.headCount || 0}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Utilization Track */}
                <View style={styles.deptTrackWrap}>
                  <View style={styles.deptTrackLabels}>
                    <Text style={[styles.trackRatio, { color: statusColor }]}>
                      {dept.ratio.toFixed(1)}% Budget Spent
                    </Text>
                    <Text style={[styles.trackSpend, { color: colors.mutedForeground }]}>
                      {settings.currency} {dept.actualSpend.toLocaleString()} / {settings.currency} {dept.budgetAllocated.toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.deptTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.deptFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
                  </View>
                </View>

                {/* Meta details */}
                <View style={[styles.metaBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>CODE</Text>
                    <Text style={[styles.metaValue, { color: colors.foreground }]}>
                      {dept.code || `DPT-${dept.id.slice(-4).toUpperCase()}`}
                    </Text>
                  </View>
                  <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>CONTACT</Text>
                    <Text style={[styles.metaValue, { color: colors.foreground }]} numberOfLines={1}>
                      {dept.contactEmail || "N/A"}
                    </Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.cardActionBtn, { borderColor: "#0EA5E930", backgroundColor: "#0EA5E910" }]}
                    onPress={() => setStaffModalDept(dept)}
                  >
                    <Text style={[styles.cardActionText, { color: "#0EA5E9" }]}>View Personnel</Text>
                  </TouchableOpacity>

                  {canEdit && (
                    <>
                      <TouchableOpacity
                        style={[styles.cardActionBtn, { borderColor: colors.border }]}
                        onPress={() => {
                          setEditingDept(dept);
                          setModalVisible(true);
                        }}
                      >
                        <Text style={[styles.cardActionText, { color: colors.primary }]}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.cardActionBtn, { borderColor: colors.expense + "40", backgroundColor: colors.expense + "10" }]}
                        onPress={() => setDeletingDept(dept)}
                      >
                        <Text style={[styles.cardActionText, { color: colors.expense }]}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Edit/Create Department Modal */}
      <WebDepartmentModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingDept(null);
        }}
        deptToEdit={editingDept}
      />

      {/* Staff Roster Modal */}
      <WebDepartmentStaffModal
        visible={Boolean(staffModalDept)}
        onClose={() => setStaffModalDept(null)}
        department={staffModalDept}
        onEditDepartment={(dept) => {
          setEditingDept(dept);
          setModalVisible(true);
        }}
      />

      {/* Confirmation Modal */}
      <WebConfirmModal
        visible={Boolean(deletingDept)}
        onClose={() => setDeletingDept(null)}
        onConfirm={() => {
          if (deletingDept) {
            deleteDepartment(deletingDept.id);
          }
        }}
        title="Delete Department"
        message={`Are you sure you want to delete "${deletingDept?.name}"? All associated budget allocations and ledger tracking will be affected.`}
        confirmText="Delete Department"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 20,
    paddingBottom: 60,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 14,
  },
  titleIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  metricCard: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.5,
  },
  metricSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  deptGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  deptCard: {
    flex: 1,
    minWidth: 300,
    maxWidth: "100%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  deptCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deptIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#0EA5E918",
    alignItems: "center",
    justifyContent: "center",
  },
  deptName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  deptHead: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  headcountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    cursor: "pointer" as any,
  },
  headcountText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  deptTrackWrap: {
    gap: 6,
  },
  deptTrackLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trackRatio: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  trackSpend: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  deptTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  deptFill: {
    height: "100%",
    borderRadius: 3,
  },
  metaBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  metaItem: {
    flex: 1,
    paddingHorizontal: 6,
  },
  metaLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
  metaDivider: {
    width: 1,
    height: 24,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  cardActionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardActionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
