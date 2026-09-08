export type AppTheme = "system" | "light" | "dark";

export interface Settings {
  organizationName: string;
  organizationAddress: string;
  organizationEmail: string;
  organizationPhone: string;
  currency: string;
  fiscalYear: string;
  organizationLogo?: string;
  emailAutomatedEnabled?: boolean;
  emailjsServiceId?: string;
  emailjsTemplateId?: string;
  emailjsPublicKey?: string;
  theme?: AppTheme;
  customIncomeCategories?: string[];
  customExpenseCategories?: string[];
}

export const getCleanDefaultSettings = (orgName?: string, isDemoAdmin?: boolean): Settings => {
  if (isDemoAdmin) {
    return {
      organizationName: "DevOrbit Tech Kotli",
      organizationAddress: "Kotli, Azad Kashmir",
      organizationEmail: "",
      organizationPhone: "+92-586-444111",
      currency: "PKR",
      fiscalYear: "2025-2026",
      organizationLogo: "",
      emailAutomatedEnabled: false,
      emailjsServiceId: "",
      emailjsTemplateId: "",
      emailjsPublicKey: "",
      theme: "system",
      customIncomeCategories: [],
      customExpenseCategories: [],
    };
  }
  return {
    organizationName: orgName || "My Organization",
    organizationAddress: "",
    organizationEmail: "",
    organizationPhone: "",
    currency: "PKR",
    fiscalYear: "2025-2026",
    organizationLogo: "",
    emailAutomatedEnabled: false,
    emailjsServiceId: "",
    emailjsTemplateId: "",
    emailjsPublicKey: "",
    theme: "system",
    customIncomeCategories: [],
    customExpenseCategories: [],
  };
};
