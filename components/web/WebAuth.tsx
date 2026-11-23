import React, { useState, useEffect } from "react";
import { BrandMark } from "./BrandMark";
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
  SvgTrendingUp,
  SvgPieChart,
  SvgUsers,
} from "./SvgIcons";
import { AuthIllustration } from "./AuthIllustration";
import { injectWebMicroAnimations } from "./animations/webStyles";

// RN-Web maps `dataSet` to data-* attributes; webStyles.ts styles these (glass, glow, motion)
const ofm = (key: string) => ({ dataSet: { [key]: "" } } as any);

// Fixed dark "glass" palette for the sign-in screen (independent of the in-app light/dark theme)
const AUTH_GLASS = {
  background: "#F4F5F8",
  foreground: "#1F2328",
  mutedForeground: "#5F6670",
  border: "#DCDFE4",
  card: "#FFFFFF",
  cardAlt: "#F1F2F4",
  muted: "#F1F2F4",
  input: "#FFFFFF",
  primary: "#2CA01C",
  expense: "#D52B1E",
};

const AUTH_FEATURES = [
  { title: "Income & expenses", desc: "Every transaction in one ledger, always up to date.", color: "#86EFAC", icon: "trend" },
  { title: "Department budgets", desc: "Set limits and get alerted before they're reached.", color: "#86EFAC", icon: "pie" },
  { title: "Payroll & payslips", desc: "Run salaries and send professional payslips.", color: "#86EFAC", icon: "users" },
] as const;

const ROLE_OPTIONS: { role: UserRole; title: string; desc: string; badge: string; color: string }[] = [
  {
    role: "admin",
    title: "Admin",
    desc: "Set up a new organization. Full access to everything.",
    badge: "FULL ACCESS",
    color: "#6366F1",
  },
  {
    role: "accountant",
    title: "Accountant",
    desc: "Record income, expenses, budgets and payroll.",
    badge: "FINANCE OPS",
    color: "#F59E0B",
  },
  {
    role: "manager",
    title: "Manager",
    desc: "View reports, budgets and department spending.",
    badge: "MANAGEMENT",
    color: "#8B5CF6",
  },
  {
    role: "employee",
    title: "Employee",
    desc: "See your own payslips.",
    badge: "SELF-SERVICE",
    color: "#10B981",
  },
];


