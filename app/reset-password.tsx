import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@/components/UniversalIcon";
import { OFMBrandLogo } from "@/components/OFMBrandLogo";
import {
  verifyResetToken,
  submitPasswordReset,
} from "@/services/passwordResetClientService";

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ oobCode?: string; token?: string }>();
  const resolveToken = (): string => {
    if (typeof window !== "undefined" && window.location) {
      if (window.location.search) {
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get("oobCode") || searchParams.get("token");
        if (code) return code.trim();
      }
      if (window.location.hash && window.location.hash.includes("?")) {
        const hashQuery = window.location.hash.split("?")[1];
        const hashParams = new URLSearchParams(hashQuery);
        const code = hashParams.get("oobCode") || hashParams.get("token");
        if (code) return code.trim();
      }
    }
    const rawTokenParam = params.oobCode || params.token || "";
    return (Array.isArray(rawTokenParam) ? rawTokenParam[0] : rawTokenParam).trim();
  };

  const token = resolveToken();

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Step 1: Verify token on initial load
  useEffect(() => {
    let isMounted = true;

    async function checkToken() {
      if (!token || !token.trim()) {
        if (isMounted) {
          setVerifying(false);
          setTokenValid(false);
          setTokenError("This password reset link is invalid.");
        }
        return;
      }

      setVerifying(true);
      setTokenError("");

      const result = await verifyResetToken(token);
      if (!isMounted) return;

      setVerifying(false);
      if (result.valid) {
        setTokenValid(true);
        if (result.email) setUserEmail(result.email);
      } else {
        setTokenValid(false);
        setTokenError(result.error || "This password reset link is invalid.");
      }
    }

    checkToken();

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Step 2: Handle password submission
  const handleSubmit = async () => {
    setError("");

    if (!password) {
      setError("Please enter a new password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const result = await submitPasswordReset(token, password, confirmPassword);
      setLoading(false);

      if (result.success) {
        setSuccessMsg(
          result.message ||
            "Your password has been successfully reset. You can now sign in with your new password."
        );
        // Automatically redirect to login after 2.5 seconds
        setTimeout(() => {
          router.replace("/login");
        }, 2500);
      } else {
        setError(result.error || "Failed to reset password. Please try again.");
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || "Something went wrong. Please try again later.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: "#07101F" }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 24) + 20,
            paddingBottom: Math.max(insets.bottom, 24) + 30,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* OFM Header Brand */}
        <View style={styles.brandHeader}>
          <OFMBrandLogo size={46} />
          <View style={{ alignItems: "center" }}>
            <Text style={styles.brandTitle}>Organization Finance Management</Text>
            <Text style={styles.brandSubtitle}>Secure Financial Management System</Text>
          </View>
        </View>

        {/* Card Container */}
        <View style={styles.card}>
          {/* State 1: Verifying Token */}
          {verifying ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.stateTitle}>Verifying Security Token...</Text>
              <Text style={styles.stateDesc}>
                Validating your secure password reset credentials.
              </Text>
            </View>
          ) : !tokenValid ? (
            /* State 2: Invalid or Expired Token */
            <View style={styles.stateWrap}>
              <View style={[styles.iconCircle, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
                <Feather name="alert-circle" size={32} color="#EF4444" />
              </View>
              <Text style={styles.stateTitle}>Reset Link Unavailable</Text>
              <Text style={styles.stateDesc}>
                {tokenError || "This password reset link is invalid."}
              </Text>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.replace("/login")}
                activeOpacity={0.85}
              >
                <Feather name="arrow-left" size={16} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Request New Reset Link</Text>
              </TouchableOpacity>
            </View>
          ) : successMsg ? (
            /* State 3: Password Reset Successful */
            <View style={styles.stateWrap}>
              <View style={[styles.iconCircle, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}>
                <Feather name="check-circle" size={32} color="#22C55E" />
              </View>
              <Text style={styles.stateTitle}>Password Reset Complete</Text>
              <Text style={styles.stateDesc}>{successMsg}</Text>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.replace("/login")}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Sign In with New Password</Text>
                <Feather name="arrow-right" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            /* State 4: Password Entry Form */
            <View style={styles.formContent}>
              <View style={styles.cardHeader}>
                <View style={styles.pillIcon}>
                  <Feather name="lock" size={18} color="#3B82F6" />
                </View>
                <View>
                  <Text style={styles.cardTitle}>Reset Your Password</Text>
                  <Text style={styles.cardSubtitle}>
                    Create a strong, new password for your account.
                  </Text>
                </View>
              </View>

              {userEmail ? (
                <View style={styles.emailPill}>
                  <Feather name="user" size={13} color="#94A3B8" />
                  <Text style={styles.emailPillText}>{userEmail}</Text>
                </View>
              ) : null}

              {/* Error Banner */}
              {error ? (
                <View style={styles.errorBanner}>
                  <Feather name="alert-circle" size={15} color="#EF4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* New Password Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                <View style={styles.inputBox}>
                  <Feather name="lock" size={16} color="#94A3B8" />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter new password (min. 8 chars)"
                    placeholderTextColor="#64748B"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={(val) => {
                      setPassword(val);
                      setError("");
                    }}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={8}
                  >
                    <Feather
                      name={showPassword ? "eye-off" : "eye"}
                      size={16}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.hintText}>Minimum 8 characters</Text>
              </View>

              {/* Confirm Password Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
                <View style={styles.inputBox}>
                  <Feather name="lock" size={16} color="#94A3B8" />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Re-enter your new password"
                    placeholderTextColor="#64748B"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={(val) => {
                      setConfirmPassword(val);
                      setError("");
                    }}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    hitSlop={8}
                  >
                    <Feather
                      name={showConfirmPassword ? "eye-off" : "eye"}
                      size={16}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 6 }]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.primaryBtnText}>Resetting Password...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryBtnText}>Reset Password</Text>
                )}
              </TouchableOpacity>

              {/* Back to Login Link */}
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.replace("/login")}
                activeOpacity={0.7}
              >
                <Feather name="arrow-left" size={14} color="#94A3B8" />
                <Text style={styles.backBtnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  brandHeader: {
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  brandTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
    textAlign: "center",
  },
  brandSubtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 2,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: "#111C2E",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#233653",
    padding: 26,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  formContent: {
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pillIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
  },
  cardSubtitle: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    marginTop: 2,
  },
  emailPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#233653",
  },
  emailPillText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#CBD5E1",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "#EF4444",
    padding: 11,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    color: "#EF4444",
    lineHeight: 17,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#94A3B8",
    letterSpacing: 0.6,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#233653",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#F8FAFC",
  },
  hintText: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
    marginLeft: 2,
  },
  primaryBtn: {
    height: 48,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: 14.5,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  backBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#94A3B8",
  },
  stateWrap: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stateTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
    textAlign: "center",
  },
  stateDesc: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 340,
    marginBottom: 8,
  },
});
