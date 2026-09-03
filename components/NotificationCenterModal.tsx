import React, { useState, useMemo } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "./UniversalIcon";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  AppNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotificationRecord,
} from "@/services/notificationService";

interface Props {
  visible: boolean;
  onClose: () => void;
  notifications: AppNotification[];
}

function getTimeAgo(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

export function NotificationCenterModal({ visible, onClose, notifications }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;

  const [filter, setFilter] = useState<"all" | "unread" | "critical">("all");

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "unread") return !n.read;
      if (filter === "critical") return n.severity === "CRITICAL" || n.severity === "WARNING";
      return true;
    });
  }, [notifications, filter]);

  const handleSelect = async (item: AppNotification) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!item.read) {
      await markNotificationAsRead(item.id);
    }
    if (item.actionRoute) {
      onClose();
      router.push(item.actionRoute as any);
    }
  };

  const handleMarkAllRead = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markAllNotificationsAsRead(notifications);
  };

  const handleDelete = async (id: string, e: any) => {
    e.stopPropagation();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await deleteNotificationRecord(id);
  };

  const getSeverityStyle = (severity: AppNotification["severity"]) => {
    switch (severity) {
      case "CRITICAL":
        return { color: "#EF4444", bg: "#EF444418", border: "#EF444440", icon: "alert-octagon" as const };
      case "WARNING":
        return { color: "#F59E0B", bg: "#F59E0B18", border: "#F59E0B40", icon: "alert-triangle" as const };
      case "SUCCESS":
        return { color: "#10B981", bg: "#10B98118", border: "#10B98140", icon: "check-circle" as const };
      default:
        return { color: "#38BDF8", bg: "#38BDF818", border: "#38BDF840", icon: "info" as const };
    }
  };

  const isWeb = Platform.OS === "web";

  const modalBody = (
    <View style={[isWeb ? styles.webDialog : styles.container, { backgroundColor: colors.background, borderColor: colors.border }, !isWeb && { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={[styles.bellBox, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="bell" size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? "s" : ""}` : "All systems up to date"}
            </Text>
          </View>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markReadBtn} onPress={handleMarkAllRead} activeOpacity={0.8}>
            <Text style={[styles.markReadText, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.card }]} onPress={onClose} activeOpacity={0.8}>
          <Feather name="x" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {[
          { id: "all", label: `All (${notifications.length})` },
          { id: "unread", label: `Unread (${unreadCount})` },
          { id: "critical", label: "Alerts & Warnings" },
        ].map((tab) => {
          const active = filter === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter(tab.id as any)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: active ? "#FFFFFF" : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Notification List */}
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {filteredNotifications.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIconBox, { backgroundColor: colors.muted }]}>
              <Feather name="bell-off" size={28} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Notifications</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {filter === "unread"
                ? "You're all caught up! No unread system alerts."
                : "No notifications found in this category."}
            </Text>
          </View>
        ) : (
          filteredNotifications.map((item) => {
            const sev = getSeverityStyle(item.severity);
            const timeAgo = getTimeAgo(item.createdAt);

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: item.read ? colors.card : colors.primary + "08",
                    borderColor: item.read ? colors.border : colors.primary + "30",
                  },
                ]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.sevBadge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
                    <Feather name={sev.icon} size={11} color={sev.color} />
                    <Text style={[styles.sevText, { color: sev.color }]}>{item.severity}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{timeAgo}</Text>
                    <TouchableOpacity
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={(e) => handleDelete(item.id, e)}
                    >
                      <Feather name="trash-2" size={13} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
                <Text style={[styles.cardMessage, { color: colors.mutedForeground }]}>{item.message}</Text>

                {Boolean(item.actionRoute) && (
                  <View style={styles.actionRow}>
                    <Text style={[styles.actionText, { color: colors.primary }]}>View Details →</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} transparent={isWeb} animationType={isWeb ? "fade" : "slide"} onRequestClose={onClose}>
      {isWeb ? (
        <View style={styles.webBackdrop}>
          {modalBody}
        </View>
      ) : (
        modalBody
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  webDialog: {
    width: "100%",
    maxWidth: 540,
    maxHeight: "85%" as any,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  bellBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  markReadBtn: {
    marginRight: 10,
  },
  markReadText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  listContent: {
    padding: 20,
    gap: 12,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 30,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sevBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  sevText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  timeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  cardMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  actionRow: {
    marginTop: 8,
  },
  actionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
