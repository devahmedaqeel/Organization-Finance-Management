/** Web-only layout constraints shared by authentication and the workspace. */
export const RESPONSIVE_WEB_CSS = `
  [data-ofm-app-bg] {
    height: 100vh !important;
    height: var(--ofm-viewport-height, 100dvh) !important;
    min-height: 0;
  }
  [data-ofm-content-area] { min-height: 0; }
  [data-ofm-scope-bar] { flex-wrap: wrap; flex-shrink: 0; }
  [data-ofm-scope-bar] > [dir="auto"] { min-width: 0; flex: 1 1 200px; }
  [data-ofm-bottomnav] {
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }
  [data-ofm-dialog-overlay] {
    padding: max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px)) !important;
  }
  [data-ofm-dialog-card] {
    min-width: 0;
    max-width: 100%;
    max-height: calc(var(--ofm-viewport-height, 100dvh) - 32px) !important;
    flex-shrink: 1;
  }
  [data-ofm-dialog-header], [data-ofm-dialog-footer] { flex-shrink: 0; gap: 10px; }
  [data-ofm-dialog-header] > div { min-width: 0; flex-shrink: 1; }
  [data-ofm-dialog-footer] { flex-wrap: wrap; }
  [data-ofm-dialog-footer] > [role="button"] { min-height: 44px; height: auto !important; padding-block: 10px; }
  [data-ofm-dialog-body] { min-height: 0; flex-shrink: 1; }
  #root input, #root textarea, [aria-modal="true"] input, [aria-modal="true"] textarea { min-width: 0; max-width: 100%; }
  #root [dir="auto"], [aria-modal="true"] [dir="auto"] { overflow-wrap: anywhere; }
  #root [role="button"] > [dir="auto"], [aria-modal="true"] [role="button"] > [dir="auto"] { min-width: 0; flex-shrink: 1; }
  @media (max-width: 767px) {
    [data-ofm-content-area] { padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important; }
    [data-ofm-topbar] { min-height: 56px; height: auto !important; flex-shrink: 0; padding-block: 8px; }
    [data-ofm-iconbtn] { min-width: 40px; min-height: 40px; }
    [data-ofm-dialog-header], [data-ofm-dialog-footer] { padding-inline: 14px !important; }
    /* Keep iOS from zooming the page when a form field receives focus. */
    #root input, #root textarea, [aria-modal="true"] input, [aria-modal="true"] textarea { font-size: 16px !important; }
  }
`;

export function trackWebViewport() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const update = () => {
    document.documentElement.style.setProperty("--ofm-viewport-height", `${Math.round(window.visualViewport?.height ?? window.innerHeight)}px`);
  };
  update();
  window.addEventListener("resize", update);
  window.visualViewport?.addEventListener("resize", update);
}
