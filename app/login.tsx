import { Feather } from "@/components/UniversalIcon";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserRole, useAuth, ROLE_PERMISSIONS } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { OFMBrandLogo } from "@/components/OFMBrandLogo";
import { GoogleIcon } from "@/components/GoogleIcon";

type ScreenMode = "signin" | "signup";

const SIGNUP_ROLES: { id: UserRole; label: string; desc: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "admin", label: "Admin", desc: "Create Org", icon: "shield" },
  { id: "accountant", label: "Accountant", desc: "Ledgers & Cash", icon: "dollar-sign" },
  { id: "manager", label: "Manager", desc: "Reports & Approvals", icon: "bar-chart-2" },
  { id: "employee", label: "Employee", desc: "Expense Claims", icon: "user" },
];

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, loginWithGoogle, loginWithGoogleCredential, signUp, forgotPassword } = useAuth();

  const [mode, setMode] = useState<ScreenMode>("signin");
  const [selectedRole, setSelectedRole] = useState<UserRole>("admin");
  const [name, setName] = useState("");
  const [orgNameOrInvite, setOrgNameOrInvite] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Forgot Password Modal
  const [forgotModal, setForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const params = useLocalSearchParams();

  // Safe Haptic Helpers for Web & Mobile
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

  // Listen to Google OAuth credentials from deep links
  useEffect(() => {
    const handleDeepLinkAuth = async () => {
      const idTokenStr = Array.isArray(params.idToken) ? params.idToken[0] : params.idToken;
      const accessTokenStr = Array.isArray(params.accessToken) ? params.accessToken[0] : params.accessToken;
      const roleStr = Array.isArray(params.role) ? params.role[0] : params.role;

      if (idTokenStr && accessTokenStr) {
        setLoading(true);
        setError("");
        try {
          const success = await loginWithGoogleCredential(
            decodeURIComponent(idTokenStr),
            decodeURIComponent(accessTokenStr),
            (roleStr as UserRole) || "admin"
          );
          setLoading(false);
          if (success) {
            safeHapticNotification(Haptics.NotificationFeedbackType.Success);
            router.replace("/(tabs)");
          } else {
            setError("Unable to authenticate with Google. Please try again.");
            safeHapticNotification(Haptics.NotificationFeedbackType.Error);
          }
        } catch (e: any) {
          setLoading(false);
          setError(e.message || "Google session restoration failed.");
          safeHapticNotification(Haptics.NotificationFeedbackType.Error);
        }
      }
    };

    handleDeepLinkAuth();
  }, [params.idToken, params.accessToken, params.role]);

  const switchMode = (m: ScreenMode) => {
    setMode(m);
    setError("");
    setName("");
    setOrgNameOrInvite("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    safeHapticSelection();
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setError("Please enter your email and password.");
      safeHapticNotification(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setLoading(true);
    setError("");
    // Role is authoritative on backend; login verifies credentials and loads assigned Firestore permissions
    const success = await login(cleanEmail, password);
    setLoading(false);
    if (success) {
      safeHapticNotification(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      setError("Incorrect email or password. Please try again.");
      safeHapticNotification(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleSignUp = async () => {
    const cleanName = name.trim();
    const cleanOrg = orgNameOrInvite.trim();
    const cleanEmail = email.trim();

    if (!cleanName) { setError("Please enter your full name."); return; }
    if (selectedRole === "admin" && !cleanOrg) { setError("Please enter your organization name."); return; }
    if (selectedRole !== "admin" && !cleanOrg) { setError("Please enter Admin's email as your invite code."); return; }
    if (!cleanEmail) { setError("Please enter your work email."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    setError("");
    const result = await signUp(cleanName, cleanEmail, password, selectedRole, cleanOrg);
    setLoading(false);
    if (result.success) {
      safeHapticNotification(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      setError(result.error || "Unable to create account. Please try again.");
      safeHapticNotification(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const success = await loginWithGoogle();
      setLoading(false);
      if (success) {
        safeHapticNotification(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setLoading(false);
      setError(e.message || "Google sign-in was cancelled.");
      safeHapticNotification(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setForgotMsg({ type: "error", text: "Please enter your email address." });
      return;
    }
    setForgotLoading(true);
    setForgotMsg(null);
    const result = await forgotPassword(forgotEmail.trim());
    setForgotLoading(false);
    if (result.success) {
      setForgotMsg({ type: "success", text: "Password reset instructions sent. Please check your inbox." });
      safeHapticNotification(Haptics.NotificationFeedbackType.Success);
    } else {
      setForgotMsg({ type: "error", text: result.error || "Unable to send reset email. Please verify address." });
      safeHapticNotification(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleOpenWebPortal = async () => {
    const url = "https://ofmapp-main.web.app/";
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (e) {
      console.log("Could not open web portal URL:", e);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: "#07101F" }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top, 20) + 16,
            paddingBottom: Math.max(insets.bottom, 16) + 30,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Header & Enterprise Branding ─── */}
        <View style={styles.headerBox}>
          <OFMBrandLogo size={64} />
          <Text style={styles.appName}>Organization Finance Management</Text>
          <Text style={styles.subtitle}>Secure financial management for your organization</Text>
        </View>

        {/* ─── Authentication Card ─── */}
        <View style={styles.card}>
          {/* Segmented Mode Switcher */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "signin" && styles.modeBtnActive]}
              onPress={() => switchMode("signin")}
              activeOpacity={0.85}
            >
              <Text style={[styles.modeBtnText, mode === "signin" ? styles.textActive : styles.textInactive]}>
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, mode === "signup" && styles.modeBtnActive]}
              onPress={() => switchMode("signup")}
              activeOpacity={0.85}
            >
              <Text style={[styles.modeBtnText, mode === "signup" ? styles.textActive : styles.textInactive]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Role Picker (Sign Up Mode) */}
          {mode === "signup" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ASSIGNED ROLE & PERMISSIONS</Text>
              <View style={styles.roleGrid}>
                {SIGNUP_ROLES.map((r) => {
                  const isSelected = selectedRole === r.id;
                  const activeColor = isSelected ? "#3B82F6" : "#94A3B8";
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[
                        styles.roleCard,
                        isSelected && { borderColor: "#3B82F6", backgroundColor: "rgba(59, 130, 246, 0.15)" },
                      ]}
                      onPress={() => { setSelectedRole(r.id); safeHapticSelection(); }}
                      activeOpacity={0.75}
                    >
                      <Feather name={r.icon} size={15} color={activeColor} />
                      <Text style={[styles.roleLabel, { color: isSelected ? "#3B82F6" : "#F8FAFC" }]}>
                        {r.label}
                      </Text>
                      <Text style={styles.roleDesc}>{r.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Full Name (Sign Up only) */}
          {mode === "signup" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <View style={styles.inputBox}>
                <Feather name="user" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your full name"
                  placeholderTextColor="#64748B"
                  value={name}
                  onChangeText={(v) => { setName(v); setError(""); }}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          {/* Organization / Invite Code (Sign Up only) */}
          {mode === "signup" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                {selectedRole === "admin" ? "ORGANIZATION NAME" : "INVITE CODE (ADMIN'S EMAIL)"}
              </Text>
              <View style={styles.inputBox}>
                <Feather name="briefcase" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.textInput}
                  placeholder={selectedRole === "admin" ? "Enter your organization name" : "admin@organization.com"}
                  placeholderTextColor="#64748B"
                  value={orgNameOrInvite}
                  onChangeText={(v) => { setOrgNameOrInvite(v); setError(""); }}
                  autoCapitalize={selectedRole === "admin" ? "words" : "none"}
                />
              </View>
            </View>
          )}

          {/* Email Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{mode === "signup" ? "WORK EMAIL" : "EMAIL ADDRESS"}</Text>
            <View style={styles.inputBox}>
              <Feather name="mail" size={16} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                placeholder="Enter your email address"
                placeholderTextColor="#64748B"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(v) => { setEmail(v); setError(""); }}
              />
            </View>
          </View>

          {/* Password Field */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              {mode === "signin" && (
                <TouchableOpacity
                  onPress={() => { setForgotEmail(email); setForgotMsg(null); setForgotModal(true); }}
                  hitSlop={8}
                >
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.inputBox}>
              <Feather name="lock" size={16} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                placeholder="Enter your password"
                placeholderTextColor="#64748B"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(""); }}
              />
              <TouchableOpacity onPress={() => setShowPassword((p) => !p)} hitSlop={8}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={17} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password (Sign Up only) */}
          {mode === "signup" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
              <View style={styles.inputBox}>
                <Feather name="lock" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.textInput}
                  placeholder="Confirm your password"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={(v) => { setConfirmPassword(v); setError(""); }}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword((p) => !p)} hitSlop={8}>
                  <Feather name={showConfirmPassword ? "eye-off" : "eye"} size={17} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={15} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Primary Action CTA */}
          <TouchableOpacity
            style={[styles.primaryBtn, loading && { opacity: 0.75 }]}
            onPress={mode === "signin" ? handleLogin : handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {mode === "signin" ? "Sign In" : "Create Account"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Clean Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign-In Button */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <GoogleIcon size={19} />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Security Footer Indicator ─── */}
        <View style={styles.securityIndicator}>
          <Feather name="shield" size={13} color="#64748B" />
          <Text style={styles.securityText}>
            Secure authentication · Role-based access · Protected organization data
          </Text>
        </View>

        {/* ─── Open Web Cloud Portal Link ─── */}
        <TouchableOpacity
          style={styles.webPortalBtn}
          onPress={handleOpenWebPortal}
          activeOpacity={0.75}
        >
          <Feather name="globe" size={13} color="#64748B" />
          <Text style={styles.webPortalText}>
            Open Web Cloud Portal (ofmapp-main.web.app)
          </Text>
          <Feather name="arrow-up-right" size={12} color="#64748B" />
        </TouchableOpacity>
      </ScrollView>

      {/* ─── Forgot Password Modal ─── */}
      <Modal
        visible={forgotModal}
        transparent
        animationType="slide"
        onRequestClose={() => setForgotModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalSheet}>
              <View style={styles.handle} />
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={styles.iconPill}>
                    <Feather name="lock" size={16} color="#3B82F6" />
                  </View>
                  <Text style={styles.modalTitle}>Reset Password</Text>
                </View>
                <TouchableOpacity onPress={() => { setForgotModal(false); setForgotMsg(null); }} hitSlop={8}>
                  <Feather name="x" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSubtitle}>
                Enter your work email address to receive password recovery instructions.
              </Text>
              
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                EMAIL ADDRESS
              </Text>
              <View style={styles.inputBox}>
                <Feather name="mail" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your email address"
                  placeholderTextColor="#64748B"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={forgotEmail}
                  onChangeText={(v) => { setForgotEmail(v); setForgotMsg(null); }}
                  autoFocus
                />
              </View>

              {forgotMsg && (
                <View
                  style={[
                    styles.msgBanner,
                    {
                      backgroundColor: forgotMsg.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      borderColor: forgotMsg.type === "success" ? "#22C55E" : "#EF4444",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: forgotMsg.type === "success" ? "#22C55E" : "#EF4444",
                      fontSize: 12.5,
                      fontFamily: "Inter_500Medium",
                    }}
                  >
                    {forgotMsg.text}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 8 }]}
                onPress={handleForgotPassword}
                disabled={forgotLoading}
                activeOpacity={0.85}
              >
                {forgotLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send Reset Email</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    paddingHorizontal: 18,
    alignItems: "center",
  },
  headerBox: {
    alignItems: "center",
    marginBottom: 18,
    gap: 4,
  },
  appName: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    color: "#F8FAFC",
    letterSpacing: -0.3,
    textAlign: "center",
    marginTop: 8,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    textAlign: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#111C2E",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#233653",
    padding: 20,
    gap: 13,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 4,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "#07101F",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#233653",
    padding: 3,
    gap: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
  },
  modeBtnActive: {
    backgroundColor: "#3B82F6",
  },
  modeBtnText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  textActive: {
    color: "#FFFFFF",
  },
  textInactive: {
    color: "#94A3B8",
  },
  fieldGroup: {
    gap: 5,
  },
  roleGrid: {
    flexDirection: "row",
    gap: 5,
  },
  roleCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#233653",
    backgroundColor: "#152238",
  },
  roleLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  roleDesc: {
    fontSize: 8.5,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#152238",
    borderWidth: 1,
    borderColor: "#233653",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#F8FAFC",
  },
  forgotLink: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#3B82F6",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.35)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: {
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    color: "#EF4444",
    flex: 1,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    height: 50,
    borderRadius: 12,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#233653",
  },
  dividerText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#64748B",
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#152238",
    borderColor: "#233653",
    borderWidth: 1,
    height: 50,
    borderRadius: 12,
  },
  googleBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
  },
  securityIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 12,
  },
  securityText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
    textAlign: "center",
  },
  webPortalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
  },
  webPortalText: {
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
    color: "#64748B",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#111C2E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#233653",
    padding: 20,
    paddingBottom: 36,
    gap: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignSelf: "center",
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
  },
  modalSubtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    lineHeight: 18,
  },
  msgBanner: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
});
