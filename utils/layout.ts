/**
 * Top padding for a screen header: clears the status bar / notch with a small, consistent gap.
 * Kept in one place so every screen starts at the same height.
 */
export function screenTopPadding(insetTop: number): number {
  return Math.max(insetTop, 12) + 6;
}
