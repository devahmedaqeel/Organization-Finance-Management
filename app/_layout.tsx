import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text, Platform, useColorScheme, Animated, TouchableOpacity, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// KeyboardProvider is only safe on native — loaded dynamically to avoid web crash
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { SvgBell } from "@/components/web/SvgIcons";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { FinanceProvider } from "@/context/FinanceContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { WebShell } from "@/components/web/WebShell";
import { requestNotificationPermissions } from "@/hooks/NotificationHelper";

LogBox.ignoreLogs([
  /expo-notifications: Android Push notifications/,
  /removed from Expo Go with the release of SDK 53/,
  /warnOfExpoGoPushUsage/,
]);

const queryClient = new QueryClient();

function ThemedStatusBar() {
  const deviceScheme = useColorScheme();
  const { settings } = useSettings();
  const theme = settings?.theme ?? "system";
  const resolvedScheme = theme === "system" ? (deviceScheme ?? "light") : theme;
  return <StatusBar style={resolvedScheme === "dark" ? "light" : "dark"} />;
}

import { registerToastListener, showFloatingToast } from "@/utils/toast";
export { showFloatingToast };

function GlobalToast() {
  const [toast, setToast] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: "",
    message: "",
  });

  const translateY = React.useRef(new Animated.Value(-120)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  const hideToast = React.useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    });
  }, [translateY, opacity]);

  useEffect(() => {
    const unregister = registerToastListener((title: string, message: string) => {
      setToast({ visible: true, title, message });
      translateY.setValue(-120);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });
    return unregister;
  }, [translateY, opacity]);

  useEffect(() => {
    if (toast.visible) {
      const timer = setTimeout(() => {
        hideToast();
      }, 2600); // Automatically dismisses in 2.6 seconds
      return () => clearTimeout(timer);
    }
  }, [toast.visible, hideToast]);

  if (!toast.visible) return null;

  return (
    <View style={toastStyles.toastOverlay} pointerEvents="box-none">
      <Animated.View
        style={{
          width: "100%",
          alignItems: "center",
          transform: [{ translateY }],
          opacity,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={hideToast}
          style={toastStyles.toastCard}
        >
          <View style={toastStyles.toastIconWrap}>
            <SvgBell size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={toastStyles.toastTitle} numberOfLines={1}>
              {toast.title}
            </Text>
            <Text style={toastStyles.toastMsg} numberOfLines={2}>
              {toast.message}
            </Text>
          </View>
          <TouchableOpacity
            onPress={hideToast}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={toastStyles.closeBtn}
          >
            <Feather name="x" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const toastStyles = StyleSheet.create({
  toastOverlay: {
    position: "absolute",
    top: Platform.OS === "android" ? 36 : 48,
    left: 16,
    right: 16,
    zIndex: 99999,
    alignItems: "center",
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172aFA",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
    gap: 12,
    maxWidth: 500,
    width: "100%",
  },
  toastIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
  },
  toastTitle: {
    color: "#fff",
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
  toastMsg: {
    color: "#cbd5e1",
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    lineHeight: 15,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
});

import Constants, { ExecutionEnvironment } from "expo-constants";

const isExpoGo = Constants?.executionEnvironment === ExecutionEnvironment.StoreClient;

const SafeKeyboardProvider: React.ComponentType<{ children?: React.ReactNode }> = (() => {
  if (Platform.OS === "web" || isExpoGo) {
    return ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  }
  try {
    const { KeyboardProvider } = require("react-native-keyboard-controller");
    return KeyboardProvider || (({ children }: { children?: React.ReactNode }) => <>{children}</>);
  } catch {
    return ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  }
})();

// ── Root Navigation ────────────────────────────────────────────────────────────
function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean>(true);

  const isAuthRoute =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    (window.location.pathname.startsWith("/auth") || window.location.pathname.includes("auth/google"));

  useEffect(() => {
    AsyncStorage.getItem("ofm_onboarding_seen").then((seen) => {
      if (seen === "false") {
        setHasSeenOnboarding(false);
      }
    }).catch(() => {});
  }, []);

  // Route once both auth and onboarding checks are complete
  useEffect(() => {
    if (isLoading || hasSeenOnboarding === null) return;
    if (isAuthRoute) return;

    if (Platform.OS !== "web") {
      if (user) {
        router.replace("/(tabs)");
      } else if (hasSeenOnboarding) {
        router.replace("/login");
      } else {
        router.replace("/onboarding");
      }
    }
  }, [user?.id, isLoading, hasSeenOnboarding, isAuthRoute]);

  // On Web platform: always render the complete enterprise WebShell
  if (Platform.OS === "web" && !isAuthRoute) {
    return <WebShell />;
  }

  // Mobile App Native Stack / Web Unauthenticated / Web Auth Route
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: "slide_from_right",
        fullScreenGestureEnabled: false, // Edge-only gesture activation
      }}
    >
      <Stack.Screen name="index" options={{ animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="onboarding" options={{ animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="login" options={{ animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="auth/google" options={{ animation: "fade", gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="budget" options={{ presentation: "card", animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="payroll" options={{ presentation: "card", animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="departments" options={{ presentation: "card", animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="ai-insights" options={{ presentation: "card", animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="settings" options={{ presentation: "card", animation: "slide_from_right", gestureEnabled: true }} />
      <Stack.Screen name="team" options={{ presentation: "card", animation: "slide_from_right", gestureEnabled: true }} />
    </Stack>
  );
}

// ── Root Layout ────────────────────────────────────────────────────────────────
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  useEffect(() => {
    if (Platform.OS === "web") {
      document.title = "Organization Finance Management (OFM)";
      // Inject Google Fonts Inter stylesheet
      const linkId = "google-fonts-inter";
      if (!document.getElementById(linkId)) {
        const link = document.createElement("link");
        link.id = linkId;
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
        document.head.appendChild(link);
      }
      // Set global body font family without overriding vector icon fonts
      const styleId = "global-font-style";
      let style = document.getElementById(styleId) as HTMLStyleElement;
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        document.head.appendChild(style);
      }
      style.textContent = `
        body, html, #root {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
      `;
    }

    // Always hide splash screen immediately to guarantee instant app launch on Expo Go & Native
    SplashScreen.hideAsync().catch(() => {});

    if (fontsLoaded || fontError) {
      if (Platform.OS !== "web") {
        requestNotificationPermissions();
      }
    }
  }, [fontsLoaded, fontError]);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SettingsProvider>
              <FinanceProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <ThemedStatusBar />
                  <SafeKeyboardProvider>
                    <RootLayoutNav />
                  </SafeKeyboardProvider>
                  <GlobalToast />
                </GestureHandlerRootView>
              </FinanceProvider>
            </SettingsProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

