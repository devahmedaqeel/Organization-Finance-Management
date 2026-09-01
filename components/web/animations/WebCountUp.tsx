import React, { useEffect, useState, useRef } from "react";
import { Text, TextStyle, StyleProp, Platform } from "react-native";

interface WebCountUpProps {
  value: number;
  prefix?: string;
  suffix?: string;
  formatter?: (val: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
  decimals?: number;
  showSign?: boolean;
}

export function WebCountUp({
  value,
  prefix = "",
  suffix = "",
  formatter,
  duration = 500,
  style,
  decimals = 0,
  showSign = false,
}: WebCountUpProps) {
  const [displayValue, setDisplayValue] = useState<number>(() => Number(value || 0));
  const prevValueRef = useRef<number>(Number(value || 0));
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const targetVal = Number(value || 0);

    if (
      Platform.OS !== "web" ||
      typeof window === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplayValue(targetVal);
      prevValueRef.current = targetVal;
      return;
    }

    const startVal = prevValueRef.current;
    const change = targetVal - startVal;

    if (change === 0) {
      setDisplayValue(targetVal);
      return;
    }

    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3);
    };

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      const current = startVal + change * easedProgress;
      setDisplayValue(current);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetVal);
        prevValueRef.current = targetVal;
        startTimeRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration]);

  const formattedOutput = () => {
    let formattedNum: string;

    if (formatter) {
      formattedNum = formatter(displayValue);
    } else if (decimals > 0) {
      formattedNum = displayValue.toFixed(decimals);
    } else {
      formattedNum = Math.round(displayValue).toLocaleString();
    }

    let sign = "";
    if (showSign) {
      if (displayValue > 0) sign = "+";
      else if (displayValue < 0) sign = "-";
    }

    return `${sign}${prefix}${formattedNum}${suffix}`;
  };

  return <Text style={style}>{formattedOutput()}</Text>;
}
