import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth, User, UserRole } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { WebInviteModal } from "./modals/WebInviteModal";
import { WebMemberRoleModal } from "./modals/WebMemberRoleModal";
import {
  SvgShield,
  SvgUsers,
  SvgPlus,
  SvgSearch,
  SvgX,
  SvgCheck,
  SvgFileText,
} from "./SvgIcons";

const ROLE_CONFIG: Record<UserRole, { color: string; bg: string; border: string; label: string }> = {
  admin: { color: "#818CF8", bg: "#6366F120", border: "#6366F140", label: "ADMIN" },
  accountant: { color: "#FBBF24", bg: "#F59E0B20", border: "#F59E0B40", label: "ACCOUNTANT" },
  manager: { color: "#C084FC", bg: "#8B5CF620", border: "#8B5CF640", label: "MANAGER" },
  employee: { color: "#34D399", bg: "#10B98120", border: "#10B98140", label: "EMPLOYEE" },
};

const DEFAULT_TEAM_MEMBERS: User[] = [
  {
    id: "u1",
    name: "Ahmed Aqeel",
    email: "admin@ofm.com",
    role: "admin",
    organization: "Organization Finance Management",
    organizationId: "demo-org",
  },
  {
    id: "u2",
    name: "Maryam Naz",
    email: "accountant@ofm.com",
    role: "accountant",
    organization: "Organization Finance Management",
    organizationId: "demo-org",
  },
  {
    id: "u3",
    name: "Dr. Sundas Iftikhar",
    email: "manager@ofm.com",
    role: "manager",
    organization: "Organization Finance Management",
    organizationId: "demo-org",
  },
  {
    id: "u4",
    name: "Ali Hassan",
    email: "employee@ofm.com",
    role: "employee",
    organization: "Organization Finance Management",
    organizationId: "demo-org",
  },
];

