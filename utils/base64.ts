/**
 * Safe 8-bit & Unicode-safe Base64 encoder.
 * Handles both raw binary streams and UTF-8 multibyte characters without throwing DOMException.
 */
export function safeBinaryToBase64(str: string): string {
  if (!str) return "";
  try {
    // 1. If ASCII/Latin1, try btoa directly
    return btoa(str);
  } catch {
    try {
      // 2. Clamp each character to 0..255 byte code
      let binary = "";
      for (let i = 0; i < str.length; i++) {
        binary += String.fromCharCode(str.charCodeAt(i) & 0xff);
      }
      return btoa(binary);
    } catch {
      // 3. UTF-8 multi-byte fallback via TextEncoder
      if (typeof TextEncoder !== "undefined") {
        const bytes = new TextEncoder().encode(str);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) {
          bin += String.fromCharCode(bytes[i]);
        }
        return btoa(bin);
      }
      return btoa(unescape(encodeURIComponent(str)));
    }
  }
}
