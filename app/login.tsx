import { Feather } from "@/components/UniversalIcon";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserRole, useAuth } from "@/context/AuthContext";
import { BrandMark } from "@/components/web/BrandMark";
import { StatusBar } from "expo-status-bar";
import { GoogleIcon } from "@/components/GoogleIcon";

type ScreenMode = "signin" | "signup";

const SIGNUP_ROLES: { id: UserRole; label: string; desc: string; icon: string }[] = [
  { id: "admin", label: "Admin", desc: "New organization · full access", icon: "shield" },
  { id: "accountant", label: "Accountant", desc: "Income, expenses, payroll", icon: "dollar-sign" },
  { id: "manager", label: "Manager", desc: "Reports and budgets", icon: "bar-chart-2" },
  { id: "employee", label: "Employee", desc: "Own payslips", icon: "user" },
];

export default function LoginScreen() {
  const { height: windowHeight } = useWindowDimensions();
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
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Keyboard avoidance, layout measurement, and auto-scroll handling
  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const activeFieldRef = useRef<"name" | "org" | "email" | "password" | "confirm" | null>(null);
  const cardY = useRef(150);
  const fieldPositions = useRef<Record<string, number>>({});

  const scrollToActiveField = (targetField?: string) => {
    if (Platform.OS === "web") return;
    const field = targetField || activeFieldRef.current;
    if (!field || !scrollViewRef.current) return;

    const fallbackY: Record<string, number> =
      mode === "signup"
        ? { name: 320, org: 400, email: 480, password: 560, confirm: 640 }
        : { email: 250, password: 330 };

    const measuredY = fieldPositions.current[field];
    const fieldAbsoluteY =
      measuredY !== undefined ? cardY.current + measuredY : (fallbackY[field] ?? 320);

    const targetOffset = Math.max(0, fieldAbsoluteY - 60);
    scrollViewRef.current.scrollTo({ y: targetOffset, animated: true });
  };

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates.height;
      setKeyboardHeight(h);
      scrollToActiveField();
      setTimeout(() => scrollToActiveField(), 60);
      setTimeout(() => scrollToActiveField(), 180);
      setTimeout(() => scrollToActiveField(), 320);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [mode]);

  const handleInputFocus = (field: "name" | "org" | "email" | "password" | "confirm") => {
    activeFieldRef.current = field;
    setFocusedField(field);
    if (Platform.OS === "web") return;
    scrollToActiveField(field);
    setTimeout(() => scrollToActiveField(field), 60);
    setTimeout(() => scrollToActiveField(field), 180);
    setTimeout(() => scrollToActiveField(field), 320);
  };

  const handleInputBlur = (field: "name" | "org" | "email" | "password" | "confirm") => {
    if (activeFieldRef.current === field) {
      activeFieldRef.current = null;
    }
    setFocusedField((prev) => (prev === field ? null : prev));
  };

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
    setFocusedField(null);
    activeFieldRef.current = null;
    fieldPositions.current = {};
    safeHapticSelection();
  };

  const handleLogin = async (overrideEmail?: string, overridePassword?: string) => {
    const cleanEmail = (overrideEmail || email).trim();
    const cleanPass = (overridePassword || password).trim();
    if (!cleanEmail || !cleanPass) {
      setError("Please enter your email and password.");
      safeHapticNotification(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const success = await login(cleanEmail, cleanPass);
      setLoading(false);
      if (success) {
        safeHapticNotification(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)");
      } else {
        setError("Incorrect email or password. Please try again.");
        safeHapticNotification(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || "Incorrect email or password. Please try again.");
      safeHapticNotification(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleSignUp = async () => {
    const cleanName = name.trim();
    const cleanOrg = orgNameOrInvite.trim() || (selectedRole === "admin" ? `${cleanName}'s Organization` : "My Organization");
    const cleanEmail = email.trim();

    if (!cleanName) { setError("Please enter your full name."); return; }
    if (selectedRole === "admin" && !cleanOrg) { setError("Please enter your organization name."); return; }
    if (selectedRole !== "admin" && !cleanOrg) { setError("Please enter Admin's email as your invite code."); return; }
    if (!cleanEmail) { setError("Please enter your work email."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    setError("");
    try {
      const result = await signUp(cleanName, cleanEmail, password, selectedRole, cleanOrg);
      setLoading(false);
      if (result.success) {
        safeHapticNotification(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)");
      } else {
        setError(result.error || "Unable to create account. Please try again.");
        safeHapticNotification(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || "Unable to create account. Please try again.");
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
    const clean = forgotEmail.trim();
    if (!clean) {
      setForgotMsg({ type: "error", text: "Please enter your email address." });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clean)) {
      setForgotMsg({ type: "error", text: "Please enter a valid email address." });
      return;
    }
    Keyboard.dismiss();
    setForgotLoading(true);
    setForgotMsg(null);
    try {
      const result = await forgotPassword(clean);
      setForgotLoading(false);
      if (result.success) {
        setForgotMsg({
          type: "success",
          text:
            result.message ||
            "If an account exists with this email address, password reset instructions have been sent. Please check your Inbox and Spam / Junk folder. If you registered with Google, you can sign in directly using 'Continue with Google'.",
        });
        safeHapticNotification(Haptics.NotificationFeedbackType.Success);
      } else {
        setForgotMsg({
          type: "error",
          text: result.error || "Unable to send reset link. Please verify address.",
        });
        safeHapticNotification(Haptics.NotificationFeedbackType.Error);
      }
    } catch (err: any) {
      setForgotLoading(false);
      setForgotMsg({
        type: "error",
        text: err?.message || "Unable to send reset link. Please verify address.",
      });
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
      style={[styles.flex, { backgroundColor: "#F4F5F8" }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <StatusBar style="dark" />
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(insets.top, 20) + 16,
            paddingBottom:
              Math.max(insets.bottom, 16) +
              32 +
              (keyboardHeight > 0
                ? Platform.OS === "android"
                  ? keyboardHeight + 80
                  : 60
                : 0),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Brand (same logo as web) ─── */}
        <View style={styles.headerBox}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <BrandMark size={40} />
            <View>
              <Text style={styles.appName}>OFM</Text>
              <Text style={styles.subtitle}>Organization Finance Management</Text>
            </View>
          </View>
          <View style={{ gap: 4, marginTop: 22 }}>
            <Text style={styles.formTitle}>{mode === "signup" ? "Create your account" : "Sign in"}</Text>
            <Text style={styles.formSub}>
              {mode === "signup" ? "Set up your organization, or join one with an invite." : "Welcome back. Sign in to continue to your dashboard."}
            </Text>
          </View>
        </View>

        {/* ─── Authentication Card ─── */}
        <View
          style={styles.card}
          onLayout={(e) => {
            cardY.current = e.nativeEvent.layout.y;
          }}
        >
          {/* Segmented Mode Switcher */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "signin" && styles.modeBtnActive]}
              onPress={() => switchMode("signin")}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === "signin" }}
              accessibilityLabel="Sign In"
            >
              <Text style={[styles.modeBtnText, mode === "signin" ? styles.textActive : styles.textInactive]}>
                Sign in
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, mode === "signup" && styles.modeBtnActive]}
              onPress={() => switchMode("signup")}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === "signup" }}
              accessibilityLabel="Create Account"
            >
              <Text style={[styles.modeBtnText, mode === "signup" ? styles.textActive : styles.textInactive]}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Role Picker (Sign Up Mode) */}
          {mode === "signup" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>I'm joining as</Text>
              <View style={styles.roleGrid}>
                {SIGNUP_ROLES.map((r) => {
                  const isSelected = selectedRole === r.id;
                  const activeColor = isSelected ? "#2CA01C" : "#6B6C72";
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[
                        styles.roleCard,
                        isSelected && { borderColor: "#2CA01C", backgroundColor: "rgba(44, 160, 28, 0.06)" },
                      ]}
                      onPress={() => { setSelectedRole(r.id); safeHapticSelection(); }}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`${r.label} role`}
                    >
                      <View style={[styles.radio, { borderColor: isSelected ? "#2CA01C" : "#C5C9CF" }]}>
                        {isSelected ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.roleLabel, { color: "#1F2328" }]} numberOfLines={1}>{r.label}</Text>
                        <Text style={styles.roleDesc} numberOfLines={2}>{r.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Full Name (Sign Up only) */}
          {mode === "signup" && (
            <View
              style={styles.fieldGroup}
              onLayout={(e) => {
                fieldPositions.current["name"] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.fieldLabel}>Full name</Text>
              <View
                style={[
                  styles.inputBox,
                  focusedField === "name" && styles.inputBoxFocused,
                ]}
              >
                <Feather
                  name="user"
                  size={17}
                  color={focusedField === "name" ? "#2CA01C" : "#6B6C72"}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Ahmed Aqeel"
                  placeholderTextColor="#9A9CA3"
                  value={name}
                  onChangeText={(v) => { setName(v); setError(""); }}
                  onFocus={() => handleInputFocus("name")}
                  onBlur={() => handleInputBlur("name")}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>
          )}

          {/* Organization / Invite Code (Sign Up only) */}
          {mode === "signup" && (
            <View
              style={styles.fieldGroup}
              onLayout={(e) => {
                fieldPositions.current["org"] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.fieldLabel}>
                {selectedRole === "admin" ? "Organization name" : "Invite code (your admin's email)"}
              </Text>
              <View
                style={[
                  styles.inputBox,
                  focusedField === "org" && styles.inputBoxFocused,
                ]}
              >
                <Feather
                  name="briefcase"
                  size={17}
                  color={focusedField === "org" ? "#2CA01C" : "#6B6C72"}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder={selectedRole === "admin" ? "e.g. Dev Orbit Tech" : "admin@company.com"}
                  placeholderTextColor="#9A9CA3"
                  value={orgNameOrInvite}
                  onChangeText={(v) => { setOrgNameOrInvite(v); setError(""); }}
                  onFocus={() => handleInputFocus("org")}
                  onBlur={() => handleInputBlur("org")}
                  autoCapitalize={selectedRole === "admin" ? "words" : "none"}
                  returnKeyType="next"
                />
              </View>
            </View>
          )}

          {/* Email Address Field */}
          <View
            style={styles.fieldGroup}
            onLayout={(e) => {
              fieldPositions.current["email"] = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.fieldLabel}>
              Email
            </Text>
            <View
              style={[
                styles.inputBox,
                focusedField === "email" && styles.inputBoxFocused,
              ]}
            >
              <Feather
                name="mail"
                size={17}
                color={focusedField === "email" ? "#2CA01C" : "#6B6C72"}
              />
              <TextInput
                style={styles.textInput}
                placeholder="name@company.com"
                placeholderTextColor="#9A9CA3"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(v) => { setEmail(v); setError(""); }}
                onFocus={() => handleInputFocus("email")}
                onBlur={() => handleInputBlur("email")}
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Password Field */}
          <View
            style={styles.fieldGroup}
            onLayout={(e) => {
              fieldPositions.current["password"] = e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Password</Text>
              {mode === "signin" && (
                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={() => {
                    setForgotEmail(email);
                    setForgotMsg(null);
                    setForgotModal(true);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot Password?"
                >
                  <Text style={styles.forgotLink}>Forgot password?</Text>
                </TouchableOpacity>
              )}
            </View>
            <View
              style={[
                styles.inputBox,
                focusedField === "password" && styles.inputBoxFocused,
              ]}
            >
              <Feather
                name="lock"
                size={17}
                color={focusedField === "password" ? "#2CA01C" : "#6B6C72"}
              />
              <TextInput
                style={styles.textInput}
                placeholder={mode === "signup" ? "Create a password (6+ characters)" : "Your password"}
                placeholderTextColor="#9A9CA3"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(""); }}
                onFocus={() => handleInputFocus("password")}
                onBlur={() => handleInputBlur("password")}
                returnKeyType={mode === "signin" ? "done" : "next"}
                onSubmitEditing={mode === "signin" ? () => handleLogin() : undefined}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((p) => !p)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Feather
                  name={showPassword ? "eye-off" : "eye"}
                  size={18}
                  color={showPassword ? "#2CA01C" : "#6B6C72"}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password (Sign Up only) */}
          {mode === "signup" && (
            <View
              style={styles.fieldGroup}
              onLayout={(e) => {
                fieldPositions.current["confirm"] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.fieldLabel}>Confirm password</Text>
              <View
                style={[
                  styles.inputBox,
                  focusedField === "confirm" && styles.inputBoxFocused,
                ]}
              >
                <Feather
                  name="lock"
                  size={17}
                  color={focusedField === "confirm" ? "#2CA01C" : "#6B6C72"}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Type the password again"
                  placeholderTextColor="#9A9CA3"
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={(v) => { setConfirmPassword(v); setError(""); }}
                  onFocus={() => handleInputFocus("confirm")}
                  onBlur={() => handleInputBlur("confirm")}
                  returnKeyType="done"
                  onSubmitEditing={handleSignUp}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowConfirmPassword((p) => !p)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  <Feather
                    name={showConfirmPassword ? "eye-off" : "eye"}
                    size={18}
                    color={showConfirmPassword ? "#2CA01C" : "#6B6C72"}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={16} color="#D52B1E" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Primary Action CTA */}
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={mode === "signin" ? () => handleLogin() : handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={mode === "signin" ? "Sign In" : "Create Account"}
          >
            {loading ? (
              <View style={styles.btnLoadingRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.primaryBtnText}>
                  {mode === "signin" ? "Signing in…" : "Creating account…"}
                </Text>
              </View>
            ) : (
              <Text style={styles.primaryBtnText}>
                {mode === "signin" ? "Sign in" : `Create ${(SIGNUP_ROLES.find((r) => r.id === selectedRole)?.label || "").toLowerCase()} account`}
              </Text>
            )}
          </TouchableOpacity>

          {/* Clean Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign-In Button */}
          <TouchableOpacity
            style={[styles.googleBtn, loading && styles.btnDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <GoogleIcon size={19} />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Security Footer Indicator ─── */}
        <View style={styles.securityIndicator}>
          <Feather name="shield" size={13.5} color="#2CA01C" style={{ marginTop: 1.5 }} />
          <Text style={styles.securityText}>
            Secure sign-in · Role-based access
          </Text>
        </View>

        {/* ─── Open Web Cloud Portal Link ─── */}
        <TouchableOpacity
          style={styles.webPortalBtn}
          onPress={handleOpenWebPortal}
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel="Open Web Cloud Portal"
        >
          <Feather name="globe" size={13.5} color="#2CA01C" />
          <Text style={styles.webPortalText}>
            Open OFM on the web
          </Text>
          <Feather name="arrow-up-right" size={12.5} color="#2CA01C" />
        </TouchableOpacity>
      </ScrollView>

      {/* ─── Forgot Password Modal ─── */}
      <Modal
        visible={forgotModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          Keyboard.dismiss();
          setForgotModal(false);
          setForgotMsg(null);
        }}
      >
        <KeyboardAvoidingView
          style={[
            styles.modalOverlay,
            Platform.OS === "android" && keyboardHeight > 0
              ? { paddingBottom: keyboardHeight }
              : null,
          ]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          {/* Backdrop dismiss touchable */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              Keyboard.dismiss();
              setForgotModal(false);
              setForgotMsg(null);
            }}
          />

          <View
            style={[
              styles.modalSheet,
              // Clear the Android navigation bar / home indicator (the keyboard covers it while open)
              { maxHeight: Math.min(540, windowHeight * 0.85), paddingBottom: 36 + (keyboardHeight > 0 ? 0 : insets.bottom) },
              Platform.OS === "android" && keyboardHeight > 0
                ? {
                    paddingBottom: 20,
                    borderBottomLeftRadius: 20,
                    borderBottomRightRadius: 20,
                    borderBottomWidth: 1,
                  }
                : null,
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={styles.iconPill}>
                  <Feather name="lock" size={16} color="#2CA01C" />
                </View>
                <Text style={styles.modalTitle}>Reset your password</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  Keyboard.dismiss();
                  setForgotModal(false);
                  setForgotMsg(null);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close reset password dialog"
              >
                <Feather name="x" size={18} color="#6B6C72" />
              </TouchableOpacity>
            </View>

            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
            >
              <Text style={styles.modalSubtitle}>
                Enter your registered email address and we will send you instructions to reset your password.
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email</Text>
                <View style={[styles.inputBox, focusedField === "forgot" && styles.inputBoxFocused]}>
                  <Feather name="mail" size={17} color={focusedField === "forgot" ? "#2CA01C" : "#6B6C72"} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="name@organization.com"
                    placeholderTextColor="#9A9CA3"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={forgotEmail}
                    onChangeText={(v) => {
                      setForgotEmail(v);
                      setForgotMsg(null);
                    }}
                    onFocus={() => setFocusedField("forgot")}
                    onBlur={() => setFocusedField(null)}
                    returnKeyType="send"
                    onSubmitEditing={handleForgotPassword}
                  />
                </View>
              </View>

              {forgotMsg && (
                <View
                  style={[
                    styles.msgBanner,
                    {
                      backgroundColor:
                        forgotMsg.type === "success"
                          ? "rgba(34, 197, 94, 0.15)"
                          : "rgba(239, 68, 68, 0.15)",
                      borderColor:
                        forgotMsg.type === "success" ? "#108000" : "#EF4444",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        forgotMsg.type === "success" ? "#108000" : "#EF4444",
                      fontSize: 13,
                      fontFamily: "Inter_500Medium",
                      lineHeight: 19,
                    }}
                  >
                    {forgotMsg.text}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 6 }, forgotLoading && styles.btnDisabled]}
                onPress={handleForgotPassword}
                disabled={forgotLoading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Send Reset Link"
              >
                {forgotLoading ? (
                  <View style={styles.btnLoadingRow}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.primaryBtnText}>Sending…</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryBtnText}>Send reset link</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  formTitle: { color: "#1F2328", fontSize: 22, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  formSub: { color: "#5F6670", fontSize: 13.5, fontFamily: "Inter_400Regular", lineHeight: 19 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2CA01C" },
  flex: { flex: 1 },
  container: { paddingHorizontal: 20, gap: 16, flexGrow: 1 },
  headerBox: { paddingHorizontal: 4, marginBottom: 2 },
  logoBadgeContainer: { alignItems: "center" },
  appName: { color: "#1F2328", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  subtitle: { color: "#5F6670", fontSize: 12.5, fontFamily: "Inter_400Regular", marginTop: 1 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#DCDFE4", padding: 18, gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  modeToggle: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#DCDFE4", gap: 18 },
  modeBtn: { paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  modeBtnActive: { borderBottomColor: "#2CA01C" },
  modeBtnText: { fontSize: 14.5 },
  textActive: { color: "#1F2328", fontFamily: "Inter_600SemiBold" },
  textInactive: { color: "#5F6670", fontFamily: "Inter_500Medium" },
  fieldGroup: { gap: 6 },
  roleGrid: { gap: 8 },
  roleCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: "#DCDFE4", backgroundColor: "#FFFFFF" },
  roleLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  roleDesc: { color: "#5F6670", fontSize: 12.5, fontFamily: "Inter_400Regular", marginTop: 1 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: { color: "#1F2328", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  forgotBtn: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  forgotLink: { color: "#2CA01C", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  inputBox: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#DCDFE4", backgroundColor: "#FFFFFF" },
  inputBoxFocused: { borderColor: "#2CA01C", borderWidth: 1.5 },
  textInput: { flex: 1, color: "#1F2328", fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  eyeBtn: {
    minWidth: 40,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#D52B1E40", backgroundColor: "#D52B1E10" },
  errorText: { flex: 1, color: "#D52B1E", fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  primaryBtn: { height: 50, borderRadius: 10, backgroundColor: "#2CA01C", alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  btnDisabled: {
    opacity: 0.75,
  },
  btnLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 1,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#DCDFE4" },
  dividerText: { color: "#5F6670", fontSize: 13, fontFamily: "Inter_500Medium" },
  googleBtn: { height: 48, borderRadius: 10, borderWidth: 1, borderColor: "#DCDFE4", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleBtnText: { color: "#1F2328", fontSize: 14.5, fontFamily: "Inter_600SemiBold" },
  securityIndicator: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  securityText: { color: "#5F6670", fontSize: 12, fontFamily: "Inter_400Regular" },
  webPortalBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6 },
  webPortalText: { color: "#2CA01C", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "flex-end",
  },
  modalSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 14 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#DCDFE4" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconPill: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(44,160,28,0.1)" },
  modalTitle: { color: "#1F2328", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F2F4" },
  modalSubtitle: { color: "#5F6670", fontSize: 13.5, fontFamily: "Inter_400Regular", lineHeight: 20 },
  msgBanner: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
});
