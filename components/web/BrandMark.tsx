import React from "react";
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from "react-native-svg";

/**
 * OFM brand mark — green tile with three rising bars and a trend tick.
 * Pure vector, so it stays crisp at any size (sidebar, top bar, sign-in, favicon).
 * Keep in sync with /public/favicon.svg.
 */
export function BrandMark({ size = 36 }: { size?: number }) {
  const id = React.useRef(`ofmMark${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3DB82A" />
          <Stop offset="1" stopColor="#1C7F12" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="48" height="48" rx="12" fill={`url(#${id})`} />
      <Rect x="12" y="27" width="6" height="10" rx="2" fill="#FFFFFF" fillOpacity={0.7} />
      <Rect x="21" y="21" width="6" height="16" rx="2" fill="#FFFFFF" fillOpacity={0.85} />
      <Rect x="30" y="15" width="6" height="22" rx="2" fill="#FFFFFF" />
      <Path
        d="M11 21.5 L19 15.5 L24 18.5 L34.5 10.5"
        stroke="#FFFFFF"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M30.5 10 H35 V14.5" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
