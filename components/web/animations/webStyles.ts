import { Platform } from "react-native";

export function injectWebMicroAnimations() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;

  const styleId = "ofm-web-micro-animations";
  if (document.getElementById(styleId)) return;

  const css = `
    /* ─── OFM Web Micro-Interactions & Animation System ─── */
    
    @keyframes ofmPulseDot {
      0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      }
      70% {
        transform: scale(1.05);
        box-shadow: 0 0 0 5px rgba(16, 185, 129, 0);
      }
      100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
      }
    }

    @keyframes ofmFadeSlideIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes ofmShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    .ofm-live-dot {
      animation: ofmPulseDot 2s infinite ease-in-out;
    }

    /* Interactive Card Transitions */
    .ofm-card-hover {
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease !important;
      cursor: pointer;
    }
    .ofm-card-hover:hover {
      transform: translateY(-2.5px);
      box-shadow: 0 10px 24px -6px rgba(0, 0, 0, 0.09), 0 4px 10px -2px rgba(0, 0, 0, 0.04) !important;
    }

    /* Button Micro-interactions */
    .ofm-btn-interactive {
      transition: transform 0.16s ease, filter 0.16s ease, box-shadow 0.16s ease !important;
      cursor: pointer;
      user-select: none;
    }
    .ofm-btn-interactive:hover {
      filter: brightness(1.05);
      transform: translateY(-1px);
    }
    .ofm-btn-interactive:active {
      transform: scale(0.975) translateY(0);
      filter: brightness(0.96);
    }

    /* Nav Item Transition */
    .ofm-nav-item {
      transition: background-color 0.18s ease, transform 0.15s ease !important;
    }
    .ofm-nav-item:hover {
      transform: translateX(2px);
    }

    /* Table Row Transitions */
    .ofm-table-row {
      transition: background-color 0.15s ease, transform 0.12s ease !important;
    }
    .ofm-table-row:hover {
      background-color: rgba(99, 102, 241, 0.04) !important;
    }

    /* Smooth Input Focus Rings */
    input:focus, textarea:focus, select:focus {
      outline: none !important;
      box-shadow: 0 0 0 2.5px rgba(59, 130, 246, 0.35) !important;
      transition: box-shadow 0.18s ease, border-color 0.18s ease !important;
    }

    /* Smooth Scroll Behavior */
    html {
      scroll-behavior: smooth;
    }

    /* Scrollbar aesthetics */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.35);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(148, 163, 184, 0.55);
    }

    /* Universal Modern Sans-Serif Typography Enforcement (Preserves vector icon fonts) */
    html, body, #root, button, input, select, textarea {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    [style*="Inter_400Regular"], [style*="Inter_400"] {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      font-weight: 400 !important;
    }
    [style*="Inter_500Medium"], [style*="Inter_500"] {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      font-weight: 500 !important;
    }
    [style*="Inter_600SemiBold"], [style*="Inter_600"] {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      font-weight: 600 !important;
    }
    [style*="Inter_700Bold"], [style*="Inter_700"] {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      font-weight: 700 !important;
    }
    [style*="Inter_800ExtraBold"], [style*="Inter_800"] {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      font-weight: 800 !important;
    }

    /* Icon Font Protections */
    [style*="font-family: Feather"], [style*="font-family: feather"], [style*="font-family:Feather"], [style*="font-family:feather"],
    [style*="fontFamily: Feather"], [style*="fontFamily: feather"] {
      font-family: 'Feather', 'feather' !important;
    }
    [style*="font-family: Ionicons"], [style*="font-family: ionicons"], [style*="font-family:Ionicons"], [style*="font-family:ionicons"],
    [style*="fontFamily: Ionicons"], [style*="fontFamily: ionicons"] {
      font-family: 'Ionicons', 'ionicons' !important;
    }
    [style*="font-family: MaterialIcons"], [style*="font-family: Material Icons"], [style*="font-family: material"],
    [style*="fontFamily: MaterialIcons"], [style*="fontFamily: material"] {
      font-family: 'MaterialIcons', 'Material Icons', 'material' !important;
    }
    [style*="font-family: MaterialCommunityIcons"], [style*="font-family: material-community"],
    [style*="fontFamily: MaterialCommunityIcons"], [style*="fontFamily: material-community"] {
      font-family: 'MaterialCommunityIcons', 'material-community' !important;
    }
    [style*="font-family: FontAwesome"], [style*="font-family: fontawesome"],
    [style*="fontFamily: FontAwesome"], [style*="fontFamily: fontawesome"] {
      font-family: 'FontAwesome', 'fontawesome' !important;
    }

    /* Smooth Luxury Ambient Blue Glows for Corporate Cards (Prevents harsh circular discs) */
    .ofm-ambient-glow-tr {
      position: absolute !important;
      top: -70px !important;
      right: -70px !important;
      width: 240px !important;
      height: 240px !important;
      border-radius: 50% !important;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.28) 0%, rgba(29, 78, 216, 0.12) 45%, transparent 75%) !important;
      filter: blur(40px) !important;
      -webkit-filter: blur(40px) !important;
      pointer-events: none !important;
    }
    .ofm-ambient-glow-bl {
      position: absolute !important;
      bottom: -70px !important;
      left: -60px !important;
      width: 240px !important;
      height: 240px !important;
      border-radius: 50% !important;
      background: radial-gradient(circle, rgba(37, 99, 235, 0.38) 0%, rgba(29, 78, 216, 0.15) 45%, transparent 75%) !important;
      filter: blur(45px) !important;
      -webkit-filter: blur(45px) !important;
      pointer-events: none !important;
    }

    /* ─── Shell Layout Polish (hooked up via RN-Web dataSet → data-* attributes) ─── */

    @keyframes ofmDrawerSlideIn {
      from { transform: translateX(-100%); }
      to { transform: translateX(0); }
    }

    @keyframes ofmBackdropFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Page enter transition when switching tabs */
    [data-ofm-page] {
      animation: ofmFadeSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Generic pressables: pointer cursor and smooth colour changes */
    [role="button"], [tabindex="0"] {
      cursor: pointer;
      transition-property: background-color, border-color, box-shadow, color, opacity;
      transition-duration: 0.18s;
      transition-timing-function: ease;
    }

    /* Keyboard focus ring (mouse clicks stay clean) */
    [role="button"]:focus-visible, [tabindex="0"]:focus-visible, a:focus-visible {
      outline: 2px solid rgba(59, 130, 246, 0.65);
      outline-offset: 2px;
    }

    /* Sidebar: animate collapse / expand */
    [data-ofm-sidebar] {
      transition: width 0.24s cubic-bezier(0.16, 1, 0.3, 1);
      will-change: width;
    }

    /* Sidebar nav links */
    [data-ofm-nav] {
      transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.15s ease;
    }
    [data-ofm-nav]:hover {
      background-color: rgba(148, 163, 184, 0.12);
    }
    [data-ofm-nav]:active {
      transform: scale(0.985);
    }

    /* Header icon buttons */
    [data-ofm-iconbtn] {
      transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
    }
    [data-ofm-iconbtn]:hover {
      background-color: rgba(148, 163, 184, 0.14);
      border-color: rgba(148, 163, 184, 0.45) !important;
    }
    [data-ofm-iconbtn]:active {
      transform: scale(0.94);
    }

    /* Sticky top bar with subtle depth */
    [data-ofm-topbar] {
      position: relative;
      z-index: 20;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }

    /* Live sync indicator */
    [data-ofm-live-dot] {
      animation: ofmPulseDot 2s infinite ease-in-out;
    }

    /* Mobile drawer slides in from the left over a fading backdrop */
    [data-ofm-drawer-backdrop] {
      animation: ofmBackdropFadeIn 0.2s ease;
    }
    [data-ofm-drawer] {
      animation: ofmDrawerSlideIn 0.26s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 12px 0 32px rgba(0, 0, 0, 0.22);
    }

    /* Mobile bottom nav: soft shadow + iOS home-indicator safe area */
    [data-ofm-bottomnav] {
      box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.08);
      height: calc(60px + env(safe-area-inset-bottom, 0px)) !important;
      padding-bottom: env(safe-area-inset-bottom, 0px) !important;
      backdrop-filter: saturate(180%) blur(12px);
      -webkit-backdrop-filter: saturate(180%) blur(12px);
    }
    [data-ofm-bottomnav-item] [data-ofm-bottomnav-icon] {
      transition: background-color 0.2s ease, transform 0.15s ease;
    }
    [data-ofm-bottomnav-item]:active [data-ofm-bottomnav-icon] {
      transform: scale(0.9);
    }

    /* ─── App shell: ambient backdrop + glass surfaces ─── */

    /* Layered colour glows over the theme background (inline background-color stays the base) */
    [data-ofm-app-bg="light"] {
      background-image:
        radial-gradient(1000px 620px at 0% 0%, rgba(59, 130, 246, 0.30), transparent 60%),
        radial-gradient(760px 520px at 70% 5%, rgba(14, 165, 233, 0.20), transparent 60%),
        radial-gradient(1000px 700px at 100% 100%, rgba(139, 92, 246, 0.26), transparent 60%),
        radial-gradient(700px 500px at 30% 85%, rgba(236, 72, 153, 0.10), transparent 60%),
        linear-gradient(180deg, #EEF3FB 0%, #F4F1FB 100%);
    }
    [data-ofm-app-bg="dark"] {
      background-image:
        radial-gradient(1000px 620px at 0% 0%, rgba(37, 99, 235, 0.36), transparent 60%),
        radial-gradient(700px 480px at 75% 0%, rgba(14, 165, 233, 0.12), transparent 60%),
        radial-gradient(1000px 700px at 100% 100%, rgba(124, 58, 237, 0.30), transparent 60%),
        linear-gradient(180deg, #070D1C 0%, #0B1024 100%);
    }

    /* Frosted glass for every surface painted with the web glass palette (hooks/useColors.ts) */
    [style*="background-color: rgba(255, 255, 255, 0.56)"],
    [style*="background-color: rgba(241, 245, 249, 0.62)"],
    [style*="background-color: rgba(20, 30, 46, 0.52)"],
    [style*="background-color: rgba(26, 37, 64, 0.58)"] {
      backdrop-filter: blur(18px) saturate(160%);
      -webkit-backdrop-filter: blur(18px) saturate(160%);
    }
    [data-ofm-app-bg="light"] [style*="background-color: rgba(255, 255, 255, 0.56)"] {
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 6px 20px -8px rgba(30, 41, 59, 0.12);
    }
    [data-ofm-app-bg="dark"] [style*="background-color: rgba(20, 30, 46, 0.52)"] {
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 28px -10px rgba(0, 0, 0, 0.5);
    }

    /* Sidebar / header glass edges */
    [data-ofm-app-bg="light"] [data-ofm-sidebar], [data-ofm-app-bg="light"] [data-ofm-topbar] {
      border-color: rgba(255, 255, 255, 0.75) !important;
    }
    [data-ofm-app-bg="dark"] [data-ofm-sidebar], [data-ofm-app-bg="dark"] [data-ofm-topbar] {
      border-color: rgba(255, 255, 255, 0.07) !important;
    }

    /* Dialogs: blur the page behind, keep the dialog surface itself near-opaque for crisp forms */
    [aria-modal="true"] {
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    [aria-modal="true"] [style*="background-color: rgba(255, 255, 255, 0.56)"] {
      background-color: rgba(255, 255, 255, 0.94) !important;
    }
    [aria-modal="true"] [style*="background-color: rgba(20, 30, 46, 0.52)"] {
      background-color: rgba(17, 25, 40, 0.94) !important;
    }

    /* ─── Sign-in screen: aurora backdrop + glassmorphism ─── */

    @keyframes ofmOrbDrift {
      0%   { transform: translate3d(0, 0, 0) scale(1); }
      50%  { transform: translate3d(40px, -30px, 0) scale(1.08); }
      100% { transform: translate3d(0, 0, 0) scale(1); }
    }

    @keyframes ofmFloatY {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-10px); }
    }

    [data-ofm-auth-bg] {
      overflow: hidden;
      background:
        radial-gradient(1200px 600px at 10% -10%, rgba(37, 99, 235, 0.35), transparent 60%),
        radial-gradient(900px 600px at 110% 110%, rgba(124, 58, 237, 0.28), transparent 60%),
        linear-gradient(160deg, #050B1A 0%, #0A1530 55%, #0B1022 100%);
    }
    [data-ofm-orb-a], [data-ofm-orb-b], [data-ofm-orb-c] {
      position: absolute;
      border-radius: 50%;
      filter: blur(70px);
      opacity: 0.55;
      will-change: transform;
    }
    [data-ofm-orb-a] {
      width: 420px; height: 420px; top: -120px; left: -80px;
      background: radial-gradient(circle, #2563EB 0%, transparent 70%);
      animation: ofmOrbDrift 18s ease-in-out infinite;
    }
    [data-ofm-orb-b] {
      width: 380px; height: 380px; bottom: -140px; right: -60px;
      background: radial-gradient(circle, #7C3AED 0%, transparent 70%);
      animation: ofmOrbDrift 22s ease-in-out infinite reverse;
    }
    [data-ofm-orb-c] {
      width: 300px; height: 300px; top: 40%; left: 45%;
      background: radial-gradient(circle, #0EA5E9 0%, transparent 70%);
      opacity: 0.3;
      animation: ofmOrbDrift 26s ease-in-out infinite;
    }
    [data-ofm-auth-grid] {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
      background-size: 48px 48px;
      -webkit-mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);
      mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);
    }

    /* Frosted glass surfaces */
    [data-ofm-glass], [data-ofm-auth-card] {
      backdrop-filter: blur(22px) saturate(160%);
      -webkit-backdrop-filter: blur(22px) saturate(160%);
    }
    [data-ofm-auth-card] {
      box-shadow: 0 24px 64px rgba(2, 6, 23, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      animation: ofmFadeSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    [data-ofm-auth-hero] {
      animation: ofmFadeSlideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    [data-ofm-float] {
      animation: ofmFloatY 7s ease-in-out infinite;
    }

    /* Gradient primary buttons */
    [data-ofm-gradient-btn] {
      background-image: linear-gradient(135deg, #3B82F6 0%, #6366F1 100%);
      box-shadow: 0 8px 22px rgba(59, 130, 246, 0.35);
      transition: box-shadow 0.2s ease, transform 0.15s ease, filter 0.2s ease;
    }
    [data-ofm-gradient-btn]:hover {
      filter: brightness(1.08);
      box-shadow: 0 10px 28px rgba(99, 102, 241, 0.45);
    }
    [data-ofm-gradient-btn]:active {
      transform: scale(0.985);
    }

    /* Inputs on the dark glass card */
    [data-ofm-auth] input {
      caret-color: #7DD3FC;
    }
    [data-ofm-auth] input::placeholder {
      color: rgba(203, 213, 225, 0.5);
    }
    [data-ofm-auth] input:-webkit-autofill,
    [data-ofm-auth] input:-webkit-autofill:hover,
    [data-ofm-auth] input:-webkit-autofill:focus {
      -webkit-text-fill-color: #F8FAFC;
      -webkit-box-shadow: 0 0 0 1000px rgba(15, 23, 42, 0.01) inset;
      transition: background-color 9999s ease-out 0s;
    }

    /* Respect Reduced Motion */
    @media (prefers-reduced-motion: reduce) {
      *, ::before, ::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  `;

  const styleEl = document.createElement("style");
  styleEl.id = styleId;
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}
