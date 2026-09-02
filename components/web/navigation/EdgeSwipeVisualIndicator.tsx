import React from "react";
import { View, StyleSheet } from "react-native";
import { SvgChevronLeft } from "@/components/web/SvgIcons";

interface EdgeSwipeVisualIndicatorProps {
  isSwiping: boolean;
  progress: number; // 0 to 1
}

export function EdgeSwipeVisualIndicator({ isSwiping, progress }: EdgeSwipeVisualIndicatorProps) {
  if (!isSwiping || progress <= 0.05) return null;

  const translateX = Math.min(progress * 48 - 40, 10);
  const opacity = Math.min(progress * 1.3, 0.95);
  const scale = 0.85 + progress * 0.2;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateX }, { scale }],
        },
      ]}
    >
      <View style={styles.pill}>
        <SvgChevronLeft size={22} color="#FFFFFF" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    top: "48%",
    zIndex: 999999,
  },
  pill: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(11, 27, 61, 0.92)",
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 12,
  },
});
