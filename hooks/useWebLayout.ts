import { createContext, useContext } from "react";
import { useWindowDimensions } from "react-native";

/** Width of the workspace after navigation has taken its share of the viewport. */
export const WebLayoutContext = createContext<number | null>(null);

/** Outside the web shell (including native screens), keep using the device width. */
export function useWebLayout() {
  const dimensions = useWindowDimensions();
  const workspaceWidth = useContext(WebLayoutContext);
  return { ...dimensions, width: workspaceWidth ?? dimensions.width };
}
