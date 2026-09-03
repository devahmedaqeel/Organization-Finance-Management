import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <title>OFM — Organization Finance Management</title>
        <meta
          name="description"
          content="OFM — Organization Finance Management. Enterprise Cloud Ledger, Budget Allocations, Payroll Administration, and Real-time Auditing."
        />
        <meta name="theme-color" content="#060D1F" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png?v=5" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon.png?v=5" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon.png?v=5" />
        <link rel="shortcut icon" href="/favicon.ico?v=5" />
        
        {/* Preconnect and Asynchronously Load Google Inter Font (Non-blocking) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
          media="print"
          // @ts-ignore
          onLoad="this.media='all'"
        />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          /* Universal Global Typography & Sans-Serif Reset */
          html, body, #root {
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #060D1F;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            -webkit-text-size-adjust: 100%;
            overflow-x: hidden;
          }

          /* Modern box sizing & base defaults without clobbering icon fonts */
          *, ::before, ::after {
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
          }

          button, input, select, textarea {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }

          /* React Native Web Font Style Overrides (Guarantees no serif/Times New Roman fallback) */
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
          [style*="Inter_900Black"], [style*="Inter_900"] {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            font-weight: 900 !important;
          }

          /* Explicit Icon Font Protections - Ensures vector icon glyphs NEVER get overwritten by text fonts */
          [style*="font-family: Feather"], [style*="font-family: feather"], [style*="font-family:Feather"], [style*="font-family:feather"],
          [style*="fontFamily: Feather"], [style*="fontFamily: feather"] {
            font-family: 'Feather', 'feather' !important;
          }
          [style*="font-family: Ionicons"], [style*="font-family: ionicons"], [style*="font-family:Ionicons"], [style*="font-family:ionicons"],
          [style*="fontFamily: Ionicons"], [style*="fontFamily: ionicons"] {
            font-family: 'Ionicons', 'ionicons' !important;
          }
          [style*="font-family: MaterialIcons"], [style*="font-family: Material Icons"], [style*="font-family: material"], [style*="font-family:MaterialIcons"],
          [style*="fontFamily: MaterialIcons"], [style*="fontFamily: material"] {
            font-family: 'MaterialIcons', 'Material Icons', 'material' !important;
          }
          [style*="font-family: MaterialCommunityIcons"], [style*="font-family: material-community"], [style*="font-family:MaterialCommunityIcons"],
          [style*="fontFamily: MaterialCommunityIcons"], [style*="fontFamily: material-community"] {
            font-family: 'MaterialCommunityIcons', 'material-community' !important;
          }
          [style*="font-family: FontAwesome"], [style*="font-family: fontawesome"], [style*="font-family:FontAwesome"],
          [style*="fontFamily: FontAwesome"], [style*="fontFamily: fontawesome"] {
            font-family: 'FontAwesome', 'fontawesome' !important;
          }

          /* Smooth Momentum Touch Scrolling for All Scrollable Panes */
          div[style*="overflow: auto"],
          div[style*="overflow-x: auto"],
          div[style*="overflow-y: auto"],
          div[style*="overflow: scroll"],
          div[style*="overflow-x: scroll"],
          div[style*="overflow-y: scroll"],
          .tableCard,
          [data-testid="scroll-container"] {
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: thin;
            scrollbar-color: rgba(99, 102, 241, 0.4) transparent;
          }

          /* Sleek Enterprise Custom Scrollbars for Web & Mobile Browsers */
          ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.28);
            border-radius: 6px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(99, 102, 241, 0.6);
          }

          /* Icon Fonts */
          @font-face {
            font-family: 'feather';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/Feather.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'Feather';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/Feather.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'Ionicons';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'ionicons';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'MaterialCommunityIcons';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'material-community';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'MaterialIcons';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'material';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'FontAwesome';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf') format('truetype');
            font-display: swap;
          }
          @font-face {
            font-family: 'fontawesome';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf') format('truetype');
            font-display: swap;
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

          /* Keyframe animation for initial high-speed loader bar */
          @keyframes ofmProgress {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(30%); }
            100% { transform: translateX(200%); }
          }
        ` }} />
      </head>
      <body>
        <div id="root">
          {/* Instant Native Splash (Replaced instantly upon React hydration) */}
          <div
            id="ofm-initial-splash"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#060D1F",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 999999,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: 20,
                backgroundColor: "#1D4ED8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 12px 28px rgba(29, 78, 216, 0.45)",
                marginBottom: 16,
              }}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <div style={{ color: "#FFFFFF", fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px", marginBottom: 4 }}>
              OFM Cloud
            </div>
            <div style={{ color: "#94A3B8", fontSize: 11.5, fontWeight: 500, letterSpacing: "0.2px", marginBottom: 26 }}>
              Enterprise Financial Ledger
            </div>
            <div style={{ width: 130, height: 4, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.12)", overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: "50%",
                  backgroundColor: "#38BDF8",
                  borderRadius: 2,
                  animation: "ofmProgress 1.4s infinite ease-in-out",
                }}
              />
            </div>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
