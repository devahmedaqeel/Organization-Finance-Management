import { Feather } from "@/components/UniversalIcon";
import { screenTopPadding } from "@/utils/layout";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth, User, UserRole } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { useRequirePermission } from "@/hooks/useRequirePermission";
import { useBottomSheetLayout } from "@/hooks/useBottomSheetLayout";
import { showFloatingToast } from "@/utils/toast";
import { enqueueOperation } from "@/services/offlineSyncService";

// Role presentation: colour, icon, short title and what the role can do
const ROLE_INFO: Record<UserRole, { color: string; label: string; title: string; icon: string; description: string }> = {
  admin: { color: "#6366F1", label: "ADMIN", title: "Admin", icon: "shield", description: "Full control: finances, team, settings & reports" },
  accountant: { color: "#10B981", label: "ACCOUNTANT", title: "Accountant", icon: "edit-3", description: "Records transactions, payroll and receipts" },
  manager: { color: "#8B5CF6", label: "MANAGER", title: "Manager", icon: "briefcase", description: "Allocates budgets, approves expenses, views reports" },
  employee: { color: "#0EA5E9", label: "EMPLOYEE", title: "Employee", icon: "user", description: "Own payslips, claims and staff portal only" },
};
const ROLE_ORDER: UserRole[] = ["admin", "accountant", "manager", "employee"];

const AVATAR_PALETTE = ["#F43F5E", "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#0EA5E9", "#EC4899"];

