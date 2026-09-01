import { UserRole, User } from "@/context/AuthContext";

export type Permission =
  | "manage_organization"
  | "manage_team"
  | "invite_members"
  | "change_roles"
  | "manage_settings"
  | "create_transaction"
  | "edit_transaction"
  | "delete_transaction"
  | "manage_budgets"
  | "manage_departments"
  | "manage_payroll"
  | "view_payroll"
  | "view_reports"
  | "export_reports"
  | "view_insights";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    "manage_organization",
    "manage_team",
    "invite_members",
    "change_roles",
    "manage_settings",
    "create_transaction",
    "edit_transaction",
    "delete_transaction",
    "manage_budgets",
    "manage_departments",
    "manage_payroll",
    "view_payroll",
    "view_reports",
    "export_reports",
    "view_insights",
  ],
  accountant: [
    "create_transaction",
    "edit_transaction",
    "delete_transaction",
    "manage_budgets",
    "view_payroll",
    "view_reports",
    "export_reports",
    "view_insights",
  ],
  manager: [
    "view_reports",
    "export_reports",
    "view_insights",
    "view_payroll",
  ],
  employee: [
    "view_reports",
  ],
};

/**
 * Check if a user or role has a specific permission.
 * Security Note: Authoritative access is verified against the user's Firestore record.
 */
export function can(userOrRole: User | UserRole | null | undefined, permission: Permission): boolean {
  if (!userOrRole) return false;
  const role: UserRole = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Get all permissions granted to a given role.
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}
