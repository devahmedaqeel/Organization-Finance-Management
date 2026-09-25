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
import { OFMBrandLogo } from "@/components/OFMBrandLogo";
import { GoogleIcon } from "@/components/GoogleIcon";

type ScreenMode = "signin" | "signup";

const SIGNUP_ROLES: { id: UserRole; label: string; desc: string; icon: string }[] = [
  { id: "admin", label: "Admin", desc: "Create Org", icon: "shield" },
  { id: "accountant", label: "Accountant", desc: "Ledgers & Cash", icon: "dollar-sign" },
  { id: "manager", label: "Manager", desc: "Reports & Approvals", icon: "bar-chart-2" },
  { id: "employee", label: "Staff", desc: "Expense Claims", icon: "user" },
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
  const scrollViewRef = useRef<ScrollView>(null);
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
      style={[styles.flex, { backgroundColor: "#07101F" }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
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
        {/* ─── Header & Enterprise Branding ─── */}
        <View style={styles.headerBox}>
          <View style={styles.logoBadgeContainer}>
            <OFMBrandLogo size={66} />
          </View>
          <Text
            style={styles.appName}
            adjustsFontSizeToFit
            numberOfLines={1}
            minimumFontScale={0.85}
          >
            Organization Finance Management
          </Text>
          <Text style={styles.subtitle}>
            Secure financial management for your organization
          </Text>
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
                Sign In
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
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`${r.label} role`}
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
            <View
              style={styles.fieldGroup}
              onLayout={(e) => {
                fieldPositions.current["name"] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <View
                style={[
                  styles.inputBox,
                  focusedField === "name" && styles.inputBoxFocused,
                ]}
              >
                <Feather
                  name="user"
                  size={17}
                  color={focusedField === "name" ? "#60A5FA" : "#94A3B8"}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your full name"
                  placeholderTextColor="#64748B"
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
                {selectedRole === "admin" ? "ORGANIZATION NAME" : "INVITE CODE (ADMIN'S EMAIL)"}
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
                  color={focusedField === "org" ? "#60A5FA" : "#94A3B8"}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder={selectedRole === "admin" ? "Enter your organization name" : "admin@organization.com"}
                  placeholderTextColor="#64748B"
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
              {mode === "signup" ? "WORK EMAIL" : "EMAIL ADDRESS"}
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
                color={focusedField === "email" ? "#60A5FA" : "#94A3B8"}
              />
              <TextInput
                style={styles.textInput}
                placeholder="Enter your email address"
                placeholderTextColor="#64748B"
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
              <Text style={styles.fieldLabel}>PASSWORD</Text>
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
                  <Text style={styles.forgotLink}>Forgot Password?</Text>
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
                color={focusedField === "password" ? "#60A5FA" : "#94A3B8"}
              />
              <TextInput
                style={styles.textInput}
                placeholder="Enter your password"
                placeholderTextColor="#64748B"
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
                  color={showPassword ? "#60A5FA" : "#94A3B8"}
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
              <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
              <View
                style={[
                  styles.inputBox,
                  focusedField === "confirm" && styles.inputBoxFocused,
                ]}
              >
                <Feather
                  name="lock"
                  size={17}
                  color={focusedField === "confirm" ? "#60A5FA" : "#94A3B8"}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Confirm your password"
                  placeholderTextColor="#64748B"
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
                    color={showConfirmPassword ? "#60A5FA" : "#94A3B8"}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={16} color="#EF4444" />
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
                  {mode === "signin" ? "Signing In..." : "Creating Account..."}
                </Text>
              </View>
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
          <Feather name="shield" size={13.5} color="#60A5FA" style={{ marginTop: 1.5 }} />
          <Text style={styles.securityText}>
            Secure authentication · Role-based access · Protected organization data
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
          <Feather name="globe" size={13.5} color="#60A5FA" />
          <Text style={styles.webPortalText}>
            Open Web Cloud Portal (ofmapp-main.web.app)
          </Text>
          <Feather name="arrow-up-right" size={12.5} color="#60A5FA" />
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
              { maxHeight: Math.min(540, windowHeight * 0.85) },
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
                  <Feather name="lock" size={16} color="#3B82F6" />
                </View>
                <Text style={styles.modalTitle}>Reset Password</Text>
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
                <Feather name="x" size={18} color="#94A3B8" />
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
                <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                <View style={[styles.inputBox, focusedField === "forgot" && styles.inputBoxFocused]}>
                  <Feather name="mail" size={17} color={focusedField === "forgot" ? "#60A5FA" : "#94A3B8"} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="name@organization.com"
                    placeholderTextColor="#64748B"
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
                        forgotMsg.type === "success" ? "#22C55E" : "#EF4444",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        forgotMsg.type === "success" ? "#22C55E" : "#EF4444",
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
                    <Text style={styles.primaryBtnText}>Sending...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryBtnText}>Send Reset Link</Text>
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
  flex: { flex: 1 },
  container: {
    paddingHorizontal: 20,
    alignItems: "center",
  },
  headerBox: {
    alignItems: "center",
    marginBottom: 20,
    gap: 6,
    width: "100%",
    maxWidth: 420,
  },
  logoBadgeContainer: {
    padding: 3,
    borderRadius: 22,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.22)",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  appName: {
    fontSize: 21,
    fontFamily: "Inter_800ExtraBold",
    color: "#F8FAFC",
    letterSpacing: -0.3,
    textAlign: "center",
    marginTop: 6,
  },
  subtitle: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 320,
    alignSelf: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#111C2E",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#233653",
    padding: 22,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 6,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "#07101F",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E2F4D",
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  modeBtnActive: {
    backgroundColor: "#3B82F6",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  modeBtnText: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  textActive: {
    color: "#FFFFFF",
  },
  textInactive: {
    color: "#94A3B8",
  },
  fieldGroup: {
    gap: 7,
  },
  roleGrid: {
    flexDirection: "row",
    gap: 6,
  },
  roleCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 3,
    borderRadius: 10,
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
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
    color: "#94A3B8",
    letterSpacing: 0.6,
  },
  forgotBtn: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  forgotLink: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
    color: "#60A5FA",
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#152238",
    borderWidth: 1.2,
    borderColor: "#233653",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 11,
  },
  inputBoxFocused: {
    borderColor: "#3B82F6",
    backgroundColor: "#15243C",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  textInput: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: "Inter_500Medium",
    color: "#F8FAFC",
    paddingVertical: 0,
  },
  eyeBtn: {
    minWidth: 40,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.35)",
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#EF4444",
    flex: 1,
    lineHeight: 18,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    height: 52,
    borderRadius: 12,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
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
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#1E2F4D",
  },
  dividerText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#64748B",
    letterSpacing: 1,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#152238",
    borderColor: "#233653",
    borderWidth: 1,
    height: 52,
    borderRadius: 12,
  },
  googleBtnText: {
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
  },
  securityIndicator: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 7,
    marginTop: 22,
    paddingHorizontal: 16,
    maxWidth: 390,
    alignSelf: "center",
  },
  securityText: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 17,
    flexShrink: 1,
  },
  webPortalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "center",
  },
  webPortalText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#64748B",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#111C2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#233653",
    padding: 22,
    paddingBottom: 36,
    gap: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignSelf: "center",
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    lineHeight: 19,
  },
  msgBanner: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
});
