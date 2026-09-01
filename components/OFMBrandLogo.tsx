import React from "react";
import { View, StyleSheet, Text, StyleProp, ViewStyle, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface OFMBrandLogoProps {
  size?: number;
  showText?: boolean;
  style?: StyleProp<ViewStyle>;
  customLogoUrl?: string;
  theme?: "dark" | "light";
}

export function OFMBrandLogo({
  size = 42,
  showText = false,
  style,
  customLogoUrl,
  theme = "dark",
}: OFMBrandLogoProps) {
  const hasCustom = Boolean(customLogoUrl && customLogoUrl.trim() !== "");

  if (hasCustom) {
    return (
      <View
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.26),
            backgroundColor: "#FFFFFF",
            padding: 2,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
          },
          style,
        ]}
      >
        <Image
          source={{ uri: customLogoUrl }}
          style={{ width: "100%", height: "100%", borderRadius: Math.round(size * 0.22) }}
          resizeMode="contain"
        />
      </View>
    );
  }

  const iconScale = Math.max(Math.round(size * 0.52), 14);

  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 10 }, style]}>
      {/* Premium Master OFM Emblem Box */}
      <View
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.26),
            overflow: "hidden",
            borderWidth: 1.2,
            borderColor: "rgba(59, 130, 246, 0.4)",
            shadowColor: "#2563EB",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 8,
            elevation: 6,
          },
        ]}
      >
        <Image
          source={require("@/assets/images/icon.png")}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      </View>

      {showText && (
        <View style={{ gap: 1 }}>
          <Text
            style={{
              fontSize: Math.max(Math.round(size * 0.42), 14),
              fontFamily: "Inter_700Bold",
              color: theme === "dark" ? "#F8FAFC" : "#0F172A",
              letterSpacing: 0.5,
            }}
          >
            OFM
          </Text>
          <Text
            style={{
              fontSize: Math.max(Math.round(size * 0.24), 10),
              fontFamily: "Inter_500Medium",
              color: theme === "dark" ? "#94A3B8" : "#64748B",
            }}
          >
            Organization Finance Management
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  centerWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
