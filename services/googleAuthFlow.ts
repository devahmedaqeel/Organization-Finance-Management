export type GoogleRole = "admin" | "accountant" | "manager" | "employee";

export function normalizeGoogleRole(value: string | null | undefined): GoogleRole {
  return value === "accountant" || value === "manager" || value === "employee" ? value : "admin";
}

export function isGoogleBridgePath(pathname: string): boolean {
  return /^\/auth\/google\/?$/.test(pathname);
}

export function isGooglePopupCancellation(error: { code?: string }): boolean {
  return error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request";
}

export function googleAuthErrorMessage(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case "auth/unauthorized-domain": return "Google sign-in is not configured for this website address. Add this domain in Firebase Authentication settings.";
    case "auth/operation-not-allowed": return "Google sign-in is not enabled for this project. Enable Google in Firebase Authentication.";
    case "auth/network-request-failed": return "Could not connect to Google. Check your internet connection and try again.";
    case "auth/account-exists-with-different-credential": return "This email already uses another sign-in method. Sign in with your password first.";
    case "auth/popup-blocked": return "The browser blocked the Google sign-in window. Allow popups for this site and try again.";
    default: return error.message || "Unable to sign in with Google. Please try again.";
  }
}

/** A deadline rejects the caller and clears its timer, including on early failure. */
export async function withAuthTimeout<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function validateNativeGoogleRedirect(redirectUri: string): URL {
  const url = new URL(redirectUri);
  const isLogin = (url.host === "login" && (url.pathname === "" || url.pathname === "/")) || (!url.hostname && url.pathname === "/login");
  if (url.protocol !== "ofm-app:" || !isLogin || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid OFM application callback address.");
  }
  return url;
}

export function buildNativeGoogleCallback(redirectUri: string, tokens: { idToken?: string | null; accessToken?: string | null }, role: GoogleRole, state?: string): string {
  const url = validateNativeGoogleRedirect(redirectUri);
  if (!tokens.idToken && !tokens.accessToken) throw new Error("Google did not return a sign-in credential. Please try again.");
  if (tokens.idToken) url.searchParams.set("idToken", tokens.idToken);
  if (tokens.accessToken) url.searchParams.set("accessToken", tokens.accessToken);
  url.searchParams.set("role", normalizeGoogleRole(role));
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function parseNativeGoogleCallback(callback: string, redirectUri: string, expectedState: string) {
  const expected = validateNativeGoogleRedirect(redirectUri);
  const url = new URL(callback);
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.username || url.password || url.pathname !== expected.pathname || url.hash || !expectedState || url.searchParams.get("state") !== expectedState) {
    throw new Error("Google sign-in could not verify the application callback. Please try again.");
  }
  const idToken = url.searchParams.get("idToken");
  const accessToken = url.searchParams.get("accessToken");
  if (!idToken && !accessToken) throw new Error("Google did not return a sign-in credential. Please try again.");
  // URLSearchParams already decodes tokens exactly once.
  return { idToken, accessToken, role: normalizeGoogleRole(url.searchParams.get("role")) };
}
