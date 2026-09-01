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
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useFinance, PayrollEntry } from "@/context/FinanceContext";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/context/SettingsContext";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { openPdfReport, ReportOptions } from "@/services/ReportExportService";
import {
  downloadPayslipPDF,
  sharePayslipPDF,
  downloadPayslipImage,
  sharePayslipImage,
} from "@/services/payslipExportService";
import { PdfSuccessModal } from "@/components/PdfSuccessModal";

const DEPARTMENTS = ["Software Engineering", "Administration", "Research & Development", "Finance"];

export default function PayrollScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { payroll, addPayroll, updatePayroll, deletePayroll, departments } = useFinance();
  const { settings } = useSettings();
  const keyboardHeight = useKeyboardHeight();

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);
  const [slipModalEntry, setSlipModalEntry] = useState<PayrollEntry | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Form Fields
  const [name, setName] = useState("");
  const [empId, setEmpId] = useState("");
  const [dept, setDept] = useState(DEPARTMENTS[0]);
  const [salary, setSalary] = useState("");
  const [bonus, setBonus] = useState("");
  const [deductions, setDeductions] = useState("");
  const [month, setMonth] = useState(defaultMonth);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";
  const isAccountant = user?.role === "accountant";
  const isManager = user?.role === "manager";
  const isEmployee = user?.role === "employee";
  const canEdit = isAdmin || isAccountant;
  const webTop = Platform.OS === "web" ? 67 : 0;

  const availableDepts = useMemo(() => {
    const list = departments && departments.length > 0 ? departments.map((d) => d.name) : DEPARTMENTS;
    const set = new Set([...list, ...payroll.map((p) => p.department)]);
    return Array.from(set).filter(Boolean);
  }, [departments, payroll]);

  const fmt = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${settings.currency} ${(n / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${settings.currency} ${(n / 1000).toFixed(1)}K`;
    return `${settings.currency} ${Number(n || 0).toLocaleString()}`;
  };

  const fmtExact = (n: number) => {
    return `${settings.currency} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Role-Based Payroll List Filtering
  const userPayroll = useMemo(() => {
    if (isEmployee) {
      return payroll.filter((p) => {
        const uName = (user?.name || "").toLowerCase().trim();
        const uEmailPrefix = (user?.email || "").split("@")[0].toLowerCase().trim();
        const pName = p.employeeName.toLowerCase().trim();
        return (uName && pName.includes(uName)) || (uEmailPrefix && pName.includes(uEmailPrefix));
      });
    }
    if (isManager && user?.department) {
      return payroll.filter((p) => p.department?.toLowerCase() === user.department?.toLowerCase());
    }
    return payroll;
  }, [payroll, user?.role, user?.name, user?.email, user?.department, isEmployee, isManager]);

  const filteredUserPayroll = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return userPayroll;
    return userPayroll.filter(
      (p) =>
        p.employeeName.toLowerCase().includes(q) ||
        p.employeeId.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q)
    );
  }, [userPayroll, search]);

  const totalNetPay = useMemo(() =>
    userPayroll.reduce((s, p) => s + (p.baseSalary || 0) + (p.bonus || 0) - (p.deductions || 0), 0),
    [userPayroll]
  );

  const handleOpenAdd = () => {
    setEditingEntry(null);
    setName("");
    setEmpId(`EMP${Math.floor(1000 + Math.random() * 9000)}`);
    setDept(availableDepts[0] || DEPARTMENTS[0]);
    setSalary("");
    setBonus("0");
    setDeductions("0");
    setMonth(defaultMonth);
    setError("");
    setModalVisible(true);
  };

  const handleOpenEdit = (item: PayrollEntry) => {
    setEditingEntry(item);
    setName(item.employeeName);
    setEmpId(item.employeeId);
    setDept(item.department || availableDepts[0]);
    setSalary(String(item.baseSalary || ""));
    setBonus(String(item.bonus || 0));
    setDeductions(String(item.deductions || 0));
    setMonth(item.month || defaultMonth);
    setError("");
    setModalVisible(true);
  };

  const handleSave = () => {
    const sal = parseFloat(salary);
    if (!name.trim()) {
      setError("Please enter employee name");
      return;
    }
    if (isNaN(sal) || sal <= 0) {
      setError("Please enter a valid base salary amount");
      return;
    }

    const payload = {
      employeeName: name.trim(),
      employeeId: empId.trim() || `EMP${Date.now().toString().slice(-4)}`,
      department: dept,
      baseSalary: sal,
      bonus: parseFloat(bonus) || 0,
      deductions: parseFloat(deductions) || 0,
      month: month || defaultMonth,
    };

    if (editingEntry) {
      updatePayroll(editingEntry.id, payload);
    } else {
      addPayroll(payload);
    }

    setModalVisible(false);
    setEditingEntry(null);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);
  const [pdfErrorMessage, setPdfErrorMessage] = useState<string | null>(null);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [successModalData, setSuccessModalData] = useState<{
    visible: boolean;
    filename: string;
    fileUri?: string;
    fileSize?: number;
    title?: string;
    subtitle?: string;
  }>({
    visible: false,
    filename: "",
  });

  const getOrgInfo = () => ({
    organizationName: settings.organizationName || user?.organization || "DevOrbit Tech Kotli",
    organizationAddress: settings.organizationAddress || "Kotli, Azad Kashmir",
    organizationEmail: settings.organizationEmail || user?.email || "finance@devorbit.tech",
    organizationPhone: settings.organizationPhone || "+92-586-444111",
    currency: settings.currency || "PKR",
    fiscalYear: settings.fiscalYear || "2025-2026",
  });

  const handleExportEmployeeSlip = async (emp: PayrollEntry) => {
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const query = new URLSearchParams({
          tab: "payroll",
          export: "payslip",
          empId: emp.employeeId || emp.id,
          v: String(Date.now()),
        });
        const webUrl = `https://ofmapp-main.web.app/?${query.toString()}`;
        const { Linking } = require("react-native");
        try {
          const WebBrowser = require("expo-web-browser");
          await WebBrowser.openBrowserAsync(webUrl);
        } catch {
          await Linking.openURL(webUrl);
        }
        return;
      }

      setIsGeneratingPdf(true);
      setPdfSuccessMessage(null);
      setPdfErrorMessage(null);

      setIsSavingPdf(true);
      const result = await downloadPayslipPDF(emp, getOrgInfo());
      
      setPdfSuccessMessage(`Saved: ${result.filename}`);
      
      setSuccessModalData({
        visible: true,
        filename: result.filename,
        fileUri: result.uri,
        fileSize: result.fileSize,
        title: "PDF Ready ✓",
        subtitle: `Your PDF has been downloaded successfully.`,
      });

      setTimeout(() => {
        setPdfSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error("[PAYSLIP] PDF generation error:", err);
      setPdfErrorMessage(err?.message || "Unable to save PDF. Please try again.");
      Alert.alert("PDF Generation Failed", err?.message || "Unable to generate payslip PDF. Please check employee data and try again.");
    } finally {
      setIsGeneratingPdf(false);
      setIsSavingPdf(false);
    }
  };

  const [isSavingImage, setIsSavingImage] = useState(false);

  const handleShareSlip = async (emp: PayrollEntry) => {
    try {
      setIsSharingPdf(true);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      await sharePayslipPDF(emp, getOrgInfo());
    } catch (err: any) {
      console.error("[PAYSLIP] Share error:", err);
      Alert.alert("Share Failed", err?.message || "Unable to share payslip PDF.");
    } finally {
      setIsSharingPdf(false);
    }
  };

  const handleSaveImage = async (emp: PayrollEntry) => {
    try {
      setIsSavingImage(true);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await downloadPayslipImage(emp, getOrgInfo());
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPdfSuccessMessage(`Slip Image Saved to Gallery`);
      
      setSuccessModalData({
        visible: true,
        filename: res.filename,
        fileUri: res.uri,
        fileSize: res.fileSize,
        title: "Slip Image Saved to Gallery",
        subtitle: `Official payslip image for ${emp.employeeName} (${emp.month}) has been saved to your Photos/Gallery.`,
      });

      setTimeout(() => {
        setPdfSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error("[PAYSLIP] Image save error:", err);
      Alert.alert("Image Save Failed", err?.message || "Unable to export payslip image.");
    } finally {
      setIsSavingImage(false);
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: webTop + insets.top + (Platform.OS === "android" ? 16 : 10), backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {isEmployee ? "My Salary Slip" : "Staff Payroll"}
            </Text>
            <Text style={{ fontSize: 10.5, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
              Role: <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>{user?.role?.toUpperCase() || "ADMIN"}</Text>
            </Text>
          </View>
          {canEdit ? (
            <TouchableOpacity
              onPress={handleOpenAdd}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: "#8B5CF622",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#8B5CF655",
              }}
              hitSlop={10}
            >
              <Feather name="plus" size={18} color="#8B5CF6" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 34 }} />
          )}
        </View>

        {/* Total Net Pay Banner */}
        <View style={[styles.totalCard, { backgroundColor: "#8B5CF611", borderColor: "#8B5CF644" }]}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#8B5CF622", alignItems: "center", justifyContent: "center" }}>
            <Feather name="users" size={18} color="#8B5CF6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>
              {isEmployee ? "My Net Take-Home Salary" : "Total Organization Net Pay"}
            </Text>
            <Text style={[styles.totalValue, { color: "#8B5CF6" }]}>{fmt(totalNetPay)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.empCount, { color: colors.mutedForeground }]}>
              {isEmployee ? "Confidential" : `${userPayroll.length} Staff Records`}
            </Text>
            <Text style={{ fontSize: 10, color: "#10B981", fontFamily: "Inter_700Bold" }}>✓ Auto Synced</Text>
          </View>
        </View>

        {/* Live Search Filter */}
        {!isEmployee && (
          <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={14} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search staff by name, ID, or department..."
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x-circle" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Staff Payroll List */}
      <FlatList
        data={filteredUserPayroll}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 16) + 80 }]}
        renderItem={({ item }) => {
          const netPay = (item.baseSalary || 0) + (item.bonus || 0) - (item.deductions || 0);
          return (
            <View style={[styles.payCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.payTop}>
                <View style={[styles.payAvatar, { backgroundColor: "#8B5CF622" }]}>
                  <Text style={[styles.payAvatarText, { color: "#8B5CF6" }]}>{item.employeeName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.payInfo}>
                  <Text style={[styles.payName, { color: colors.foreground }]}>{item.employeeName}</Text>
                  <Text style={[styles.payMeta, { color: colors.mutedForeground }]}>{item.employeeId} · {item.department}</Text>
                  <Text style={[styles.payMonth, { color: colors.mutedForeground }]}>Period: {item.month}</Text>
                </View>
                <View style={styles.payRight}>
                  <Text style={[styles.payNet, { color: "#8B5CF6" }]}>{fmt(netPay)}</Text>
                  
                  {/* Action Buttons Row */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    {/* View / Download Official Slip Button */}
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        backgroundColor: "#8B5CF618",
                        paddingHorizontal: 8,
                        paddingVertical: 4.5,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: "#8B5CF644",
                      }}
                      onPress={() => {
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSlipModalEntry(item);
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather name="file-text" size={11} color="#8B5CF6" />
                      <Text style={{ fontSize: 10.5, fontFamily: "Inter_700Bold", color: "#8B5CF6" }}>
                        PDF Slip
                      </Text>
                    </TouchableOpacity>

                    {/* Edit Button for Admin/Accountant */}
                    {canEdit && (
                      <TouchableOpacity
                        onPress={() => handleOpenEdit(item)}
                        style={{
                          padding: 5,
                          backgroundColor: colors.primary + "14",
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: colors.primary + "33",
                        }}
                        hitSlop={8}
                      >
                        <Feather name="edit-2" size={13} color={colors.primary} />
                      </TouchableOpacity>
                    )}

                    {/* Delete Button for Admin/Accountant */}
                    {canEdit && (
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            "Delete Payroll Record",
                            `Are you sure you want to delete payroll for ${item.employeeName}?`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Delete",
                                style: "destructive",
                                onPress: () => {
                                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                  deletePayroll(item.id);
                                },
                              },
                            ]
                          );
                        }}
                        style={{
                          padding: 5,
                          backgroundColor: colors.expense + "14",
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: colors.expense + "33",
                        }}
                        hitSlop={8}
                      >
                        <Feather name="trash-2" size={13} color={colors.expense} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Breakdown Strip */}
              <View style={[styles.payBreakdown, { borderTopColor: colors.border, backgroundColor: colors.background + "66" }]}>
                <View style={styles.payBreakdownItem}>
                  <Text style={[styles.bLabel, { color: colors.mutedForeground }]}>Base Salary</Text>
                  <Text style={[styles.bValue, { color: colors.foreground }]}>{fmt(item.baseSalary)}</Text>
                </View>
                <View style={styles.payBreakdownItem}>
                  <Text style={[styles.bLabel, { color: colors.mutedForeground }]}>Bonus</Text>
                  <Text style={[styles.bValue, { color: colors.income }]}>+{fmt(item.bonus || 0)}</Text>
                </View>
                <View style={styles.payBreakdownItem}>
                  <Text style={[styles.bLabel, { color: colors.mutedForeground }]}>Deductions</Text>
                  <Text style={[styles.bValue, { color: colors.expense }]}>-{fmt(item.deductions || 0)}</Text>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search ? "No staff members match your search" : "No payroll records found"}
            </Text>
            {canEdit && !search && (
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: "#8B5CF6", marginTop: 12, paddingHorizontal: 20 }]} onPress={handleOpenAdd}>
                <Text style={styles.addBtnText}>+ Add First Staff Payroll</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* ─── Official Digital Payslip Modal ─── */}
      <Modal
        visible={slipModalEntry !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSlipModalEntry(null)}
      >
        <View style={styles.slipOverlay}>
          <View style={[styles.slipSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.handle} />

            {/* Slip Header */}
            <View style={styles.slipHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#8B5CF622", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="file-text" size={18} color="#8B5CF6" />
                </View>
                <View>
                  <Text style={[styles.slipTitle, { color: colors.foreground }]}>Official Payslip</Text>
                  <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_700Bold", marginTop: 1 }}>
                    {settings.organizationName || user?.organization || "Devorbit Tech kotli"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSlipModalEntry(null)} hitSlop={10}>
                <Feather name="x-circle" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {slipModalEntry && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30, gap: 14 }}>
                {/* Status Verified Banner */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#10B98115", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#10B98135" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="check-circle" size={14} color="#10B981" />
                    <Text style={{ color: "#10B981", fontSize: 11, fontFamily: "Inter_700Bold" }}>VERIFIED & DISBURSED</Text>
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>
                    Period: {slipModalEntry.month}
                  </Text>
                </View>

                {/* Employee Info Block */}
                <View style={{ backgroundColor: colors.background, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Employee Name</Text>
                    <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold" }}>{slipModalEntry.employeeName}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Employee ID</Text>
                    <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{slipModalEntry.employeeId}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Department</Text>
                    <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{slipModalEntry.department}</Text>
                  </View>
                </View>

                {/* Earnings & Deductions Tables */}
                <View style={{ backgroundColor: colors.background, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
                  <Text style={{ color: "#8B5CF6", fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>EARNINGS & ALLOWANCES</Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Basic Salary</Text>
                    <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{fmtExact(slipModalEntry.baseSalary)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Performance Bonus / Incentives</Text>
                    <Text style={{ color: colors.income, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>+{fmtExact(slipModalEntry.bonus || 0)}</Text>
                  </View>
                  <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
                  <Text style={{ color: colors.expense, fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>DEDUCTIONS & WITHHOLDINGS</Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Tax / Provident Fund / Deductions</Text>
                    <Text style={{ color: colors.expense, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>-{fmtExact(slipModalEntry.deductions || 0)}</Text>
                  </View>
                </View>

                {/* Net Salary Payable Highlight Card */}
                <View style={{ backgroundColor: "#8B5CF622", padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: "#8B5CF666", alignItems: "center", gap: 4 }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 }}>NET SALARY PAYABLE</Text>
                  <Text style={{ color: "#8B5CF6", fontSize: 24, fontFamily: "Inter_800ExtraBold" }}>
                    {fmtExact((slipModalEntry.baseSalary || 0) + (slipModalEntry.bonus || 0) - (slipModalEntry.deductions || 0))}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10, textAlign: "center", marginTop: 2 }}>
                    Official digital record generated securely via OFM.
                  </Text>
                </View>

                {/* Modal Action Buttons */}
                {/* Success Banner if PDF is saved */}
                {pdfSuccessMessage && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#10B9811A", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#10B98144", justifyContent: "center" }}>
                    <Feather name="check-circle" size={14} color="#10B981" />
                    <Text style={{ color: "#10B981", fontSize: 12, fontFamily: "Inter_700Bold" }}>
                      {pdfSuccessMessage}
                    </Text>
                  </View>
                )}

                {/* Modal Action: Single Prominent Download PDF Slip Button */}
                <View style={{ marginTop: 12 }}>
                  <TouchableOpacity
                    style={{
                      width: "100%",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 15,
                      borderRadius: 14,
                      backgroundColor: pdfSuccessMessage ? "#10B981" : pdfErrorMessage ? "#EF4444" : "#8B5CF6",
                      opacity: isGeneratingPdf || isSavingPdf ? 0.7 : 1,
                      shadowColor: "#8B5CF6",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                    disabled={isGeneratingPdf || isSavingPdf}
                    onPress={() => handleExportEmployeeSlip(slipModalEntry)}
                  >
                    <Feather
                      name={
                        pdfSuccessMessage
                          ? "check"
                          : isGeneratingPdf || isSavingPdf
                          ? "loader"
                          : pdfErrorMessage
                          ? "alert-circle"
                          : "download"
                      }
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_700Bold" }}>
                      {isGeneratingPdf
                        ? "Generating PDF..."
                        : isSavingPdf
                        ? "Saving to File Manager..."
                        : pdfSuccessMessage
                        ? "Saved in File Manager ✅"
                        : pdfErrorMessage
                        ? "Try Again"
                        : "Download Official Payslip (PDF)"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Add / Edit Employee Payroll Modal ─── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={[styles.overlay, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.handle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingEntry ? "Edit Employee Payroll" : "Add Employee Payroll"}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
              {[
                { label: "EMPLOYEE NAME", value: name, onChange: setName, placeholder: "Full name", keyboard: "default" as const },
                { label: "EMPLOYEE ID", value: empId, onChange: setEmpId, placeholder: "EMP001", keyboard: "default" as const },
                { label: `BASE SALARY (${settings.currency})`, value: salary, onChange: setSalary, placeholder: "0.00", keyboard: "decimal-pad" as const },
                { label: `BONUS / INCENTIVES (${settings.currency})`, value: bonus, onChange: setBonus, placeholder: "0.00", keyboard: "decimal-pad" as const },
                { label: `DEDUCTIONS / TAX (${settings.currency})`, value: deductions, onChange: setDeductions, placeholder: "0.00", keyboard: "decimal-pad" as const },
                { label: "PAY MONTH", value: month, onChange: setMonth, placeholder: "YYYY-MM", keyboard: "default" as const },
              ].map((f) => (
                <View key={f.label}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                  <TextInput style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]} placeholder={f.placeholder} placeholderTextColor={colors.mutedForeground} keyboardType={f.keyboard} value={f.value} onChangeText={f.onChange} />
                </View>
              ))}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DEPARTMENT</Text>
              <View style={styles.chips}>
                {availableDepts.map((d) => (
                  <TouchableOpacity key={d} style={[styles.chip, { backgroundColor: dept === d ? "#8B5CF6" : (colors.cardAlt ?? colors.muted), borderColor: dept === d ? "#8B5CF6" : colors.border }]} onPress={() => setDept(d)}>
                    <Text style={[styles.chipText, { color: dept === d ? "#fff" : colors.foreground }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {error ? <Text style={[styles.error, { color: colors.expense }]}>{error}</Text> : null}
              <View style={styles.modalBtns}>
                <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setModalVisible(false)}>
                  <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: "#8B5CF6" }]} onPress={handleSave}>
                  <Text style={styles.addBtnText}>{editingEntry ? "Save Changes" : "Add Employee"}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Premium PDF Success & Share Modal ─── */}
      <PdfSuccessModal
        visible={successModalData.visible}
        onClose={() => setSuccessModalData((prev) => ({ ...prev, visible: false }))}
        filename={successModalData.filename}
        fileUri={successModalData.fileUri}
        fileSize={successModalData.fileSize}
        title={successModalData.title}
        subtitle={successModalData.subtitle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  totalCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  totalLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  totalValue: { fontSize: 18, fontFamily: "Inter_800ExtraBold" },
  empCount: { fontSize: 11, fontFamily: "Inter_500Medium" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  list: { padding: 16, gap: 12 },
  payCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  payTop: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  payAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  payAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  payInfo: { flex: 1, gap: 1.5 },
  payName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  payMeta: { fontSize: 11.5, fontFamily: "Inter_400Regular" },
  payMonth: { fontSize: 10.5, fontFamily: "Inter_400Regular" },
  payRight: { alignItems: "flex-end", gap: 4 },
  payNet: { fontSize: 15, fontFamily: "Inter_800ExtraBold" },
  payBreakdown: { flexDirection: "row", borderTopWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  payBreakdownItem: { flex: 1, alignItems: "center", gap: 1 },
  bLabel: { fontSize: 9.5, fontFamily: "Inter_400Regular" },
  bValue: { fontSize: 11.5, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 60 },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 40, gap: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#555", alignSelf: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 6 },
  input: { padding: 12, borderRadius: 12, borderWidth: 1, fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  error: { fontSize: 12, fontFamily: "Inter_400Regular" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 10 },
  cancelBtn: { flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  cancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  addBtn: { flex: 1, padding: 13, borderRadius: 12, alignItems: "center" },
  addBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },

  // Slip Modal Styles
  slipOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" },
  slipSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, maxHeight: "88%", gap: 12 },
  slipHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  slipTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
});
