import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Platform } from "react-native";
import { OFMBrandLogo } from "@/components/OFMBrandLogo";
import { OFM_BRAND } from "@/constants/brand";
import { SvgX } from "@/components/web/SvgIcons";

export function OpenInAppBanner() {
  const { width } = useWindowDimensions();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const isMobileViewport = width < 960;
    const wasDismissed = sessionStorage.getItem("ofm_app_banner_dismissed") === "true";
    if (isMobileViewport && !wasDismissed) {
      setDismissed(false);
    } else {
      setDismissed(true);
    }
  }, [width]);

  if (dismissed || Platform.OS !== "web") return null;

  const handleOpenApp = () => {
    if (typeof window !== "undefined") {
      // Direct deep link invocation to open the native iOS / Android app
      try {
        window.location.href = "ofm-app://";
      } catch (e) {
        console.log("Deep link notice:", e);
      }
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("ofm_app_banner_dismissed", "true");
    }
  };

  return (
    <View style={styles.banner}>
      <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <SvgX size={16} color="#94A3B8" />
      </TouchableOpacity>

      <View style={styles.brandGroup}>
        <OFMBrandLogo size={34} />
        <View style={styles.textGroup}>
          <Text style={styles.appName} numberOfLines={1}>{OFM_BRAND.shortName} App</Text>
          <Text style={styles.tagline} numberOfLines={1}>{OFM_BRAND.fullName}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.openBtn} onPress={handleOpenApp} activeOpacity={0.85}>
        <Text style={styles.openBtnText}>Open</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#0A1128",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(56, 189, 248, 0.2)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: "100%",
    zIndex: 99999,
  },
  closeBtn: {
    padding: 4,
    marginRight: 6,
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  textGroup: {
    flex: 1,
  },
  appName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  tagline: {
    color: "#94A3B8",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  openBtn: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  openBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
});
