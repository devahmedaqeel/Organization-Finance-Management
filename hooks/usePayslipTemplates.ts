import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { can } from "@/services/permissionService";
import { subscribePayslipTemplates, PayslipTemplateLibrary } from "@/services/PayslipTemplateService";
import { DEFAULT_TEMPLATE_ID, PayslipTemplate, mergeTemplateDocs, resolveTemplate } from "@/services/payslipTemplateConfig";
import { PayslipOrganizationProfile } from "@/services/payslipTemplateRenderer";

/**
 * Live payslip template library for the signed-in user's organization.
 * Web and mobile both use this hook, so they always see the same templates.
 */
export function usePayslipTemplates() {
  const { user } = useAuth();
  const orgId = user?.organizationId || "";
  const [library, setLibrary] = useState<PayslipTemplateLibrary>(() => ({
    templates: mergeTemplateDocs([], orgId),
    defaultTemplateId: DEFAULT_TEMPLATE_ID,
    source: "cache",
  }));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribePayslipTemplates(orgId, (lib) => {
      setLibrary(lib);
      setLoading(false);
    });
  }, [orgId]);

  return useMemo(
    () => ({
      ...library,
      loading,
      activeTemplates: library.templates.filter((t) => t.isActive),
      resolve: (id?: string | null): PayslipTemplate => resolveTemplate(library.templates, id, library.defaultTemplateId),
      canManage: can(user, "manage_payslip_templates"),
      canSetDefault: can(user, "set_default_payslip_template"),
      canSelect: can(user, "select_payslip_template"),
      canViewSensitive: can(user, "view_sensitive_payroll_data"),
    }),
    [library, loading, user]
  );
}

/**
 * The organization profile used on payslips. The logo is ALWAYS the one saved in
 * Settings → Organization Profile; changing it there updates future previews/PDFs.
 */
export function usePayslipOrganizationProfile(): PayslipOrganizationProfile {
  const { user } = useAuth();
  const { settings } = useSettings();
  return useMemo(
    () => ({
      organizationId: user?.organizationId,
      name: settings.organizationName || user?.organization || "",
      address: settings.organizationAddress || "",
      email: settings.organizationEmail || "",
      phone: settings.organizationPhone || "",
      logo: settings.organizationLogo || "",
      currency: settings.currency || "PKR",
    }),
    [
      user?.organizationId,
      user?.organization,
      settings.organizationName,
      settings.organizationAddress,
      settings.organizationEmail,
      settings.organizationPhone,
      settings.organizationLogo,
      settings.currency,
    ]
  );
}
