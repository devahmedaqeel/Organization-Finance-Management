/**
 * useResponsive — Dynamic responsive values based on live screen dimensions.
 * Works on all screen sizes: small phones (360dp) → large tablets (1024dp+)
 */
import { useWindowDimensions } from "react-native";

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  // Breakpoints
  const isSmall = width < 380;      // small phones (SE, etc.)
  const isMedium = width < 600;     // normal phones
  const isTablet = width >= 600;    // tablets & large screens

  // Font scale
  const fs = (base: number) => {
    if (isSmall) return base * 0.88;
    if (isTablet) return base * 1.12;
    return base;
  };

  // Padding / spacing scale
  const sp = (base: number) => {
    if (isSmall) return base * 0.85;
    if (isTablet) return base * 1.25;
    return base;
  };

  // Number of columns for grid layouts
  const cols = isTablet ? 3 : 2;

  // Card width for grids (percentage string)
  const cardPct = isTablet ? "31%" : "48.5%";

  // Container horizontal padding
  const hPad = isTablet ? 32 : isSmall ? 12 : 16;

  // Chart width (full width minus padding)
  const chartW = width - hPad * 2 - 32;

  // Stat card width for horizontal scroll
  const statCardW = isTablet ? 160 : isSmall ? 110 : 130;

  return {
    width,
    height,
    isSmall,
    isMedium,
    isTablet,
    fs,
    sp,
    cols,
    cardPct,
    hPad,
    chartW,
    statCardW,
  };
}
