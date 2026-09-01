import React, { useState } from "react";
import { StyleSheet, View, Text, Image, Platform } from "react-native";

export function getCountryCodeFromFlag(flag: string): string {
  if (!flag) return "";
  const codePoints = Array.from(flag).map((c) => c.codePointAt(0) || 0);
  if (codePoints.length >= 2 && codePoints[0] >= 0x1F1E6 && codePoints[0] <= 0x1F1FF) {
    const first = String.fromCharCode(codePoints[0] - 0x1F1E6 + 65);
    const second = String.fromCharCode(codePoints[1] - 0x1F1E6 + 65);
    return (first + second).toLowerCase();
  }
  return "";
}

interface CountryFlagProps {
  flag: string;
  countryCode?: string;
  size?: number; // base size (width)
  style?: any;
}

export function CountryFlag({ flag, countryCode, size = 28, style }: CountryFlagProps) {
  const [imgError, setImgError] = useState(false);
  const iso = countryCode ? countryCode.toLowerCase() : getCountryCodeFromFlag(flag);

  const width = size;
  const height = Math.round((size * 3) / 4); // 4:3 standard flag proportion

  if (iso && !imgError) {
    const flagUrl = `https://flagcdn.com/w80/${iso}.png`;
    return (
      <View style={[styles.flagContainer, { width, height, borderRadius: Math.max(3, size / 8) }, style]}>
        <Image
          source={{ uri: flagUrl }}
          style={styles.flagImg}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fallbackContainer, { width, height }, style]}>
      <Text style={{ fontSize: size * 0.75, lineHeight: size * 0.85 }}>{flag}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flagContainer: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.12)",
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  flagImg: {
    width: "100%",
    height: "100%",
  },
  fallbackContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
});
