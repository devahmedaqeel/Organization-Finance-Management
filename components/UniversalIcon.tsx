import React from "react";
import Svg, { Path, Circle, Rect, Polyline, Line, Polygon } from "react-native-svg";
import {
  SvgSun,
  SvgMoon,
  SvgMail,
  SvgLock,
  SvgUser,
  SvgUsers,
  SvgBriefcase,
  SvgEye,
  SvgEyeOff,
  SvgShield,
  SvgDollar,
  SvgChart,
  SvgPieChart,
  SvgArrowUpRight,
  SvgArrowDownLeft,
  SvgTrendingUp,
  SvgTrendingDown,
  SvgFileText,
  SvgGrid,
  SvgList,
  SvgLayers,
  SvgCpu,
  SvgSettings,
  SvgMenu,
  SvgLogOut,
  SvgBell,
  SvgSearch,
  SvgChevronDown,
  SvgChevronLeft,
  SvgChevronRight,
  SvgPlus,
  SvgZap,
  SvgLogIn,
  SvgUserPlus,
  SvgAlertCircle,
  SvgCheck,
  SvgExternalLink,
  SvgX,
  SvgTrash,
  SvgEdit,
  SvgCalendar,
  SvgUpload,
  SvgBarChart2,
  SvgClock,
  SvgAward,
  SvgActivity,
  SvgBookOpen,
} from "./web/SvgIcons";

interface UniversalIconProps {
  name: string;
  size?: number;
  color?: string;
  style?: any;
}

export function UniversalFeather({ name, size = 16, color = "#94A3B8" }: UniversalIconProps) {
  switch (name) {
    case "trending-up":
      return <SvgTrendingUp size={size} color={color} />;
    case "trending-down":
      return <SvgTrendingDown size={size} color={color} />;
    case "x":
      return <SvgX size={size} color={color} />;
    case "activity":
      return <SvgActivity size={size} color={color} />;
    case "book-open":
    case "book":
      return <SvgBookOpen size={size} color={color} />;
    case "calendar":
      return <SvgCalendar size={size} color={color} />;
    case "arrow-down-left":
      return <SvgArrowDownLeft size={size} color={color} />;
    case "arrow-up-right":
      return <SvgArrowUpRight size={size} color={color} />;
    case "layers":
      return <SvgLayers size={size} color={color} />;
    case "file-text":
    case "file":
      return <SvgFileText size={size} color={color} />;
    case "bar-chart-2":
    case "bar-chart":
      return <SvgBarChart2 size={size} color={color} />;
    case "pie-chart":
      return <SvgPieChart size={size} color={color} />;
    case "award":
      return <SvgAward size={size} color={color} />;
    case "check":
    case "check-circle":
      return <SvgCheck size={size} color={color} />;
    case "alert-circle":
    case "alert-triangle":
      return <SvgAlertCircle size={size} color={color} />;
    case "chevron-down":
      return <SvgChevronDown size={size} color={color} />;
    case "chevron-right":
      return <SvgChevronRight size={size} color={color} />;
    case "chevron-left":
      return <SvgChevronLeft size={size} color={color} />;
    case "chevron-up":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="18 15 12 9 6 15" />
        </Svg>
      );
    case "plus":
      return <SvgPlus size={size} color={color} />;
    case "minus":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Line x1="5" y1="12" x2="19" y2="12" />
        </Svg>
      );
    case "corner-down-right":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="15 10 20 15 15 20" />
          <Path d="M4 4v7a4 4 0 0 0 4 4h12" />
        </Svg>
      );
    case "search":
      return <SvgSearch size={size} color={color} />;
    case "settings":
      return <SvgSettings size={size} color={color} />;
    case "bell":
      return <SvgBell size={size} color={color} />;
    case "user":
      return <SvgUser size={size} color={color} />;
    case "users":
      return <SvgUsers size={size} color={color} />;
    case "trash-2":
    case "trash":
      return <SvgTrash size={size} color={color} />;
    case "edit-2":
    case "edit-3":
    case "edit":
      return <SvgEdit size={size} color={color} />;
    case "clock":
      return <SvgClock size={size} color={color} />;
    case "upload":
    case "download":
      return <SvgUpload size={size} color={color} />;
    case "shield":
      return <SvgShield size={size} color={color} />;
    case "dollar-sign":
      return <SvgDollar size={size} color={color} />;
    case "sun":
      return <SvgSun size={size} color={color} />;
    case "moon":
      return <SvgMoon size={size} color={color} />;
    case "lock":
      return <SvgLock size={size} color={color} />;
    case "mail":
      return <SvgMail size={size} color={color} />;
    case "briefcase":
      return <SvgBriefcase size={size} color={color} />;
    case "eye":
      return <SvgEye size={size} color={color} />;
    case "eye-off":
      return <SvgEyeOff size={size} color={color} />;
    case "log-out":
      return <SvgLogOut size={size} color={color} />;
    case "menu":
      return <SvgMenu size={size} color={color} />;
    default:
      return <SvgBarChart2 size={size} color={color} />;
  }
}

export const Feather = UniversalFeather;
