import { Feather } from "@/components/UniversalIcon";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useSettings, AppTheme } from "@/context/SettingsContext";
import { POPULAR_CURRENCIES, WORLD_CURRENCIES } from "@/constants/currencies";
import { useColors } from "@/hooks/useColors";
import { showFloatingToast } from "@/utils/toast";

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
  icon: string;
  keyboard?: "default" | "email-address" | "phone-pad";
  multiline?: boolean;
}

const FIELDS: FieldConfig[] = [
  { key: "organizationName", label: "Organization Name", placeholder: "e.g. Organization Finance Inc.", icon: "home" },
  { key: "organizationAddress", label: "Address", placeholder: "City, Province, Country", icon: "map-pin", multiline: true },
  { key: "organizationEmail", label: "Email", placeholder: "finance@organization.com", icon: "mail", keyboard: "email-address" },
  { key: "organizationPhone", label: "Phone", placeholder: "+92-XXX-XXXXXXX", icon: "phone", keyboard: "phone-pad" },
  { key: "fiscalYear", label: "Fiscal Year", placeholder: "2025-2026", icon: "calendar" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [form, setForm] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [currencyModal, setCurrencyModal] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [logoModalVisible, setLogoModalVisible] = useState(false);
  const canEdit = user?.role === "admin";
  const webTop = Platform.OS === "web" ? 67 : 0;

  // Safe Haptic Helpers for Web & Mobile
  const safeHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== "web") {
      try {
        Haptics.impactAsync(style);
      } catch {}
    }
  };

  const safeHapticNotification = (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
    if (Platform.OS !== "web") {
      try {
        Haptics.notificationAsync(type);
      } catch {}
    }
  };

  const safeHapticSelection = () => {
    if (Platform.OS !== "web") {
      try {
        Haptics.selectionAsync();
      } catch {}
    }
  };

  // Logo Picker & Crop Handlers
  const handlePickLogo = async () => {
    if (!canEdit) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Needed", "Please allow photo library access to upload your organization logo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1], // Square 1:1 cropping
        quality: 0.75,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const logoData = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        handleChange("organizationLogo", logoData);
        safeHapticNotification(Haptics.NotificationFeedbackType.Success);
        showFloatingToast("Logo Selected", "Tap 'Save' above to save changes!");
      }
    } catch (e) {
      console.warn("Logo pick error:", e);
      Alert.alert("Error", "Could not pick image. Please try again.");
    }
  };

  const handleTakePhotoLogo = async () => {
    if (!canEdit) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Needed", "Please allow camera access to take a photo of your logo.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const logoData = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        handleChange("organizationLogo", logoData);
        safeHapticNotification(Haptics.NotificationFeedbackType.Success);
        showFloatingToast("Logo Captured", "Tap 'Save' above to save changes!");
      }
    } catch (e) {
      console.warn("Camera logo error:", e);
      Alert.alert("Error", "Could not capture image. Please try again.");
    }
  };

  const handleRemoveLogo = () => {
    handleChange("organizationLogo", "");
    safeHapticNotification(Haptics.NotificationFeedbackType.Warning);
    showFloatingToast("Logo Removed", "Default initials restored. Tap 'Save' to apply.");
  };

  useEffect(() => {
    setForm({ ...settings });
  }, [settings]);

  const handleChange = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!form.organizationName.trim()) {
      Alert.alert("Validation", "Organization name cannot be empty.");
      return;
    }
    await updateSettings(form);
    setSaved(true);
    setDirty(false);
    safeHapticNotification(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    Alert.alert("Discard Changes", "Revert all unsaved changes?", [
      { text: "Cancel", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => { setForm({ ...settings }); setDirty(false); } },
    ]);
  };

  const selectedCurrency = WORLD_CURRENCIES.find((c) => c.code === form.currency);

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.toLowerCase().trim();
    if (!q) return WORLD_CURRENCIES;
    return WORLD_CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q) ||
        c.symbol.includes(q)
    );
  }, [currencySearch]);

  const popularList = WORLD_CURRENCIES.filter((c) => POPULAR_CURRENCIES.includes(c.code));

  useEffect(() => {
    const onBackPress = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, []);

  const handleGoBack = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <View style={[styles.header, { paddingTop: webTop + insets.top + (Platform.OS === "android" ? 20 : 12), backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: colors.border }]}
            onPress={handleGoBack}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.title, { color: colors.foreground }]}>Organization Settings</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {form.organizationName || "System Preferences"}
            </Text>
          </View>
          <View style={{ width: 38 }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) + 110 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {saved && (
          <View style={[styles.successBanner, { backgroundColor: colors.income + "22", borderColor: colors.income + "44" }]}>
            <Feather name="check-circle" size={16} color={colors.income} />
            <Text style={[styles.successText, { color: colors.income }]}>Organization settings saved successfully!</Text>
          </View>
        )}

        <View style={[styles.orgPreview, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Logo Container with floating camera badge */}
          <TouchableOpacity
            style={styles.logoContainerTouchable}
            onPress={() => {
              if (canEdit) {
                safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                setLogoModalVisible(true);
              }
            }}
            activeOpacity={canEdit ? 0.8 : 1}
          >
            <View
              style={[
                styles.orgLogoBox,
                {
                  backgroundColor: form.organizationLogo ? "#FFFFFF" : colors.primary,
                  borderColor: colors.border,
                },
              ]}
            >
              {form.organizationLogo ? (
                <Image
                  source={{ uri: form.organizationLogo }}
                  style={styles.orgLogoImg}
                  contentFit="contain"
                />
              ) : (
                <Text style={styles.orgLogoText}>
                  {(form.organizationName || "ORG")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0] || "")
                    .join("")
                    .toUpperCase() || "ORG"}
                </Text>
              )}
            </View>

            {canEdit && (
              <View style={[styles.logoCameraBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                <Feather name="camera" size={11} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.orgPreviewInfo}>
            <Text style={[styles.orgPreviewName, { color: colors.foreground }]} numberOfLines={2}>
              {form.organizationName || "Organization Name"}
            </Text>
            <Text style={[styles.orgPreviewSub, { color: colors.mutedForeground }]}>
              {selectedCurrency?.flag} {form.currency} · {form.fiscalYear}
            </Text>
            {canEdit && (
              <TouchableOpacity
                style={[styles.changeLogoPill, { backgroundColor: colors.primary + "16", borderColor: colors.primary + "38" }]}
                onPress={() => {
                  safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                  setLogoModalVisible(true);
                }}
                activeOpacity={0.75}
              >
                <Feather name="image" size={11} color={colors.primary} />
                <Text style={[styles.changeLogoPillText, { color: colors.primary }]}>
                  {form.organizationLogo ? "Change Logo" : "Upload Logo"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ─── Logged In Account & Session ────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACTIVE LOGGED IN ACCOUNT</Text>
        <View style={[styles.userAccountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.userAccountHeader}>
            <View style={[styles.userAccountAvatar, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" }]}>
              <Text style={[styles.userAccountAvatarText, { color: colors.primary }]}>
                {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
              </Text>
              <View style={[styles.activeDot, { backgroundColor: "#10B981" }]} />
            </View>

            <View style={styles.userAccountDetails}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <Text style={[styles.userAccountName, { color: colors.foreground }]} numberOfLines={1}>
                  {user?.name || "Authenticated User"}
                </Text>
                <View style={[styles.roleBadgePill, { backgroundColor: colors.primary + "16", borderColor: colors.primary + "35" }]}>
                  <Feather name="shield" size={10} color={colors.primary} />
                  <Text style={[styles.roleBadgeText, { color: colors.primary }]}>
                    {(user?.role || "admin").toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Logged in Email Callout */}
              <View style={[styles.emailCalloutRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Feather name="mail" size={13} color={colors.primary} />
                <Text style={[styles.emailCalloutText, { color: colors.foreground }]} numberOfLines={1} selectable>
                  {user?.email || "No email detected"}
                </Text>
              </View>
            </View>
          </View>

          {/* Org and Session Meta Info */}
          <View style={[styles.userMetaDivider, { backgroundColor: colors.border }]} />
          <View style={styles.userMetaGrid}>
            <View style={styles.userMetaItem}>
              <Text style={[styles.userMetaLabel, { color: colors.mutedForeground }]}>ORGANIZATION</Text>
              <Text style={[styles.userMetaValue, { color: colors.foreground }]} numberOfLines={1}>
                {user?.organization || settings.organizationName || "Devorbit Tech"}
              </Text>
            </View>

            <View style={styles.userMetaItem}>
              <Text style={[styles.userMetaLabel, { color: colors.mutedForeground }]}>TENANT ID</Text>
              <Text style={[styles.userMetaValue, { color: colors.mutedForeground, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]} numberOfLines={1}>
                {user?.organizationId || "default_org"}
              </Text>
            </View>
          </View>
        </View>

        {/* ─── Appearance / Theme Toggle ──────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>APPEARANCE</Text>
        <View style={[styles.themeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(
            [
              { value: "light", icon: "sun", label: "Light" },
              { value: "system", icon: "monitor", label: "System" },
              { value: "dark", icon: "moon", label: "Dark" },
            ] as { value: AppTheme; icon: string; label: string }[]
          ).map((opt) => {
            const active = (form.theme ?? "system") === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeOption,
                  {
                    backgroundColor: active ? colors.primary : colors.muted,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={async () => {
                  handleChange("theme", opt.value);
                  await updateSettings({ theme: opt.value });
                  safeHapticSelection();
                }}
                activeOpacity={0.75}
              >
                <Feather name={opt.icon} size={16} color={active ? "#fff" : colors.mutedForeground} />
                <Text style={[styles.themeOptionText, { color: active ? "#fff" : colors.mutedForeground }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ORGANIZATION DETAILS</Text>

        {FIELDS.map((field) => (
          <View key={field.key} style={styles.fieldWrap}>
            <View style={styles.fieldLabelRow}>
              <Feather name={field.icon} size={13} color={colors.mutedForeground} />
              <Text style={[styles.fieldLabelText, { color: colors.mutedForeground }]}>{field.label.toUpperCase()}</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: canEdit ? colors.input : colors.muted,
                  borderColor: colors.border,
                  color: colors.foreground,
                  height: field.multiline ? 72 : undefined,
                  textAlignVertical: field.multiline ? "top" : "center",
                },
              ]}
              placeholder={field.placeholder}
              placeholderTextColor={colors.mutedForeground}
              keyboardType={field.keyboard ?? "default"}
              value={(form as any)[field.key]}
              onChangeText={(v) => handleChange(field.key, v)}
              editable={canEdit}
              multiline={field.multiline}
            />
          </View>
        ))}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DEFAULT OPERATING CURRENCY</Text>
        <TouchableOpacity
          style={[
            styles.currencyCardTrigger,
            {
              backgroundColor: colors.card,
              borderColor: dirty && form.currency !== settings.currency ? colors.primary : colors.border,
            },
          ]}
          onPress={() => {
            if (canEdit) {
              setCurrencyModal(true);
              safeHaptic(Haptics.ImpactFeedbackStyle.Light);
            }
          }}
          activeOpacity={canEdit ? 0.75 : 1}
        >
          <View style={[styles.currencyFlagBadge, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" }]}>
            <Text style={styles.currencyFlagText}>{selectedCurrency?.flag ?? "🌐"}</Text>
          </View>
          <View style={styles.currencyTriggerInfo}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[styles.currencyCodeHero, { color: colors.foreground }]}>{form.currency}</Text>
              <View style={[styles.symbolBadge, { backgroundColor: colors.muted }]}>
                <Text style={[styles.symbolBadgeText, { color: colors.primary }]}>{selectedCurrency?.symbol}</Text>
              </View>
            </View>
            <Text style={[styles.currencyNameHero, { color: colors.mutedForeground }]} numberOfLines={1}>
              {selectedCurrency?.name} · {selectedCurrency?.country}
            </Text>
          </View>
          {canEdit && (
            <View style={[styles.changeActionPill, { backgroundColor: colors.primary + "18" }]}>
              <Text style={[styles.changeActionText, { color: colors.primary }]}>Change</Text>
              <Feather name="chevron-down" size={13} color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>

        {/* Automated Gmail Integration Card (Admin Only) */}
        {canEdit && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>AUTOMATED GMAIL INTEGRATION</Text>
            <View style={[styles.inviteCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 12 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.inviteCardTitle, { color: colors.foreground }]}>Enable Background Auto-Send</Text>
                  <Text style={[styles.inviteCardSub, { color: colors.mutedForeground, marginTop: 2 }]}>
                    Send dynamic invitation emails directly in the background via EmailJS (Gmail connection).
                  </Text>
                </View>
                <Switch
                  value={form.emailAutomatedEnabled || false}
                  onValueChange={(val) => handleChange("emailAutomatedEnabled", val)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={Platform.OS === "android" ? (form.emailAutomatedEnabled ? colors.primary : "#f4f3f4") : undefined}
                />
              </View>

              {form.emailAutomatedEnabled && (
                <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 }}>
                  <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>EMAILJS SERVICE ID</Text>
                  <TextInput
                    style={[styles.miniInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. service_gmail"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    value={form.emailjsServiceId || ""}
                    onChangeText={(val) => handleChange("emailjsServiceId", val)}
                  />

                  <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>EMAILJS TEMPLATE ID</Text>
                  <TextInput
                    style={[styles.miniInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. template_invite"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    value={form.emailjsTemplateId || ""}
                    onChangeText={(val) => handleChange("emailjsTemplateId", val)}
                  />

                  <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>EMAILJS PUBLIC KEY</Text>
                  <TextInput
                    style={[styles.miniInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="e.g. user_xxxxxx"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    value={form.emailjsPublicKey || ""}
                    onChangeText={(val) => handleChange("emailjsPublicKey", val)}
                  />

                  {/* Urdu & English premium guide */}
                  <View style={{ backgroundColor: colors.muted, borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 }}>
                      💡 Quick Setup Guide / رہنمائی:
                    </Text>
                    
                    <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 14 }}>
                      🇬🇧 **English:**{"\n"}
                      1. Register a free account at **emailjs.com**{"\n"}
                      2. Add **Gmail** under "Email Services" and get **Service ID**{"\n"}
                      3. Create an "Email Template", use variable tags like {"{{to_email}}"}, {"{{role}}"}, {"{{org_name}}"}, {"{{admin_email}}"}, {"{{admin_name}}"}, and {"{{apk_link}}"} in your email body, and get **Template ID**{"\n"}
                      4. Copy your **Public Key** from Account &gt; API Keys and paste all keys here!{"\n"}
                      5. Tap **Save Settings** below to activate!
                    </Text>

                    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />

                    <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 14, textAlign: "left" }}>
                      🇵🇰 **Urdu (Roman Urdu):**{"\n"}
                      1. **emailjs.com** par free account banayen.{"\n"}
                      2. "Email Services" mein apna **Gmail** connect karein aur **Service ID** copy karein.{"\n"}
                      3. Ek naya "Email Template" banayein aur usme template variables (jaise {"{{to_email}}"}, {"{{role}}"} wagera) set karke **Template ID** copy karein.{"\n"}
                      4. Account &gt; API Keys se **Public Key** copy karke yahan paste karein.{"\n"}
                      5. Neche **Save Settings** daba kar activate karein!
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {!canEdit && (
          <View style={[styles.readonlyBanner, { backgroundColor: colors.warning + "15", borderColor: colors.warning + "44" }]}>
            <Feather name="lock" size={14} color={colors.warning} />
            <Text style={[styles.readonlyText, { color: colors.warning }]}>Only Admins can edit organization settings.</Text>
          </View>
        )}

        {canEdit && (
          <View style={[styles.bottomSaveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {dirty ? (
              <View style={styles.dirtyActionRow}>
                <TouchableOpacity
                  style={[styles.discardBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={handleReset}
                  activeOpacity={0.75}
                >
                  <Feather name="rotate-ccw" size={15} color={colors.mutedForeground} />
                  <Text style={[styles.discardBtnText, { color: colors.mutedForeground }]}>Discard</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.executiveSaveBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
                  onPress={handleSave}
                  activeOpacity={0.85}
                >
                  <Feather name="check" size={16} color="#FFFFFF" />
                  <Text style={styles.executiveSaveBtnText}>Save Settings</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.syncedStateRow}>
                <View style={[styles.syncedCheckWrap, { backgroundColor: "#10B98118", borderColor: "#10B98135" }]}>
                  <Feather name="check-circle" size={16} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.syncedTitle, { color: colors.foreground }]}>Settings Synchronized</Text>
                  <Text style={[styles.syncedSub, { color: colors.mutedForeground }]}>All changes are saved & active</Text>
                </View>
                <View style={[styles.statusActivePill, { backgroundColor: "#10B98115", borderColor: "#10B98133" }]}>
                  <Text style={styles.statusActiveText}>SAVED</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modern Executive Currency Picker Modal */}
      <Modal visible={currencyModal} transparent animationType="slide" onRequestClose={() => setCurrencyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Select Operating Currency</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Choose currency for organization ledgers</Text>
              </View>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}
                onPress={() => { setCurrencyModal(false); setCurrencySearch(""); }}
              >
                <Feather name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Search Input Bar */}
            <View style={[styles.searchBar, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.primary} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search 150+ currencies by name, code or country..."
                placeholderTextColor={colors.mutedForeground}
                value={currencySearch}
                onChangeText={setCurrencySearch}
                autoCapitalize="none"
              />
              {currencySearch ? (
                <TouchableOpacity onPress={() => setCurrencySearch("")}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Popular Currencies Horizontal Row */}
            {!currencySearch && (
              <View style={{ marginBottom: 6 }}>
                <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>POPULAR CURRENCIES</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.popularRow}
                >
                  {popularList.map((c) => {
                    const isSelected = form.currency === c.code;
                    return (
                      <TouchableOpacity
                        key={c.code}
                        style={[
                          styles.popularChip,
                          {
                            backgroundColor: isSelected ? colors.primary + "20" : colors.muted,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => {
                          handleChange("currency", c.code);
                          safeHapticSelection();
                          setCurrencyModal(false);
                          setCurrencySearch("");
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.popularFlag}>{c.flag}</Text>
                        <View>
                          <Text style={[styles.popularCode, { color: isSelected ? colors.primary : colors.foreground }]}>
                            {c.code}
                          </Text>
                          <Text style={[styles.popularSymbol, { color: colors.mutedForeground }]}>{c.symbol}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <Text style={[styles.groupLabel, { color: colors.mutedForeground, marginTop: 10 }]}>
                  ALL CURRENCIES ({WORLD_CURRENCIES.length})
                </Text>
              </View>
            )}

            {currencySearch && filteredCurrencies.length === 0 ? (
              <View style={styles.noResults}>
                <Feather name="search" size={32} color={colors.mutedForeground} />
                <Text style={[styles.noResultsText, { color: colors.mutedForeground }]}>No matching currencies found</Text>
              </View>
            ) : (
              <FlatList
                data={currencySearch ? filteredCurrencies : WORLD_CURRENCIES}
                keyExtractor={(c) => c.code}
                showsVerticalScrollIndicator={false}
                style={styles.currencyList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: c }) => {
                  const isSelected = form.currency === c.code;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.currencyRow,
                        {
                          backgroundColor: isSelected ? colors.primary + "14" : "transparent",
                          borderBottomColor: colors.border,
                        },
                      ]}
                      onPress={() => {
                        handleChange("currency", c.code);
                        safeHapticSelection();
                        setCurrencyModal(false);
                        setCurrencySearch("");
                      }}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.currencyRowFlagWrap,
                          {
                            backgroundColor: isSelected ? colors.primary + "20" : colors.muted,
                            borderColor: isSelected ? colors.primary + "40" : colors.border,
                          },
                        ]}
                      >
                        <Text style={styles.currencyRowFlag}>{c.flag}</Text>
                      </View>

                      <View style={styles.currencyRowInfo}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={[styles.currencyRowCode, { color: isSelected ? colors.primary : colors.foreground }]}>
                            {c.code}
                          </Text>
                          <View style={[styles.symbolMiniPill, { backgroundColor: colors.muted }]}>
                            <Text style={[styles.symbolMiniPillText, { color: colors.mutedForeground }]}>{c.symbol}</Text>
                          </View>
                        </View>
                        <Text style={[styles.currencyRowName, { color: colors.mutedForeground }]}>
                          {c.name} · {c.country}
                        </Text>
                      </View>

                      {isSelected ? (
                        <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
                          <Feather name="check" size={13} color="#fff" />
                        </View>
                      ) : (
                        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ opacity: 0.4 }} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Executive Company Logo Customization Modal */}
      <Modal
        visible={logoModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLogoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.logoModalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHandle} />
            
            {/* Header */}
            <View style={styles.logoModalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.logoModalIconWrap, { backgroundColor: colors.primary + "18" }]}>
                  <Feather name="image" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.logoModalTitle, { color: colors.foreground }]}>Organization Logo</Text>
                  <Text style={[styles.logoModalSub, { color: colors.mutedForeground }]}>
                    Customize your official brand logo for statements & PDFs
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}
                onPress={() => setLogoModalVisible(false)}
              >
                <Feather name="x" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Current Logo Preview Strip */}
            <View style={[styles.logoPreviewStrip, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View
                style={[
                  styles.logoPreviewBadge,
                  {
                    backgroundColor: form.organizationLogo ? "#FFFFFF" : colors.primary,
                    borderColor: colors.border,
                  },
                ]}
              >
                {form.organizationLogo ? (
                  <Image source={{ uri: form.organizationLogo }} style={styles.logoPreviewImg} contentFit="contain" />
                ) : (
                  <Text style={styles.logoPreviewInitials}>
                    {(form.organizationName || "ORG")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0] || "")
                      .join("")
                      .toUpperCase() || "ORG"}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.logoPreviewOrgName, { color: colors.foreground }]} numberOfLines={1}>
                  {form.organizationName || "Your Organization"}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <View style={[styles.activeStatusDot, { backgroundColor: form.organizationLogo ? "#10B981" : colors.mutedForeground }]} />
                  <Text style={[styles.logoStatusText, { color: form.organizationLogo ? "#10B981" : colors.mutedForeground }]}>
                    {form.organizationLogo ? "Active Custom Brand Logo" : "Default Initials Displayed"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Options List */}
            <View style={styles.logoOptionsList}>
              {/* Option 1: Gallery with 1:1 Crop */}
              <TouchableOpacity
                style={[styles.logoOptionCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => {
                  setLogoModalVisible(false);
                  setTimeout(handlePickLogo, 250);
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.optionIconBox, { backgroundColor: "#3B82F618" }]}>
                  <Feather name="image" size={18} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionTitle, { color: colors.foreground }]}>Choose from Gallery</Text>
                  <Text style={[styles.optionDesc, { color: colors.mutedForeground }]}>
                    Select high-res image & crop exact 1:1 square
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Option 2: Camera Capture */}
              <TouchableOpacity
                style={[styles.logoOptionCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => {
                  setLogoModalVisible(false);
                  setTimeout(handleTakePhotoLogo, 250);
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.optionIconBox, { backgroundColor: "#10B98118" }]}>
                  <Feather name="camera" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionTitle, { color: colors.foreground }]}>Take Photo with Camera</Text>
                  <Text style={[styles.optionDesc, { color: colors.mutedForeground }]}>
                    Snap physical logo, stamp, or document
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Option 3: Remove Logo (Only shown if custom logo exists) */}
              {Boolean(form.organizationLogo) && (
                <TouchableOpacity
                  style={[styles.logoOptionCard, { backgroundColor: "#F43F5E0C", borderColor: "#F43F5E30" }]}
                  onPress={() => {
                    setLogoModalVisible(false);
                    setTimeout(handleRemoveLogo, 250);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.optionIconBox, { backgroundColor: "#F43F5E18" }]}>
                    <Feather name="trash-2" size={18} color="#F43F5E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: "#F43F5E" }]}>Remove Custom Logo</Text>
                    <Text style={[styles.optionDesc, { color: colors.mutedForeground }]}>
                      Reset to default organization letter initials
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color="#F43F5E" />
                </TouchableOpacity>
              )}
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={[styles.logoModalCancelBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => setLogoModalVisible(false)}
            >
              <Text style={[styles.logoModalCancelText, { color: colors.foreground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1, justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  container: { padding: 16, gap: 10 },
  successBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  successText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  orgPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 4,
  },
  logoContainerTouchable: {
    position: "relative",
    width: 66,
    height: 66,
    flexShrink: 0,
  },
  orgLogoBox: {
    width: 66,
    height: 66,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
    padding: 3,
  },
  orgLogoImg: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  logoCameraBadge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  orgLogoText: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  orgPreviewInfo: {
    flex: 1,
    gap: 3,
    justifyContent: "center",
  },
  orgPreviewName: {
    fontSize: 15.5,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  orgPreviewSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  changeLogoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  changeLogoPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 6 },
  fieldWrap: { gap: 6 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  fieldLabelText: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  input: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  
  /* Executive Currency Trigger Card */
  currencyCardTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  currencyFlagBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  currencyFlagText: { fontSize: 24 },
  currencyTriggerInfo: { flex: 1, gap: 2 },
  currencyCodeHero: { fontSize: 16, fontFamily: "Inter_800ExtraBold" },
  symbolBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  symbolBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  currencyNameHero: { fontSize: 12, fontFamily: "Inter_400Regular" },
  changeActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  changeActionText: { fontSize: 11.5, fontFamily: "Inter_700Bold" },

  readonlyBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 4,
  },
  readonlyText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },

  /* Bottom Executive Save Bar */
  bottomSaveCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  dirtyActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  discardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: 1,
  },
  discardBtnText: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },
  executiveSaveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 13,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  executiveSaveBtnText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
  },
  syncedStateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 2,
  },
  syncedCheckWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  syncedTitle: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  syncedSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  statusActivePill: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusActiveText: {
    color: "#10B981",
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },

  /* Modal */
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, height: "86%",
    paddingTop: 10, overflow: "hidden",
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#444", alignSelf: "center", marginBottom: 10 },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_800ExtraBold" },
  modalSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    padding: 11, borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 13.5, fontFamily: "Inter_400Regular" },
  groupLabel: {
    fontSize: 10.5, fontFamily: "Inter_700Bold", letterSpacing: 0.8,
    marginHorizontal: 16, marginVertical: 6,
  },
  popularRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 4,
  },
  popularChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  popularFlag: { fontSize: 18 },
  popularCode: { fontSize: 13, fontFamily: "Inter_800ExtraBold" },
  popularSymbol: { fontSize: 10, fontFamily: "Inter_500Medium" },
  currencyList: { flex: 1 },
  currencyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1,
  },
  currencyRowFlagWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  currencyRowFlag: { fontSize: 20 },
  currencyRowInfo: { flex: 1, gap: 2 },
  currencyRowCode: { fontSize: 14.5, fontFamily: "Inter_800ExtraBold" },
  symbolMiniPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  symbolMiniPillText: { fontSize: 10.5, fontFamily: "Inter_600SemiBold" },
  currencyRowName: { fontSize: 11.5, fontFamily: "Inter_400Regular" },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  noResults: { alignItems: "center", gap: 8, paddingVertical: 40 },
  noResultsText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  themeCard: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 2,
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  themeOptionText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  inviteCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    marginTop: 6,
  },
  inviteCardTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  inviteCardSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
  },
  miniLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  miniInput: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  roleChipText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  inviteBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },

  /* Executive Logo Customization Modal */
  logoModalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 16,
    gap: 14,
  },
  logoModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoModalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logoModalTitle: {
    fontSize: 16.5,
    fontFamily: "Inter_800ExtraBold",
  },
  logoModalSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  logoPreviewStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoPreviewBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 2,
  },
  logoPreviewImg: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  logoPreviewInitials: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  logoPreviewOrgName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  activeStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  logoStatusText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  logoOptionsList: {
    gap: 10,
  },
  logoOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  optionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  optionDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  logoModalCancelBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  logoModalCancelText: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },
  userAccountCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    gap: 12,
  },
  userAccountHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  userAccountAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  userAccountAvatarText: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  activeDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    position: "absolute",
    bottom: -1,
    right: -1,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  userAccountDetails: {
    flex: 1,
    gap: 6,
  },
  userAccountName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  roleBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  emailCalloutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  emailCalloutText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  userMetaDivider: {
    height: 1,
    marginVertical: 2,
  },
  userMetaGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  userMetaItem: {
    flex: 1,
    gap: 2,
  },
  userMetaLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
  },
  userMetaValue: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },
});
