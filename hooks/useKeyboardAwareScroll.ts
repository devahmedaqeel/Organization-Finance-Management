import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, KeyboardEvent, Platform, ScrollView, TextInput } from "react-native";

/**
 * Keeps the focused TextInput visible above the keyboard inside a ScrollView.
 *
 * Why this is needed: the app runs edge-to-edge on Android (Expo SDK 57), so the window is
 * no longer resized when the keyboard opens — a ScrollView keeps its full height and the
 * focused field can end up under the keyboard. This hook:
 *  - tracks the keyboard's height and top edge,
 *  - scrolls the focused field just above the keyboard when the keyboard opens,
 *  - re-checks after every tap, so moving between fields keeps the active one visible.
 *
 * Usage: attach `scrollRef` and `onTouchEnd` to the ScrollView, and add
 * `bottomSpacer` to its contentContainerStyle paddingBottom so the last fields can scroll up.
 */
export function useKeyboardAwareScroll(gap = 24) {
  const scrollRef = useRef<ScrollView>(null);
  const keyboardTop = useRef<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const ensureFocusedVisible = useCallback(() => {
    if (Platform.OS === "web" || keyboardTop.current == null) return;
    const input = TextInput.State.currentlyFocusedInput() as any;
    const scroll = scrollRef.current as any;
    if (!input || !scroll) return;
    const inner = scroll.getInnerViewRef?.() ?? scroll.getInnerViewNode?.();
    if (!inner) return;

    try {
      scroll.measureInWindow((_sx: number, scrollTop: number) => {
        input.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          const visibleBottom = (keyboardTop.current ?? Dimensions.get("window").height) - gap;
          const hiddenBelow = y + h > visibleBottom;
          const hiddenAbove = y < scrollTop;
          if (!hiddenBelow && !hiddenAbove) return;
          input.measureLayout(
            inner,
            (_cx: number, contentY: number) => {
              const visibleHeight = Math.max(80, visibleBottom - scrollTop);
              const target = hiddenBelow ? contentY + h - visibleHeight : contentY - 16;
              scroll.scrollTo({ y: Math.max(0, target), animated: true });
            },
            () => {}
          );
        });
      });
    } catch {
      // The focused input belongs to another screen — nothing to do here
    }
  }, [gap]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      const height = e?.endCoordinates?.height || 0;
      const screenY = e?.endCoordinates?.screenY;
      keyboardTop.current = screenY && screenY > 0 ? screenY : Dimensions.get("window").height - height;
      setKeyboardHeight(height);
      // Wait for any resize/padding to apply before measuring
      timer = setTimeout(ensureFocusedVisible, Platform.OS === "ios" ? 320 : 140);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [ensureFocusedVisible]);

  // Moving to another field while the keyboard stays open fires no keyboard event on Android
  const onTouchEnd = useCallback(() => {
    if (keyboardTop.current != null) setTimeout(ensureFocusedVisible, 220);
  }, [ensureFocusedVisible]);

  return {
    scrollRef,
    keyboardHeight,
    onTouchEnd,
    ensureFocusedVisible,
    /** Extra bottom padding (Android) so the last fields can scroll above the keyboard */
    bottomSpacer: Platform.OS === "android" ? keyboardHeight : 0,
  };
}
