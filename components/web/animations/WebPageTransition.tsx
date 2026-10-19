import React from "react";
import { View, ViewStyle, StyleProp } from "react-native";

interface WebPageTransitionProps {
  children: React.ReactNode;
  pageKey: string;
  style?: StyleProp<ViewStyle>;
}

export function WebPageTransition({
  children,
  pageKey,
  style,
}: WebPageTransitionProps) {
  return (
    <View
      key={pageKey}
      // @ts-ignore - RN-Web maps dataSet to data-* attributes (drives the enter animation in webStyles.ts)
      dataSet={{ ofmPage: pageKey }}
      style={[
        {
          flex: 1,
          width: "100%",
          height: "100%",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
