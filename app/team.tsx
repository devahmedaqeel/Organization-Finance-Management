import { Feather } from "@/components/UniversalIcon";
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
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { showFloatingToast } from "./_layout";

// Color maps for dynamic visual badges across all 4 system roles
const ROLE_BADGES: Record<UserRole, { color: string; label: string }> = {
  admin: { color: "#6366F1", label: "ADMIN" },
  accountant: { color: "#10B981", label: "ACCOUNTANT" },
  manager: { color: "#8B5CF6", label: "MANAGER" },
  employee: { color: "#0EA5E9", label: "EMPLOYEE" },
};

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
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { settings } = useSettings();
  const keyboardHeight = useKeyboardHeight();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const isDemo = !user || (user.email && user.email.endsWith("@ofm.com"));
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
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);

    // Optimistically update local state
    setMembers((prev) =>
      prev.map((m) => (m.id === targetUser.id ? { ...m, role: newRole } : m))
    );
    if (selectedMember && selectedMember.id === targetUser.id) {
      setSelectedMember({ ...selectedMember, role: newRole });
    }

    if (targetUser.id) {
      try {
        const { doc, setDoc } = require("firebase/firestore");
        await setDoc(
          doc(db, "users", targetUser.id),
          { ...targetUser, role: newRole, updatedAt: new Date().toISOString() },
          { merge: true }
        );
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

    const isDemo = user.organizationId === "demo-org";
    const orgName = user.organization || settings.organizationName || "Organization Finance Management";
    const orgId = user.organizationId || "default-org";

    const { onSnapshot } = require("firebase/firestore");
    const q = isDemo
      ? query(
          collection(db, "users"),
          where("organization", "in", [
            orgName,
            "Organization Finance Management",
            "OFM — Organization Finance Management",
            "OFM — Organization Finance Manager",
          ])
        )
      : query(collection(db, "users"), where("organizationId", "==", orgId));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot: any) => {
        if (!querySnapshot.empty) {
          const seen = new Set<string>();
          const fetched: User[] = [];
          querySnapshot.forEach((docSnap: any) => {
            const m = { id: docSnap.id, ...docSnap.data() } as User;
            const emailKey = (m.email || "").toLowerCase().trim();
            if (emailKey && !seen.has(emailKey)) {
              seen.add(emailKey);
              fetched.push(m);
            }
          });

          // Sort members: Admins first, then alphabetically by name
          fetched.sort((a, b) => {
            if (a.role === "admin" && b.role !== "admin") return -1;
            if (a.role !== "admin" && b.role === "admin") return 1;
            return a.name.localeCompare(b.name);
          });

          setMembers(fetched);
        } else {
          setMembers(
            isDemo
              ? [
                  { id: "u1", name: "Ahmed Aqeel", email: "admin@ofm.com", role: "admin", organization: orgName, organizationId: "demo-org" },
                  { id: "u2", name: "Maryam Naz", email: "accountant@ofm.com", role: "accountant", organization: orgName, organizationId: "demo-org" },
                  { id: "u3", name: "Dr. Sundas Iftikhar", email: "manager@ofm.com", role: "manager", organization: orgName, organizationId: "demo-org" },
                  { id: "u4", name: "Ali Hassan", email: "employee@ofm.com", role: "employee", organization: orgName, organizationId: "demo-org" },
                ]
              : [user]
          );
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

      const weightA = ROLE_WEIGHT[a.role?.toLowerCase()] ?? 99;
      const weightB = ROLE_WEIGHT[b.role?.toLowerCase()] ?? 99;
      if (weightA !== weightB) return weightA - weightB;

      const nameA = (a.name || a.email || "").toLowerCase();
      const nameB = (b.name || b.email || "").toLowerCase();
      return nameA.localeCompare(nameB);
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

  // Helper for generating dynamic avatar background colors consistently
  const getAvatarColor = (name: string) => {
    const charCode = name.charCodeAt(0) || 0;
    return AVATAR_PALETTE[charCode % AVATAR_PALETTE.length];
  };

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
        if (prev.some((p) => p.email.toLowerCase() === email)) return prev;
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

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Premium Header */}
      <View style={[styles.header, { paddingTop: webTop + insets.top + (Platform.OS === "android" ? 20 : 12), backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: colors.border }]}
            onPress={handleGoBack}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Team Members</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {settings.organizationName}
            </Text>
          </View>
          <View style={{ width: 38 }} />
        </View>
      </View>

      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.scrollArea, { paddingBottom: Math.max(insets.bottom, 16) + 90 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <>
            {/* Executive Bento Statistics Grid (Interactive Filters) */}
            <View style={styles.statsRow}>
              {[
                { label: "Total Members", sub: "All Staff", value: stats.total, color: colors.primary, icon: "users" as const, filterKey: "all" },
                { label: "Admins", sub: "Full Control", value: stats.admins, color: "#6366F1", icon: "shield" as const, filterKey: "admin" },
                { label: "Accountants", sub: "Ledgers", value: stats.accountants, color: "#10B981", icon: "edit-3" as const, filterKey: "accountant" },
                { label: "Managers", sub: "Budgets", value: stats.managers, color: "#8B5CF6", icon: "briefcase" as const, filterKey: "manager" },
                { label: "Employees", sub: "Portal", value: stats.employees, color: "#0EA5E9", icon: "user" as const, filterKey: "employee" },
              ].map((stat) => {
                const isSelected = selectedRole === stat.filterKey;
                return (
                  <TouchableOpacity
                    key={stat.label}
                    style={[
                      styles.statBox,
                      {
                        backgroundColor: colors.card,
                        borderColor: isSelected ? stat.color : colors.border,
                        borderWidth: isSelected ? 1.5 : 1,
                      },
                    ]}
                    onPress={() => {
                      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedRole(stat.filterKey);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.statTopRow}>
                      <View style={[styles.statIconWrap, { backgroundColor: stat.color + "16" }]}>
                        <Feather name={stat.icon} size={15} color={stat.color} />
                      </View>
                      <Text style={[styles.statVal, { color: stat.color }]}>{stat.value}</Text>
                    </View>
                    <View style={styles.statBottomWrap}>
                      <Text style={[styles.statLabel, { color: colors.foreground }]}>{stat.label}</Text>
                      <Text style={[styles.statSub, { color: colors.mutedForeground }]}>{stat.sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Live Search Controls */}
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="search" size={15} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search member by name or email..."
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filter Tags across all 4 roles */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {[
                { id: "all", label: "ALL MEMBERS" },
                { id: "admin", label: "ADMINS" },
                { id: "accountant", label: "ACCOUNTANTS" },
                { id: "manager", label: "MANAGERS" },
                { id: "employee", label: "EMPLOYEES" },
              ].map((filter) => {
                const isActive = selectedRole === filter.id;
                return (
                  <TouchableOpacity
                    key={filter.id}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isActive ? colors.primary : colors.card,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => { safeHaptic(Haptics.ImpactFeedbackStyle.Light); setSelectedRole(filter.id); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterChipText, { color: isActive ? "#fff" : colors.mutedForeground }]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <View style={[styles.emptyIconWrap, { backgroundColor: colors.muted }]}>
                  <Feather name="users" size={32} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Members Found</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  No users matched your search criteria. Pull to refresh or invite someone!
                </Text>
              </>
            )}
          </View>
        )}
        renderItem={({ item }) => {
          const badge = ROLE_BADGES[item.role] || { color: colors.mutedForeground, label: item.role.toUpperCase() };
          const isCurrentUser = item.email === user?.email;
          return (
            <TouchableOpacity
              style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.85}
              onPress={() => {
                safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                setSelectedMember(item);
                setMemberModalVisible(true);
              }}
            >
              {/* Dynamic colored avatar bubble */}
              <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>

              {/* Information */}
              <View style={styles.memberInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.memberName, { color: colors.foreground }]}>
                    {item.name}
                  </Text>
                  {isCurrentUser && (
                    <View style={styles.selfPill}>
                      <Text style={styles.selfText}>YOU</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.memberEmail, { color: colors.mutedForeground }]}>
                  {item.email}
                </Text>
              </View>

              {/* Role badge */}
              <View style={[styles.roleBadge, { backgroundColor: badge.color + "14", borderColor: badge.color + "30" }]}>
                <View style={[styles.roleDot, { backgroundColor: badge.color }]} />
                <Text style={[styles.roleBadgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Floating Invite Button (Admin Only, placed safely above system navigation bar) */}
      {canInvite && (
        <TouchableOpacity
          style={[
            styles.floatingAddBtn,
            {
              bottom: Math.max(insets.bottom, 16) + (Platform.OS === "android" ? 28 : 18),
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
          <Feather name="user-plus" size={17} color="#fff" />
          <Text style={styles.floatingAddBtnText}>Invite Member</Text>
        </TouchableOpacity>
      )}

      {/* Slide Drawer Invite Modal */}
      <Modal visible={inviteModal} animationType="slide" transparent onRequestClose={() => setInviteModal(false)}>
        <KeyboardAvoidingView
          style={[styles.modalBg, { paddingBottom: Platform.OS === "android" ? keyboardHeight : 0 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.modalHeaderIconWrap, { backgroundColor: colors.primary + "18" }]}>
                  <Feather name="user-plus" size={18} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Invite Team Member</Text>
                  <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Send Gmail invitation with organization code</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}
                onPress={() => { setInviteModal(false); setInviteName(""); setInviteEmail(""); }}
              >
                <Feather name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: 80 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalDescription, { color: colors.mutedForeground }]}>
                Add your colleague's information below. An official email invitation will be dispatched with your organization's invite code.
              </Text>

              {/* Name field */}
              <Text style={[styles.miniLabel, { color: colors.mutedForeground }]}>MEMBER'S FULL NAME (OPTIONAL)</Text>
              <TextInput
                style={[styles.miniInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. Ali Raza"
                placeholderTextColor={colors.mutedForeground}
                value={inviteName}
                onChangeText={setInviteName}
              />

              {/* Email field */}
              <Text style={[styles.miniLabel, { color: colors.mutedForeground, marginTop: 14 }]}>EMAIL ADDRESS</Text>
              <TextInput
                style={[styles.miniInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                placeholder="employee@organization.com"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                value={inviteEmail}
                onChangeText={setInviteEmail}
              />

              {/* Role Chip Options - All 4 System Roles */}
              <Text style={[styles.miniLabel, { color: colors.mutedForeground, marginTop: 14 }]}>ASSIGN SYSTEM ROLE</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {([
                  { id: "admin", label: "ADMIN", color: "#6366F1" },
                  { id: "accountant", label: "ACCOUNTANT", color: "#10B981" },
                  { id: "manager", label: "MANAGER", color: "#8B5CF6" },
                  { id: "employee", label: "EMPLOYEE", color: "#0EA5E9" },
                ] as const).map((r) => {
                  const isSelected = inviteRole === r.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[
                        styles.roleChip,
                        {
                          backgroundColor: isSelected ? r.color : colors.card,
                          borderColor: isSelected ? r.color : colors.border,
                          borderWidth: 1.2,
                        },
                      ]}
                      onPress={() => setInviteRole(r.id as UserRole)}
                    >
                      <Text style={[styles.roleChipText, { color: isSelected ? "#fff" : colors.foreground }]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.infoBanner, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "35", marginTop: 16 }]}>
                <Feather name="send" size={14} color={colors.primary} />
                <Text style={[styles.infoBannerText, { color: colors.foreground }]}>
                  Member will be instantly added to your organization database. You can deliver invite via Gmail, WhatsApp, or any app.
                </Text>
              </View>

              {/* Send Invitation Action */}
              <TouchableOpacity
                style={[styles.modalInviteBtn, { backgroundColor: colors.primary }]}
                onPress={handleSendInvite}
                activeOpacity={0.85}
              >
                <Feather name="send" size={15} color="#fff" />
                <Text style={styles.modalInviteBtnText}>Send & Share Invitation</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Member Details & Role Management Modal */}
      <Modal visible={memberModalVisible} animationType="slide" transparent onRequestClose={() => setMemberModalVisible(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={[styles.modalHeaderIconWrap, { backgroundColor: (ROLE_BADGES[selectedMember?.role || "admin"]?.color || colors.primary) + "18" }]}>
                  <Feather name="user-check" size={18} color={ROLE_BADGES[selectedMember?.role || "admin"]?.color || colors.primary} />
                </View>
                <View>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Member Permissions</Text>
                  <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>View profile & assign RBAC authority</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: colors.muted }]}
                onPress={() => setMemberModalVisible(false)}
              >
                <Feather name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {selectedMember && (
              <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: 60 }]} showsVerticalScrollIndicator={false}>
                {/* Member Profile Header */}
                <View style={{ alignItems: "center", paddingVertical: 12, gap: 6 }}>
                  <View style={[styles.avatar, { width: 56, height: 56, borderRadius: 18, backgroundColor: getAvatarColor(selectedMember.name) }]}>
                    <Text style={{ color: "#fff", fontSize: 22, fontFamily: "Inter_800ExtraBold" }}>
                      {selectedMember.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                    {selectedMember.name}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                    {selectedMember.email}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Feather name="briefcase" size={11} color={colors.mutedForeground} />
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                      {selectedMember.organization || settings.organizationName}
                    </Text>
                  </View>
                </View>

                {/* Role Switcher Section (Admin Only) - All 4 Roles */}
                <Text style={[styles.miniLabel, { color: colors.mutedForeground, marginTop: 8 }]}>CHANGE ASSIGNED ROLE</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {(["admin", "accountant", "manager", "employee"] as UserRole[]).map((r) => {
                    const isSelected = selectedMember.role === r;
                    const rColor = ROLE_BADGES[r]?.color || colors.primary;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.roleChip,
                          {
                            backgroundColor: isSelected ? rColor + "18" : colors.card,
                            borderColor: isSelected ? rColor : colors.border,
                            borderWidth: isSelected ? 1.5 : 1,
                          },
                        ]}
                        onPress={() => handleUpdateRole(selectedMember, r)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.roleChipText, { color: isSelected ? rColor : colors.mutedForeground }]}>
                          {r.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Permissions Description Card */}
                <View style={[styles.infoBanner, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 }]}>
                  <Feather name="shield" size={14} color={ROLE_BADGES[selectedMember.role]?.color || colors.primary} />
                  <Text style={[styles.infoBannerText, { color: colors.foreground }]}>
                    {selectedMember.role === "admin"
                      ? "Admin has full institutional control, fiscal management, team invitations, and report generation."
                      : selectedMember.role === "accountant"
                      ? "Accountant can register transactions, record payroll payouts, and audit receipts."
                      : selectedMember.role === "manager"
                      ? "Manager can allocate departmental budgets, approve expenses, and monitor reports."
                      : "Employee has isolated access to personal salary slip, reimbursement claims, and staff portal."}
                  </Text>
                </View>

                {/* Quick Direct Actions */}
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    style={[styles.actionBtnSecondary, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => {
                      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                      Linking.openURL(`mailto:${selectedMember.email}`);
                    }}
                    activeOpacity={0.8}
                  >
                    <Feather name="mail" size={14} color={colors.primary} />
                    <Text style={[styles.actionBtnText, { color: colors.primary }]}>Send Email</Text>
                  </TouchableOpacity>

                  {selectedMember.email !== user?.email && (
                    <TouchableOpacity
                      style={[styles.actionBtnSecondary, { backgroundColor: "#FEE2E2", borderColor: "#FECACA" }]}
                      onPress={() => handleRemoveMember(selectedMember)}
                      activeOpacity={0.8}
                    >
                      <Feather name="user-x" size={14} color="#EF4444" />
                      <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Activity Indicator Overlay */}
      {sendingInvite && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.65)", justifyContent: "center", alignItems: "center", zIndex: 9999 }]}>
          <View style={{ backgroundColor: colors.card, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Sending Gmail Alert...</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>Please wait a moment</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1, justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  scrollArea: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  
  // Executive Bento Statistics Grid (Balanced, filled, zero wasted space)
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    marginBottom: 0,
  },
  statBox: {
    width: "48.5%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 7,
  },
  statTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statVal: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.5,
  },
  statBottomWrap: {
    gap: 1.5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  statSub: {
    fontSize: 9.5,
    fontFamily: "Inter_500Medium",
  },

  // Search
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 42, borderRadius: 12, borderWidth: 1, gap: 10, marginTop: 2, marginBottom: 2 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },

  // Filters
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, borderWidth: 1, alignItems: "center" },
  filterChipText: { fontSize: 9.5, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },

  // Member Card
  memberCard: { flexDirection: "row", alignItems: "center", padding: 11, borderRadius: 14, borderWidth: 1, gap: 11 },
  avatar: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 13.5, fontFamily: "Inter_700Bold" },
  selfPill: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4, backgroundColor: "#E0E7FF" },
  selfText: { fontSize: 8.5, fontFamily: "Inter_700Bold", color: "#4F46E5" },
  memberEmail: { fontSize: 10.5, fontFamily: "Inter_400Regular" },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 4.5, paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 7, borderWidth: 1 },
  roleDot: { width: 5, height: 5, borderRadius: 2.5 },
  roleBadgeText: { fontSize: 8.5, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },

  // Empty State
  emptyState: { paddingVertical: 60, alignItems: "center", gap: 12 },
  emptyIconWrap: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 30, lineHeight: 18 },

  // Floating button (Safe placement above system buttons)
  floatingAddBtn: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 28,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 100,
  },
  floatingAddBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },

  // Modal
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingTop: 16, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, borderBottomWidth: 1 },
  modalHeaderIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 10.5, fontFamily: "Inter_400Regular", marginTop: 1 },
  modalCloseBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  modalContent: { gap: 12, paddingVertical: 14 },
  modalDescription: { fontSize: 11.5, fontFamily: "Inter_400Regular", lineHeight: 16 },
  
  miniLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginTop: 4 },
  miniInput: { padding: 11, borderRadius: 10, borderWidth: 1, fontSize: 13.5, fontFamily: "Inter_400Regular", marginTop: 4 },
  
  roleChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  roleChipText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  modalInviteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, marginTop: 14 },
  modalInviteBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },

  actionBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
