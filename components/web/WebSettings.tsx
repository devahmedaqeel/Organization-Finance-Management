import React, { useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  FlatList,
  Image,
  useWindowDimensions,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/AuthContext";
import { useSettings, AppTheme } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { WORLD_CURRENCIES, POPULAR_CURRENCIES } from "@/constants/currencies";
import { CountryFlag } from "@/components/CountryFlag";
import {
  SvgSettings,
  SvgCheck,
  SvgX,
  SvgSearch,
  SvgSun,
  SvgMoon,
  SvgChevronDown,
  SvgShield,
  SvgFileText,
  SvgUpload,
  SvgTrash,
} from "./SvgIcons";

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
  keyboard?: "default" | "email-address" | "phone-pad";
  multiline?: boolean;
}

const FIELDS: FieldConfig[] = [
  { key: "organizationName", label: "Organization Legal Name", placeholder: "e.g. Organization Finance Management" },
  { key: "organizationAddress", label: "Headquarters Address", placeholder: "City, Province, Country", multiline: true },
  { key: "organizationEmail", label: "Official Email", placeholder: "finance@organization.com", keyboard: "email-address" },
  { key: "organizationPhone", label: "Phone Number", placeholder: "+1-XXX-XXXXXXX", keyboard: "phone-pad" },
  { key: "fiscalYear", label: "Fiscal Year", placeholder: "2025-2026" },
];

