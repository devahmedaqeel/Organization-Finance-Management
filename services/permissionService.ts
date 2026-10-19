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
  | "view_budgets"
  | "view_departments"
  | "manage_departments"
  | "manage_payroll"
  | "view_payroll"
  | "view_reports"
  | "export_reports"
  | "view_insights"
  | "manage_salary_components"
  | "manage_employee_salary"
  | "manage_loans"
  | "approve_payroll"
  | "view_own_payslip"
  | "manage_payslip_templates"
  | "set_default_payslip_template"
  | "select_payslip_template"
  | "view_sensitive_payroll_data";

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
    "view_budgets",
    "manage_departments",
    "view_departments",
    "manage_payroll",
    "view_payroll",
    "view_reports",
    "export_reports",
    "view_insights",
    "manage_salary_components",
    "manage_employee_salary",
    "manage_loans",
    "approve_payroll",
    "view_own_payslip",
    "manage_payslip_templates",
    "set_default_payslip_template",
    "select_payslip_template",
    "view_sensitive_payroll_data",
  ],
  accountant: [
    "create_transaction",
    "edit_transaction",
    "delete_transaction",
    "manage_budgets",
    "view_budgets",
    "view_departments",
    "manage_payroll",
    "view_payroll",
    "view_reports",
    "export_reports",
    "view_insights",
    "manage_salary_components",
    "manage_employee_salary",
    "manage_loans",
    "view_own_payslip",
    "manage_payslip_templates",
    "select_payslip_template",
    "view_sensitive_payroll_data",
  ],
  manager: [
    "view_budgets",
    "view_departments",
    "view_reports",
    "export_reports",
    "view_insights",
    "view_payroll",
    "approve_payroll",
    "view_own_payslip",
    "select_payslip_template",
  ],
  employee: [
    "view_reports",
    "view_own_payslip",
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
