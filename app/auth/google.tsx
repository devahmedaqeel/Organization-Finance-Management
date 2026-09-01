import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { OFMBrandLogo } from "@/components/OFMBrandLogo";
import { OFM_BRAND } from "@/constants/brand";

export default function GoogleAuthBridgeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <OFMBrandLogo size={64} />
        <Text style={styles.title}>{OFM_BRAND.fullName}</Text>
        <Text style={styles.subtitle}>{OFM_BRAND.shortName} Enterprise Cloud</Text>
        <ActivityIndicator color="#38BDF8" size="large" style={{ marginVertical: 20 }} />
        <Text style={styles.status}>Authenticating securely...</Text>
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
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#0F172A",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 16,
    textAlign: "center",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
    textAlign: "center",
  },
  status: {
    color: "#CBD5E1",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