export function WebAuth() {
  const colors = { ...useColors(), ...AUTH_GLASS };
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const showHero = width >= 1024;

  useEffect(() => {
    injectWebMicroAnimations();
  }, []);

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
        setForgotMsg({
          type: "success",
          text:
            res.message ||
            "If an account exists with this email address, password reset instructions have been sent.",
        });
      } else {
        setForgotMsg({
          type: "error",
          text: res.error || "Unable to send reset link. Please verify address.",
        });
      }
    } catch {
      setForgotMsg({
        type: "success",
        text: "If an account exists with this email address, password reset instructions have been sent. Please check your Inbox and Spam / Junk folder. If you registered with Google, you can sign in directly using 'Sign in with Google'.",
      });
    } finally {
      setForgotLoading(false);
    }
  };

  const isSignup = mode === "signup";
  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setError("");
    setSuccessMsg("");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, isMobile && { padding: 16 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.shell, { borderColor: colors.border, backgroundColor: colors.card }, !showHero && { maxWidth: 520 }]}>
          {/* ── Brand panel (desktop) ── */}
          {showHero && (
            <View style={styles.brandPanel}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <BrandMark size={38} />
                <View>
                  <Text style={styles.bpBrand}>OFM</Text>
                  <Text style={styles.bpBrandSub}>Organization Finance Management</Text>
                </View>
              </View>

              <View style={{ gap: 12 }}>
                <Text style={styles.bpTitle}>Your organization's finances, in one place.</Text>
                <Text style={styles.bpText}>
                  Record income and expenses, set department budgets, run payroll and share reports — on the web and on your phone.
                </Text>
              </View>

              <View style={{ gap: 14 }}>
                {AUTH_FEATURES.map((f) => (
                  <View key={f.title} style={styles.bpFeature}>
                    <View style={styles.bpFeatureIcon}>
                      {f.icon === "trend" ? (
                        <SvgTrendingUp size={16} color="#86EFAC" />
                      ) : f.icon === "pie" ? (
                        <SvgPieChart size={16} color="#86EFAC" />
                      ) : (
                        <SvgUsers size={16} color="#86EFAC" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bpFeatureTitle}>{f.title}</Text>
                      <Text style={styles.bpFeatureText}>{f.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.bpFoot}>
                <SvgShield size={13} color="rgba(255,255,255,0.6)" />
                <Text style={styles.bpFootText}>Secure sign-in · Role-based access · Synced web & mobile</Text>
              </View>
            </View>
          )}

          {/* ── Form panel ── */}
          <View style={[styles.formPanel, isMobile && { padding: 22 }]}>
            {!showHero && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <BrandMark size={36} />
                <View>
                  <Text style={[styles.brandTitle, { color: colors.foreground }]}>OFM</Text>
                  <Text style={[styles.brandSubtitle, { color: colors.mutedForeground }]}>Organization Finance Management</Text>
                </View>
              </View>
            )}

            <View style={{ gap: 4 }}>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>{isSignup ? "Create your account" : "Sign in"}</Text>
              <Text style={[styles.formSub, { color: colors.mutedForeground }]}>
                {isSignup ? "Set up your organization, or join one with an invite." : "Welcome back. Sign in to continue to your dashboard."}
              </Text>
            </View>

            {/* Tabs */}
            <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
              {([["login", "Sign in"], ["signup", "Create account"]] as const).map(([k, label]) => {
                const on = mode === k;
                return (
                  <TouchableOpacity key={k} onPress={() => switchMode(k)} style={[styles.tab, { borderBottomColor: on ? colors.primary : "transparent" }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                    <Text style={[styles.tabText, { color: on ? colors.foreground : colors.mutedForeground, fontFamily: on ? "Inter_600SemiBold" : "Inter_500Medium" }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {error ? (
              <View style={[styles.alertBanner, { backgroundColor: colors.expense + "10", borderColor: colors.expense + "40" }]} accessibilityLiveRegion="polite">
                <SvgAlertCircle size={16} color={colors.expense} />
                <Text style={[styles.alertText, { color: colors.expense }]}>{error}</Text>
              </View>
            ) : null}

            {/* Role (sign up) */}
            {isSignup && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.inputLabel, { color: colors.foreground }]}>I'm joining as</Text>
                <View style={styles.roleGrid}>
                  {ROLE_OPTIONS.map((r) => {
                    const on = selectedRole === r.role;
                    return (
                      <TouchableOpacity
                        key={r.role}
                        onPress={() => setSelectedRole(r.role)}
                        activeOpacity={0.8}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[styles.roleCard, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "0D" : colors.card }]}
                      >
                        <View style={[styles.radio, { borderColor: on ? colors.primary : colors.border }]}>
                          {on ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.roleCardTitle, { color: colors.foreground }]}>{r.title}</Text>
                          <Text style={[styles.roleCardDesc, { color: colors.mutedForeground }]}>{r.desc}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Fields */}
            <View style={styles.formWrap}>
              {isSignup && (
                <Field label="Full name" icon={<SvgUser size={16} color={colors.mutedForeground} />} colors={colors}>
                  <TextInput style={[styles.inputField, { color: colors.foreground }]} placeholder="e.g. Ahmed Aqeel" placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName} autoCapitalize="words" />
                </Field>
              )}

              {isSignup && (
                <Field
                  label={selectedRole === "admin" ? "Organization name" : "Invite code (your admin's email)"}
                  hint={selectedRole === "admin" ? "You'll be the admin of this new organization." : "Ask your admin for the email they invited you from."}
                  icon={<SvgGrid size={16} color={colors.mutedForeground} />}
                  colors={colors}
                >
                  <TextInput
                    style={[styles.inputField, { color: colors.foreground }]}
                    placeholder={selectedRole === "admin" ? "e.g. Dev Orbit Tech" : "admin@company.com"}
                    placeholderTextColor={colors.mutedForeground}
                    value={orgNameOrInvite}
                    onChangeText={setOrgNameOrInvite}
                    autoCapitalize={selectedRole === "admin" ? "words" : "none"}
                  />
                </Field>
              )}

              <Field label="Email" icon={<SvgMail size={16} color={colors.mutedForeground} />} colors={colors}>
                <TextInput
                  style={[styles.inputField, { color: colors.foreground }]}
                  placeholder="name@company.com"
                  placeholderTextColor={colors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
              </Field>

              <Field
                label="Password"
                right={!isSignup ? (
                  <TouchableOpacity onPress={() => { setForgotEmail(email); setForgotModal(true); }}>
                    <Text style={[styles.linkText, { color: colors.primary }]}>Forgot password?</Text>
                  </TouchableOpacity>
                ) : undefined}
                hint={isSignup ? "At least 6 characters." : undefined}
                icon={<SvgLock size={16} color={colors.mutedForeground} />}
                colors={colors}
              >
                <TextInput
                  style={[styles.inputField, { color: colors.foreground }]}
                  placeholder={isSignup ? "Create a password" : "Your password"}
                  placeholderTextColor={colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  onSubmitEditing={!isSignup ? () => handleLogin() : undefined}
                />
                <TouchableOpacity onPress={() => setShowPassword((p) => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }} accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <SvgEyeOff size={16} color={colors.mutedForeground} /> : <SvgEye size={16} color={colors.mutedForeground} />}
                </TouchableOpacity>
              </Field>

              {isSignup && (
                <Field label="Confirm password" icon={<SvgLock size={16} color={colors.mutedForeground} />} colors={colors}>
                  <TextInput
                    style={[styles.inputField, { color: colors.foreground }]}
                    placeholder="Type the password again"
                    placeholderTextColor={colors.mutedForeground}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoComplete="new-password"
                    onSubmitEditing={handleSignUp}
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword((p) => !p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }} accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}>
                    {showConfirmPassword ? <SvgEyeOff size={16} color={colors.mutedForeground} /> : <SvgEye size={16} color={colors.mutedForeground} />}
                  </TouchableOpacity>
                </Field>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: loading ? 0.8 : 1 }]}
                onPress={isSignup ? handleSignUp : () => handleLogin()}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {isSignup ? `Create ${ROLE_OPTIONS.find((r) => r.role === selectedRole)?.title.toLowerCase() || ""} account` : "Sign in"}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              <TouchableOpacity
                style={[styles.googleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={handleGoogleAuth}
                disabled={loading}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <SvgGoogle size={18} />
                <Text style={[styles.googleBtnText, { color: colors.foreground }]}>Continue with Google</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
              {isSignup ? "Already have an account? " : "New to OFM? "}
              <Text style={[styles.linkText, { color: colors.primary }]} onPress={() => switchMode(isSignup ? "login" : "signup")}>
                {isSignup ? "Sign in" : "Create an account"}
              </Text>
            </Text>
          </View>
        </View>

        <Text style={[styles.legal, { color: colors.mutedForeground }]}>© {new Date().getFullYear()} OFM · Organization Finance Management</Text>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal visible={forgotModal} transparent animationType="fade" onRequestClose={() => setForgotModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.forgotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.forgotTitle, { color: colors.foreground }]}>Reset your password</Text>
              <TouchableOpacity onPress={() => setForgotModal(false)}>
                <SvgX size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12.5, color: colors.mutedForeground, marginTop: 4, lineHeight: 18 }}>
              Enter your registered email address and we will send you instructions to reset your password.
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
                <Text style={{ color: forgotMsg.type === "success" ? "#108000" : colors.expense, fontSize: 12 }}>
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
              {...ofm("ofmGradientBtn")}
              style={[styles.submitBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
              onPress={handleForgotSubmit}
              disabled={forgotLoading}
            >
              {forgotLoading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.submitBtnText}>Sending…</Text>
                </View>
              ) : (
                <Text style={styles.submitBtnText}>Send reset link</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Labelled input row used by every field on the form. */
function Field({ label, hint, right, icon, colors, children }: { label: string; hint?: string; right?: React.ReactNode; icon: React.ReactNode; colors: any; children: React.ReactNode }) {
  return (
    <View style={styles.inputGroup}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={[styles.inputLabel, { color: colors.foreground }]}>{label}</Text>
        {right}
      </View>
      <View style={[styles.inputBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
        {icon}
        {children}
      </View>
      {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { width: "100%", maxWidth: 1040, flexDirection: "row", borderWidth: 1, borderRadius: 14, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 28, elevation: 6 },
  brandPanel: { width: 420, padding: 36, gap: 32, justifyContent: "space-between", backgroundColor: "#1A1C20", backgroundImage: "linear-gradient(160deg, #1A1C20 0%, #1D2A21 55%, #1B4D22 100%)" as any },
  bpBrand: { color: "#FFFFFF", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  bpBrandSub: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_400Regular" },
  bpTitle: { color: "#FFFFFF", fontSize: 28, lineHeight: 36, fontFamily: "Inter_600SemiBold", letterSpacing: -0.5 },
  bpText: { color: "rgba(255,255,255,0.75)", fontSize: 14.5, lineHeight: 22, fontFamily: "Inter_400Regular" },
  bpFeature: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  bpFeatureIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(134,239,172,0.12)" },
  bpFeatureTitle: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  bpFeatureText: { color: "rgba(255,255,255,0.68)", fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", marginTop: 2 },
  bpFoot: { flexDirection: "row", alignItems: "center", gap: 8 },
  bpFootText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular" },
  formPanel: { flex: 1, padding: 40, gap: 20, minWidth: 0 },
  formTitle: { fontSize: 24, fontFamily: "Inter_600SemiBold", letterSpacing: -0.4 },
  formSub: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  tabs: { flexDirection: "row", gap: 4, borderBottomWidth: 1 },
  tab: { paddingHorizontal: 4, paddingVertical: 10, marginRight: 16, borderBottomWidth: 2, marginBottom: -1, cursor: "pointer" as any },
  tabText: { fontSize: 14 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  linkText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  switchText: { fontSize: 13.5, fontFamily: "Inter_400Regular", textAlign: "center" },
  legal: { fontSize: 12, fontFamily: "Inter_400Regular" },
  container: { flex: 1, minHeight: "100%" },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  splitRow: { width: "100%", maxWidth: 1180, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 56 },
  heroPanel: { flex: 1, maxWidth: 560, gap: 18 },
  heroPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, backgroundColor: "rgba(255, 255, 255, 0.06)" },
  heroPillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#34D399" },
  heroPillText: { color: "rgba(226, 232, 240, 0.9)", fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
  heroTitle: { color: "#F8FAFC", fontSize: 40, lineHeight: 48, fontFamily: "Inter_800ExtraBold", letterSpacing: -1 },
  heroTitleAccent: { color: "#7DD3FC" },
  heroSubtitle: { color: "rgba(203, 213, 225, 0.82)", fontSize: 15.5, lineHeight: 24, fontFamily: "Inter_400Regular", maxWidth: 500 },
  featureList: { gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 10, borderWidth: 1, backgroundColor: "rgba(255, 255, 255, 0.05)" },
  featureIcon: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  featureTitle: { color: "#F8FAFC", fontSize: 13.5, fontFamily: "Inter_700Bold" },
  featureDesc: { color: "rgba(203, 213, 225, 0.75)", fontSize: 12, lineHeight: 17, marginTop: 1 },
  card: { width: "100%", maxWidth: 480, borderRadius: 26, borderWidth: 1, padding: 32, gap: 18 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: -2 },
  cardFooterText: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.2 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  logoWrap: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  brandTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  cloudBadge: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 },
  cloudBadgeText: { fontSize: 11, fontFamily: "Inter_800ExtraBold", letterSpacing: 0.7 },
  brandSubtitle: { fontSize: 12.5, fontFamily: "Inter_400Regular", marginTop: 1 },
  modeTabs: { flexDirection: "row", padding: 4, borderRadius: 8, borderWidth: 1, gap: 4 },
  modeTabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  modeTabBtnActive: {},
  modeTabText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 8, borderWidth: 1 },
  alertText: { fontSize: 12.5, fontFamily: "Inter_500Medium", flex: 1 },
  fieldLabel: { fontSize: 11.5, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleCard: { flexGrow: 1, flexBasis: 200, flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 8, borderWidth: 1.5 },
  roleCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  roleBadge: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 },
  roleBadgeText: { fontSize: 11, fontFamily: "Inter_800ExtraBold" },
  roleCardDesc: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  formWrap: { gap: 16 },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  inputBox: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, height: 44, borderRadius: 8, borderWidth: 1 },
  inputField: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", outlineStyle: "none" as any },
  submitBtn: { height: 46, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 4, cursor: "pointer" as any },
  submitBtnText: { color: "#FFFFFF", fontSize: 14.5, fontFamily: "Inter_600SemiBold" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
  googleBtn: { height: 44, borderRadius: 8, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer" as any },
  googleBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  forgotCard: { width: "100%", maxWidth: 440, borderRadius: 10, borderWidth: 1, padding: 26, gap: 10, elevation: 8 },
  forgotTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
});
