import React from "react";
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle, G, Line } from "react-native-svg";

// Finance dashboard illustration for the web sign-in screen (pure vector, no network assets)
export function AuthIllustration({ width = 460 }: { width?: number }) {
  const height = Math.round(width * 0.72);
  return (
    <Svg width={width} height={height} viewBox="0 0 460 330">
      <Defs>
        <LinearGradient id="ofmPanel" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.04" />
        </LinearGradient>
        <LinearGradient id="ofmArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#38BDF8" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="ofmLine" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#38BDF8" />
          <Stop offset="1" stopColor="#818CF8" />
        </LinearGradient>
        <LinearGradient id="ofmBar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#34D399" />
          <Stop offset="1" stopColor="#059669" />
        </LinearGradient>
        <LinearGradient id="ofmShield" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#6366F1" />
          <Stop offset="1" stopColor="#3B82F6" />
        </LinearGradient>
      </Defs>

      {/* Main dashboard panel */}
      <Rect x="20" y="30" width="330" height="230" rx="22" fill="url(#ofmPanel)" stroke="#FFFFFF" strokeOpacity="0.18" />
      <Circle cx="44" cy="54" r="4" fill="#F87171" />
      <Circle cx="58" cy="54" r="4" fill="#FBBF24" />
      <Circle cx="72" cy="54" r="4" fill="#34D399" />
      <Rect x="44" y="76" width="96" height="9" rx="4.5" fill="#FFFFFF" fillOpacity="0.55" />
      <Rect x="44" y="92" width="150" height="20" rx="6" fill="#FFFFFF" fillOpacity="0.9" />
      <Rect x="250" y="80" width="76" height="24" rx="12" fill="#34D399" fillOpacity="0.18" stroke="#34D399" strokeOpacity="0.5" />
      <Path d="M266 96 L272 88 L278 93 L286 85" stroke="#34D399" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Rect x="292" y="88" width="24" height="7" rx="3.5" fill="#34D399" fillOpacity="0.8" />

      {/* Grid lines */}
      <G opacity={0.14}>
        <Line x1="44" y1="150" x2="326" y2="150" stroke="#FFFFFF" />
        <Line x1="44" y1="185" x2="326" y2="185" stroke="#FFFFFF" />
        <Line x1="44" y1="220" x2="326" y2="220" stroke="#FFFFFF" />
      </G>

      {/* Revenue trend area */}
      <Path
        d="M44 214 C 74 204, 92 182, 120 186 S 168 206, 196 176 S 246 150, 270 158 S 310 132, 326 128 L 326 240 L 44 240 Z"
        fill="url(#ofmArea)"
      />
      <Path
        d="M44 214 C 74 204, 92 182, 120 186 S 168 206, 196 176 S 246 150, 270 158 S 310 132, 326 128"
        stroke="url(#ofmLine)"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx="326" cy="128" r="6" fill="#818CF8" stroke="#FFFFFF" strokeWidth="2.5" />

      {/* Budget ring card */}
      <Rect x="300" y="168" width="140" height="140" rx="22" fill="#0F172A" fillOpacity="0.72" stroke="#FFFFFF" strokeOpacity="0.16" />
      <Circle cx="370" cy="226" r="34" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="10" fill="none" />
      <Circle
        cx="370"
        cy="226"
        r="34"
        stroke="#38BDF8"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="150 214"
        transform="rotate(-90 370 226)"
      />
      <Circle
        cx="370"
        cy="226"
        r="34"
        stroke="#A78BFA"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="44 214"
        strokeDashoffset="-158"
        transform="rotate(-90 370 226)"
      />
      <Rect x="352" y="221" width="36" height="9" rx="4.5" fill="#FFFFFF" fillOpacity="0.85" />
      <Rect x="326" y="278" width="52" height="7" rx="3.5" fill="#FFFFFF" fillOpacity="0.45" />
      <Rect x="386" y="278" width="30" height="7" rx="3.5" fill="#38BDF8" fillOpacity="0.8" />

      {/* Payroll / bar card */}
      <Rect x="0" y="236" width="150" height="86" rx="18" fill="#0F172A" fillOpacity="0.72" stroke="#FFFFFF" strokeOpacity="0.16" />
      <Rect x="18" y="254" width="58" height="7" rx="3.5" fill="#FFFFFF" fillOpacity="0.5" />
      <Rect x="20" y="290" width="12" height="18" rx="3" fill="url(#ofmBar)" opacity={0.55} />
      <Rect x="40" y="280" width="12" height="28" rx="3" fill="url(#ofmBar)" opacity={0.7} />
      <Rect x="60" y="272" width="12" height="36" rx="3" fill="url(#ofmBar)" opacity={0.85} />
      <Rect x="80" y="284" width="12" height="24" rx="3" fill="url(#ofmBar)" opacity={0.7} />
      <Rect x="100" y="266" width="12" height="42" rx="3" fill="url(#ofmBar)" />
      <Rect x="120" y="276" width="12" height="32" rx="3" fill="url(#ofmBar)" opacity={0.85} />

      {/* Security shield badge */}
      <Circle cx="392" cy="56" r="40" fill="url(#ofmShield)" opacity={0.95} />
      <Path
        d="M392 30 L410 37 V54 C410 67 402 76 392 81 C382 76 374 67 374 54 V37 Z"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
      <Path d="M384 55 L390 61 L401 49" stroke="#4F46E5" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* Floating accents */}
      <Circle cx="250" cy="14" r="6" fill="#38BDF8" opacity={0.7} />
      <Circle cx="180" cy="300" r="5" fill="#A78BFA" opacity={0.7} />
      <Circle cx="446" cy="150" r="4" fill="#34D399" opacity={0.8} />
    </Svg>
  );
}