export function WebTeam() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();

  const [members, setMembers] = useState<User[]>(DEFAULT_TEAM_MEMBERS);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");

  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<User | null>(null);

  const canManage = user?.role === "admin";

  useEffect(() => {
    if (!user) return;
    const isDemo = user.organizationId === "demo-org";
    const orgName = user.organization || settings.organizationName || "Organization Finance Management";
    const orgId = user.organizationId || "default-org";

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

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const seen = new Set<string>();
          const list: User[] = [];
          snap.forEach((d) => {
            const m = { id: d.id, ...d.data() } as User;
            const emailKey = (m.email || "").toLowerCase().trim();
            if (emailKey && !seen.has(emailKey)) {
              seen.add(emailKey);
              list.push(m);
            }
          });
          list.sort((a, b) => {
            if (a.role === "admin" && b.role !== "admin") return -1;
            if (a.role !== "admin" && b.role === "admin") return 1;
            return (a.name || a.email || "").localeCompare(b.name || b.email || "");
          });
          setMembers(list);
        } else {
          setMembers(isDemo ? DEFAULT_TEAM_MEMBERS.map((m) => ({ ...m, organization: orgName })) : [user]);
        }
        setLoading(false);
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Team live sync notice:", err.message);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user?.id, user?.organizationId, settings.organizationName]);

  const ROLE_WEIGHT: Record<string, number> = {
    admin: 1,
    accountant: 2,
    manager: 3,
    employee: 4,
    viewer: 5,
  };

  const filteredMembers = useMemo(() => {
    const list = members.filter((m) => {
      const matchRole = roleFilter === "all" || m.role === roleFilter;
      const matchSearch =
        search.trim() === "" ||
        (m.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (m.email || "").toLowerCase().includes(search.toLowerCase()) ||
        (m.role || "").toLowerCase().includes(search.toLowerCase());
      return matchRole && matchSearch;
    });

    return list.sort((a, b) => {
      const isCurrentA = a.email?.toLowerCase() === user?.email?.toLowerCase();
      const isCurrentB = b.email?.toLowerCase() === user?.email?.toLowerCase();
      if (isCurrentA && !isCurrentB) return -1;
      if (!isCurrentA && isCurrentB) return 1;

      const weightA = ROLE_WEIGHT[(a.role || "").toLowerCase()] ?? 99;
      const weightB = ROLE_WEIGHT[(b.role || "").toLowerCase()] ?? 99;
      if (weightA !== weightB) return weightA - weightB;

      return (a.name || a.email || "").localeCompare(b.name || b.email || "");
    });
  }, [members, roleFilter, search, user?.email]);

  const adminCount = members.filter((m) => m.role === "admin").length;
  const accountantCount = members.filter((m) => m.role === "accountant").length;
  const managerCount = members.filter((m) => m.role === "manager").length;
  const employeeCount = members.filter((m) => m.role === "employee").length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isMobile && { padding: 14, gap: 14 }]} showsVerticalScrollIndicator={false}>
      {/* ─── Header ─── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 240 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: "#6366F120" }]}>
              <SvgShield size={20} color="#6366F1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Team & Access Control</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground, fontSize: isMobile ? 12 : 13 }]}>
                Role-based access matrix, personnel management, and system authorization
              </Text>
            </View>
          </View>
        </View>

        {canManage && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: "#6366F1" }, isMobile && { width: "100%" }]}
            onPress={() => setInviteModalVisible(true)}
            activeOpacity={0.8}
          >
            <SvgPlus size={15} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Invite Colleague</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Role Count KPIs ─── */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>ACTIVE TEAM MEMBERS</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{members.length} Users</Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            Authorized institutional staff
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>ADMINISTRATORS & MANAGERS</Text>
          <Text style={[styles.metricValue, { color: "#818CF8" }]}>{adminCount + managerCount} Officers</Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {adminCount} Admins · {managerCount} Managers
          </Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border, minWidth: isMobile ? "100%" : 200 }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>ACCOUNTANTS & EMPLOYEES</Text>
          <Text style={[styles.metricValue, { color: "#FBBF24" }]}>{accountantCount + employeeCount} Staff</Text>
          <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
            {accountantCount} Accountants · {employeeCount} Employees
          </Text>
        </View>
      </View>

      {/* ─── Search & Role Filters ─── */}
      <View style={[styles.filterBarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <SvgSearch size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name, email, or role..."
            placeholderTextColor={colors.mutedForeground + "80"}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <SvgX size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Filter Role:</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All Roles" },
              { id: "admin", label: "ADMIN" },
              { id: "accountant", label: "ACCOUNTANT" },
              { id: "manager", label: "MANAGER" },
              { id: "employee", label: "EMPLOYEE" },
            ].map((rf) => (
              <TouchableOpacity
                key={rf.id}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: roleFilter === rf.id ? "#6366F1" : colors.background,
                    borderColor: roleFilter === rf.id ? "#6366F1" : colors.border,
                  },
                ]}
                onPress={() => setRoleFilter(rf.id as any)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: roleFilter === rf.id ? "#FFFFFF" : colors.foreground },
                  ]}
                >
                  {rf.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ─── Members Roster Table ─── */}
      {isMobile ? (
        <View style={{ gap: 10 }}>
          {filteredMembers.length === 0 ? (
            <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14 }]}>
              <SvgFileText size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No team members matching filter</Text>
            </View>
          ) : (
            filteredMembers.map((m) => {
              const roleCfg = ROLE_CONFIG[m.role] || { color: colors.primary, bg: colors.primary + "20", border: colors.primary + "40", label: m.role?.toUpperCase() };
              return (
                <View
                  key={m.id}
                  style={[
                    styles.mobileCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.mobileCardTop}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={[styles.avatarBox, { backgroundColor: roleCfg.bg }]}>
                        <Text style={[styles.avatarText, { color: roleCfg.color }]}>
                          {(m.name || m.email || "U").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={[styles.memberName, { color: colors.foreground }]}>{m.name || m.email || "Member"}</Text>
                        <Text style={[styles.memberEmail, { color: colors.mutedForeground }]}>{m.email}</Text>
                      </View>
                    </View>

                    <View style={[styles.roleBadge, { backgroundColor: roleCfg.bg, borderColor: roleCfg.border, borderWidth: 1 }]}>
                      <Text style={[styles.roleBadgeText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
                    </View>
                  </View>

                  {canManage && m.email !== user?.email && (
                    <View style={styles.mobileActionsRow}>
                      <TouchableOpacity
                        style={[styles.mobileActionBtn, { borderColor: colors.border }]}
                        onPress={() => {
                          setSelectedMember(m);
                          setRoleModalVisible(true);
                        }}
                      >
                        <Text style={[styles.mobileActionText, { color: colors.primary }]}>Change Role</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      ) : (
        <View style={[styles.tableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }} showsHorizontalScrollIndicator={true}>
            <View style={{ minWidth: 960, width: "100%" }}>
              <View style={[styles.tableHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                <View style={[styles.thCol, { flex: 1.3, minWidth: 260, paddingLeft: 16, paddingRight: 12, alignItems: "flex-start", justifyContent: "center" }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>MEMBER</Text>
                </View>
                <View style={[styles.thCol, { flex: 1.4, minWidth: 250, paddingHorizontal: 12, alignItems: "flex-start", justifyContent: "center" }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>EMAIL</Text>
                </View>
                <View style={[styles.thCol, { flex: 0.8, minWidth: 140, paddingHorizontal: 12, alignItems: "flex-start", justifyContent: "center" }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>ROLE</Text>
                </View>
                <View style={[styles.thCol, { flex: 0.7, minWidth: 120, paddingHorizontal: 12, alignItems: "flex-start", justifyContent: "center" }]}>
                  <Text style={[styles.thText, { color: colors.mutedForeground }]}>STATUS</Text>
                </View>
                {canManage && (
                  <View style={[styles.thCol, { flex: 0.8, minWidth: 130, paddingRight: 16, paddingLeft: 12, alignItems: "flex-end", justifyContent: "center" }]}>
                    <Text style={[styles.thText, { color: colors.mutedForeground, textAlign: "right" }]}>ACTIONS</Text>
                  </View>
                )}
              </View>

              {filteredMembers.map((m) => {
                const roleCfg = ROLE_CONFIG[m.role] || { color: colors.primary, bg: colors.primary + "20", border: colors.primary + "40", label: m.role?.toUpperCase() };
                const isCurrent = m.email?.toLowerCase() === user?.email?.toLowerCase();
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.tableRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: isCurrent ? colors.primary + "06" : "transparent",
                      },
                    ]}
                  >
                    <View style={[styles.tdCol, { flex: 1.3, minWidth: 260, paddingLeft: 16, paddingRight: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 12 }]}>
                      <View style={[styles.avatarBox, { backgroundColor: roleCfg.bg }]}>
                        <Text style={[styles.avatarText, { color: roleCfg.color }]}>
                          {(m.name || m.email || "U").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>
                          {m.name || m.email?.split("@")[0] || "User"}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.tdCol, { flex: 1.4, minWidth: 250, paddingHorizontal: 12, alignItems: "flex-start", justifyContent: "center" }]}>
                      <Text style={[styles.memberEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {m.email}
                      </Text>
                    </View>

                    <View style={[styles.tdCol, { flex: 0.8, minWidth: 140, paddingHorizontal: 12, alignItems: "flex-start", justifyContent: "center" }]}>
                      <View style={[styles.roleBadge, { backgroundColor: roleCfg.bg, borderColor: roleCfg.border, borderWidth: 1 }]}>
                        <Text style={[styles.roleBadgeText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
                      </View>
                    </View>

                    <View style={[styles.tdCol, { flex: 0.7, minWidth: 120, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 7 }]}>
                      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#10B981" }} />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#10B981" }}>Active</Text>
                    </View>

                    {canManage && (
                      <View style={[styles.tdCol, { flex: 0.8, minWidth: 130, paddingRight: 16, paddingLeft: 12, alignItems: "flex-end", justifyContent: "center" }]}>
                        {!isCurrent ? (
                          <TouchableOpacity
                            style={[styles.actionBtn, { borderColor: "#6366F135", backgroundColor: "#6366F112" }]}
                            onPress={() => {
                              setSelectedMember(m);
                              setRoleModalVisible(true);
                            }}
                          >
                            <Text style={{ fontSize: 11.5, fontFamily: "Inter_600SemiBold", color: "#818CF8" }}>Manage</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={[styles.currentUserBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
                            <Text style={[styles.currentUserText, { color: colors.primary }]}>Current User</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Modals */}
      <WebInviteModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        onInviteSuccess={(newMember) => {
          setMembers((prev) => [...prev, newMember]);
        }}
      />

      <WebMemberRoleModal
        visible={roleModalVisible}
        member={selectedMember}
        onClose={() => {
          setRoleModalVisible(false);
          setSelectedMember(null);
        }}
        onUpdateSuccess={(updatedMember) => {
          setMembers((prev) => prev.map((m) => (m.id === updatedMember.id ? updatedMember : m)));
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
  content: {
    padding: 24,
    gap: 20,
    paddingBottom: 60,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 14,
  },
  titleIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.1,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 200,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  metricLabel: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.6,
    marginVertical: 2,
  },
  metricSub: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
  },
  filterBarCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    outlineStyle: "none",
  } as any,
  filterLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  mobileCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  mobileCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  avatarBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontFamily: "Inter_800ExtraBold",
  },
  memberName: {
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  memberEmail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  roleBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  mobileActionsRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 8,
  },
  mobileActionBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  mobileActionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tableCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    width: "100%",
    maxWidth: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  thCol: {
    justifyContent: "center",
  },
  thText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  tdCol: {
    justifyContent: "center",
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  currentUserBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },
  currentUserText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  emptyWrap: {
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
