import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, Animated, Easing, Platform, TouchableOpacity } from "react-native";
import Svg, { Circle, G, Defs, LinearGradient, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  percentage?: number;
  progress?: number; // 0.0 to 1.0
  value?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
  centerLabel?: string;
  showAnimation?: boolean;
}

export function RingProgress({
  percentage,
  progress,
  value,
  size = 110,
  strokeWidth = 11,
  color,
  label,
  sublabel,
  centerLabel,
  showAnimation = true,
}: Props) {
  const colors = useColors();
  const gradIdRef = useRef(`ring_grad_${Math.random().toString(36).substring(2, 9)}`);

  // Normalize percentage from any prop variant
  let rawPct = 0;
  if (percentage !== undefined && !isNaN(percentage)) {
    rawPct = percentage;
  } else if (progress !== undefined && !isNaN(progress)) {
    rawPct = progress * 100;
  } else if (value !== undefined && !isNaN(value)) {
    rawPct = value;
  }

  const clampedPct = Math.min(Math.max(rawPct, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animVal = useRef(new Animated.Value(0)).current;
  const [displayPct, setDisplayPct] = useState(clampedPct);

  useEffect(() => {
    if (!showAnimation) {
      setDisplayPct(clampedPct);
      return;
    }

    animVal.setValue(0);
    const listenerId = animVal.addListener(({ value }) => {
      setDisplayPct(value);
    });

    Animated.timing(animVal, {
      toValue: clampedPct,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    return () => {
      animVal.removeListener(listenerId);
    };
  }, [clampedPct, showAnimation]);

  // Ensure tiny percentages (e.g. 0.1%) have a clean visible arc, while 0% is completely empty
  const visualPct = displayPct > 0 && displayPct < 1.2 ? 1.2 : displayPct;
  const offset = circumference - (circumference * Math.min(Math.max(visualPct, 0), 100)) / 100;

  const ringColor =
    color ??
    (clampedPct >= 95
      ? colors.expense
      : clampedPct >= 75
      ? colors.warning
      : colors.income);

  const statusLabel =
    clampedPct >= 100
      ? "Exceeded"
      : clampedPct >= 80
      ? "Near Limit"
      : "Healthy";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      style={styles.wrap}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id={gradIdRef.current} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={ringColor} stopOpacity={0.85} />
            <Stop offset="100%" stopColor={ringColor} stopOpacity={1.0} />
          </LinearGradient>
        </Defs>

        {/* Background Inactive Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.border}
          strokeWidth={strokeWidth}
          opacity={0.35}
        />

        {/* Animated Progress Ring with Accurate Calculated Arc */}
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradIdRef.current})`}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap={displayPct > 0.4 ? "round" : "butt"}
            opacity={displayPct > 0 ? 1 : 0}
          />
        </G>
      </Svg>

      {/* Center Dynamic Label Contained Strictly Inside Inner Ring */}
      <View
        style={[
          styles.center,
          {
            width: (radius - strokeWidth / 2) * 2 - 4,
            height: (radius - strokeWidth / 2) * 2 - 4,
            maxWidth: (radius - strokeWidth / 2) * 2 - 4,
            maxHeight: (radius - strokeWidth / 2) * 2 - 4,
          },
        ]}
      >
        <Text
          style={[
            styles.pct,
            {
              color: ringColor,
              fontSize:
                (centerLabel || "").length > 9
                  ? 13.5
                  : (centerLabel || "").length > 6
                  ? 16
                  : size >= 135
                  ? 20
                  : 17,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {centerLabel ? centerLabel : `${displayPct}%`}
        </Text>
        <Text
          style={[
            styles.label,
            {
              color: colors.mutedForeground,
              fontSize: size >= 135 ? 10 : 9,
            },
          ]}
          numberOfLines={1}
        >
          {label || "Budget"}
        </Text>
        <View
          style={[
            styles.sublabelBadge,
            {
              backgroundColor: ringColor + "14",
              borderColor: ringColor + "25",
              maxWidth: "92%",
              paddingHorizontal: 6,
              paddingVertical: 1.5,
              borderRadius: 6,
            },
          ]}
        >
          <Text
            style={[
              styles.sublabel,
              {
                color: ringColor,
                fontSize: size >= 135 ? 8.5 : 7.5,
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {sublabel || statusLabel}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pct: {
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.5,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
    textAlign: "center",
  },
  sublabelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  sublabel: {
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});

