import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { UserRole, useAuth, ROLE_PERMISSIONS } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { OFMBrandLogo } from "@/components/OFMBrandLogo";
import { OpenInAppBanner } from "@/components/web/OpenInAppBanner";
import { GoogleIcon } from "@/components/GoogleIcon";
import {
  SvgMail,
  SvgLock,
  SvgUser,
  SvgBriefcase,
  SvgEye,
  SvgEyeOff,
  SvgShield,
  SvgDollar,
  SvgChart,
  SvgAlertCircle,
  SvgX,
} from "@/components/web/SvgIcons";

type ScreenMode = "signin" | "signup";

const SIGNUP_ROLES: { id: UserRole; label: string; desc: string; icon: (c: string) => React.ReactNode }[] = [
  { id: "admin", label: "Admin", desc: "Create Organization", icon: (c) => <SvgShield size={14} color={c} /> },
  { id: "accountant", label: "Accountant", desc: "Ledgers & Cash", icon: (c) => <SvgDollar size={14} color={c} /> },
  { id: "manager", label: "Manager", desc: "Reports & Approvals", icon: (c) => <SvgChart size={14} color={c} /> },
  { id: "employee", label: "Employee", desc: "Expense Claims", icon: (c) => <SvgUser size={14} color={c} /> },
];

