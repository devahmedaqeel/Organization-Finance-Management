/**
 * Native (Android / iOS) stand-in for the web-only WebShell.
 *
 * Metro picks this `.native.tsx` file on mobile, so the whole desktop web shell
 * (WebDashboard, WebReports, WebBudgets, …) is left out of the mobile bundle and
 * the app opens faster. Callers only render <WebShell /> when Platform.OS === "web",
 * so this component is never shown on a phone.
 */
export type WebTabKey = string;

export function normalizeWebTab(raw: string | null | undefined): WebTabKey {
  return raw || "dashboard";
}

export function WebShell() {
  return null;
}
