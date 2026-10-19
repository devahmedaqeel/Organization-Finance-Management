import { Feather } from "@/components/UniversalIcon";
import { screenTopPadding } from "@/utils/layout";
import { router } from "expo-router";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PayslipTemplateManager } from "@/components/payslip/PayslipTemplateManager";
import { useColors } from "@/hooks/useColors";
import { useKeyboardAwareScroll } from "@/hooks/useKeyboardAwareScroll";

/** Mobile "Payslip Templates" screen — same manager & editor as the web Payroll module. */
export default function PayslipTemplatesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // Keep the focused field visible above the keyboard (Android edge-to-edge does not resize)
  const kb = useKeyboardAwareScroll();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/payroll");
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: screenTopPadding(insets.top), borderBottomColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <TouchableOpacity onPress={goBack} hitSlop={10} accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Payslip Templates</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView
        ref={kb.scrollRef}
        onTouchEnd={kb.onTouchEnd}
        style={styles.flex}
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 40 + kb.bottomSpacer, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <PayslipTemplateManager />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
});