export default function WebLoginScreen() {
  const colors = useColors();
  const { login, loginWithGoogle, signUp, forgotPassword } = useAuth();

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

  const switchMode = (m: ScreenMode) => {
    setMode(m);
    setError("");
    setName("");
    setOrgNameOrInvite("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    const success = await login(cleanEmail, password);
    setLoading(false);
    if (success) {
      router.replace("/(tabs)");
    } else {
      setError("Incorrect email or password. Please try again.");
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
      router.replace("/(tabs)");
    } else {
      setError(result.error || "Failed to create account. Please try again.");
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const success = await loginWithGoogle();
      setLoading(false);
      if (success) {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setLoading(false);
      setError(e.message || "Google sign-in was cancelled.");
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
    } else {
      setForgotMsg({ type: "error", text: result.error || "Could not send reset email. Please verify address." });
    }
  };

  const { width } = useWindowDimensions();
  const isMobile = width < 960;

  return (
    <View style={{ flex: 1, backgroundColor: "#07101F", minHeight: "100%" }}>
      <OpenInAppBanner />
      <View style={[styles.root, { flexDirection: isMobile ? "column" : "row" }]}>
        {/* ─── LEFT SHOWCASE HERO PANEL (DESKTOP) ─── */}
        {!isMobile && (
          <View style={styles.leftHeroPanel}>
            <View style={styles.ambientGlow} />

            <View style={styles.heroBrandRow}>
              <OFMBrandLogo size={52} />
              <View>
                <Text style={styles.heroBrandTitle}>Organization Finance Management</Text>
                <Text style={styles.heroBrandSubtitle}>OFM Enterprise Cloud</Text>
              </View>
            </View>

            <View style={styles.heroMainContent}>
              <Text style={styles.heroHeadline}>
                Manage your organization’s finances with clarity and control.
              </Text>
              <Text style={styles.heroDesc}>
                Enterprise financial administration, double-entry general ledgers, departmental cost-center budget ceilings, and real-time cloud synchronization.
              </Text>

              {/* Key Capabilities List */}
              <View style={styles.featuresList}>
                <View style={styles.featureRow}>
                  <View style={styles.featureDot} />
                  <Text style={styles.featureText}>Role-based access & granular permissions</Text>
                </View>
                <View style={styles.featureRow}>
                  <View style={styles.featureDot} />
                  <Text style={styles.featureText}>Real-time general ledger & certified audit trail</Text>
                </View>
                <View style={styles.featureRow}>
                  <View style={styles.featureDot} />
                  <Text style={styles.featureText}>Departmental cost center budget ceilings & alerts</Text>
                </View>
                <View style={styles.featureRow}>
                  <View style={styles.featureDot} />
                  <Text style={styles.featureText}>Automated staff payroll & disbursement records</Text>
                </View>
              </View>
            </View>

            <View style={styles.heroFooter}>
              <View style={styles.cloudBadge}>
                <View style={styles.greenPulseDot} />
                <Text style={styles.cloudBadgeText}>ENTERPRISE CLOUD ENCRYPTION ACTIVE</Text>
              </View>
            </View>
          </View>
        )}

        {/* ─── RIGHT AUTHENTICATION FORM PANEL ─── */}
        <View style={[styles.rightFormPanel, isMobile && { padding: 16, width: "100%" }]}>
          <ScrollView
            contentContainerStyle={[
              styles.formScrollContent,
              isMobile && { paddingVertical: 20, paddingBottom: 60 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {isMobile && (
              <View style={styles.mobileHeader}>
                <OFMBrandLogo size={56} />
                <Text style={styles.mobileBrandTitle}>Organization Finance Management</Text>
                <Text style={styles.mobileBrandSubtitle}>Secure financial management for your organization</Text>
              </View>
            )}

            <View style={[styles.authCard, isMobile && { padding: 18 }]}>
              {/* Header */}
              <View style={{ gap: 3, marginBottom: 4 }}>
                <Text style={styles.formTitle}>
                  {mode === "signin" ? "Sign In" : "Create Account"}
                </Text>
                <Text style={styles.formSubtitle}>
                  {mode === "signin"
                    ? "Enter your credentials to access your organization's workspace"
                    : "Register your administrative profile and financial workspace"}
                </Text>
              </View>

              {/* Segmented Switcher */}
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeBtn, mode === "signin" && styles.modeBtnActive]}
                  onPress={() => switchMode("signin")}
                >
                  <Text style={[styles.modeBtnText, mode === "signin" ? styles.textActive : styles.textInactive]}>
                    Sign In
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeBtn, mode === "signup" && styles.modeBtnActive]}
                  onPress={() => switchMode("signup")}
                >
                  <Text style={[styles.modeBtnText, mode === "signup" ? styles.textActive : styles.textInactive]}>
                    Create Account
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Role Selection (Sign Up only) */}
              {mode === "signup" && (
                <View style={styles.formGroup}>
                  <Text style={styles.sectionLabel}>ASSIGNED ROLE & PERMISSIONS</Text>
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
                          onPress={() => setSelectedRole(r.id)}
                        >
                          {r.icon(activeColor)}
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
                <View style={styles.formGroup}>
                  <Text style={styles.sectionLabel}>FULL NAME</Text>
                  <View style={styles.inputWrap}>
                    <SvgUser size={15} color="#94A3B8" />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your full name"
                      placeholderTextColor="#64748B"
                      value={name}
                      onChangeText={setName}
                    />
                  </View>
                </View>
              )}

              {/* Organization Name / Invite Code (Sign Up only) */}
              {mode === "signup" && (
                <View style={styles.formGroup}>
                  <Text style={styles.sectionLabel}>
                    {selectedRole === "admin" ? "ORGANIZATION NAME" : "INVITE CODE (ADMIN'S EMAIL)"}
                  </Text>
                  <View style={styles.inputWrap}>
                    <SvgBriefcase size={15} color="#94A3B8" />
                    <TextInput
                      style={styles.input}
                      placeholder={selectedRole === "admin" ? "Enter your organization name" : "admin@organization.com"}
                      placeholderTextColor="#64748B"
                      value={orgNameOrInvite}
                      onChangeText={setOrgNameOrInvite}
                    />
                  </View>
                </View>
              )}

              {/* Email Field */}
              <View style={styles.formGroup}>
                <Text style={styles.sectionLabel}>{mode === "signup" ? "WORK EMAIL" : "EMAIL ADDRESS"}</Text>
                <View style={styles.inputWrap}>
                  <SvgMail size={15} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email address"
                    placeholderTextColor="#64748B"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
              </View>

              {/* Password Field */}
              <View style={styles.formGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.sectionLabel}>PASSWORD</Text>
                  {mode === "signin" && (
                    <TouchableOpacity onPress={() => { setForgotEmail(email); setForgotMsg(null); setForgotModal(true); }}>
                      <Text style={styles.forgotLink}>Forgot password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.inputWrap}>
                  <SvgLock size={15} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="#64748B"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                      <SvgEyeOff size={16} color="#94A3B8" />
                    ) : (
                      <SvgEye size={16} color="#94A3B8" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password Field (Signup only) */}
              {mode === "signup" && (
                <View style={styles.formGroup}>
                  <Text style={styles.sectionLabel}>CONFIRM PASSWORD</Text>
                  <View style={styles.inputWrap}>
                    <SvgLock size={15} color="#94A3B8" />
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm your password"
                      placeholderTextColor="#64748B"
                      secureTextEntry={!showConfirmPassword}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                      {showConfirmPassword ? (
                        <SvgEyeOff size={16} color="#94A3B8" />
                      ) : (
                        <SvgEye size={16} color="#94A3B8" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Error Banner */}
              {error ? (
                <View style={styles.errorBanner}>
                  <SvgAlertCircle size={15} color="#EF4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Main Submit CTA */}
              <TouchableOpacity
                style={[styles.submitBtn, loading && { opacity: 0.75 }]}
                onPress={mode === "signin" ? handleLogin : handleSignUp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {mode === "signin" ? "Sign In" : "Create Account"}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google Single Sign-On Button */}
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={handleGoogleLogin}
                disabled={loading}
              >
                <GoogleIcon size={18} />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </TouchableOpacity>
            </View>

            {/* Security Indicator */}
            <View style={styles.securityIndicator}>
              <SvgShield size={13} color="#64748B" />
              <Text style={styles.securityText}>
                Secure authentication · Role-based access · Protected organization data
              </Text>
            </View>
          </ScrollView>
        </View>

        {/* ─── Forgot Password Modal ─── */}
        <Modal visible={forgotModal} transparent animationType="fade" onRequestClose={() => setForgotModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={styles.iconWrap}>
                    <SvgLock size={16} color="#3B82F6" />
                  </View>
                  <Text style={styles.modalTitle}>Reset Password</Text>
                </View>
                <TouchableOpacity onPress={() => setForgotModal(false)}>
                  <SvgX size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 20, gap: 14 }}>
                <Text style={styles.modalSubtitle}>
                  Enter your work email address to receive password reset instructions.
                </Text>

                <View style={styles.inputWrap}>
                  <SvgMail size={15} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email address"
                    placeholderTextColor="#64748B"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                  />
                </View>

                {forgotMsg && (
                  <View style={[
                    styles.msgBanner,
                    {
                      backgroundColor: forgotMsg.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      borderColor: forgotMsg.type === "success" ? "#22C55E" : "#EF4444",
                    }
                  ]}>
                    <Text style={{
                      color: forgotMsg.type === "success" ? "#22C55E" : "#EF4444",
                      fontSize: 12.5,
                      fontFamily: "Inter_500Medium"
                    }}>
                      {forgotMsg.text}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, { marginTop: 4 }]}
                  onPress={handleForgotPassword}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitBtnText}>Send Recovery Link</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: "100%",
    width: "100%",
  },
  leftHeroPanel: {
    flex: 1.15,
    backgroundColor: "#07101F",
    padding: 48,
    justifyContent: "space-between",
    position: "relative",
    overflow: "hidden",
    borderRightWidth: 1,
    borderRightColor: "#233653",
  },
  ambientGlow: {
    position: "absolute",
    top: -120,
    left: -120,
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
  },
  heroBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    zIndex: 1,
  },
  heroBrandTitle: {
    fontSize: 17,
    fontFamily: "Inter_800ExtraBold",
    color: "#F8FAFC",
    letterSpacing: 0.3,
  },
  heroBrandSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#60A5FA",
    marginTop: 2,
  },
  heroMainContent: {
    gap: 18,
    zIndex: 1,
    marginVertical: 32,
  },
  heroHeadline: {
    fontSize: 32,
    fontFamily: "Inter_800ExtraBold",
    color: "#F8FAFC",
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  heroDesc: {
    fontSize: 14.5,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    lineHeight: 22,
  },
  featuresList: {
    gap: 10,
    marginTop: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#3B82F6",
  },
  featureText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#E2E8F0",
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#233653",
    paddingTop: 18,
    zIndex: 1,
  },
  cloudBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  greenPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  cloudBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#22C55E",
    letterSpacing: 0.5,
  },
  rightFormPanel: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  formScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    maxWidth: 420,
  },
  mobileHeader: {
    alignItems: "center",
    marginBottom: 16,
    gap: 4,
  },
  mobileBrandTitle: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    color: "#F8FAFC",
    textAlign: "center",
    marginTop: 6,
  },
  mobileBrandSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    textAlign: "center",
  },
  authCard: {
    width: "100%",
    backgroundColor: "#111C2E",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#233653",
    padding: 24,
    gap: 13,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  formTitle: {
    fontSize: 21,
    fontFamily: "Inter_800ExtraBold",
    color: "#F8FAFC",
    letterSpacing: -0.3,
  },
  formSubtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    lineHeight: 18,
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
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
  },
  modeBtnActive: {
    backgroundColor: "#3B82F6",
  },
  modeBtnText: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  textActive: {
    color: "#FFFFFF",
  },
  textInactive: {
    color: "#94A3B8",
  },
  formGroup: {
    gap: 4,
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
  sectionLabel: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#152238",
    borderWidth: 1,
    borderColor: "#233653",
    borderRadius: 11,
    paddingHorizontal: 12,
    height: 48,
    gap: 9,
  },
  input: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    color: "#F8FAFC",
    outlineStyle: "none" as any,
  },
  forgotLink: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
    color: "#3B82F6",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.35)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#EF4444",
    flex: 1,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    paddingVertical: 12,
    borderRadius: 11,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
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
    paddingVertical: 11,
    borderRadius: 11,
  },
  googleBtnText: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
  },
  securityIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 18,
  },
  securityText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#111C2E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#233653",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#233653",
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 15,
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
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
});
