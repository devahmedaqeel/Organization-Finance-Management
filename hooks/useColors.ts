import { Platform, useColorScheme } from "react-native";
import colors from "@/constants/colors";
import { useSettings } from "@/context/SettingsContext";

// Web-only glass surfaces: translucent so the shell's ambient backdrop shows through
// (webStyles.ts adds the frosted backdrop-filter to these exact values).
// Only keys that are never suffixed with hex alpha (e.g. `colors.border + "40"`) are overridden.
const webGlass = {
  light: {
    card: "rgba(255, 255, 255, 0.56)",
    cardAlt: "rgba(241, 245, 249, 0.62)",
    input: "rgba(239, 246, 255, 0.72)",
  },
  dark: {
    card: "rgba(20, 30, 46, 0.52)",
    cardAlt: "rgba(26, 37, 64, 0.58)",
    input: "rgba(26, 36, 56, 0.66)",
  },
};

export function useColors() {
  const deviceScheme = useColorScheme();
  const { settings } = useSettings();

  const theme = settings.theme ?? "system";
  const resolvedScheme = theme === "system" ? deviceScheme : theme;
  const isDark = resolvedScheme === "dark";

  const palette = isDark ? colors.dark : colors.light;
  const glass = Platform.OS === "web" ? (isDark ? webGlass.dark : webGlass.light) : {};
  return { ...palette, ...glass, radius: colors.radius, isDark };
}
