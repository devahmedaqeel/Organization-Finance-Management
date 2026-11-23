import React, { useState, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { useFinance, Department } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { isSalaryExpenseCategory } from "@/constants/categories";
import { calculateBudgetAllocation, calculateBudgetUsed } from "@/services/FinancialCalculationEngine";
import { WebDepartmentModal } from "./modals/WebDepartmentModal";
import { WebDepartmentStaffModal } from "./modals/WebDepartmentStaffModal";
import { WebConfirmModal } from "./modals/WebConfirmModal";
import { FitText } from "./FitText";
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
  const { departments, transactions, deleteDepartment, addDepartment, budgets, payroll = [] } = useFinance();
  const [settingUp, setSettingUp] = useState<string | null>(null);
  const [setupMsg, setSetupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [staffModalDept, setStaffModalDept] = useState<Department | null>(null);
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);

  const canEdit = user?.role === "admin";

  // Calculate actual spend and payroll breakdown for each department
  const deptsWithSpend = useMemo(() => {
    return (departments || []).map((d) => {
      const deptTxns = (transactions || []).filter(
        (t) => t && t.type === "expense" && t.department?.trim().toLowerCase() === d.name?.trim().toLowerCase()
      );
      const payrollSpending = deptTxns
        .filter((t) => t.expenseSource === "payroll" || Boolean(t.payrollId) || isSalaryExpenseCategory(t.category))
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const otherSpending = deptTxns
        .filter((t) => !(t.expenseSource === "payroll" || Boolean(t.payrollId) || isSalaryExpenseCategory(t.category)))
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const actualSpend = payrollSpending + otherSpending;
      const lineBudgetAllocated = (budgets || [])
        .filter((b) => (b.department || "").trim().toLowerCase() === (d.name || "").trim().toLowerCase())
        .reduce((s, b) => s + (Number(b.allocated) || 0), 0);
      const budgetAllocated = Math.max(Number(d.budgetAllocated) || 0, lineBudgetAllocated);
      const remainingBudget = Math.max(0, budgetAllocated - actualSpend);
      const ratio = budgetAllocated > 0 ? (actualSpend / budgetAllocated) * 100 : 0;

      return {
        ...d,
        budgetAllocated,
        payrollSpending,
        otherSpending,
        actualSpend,
        remainingBudget,
        ratio,
        isOver: ratio >= 100,
        isWarning: ratio >= 80 && ratio < 100,
      };
    });
  }, [departments, transactions, budgets]);

  const totalHeadcount = useMemo(
    () => (departments || []).reduce((s, d) => s + (d.headCount || 0), 0),
    [departments]
  );

  const totalAllocated = useMemo(
    () => calculateBudgetAllocation(budgets, departments),
    [budgets, departments]
  );

  const totalActualSpend = useMemo(
    () => calculateBudgetUsed(transactions || [], budgets, undefined, departments),
    [transactions, budgets, departments]
  );

  // Departments that have a budget or spending but were never set up on this page
  const unregisteredDepts = useMemo(() => {
    const known = new Set((departments || []).map((d) => (d.name || "").trim().toLowerCase()));
    const map = new Map<string, { name: string; budget: number; spent: number }>();
    const touch = (raw?: string) => {
      const name = (raw || "").trim();
      const key = name.toLowerCase();
      if (!name || known.has(key) || ["all", "general", "institutional", "organization"].includes(key)) return null;
      if (!map.has(key)) map.set(key, { name, budget: 0, spent: 0 });
      return map.get(key)!;
    };
    (budgets || []).forEach((b) => {
      const e = touch(b.department);
      if (e) e.budget += Number(b.allocated) || 0;
    });
    (transactions || []).forEach((t) => {
      if (!t || t.type !== "expense") return;
      const e = touch(t.department);
      if (e) e.spent += Number(t.amount) || 0;
    });
    // staff on payroll for each missing department
    (payroll || []).forEach((p: any) => {
      const e = touch(p?.department);
      if (e) (e as any).staff = ((e as any).staff || 0) + 1;
    });
    return Array.from(map.values()).sort((a, b) => b.budget + b.spent - (a.budget + a.spent)) as Array<{ name: string; budget: number; spent: number; staff?: number }>;
  }, [departments, budgets, transactions, payroll]);

  // Creates the missing department record so it gets a normal card. Budget lines already count,
  // so the department-level budget starts at 0 (it can be changed later with Edit).
  const setUpDepartments = async (list: Array<{ name: string; staff?: number }>) => {
    if (!list.length || settingUp) return;
    setSettingUp(list.length === 1 ? list[0].name : "all");
    setSetupMsg(null);
    let done = 0;
    const failed: string[] = [];
    for (const u of list) {
      try {
        await addDepartment({ name: u.name, headCount: u.staff || 0, budgetAllocated: 0 } as any);
        done++;
      } catch {
        failed.push(u.name);
      }
    }
    setSettingUp(null);
    setSetupMsg(
      failed.length === 0
        ? { ok: true, text: done === 1 ? `${list[0].name} is now set up.` : `${done} departments are now set up.` }
        : { ok: false, text: `Couldn't set up: ${failed.join(", ")}. Check that you're signed in as an admin.` }
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Page header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.primary + "16" }]}>
              <SvgLayers size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Departments</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
                Budget, spending and staff for each department
              </Text>
            </View>
          </View>
        </View>

        {canEdit && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }, isMobile && { width: "100%" }]}
            onPress={() => {
              setEditingDept(null);
              setModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <SvgPlus size={15} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Add department</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Summary cards ─── */}
      {(() => {
        const usedPct = totalAllocated > 0 ? (Number(totalActualSpend || 0) / Number(totalAllocated)) * 100 : 0;
        return (
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, styles.sumCard, { backgroundColor: colors.card, borderColor: colors.border, borderTopColor: colors.info }]}>
              <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>Departments</Text>
              <Text style={[styles.sumValue, { color: colors.foreground }]}>{departments.length}</Text>
              <Text style={[styles.sumSub, { color: colors.mutedForeground }]}>
                {departments.length === 1 ? "active department" : "active departments"}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.metricCard, styles.sumCard, { backgroundColor: colors.card, borderColor: colors.border, borderTopColor: "#8B5CF6" }]}
              onPress={() => {
                setStaffModalDept(null);
                setStaffModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.rowBetween}>
                <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>Staff</Text>
                <Text style={[styles.sumLink, { color: colors.primary }]}>View roster →</Text>
              </View>
              <Text style={[styles.sumValue, { color: colors.foreground }]}>{totalHeadcount}</Text>
              {payroll.length > 0 ? (
                <View style={styles.chipWrap}>
                  {payroll.slice(0, 4).map((p) => (
                    <View key={p.id} style={[styles.personChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={[styles.personAvatar, { backgroundColor: "#8B5CF61F" }]}>
                        <Text style={[styles.personAvatarText, { color: "#8B5CF6" }]}>
                          {p.employeeName ? p.employeeName.trim()[0].toUpperCase() : "E"}
                        </Text>
                      </View>
                      <Text style={[styles.personName, { color: colors.foreground }]}>{p.employeeName}</Text>
                      <Text style={[styles.personMeta, { color: colors.mutedForeground }]}>· {p.department || "General"}</Text>
                    </View>
                  ))}
                  {payroll.length > 4 && (
                    <Text style={[styles.personMeta, { color: colors.primary, alignSelf: "center" }]}>+{payroll.length - 4} more</Text>
                  )}
                </View>
              ) : (
                <Text style={[styles.sumSub, { color: colors.mutedForeground }]}>No employees registered yet</Text>
              )}
            </TouchableOpacity>

            <View style={[styles.metricCard, styles.sumCard, { backgroundColor: colors.card, borderColor: colors.border, borderTopColor: colors.primary }]}>
              <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>Total budget</Text>
              <FitText style={[styles.sumValue, { color: colors.foreground }]}>
                {`${settings.currency} ${Number(totalAllocated || 0).toLocaleString()}`}
              </FitText>
              <Text style={[styles.sumSub, { color: colors.mutedForeground }]}>
                {settings.currency} {Number(totalActualSpend || 0).toLocaleString()} spent from budgets · {usedPct.toFixed(1)}% used
              </Text>
              <Text style={[styles.sumSub, { color: colors.mutedForeground }]}>Same total as Dashboard and Budgets</Text>
            </View>
          </View>
        );
      })()}

      {unregisteredDepts.length > 0 && (
        <View style={[styles.metricCard, { backgroundColor: colors.warning + "10", borderColor: colors.warning + "55", gap: 8 }]}>
          <Text style={[styles.dName, { color: colors.foreground, fontSize: 14.5 }]}>
            {unregisteredDepts.length === 1 ? "1 department is" : `${unregisteredDepts.length} departments are`} not set up yet
          </Text>
          <Text style={[styles.sumSub, { color: colors.mutedForeground }]}>
            Some records (budget lines, expenses or payroll) use these department names, but there's no department card for them — either they were never created, or the card was deleted. Their money is already counted in the totals above. Set them up to see staff, a head and contact details.
          </Text>
          <View style={[styles.dTable, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {unregisteredDepts.map((u, i) => (
              <View key={u.name} style={[styles.dRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.dName, { color: colors.foreground, fontSize: 14 }]}>{u.name}</Text>
                  <Text style={[styles.sumSub, { color: colors.mutedForeground }]}>
                    Budget lines {settings.currency} {u.budget.toLocaleString()} · spent {settings.currency} {u.spent.toLocaleString()}
                    {u.staff ? ` · ${u.staff} on payroll` : ""}
                  </Text>
                </View>
                {canEdit ? (
                  <TouchableOpacity
                    disabled={!!settingUp}
                    style={[styles.dBtn, { borderColor: colors.primary, opacity: settingUp ? 0.6 : 1 }]}
                    onPress={() => setUpDepartments([u])}
                    accessibilityLabel={`Set up ${u.name} as a department`}
                  >
                    <SvgPlus size={14} color={colors.primary} />
                    <Text style={[styles.dBtnText, { color: colors.primary }]}>{settingUp === u.name ? "Setting up…" : "Set up"}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
          {setupMsg ? (
            <Text style={[styles.sumSub, { color: setupMsg.ok ? colors.income : colors.expense, fontFamily: "Inter_600SemiBold" }]}>
              {setupMsg.ok ? "✓ " : "⚠ "}{setupMsg.text}
            </Text>
          ) : null}
          {canEdit && unregisteredDepts.length > 1 ? (
            <TouchableOpacity
              disabled={!!settingUp}
              style={[styles.dBtn, { borderColor: colors.primary, backgroundColor: colors.primary, alignSelf: "flex-start", opacity: settingUp ? 0.6 : 1 }]}
              onPress={() => setUpDepartments(unregisteredDepts)}
            >
              <SvgPlus size={14} color="#FFFFFF" />
              <Text style={[styles.dBtnText, { color: "#FFFFFF" }]}>{settingUp === "all" ? "Setting up…" : `Set up all ${unregisteredDepts.length}`}</Text>
            </TouchableOpacity>
          ) : null}
          {!canEdit ? (
            <Text style={[styles.sumSub, { color: colors.mutedForeground }]}>Ask an admin to set these up.</Text>
          ) : null}
        </View>
      )}

      {/* ─── Department cards ─── */}
      <View style={styles.deptGrid}>
        {deptsWithSpend.length === 0 ? (
          <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SvgFileText size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No departments yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Click "Add department" to create your first one.
            </Text>
          </View>
        ) : (
          deptsWithSpend.map((dept) => {
            const ratio = Number(dept.ratio || 0);
            const pct = Math.min(Math.round(ratio), 100);
            const allocated = Number(dept.budgetAllocated || 0);
            const spent = Number(dept.actualSpend || 0);
            const remaining = Number(dept.remainingBudget || 0);
            const statusColor = allocated <= 0 ? colors.mutedForeground : dept.isOver ? colors.expense : dept.isWarning ? colors.warning : colors.income;
            const statusText = allocated <= 0 ? "No budget" : dept.isOver ? "Over budget" : dept.isWarning ? "Near limit" : "On track";
            const initials = dept.name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0] || "").join("").toUpperCase() || "D";
            const deptStaff = payroll.filter(
              (p) => (p.department || "").trim().toLowerCase() === dept.name.trim().toLowerCase()
            );
            const rows = [
              { label: "Budget", value: `${settings.currency} ${allocated.toLocaleString()}`, color: colors.foreground },
              { label: "Payroll", value: `${settings.currency} ${Number(dept.payrollSpending || 0).toLocaleString()}`, color: colors.foreground },
              { label: "Other expenses", value: `${settings.currency} ${Number(dept.otherSpending || 0).toLocaleString()}`, color: colors.foreground },
              { label: remaining < 0 ? "Over by" : "Remaining", value: `${settings.currency} ${Math.abs(remaining).toLocaleString()}`, color: remaining < 0 ? colors.expense : colors.income },
            ];

            return (
              <View
                key={dept.id}
                style={[
                  styles.deptCard,
                  { backgroundColor: colors.card, borderColor: dept.isOver ? colors.expense + "60" : colors.border },
                  !isMobile && { maxWidth: 640 },
                ]}
              >
                {/* Header */}
                <View style={styles.dHeader}>
                  <View style={[styles.dAvatar, { backgroundColor: colors.info + "18" }]}>
                    <Text style={[styles.dAvatarText, { color: colors.info }]}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.dName, { color: colors.foreground }]}>{dept.name}</Text>
                    <Text style={[styles.dSub, { color: colors.mutedForeground }]}>
                      {dept.headOfDepartment ? `Head: ${dept.headOfDepartment}` : "No head assigned"} · {dept.code || `DPT-${dept.id.slice(-4).toUpperCase()}`}
                    </Text>
                  </View>
                  <View style={[styles.dStatus, { backgroundColor: statusColor + "14" }]}>
                    <View style={[styles.dDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.dStatusText, { color: statusColor }]}>{statusText}</Text>
                  </View>
                </View>

                {/* Spend vs budget */}
                <View style={{ gap: 8 }}>
                  <View style={styles.rowBetween}>
                    <FitText style={[styles.dSpendText, { color: colors.foreground, flex: 1 }]}>
                      {allocated > 0
                        ? `${settings.currency} ${spent.toLocaleString()} spent of ${settings.currency} ${allocated.toLocaleString()}`
                        : `${settings.currency} ${spent.toLocaleString()} spent · no budget set`}
                    </FitText>
                    <Text style={[styles.dPct, { color: statusColor }]}>{allocated > 0 ? `${ratio.toFixed(1)}%` : "—"}</Text>
                  </View>
                  <View style={[styles.deptTrack, { backgroundColor: colors.muted, height: 8, borderRadius: 4 }]}>
                    <View style={[styles.deptFill, { width: `${allocated > 0 ? Math.max(pct, spent > 0 ? 2 : 0) : 0}%`, backgroundColor: statusColor, borderRadius: 4 }]} />
                  </View>
                </View>

                {/* Figures */}
                <View style={[styles.dTable, { borderColor: colors.border }]}>
                  {rows.map((r, i) => (
                    <View key={r.label} style={[styles.dRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <Text style={[styles.dRowLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                      <FitText style={[styles.dRowValue, { color: r.color }]}>{r.value}</FitText>
                    </View>
                  ))}
                </View>

                {/* Contact & staff */}
                <View style={{ gap: 10 }}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.dRowLabel, { color: colors.mutedForeground }]}>Contact</Text>
                    <Text style={[styles.dContact, { color: dept.contactEmail ? colors.foreground : colors.mutedForeground }]}>
                      {dept.contactEmail || "Not provided"}
                    </Text>
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.dRowLabel, { color: colors.mutedForeground }]}>
                      Staff ({deptStaff.length || dept.headCount || 0})
                    </Text>
                  </View>
                  {deptStaff.length > 0 ? (
                    <View style={styles.chipWrap}>
                      {deptStaff.slice(0, 6).map((emp) => (
                        <View key={emp.id} style={[styles.personChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <View style={[styles.personAvatar, { backgroundColor: colors.info + "18" }]}>
                            <Text style={[styles.personAvatarText, { color: colors.info }]}>
                              {emp.employeeName ? emp.employeeName.trim()[0].toUpperCase() : "E"}
                            </Text>
                          </View>
                          <Text style={[styles.personName, { color: colors.foreground }]}>{emp.employeeName}</Text>
                          {emp.designation ? (
                            <Text style={[styles.personMeta, { color: colors.mutedForeground }]}>· {emp.designation}</Text>
                          ) : null}
                        </View>
                      ))}
                      {deptStaff.length > 6 && (
                        <Text style={[styles.personMeta, { color: colors.primary, alignSelf: "center" }]}>+{deptStaff.length - 6} more</Text>
                      )}
                    </View>
                  ) : (
                    <Text style={[styles.sumSub, { color: colors.mutedForeground }]}>No staff assigned yet</Text>
                  )}
                </View>

                {/* Actions */}
                <View style={[styles.dActions, { borderTopColor: colors.border }]}>
                  <TouchableOpacity
                    style={[styles.dBtn, { borderColor: colors.border }]}
                    onPress={() => {
                      setStaffModalDept(dept);
                      setStaffModalVisible(true);
                    }}
                  >
                    <SvgUsers size={14} color={colors.foreground} />
                    <Text style={[styles.dBtnText, { color: colors.foreground }]}>View staff</Text>
                  </TouchableOpacity>

                  {canEdit && (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.dBtn, { borderColor: colors.border }]}
                        onPress={() => {
                          setEditingDept(dept);
                          setModalVisible(true);
                        }}
                      >
                        <Text style={[styles.dBtnText, { color: colors.primary }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.dBtn, { borderColor: colors.expense + "40" }]}
                        onPress={() => setDeletingDept(dept)}
                      >
                        <Text style={[styles.dBtnText, { color: colors.expense }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
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
        visible={staffModalVisible}
        onClose={() => {
          setStaffModalVisible(false);
          setStaffModalDept(null);
        }}
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
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
  content: {
    padding: 24,
    gap: 20,
    paddingBottom: 60,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
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
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.4,
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
    borderRadius: 8,
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
  sumCard: { borderTopWidth: 3, minWidth: 220, gap: 6 },
  sumLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sumValue: { fontSize: 24, fontFamily: "Inter_600SemiBold", letterSpacing: -0.4 },
  sumSub: { fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 18 },
  sumLink: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  personChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  personAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  personAvatarText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  personName: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
  personMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  dAvatar: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  dAvatarText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dName: { fontSize: 16, fontFamily: "Inter_600SemiBold", lineHeight: 22 },
  dSub: { fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 1 },
  dStatus: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dDot: { width: 7, height: 7, borderRadius: 4 },
  dStatusText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  dSpendText: { fontSize: 13.5, fontFamily: "Inter_500Medium" },
  dPct: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  dTable: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  dRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  dRowLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  dRowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "right", flex: 1 },
  dContact: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "right", flexShrink: 1 },
  dActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 14, borderTopWidth: 1 },
  dBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1 },
  dBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  deptGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  deptCard: {
    flexGrow: 1,
    flexBasis: 360,
    minWidth: 300,
    maxWidth: "100%",
    borderRadius: 10,
    borderWidth: 1,
    padding: 20,
    gap: 16,
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
    borderRadius: 10,
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
    fontSize: 11,
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
    borderRadius: 8,
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
  breakdownBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  breakdownItem: {
    flex: 1,
    gap: 2,
  },
  breakdownLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  breakdownVal: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  breakdownDivider: {
    height: 1,
    width: "100%",
  },
  kpiStaffWrap: {
    marginTop: 8,
    gap: 6,
  },
  kpiStaffTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  kpiStaffChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  kpiEmpChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  kpiEmpAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#0EA5E920",
    alignItems: "center",
    justifyContent: "center",
  },
  kpiEmpAvatarText: {
    color: "#0EA5E9",
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  kpiEmpName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    maxWidth: 120,
  },
  kpiDeptBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "#0EA5E915",
  },
  kpiDeptBadgeText: {
    color: "#0EA5E9",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  kpiMoreBadge: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  kpiMoreText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
  deptEmployeesBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  deptEmployeesLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  deptEmployeesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  deptEmpItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deptEmpDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#0EA5E9",
  },
  deptEmpName: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  deptEmpRole: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },
  deptEmpMore: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
});
