import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth } from "@/config/firebase";
import { OFMBrandLogo } from "@/components/OFMBrandLogo";
import { OFM_BRAND } from "@/constants/brand";
import { type UserRole } from "@/context/AuthContext";
import { getGoogleRedirectResult } from "@/services/googleRedirectResult";
import { buildNativeGoogleCallback, validateNativeGoogleRedirect, normalizeGoogleRole, isGooglePopupCancellation, googleAuthErrorMessage, withAuthTimeout } from "@/services/googleAuthFlow";
import { SvgGoogle, SvgAlertCircle, SvgCheck, SvgExternalLink } from "@/components/web/SvgIcons";

export default function GoogleAuthBridgeWebScreen() {
  const [status, setStatus] = useState<"initial" | "loading" | "redirecting" | "success" | "error">("initial");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [deepLinkUrl, setDeepLinkUrl] = useState<string>("");
  const [role, setRole] = useState<UserRole>("admin");
  const [targetRedirectUri, setTargetRedirectUri] = useState<string>("");
  const [callbackState, setCallbackState] = useState("");
  const started = useRef(false);

  const createProvider = () => {
    const provider = new GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    provider.setCustomParameters({ prompt: "select_account" });
    return provider;
  };

  const handleAuthSuccess = (res: any, userRole: UserRole, customRedirect: string, state: string) => {
    try {
      const credential = GoogleAuthProvider.credentialFromResult(res);
      const finalUrl = buildNativeGoogleCallback(customRedirect || "ofm-app://login", credential || {}, userRole, state);
      setDeepLinkUrl(finalUrl);
      setStatus("success");
      // Return immediately; the manual button remains available if the OS blocks navigation.
      window.location.replace(finalUrl);
    } catch (error: any) {
      setStatus("error");
      setErrorMessage(googleAuthErrorMessage(error));
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const targetRole = normalizeGoogleRole(params.get("role"));
    const customRedirect = params.get("redirect_uri") || "ofm-app://login";
    const state = params.get("state") || "";
    setRole(targetRole);
    setTargetRedirectUri(customRedirect);
    setCallbackState(state);
    const attemptKey = "ofm_google_bridge_attempt:" + state;

    const resume = async () => {
      try {
        validateNativeGoogleRedirect(customRedirect);
        setStatus("loading");
        const result = await withAuthTimeout(getGoogleRedirectResult(auth), 20000, "Could not restore Google sign-in. Check your connection and try again.");
        if (result) {
          try { sessionStorage.removeItem(attemptKey); } catch {}
          handleAuthSuccess(result, targetRole, customRedirect, state);
          return;
        }
        // An app-originated request uses a full browser redirect, avoiding a second
        // popup gesture and popup blockers inside Android/iOS authentication sessions.
        let attempted = true;
        try { attempted = sessionStorage.getItem(attemptKey) === "1"; } catch {}
        if (state && !attempted) {
          sessionStorage.setItem(attemptKey, "1");
          await signInWithRedirect(auth, createProvider());
          return;
        }
        setStatus("initial");
      } catch (error: any) {
        setStatus("error");
        setErrorMessage(googleAuthErrorMessage(error));
      }
    };
    void resume();
  }, []);

  const handleSignIn = async () => {
    try {
      setStatus("loading");
      setErrorMessage("");
      validateNativeGoogleRedirect(targetRedirectUri || "ofm-app://login");
      const provider = createProvider();

      try {
        const res = await signInWithPopup(auth, provider);
        if (res) {
          handleAuthSuccess(res, role, targetRedirectUri, callbackState);
        }
      } catch (popupErr: any) {
        if (isGooglePopupCancellation(popupErr)) {
          setStatus("initial");
          return;
        }
        // A redirect cannot fix configuration or network errors.
        if (popupErr.code === "auth/popup-blocked") {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(googleAuthErrorMessage(err));
    }
  };

  const handleManualReturn = () => {
    if (deepLinkUrl) {
      window.location.href = deepLinkUrl;
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#060D1F" }} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <OFMBrandLogo size={68} />
        <Text style={styles.brandTitle}>{OFM_BRAND.fullName}</Text>
        <Text style={styles.brandSub}>{OFM_BRAND.shortName} Enterprise Cloud Authentication</Text>

        <View style={styles.divider} />

        {(status === "initial" || status === "error") && (
          <View style={styles.centerSection}>
            {status === "error" && (
              <View style={styles.errorBanner}>
                <SvgAlertCircle size={15} color="#F43F5E" />
                <Text style={styles.errorBannerText}>{errorMessage || "Authentication required"}</Text>
              </View>
            )}

            <Text style={styles.promptText}>
              Sign in with your verified organizational Google Account to access OFM Cloud.
            </Text>

            <TouchableOpacity style={styles.googleBtn} accessibilityRole="button" onPress={handleSignIn} activeOpacity={0.85}>
              <View style={styles.googleIconBox}>
                <SvgGoogle size={19} />
              </View>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "loading" && (
          <View style={styles.centerSection}>
            <ActivityIndicator color="#38BDF8" size="large" />
            <Text style={styles.statusTitle}>Connecting to Google...</Text>
            <Text style={styles.statusDesc}>
              Please select your account in the authentication window.
            </Text>
          </View>
        )}

        {status === "redirecting" && (
          <View style={styles.centerSection}>
            <ActivityIndicator color="#4ADE80" size="large" />
            <Text style={[styles.statusTitle, { color: "#4ADE80" }]}>Authentication Verified ✔</Text>
            <Text style={styles.statusDesc}>Returning to your OFM application...</Text>
          </View>
        )}

        {status === "success" && (
          <View style={styles.centerSection}>
            <View style={styles.successIconWrap}>
              <SvgCheck size={24} color="#4ADE80" />
            </View>
            <Text style={[styles.statusTitle, { color: "#4ADE80" }]}>Authentication Complete</Text>
            <Text style={styles.statusDesc}>
              If your application did not open automatically, tap below:
            </Text>
            <TouchableOpacity style={styles.actionBtn} onPress={handleManualReturn} activeOpacity={0.85}>
              <SvgExternalLink size={16} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Open OFM App</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#060D1F",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    minHeight: "100%",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#0F172A",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.22)",
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
  },
  brandTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 14,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  brandSub: {
    color: "#94A3B8",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 3,
    textAlign: "center",
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 18,
  },
  centerSection: {
    alignItems: "center",
    gap: 14,
    width: "100%",
  },
  promptText: {
    color: "#94A3B8",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  googleIconBox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  googleBtnText: {
    color: "#0F172A",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(244, 63, 94, 0.12)",
    borderColor: "rgba(244, 63, 94, 0.4)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    width: "100%",
  },
  errorBannerText: {
    color: "#FB7185",
    fontSize: 12.5,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  statusTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginTop: 4,
  },
  statusDesc: {
    color: "#94A3B8",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  successIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    borderWidth: 1,
    borderColor: "#4ADE80",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 4,
    width: "100%",
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
});
