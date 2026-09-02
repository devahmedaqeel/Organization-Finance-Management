import React from "react";
import { Platform, ScrollView, ScrollViewProps } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

const isExpoGo = Constants?.executionEnvironment === ExecutionEnvironment.StoreClient;

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: ScrollViewProps) {
  if (Platform.OS === "web" || isExpoGo) {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    );
  }

  try {
    const { KeyboardAwareScrollView } = require("react-native-keyboard-controller");
    if (KeyboardAwareScrollView) {
      return (
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          {...props}
        >
          {children}
        </KeyboardAwareScrollView>
      );
    }
  } catch (e) {
    // Fallback gracefully
  }

  return (
    <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
      {children}
    </ScrollView>
  );
}
