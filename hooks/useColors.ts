import { Platform, useColorScheme } from "react-native";
import colors from "@/constants/colors";
import { useSettings } from "@/context/SettingsContext";

// Web-only "accounting suite" palette: solid surfaces, neutral greys, green brand accent.
// Every value is a 6-digit hex because screens append alpha suffixes (e.g. colors.border + "40").
// Native (iOS/Android) keeps the original palette from constants/colors.ts.
const webPalette = {
  light: {
    text: "#2B2C2F",
    tint: "#2CA01C",
    background: "#F4F5F8",
    foreground: "#2B2C2F",
    card: "#FFFFFF",
    cardForeground: "#2B2C2F",
    cardAlt: "#F8F9FA",
    primary: "#2CA01C",
    primaryForeground: "#FFFFFF",
    secondary: "#ECEEF1",
    secondaryForeground: "#393A3D",
    muted: "#F1F2F4",
    mutedForeground: "#6B6C72",
    border: "#DCDFE4",
    input: "#FFFFFF",
    income: "#108000",
    expense: "#D52B1E",
    destructive: "#D52B1E",
    warning: "#C77700",
    info: "#0077C5",
  },
  dark: {
    text: "#E8E9EB",
    tint: "#53B700",
    background: "#16171A",
    foreground: "#E8E9EB",
    card: "#212226",
    cardForeground: "#E8E9EB",
    cardAlt: "#2A2B30",
    primary: "#53B700",
    primaryForeground: "#FFFFFF",
    secondary: "#2E3035",
    secondaryForeground: "#D4D6DA",
    muted: "#2A2B30",
    mutedForeground: "#9A9CA3",
    border: "#36383E",
    input: "#1C1D21",
    income: "#53B700",
    expense: "#FF6B5E",
    destructive: "#FF6B5E",
    warning: "#F2A93B",
    info: "#4BA6E6",
  },
};

export function useColors() {
  const deviceScheme = useColorScheme();
  const { settings } = useSettings();

  const theme = settings.theme ?? "system";
  const resolvedScheme = theme === "system" ? deviceScheme : theme;
  const isDark = resolvedScheme === "dark";

  const palette = isDark ? colors.dark : colors.light;
  const web = Platform.OS === "web" ? (isDark ? webPalette.dark : webPalette.light) : {};
  return { ...palette, ...web, radius: Platform.OS === "web" ? 8 : colors.radius, isDark };
}
