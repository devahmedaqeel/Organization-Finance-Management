import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProgressBar } from "@/components/ProgressBar";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

const DEPT_COLORS = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#F43F5E", "#0EA5E9", "#EC4899"];

export default function DepartmentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { departments, transactions, addDepartment, updateDepartment, deleteDepartment } = useFinance();
  const { settings } = useSettings();
  const keyboardHeight = useKeyboardHeight();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptToDelete, setDeptToDelete] = useState<{ id: string; name: string; headCount?: number; budgetAllocated?: number } | null>(null);
  const [name, setName] = useState("");
  const [headCount, setHeadCount] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "healthy" | "warning" | "over">("all");

  const canEdit = user?.role === "admin";
  const webTop = Platform.OS === "web" ? 67 : 0;

  const fmt = (n: number) => {
    if (Math.abs(n) >= 1000000) return `${settings.currency} ${(n / 1000000).toFixed(2)}M`;
    if (Math.abs(n) >= 1000) return `${settings.currency} ${(n / 1000).toFixed(1)}K`;
    return `${settings.currency} ${Number(n || 0).toLocaleString()}`;
  };

  const fmtShort = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(Math.round(n));
  };

  // Detailed Department Spend & Inflows
  const deptsWithMetrics = useMemo(() => {
    return departments.map((d) => {
      const dName = d.name?.trim().toLowerCase();
      const spent = transactions
        .filter((t) => t.type === "expense" && t.department?.trim().toLowerCase() === dName)
        .reduce((s, t) => s + (t.amount || 0), 0);

      const income = transactions
        .filter((t) => t.type === "income" && t.department?.trim().toLowerCase() === dName)
        .reduce((s, t) => s + (t.amount || 0), 0);

      const net = income - spent;
      const allocated = d.budgetAllocated || 0;
      const utilPct = allocated > 0 ? (spent / allocated) * 100 : 0;
      const remaining = allocated - spent;

      let status: "healthy" | "warning" | "over" = "healthy";
      if (utilPct > 100) status = "over";
      else if (utilPct > 75) status = "warning";

      return {
        ...d,
        spent,
        income,
        net,
        utilPct,
        remaining,
        status,
      };
    });
  }, [departments, transactions]);

  // Overall Department Totals
  const totalAllocated = useMemo(
    () => departments.reduce((s, d) => s + (d.budgetAllocated || 0), 0),
    [departments]
  );
  const totalSpent = useMemo(
    () => deptsWithMetrics.reduce((s, d) => s + d.spent, 0),
    [deptsWithMetrics]
  );
  const totalEmployees = useMemo(
    () => departments.reduce((s, d) => s + (d.headCount || 0), 0),
    [departments]
  );
  const overallBurnRate = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

  // Filtered List
  const filteredDepartments = useMemo(() => {
    const q = search.toLowerCase().trim();
    return deptsWithMetrics.filter((d) => {
      const matchSearch = !q || d.name.toLowerCase().includes(q);
      const matchFilter = filterType === "all" || d.status === filterType;
      return matchSearch && matchFilter;
    });
  }, [deptsWithMetrics, search, filterType]);

  const handleOpenAdd = () => {
    setEditingDept(null);
    setName("");
    setHeadCount("10");
    setBudget("");
    setError("");
    setModalVisible(true);
  };

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept);
    setName(dept.name);
    setHeadCount(String(dept.headCount || ""));
    setBudget(String(dept.budgetAllocated || ""));
    setError("");
    setModalVisible(true);
  };

  const handleSave = () => {
    const hc = parseInt(headCount);
    const bg = parseFloat(budget);
    if (!name.trim() || isNaN(hc) || isNaN(bg) || hc < 0 || bg < 0) {
      setError("Please fill all fields with valid positive numbers.");
      return;
    }
    if (editingDept) {
      updateDepartment(editingDept.id, { name: name.trim(), headCount: hc, budgetAllocated: bg });
    } else {
      addDepartment({ name: name.trim(), headCount: hc, budgetAllocated: bg });
    }
    setName("");
    setHeadCount("");
    setBudget("");
    setError("");
    setEditingDept(null);
    setModalVisible(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const confirmDelete = () => {
    if (!deptToDelete) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteDepartment(deptToDelete.id);
    setDeptToDelete(null);
  };

  const handleDelete = (dept: { id: string; name: string; headCount?: number; budgetAllocated?: number }) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeptToDelete(dept);
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Executive Clean Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: webTop + insets.top + (Platform.OS === "android" ? 20 : 12),
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: colors.border }]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Monitored Departments</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {settings.organizationName || "Organization Finance Management"} · {departments.length} Units
            </Text>
          </View>
          <View style={{ width: 38 }} />
        </View>
      </View>

      <FlatList
        data={filteredDepartments}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom, 16) + (canEdit ? 100 : 40) },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <View style={{ gap: 10 }}>
            {/* Top 4-Metric Compact Grid */}
            <View style={styles.statsRow}>
              {/* Box 1: Units */}
              <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.primary + "18" }]}>
                  <Feather name="layers" size={15} color={colors.primary} />
                </View>
                <View style={styles.statContentWrap}>
                  <Text style={[styles.statVal, { color: colors.foreground }]}>{departments.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Monitored Units</Text>
                </View>
              </View>

              {/* Box 2: Headcount */}
              <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIconWrap, { backgroundColor: "#8B5CF618" }]}>
                  <Feather name="users" size={15} color="#8B5CF6" />
                </View>
                <View style={styles.statContentWrap}>
                  <Text style={[styles.statVal, { color: colors.foreground }]}>{totalEmployees}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Staff</Text>
                </View>
              </View>

              {/* Box 3: Total Budget */}
              <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIconWrap, { backgroundColor: "#38BDF818" }]}>
                  <Feather name="pie-chart" size={15} color="#38BDF8" />
                </View>
                <View style={styles.statContentWrap}>
                  <Text style={[styles.statVal, { color: colors.foreground }]} numberOfLines={1}>
                    {fmt(totalAllocated)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Budget</Text>
                </View>
              </View>

              {/* Box 4: Total Spent */}
              <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIconWrap, { backgroundColor: (overallBurnRate > 90 ? colors.expense : colors.income) + "18" }]}>
                  <Feather name="activity" size={15} color={overallBurnRate > 90 ? colors.expense : colors.income} />
                </View>
                <View style={styles.statContentWrap}>
                  <Text style={[styles.statVal, { color: overallBurnRate > 90 ? colors.expense : colors.income }]} numberOfLines={1}>
                    {fmt(totalSpent)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                    Spent ({overallBurnRate.toFixed(0)}%)
                  </Text>
                </View>
              </View>
            </View>

            {/* Search Bar */}
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="search" size={15} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search department name..."
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filter Tags */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {[
                { id: "all", label: `ALL (${departments.length})` },
                { id: "healthy", label: `ON TRACK (<75%)` },
                { id: "warning", label: `NEAR LIMIT (75-100%)` },
                { id: "over", label: `OVER BUDGET (>100%)` },
              ].map((f) => {
                const isActive = filterType === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isActive ? colors.primary : colors.card,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setFilterType(f.id as any);
                    }}
                  >
                    <Text style={[styles.filterChipText, { color: isActive ? "#FFFFFF" : colors.mutedForeground }]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
        renderItem={({ item, index }) => {
          const accentColor = DEPT_COLORS[index % DEPT_COLORS.length];
          const isOver = item.utilPct > 100;
          const statusBg = isOver ? colors.expense + "18" : item.utilPct > 75 ? "#F59E0B18" : colors.income + "18";
          const statusTextColor = isOver ? colors.expense : item.utilPct > 75 ? "#F59E0B" : colors.income;
          const statusText = isOver ? "OVER BUDGET" : item.utilPct > 75 ? "NEAR LIMIT" : "ON TRACK";

          return (
            <View style={[styles.deptCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: accentColor }]}>
              {/* Top Row: Name + Headcount + Status */}
              <View style={styles.deptTop}>
                <View style={[styles.deptIcon, { backgroundColor: accentColor + "22" }]}>
                  <Feather name="layers" size={17} color={accentColor} />
                </View>
                <View style={styles.deptInfo}>
                  <Text style={[styles.deptName, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.deptMeta, { color: colors.mutedForeground }]}>
                    {item.headCount} Employees · Avg: {settings.currency} {fmtShort(item.headCount > 0 ? item.budgetAllocated / item.headCount : 0)}/head
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusBg, borderColor: statusTextColor + "44" }]}>
                  <Text style={[styles.statusBadgeText, { color: statusTextColor }]}>{statusText}</Text>
                </View>
                {canEdit && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => handleOpenEdit(item)}
                      hitSlop={10}
                      style={[styles.trashBtn, { backgroundColor: colors.primary + "18", borderRadius: 8, padding: 6 }]}
                    >
                      <Feather name="edit-2" size={14} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(item)}
                      hitSlop={10}
                      style={[styles.trashBtn, { backgroundColor: colors.expense + "18", borderRadius: 8, padding: 6 }]}
                    >
                      <Feather name="trash-2" size={14} color={colors.expense} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Fiscal Breakdown Strip */}
              <View style={styles.deptFiscalStrip}>
                <View style={[styles.deptFiscalBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.deptFiscalLabel, { color: colors.mutedForeground }]}>Allocated</Text>
                  <Text style={[styles.deptFiscalVal, { color: colors.foreground }]}>{fmt(item.budgetAllocated)}</Text>
                </View>
                <View style={[styles.deptFiscalBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.deptFiscalLabel, { color: colors.mutedForeground }]}>Actual Spent</Text>
                  <Text style={[styles.deptFiscalVal, { color: colors.expense }]}>{fmt(item.spent)}</Text>
                </View>
                <View style={[styles.deptFiscalBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.deptFiscalLabel, { color: colors.mutedForeground }]}>Remaining</Text>
                  <Text style={[styles.deptFiscalVal, { color: item.remaining >= 0 ? colors.income : colors.expense }]}>
                    {item.remaining >= 0 ? "+" : "-"}{fmt(Math.abs(item.remaining))}
                  </Text>
                </View>
              </View>

              {/* Budget Progress Bar */}
              <ProgressBar
                label={`Utilization: ${item.utilPct.toFixed(1)}%`}
                value={item.spent}
                max={item.budgetAllocated}
                color={accentColor}
                formatValue={fmt}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <Feather name="layers" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Departments Found</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No monitored units match your search keyword or selected filter.
            </Text>
          </View>
        }
      />

      {/* Floating Add Department Button for Admins */}
      {canEdit && (
        <TouchableOpacity
          style={[
            styles.floatingAddBtn,
            {
              bottom: Math.max(insets.bottom, 16) + (Platform.OS === "android" ? 28 : 18),
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
            },
          ]}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleOpenAdd();
          }}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={17} color="#fff" />
          <Text style={styles.floatingAddBtnText}>Add Department</Text>
        </TouchableOpacity>
      )}

      {/* ─── Custom Dark-Themed Delete Confirmation Modal ─── */}
      <Modal
        visible={deptToDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeptToDelete(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Warning Icon Box */}
            <View style={styles.confirmIconWrap}>
              <Feather name="trash-2" size={24} color="#F43F5E" />
            </View>

            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Remove Department</Text>
            <Text style={[styles.confirmSub, { color: colors.mutedForeground }]}>
              Are you sure you want to remove this monitored department from fiscal budget tracking?
            </Text>

            {/* Department Summary Card */}
            {deptToDelete && (
              <View style={[styles.confirmDeptBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={styles.confirmDeptDot} />
                  <Text style={[styles.confirmDeptName, { color: colors.foreground }]} numberOfLines={1}>
                    {deptToDelete.name}
                  </Text>
                </View>
                <View style={styles.confirmDeptMetaRow}>
                  <Text style={[styles.confirmDeptMetaText, { color: colors.mutedForeground }]}>
                    {deptToDelete.headCount || 0} Staff Headcount
                  </Text>
                  <Text style={{ color: colors.mutedForeground }}>·</Text>
                  <Text style={[styles.confirmDeptMetaText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                    Budget: {fmt(deptToDelete.budgetAllocated || 0)}
                  </Text>
                </View>
              </View>
            )}

            {/* Notice pill */}
            <View style={styles.confirmWarningPill}>
              <Feather name="info" size={12} color="#38BDF8" />
              <Text style={styles.confirmWarningText}>
                Historical transactions for this unit will be preserved.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.confirmActionsRow}>
              <TouchableOpacity
                style={[styles.confirmCancelBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDeptToDelete(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.confirmCancelText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={confirmDelete}
                activeOpacity={0.85}
              >
                <Feather name="trash-2" size={14} color="#FFFFFF" />
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Add/Edit Department Bottom Sheet Modal ─── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={[styles.overlay, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.handle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingDept ? "Edit Monitored Department" : "Add Monitored Department"}
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              {editingDept ? "Modify allocation cap and staff headcount." : "Register a new administrative or academic unit into organizational tracking."}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              {[
                { label: "DEPARTMENT NAME", value: name, onChange: setName, placeholder: "e.g. Computer Science & IT", keyboard: "default" as const },
                { label: "EMPLOYEE HEADCOUNT", value: headCount, onChange: setHeadCount, placeholder: "Number of active staff", keyboard: "number-pad" as const },
                { label: `BUDGET ALLOCATED (${settings.currency})`, value: budget, onChange: setBudget, placeholder: "e.g. 500000", keyboard: "decimal-pad" as const },
              ].map((f) => (
                <View key={f.label} style={{ marginBottom: 12 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={f.keyboard}
                    value={f.value}
                    onChangeText={f.onChange}
                  />
                </View>
              ))}

              {error ? <Text style={[styles.error, { color: colors.expense }]}>{error}</Text> : null}

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSave}
                >
                  <Text style={styles.addBtnText}>
                    {editingDept ? "Update Department" : "Save Department"}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  list: { padding: 16, gap: 12 },

  // Stats Grid
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    marginBottom: 2,
  },
  statBox: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    gap: 9,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statContentWrap: {
    flex: 1,
    justifyContent: "center",
  },
  statVal: {
    fontSize: 15.5,
    fontFamily: "Inter_800ExtraBold",
    lineHeight: 19,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
  },

  // Search & Filter
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    marginTop: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  filterRow: {
    gap: 8,
    paddingVertical: 3,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  filterChipText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },

  // Department Card
  deptCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 13,
    gap: 11,
  },
  deptTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deptIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  deptInfo: {
    flex: 1,
    gap: 1,
  },
  deptName: {
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
  },
  deptMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  trashBtn: {
    padding: 4,
  },
  deptFiscalStrip: {
    flexDirection: "row",
    gap: 7,
  },
  deptFiscalBox: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    padding: 7,
    gap: 2,
  },
  deptFiscalLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
  },
  deptFiscalVal: {
    fontSize: 11.5,
    fontFamily: "Inter_800ExtraBold",
  },

  // Empty State
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
    gap: 8,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  emptyText: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 25,
  },

  // Floating Action Button
  floatingAddBtn: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 28,
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  floatingAddBtnText: {
    color: "#fff",
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },

  // Modal
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 35,
    gap: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#666",
    alignSelf: "center",
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Inter_800ExtraBold",
  },
  modalSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  error: {
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  modalBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  addBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  addBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },

  // Custom Delete Confirmation Modal Styles
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
    gap: 6,
  },
  confirmIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#F43F5E18",
    borderWidth: 1,
    borderColor: "#F43F5E44",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  confirmTitle: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    textAlign: "center",
  },
  confirmSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  confirmDeptBox: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    marginBottom: 6,
  },
  confirmDeptDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F43F5E",
  },
  confirmDeptName: {
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  confirmDeptMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  confirmDeptMetaText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  confirmWarningPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0284C714",
    borderWidth: 1,
    borderColor: "#0284C733",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    width: "100%",
    marginBottom: 12,
  },
  confirmWarningText: {
    fontSize: 10.5,
    fontFamily: "Inter_500Medium",
    color: "#38BDF8",
    flex: 1,
  },
  confirmActionsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelText: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },
  confirmDeleteBtn: {
    flex: 1.3,
    backgroundColor: "#F43F5E",
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowColor: "#F43F5E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmDeleteText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
});