function getAvatarColor(name: string) {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

export default function TeamScreen() {
  const colors = useColors();
  // Role guard: leave if this role can't use this screen (e.g. opened via deep link)
  useRequirePermission("manage_team");
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { maxHeight: sheetMaxHeight, keyboardHeight, scrollRef: sheetScrollRef, onTouchEnd: sheetOnTouchEnd, sheetBottomInset } = useBottomSheetLayout();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const canInvite = user?.role === "admin";

  // State Management
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  
  // Invitation Modal states
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("accountant");
  const [sendingInvite, setSendingInvite] = useState(false);

  // Member Details / Role Management modal state
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [memberModalVisible, setMemberModalVisible] = useState(false);

  // Safe Haptic Helper for Web & Mobile
  const safeHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== "web") {
      try {
        Haptics.impactAsync(style);
      } catch {}
    }
  };

  const handleUpdateRole = async (targetUser: User, newRole: UserRole) => {
    if (targetUser.role === newRole) return;
    // An admin changing their own role could leave the organization with no admin at all
    if ((targetUser.email || "").toLowerCase() === (user?.email || "").toLowerCase() || targetUser.id === user?.id) {
      showFloatingToast("Not allowed", "You can't change your own role. Ask another admin to do it.");
      return;
    }
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);

    // Optimistically update local state
    setMembers((prev) =>
      prev.map((m) => (m.id === targetUser.id ? { ...m, role: newRole } : m))
    );
    if (selectedMember && selectedMember.id === targetUser.id) {
      setSelectedMember({ ...selectedMember, role: newRole });
    }

    const userOrgId = user?.organizationId || "demo-org";
    if (targetUser.id) {
      await enqueueOperation({
        entityType: "user",
        entityId: targetUser.id,
        operationType: "UPDATE",
        organizationId: userOrgId,
        userId: user?.id || "anonymous",
        payload: { ...targetUser, role: newRole, updatedAt: new Date().toISOString() },
      }).catch(() => {});

      try {
        const { doc, setDoc } = require("firebase/firestore");
        await setDoc(
          doc(db, "users", targetUser.id),
          { ...targetUser, role: newRole, updatedAt: new Date().toISOString() },
          { merge: true }
        );
        // Keep a pending invitation in sync: sign-up takes the role from the invitation
        const inviteEmail = (targetUser.email || "").toLowerCase().trim();
        if (inviteEmail) {
          const inviteRef = doc(db, "invitations", inviteEmail);
          const { getDoc } = require("firebase/firestore");
          const inviteSnap = await getDoc(inviteRef).catch(() => null);
          if (inviteSnap?.exists()) {
            await setDoc(inviteRef, { role: newRole, updatedAt: new Date().toISOString() }, { merge: true });
          }
        }
      } catch (err) {
        console.warn("Firebase role update notice:", err);
      }
    }
    showFloatingToast("Role Updated", `${targetUser.name} is now ${newRole.toUpperCase()}`);
  };

  const handleRemoveMember = (targetUser: User) => {
    if (targetUser.email === user?.email) {
      Alert.alert("Cannot Remove", "You cannot remove your own account from the team.");
      return;
    }
    safeHaptic(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Remove Team Member",
      `Are you sure you want to remove ${targetUser.name} (${targetUser.email}) from ${settings.organizationName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setMembers((prev) => prev.filter((m) => m.id !== targetUser.id));
            setMemberModalVisible(false);
            if (targetUser.id) {
              const userOrgId = user?.organizationId || "demo-org";
              await enqueueOperation({
                entityType: "user",
                entityId: targetUser.id,
                operationType: "DELETE",
                organizationId: userOrgId,
                userId: user?.id || "anonymous",
              }).catch(() => {});

              try {
                const { doc, deleteDoc } = require("firebase/firestore");
                await deleteDoc(doc(db, "users", targetUser.id));
              } catch (err) {
                console.warn("Firebase member delete notice:", err);
              }
            }
            showFloatingToast("Member Removed", `${targetUser.name} was removed from the team.`);
          },
        },
      ]
    );
  };

  // Load team members with live multi-device 2-way synchronization
  useEffect(() => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const orgId = user.organizationId || "default-org";

    const { onSnapshot } = require("firebase/firestore");
    const q = query(collection(db, "users"), where("organizationId", "==", orgId));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot: any) => {
        if (!querySnapshot.empty) {
          // One entry per email. Invites create a placeholder record ("u_<email>"); once the person
          // signs up their real account must win, so role changes reach the account they log in with.
          const byEmail = new Map<string, User>();
          querySnapshot.forEach((docSnap: any) => {
            const m = { id: docSnap.id, ...docSnap.data() } as User;
            const emailKey = (m.email || "").toLowerCase().trim();
            if (!emailKey) return;
            const current = byEmail.get(emailKey);
            const isPlaceholder = (id: string) => id.startsWith("u_");
            if (!current || (isPlaceholder(current.id) && !isPlaceholder(m.id))) {
              byEmail.set(emailKey, m);
            }
          });
          const fetched: User[] = Array.from(byEmail.values());

          // Sort members: Admins first, then alphabetically by name
          fetched.sort((a, b) => {
            if (a.role === "admin" && b.role !== "admin") return -1;
            if (a.role !== "admin" && b.role === "admin") return 1;
            return (a.name || a.email || "").localeCompare(b.name || b.email || "");
          });

          setMembers(fetched);
        } else {
          setMembers(user ? [user] : []);
        }
        setLoading(false);
        setRefreshing(false);
      },
      (err: any) => {
        if (err.code !== "permission-denied") {
          console.warn("Error subscribing team members:", err);
        }
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, [user?.id, user?.organizationId, settings.organizationName]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const ROLE_WEIGHT: Record<string, number> = {
    admin: 1,
    accountant: 2,
    manager: 3,
    employee: 4,
    viewer: 5,
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = members.filter((m) => {
      const matchSearch =
        (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q);
      const matchRole = selectedRole === "all" || m.role === selectedRole;
      return matchSearch && matchRole;
    });

    return list.sort((a, b) => {
      const isCurrentA = a.email?.toLowerCase() === user?.email?.toLowerCase();
      const isCurrentB = b.email?.toLowerCase() === user?.email?.toLowerCase();
      if (isCurrentA && !isCurrentB) return -1;
      if (!isCurrentA && isCurrentB) return 1;

      const weightA = ROLE_WEIGHT[(a.role || "").toLowerCase()] ?? 99;
      const weightB = ROLE_WEIGHT[(b.role || "").toLowerCase()] ?? 99;
      if (weightA !== weightB) return weightA - weightB;

      const nameA = (a.name || a.email || "").toLowerCase();
      const nameB = (b.name || b.email || "").toLowerCase();
      return (nameA || "").localeCompare(nameB || "");
    });
  }, [members, search, selectedRole, user?.email]);

  // Dynamic statistics
  const stats = useMemo(() => {
    return {
      total: members.length,
      admins: members.filter((m) => m.role === "admin").length,
      accountants: members.filter((m) => m.role === "accountant").length,
      managers: members.filter((m) => m.role === "manager").length,
      employees: members.filter((m) => m.role === "employee").length,
    };
  }, [members]);

  // Invitation sender launcher with universal Multi-Channel Share & Mail fallback
  const openMailtoLink = async (mailtoUrl: string, rawShareMessage: string, invitedEmail: string, assignedRole: string) => {
    setInviteModal(false);
    setInviteName("");
    setInviteEmail("");

    // On web, use window.location or window.open
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.open(mailtoUrl, "_blank");
      } catch {
        window.location.href = mailtoUrl;
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      showFloatingToast("Invitation Ready", `Invite sent! Email client opened for ${invitedEmail}.`);
      return;
    }

    // Native path: First attempt direct Mail app intent
    try {
      const supported = await Linking.canOpenURL(mailtoUrl);
      if (supported) {
        await Linking.openURL(mailtoUrl);
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        showFloatingToast("Mail Client Opened", "Fill in details and tap Send in your email client.");
        return;
      }
    } catch (e) {
      console.log("Mailto Link Notice:", e);
    }

    // Universal Fallback: Open Native Android/iOS System Share Sheet (WhatsApp, Gmail, Messages, Telegram, etc.)
    try {
      await Share.share({
        title: `Invitation to join ${settings.organizationName || "OFM"}`,
        message: rawShareMessage,
      });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      showFloatingToast("Invitation Created", `Member added as ${assignedRole.toUpperCase()}!`);
    } catch (shareErr) {
      Alert.alert(
        "Invitation Created! 🎉",
        `Member is now authorized in ${settings.organizationName}. They can sign up using email: ${invitedEmail} and Admin Invite Code: ${user?.email}`
      );
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert("Validation", "Please enter a valid email address.");
      return;
    }
    const emailReg = /^\S+@\S+\.\S+$/;
    if (!emailReg.test(inviteEmail.trim())) {
      Alert.alert("Validation", "Please enter a valid email format.");
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    const role = inviteRole;
    const orgName = settings.organizationName || user?.organization || "Our Organization";
    const adminEmail = user?.email || "";
    const adminName = user?.name || "Admin";
    const webAccessLink = "https://ofmapp-main.web.app/login";

    const rawSubject = `Invitation to join ${orgName} on OFM App`;
    const rawBody = `Hello,

You have been invited to join "${orgName}" on the Organization Finance Manager (OFM) app as a ${role.toUpperCase()}.

Please follow these simple steps to set up your account:

1. Web Access: ${webAccessLink}
2. Select "Create Account" tab and register using: ${email}
3. Enter Admin email / Invite Code: ${adminEmail}

Once registered, you will be instantly connected to our organization with ${role.toUpperCase()} permissions to access real-time financial tools!

Regards,
${adminName}
${orgName}`;

    const subject = encodeURIComponent(rawSubject);
    const body = encodeURIComponent(rawBody);
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

    // 1. Instantly persist invitation in Firestore invitations and users collections for automatic 2-way Web & Mobile sync
    try {
      const { doc, setDoc, Timestamp } = require("firebase/firestore");
      const memberName = inviteName.trim() || email.split("@")[0];
      const newUserId = `u_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;

      await setDoc(doc(db, "invitations", email), {
        email: email,
        name: memberName,
        role: role,
        organization: orgName,
        organizationId: user?.organizationId || "default-org",
        invitedBy: adminEmail,
        createdAt: Timestamp.now(),
        status: "pending",
      });

      await setDoc(doc(db, "users", newUserId), {
        id: newUserId,
        name: memberName,
        email: email,
        role: role,
        organization: orgName,
        organizationId: user?.organizationId || "default-org",
        createdAt: new Date().toISOString(),
        status: "active",
      }, { merge: true });

      // Optimistically append new invited user
      const newMember: User = {
        id: newUserId,
        name: memberName,
        email: email,
        role: role,
        organization: orgName,
        organizationId: user?.organizationId || "",
      };
      setMembers((prev) => {
        if (prev.some((p) => (p.email || "").toLowerCase() === (email || "").toLowerCase())) return prev;
        return [...prev, newMember];
      });
    } catch (firestoreErr) {
      console.warn("Firestore invitation persist notice:", firestoreErr);
    }

    // 2. Automated Background Dispatch if configured, otherwise Universal Share / Mail launcher
    if (settings.emailAutomatedEnabled && settings.emailjsServiceId && settings.emailjsTemplateId && settings.emailjsPublicKey) {
      try {
        setSendingInvite(true);
        safeHaptic(Haptics.ImpactFeedbackStyle.Medium);

        const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            service_id: settings.emailjsServiceId,
            template_id: settings.emailjsTemplateId,
            user_id: settings.emailjsPublicKey,
            template_params: {
              to_email: email,
              role: role.toUpperCase(),
              org_name: orgName,
              admin_email: adminEmail,
              admin_name: adminName,
            },
          }),
        });

        setSendingInvite(false);

        if (response.status === 200 || response.ok) {
          setInviteModal(false);
          setInviteName("");
          setInviteEmail("");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showFloatingToast("Success", `Invitation email sent automatically to ${email}!`);
        } else {
          openMailtoLink(mailtoUrl, rawBody, email, role);
        }
      } catch (err) {
        setSendingInvite(false);
        openMailtoLink(mailtoUrl, rawBody, email, role);
      }
    } else {
      await openMailtoLink(mailtoUrl, rawBody, email, role);
    }
  };

  useEffect(() => {
    const onBackPress = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, []);

  const handleGoBack = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  // ─── Presentation helpers (no data logic) ───
  const isSelf = (m: User) =>
    (m.email || "").toLowerCase() === (user?.email || "").toLowerCase() || (!!user?.id && m.id === user.id);
  // Invites create a placeholder record ("u_<email>") until the person signs up with that email
  const isPendingInvite = (m: User) => (m.id || "").startsWith("u_");
  const initialsOf = (m: User) => {
    const parts = (m.name || m.email || "U").trim().split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] || "U") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  };
  const pendingCount = members.filter(isPendingInvite).length;
  const emailLooksValid = /^\S+@\S+\.\S+$/.test(inviteEmail.trim());
  const roleFilters = [
    { id: "all", label: "All", count: stats.total, color: colors.primary },
    { id: "admin", label: "Admins", count: stats.admins, color: ROLE_INFO.admin.color },
    { id: "accountant", label: "Accountants", count: stats.accountants, color: ROLE_INFO.accountant.color },
    { id: "manager", label: "Managers", count: stats.managers, color: ROLE_INFO.manager.color },
    { id: "employee", label: "Employees", count: stats.employees, color: ROLE_INFO.employee.color },
  ];
  const tint = (c: string) => c + (colors.isDark ? "26" : "14");

  // Passed as an element (not a function) so the search box keeps focus while typing
  const listHeader = (
    <View style={styles.listHeader}>
      {/* Team summary */}
      <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.summaryIcon, { backgroundColor: tint(colors.primary) }]}>
          <Feather name="users" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>
            {stats.total} {stats.total === 1 ? "member" : "members"}
          </Text>
          <Text style={[styles.summarySub, { color: colors.mutedForeground }]} numberOfLines={2}>
            {stats.admins} admin{stats.admins === 1 ? "" : "s"} · {stats.accountants} accountant{stats.accountants === 1 ? "" : "s"} · {stats.managers} manager{stats.managers === 1 ? "" : "s"} · {stats.employees} employee{stats.employees === 1 ? "" : "s"}
          </Text>
        </View>
        {pendingCount > 0 ? (
          <View style={[styles.pendingPill, { backgroundColor: tint(colors.warning) }]}>
            <Feather name="clock" size={12} color={colors.warning} />
            <Text style={[styles.pendingPillText, { color: colors.warning }]}>{pendingCount} invited</Text>
          </View>
        ) : null}
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search by name or email"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Clear search">
            <Feather name="x-circle" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Role filters (one control, with counts) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} keyboardShouldPersistTaps="handled">
        {roleFilters.map((f) => {
          const isActive = selectedRole === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, { backgroundColor: isActive ? f.color : colors.card, borderColor: isActive ? f.color : colors.border }]}
              onPress={() => {
                safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                setSelectedRole(f.id);
              }}
              activeOpacity={0.8}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.filterChipText, { color: isActive ? "#FFFFFF" : colors.foreground }]}>{f.label}</Text>
              <View style={[styles.filterCount, { backgroundColor: isActive ? "rgba(255,255,255,0.25)" : tint(f.color) }]}>
                <Text style={[styles.filterCountText, { color: isActive ? "#FFFFFF" : f.color }]}>{f.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
        {loading
          ? "Loading members…"
          : search || selectedRole !== "all"
          ? `${filteredMembers.length} of ${members.length} shown`
          : "Tap a member to see details or change their role"}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: webTop + screenTopPadding(insets.top), backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={handleGoBack}
            accessibilityLabel="Go back"
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Team Members</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {settings.organizationName}
            </Text>
          </View>
          {canInvite ? (
            <TouchableOpacity
              style={[styles.headerInviteBtn, { backgroundColor: tint(colors.primary) }]}
              onPress={() => {
                safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                setInviteModal(true);
              }}
              accessibilityLabel="Invite member"
            >
              <Feather name="user-plus" size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
      </View>

      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.scrollArea, { paddingBottom: Math.max(insets.bottom, 16) + (canInvite ? 96 : 24) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <View style={[styles.emptyIconWrap, { backgroundColor: colors.muted }]}>
                  <Feather name={search ? "search" : "users"} size={28} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {search || selectedRole !== "all" ? "No matching members" : "No members yet"}
                </Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  {search || selectedRole !== "all"
                    ? "Try another name or email, or switch the role filter to All."
                    : canInvite
                    ? "Invite your first team member to start working together."
                    : "Pull down to refresh."}
                </Text>
                {(search || selectedRole !== "all") ? (
                  <TouchableOpacity
                    style={[styles.emptyBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => {
                      setSearch("");
                      setSelectedRole("all");
                    }}
                  >
                    <Text style={[styles.emptyBtnText, { color: colors.primary }]}>Clear filters</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const info = ROLE_INFO[item.role] || { color: colors.mutedForeground, label: String(item.role || "").toUpperCase(), icon: "user", title: String(item.role || ""), description: "" };
          const self = isSelf(item);
          const pending = isPendingInvite(item);
          return (
            <TouchableOpacity
              style={[styles.memberCard, { backgroundColor: colors.card, borderColor: self ? colors.primary + "55" : colors.border }]}
              activeOpacity={0.85}
              onPress={() => {
                safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                setSelectedMember(item);
                setMemberModalVisible(true);
              }}
              accessibilityLabel={`${item.name || item.email}, ${info.title}${pending ? ", invitation pending" : ""}`}
            >
              <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name || item.email || "U") }]}>
                <Text style={styles.avatarText}>{initialsOf(item)}</Text>
              </View>

              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name || item.email}
                  </Text>
                  {self ? (
                    <View style={[styles.miniPill, { backgroundColor: tint(colors.primary) }]}>
                      <Text style={[styles.miniPillText, { color: colors.primary }]}>You</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.memberEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.email}
                </Text>
                <View style={styles.memberMetaRow}>
                  <View style={[styles.roleBadge, { backgroundColor: tint(info.color) }]}>
                    <Feather name={info.icon as any} size={11} color={info.color} />
                    <Text style={[styles.roleBadgeText, { color: info.color }]}>{info.title}</Text>
                  </View>
                  {pending ? (
                    <View style={[styles.roleBadge, { backgroundColor: tint(colors.warning) }]}>
                      <Feather name="clock" size={11} color={colors.warning} />
                      <Text style={[styles.roleBadgeText, { color: colors.warning }]}>Invite pending</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Invite button (admins), kept above the system navigation bar */}
      {canInvite && (
        <TouchableOpacity
          style={[
            styles.floatingAddBtn,
            {
              bottom: Math.max(insets.bottom, 16) + (Platform.OS === "android" ? 20 : 12),
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
            },
          ]}
          onPress={() => {
            safeHaptic(Haptics.ImpactFeedbackStyle.Light);
            setInviteModal(true);
          }}
          activeOpacity={0.85}
        >
          <Feather name="user-plus" size={18} color="#fff" />
          <Text style={styles.floatingAddBtnText}>Invite member</Text>
        </TouchableOpacity>
      )}

      {/* Invite sheet */}
      <Modal visible={inviteModal} animationType="slide" transparent onRequestClose={() => setInviteModal(false)}>
        <KeyboardAvoidingView
          style={[styles.modalBg, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border, maxHeight: sheetMaxHeight }]}>
            <View style={styles.sheetHandle} />
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalHeaderIconWrap, { backgroundColor: tint(colors.primary) }]}>
                  <Feather name="user-plus" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Invite a team member</Text>
                  <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>They join {settings.organizationName || "your organization"} with the role you pick</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}
                onPress={() => { setInviteModal(false); setInviteName(""); setInviteEmail(""); }}
                accessibilityLabel="Close"
              >
                <Feather name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView ref={sheetScrollRef} onTouchEnd={sheetOnTouchEnd} contentContainerStyle={[styles.modalContent, { paddingBottom: 40 + sheetBottomInset }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                  Full name <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>(optional)</Text>
                </Text>
                <TextInput
                  style={[styles.fieldInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="e.g. Ali Raza"
                  placeholderTextColor={colors.mutedForeground}
                  value={inviteName}
                  onChangeText={setInviteName}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Email address</Text>
                <TextInput
                  style={[
                    styles.fieldInput,
                    {
                      backgroundColor: colors.input,
                      color: colors.foreground,
                      borderColor: inviteEmail.trim() && !emailLooksValid ? colors.expense : colors.border,
                    },
                  ]}
                  placeholder="name@organization.com"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                />
                {inviteEmail.trim() && !emailLooksValid ? (
                  <Text style={[styles.fieldError, { color: colors.expense }]}>Enter a valid email, e.g. name@company.com</Text>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Role</Text>
                <View style={styles.roleGrid}>
                  {ROLE_ORDER.map((r) => {
                    const info = ROLE_INFO[r];
                    const isSelected = inviteRole === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[styles.roleOption, { backgroundColor: isSelected ? tint(info.color) : colors.card, borderColor: isSelected ? info.color : colors.border }]}
                        onPress={() => {
                          safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                          setInviteRole(r);
                        }}
                        activeOpacity={0.85}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <View style={styles.roleOptionTop}>
                          <Feather name={info.icon as any} size={15} color={info.color} />
                          <Text style={[styles.roleOptionTitle, { color: colors.foreground }]}>{info.title}</Text>
                          {isSelected ? <Feather name="check-circle" size={15} color={info.color} /> : null}
                        </View>
                        <Text style={[styles.roleOptionDesc, { color: colors.mutedForeground }]}>{info.description}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.infoBanner, { backgroundColor: tint(colors.primary), borderColor: colors.primary + "35" }]}>
                <Feather name="info" size={14} color={colors.primary} />
                <Text style={[styles.infoBannerText, { color: colors.foreground }]}>
                  They're added right away. Then send the invite by email, WhatsApp or any app — they sign up with this email to join.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.modalInviteBtn, { backgroundColor: colors.primary, opacity: emailLooksValid ? 1 : 0.55 }]}
                onPress={handleSendInvite}
                activeOpacity={0.85}
              >
                <Feather name="send" size={16} color="#fff" />
                <Text style={styles.modalInviteBtnText}>Send invitation</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Member details & role sheet */}
      <Modal visible={memberModalVisible} animationType="slide" transparent onRequestClose={() => setMemberModalVisible(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.sheetHandle} />
            {selectedMember && (() => {
              const info = ROLE_INFO[selectedMember.role] || ROLE_INFO.employee;
              const self = isSelf(selectedMember);
              const pending = isPendingInvite(selectedMember);
              return (
                <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: 40 + insets.bottom }]} showsVerticalScrollIndicator={false}>
                  {/* Profile */}
                  <View style={styles.profileRow}>
                    <View style={[styles.avatar, styles.avatarLarge, { backgroundColor: getAvatarColor(selectedMember.name || selectedMember.email || "U") }]}>
                      <Text style={styles.avatarTextLarge}>{initialsOf(selectedMember)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.memberNameRow}>
                        <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={2}>
                          {selectedMember.name || selectedMember.email}
                        </Text>
                        {self ? (
                          <View style={[styles.miniPill, { backgroundColor: tint(colors.primary) }]}>
                            <Text style={[styles.miniPillText, { color: colors.primary }]}>You</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.profileEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{selectedMember.email}</Text>
                      <View style={styles.memberMetaRow}>
                        <View style={[styles.roleBadge, { backgroundColor: tint(info.color) }]}>
                          <Feather name={info.icon as any} size={11} color={info.color} />
                          <Text style={[styles.roleBadgeText, { color: info.color }]}>{info.title}</Text>
                        </View>
                        {pending ? (
                          <View style={[styles.roleBadge, { backgroundColor: tint(colors.warning) }]}>
                            <Feather name="clock" size={11} color={colors.warning} />
                            <Text style={[styles.roleBadgeText, { color: colors.warning }]}>Invite pending</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}
                      onPress={() => setMemberModalVisible(false)}
                      accessibilityLabel="Close"
                    >
                      <Feather name="x" size={18} color={colors.foreground} />
                    </TouchableOpacity>
                  </View>

                  {pending ? (
                    <View style={[styles.infoBanner, { backgroundColor: tint(colors.warning), borderColor: colors.warning + "40" }]}>
                      <Feather name="clock" size={14} color={colors.warning} />
                      <Text style={[styles.infoBannerText, { color: colors.foreground }]}>
                        Waiting for {selectedMember.name || "this person"} to sign up with {selectedMember.email}.
                      </Text>
                    </View>
                  ) : null}

                  {/* Role */}
                  <View style={styles.field}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Role</Text>
                    {self ? (
                      <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>You can't change your own role. Ask another admin.</Text>
                    ) : null}
                    <View style={styles.roleGrid}>
                      {ROLE_ORDER.map((r) => {
                        const rInfo = ROLE_INFO[r];
                        const isSelected = selectedMember.role === r;
                        return (
                          <TouchableOpacity
                            key={r}
                            style={[
                              styles.roleOption,
                              {
                                backgroundColor: isSelected ? tint(rInfo.color) : colors.card,
                                borderColor: isSelected ? rInfo.color : colors.border,
                                opacity: self && !isSelected ? 0.5 : 1,
                              },
                            ]}
                            onPress={() => handleUpdateRole(selectedMember, r)}
                            disabled={self || isSelected}
                            activeOpacity={0.85}
                            accessibilityState={{ selected: isSelected, disabled: self }}
                          >
                            <View style={styles.roleOptionTop}>
                              <Feather name={rInfo.icon as any} size={15} color={rInfo.color} />
                              <Text style={[styles.roleOptionTitle, { color: colors.foreground }]}>{rInfo.title}</Text>
                              {isSelected ? <Feather name="check-circle" size={15} color={rInfo.color} /> : null}
                            </View>
                            <Text style={[styles.roleOptionDesc, { color: colors.mutedForeground }]}>{rInfo.description}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => {
                        safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                        Linking.openURL(`mailto:${selectedMember.email}`);
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather name="mail" size={16} color={colors.primary} />
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>Email</Text>
                    </TouchableOpacity>

                    {!self && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { flex: 1, backgroundColor: tint(colors.expense), borderColor: colors.expense + "40" }]}
                        onPress={() => handleRemoveMember(selectedMember)}
                        activeOpacity={0.8}
                      >
                        <Feather name="user-x" size={16} color={colors.expense} />
                        <Text style={[styles.actionBtnText, { color: colors.expense }]}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Sending overlay (automated email) */}
      {sendingInvite && (
        <View style={[StyleSheet.absoluteFill, styles.sendingOverlay]}>
          <View style={[styles.sendingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.sendingTitle, { color: colors.foreground }]}>Sending invitation…</Text>
            <Text style={[styles.sendingSub, { color: colors.mutedForeground }]}>Please wait a moment</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1, minWidth: 0, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerInviteBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  scrollArea: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },

  // List header
  listHeader: { gap: 12, marginBottom: 2 },
  summaryCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  summaryIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  summaryValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  summarySub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginTop: 2 },
  pendingPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, flexShrink: 0 },
  pendingPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 46, borderRadius: 14, borderWidth: 1, gap: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 12, paddingRight: 6, height: 36, borderRadius: 18, borderWidth: 1 },
  filterChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filterCount: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  filterCountText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  resultCount: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Member card
  memberCard: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  avatarLarge: { width: 60, height: 60, borderRadius: 18 },
  avatarTextLarge: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  memberInfo: { flex: 1, minWidth: 0, gap: 3 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  memberName: { flexShrink: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  memberEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  memberMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 3 },
  miniPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, flexShrink: 0 },
  miniPillText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  roleBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  // Empty state
  emptyState: { paddingVertical: 48, alignItems: "center", gap: 10 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 30, lineHeight: 19 },
  emptyBtn: { marginTop: 4, paddingHorizontal: 16, height: 38, borderRadius: 19, borderWidth: 1, justifyContent: "center" },
  emptyBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Floating invite button
  floatingAddBtn: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 50,
    paddingHorizontal: 20,
    borderRadius: 25,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  floatingAddBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  // Sheets
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingTop: 8, maxHeight: "90%" },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#94A3B8", opacity: 0.5, marginBottom: 10 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 14, borderBottomWidth: 1 },
  modalHeaderLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  modalHeaderIconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modalContent: { gap: 16, paddingVertical: 16 },

  field: { gap: 8 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -4 },
  fieldInput: { height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  fieldError: { fontSize: 12, fontFamily: "Inter_500Medium" },

  roleGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  roleOption: { width: "48.5%", padding: 12, borderRadius: 14, borderWidth: 1.2, gap: 6 },
  roleOptionTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  roleOptionTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold" },
  roleOptionDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },

  profileRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  profileName: { flexShrink: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  modalInviteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14 },
  modalInviteBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 14, borderWidth: 1 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },

  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  sendingOverlay: { backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", alignItems: "center", zIndex: 9999 },
  sendingCard: { padding: 24, borderRadius: 20, borderWidth: 1, alignItems: "center", gap: 10, minWidth: 220 },
  sendingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sendingSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});
