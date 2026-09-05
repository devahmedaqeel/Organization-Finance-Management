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
import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, View, Text, Platform, useColorScheme, Animated, TouchableOpacity, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// KeyboardProvider is only safe on native — loaded dynamically to avoid web crash
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { SvgBell, SvgX } from "@/components/web/SvgIcons";

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
  /@firebase\/firestore/,
  /Could not reach Cloud Firestore backend/,
  /Backend didn't respond within 10 seconds/,
  /The client will operate in offline mode/,
  /Firestore \([0-9.]+\): Could not reach Cloud Firestore backend/,
]);

if (Platform.OS === "web") {
  LogBox.ignoreAllLogs(true);
}

// Demote harmless offline network notices so they don't trigger full-screen LogBox modal on mobile
if (__DEV__) {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const raw = typeof args[0] === "string" ? args[0] : "";
    if (
      raw.includes("Could not reach Cloud Firestore backend") ||
      raw.includes("@firebase/firestore") ||
      raw.includes("operate in offline mode") ||
      raw.includes("Firestore (12.17.0)")
    ) {
      console.log("[Firestore Offline Note]:", ...args);
      return;
    }
    originalError(...args);
  };
}

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
    const unregister = registerToastListener((title: string, message?: string) => {
      setToast({ visible: true, title, message: message ?? "" });
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
            <SvgX size={16} color="#94a3b8" />
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

  // Handle session termination on native mobile
  const prevUserRef = useRef<boolean>(false);
  useEffect(() => {
    if (isLoading) return;
    if (Platform.OS !== "web") {
      if (prevUserRef.current && !user) {
        router.replace("/login");
      }
      prevUserRef.current = Boolean(user);
    }
  }, [user, isLoading]);

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
    ...Feather.font,
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

      // Inject Feather icon font rules dynamically on Web
      const iconStyleId = "expo-vector-icons-web";
      if (!document.getElementById(iconStyleId)) {
        const iconStyle = document.createElement("style");
        iconStyle.id = iconStyleId;
        iconStyle.textContent = `
          @font-face {
            font-family: 'feather';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/Feather.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'Feather';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/Feather.ttf') format('truetype');
            font-display: swap;
          }
        `;
        document.head.appendChild(iconStyle);
      }

      // Set global font definitions and aliases so React Native Web never falls back to Times New Roman
      const styleId = "global-font-style";
      let style = document.getElementById(styleId) as HTMLStyleElement;
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        document.head.appendChild(style);
      }
      style.textContent = `
        @font-face {
          font-family: 'Inter_400Regular';
          src: local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), sans-serif;
          font-weight: 400;
        }
        @font-face {
          font-family: 'Inter_500Medium';
          src: local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), sans-serif;
          font-weight: 500;
        }
        @font-face {
          font-family: 'Inter_600SemiBold';
          src: local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), sans-serif;
          font-weight: 600;
        }
        @font-face {
          font-family: 'Inter_700Bold';
          src: local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), sans-serif;
          font-weight: 700;
        }
        @font-face {
          font-family: 'Inter_800ExtraBold';
          src: local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), sans-serif;
          font-weight: 800;
        }
        @font-face {
          font-family: 'Inter_900Black';
          src: local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), sans-serif;
          font-weight: 900;
        }
        body, html, #root {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        /* Map all Inter family text elements to crisp sans-serif without breaking icon fonts */
        [style*="Inter_"], [style*="Inter-"] {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
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

