import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebShell } from "@/components/web/WebShell";

export default function IndexRedirect() {
  const { user, isLoading } = useAuth();

  if (Platform.OS === "web") {
    return <WebShell />;
  }

  useEffect(() => {
    if (isLoading) return;

    AsyncStorage.getItem("ofm_onboarding_seen")
      .then((seen) => {
        if (user) {
          router.replace("/(tabs)");
        } else if (seen === "false") {
          router.replace("/onboarding");
        } else {
          router.replace("/login");
        }
      })
      .catch(() => {
        if (user) {
          router.replace("/(tabs)");
        } else {
          router.replace("/login");
        }
      });
  }, [user, isLoading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3B82F6" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
  },
});
