// UniversalIcon: Multiplatform SVG icon wrapper for OFM web & native
import React from "react";
import {
  SvgSun,
  SvgMoon,
  SvgMail,
  SvgLock,
  SvgUser,
  SvgUsers,
  SvgUserPlus,
  SvgBriefcase,
  SvgEye,
  SvgEyeOff,
  SvgShield,
  SvgDollar,
  SvgChart,
  SvgPieChart,
  SvgArrowUpRight,
  SvgArrowDownLeft,
  SvgArrowDownRight,
  SvgArrowLeft,
  SvgArrowRight,
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
  SvgLogIn,
  SvgBell,
  SvgBellOff,
  SvgSearch,
  SvgChevronDown,
  SvgChevronLeft,
  SvgChevronRight,
  SvgChevronUp,
  SvgPlus,
  SvgMinus,
  SvgZap,
  SvgAlertCircle,
  SvgAlertTriangle,
  SvgAlertOctagon,
  SvgInfo,
  SvgTarget,
  SvgCheck,
  SvgCheckCircle,
  SvgExternalLink,
  SvgX,
  SvgXCircle,
  SvgTrash,
  SvgEdit,
  SvgCalendar,
  SvgUpload,
  SvgDownload,
  SvgBarChart2,
  SvgClock,
  SvgAward,
  SvgActivity,
  SvgBookOpen,
  SvgPrinter,
  SvgShare2,
  SvgCamera,
  SvgImage,
  SvgRotateCcw,
  SvgRefreshCw,
  SvgFilter,
  SvgHelpCircle,
  SvgCopy,
  SvgHome,
  SvgMoreVertical,
  SvgMoreHorizontal,
  SvgArrowUpCircle,
  SvgArrowDownCircle,
  SvgSend,
  SvgUserCheck,
  SvgUserX,
  SvgCornerDownRight,
  SvgFolder,
  SvgInbox,
  SvgHeart,
  SvgMonitor,
  SvgTool,
  SvgNavigation,
} from "./web/SvgIcons";

export interface UniversalIconProps {
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
    case "x-circle":
      return <SvgXCircle size={size} color={color} />;
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
    case "arrow-down-right":
      return <SvgArrowDownRight size={size} color={color} />;
    case "arrow-left":
      return <SvgArrowLeft size={size} color={color} />;
    case "arrow-right":
      return <SvgArrowRight size={size} color={color} />;
    case "layers":
      return <SvgLayers size={size} color={color} />;
    case "file-text":
    case "file":
      return <SvgFileText size={size} color={color} />;
    case "bar-chart-2":
    case "bar-chart":
      return <SvgBarChart2 size={size} color={color} />;
    case "chart":
      return <SvgChart size={size} color={color} />;
    case "pie-chart":
      return <SvgPieChart size={size} color={color} />;
    case "award":
      return <SvgAward size={size} color={color} />;
    case "check":
      return <SvgCheck size={size} color={color} />;
    case "check-circle":
      return <SvgCheckCircle size={size} color={color} />;
    case "alert-circle":
      return <SvgAlertCircle size={size} color={color} />;
    case "alert-triangle":
      return <SvgAlertTriangle size={size} color={color} />;
    case "alert-octagon":
      return <SvgAlertOctagon size={size} color={color} />;
    case "info":
      return <SvgInfo size={size} color={color} />;
    case "target":
      return <SvgTarget size={size} color={color} />;
    case "chevron-down":
      return <SvgChevronDown size={size} color={color} />;
    case "chevron-right":
      return <SvgChevronRight size={size} color={color} />;
    case "chevron-left":
      return <SvgChevronLeft size={size} color={color} />;
    case "chevron-up":
      return <SvgChevronUp size={size} color={color} />;
    case "plus":
      return <SvgPlus size={size} color={color} />;
    case "minus":
      return <SvgMinus size={size} color={color} />;
    case "search":
      return <SvgSearch size={size} color={color} />;
    case "settings":
      return <SvgSettings size={size} color={color} />;
    case "bell":
      return <SvgBell size={size} color={color} />;
    case "bell-off":
      return <SvgBellOff size={size} color={color} />;
    case "user":
      return <SvgUser size={size} color={color} />;
    case "users":
      return <SvgUsers size={size} color={color} />;
    case "user-plus":
      return <SvgUserPlus size={size} color={color} />;
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
      return <SvgUpload size={size} color={color} />;
    case "download":
      return <SvgDownload size={size} color={color} />;
    case "shield":
      return <SvgShield size={size} color={color} />;
    case "dollar-sign":
    case "dollar":
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
    case "log-in":
      return <SvgLogIn size={size} color={color} />;
    case "menu":
      return <SvgMenu size={size} color={color} />;
    case "grid":
      return <SvgGrid size={size} color={color} />;
    case "list":
      return <SvgList size={size} color={color} />;
    case "cpu":
      return <SvgCpu size={size} color={color} />;
    case "zap":
      return <SvgZap size={size} color={color} />;
    case "external-link":
      return <SvgExternalLink size={size} color={color} />;
    case "printer":
      return <SvgPrinter size={size} color={color} />;
    case "share-2":
    case "share":
      return <SvgShare2 size={size} color={color} />;
    case "camera":
      return <SvgCamera size={size} color={color} />;
    case "image":
      return <SvgImage size={size} color={color} />;
    case "rotate-ccw":
      return <SvgRotateCcw size={size} color={color} />;
    case "refresh-cw":
    case "refresh":
      return <SvgRefreshCw size={size} color={color} />;
    case "filter":
      return <SvgFilter size={size} color={color} />;
    case "help-circle":
      return <SvgHelpCircle size={size} color={color} />;
    case "copy":
      return <SvgCopy size={size} color={color} />;
    case "home":
      return <SvgHome size={size} color={color} />;
    case "more-vertical":
      return <SvgMoreVertical size={size} color={color} />;
    case "more-horizontal":
      return <SvgMoreHorizontal size={size} color={color} />;
    case "arrow-up-circle":
      return <SvgArrowUpCircle size={size} color={color} />;
    case "arrow-down-circle":
      return <SvgArrowDownCircle size={size} color={color} />;
    case "send":
      return <SvgSend size={size} color={color} />;
    case "user-check":
      return <SvgUserCheck size={size} color={color} />;
    case "user-x":
      return <SvgUserX size={size} color={color} />;
    case "corner-down-right":
      return <SvgCornerDownRight size={size} color={color} />;
    case "folder":
      return <SvgFolder size={size} color={color} />;
    case "inbox":
      return <SvgInbox size={size} color={color} />;
    case "heart":
      return <SvgHeart size={size} color={color} />;
    case "monitor":
      return <SvgMonitor size={size} color={color} />;
    case "tool":
      return <SvgTool size={size} color={color} />;
    case "navigation":
      return <SvgNavigation size={size} color={color} />;
    default:
      return <SvgBarChart2 size={size} color={color} />;
  }
}

export const Feather = UniversalFeather;
