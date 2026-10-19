import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardAwareScroll } from "@/hooks/useKeyboardAwareScroll";

/**
 * Keeps a bottom sheet modal inside the visible screen area on mobile:
 * - caps the sheet height so its top never slides under the status bar / off-screen
 * - shrinks the cap while the keyboard is open so the sheet stays above it
 * - keeps the focused input visible (on keyboard open and when moving between fields)
 * - `sheetBottomInset`: space for the Android navigation bar / iOS home indicator. Modals draw
 *   edge-to-edge, so without it the sheet's last button sits behind the system buttons. While the
 *   keyboard is open the keyboard already covers that area, so the inset is 0 (no double gap).
 *
 * Attach `scrollRef` and `onTouchEnd` to the sheet's ScrollView, and add `sheetBottomInset`
 * to the bottom padding of the sheet's last content.
 */
export function useBottomSheetLayout() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { scrollRef, keyboardHeight, onTouchEnd } = useKeyboardAwareScroll();

  const maxHeight = Math.max(240, height - insets.top - keyboardHeight - 16);
  const sheetBottomInset = keyboardHeight > 0 ? 0 : insets.bottom;

  return { maxHeight, keyboardHeight, scrollRef, onTouchEnd, sheetBottomInset };
}
