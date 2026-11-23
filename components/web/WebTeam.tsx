import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, useWindowDimensions } from "react-native";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/config/firebase";
import { useAuth, User, UserRole } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { WebInviteModal } from "./modals/WebInviteModal";
import { FitText } from "./FitText";
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

const ROLE_CONFIG: Record<UserRole, { color: string; bg: string; border: string; label: string; desc: string }> = {
  admin: { color: "#4F46E5", bg: "#4F46E516", border: "#4F46E540", label: "Admin", desc: "Full access, including team, settings and payroll" },
  accountant: { color: "#B45309", bg: "#B4530916", border: "#B4530940", label: "Accountant", desc: "Records income, expenses, budgets and payroll" },
  manager: { color: "#7C3AED", bg: "#7C3AED16", border: "#7C3AED40", label: "Manager", desc: "Views reports, budgets and department spending" },
  employee: { color: "#047857", bg: "#04785716", border: "#04785740", label: "Employee", desc: "Sees only their own payslips" },
};


export function WebTeam() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { settings } = useSettings();

  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");

  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<User | null>(null);

  const canManage = user?.role === "admin";

  useEffect(() => {
    if (!user) return;
    const orgId = user.organizationId || "default-org";
    const q = query(collection(db, "users"), where("organizationId", "==", orgId));

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
          setMembers(user ? [user] : []);
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[styles.titleIconBadge, { backgroundColor: colors.primary + "16" }]}>
              <SvgShield size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.foreground, fontSize: isMobile ? 19 : 22 }]}>Team & permissions</Text>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
                Invite people and choose what each person can see and do
              </Text>
            </View>
          </View>
        </View>

        {canManage && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }, isMobile && { width: "100%" }]}
            onPress={() => setInviteModalVisible(true)}
            activeOpacity={0.8}
          >
            <SvgPlus size={15} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Invite a team member</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Summary cards ─── */}
      <View style={styles.metricsGrid}>
        {[
          { label: "Team members", value: String(members.length), sub: `${members.length === 1 ? "person has" : "people have"} access`, color: colors.primary },
          { label: "Admins & managers", value: String(adminCount + managerCount), sub: `${adminCount} ${adminCount === 1 ? "admin" : "admins"} · ${managerCount} ${managerCount === 1 ? "manager" : "managers"}`, color: ROLE_CONFIG.admin.color },
          { label: "Accountants & employees", value: String(accountantCount + employeeCount), sub: `${accountantCount} ${accountantCount === 1 ? "accountant" : "accountants"} · ${employeeCount} ${employeeCount === 1 ? "employee" : "employees"}`, color: ROLE_CONFIG.accountant.color },
        ].map((c) => (
          <View key={c.label} style={[styles.metricCard, styles.tSumCard, { backgroundColor: colors.card, borderColor: colors.border, borderTopColor: c.color, minWidth: isMobile ? "100%" : 200 }]}>
            <Text style={[styles.tSumLabel, { color: colors.mutedForeground }]}>{c.label}</Text>
            <Text style={[styles.tSumValue, { color: colors.foreground }]}>{c.value}</Text>
            <Text style={[styles.tSumSub, { color: colors.mutedForeground }]}>{c.sub}</Text>
          </View>
        ))}
      </View>

      {/* ─── Search & role filter ─── */}
      <View style={[styles.filterBarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <SvgSearch size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name, email or role"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
              <SvgX size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.tFilterRow}>
          <Text style={[styles.tFilterLabel, { color: colors.mutedForeground }]}>Role</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {[
              { id: "all", label: "All", count: members.length },
              { id: "admin", label: "Admin", count: adminCount },
              { id: "accountant", label: "Accountant", count: accountantCount },
              { id: "manager", label: "Manager", count: managerCount },
              { id: "employee", label: "Employee", count: employeeCount },
            ].map((rf) => {
              const isSel = roleFilter === rf.id;
              return (
                <TouchableOpacity
                  key={rf.id}
                  style={[styles.filterChip, { backgroundColor: isSel ? colors.primary : colors.background, borderColor: isSel ? colors.primary : colors.border, flexDirection: "row", alignItems: "center", gap: 6 }]}
                  onPress={() => setRoleFilter(rf.id as any)}
                >
                  <Text style={[styles.filterChipText, { color: isSel ? "#FFFFFF" : colors.foreground }]}>{rf.label}</Text>
                  <Text style={[styles.filterChipText, { color: isSel ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>{rf.count}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={[styles.tResultRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.tResultText, { color: colors.foreground }]}>
            Showing {filteredMembers.length} of {members.length} {members.length === 1 ? "member" : "members"}
          </Text>
          {(roleFilter !== "all" || search.trim().length > 0) && (
            <TouchableOpacity
              onPress={() => {
                setRoleFilter("all" as any);
                setSearch("");
              }}
              style={[styles.tClearBtn, { borderColor: colors.border }]}
            >
              <SvgX size={12} color={colors.primary} />
              <Text style={[styles.tClearText, { color: colors.primary }]}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Members ─── */}
      {isMobile ? (
        <View style={{ gap: 10 }}>
          {filteredMembers.length === 0 ? (
            <View style={[styles.emptyWrap, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8 }]}>
              <SvgFileText size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No team members found</Text>
            </View>
          ) : (
            filteredMembers.map((m) => {
              const roleCfg = ROLE_CONFIG[m.role] || { color: colors.primary, bg: colors.primary + "18", border: colors.primary + "40", label: m.role || "Member", desc: "" };
              const isCurrent = m.email?.toLowerCase() === user?.email?.toLowerCase();
              return (
                <View key={m.id} style={[styles.mobileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[styles.tAvatar, { backgroundColor: roleCfg.bg }]}>
                      <Text style={[styles.tAvatarText, { color: roleCfg.color }]}>{initialsOf(m)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.tName, { color: colors.foreground }]}>
                        {m.name || m.email?.split("@")[0] || "Member"}
                        {isCurrent ? <Text style={{ color: colors.primary }}>  (you)</Text> : null}
                      </Text>
                      <FitText style={[styles.tEmail, { color: colors.mutedForeground }]}>{m.email || ""}</FitText>
                    </View>
                    <View style={[styles.tRole, { backgroundColor: roleCfg.bg }]}>
                      <Text style={[styles.tRoleText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
                    </View>
                  </View>
                  {roleCfg.desc ? <Text style={[styles.tSumSub, { color: colors.mutedForeground }]}>{roleCfg.desc}</Text> : null}
                  {canManage && !isCurrent && (
                    <View style={styles.mobileActionsRow}>
                      <TouchableOpacity
                        style={[styles.mobileActionBtn, { borderColor: colors.border }]}
                        onPress={() => {
                          setSelectedMember(m);
                          setRoleModalVisible(true);
                        }}
                      >
                        <Text style={[styles.mobileActionText, { color: colors.primary }]}>Change role</Text>
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
          <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }} showsHorizontalScrollIndicator>
            <View style={{ minWidth: 900, width: "100%" }}>
              <View style={[styles.tableHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
                {TEAM_COLS.filter((c) => canManage || c.key !== "act").map((c) => (
                  <View key={c.key} style={[styles.tCell, c.style]}>
                    <Text numberOfLines={1} style={[styles.tTh, { color: colors.mutedForeground, textAlign: c.align }]}>{c.label}</Text>
                  </View>
                ))}
              </View>

              {filteredMembers.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <SvgFileText size={36} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No team members found</Text>
                </View>
              ) : (
                filteredMembers.map((m) => {
                  const roleCfg = ROLE_CONFIG[m.role] || { color: colors.primary, bg: colors.primary + "18", border: colors.primary + "40", label: m.role || "Member", desc: "" };
                  const isCurrent = m.email?.toLowerCase() === user?.email?.toLowerCase();
                  return (
                    <View key={m.id} style={[styles.tableRow, { borderBottomColor: colors.border, backgroundColor: isCurrent ? colors.primary + "08" : "transparent" }]}>
                      <View style={[styles.tCell, TEAM_COLS[0].style, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
                        <View style={[styles.tAvatar, { backgroundColor: roleCfg.bg }]}>
                          <Text style={[styles.tAvatarText, { color: roleCfg.color }]}>{initialsOf(m)}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <FitText style={[styles.tName, { color: colors.foreground, flexShrink: 1 }]}>{m.name || m.email?.split("@")[0] || "User"}</FitText>
                            {isCurrent ? (
                              <View style={[styles.tYou, { backgroundColor: colors.primary + "18" }]}>
                                <Text style={[styles.tYouText, { color: colors.primary }]}>You</Text>
                              </View>
                            ) : null}
                          </View>
                          <FitText style={[styles.tEmail, { color: colors.mutedForeground }]}>{m.email || ""}</FitText>
                        </View>
                      </View>
                      <View style={[styles.tCell, TEAM_COLS[1].style]}>
                        <View style={[styles.tRole, { backgroundColor: roleCfg.bg, alignSelf: "flex-start" }]}>
                          <Text numberOfLines={1} style={[styles.tRoleText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
                        </View>
                      </View>
                      <View style={[styles.tCell, TEAM_COLS[2].style]}>
                        <Text style={[styles.tDesc, { color: colors.mutedForeground }]}>{roleCfg.desc}</Text>
                      </View>
                      <View style={[styles.tCell, TEAM_COLS[3].style, { flexDirection: "row", alignItems: "center", gap: 6 }]}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.income }} />
                        <Text numberOfLines={1} style={[styles.tDesc, { color: colors.income, fontFamily: "Inter_600SemiBold" }]}>Active</Text>
                      </View>
                      {canManage && (
                        <View style={[styles.tCell, TEAM_COLS[4].style, { alignItems: "flex-end" }]}>
                          {!isCurrent ? (
                            <TouchableOpacity
                              style={[styles.tBtn, { borderColor: colors.border }]}
                              onPress={() => {
                                setSelectedMember(m);
                                setRoleModalVisible(true);
                              }}
                            >
                              <Text numberOfLines={1} style={[styles.tBtnText, { color: colors.primary }]}>Change role</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text numberOfLines={1} style={[styles.tDesc, { color: colors.mutedForeground }]}>Signed in</Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Modals */}
      <WebInviteModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        existingEmails={members.map((m) => m.email || "")}
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

/** Two-letter initials for the avatar (e.g. "Ahmed Aqeel" → "AA"). */
function initialsOf(m: { name?: string; email?: string }): string {
  const src = (m.name || m.email?.split("@")[0] || "U").trim();
  return src.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "U";
}

// Shared column layout so the header and every row line up exactly.
const TEAM_COLS = [
  { key: "member", label: "Member", align: "left", style: { flex: 1.4, minWidth: 280, paddingLeft: 16 } },
  { key: "role", label: "Role", align: "left", style: { width: 130 } },
  { key: "access", label: "What they can do", align: "left", style: { flex: 1, minWidth: 220 } },
  { key: "status", label: "Status", align: "left", style: { width: 90 } },
  { key: "act", label: "Actions", align: "right", style: { width: 140, paddingRight: 16 } },
] as const;

const styles = StyleSheet.create({
  tSumCard: { borderTopWidth: 3, gap: 6 },
  tSumLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  tSumValue: { fontSize: 24, fontFamily: "Inter_600SemiBold", letterSpacing: -0.3 },
  tSumSub: { fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 18 },
  tFilterRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  tFilterLabel: { width: 60, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tResultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, paddingTop: 12, borderTopWidth: 1 },
  tResultText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tClearBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1 },
  tClearText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tCell: { paddingHorizontal: 8, justifyContent: "center" },
  tTh: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  tAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tAvatarText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tName: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  tEmail: { fontSize: 12.5, fontFamily: "Inter_400Regular", lineHeight: 17 },
  tYou: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  tYouText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tRole: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tRoleText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold" },
  tDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  tBtn: { height: 32, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.4,
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
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11.5,
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
    borderRadius: 10,
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
    paddingHorizontal: 14,
    height: 32,
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  mobileCard: {
    borderRadius: 8,
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
    borderRadius: 10,
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
