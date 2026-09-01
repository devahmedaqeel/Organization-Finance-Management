export interface BrandConfig {
  name: string;
  shortName: string;
  fullName: string;
  tagline: string;
  description: string;
  organization: string;
  defaultCurrency: string;
  supportEmail: string;
  version: string;
}

export const OFM_BRAND: BrandConfig = {
  name: "OFM — Organization Finance Management",
  shortName: "OFM",
  fullName: "OFM — Organization Finance Management",
  tagline: "Professional Organization Finance Management",
  description:
    "OFM — Organization Finance Management is an enterprise-grade financial management platform for institutional budgets, ledger transactions, department cost centers, payroll intelligence, and real-time cross-platform synchronization.",
  organization: "OFM — Organization Finance Management",
  defaultCurrency: "PKR",
  supportEmail: "support@ofm-cloud.com",
  version: "1.0.0",
};
