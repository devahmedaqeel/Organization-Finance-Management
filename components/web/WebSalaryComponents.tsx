import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions, Modal } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import {
  SalaryComponent,
  ComponentCategory,
  CalculationType,
} from "@/services/PayrollCalculationEngine";
import {
  getSalaryComponents,
  saveSalaryComponent,
  deleteSalaryComponent,
  seedDefaultComponents,
} from "@/services/SalaryComponentService";
import { SvgPlus, SvgSearch, SvgEdit, SvgTrash, SvgCheck, SvgX } from "./SvgIcons";

export function WebSalaryComponents() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { user } = useAuth();
  const { settings } = useSettings();
  const orgId = user?.organizationId || "demo-org";

  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | ComponentCategory>("all");
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingComp, setEditingComp] = useState<SalaryComponent | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState<ComponentCategory>("earning");
  const [calcType, setCalcType] = useState<CalculationType>("fixed");
  const [amount, setAmount] = useState("");
  const [isTaxable, setIsTaxable] = useState(true);
  const [isStatutory, setIsStatutory] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const canManage = user?.role === "admin" || user?.role === "accountant";

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getSalaryComponents(orgId);
      setComponents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  const handleOpenAdd = () => {
    setEditingComp(null);
    setName("");
    setCode("");
    setCategory("earning");
    setCalcType("fixed");
    setAmount("");
    setIsTaxable(true);
    setIsStatutory(false);
    setIsActive(true);
    setDescription("");
    setModalVisible(true);
  };

  const handleOpenEdit = (comp: SalaryComponent) => {
    setEditingComp(comp);
    setName(comp.name);
    setCode(comp.code);
    setCategory(comp.category);
    setCalcType(comp.calculationType);
    setAmount(String(comp.amount));
    setIsTaxable(comp.isTaxable !== false);
    setIsStatutory(Boolean(comp.isStatutory));
    setIsActive(comp.isActive !== false);
    setDescription(comp.description || "");
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveSalaryComponent(
        {
          id: editingComp?.id,
          organizationId: orgId,
          name: name.trim(),
          code: code.trim() || undefined,
          category,
          calculationType: calcType,
          amount: Number(amount || 0),
          isTaxable,
          isStatutory,
          isActive,
          description: description.trim(),
        },
        {
          id: user?.id || "anon",
          name: user?.name || user?.email || "Admin",
          role: user?.role || "admin",
        }
      );
      setModalVisible(false);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this salary component?")) return;
    try {
      await deleteSalaryComponent(id, orgId, {
        id: user?.id || "anon",
        name: user?.name || user?.email || "Admin",
        role: user?.role || "admin",
      });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm("Seed default statutory & institutional salary components for this organization?")) return;
    setLoading(true);
    try {
      const seeded = await seedDefaultComponents(orgId);
      setComponents(seeded);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredComponents = useMemo(() => {
    return components.filter((c) => {
      if (activeTab !== "all" && c.category !== activeTab) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
      }
      return true;
    });
  }, [components, activeTab, search]);

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Salary & Remuneration Components</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Configure base allowances, statutory deductions, benefits, and employer contributions.
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {canManage && (
            <>
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: colors.border }]}
                onPress={handleResetDefaults}
              >
                <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Seed Defaults</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: "#8B5CF6" }]} onPress={handleOpenAdd}>
                <SvgPlus size={14} color="#FFFFFF" />
                <Text style={styles.btnPrimaryText}>Add Component</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Tabs & Search */}
      <View style={[styles.toolbar, isMobile && { flexDirection: "column", alignItems: "stretch" }]}>
        <View style={styles.tabsRow}>
          {(["all", "earning", "deduction", "employer_contribution"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabBtn,
                activeTab === tab && { backgroundColor: "#8B5CF622", borderColor: "#8B5CF6" },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab ? "#8B5CF6" : colors.mutedForeground },
                ]}
              >
                {tab === "all"
                  ? "All Components"
                  : tab === "earning"
                  ? "Earnings & Allowances"
                  : tab === "deduction"
                  ? "Deductions"
                  : "Employer Contributions"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SvgSearch size={14} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by code or name..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Table Box */}
      <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.tableHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.th, { flex: 2, color: colors.mutedForeground }]}>COMPONENT / CODE</Text>
          <Text style={[styles.th, { flex: 1.5, color: colors.mutedForeground }]}>CATEGORY</Text>
          <Text style={[styles.th, { flex: 1.5, color: colors.mutedForeground }]}>CALCULATION</Text>
          <Text style={[styles.th, { flex: 1.5, textAlign: "right", color: colors.mutedForeground }]}>AMOUNT / RATE</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "center", color: colors.mutedForeground }]}>STATUS</Text>
          {canManage && <Text style={[styles.th, { flex: 1, textAlign: "right", color: colors.mutedForeground }]}>ACTIONS</Text>}
        </View>

        <ScrollView style={{ maxHeight: 520 }}>
          {filteredComponents.length === 0 ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No salary components configured.</Text>
            </View>
          ) : (
            filteredComponents.map((item) => (
              <View key={item.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.compName, { color: colors.foreground }]}>{item.name}</Text>
                    <View style={styles.codeBadge}>
                      <Text style={styles.codeBadgeText}>{item.code}</Text>
                    </View>
                  </View>
                  {item.description ? (
                    <Text style={[styles.compDesc, { color: colors.mutedForeground }]}>{item.description}</Text>
                  ) : null}
                </View>

                <View style={{ flex: 1.5 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color:
                        item.category === "earning"
                          ? "#10B981"
                          : item.category === "deduction"
                          ? "#F43F5E"
                          : "#3B82F6",
                    }}
                  >
                    {item.category === "earning"
                      ? "Earning"
                      : item.category === "deduction"
                      ? "Deduction"
                      : "Employer Cost"}
                  </Text>
                  {item.isStatutory && (
                    <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>Statutory Required</Text>
                  )}
                </View>

                <View style={{ flex: 1.5 }}>
                  <Text style={{ fontSize: 12, color: colors.foreground, textTransform: "capitalize" }}>
                    {item.calculationType.replace(/_/g, " ")}
                  </Text>
                  {item.isTaxable ? (
                    <Text style={{ fontSize: 10, color: "#10B981" }}>Taxable</Text>
                  ) : (
                    <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Tax-Exempt</Text>
                  )}
                </View>

                <View style={{ flex: 1.5, alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>
                    {item.calculationType === "percentage_of_basic" || item.calculationType === "percentage_of_component"
                      ? `${item.amount}%`
                      : `${settings.currency} ${Number(item.amount).toLocaleString()}`}
                  </Text>
                </View>

                <View style={{ flex: 1, alignItems: "center" }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 12,
                      backgroundColor: item.isActive ? "#10B9811A" : "#64748B1A",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: "700",
                        color: item.isActive ? "#10B981" : "#64748B",
                      }}
                    >
                      {item.isActive ? "Active" : "Disabled"}
                    </Text>
                  </View>
                </View>

                {canManage && (
                  <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleOpenEdit(item)}
                      style={[styles.iconBtn, { backgroundColor: colors.background }]}
                    >
                      <SvgEdit size={13} color={colors.foreground} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(item.id)}
                      style={[styles.iconBtn, { backgroundColor: "#F43F5E1A" }]}
                    >
                      <SvgTrash size={13} color="#F43F5E" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {editingComp ? "Edit Salary Component" : "New Salary Component"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <SvgX size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              <View style={styles.formRow}>
                <View style={{ flex: 2 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>COMPONENT NAME</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. House Rent Allowance"
                    placeholderTextColor={colors.mutedForeground}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>CODE</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. HRA"
                    placeholderTextColor={colors.mutedForeground}
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORY</Text>
                  <View style={styles.selectRow}>
                    {(["earning", "deduction", "employer_contribution"] as const).map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.catPill,
                          category === cat && { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" },
                          { borderColor: colors.border },
                        ]}
                        onPress={() => setCategory(cat)}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: category === cat ? "#FFF" : colors.mutedForeground }}>
                          {cat === "earning" ? "Earning" : cat === "deduction" ? "Deduction" : "Employer Cost"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>CALCULATION TYPE</Text>
                  <View style={styles.selectRow}>
                    {[
                      { key: "fixed", label: "Fixed Amount" },
                      { key: "percentage_of_basic", label: "% of Basic" },
                      { key: "attendance_based", label: "Attendance Based" },
                      { key: "overtime", label: "Overtime Rate" },
                    ].map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={[
                          styles.catPill,
                          calcType === item.key && { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" },
                          { borderColor: colors.border },
                        ]}
                        onPress={() => setCalcType(item.key as any)}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: calcType === item.key ? "#FFF" : colors.mutedForeground }}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>
                    {calcType === "percentage_of_basic" ? "PERCENTAGE (%)" : `AMOUNT (${settings.currency})`}
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder={calcType === "percentage_of_basic" ? "e.g. 45" : "e.g. 5000"}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIPTION / NOTES</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Brief description of the component..."
                    placeholderTextColor={colors.mutedForeground}
                    value={description}
                    onChangeText={setDescription}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 18, marginTop: 10 }}>
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  onPress={() => setIsActive(!isActive)}
                >
                  <View style={[styles.checkbox, isActive && { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" }]}>
                    {isActive && <SvgCheck size={12} color="#FFF" />}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.foreground }}>Active in Payroll</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  onPress={() => setIsTaxable(!isTaxable)}
                >
                  <View style={[styles.checkbox, isTaxable && { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" }]}>
                    {isTaxable && <SvgCheck size={12} color="#FFF" />}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.foreground }}>Taxable Component</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  onPress={() => setIsStatutory(!isStatutory)}
                >
                  <View style={[styles.checkbox, isStatutory && { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" }]}>
                    {isStatutory && <SvgCheck size={12} color="#FFF" />}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.foreground }}>Statutory Withholding</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: colors.border }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: "#8B5CF6" }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.btnPrimaryText}>{saving ? "Saving..." : "Save Component"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 240,
  },
  searchInput: {
    fontSize: 12,
    outlineWidth: 0,
    flex: 1,
  } as any,
  tableCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  th: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  compName: {
    fontSize: 13,
    fontWeight: "700",
  },
  compDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  codeBadge: {
    backgroundColor: "#8B5CF61A",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#8B5CF6",
  },
  iconBtn: {
    padding: 6,
    borderRadius: 6,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxWidth: 580,
    borderRadius: 14,
    borderWidth: 1,
    padding: 22,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  formRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  input: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12.5,
    outlineWidth: 0,
  } as any,
  selectRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  catPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
  },
});
