import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

interface EdgeSwipeBackOptions {
  enabled?: boolean;
  edgeZone?: number; // Distance from left edge to activate (default 30px)
  thresholdDistance?: number; // Swipe distance required (default 65px)
  thresholdVelocity?: number; // Minimum velocity in px/ms (default 0.3)
  onBack: () => boolean | void; // Callback to trigger back navigation or modal dismissal
  canGoBack: boolean; // Whether back action is available
}

export function useEdgeSwipeBack({
  enabled = true,
  edgeZone = 30,
  thresholdDistance = 65,
  thresholdVelocity = 0.3,
  onBack,
  canGoBack,
}: EdgeSwipeBackOptions) {
  const [swipeProgress, setSwipeProgress] = useState(0); // 0 to 1
  const [isSwiping, setIsSwiping] = useState(false);

  const touchState = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    isEdge: false,
    validSwipe: false,
  });

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const canGoBackRef = useRef(canGoBack);
  canGoBackRef.current = canGoBack;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        touchState.current.isEdge = false;
        return;
      }
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;

      // 1. MUST start near the left edge (within edgeZone) AND back action must be available
      if (startX <= edgeZone && canGoBackRef.current) {
        touchState.current = {
          startX,
          startY,
          startTime: Date.now(),
          isEdge: true,
          validSwipe: false,
        };
      } else {
        touchState.current.isEdge = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchState.current.isEdge || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchState.current.startX;
      const deltaY = touch.clientY - touchState.current.startY;

      // 2. If vertical movement dominates, cancel edge swipe immediately to preserve normal scrolling!
      if (Math.abs(deltaY) > Math.abs(deltaX) && !touchState.current.validSwipe) {
        touchState.current.isEdge = false;
        setIsSwiping(false);
        setSwipeProgress(0);
        return;
      }

      // 3. Swiping from left edge toward right
      if (deltaX > 8) {
        touchState.current.validSwipe = true;
        setIsSwiping(true);
        const progress = Math.min(Math.max(deltaX / thresholdDistance, 0), 1);
        setSwipeProgress(progress);
      } else if (deltaX < 0) {
        touchState.current.isEdge = false;
        setIsSwiping(false);
        setSwipeProgress(0);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchState.current.isEdge || !touchState.current.validSwipe) {
        touchState.current.isEdge = false;
        setIsSwiping(false);
        setSwipeProgress(0);
        return;
      }

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchState.current.startX;
      const elapsed = Date.now() - touchState.current.startTime;
      const velocity = elapsed > 0 ? deltaX / elapsed : 0;

      // 4. Trigger back if threshold distance or velocity is reached
      if (deltaX >= thresholdDistance || (deltaX >= 40 && velocity >= thresholdVelocity)) {
        onBackRef.current();
      }

      touchState.current.isEdge = false;
      touchState.current.validSwipe = false;
      setIsSwiping(false);
      setSwipeProgress(0);
    };

    const handleTouchCancel = () => {
      touchState.current.isEdge = false;
      touchState.current.validSwipe = false;
      setIsSwiping(false);
      setSwipeProgress(0);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [enabled, edgeZone, thresholdDistance, thresholdVelocity]);

  return { isSwiping, swipeProgress };
}
