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
        
        {/* Force Clear Stale ServiceWorker and Browser Disk Cache */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (typeof window !== 'undefined') {
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(regs) {
                  for (var r of regs) r.unregister();
                });
              }
              if ('caches' in window) {
                caches.keys().then(function(keys) {
                  for (var k of keys) caches.delete(k);
                });
              }
            }
          } catch (e) {}
        `}} />
        
        {/* Preconnect and Load Google Inter Font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          /* Universal Global Typography & Sans-Serif Reset */
          html, body, #root {
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #060D1F;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            -webkit-text-size-adjust: 100%;
            overflow-x: hidden;
          }

          /* Force modern sans-serif across all native & web text elements */
          * {
            box-sizing: border-box;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-tap-highlight-color: transparent;
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

          /* Explicit Expo Font Family Aliases with Robust Native Fallbacks */
          @font-face {
            font-family: 'Inter_400Regular';
            src: local('Inter Regular'), local('Inter-Regular'), local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), local('Helvetica Neue'), local('Arial');
            font-weight: 400;
            font-display: swap;
          }
          @font-face {
            font-family: 'Inter_500Medium';
            src: local('Inter Medium'), local('Inter-Medium'), local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), local('Helvetica Neue'), local('Arial');
            font-weight: 500;
            font-display: swap;
          }
          @font-face {
            font-family: 'Inter_600SemiBold';
            src: local('Inter SemiBold'), local('Inter-SemiBold'), local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), local('Helvetica Neue'), local('Arial');
            font-weight: 600;
            font-display: swap;
          }
          @font-face {
            font-family: 'Inter_700Bold';
            src: local('Inter Bold'), local('Inter-Bold'), local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), local('Helvetica Neue'), local('Arial');
            font-weight: 700;
            font-display: swap;
          }
          @font-face {
            font-family: 'Inter_800ExtraBold';
            src: local('Inter ExtraBold'), local('Inter-ExtraBold'), local('Inter'), local('-apple-system'), local('BlinkMacSystemFont'), local('Segoe UI'), local('Roboto'), local('Helvetica Neue'), local('Arial');
            font-weight: 800;
            font-display: swap;
          }

          /* Icon Fonts */
          @font-face {
            font-family: 'Feather';
            src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.0/build/vendor/react-native-vector-icons/Fonts/Feather.ttf') format('truetype');
            font-display: swap;
          }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
