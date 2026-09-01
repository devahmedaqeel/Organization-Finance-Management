import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  Image,
} from "react-native";
import { useAuth, UserRole } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  SvgShield,
  SvgLock,
  SvgMail,
  SvgUser,
  SvgUserPlus,
  SvgLogIn,
  SvgCheck,
  SvgAlertCircle,
  SvgGoogle,
  SvgX,
  SvgGrid,
  SvgEye,
  SvgEyeOff,
} from "./SvgIcons";

const ROLE_OPTIONS: { role: UserRole; title: string; desc: string; badge: string; color: string }[] = [
  {
    role: "admin",
    title: "Organization Admin",
    desc: "Full system authority: Budgets, Ledger, Payroll, Team & Roles, System Config.",
    badge: "FULL ACCESS",
    color: "#6366F1",
  },
  {
    role: "accountant",
    title: "Financial Accountant",
    desc: "Ledger operations: Record Inflows & Grants, Expenses, Budgets & Financial Reports.",
    badge: "FINANCE OPS",
    color: "#F59E0B",
  },
  {
    role: "manager",
    title: "Department Manager",
    desc: "Cost center intelligence: Monitor Department Budgets, Expenses & AI Insights.",
    badge: "MANAGEMENT",
    color: "#8B5CF6",
  },
  {
    role: "employee",
    title: "Staff Employee",
    desc: "Self-service staff portal: Submit Expense Claims & Inspect Salary Slips.",
    badge: "SELF-SERVICE",
    color: "#10B981",
  },
];

const ROLE_ACCOUNTS = [
  { role: "admin" as UserRole, email: "admin@ofm.com", label: "Organization Admin", pass: "Admin123", color: "#6366F1" },
  { role: "accountant" as UserRole, email: "accountant@ofm.com", label: "Financial Accountant", pass: "Account123", color: "#F59E0B" },
  { role: "manager" as UserRole, email: "manager@ofm.com", label: "Department Manager", pass: "Manager123", color: "#8B5CF6" },
  { role: "employee" as UserRole, email: "employee@ofm.com", label: "Staff Member", pass: "Employee123", color: "#10B981" },
];

