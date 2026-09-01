import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { useColors } from "@/hooks/useColors";

interface WebSkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function WebSkeleton({
  width = "100%",
  height = 20,
  borderRadius = 8,
  style,
}: WebSkeletonProps) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor: colors.muted || "rgba(148, 163, 184, 0.18)",
          opacity,
        },
        style,
      ]}
    />
  );
}

export function WebDashboardSkeleton() {
  const colors = useColors();

  return (
    <View style={{ gap: 20, padding: 24 }}>
      {/* Hero skeleton */}
      <WebSkeleton height={190} borderRadius={20} />

      {/* KPI Cards skeleton */}
      <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
        <WebSkeleton height={110} borderRadius={16} style={{ flex: 1, minWidth: 200 }} />
        <WebSkeleton height={110} borderRadius={16} style={{ flex: 1, minWidth: 200 }} />
        <WebSkeleton height={110} borderRadius={16} style={{ flex: 1, minWidth: 200 }} />
        <WebSkeleton height={110} borderRadius={16} style={{ flex: 1, minWidth: 200 }} />
      </View>

      {/* Charts / Panels skeleton */}
      <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
        <WebSkeleton height={320} borderRadius={16} style={{ flex: 2, minWidth: 320 }} />
        <WebSkeleton height={320} borderRadius={16} style={{ flex: 1, minWidth: 280 }} />
      </View>
    </View>
  );
}
