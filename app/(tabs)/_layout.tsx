import { Tabs, router } from "expo-router";
import { Feather } from "@/components/UniversalIcon";
import React, { useEffect } from "react";
import { ColorValue, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function TabLayout() {
  const colors = useColors();
  // Follow the app's own theme setting (light / dark / system), not only the device scheme
  const isDark = colors.isDark;
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const safeAreaInsets = useSafeAreaInsets();
  // Space for the Android system navigation (gesture bar or 3-button bar) / iOS home indicator
  const bottomInset = Math.max(safeAreaInsets.bottom, 8);

  // Tab icons with a soft pill behind the active one
  const renderIcon = (name: string) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <View
        style={{
          width: 46,
          height: 30,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? colors.primary + (isDark ? "2E" : "1A") : "transparent",
        }}
      >
        <Feather name={name as any} size={focused ? 20 : 19} color={color as string} />
      </View>
    );

  const { user, isLoading } = useAuth();
  const isEmployee = user?.role === "employee";

  // Auth Guard: Unauthenticated mobile users must see the Login/Signup screen first
  useEffect(() => {
    if (!isLoading && !user && Platform.OS !== "web") {
      router.replace("/login");
    }
  }, [user, isLoading]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Android: never let the tab bar ride up on top of the keyboard and cover the field being typed in
        tabBarHideOnKeyboard: Platform.OS === "android",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: isWeb
          ? {
              position: "absolute",
              backgroundColor: colors.card,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              height: 84,
              paddingTop: 6,
              paddingBottom: 8,
            }
          : {
              // Docked in the normal layout flow (not absolute): React Navigation reserves this
              // height, so screen content always ends above the bar instead of scrolling under it.
              // The bottom safe-area inset (gesture bar / 3-button nav) is added once, here.
              height: 62 + bottomInset,
              paddingTop: 7,
              paddingBottom: bottomInset,
              borderTopWidth: 1,
              borderTopColor: isDark ? colors.border : "#E6EBF3",
              backgroundColor: colors.card,
              elevation: 12,
              shadowColor: "#0F172A",
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: isDark ? 0.4 : 0.07,
              shadowRadius: 12,
            },
        tabBarItemStyle: {
          paddingHorizontal: 0,
          marginHorizontal: 0,
        },
        tabBarLabel: ({ color, children }) => (
          <Text
            numberOfLines={Platform.OS === "web" ? undefined : 1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{
              fontSize: 11,
              fontFamily: color === colors.primary ? "Inter_700Bold" : "Inter_600SemiBold",
              color,
              textAlign: "center",
              marginTop: isWeb ? 2 : 1,
              letterSpacing: -0.1,
            }}
          >
            {children}
          </Text>
        ),
        tabBarBackground: () =>
          isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isEmployee ? "Portal" : "Dashboard",
          tabBarIcon: isWeb ? ({ color }) => <Feather name="home" size={20} color={color as string} /> : renderIcon("home"),
        }}
      />
      <Tabs.Screen
        name="income"
        options={{
          title: "Inflow",
          href: isEmployee ? null : "/income",
          tabBarIcon: isWeb ? ({ color }) => <Feather name="arrow-up-circle" size={20} color={color as string} /> : renderIcon("arrow-up-circle"),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: isEmployee ? "Claims" : "Expenses",
          tabBarIcon: isWeb ? ({ color }) => <Feather name="arrow-down-circle" size={20} color={color as string} /> : renderIcon("arrow-down-circle"),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          href: isEmployee ? null : "/reports",
          tabBarIcon: isWeb ? ({ color }) => <Feather name="bar-chart-2" size={20} color={color as string} /> : renderIcon("bar-chart-2"),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: isEmployee ? "My Slip" : "More",
          tabBarIcon: isWeb ? ({ color }) => <Feather name={isEmployee ? "file-text" : "more-horizontal"} size={20} color={color as string} /> : renderIcon(isEmployee ? "file-text" : "more-horizontal"),
        }}
      />
    </Tabs>
  );
}
