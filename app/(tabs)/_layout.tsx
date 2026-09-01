import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const safeAreaInsets = useSafeAreaInsets();
  const { user } = useAuth();
  const isEmployee = user?.role === "employee";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.2 : 0.05,
          shadowRadius: 4,
          height: isWeb ? 84 : 60 + Math.max(safeAreaInsets.bottom, isIOS ? 14 : 6),
          paddingTop: 6,
          paddingBottom: Math.max(safeAreaInsets.bottom, isIOS ? 16 : 8),
        },
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontFamily: "Inter_600SemiBold",
          marginTop: 2,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
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
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="income"
        options={{
          title: "Income",
          href: isEmployee ? null : "/income",
          tabBarIcon: ({ color }) => <Feather name="arrow-up-circle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: isEmployee ? "Claims" : "Expenses",
          tabBarIcon: ({ color }) => <Feather name="arrow-down-circle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          href: isEmployee ? null : "/reports",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: isEmployee ? "My Slip" : "More",
          tabBarIcon: ({ color }) => <Feather name={isEmployee ? "file-text" : "more-horizontal"} size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
