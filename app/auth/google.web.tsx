import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { auth } from "@/config/firebase";
import { OFMBrandLogo } from "@/components/OFMBrandLogo";
import { OFM_BRAND } from "@/constants/brand";
import { UserRole } from "@/context/AuthContext";
import { SvgGoogle, SvgAlertCircle, SvgCheck, SvgExternalLink } from "@/components/web/SvgIcons";

export default function GoogleAuthBridgeWebScreen() {
  const [status, setStatus] = useState<"initial" | "loading" | "redirecting" | "success" | "error">("initial");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [deepLinkUrl, setDeepLinkUrl] = useState<string>("");
  const [role, setRole] = useState<UserRole>("admin");
  const [targetRedirectUri, setTargetRedirectUri] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const targetRole = (urlParams.get("role") as UserRole) || "admin";
    const customRedirect = urlParams.get("redirect_uri") || "";
    setRole(targetRole);
    setTargetRedirectUri(customRedirect);

    const checkRedirectResult = async () => {
      try {
        const redirectRes = await getRedirectResult(auth);
        if (redirectRes) {
          handleAuthSuccess(redirectRes, targetRole, customRedirect);
        }
      } catch (err: any) {
        console.error("Google Auth Redirect Check Error:", err);
      }
    };

    checkRedirectResult();
  }, []);

  const handleAuthSuccess = (res: any, userRole: UserRole, customRedirect?: string) => {
    try {
      const credential = GoogleAuthProvider.credentialFromResult(res);
      const idToken = credential?.idToken || "";
      const accessToken = credential?.accessToken || "";

      let finalUrl = "";
      const baseRedirect = customRedirect || targetRedirectUri;

      if (baseRedirect && baseRedirect.trim() !== "") {
        const joinChar = baseRedirect.includes("?") ? "&" : "?";
        finalUrl = `${baseRedirect}${joinChar}idToken=${encodeURIComponent(idToken)}&accessToken=${encodeURIComponent(accessToken)}&role=${userRole}`;
      } else {
        finalUrl = `ofm-app://login?idToken=${encodeURIComponent(idToken)}&accessToken=${encodeURIComponent(accessToken)}&role=${userRole}`;
      }

      setDeepLinkUrl(finalUrl);
      setStatus("redirecting");

      // Attempt clean redirect to app
      setTimeout(() => {
        try {
          window.location.href = finalUrl;
        } catch (e) {}
        setStatus("success");
      }, 500);
    } catch (e: any) {
      console.error("Failed to build callback link:", e);
      setStatus("error");
      setErrorMessage("Could not parse authentication token.");
    }
  };

  const handleSignIn = async () => {
    try {
      setStatus("loading");
      setErrorMessage("");
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");
      provider.setCustomParameters({ prompt: "select_account" });

      try {
        const res = await signInWithPopup(auth, provider);
        if (res) {
          handleAuthSuccess(res, role, targetRedirectUri);
        }
      } catch (popupErr: any) {
        if (popupErr.code === "auth/popup-blocked") {
          // If popup is blocked by mobile browser, seamlessly use redirect
          await signInWithRedirect(auth, provider);
          return;
        }
        if (popupErr.code === "auth/popup-closed-by-user" || popupErr.code === "auth/cancelled-popup-request") {
          setStatus("initial");
          return;
        }
        throw popupErr;
      }
    } catch (err: any) {
      console.error("Google Sign-in Error:", err);
      if (err.code === "auth/unauthorized-domain") {
        setStatus("error");
        setErrorMessage("Domain not authorized in Firebase Console settings.");
      } else {
        setStatus("error");
        setErrorMessage(err.message || "Failed to authenticate with Google.");
      }
    }
  };

  const handleManualReturn = () => {
    if (deepLinkUrl) {
      window.location.href = deepLinkUrl;
    }
  };

  return (
    <View style={styles.container}>
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

            <TouchableOpacity style={styles.googleBtn} onPress={handleSignIn} activeOpacity={0.85}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
