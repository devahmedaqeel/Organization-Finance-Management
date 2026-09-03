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
