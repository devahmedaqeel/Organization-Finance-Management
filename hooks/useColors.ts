import { useColorScheme } from "react-native";
import colors from "@/constants/colors";
import { useSettings } from "@/context/SettingsContext";

export function useColors() {
  const deviceScheme = useColorScheme();
  const { settings } = useSettings();

  const theme = settings.theme ?? "system";
  const resolvedScheme = theme === "system" ? deviceScheme : theme;

  const palette = resolvedScheme === "dark" ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
