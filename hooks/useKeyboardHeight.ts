import { useEffect, useState } from "react";
import { Keyboard, Platform, KeyboardEvent } from "react-native";

/**
 * Custom hook to reliably track the native keyboard height across iOS and Android,
 * specifically ensuring bottom sheet modals lift properly above the keyboard.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      if (e?.endCoordinates?.height) {
        setKeyboardHeight(e.endCoordinates.height);
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}