export function WebAuth() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { login, signUp, loginWithGoogle, forgotPassword } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [selectedRole, setSelectedRole] = useState<UserRole>("admin");

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [orgNameOrInvite, setOrgNameOrInvite] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Forgot password modal
  const [forgotModal, setForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleLogin = async (overrideEmail?: string, overridePass?: string, overrideRole?: UserRole) => {
    const targetEmail = (overrideEmail || email).trim().toLowerCase();
    const targetPass = overridePass || password;
    const targetRole = overrideRole || selectedRole;

    if (!targetEmail || !targetPass) {
      setError("Please enter your work email and password.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const success = await login(targetEmail, targetPass, targetRole);
      if (!success) {
        setError("Invalid email or password. Please verify your credentials.");
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanOrg = orgNameOrInvite.trim();

    if (!cleanName) {
      setError("Please enter your full name.");
      return;
    }
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (selectedRole === "admin" && !cleanOrg) {
      setError("Please enter your organization name.");
      return;
    }
    if (selectedRole !== "admin" && !cleanOrg) {
      setError("Please enter Admin's email as your organization invite code.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const result = await signUp(cleanName, cleanEmail, password, selectedRole, cleanOrg);
      if (!result.success) {
        setError(result.error || "Failed to create account. Please try again.");
      }
    } catch (err: any) {
      setError(err?.message || "Account creation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError("");
    try {
      await loginWithGoogle(selectedRole);
    } catch (err: any) {
      setError(err?.message || "Google authentication was cancelled or unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    const clean = forgotEmail.trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      setForgotMsg({ type: "error", text: "Please enter a valid email address." });
      return;
    }
    setForgotLoading(true);
    setForgotMsg(null);
    try {
      const res = await forgotPassword(clean);
      if (res.success) {
        setForgotMsg({ type: "success", text: "Password reset instructions sent! Please check your inbox." });
      } else {
        setForgotMsg({ type: "error", text: res.error || "Could not send password reset email." });
      }
    } catch (err: any) {
      setForgotMsg({ type: "error", text: err?.message || "Password reset request failed." });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Main Auth Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, isMobile && { padding: 18, width: "100%" }]}>
          {/* Header Brand */}
          <View style={styles.brandRow}>
            <View style={[styles.logoWrap, { backgroundColor: "transparent", borderWidth: 0, padding: 0 }]}>
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 44, height: 44, borderRadius: 10 }}
                resizeMode="cover"
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.brandTitle, { color: colors.foreground }]}>OFM</Text>
                <View style={[styles.cloudBadge, { backgroundColor: colors.primary + "18" }]}>
                  <Text style={[styles.cloudBadgeText, { color: colors.primary }]}>ENTERPRISE CLOUD</Text>
                </View>
              </View>
              <Text style={[styles.brandSubtitle, { color: colors.mutedForeground }]}>
                Organization Finance Management
              </Text>
            </View>
          </View>

          {/* Mode Switcher Tabs */}
          <View style={[styles.modeTabs, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.modeTabBtn, mode === "login" && [styles.modeTabBtnActive, { backgroundColor: colors.primary }]]}
              onPress={() => {
                setMode("login");
                setError("");
              }}
              activeOpacity={0.8}
            >
              <SvgLogIn size={15} color={mode === "login" ? "#FFFFFF" : colors.mutedForeground} />
              <Text style={[styles.modeTabText, { color: mode === "login" ? "#FFFFFF" : colors.mutedForeground }]}>
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTabBtn, mode === "signup" && [styles.modeTabBtnActive, { backgroundColor: colors.primary }]]}
              onPress={() => {
                setMode("signup");
                setError("");
              }}
              activeOpacity={0.8}
            >
              <SvgUserPlus size={15} color={mode === "signup" ? "#FFFFFF" : colors.mutedForeground} />
              <Text style={[styles.modeTabText, { color: mode === "signup" ? "#FFFFFF" : colors.mutedForeground }]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Banner */}
          {error ? (
            <View style={[styles.alertBanner, { backgroundColor: "#EF444418", borderColor: "#EF444440" }]}>
              <SvgAlertCircle size={16} color="#EF4444" />
              <Text style={[styles.alertText, { color: "#EF4444" }]}>{error}</Text>
            </View>
          ) : null}

          {/* Institutional Role Portal Switcher (Available on Sign In) */}
          {mode === "login" && (
            <View style={styles.demoSection}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>INSTITUTIONAL ROLE PORTAL (QUICK ACCESS)</Text>
              <View style={styles.demoGrid}>
                {ROLE_ACCOUNTS.map((d) => (
                  <TouchableOpacity
                    key={d.role}
                    style={[styles.demoPill, { backgroundColor: d.color + "12", borderColor: d.color + "40" }]}
                    onPress={() => {
                      setEmail(d.email);
                      setPassword(d.pass);
                      setSelectedRole(d.role);
                      handleLogin(d.email, d.pass, d.role);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.demoDot, { backgroundColor: d.color }]} />
                    <Text style={[styles.demoPillText, { color: colors.foreground }]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Role Selection for Sign Up */}
          {mode === "signup" && (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SELECT YOUR INSTITUTIONAL ROLE</Text>
              <View style={styles.roleGrid}>
                {ROLE_OPTIONS.map((r) => {
                  const isSelected = selectedRole === r.role;
                  return (
                    <TouchableOpacity
                      key={r.role}
                      style={[
                        styles.roleCard,
                        {
                          backgroundColor: isSelected ? r.color + "18" : (colors.cardAlt ?? colors.muted),
                          borderColor: isSelected ? r.color : colors.border,
                        },
                      ]}
                      onPress={() => setSelectedRole(r.role)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={[styles.roleCardTitle, { color: isSelected ? r.color : colors.foreground }]}>
                          {r.title}
                        </Text>
                        <View style={[styles.roleBadge, { backgroundColor: r.color + "25" }]}>
                          <Text style={[styles.roleBadgeText, { color: r.color }]}>{r.badge}</Text>
                        </View>
                      </View>
                      <Text style={[styles.roleCardDesc, { color: colors.mutedForeground }]}>{r.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Form Inputs */}
          <View style={styles.formWrap}>
            {mode === "signup" && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>Full Name</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <SvgUser size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.inputField, { color: colors.foreground }]}
                    placeholder="Dr. Ahmed Aqeel"
                    placeholderTextColor={colors.mutedForeground}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {mode === "signup" && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>
                  {selectedRole === "admin" ? "Organization Name" : "Admin Email (Invite Code)"}
                </Text>
                <View style={[styles.inputBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <SvgGrid size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.inputField, { color: colors.foreground }]}
                    placeholder={selectedRole === "admin" ? "Organization Finance Management" : "admin@ofm.com"}
                    placeholderTextColor={colors.mutedForeground}
                    value={orgNameOrInvite}
                    onChangeText={setOrgNameOrInvite}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>Work Email</Text>
              <View style={[styles.inputBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <SvgMail size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.inputField, { color: colors.foreground }]}
                  placeholder="name@organization.com"
                  placeholderTextColor={colors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>Password</Text>
                {mode === "login" && (
                  <TouchableOpacity onPress={() => setForgotModal(true)}>
                    <Text style={{ fontSize: 11.5, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                      Forgot Password?
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={[styles.inputBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <SvgLock size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.inputField, { color: colors.foreground }]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((p) => !p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 4 }}
                >
                  {showPassword ? (
                    <SvgEyeOff size={16} color={colors.mutedForeground} />
                  ) : (
                    <SvgEye size={16} color={colors.mutedForeground} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {mode === "signup" && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>Confirm Password</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
                  <SvgLock size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.inputField, { color: colors.foreground }]}
                    placeholder="••••••••"
                    placeholderTextColor={colors.mutedForeground}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword((p) => !p)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 4 }}
                  >
                    {showConfirmPassword ? (
                      <SvgEyeOff size={16} color={colors.mutedForeground} />
                    ) : (
                      <SvgEye size={16} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Primary Action Button */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={mode === "login" ? () => handleLogin() : handleSignUp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {mode === "login" ? "Sign In to Dashboard" : `Create ${selectedRole.toUpperCase()} Account`}
                </Text>
              )}
            </TouchableOpacity>

            {/* Google OAuth Button */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>OR CONTINUE WITH</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <TouchableOpacity
              style={[styles.googleBtn, { backgroundColor: colors.cardAlt ?? colors.muted, borderColor: colors.border }]}
              onPress={handleGoogleAuth}
              disabled={loading}
              activeOpacity={0.8}
            >
              <SvgGoogle size={18} />
              <Text style={[styles.googleBtnText, { color: colors.foreground }]}>Sign in with Google</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal visible={forgotModal} transparent animationType="fade" onRequestClose={() => setForgotModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.forgotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.forgotTitle, { color: colors.foreground }]}>Reset Password</Text>
              <TouchableOpacity onPress={() => setForgotModal(false)}>
                <SvgX size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 4 }}>
              Enter your registered work email to receive password reset instructions.
            </Text>

            {forgotMsg && (
              <View
                style={[
                  styles.alertBanner,
                  {
                    backgroundColor: forgotMsg.type === "success" ? "#10B98118" : "#EF444418",
                    borderColor: forgotMsg.type === "success" ? "#10B98140" : "#EF444440",
                  },
                ]}
              >
                <Text style={{ color: forgotMsg.type === "success" ? "#10B981" : "#EF4444", fontSize: 12 }}>
                  {forgotMsg.text}
                </Text>
              </View>
            )}

            <View style={[styles.inputBox, { backgroundColor: colors.input, borderColor: colors.border, marginTop: 12 }]}>
              <SvgMail size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputField, { color: colors.foreground }]}
                placeholder="name@organization.com"
                placeholderTextColor={colors.mutedForeground}
                value={forgotEmail}
                onChangeText={setForgotEmail}
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
              onPress={handleForgotSubmit}
              disabled={forgotLoading}
            >
              {forgotLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitBtnText}>Send Reset Link</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: "100%" },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 520, borderRadius: 24, borderWidth: 1, padding: 32, gap: 18, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 24 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  logoWrap: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  brandTitle: { fontSize: 22, fontFamily: "Inter_800ExtraBold", letterSpacing: 0.2 },
  cloudBadge: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 },
  cloudBadgeText: { fontSize: 9, fontFamily: "Inter_800ExtraBold", letterSpacing: 0.7 },
  brandSubtitle: { fontSize: 12.5, fontFamily: "Inter_500Medium", marginTop: 2 },
  modeTabs: { flexDirection: "row", padding: 4, borderRadius: 14, borderWidth: 1, gap: 4 },
  modeTabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeTabBtnActive: { elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
  modeTabText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  alertText: { fontSize: 12.5, fontFamily: "Inter_500Medium", flex: 1 },
  fieldLabel: { fontSize: 10.5, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  demoSection: { gap: 8 },
  demoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  demoPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  demoDot: { width: 7.5, height: 7.5, borderRadius: 4 },
  demoPillText: { fontSize: 11.5, fontFamily: "Inter_600SemiBold" },
  roleGrid: { gap: 8 },
  roleCard: { padding: 12, borderRadius: 14, borderWidth: 1.2, gap: 4 },
  roleCardTitle: { fontSize: 13.5, fontFamily: "Inter_700Bold" },
  roleBadge: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 },
  roleBadgeText: { fontSize: 9, fontFamily: "Inter_800ExtraBold" },
  roleCardDesc: { fontSize: 11.5, lineHeight: 15 },
  formWrap: { gap: 14 },
  inputGroup: { gap: 5 },
  inputLabel: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  inputBox: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, height: 46, borderRadius: 12, borderWidth: 1 },
  inputField: { flex: 1, fontSize: 13.5, fontFamily: "Inter_500Medium" },
  submitBtn: { height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
  submitBtnText: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_700Bold" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 6 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
  googleBtn: { height: 46, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleBtnText: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 20 },
  forgotCard: { width: "100%", maxWidth: 440, borderRadius: 20, borderWidth: 1, padding: 26, gap: 10, elevation: 8 },
  forgotTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
});