export function WebSettings() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();

  const [form, setForm] = useState({
    organizationName: settings.organizationName || "",
    organizationAddress: settings.organizationAddress || "",
    organizationEmail: settings.organizationEmail || "",
    organizationPhone: settings.organizationPhone || "",
    organizationLogo: settings.organizationLogo || "",
    currency: settings.currency || "PKR",
    fiscalYear: settings.fiscalYear || "2025-2026",
    theme: (settings.theme || "system") as AppTheme,
  });

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [currencyModal, setCurrencyModal] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [logoModalVisible, setLogoModalVisible] = useState(false);
  const [tempLogoUrl, setTempLogoUrl] = useState("");

  useEffect(() => {
    setForm({
      organizationName: settings.organizationName || "",
      organizationAddress: settings.organizationAddress || "",
      organizationEmail: settings.organizationEmail || "",
      organizationPhone: settings.organizationPhone || "",
      organizationLogo: settings.organizationLogo || "",
      currency: settings.currency || "PKR",
      fiscalYear: settings.fiscalYear || "2025-2026",
      theme: (settings.theme || "system") as AppTheme,
    });
    setDirty(false);
  }, [settings]);

  const canEdit = user?.role === "admin";

  const handleChange = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSavedSuccess(false);
  };

  const handleSave = async () => {
    if (!canEdit || saving) return;
    if (!form.organizationName.trim()) {
      alert("Organization name cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      await updateSettings(form);
      setSavedSuccess(true);
      setDirty(false);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (e: any) {
      alert("Error saving settings: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handlePickFromDevice = async () => {
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/png,image/jpeg,image/svg+xml,image/webp,image/gif";
        input.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              alert("Image file size should be less than 5MB");
              return;
            }
            const reader = new FileReader();
            reader.onload = (loadEvent) => {
              const result = loadEvent.target?.result as string;
              if (result) {
                setTempLogoUrl(result);
              }
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setTempLogoUrl(uri);
      }
    } catch (err: any) {
      alert("Could not select image: " + (err?.message || err));
    }
  };

  const handleApplyLogoUrl = async () => {
    const trimmed = tempLogoUrl.trim();
    handleChange("organizationLogo", trimmed);
    setLogoModalVisible(false);
    await updateSettings({ organizationLogo: trimmed });
  };

  const selectedCurrency = useMemo(() => {
    return (
      WORLD_CURRENCIES.find((c) => c.code === form.currency) || {
        code: form.currency,
        name: "Custom Currency",
        symbol: form.currency,
        country: "International",
        flag: "🌐",
      }
    );
  }, [form.currency]);

  const filteredCurrencies = useMemo(() => {
    if (!currencySearch.trim()) return WORLD_CURRENCIES;
    const q = currencySearch.toLowerCase();
    return WORLD_CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [currencySearch]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.primary + "20" }]}>
              <SvgSettings size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>System & Organization Settings</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                Configure legal branding, operating currency, fiscal year, and platform theme
              </Text>
            </View>
          </View>
        </View>

        {canEdit && (
          <View style={[styles.headerActions, isMobile && { width: "100%" }]}>
            {dirty && (
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: colors.border, backgroundColor: colors.card }, isMobile && { flex: 1 }]}
                onPress={() => {
                  setForm({
                    organizationName: settings.organizationName || "",
                    organizationAddress: settings.organizationAddress || "",
                    organizationEmail: settings.organizationEmail || "",
                    organizationPhone: settings.organizationPhone || "",
                    organizationLogo: settings.organizationLogo || "",
                    currency: settings.currency || "PKR",
                    fiscalYear: settings.fiscalYear || "2025-2026",
                    theme: (settings.theme || "system") as AppTheme,
                  });
                  setDirty(false);
                }}
              >
                <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>Discard</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.primary },
                isMobile && { flex: 1 },
              ]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              <SvgCheck size={14} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Save Settings"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Success Notification Banner */}
      {savedSuccess && (
        <View style={[styles.successBanner, { backgroundColor: colors.income + "18", borderColor: colors.income + "40" }]}>
          <SvgCheck size={18} color={colors.income} />
          <Text style={[styles.successText, { color: colors.income }]}>
            Organization settings saved and synchronized across all connected devices!
          </Text>
        </View>
      )}

      {/* ─── 2-Column Responsive Settings Layout ─── */}
      <View style={styles.settingsGrid}>
        {/* Column 1: Organization Branding & Details */}
        <View style={{ flex: 1.2, minWidth: isMobile ? "100%" : 360, gap: 18 }}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardHeading, { color: colors.foreground }]}>Institutional Branding & Identity</Text>

            {/* Logo Section */}
            <View style={[styles.logoSection, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={[styles.logoBox, { backgroundColor: colors.primary, borderColor: colors.border }]}>
                {form.organizationLogo ? (
                  <Image source={{ uri: form.organizationLogo }} style={styles.logoImg} resizeMode="contain" />
                ) : (
                  <Text style={styles.logoInitials}>
                    {form.organizationName ? form.organizationName.substring(0, 2).toUpperCase() : "OF"}
                  </Text>
                )}
              </View>

              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.logoOrgName, { color: colors.foreground }]} numberOfLines={1}>
                  {form.organizationName || "Your Organization"}
                </Text>
                <Text style={[styles.logoStatus, { color: colors.mutedForeground }]}>
                  {form.organizationLogo ? "Active Custom Logo" : "Default Initials"}
                </Text>

                {canEdit && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    <TouchableOpacity
                      style={[styles.logoActionBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
                      onPress={async () => {
                        await handlePickFromDevice();
                        setLogoModalVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <SvgUpload size={13} color="#FFFFFF" />
                      <Text style={[styles.logoActionText, { color: "#FFFFFF" }]}>
                        From Device
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.logoActionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                      onPress={() => {
                        setTempLogoUrl(form.organizationLogo || "");
                        setLogoModalVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.logoActionText, { color: colors.foreground }]}>
                        Web URL
                      </Text>
                    </TouchableOpacity>

                    {form.organizationLogo ? (
                      <TouchableOpacity
                        style={[styles.logoActionBtn, { borderColor: colors.expense + "40", backgroundColor: colors.expense + "10" }]}
                        onPress={async () => {
                          handleChange("organizationLogo", "");
                          await updateSettings({ organizationLogo: "" });
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.logoActionText, { color: colors.expense }]}>Remove</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>
            </View>

            {/* Form Fields */}
            {FIELDS.map((field) => (
              <View key={field.key} style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>{field.label.toUpperCase()}</Text>
                <View
                  style={[
                    styles.inputWrap,
                    {
                      backgroundColor: canEdit ? colors.background : colors.muted,
                      borderColor: colors.border,
                      height: field.multiline ? 72 : 44,
                      alignItems: field.multiline ? "flex-start" : "center",
                      paddingTop: field.multiline ? 10 : 0,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.input, { color: colors.foreground, height: "100%" }]}
                    value={(form as any)[field.key]}
                    onChangeText={(t) => handleChange(field.key, t)}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.mutedForeground + "80"}
                    editable={canEdit}
                    multiline={field.multiline}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Card: Currency */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.cardHeading, { color: colors.foreground }]}>Operating Currency</Text>
              <TouchableOpacity onPress={() => setCurrencyModal(true)}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary }}>
                  View All ({WORLD_CURRENCIES.length}) →
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.selectedCurrCard, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => canEdit && setCurrencyModal(true)}
              activeOpacity={canEdit ? 0.75 : 1}
            >
              <CountryFlag flag={selectedCurrency.flag} size={36} />

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[styles.selectedCode, { color: colors.foreground }]}>{selectedCurrency.code}</Text>
                  <View style={[styles.symbolPill, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.symbolText, { color: colors.primary }]}>{selectedCurrency.symbol}</Text>
                  </View>
                </View>
                <Text style={[styles.selectedName, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {selectedCurrency.name} · {selectedCurrency.country}
                </Text>
              </View>

              {canEdit && (
                <View style={[styles.changePill, { backgroundColor: colors.primary + "16" }]}>
                  <Text style={[styles.changePillText, { color: colors.primary }]}>Change</Text>
                  <SvgChevronDown size={12} color={colors.primary} />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Column 2: Appearance Theme & Automated Emails */}
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 340, gap: 18 }}>
          {/* Card: Theme Switcher */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardHeading, { color: colors.foreground }]}>Appearance & Theme</Text>

            <View style={[styles.themeCardSegmented, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {[
                { value: "light", icon: SvgSun, label: "Light" },
                { value: "system", icon: SvgSettings, label: "System" },
                { value: "dark", icon: SvgMoon, label: "Dark" },
              ].map((opt) => {
                const IconComp = opt.icon;
                const active = (form.theme ?? "system") === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.themeOptionBtn,
                      {
                        backgroundColor: active ? colors.primary : "transparent",
                      },
                    ]}
                    onPress={() => {
                      const newTheme = opt.value as AppTheme;
                      handleChange("theme", newTheme);
                      updateSettings({ theme: newTheme });
                    }}
                    activeOpacity={0.75}
                  >
                    <IconComp size={14} color={active ? "#FFFFFF" : colors.mutedForeground} />
                    <Text
                      style={[
                        styles.themeOptionText,
                        { color: active ? "#FFFFFF" : colors.foreground },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

        </View>
      </View>

      {/* Logo URL Modal */}
      <Modal visible={logoModalVisible} transparent animationType="fade" onRequestClose={() => setLogoModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Upload Organization Logo</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Choose an image from your device or paste a web URL</Text>
              </View>
              <TouchableOpacity onPress={() => setLogoModalVisible(false)} style={styles.modalCloseBtn}>
                <SvgX size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20, gap: 16 }}>
              {/* Option 1: Upload from Device */}
              <TouchableOpacity
                style={[
                  styles.deviceUploadCard,
                  {
                    backgroundColor: colors.primary + "12",
                    borderColor: colors.primary + "40",
                  },
                ]}
                onPress={handlePickFromDevice}
                activeOpacity={0.75}
              >
                <View style={[styles.deviceUploadIconCircle, { backgroundColor: colors.primary }]}>
                  <SvgUpload size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.deviceUploadTitle, { color: colors.foreground }]}>Choose Image from Device</Text>
                  <Text style={[styles.deviceUploadSub, { color: colors.mutedForeground }]}>
                    PNG, JPG, SVG, WEBP up to 5MB
                  </Text>
                </View>
                <View style={[styles.deviceUploadBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.deviceUploadBadgeText}>Browse</Text>
                </View>
              </TouchableOpacity>

              {/* Divider */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 0.5 }}>
                  OR ENTER WEB URL
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              </View>

              {/* Option 2: Web URL input */}
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>IMAGE WEB URL</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="https://your-domain.com/logo.png"
                    placeholderTextColor={colors.mutedForeground + "80"}
                    value={tempLogoUrl}
                    onChangeText={setTempLogoUrl}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Live Preview */}
              {tempLogoUrl ? (
                <View style={{ alignItems: "center", padding: 14, backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground }}>PREVIEW</Text>
                  <Image source={{ uri: tempLogoUrl }} style={{ width: 80, height: 80, borderRadius: 12 }} resizeMode="contain" />
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 8 }}
                    onPress={() => setTempLogoUrl("")}
                  >
                    <SvgTrash size={13} color={colors.expense} />
                    <Text style={{ fontSize: 11.5, fontFamily: "Inter_600SemiBold", color: colors.expense }}>Clear Image</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setLogoModalVisible(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleApplyLogoUrl}>
                <Text style={styles.primaryBtnText}>Save Logo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Currency Modal */}
      <Modal visible={currencyModal} transparent animationType="fade" onRequestClose={() => setCurrencyModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.currModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Operating Currency</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  Choose from {WORLD_CURRENCIES.length} world currencies
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCurrencyModal(false)} style={styles.modalCloseBtn}>
                <SvgX size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={[styles.searchBarWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <SvgSearch size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.modalSearchInput, { color: colors.foreground }]}
                  placeholder="Search currency by code, country, or name..."
                  placeholderTextColor={colors.mutedForeground + "80"}
                  value={currencySearch}
                  onChangeText={setCurrencySearch}
                />
              </View>
            </View>

            <FlatList
              data={filteredCurrencies}
              keyExtractor={(item) => item.code}
              contentContainerStyle={{ padding: 12 }}
              renderItem={({ item }) => {
                const isSelected = item.code === form.currency;
                return (
                  <TouchableOpacity
                    style={[
                      styles.currRow,
                      {
                        backgroundColor: isSelected ? colors.primary + "14" : "transparent",
                        borderBottomColor: colors.border + "50",
                      },
                    ]}
                    onPress={() => {
                      handleChange("currency", item.code);
                      setCurrencyModal(false);
                    }}
                  >
                    <CountryFlag flag={item.flag} size={28} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.currCode, { color: colors.foreground }]}>{item.code}</Text>
                      <Text style={[styles.currCountry, { color: colors.mutedForeground }]}>
                        {item.name} · {item.country}
                      </Text>
                    </View>
                    <View style={[styles.symbolMiniPill, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.symbolMiniText, { color: colors.foreground }]}>{item.symbol}</Text>
                    </View>
                    {isSelected && (
                      <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                        <SvgCheck size={12} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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
  headerActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
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
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  outlineBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  successText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  settingsGrid: {
    flexDirection: "row",
    gap: 20,
    flexWrap: "wrap",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  cardHeading: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  cardSubText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  logoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  logoImg: {
    width: "100%",
    height: "100%",
  },
  logoInitials: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    color: "#FFFFFF",
  },
  logoOrgName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  logoStatus: {
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
  },
  logoActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  logoActionText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
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
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    borderWidth: 0,
    outlineStyle: "none",
    backgroundColor: "transparent",
  } as any,
  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    height: 46,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    borderWidth: 0,
    outlineStyle: "none",
    backgroundColor: "transparent",
    height: "100%",
  } as any,
  selectedCurrCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedCode: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  selectedName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  symbolPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  symbolText: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
  },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changePillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  themeCardSegmented: {
    flexDirection: "row",
    gap: 6,
    padding: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  themeOptionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 9,
  },
  themeOptionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  toggleBtn: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  currModalCard: {
    width: "100%",
    maxWidth: 580,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  modalSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
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
  currRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: 1,
  },
  currCode: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  currCountry: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  symbolMiniPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  symbolMiniText: {
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceUploadCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    cursor: "pointer" as any,
  },
  deviceUploadIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceUploadTitle: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  deviceUploadSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  deviceUploadBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deviceUploadBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
