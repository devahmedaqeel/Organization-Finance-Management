// TEMPORARY offline test entry — delete after testing. Seeds a LOCAL-ONLY test admin session
// (device is offline and app data is wiped afterwards, so nothing reaches Firestore).
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

export default function UiPreview() {
  useEffect(() => {
    AsyncStorage.setItem(
      "ofm_user",
      JSON.stringify({ id: "local-test-admin", name: "Test Admin", email: "test.admin@example.com", role: "admin", organization: "Test Org", organizationId: "local-test-org" })
    ).then(() => setTimeout(() => router.replace("/(tabs)"), 300));
  }, []);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Preparing offline test session…</Text>
    </View>
  );
}
