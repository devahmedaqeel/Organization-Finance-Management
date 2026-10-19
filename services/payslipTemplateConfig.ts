/**
 * services/payslipTemplateConfig.ts
 *
 * Payslip Template configuration model, field catalog, built-in templates and
 * normalization. Pure TypeScript (no React Native / Firebase imports) so the same
 * definitions are shared by web, mobile, the PDF generator and the test-suite.
 *
 * A template controls PRESENTATION ONLY. Nothing in this file reads, writes or
 * recalculates payroll amounts.
 */

export const PAYSLIP_TEMPLATE_SCHEMA_VERSION = 1;

export type PayslipSectionKey =
  | "header"
  | "employee"
  | "earnings"
  | "deductions"
  | "loans"
  | "tax"
  | "employer"
  | "summary"
  | "attendance"
  | "payment"
  | "custom"
  | "footer";

/** Sections that can be moved up/down. Header is always first, footer always last. */
export const REORDERABLE_SECTIONS: PayslipSectionKey[] = [
  "employee",
  "earnings",
  "deductions",
  "loans",
  "tax",
  "employer",
  "summary",
  "attendance",
  "payment",
  "custom",
];

export interface PayslipFieldConfig {
  key: string;
  label: string;
  visible: boolean;
  /** Free text printed before the value (presentation only). */
  prefix?: string;
  /** Free text printed after the value, e.g. "(revised from July)". */
  suffix?: string;
}

export type CustomFieldPlacement = "employee" | "payment" | "attendance" | "tax" | "custom" | "footer";

export const CUSTOM_FIELD_PLACEMENTS: CustomFieldPlacement[] = ["employee", "payment", "attendance", "tax", "custom", "footer"];

/**
 * A free text block the user can place above or below any section of the slip.
 * Presentation only — never read by payroll calculations.
 */
export interface PayslipTextBlock {
  id: string;
  text: string;
  visible: boolean;
  anchor: PayslipSectionKey;
  position: "before" | "after";
  align: "left" | "center" | "right";
  bold: boolean;
  italic: boolean;
  /** Size relative to the template font, e.g. 1 = same size. */
  scale: number;
  color: string;
  boxed: boolean;
}

export interface PayslipSectionConfig {
  key: PayslipSectionKey;
  title: string;
  visible: boolean;
  fields: PayslipFieldConfig[];
}

export interface PayslipComponentOverride {
  /** Display label (presentation only — the payroll component itself is never renamed). */
  label?: string;
  hidden?: boolean;
  order?: number;
  /** Optional sub-group heading the row is shown under, e.g. "Allowances". */
  group?: string;
  /** Free text shown after the component name, e.g. "(45% of basic)". */
  note?: string;
}

export type CustomFieldSource = "text" | "mapped";

export interface PayslipCustomField {
  id: string;
  label: string;
  visible: boolean;
  source: CustomFieldSource;
  /** Static text, when source === "text". */
  value?: string;
  /** Key from MAPPABLE_FIELDS, when source === "mapped". Read-only reference to payroll data. */
  mappedKey?: string;
  /** Which section the field is printed in. */
  placement: CustomFieldPlacement;
}

export type PageSize = "A4" | "Letter";
export type PageOrientation = "portrait" | "landscape";
export type TableBorderStyle = "grid" | "horizontal" | "none";
export type Alignment = "left" | "center" | "right";
export type CurrencyDisplay = "code" | "symbol" | "none";
export type DateFormat = "DD.MM.YYYY" | "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | "D MMM YYYY";
export type TableLayout = "single" | "dual";

export interface PayslipTemplate {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  /** Present on built-in templates and on organization customizations of a built-in. */
  builtInKey?: BuiltInTemplateKey;
  isBuiltIn?: boolean;
  /** True when a built-in template carries organization customizations (restorable). */
  isCustomizedBuiltIn?: boolean;
  isActive: boolean;
  schemaVersion: number;

  page: {
    size: PageSize;
    orientation: PageOrientation;
    marginMm: number;
    fontFamily: string;
    fontSizePt: number;
    sectionSpacingPx: number;
    tableBorders: TableBorderStyle;
    accentColor: string;
  };

  header: {
    align: Alignment;
    /** Title printed under the organization name, e.g. "Monthly Salary Statement". */
    documentTitle: string;
    showDivider: boolean;
  };

  /**
   * Logo PRESENTATION settings. The image itself always comes from the organization
   * profile (orgSettings.organizationLogo) — templates never store a logo copy.
   */
  logo: {
    visible: boolean;
    heightPx: number;
    position: "left" | "center" | "right";
    spacingPx: number;
  };

  format: {
    currencyDisplay: CurrencyDisplay;
    decimals: 0 | 2;
    negativeStyle: "minus" | "parentheses";
    dateFormat: DateFormat;
  };

  components: {
    showCodes: boolean;
    showZeroRows: boolean;
    showSectionTotals: boolean;
    layout: TableLayout;
    columnWidths: { code: number; name: number; amount: number };
    /** Keyed by componentKey() — the component code, or the normalized name when there is no code. */
    overrides: Record<string, PayslipComponentOverride>;
  };

  sections: PayslipSectionConfig[];
  customFields: PayslipCustomField[];
  textBlocks: PayslipTextBlock[];

  footer: {
    showSignatures: boolean;
    signatureLabels: string[];
    notes: string;
    digitalNotice: string;
    customText: string;
  };

  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
}

// ============================================================================
// FIELD CATALOG
// ============================================================================

interface CatalogField {
  key: string;
  label: string;
  /** Sensitive personal/banking data — governed by template visibility AND caller permissions. */
  sensitive?: boolean;
  defaultVisible?: boolean;
  /** Cannot be hidden (the label can still be renamed). */
  required?: boolean;
}

export const SECTION_CATALOG: Record<PayslipSectionKey, { title: string; fields: CatalogField[] }> = {
  header: {
    title: "Organization Header",
    fields: [
      { key: "organizationName", label: "Organization Name" },
      { key: "organizationAddress", label: "Address" },
      { key: "organizationContact", label: "Contact" },
      { key: "documentTitle", label: "Document Title" },
      { key: "period", label: "Payroll Period" },
      { key: "payslipNumber", label: "Payslip No." },
      { key: "issueDate", label: "Issue Date" },
    ],
  },
  employee: {
    title: "Employee Information",
    fields: [
      { key: "employeeName", label: "Employee Name", required: true },
      { key: "employeeId", label: "Personnel Number" },
      { key: "cnic", label: "CNIC", sensitive: true },
      { key: "ntn", label: "NTN", sensitive: true },
      { key: "designation", label: "Designation" },
      { key: "department", label: "Department" },
      { key: "branch", label: "Branch" },
      { key: "employmentCategory", label: "Employment Category" },
      { key: "dateOfJoining", label: "Date of Joining" },
      { key: "lengthOfService", label: "Length of Service" },
      { key: "payScale", label: "BPS / Grade" },
      { key: "payStage", label: "Pay Stage" },
      { key: "basicSalary", label: "Basic Salary" },
      { key: "payrollSection", label: "Payroll Section" },
      { key: "email", label: "Email", defaultVisible: false },
      { key: "phone", label: "Phone", defaultVisible: false },
      { key: "address", label: "Address", defaultVisible: false },
    ],
  },
  earnings: {
    title: "Pay and Allowances",
    fields: [
      { key: "colCode", label: "Code" },
      { key: "colName", label: "Wage Type", required: true },
      { key: "colAmount", label: "Amount", required: true },
      { key: "total", label: "Total Earnings" },
    ],
  },
  deductions: {
    title: "Deductions - General",
    fields: [
      { key: "colCode", label: "Code" },
      { key: "colName", label: "Wage Type", required: true },
      { key: "colAmount", label: "Amount", required: true },
      { key: "total", label: "Total General Deductions" },
    ],
  },
  loans: {
    title: "Deductions - Loans and Advances",
    fields: [
      { key: "loanId", label: "Loan" },
      { key: "description", label: "Description", required: true },
      { key: "principal", label: "Principal Amount" },
      { key: "installment", label: "Deduction", required: true },
      { key: "balance", label: "Balance" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total Loan Deductions" },
    ],
  },
  tax: {
    title: "Deductions - Income Tax",
    fields: [
      { key: "taxableIncome", label: "Taxable Salary" },
      { key: "taxPeriod", label: "Tax Period" },
      { key: "taxDeductedThisMonth", label: "Tax Deducted This Month" },
      { key: "taxRecoveredPreviously", label: "Recovered Previously" },
      { key: "taxExemptions", label: "Exempted" },
      { key: "taxAdjustment", label: "Adjustment" },
      { key: "remainingTaxPayable", label: "Remaining Payable" },
    ],
  },
  employer: {
    title: "Employer Contributions",
    fields: [
      { key: "colCode", label: "Code" },
      { key: "colName", label: "Contribution", required: true },
      { key: "colAmount", label: "Amount", required: true },
      { key: "total", label: "Total Employer Contributions" },
    ],
  },
  summary: {
    title: "Salary Summary",
    fields: [
      { key: "basicSalary", label: "Basic Salary", defaultVisible: false },
      { key: "totalAllowances", label: "Total Allowances", defaultVisible: false },
      { key: "grossSalary", label: "Gross Pay" },
      { key: "totalGeneralDeductions", label: "General Deductions", defaultVisible: false },
      { key: "totalLoanDeductions", label: "Loan Deductions", defaultVisible: false },
      { key: "totalTaxDeductions", label: "Tax Deductions", defaultVisible: false },
      { key: "otherDeductions", label: "Other Deductions", defaultVisible: false },
      { key: "totalEmployeeDeductions", label: "Deductions" },
      { key: "netSalary", label: "Net Pay", required: true },
      { key: "employerContributions", label: "Employer Contributions", defaultVisible: false },
      { key: "totalEmployerCost", label: "Total Employer Payroll Cost", defaultVisible: false },
    ],
  },
  attendance: {
    title: "Attendance and Leave",
    fields: [
      { key: "workingDays", label: "Working Days" },
      { key: "daysPresent", label: "Days Present" },
      { key: "paidLeave", label: "Paid Leave" },
      { key: "unpaidLeave", label: "Unpaid Leave" },
      { key: "absences", label: "Absences" },
      { key: "overtimeHours", label: "Overtime Hours" },
      { key: "leaveBalance", label: "Leave Balance" },
    ],
  },
  payment: {
    title: "Payment Details",
    fields: [
      { key: "payeeName", label: "Payee Name" },
      { key: "bankName", label: "Bank", sensitive: true },
      { key: "bankAccount", label: "Account Number", sensitive: true },
      { key: "paymentMethod", label: "Payment Method" },
      { key: "paymentDate", label: "Payment Date" },
      { key: "paymentReference", label: "Payment Reference" },
      { key: "paymentStatus", label: "Payment Status" },
    ],
  },
  custom: {
    title: "Additional Information",
    fields: [],
  },
  footer: {
    title: "Footer",
    fields: [
      { key: "approvedBy", label: "Approved By" },
      { key: "approvedAt", label: "Approval Date" },
      { key: "generatedDate", label: "Generated On" },
      { key: "verificationCode", label: "Verification Code" },
      { key: "notes", label: "Notes" },
      { key: "digitalNotice", label: "Digital Notice" },
      { key: "customText", label: "Custom Footer Text" },
    ],
  },
};

export function isRequiredField(section: PayslipSectionKey, key: string): boolean {
  return Boolean(SECTION_CATALOG[section]?.fields.find((f) => f.key === key)?.required);
}

export function isSensitiveField(section: PayslipSectionKey, key: string): boolean {
  return Boolean(SECTION_CATALOG[section]?.fields.find((f) => f.key === key)?.sensitive);
}

export const SENSITIVE_FIELDS: Array<{ section: PayslipSectionKey; key: string }> = (
  Object.keys(SECTION_CATALOG) as PayslipSectionKey[]
).flatMap((section) =>
  SECTION_CATALOG[section].fields.filter((f) => f.sensitive).map((f) => ({ section, key: f.key }))
);

/**
 * Payroll values a custom field may reference. Mapping is read-only: a custom field
 * can DISPLAY one of these values but can never create or alter a financial record.
 */
export const MAPPABLE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "employee.employeeName", label: "Employee Name" },
  { key: "employee.employeeId", label: "Employee ID" },
  { key: "employee.designation", label: "Designation" },
  { key: "employee.department", label: "Department" },
  { key: "employee.employmentCategory", label: "Employment Category" },
  { key: "employee.dateOfJoining", label: "Date of Joining" },
  { key: "employee.payScale", label: "Pay Scale" },
  { key: "totals.basicSalary", label: "Basic Salary" },
  { key: "totals.grossSalary", label: "Gross Salary" },
  { key: "totals.totalEmployeeDeductions", label: "Total Deductions" },
  { key: "totals.netSalary", label: "Net Salary" },
  { key: "totals.employerContributions", label: "Employer Contributions" },
  { key: "totals.totalEmployerCost", label: "Total Employer Cost" },
  { key: "payment.paymentStatus", label: "Payment Status" },
  { key: "payment.paymentMethod", label: "Payment Method" },
  { key: "meta.period", label: "Payroll Period" },
  { key: "meta.payslipNumber", label: "Payslip Number" },
];

export const FONT_FAMILIES: Array<{ key: string; label: string; css: string }> = [
  { key: "arial", label: "Arial", css: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  { key: "times", label: "Times New Roman", css: '"Times New Roman", Times, serif' },
  { key: "georgia", label: "Georgia", css: "Georgia, serif" },
  { key: "verdana", label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { key: "courier", label: "Courier", css: '"Courier New", Courier, monospace' },
];

export const DATE_FORMATS: DateFormat[] = ["DD.MM.YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY"];

// ============================================================================
// BUILT-IN TEMPLATES
// ============================================================================

export type BuiltInTemplateKey = "government" | "corporate";

export const BUILT_IN_TEMPLATE_ID_PREFIX = "builtin:";

export function builtInTemplateId(key: BuiltInTemplateKey): string {
  return `${BUILT_IN_TEMPLATE_ID_PREFIX}${key}`;
}

export const DEFAULT_TEMPLATE_ID = builtInTemplateId("government");

export function isBuiltInTemplateId(id?: string | null): boolean {
  return Boolean(id && id.startsWith(BUILT_IN_TEMPLATE_ID_PREFIX));
}

function sectionsFromCatalog(
  order: PayslipSectionKey[],
  overrides: Partial<Record<PayslipSectionKey, { title?: string; visible?: boolean; labels?: Record<string, string>; hidden?: string[]; shown?: string[] }>> = {}
): PayslipSectionConfig[] {
  return order.map((key) => {
    const cat = SECTION_CATALOG[key];
    const o = overrides[key] || {};
    return {
      key,
      title: o.title ?? cat.title,
      visible: o.visible ?? true,
      fields: cat.fields.map((f) => ({
        key: f.key,
        label: o.labels?.[f.key] ?? f.label,
        visible: o.hidden?.includes(f.key) ? false : o.shown?.includes(f.key) ? true : f.defaultVisible !== false,
      })),
    };
  });
}

const GOVERNMENT_ORDER: PayslipSectionKey[] = [
  "header",
  "employee",
  "earnings",
  "deductions",
  "loans",
  "tax",
  "summary",
  "employer",
  "payment",
  "attendance",
  "custom",
  "footer",
];

const CORPORATE_ORDER: PayslipSectionKey[] = [
  "header",
  "employee",
  "summary",
  "earnings",
  "deductions",
  "loans",
  "tax",
  "employer",
  "attendance",
  "payment",
  "custom",
  "footer",
];

export function createBuiltInTemplate(key: BuiltInTemplateKey): PayslipTemplate {
  if (key === "corporate") {
    return {
      id: builtInTemplateId("corporate"),
      name: "Corporate Payslip",
      description: "Modern single-column payslip for private organizations, with the salary summary first.",
      builtInKey: "corporate",
      isBuiltIn: true,
      isActive: true,
      schemaVersion: PAYSLIP_TEMPLATE_SCHEMA_VERSION,
      page: {
        size: "A4",
        orientation: "portrait",
        marginMm: 14,
        fontFamily: "verdana",
        fontSizePt: 9,
        sectionSpacingPx: 14,
        tableBorders: "horizontal",
        accentColor: "#1E3A8A",
      },
      header: { align: "left", documentTitle: "Employee Payslip", showDivider: true },
      logo: { visible: true, heightPx: 56, position: "left", spacingPx: 12 },
      format: { currencyDisplay: "code", decimals: 2, negativeStyle: "minus", dateFormat: "D MMM YYYY" },
      components: {
        showCodes: false,
        showZeroRows: false,
        showSectionTotals: true,
        layout: "single",
        columnWidths: { code: 14, name: 56, amount: 30 },
        overrides: {},
      },
      sections: sectionsFromCatalog(CORPORATE_ORDER, {
        earnings: { title: "Earnings", labels: { colName: "Component" } },
        deductions: { title: "Deductions", labels: { colName: "Component", total: "Total Deductions" } },
        loans: { title: "Loans and Advances" },
        tax: { title: "Income Tax" },
        summary: {
          labels: { grossSalary: "Gross Salary", totalEmployeeDeductions: "Total Deductions", netSalary: "Net Salary Payable" },
          shown: ["totalAllowances", "basicSalary"],
        },
        employee: { labels: { employeeId: "Employee ID" }, hidden: ["ntn", "payrollSection", "payStage", "cnic"] },
      }),
      customFields: [],
      textBlocks: [],
      footer: {
        showSignatures: false,
        signatureLabels: ["Employee", "Authorized Signatory"],
        notes: "",
        digitalNotice: "This is a system-generated payslip and does not require a signature.",
        customText: "",
      },
    };
  }

  return {
    id: builtInTemplateId("government"),
    name: "Government Salary Statement",
    description: "Formal, compact monthly salary statement in the style of Pakistani government pay slips.",
    builtInKey: "government",
    isBuiltIn: true,
    isActive: true,
    schemaVersion: PAYSLIP_TEMPLATE_SCHEMA_VERSION,
    page: {
      size: "A4",
      orientation: "portrait",
      marginMm: 10,
      fontFamily: "arial",
      fontSizePt: 8.5,
      sectionSpacingPx: 6,
      tableBorders: "grid",
      accentColor: "#000000",
    },
    header: { align: "center", documentTitle: "Monthly Salary Statement", showDivider: false },
    logo: { visible: true, heightPx: 60, position: "right", spacingPx: 8 },
    format: { currencyDisplay: "none", decimals: 2, negativeStyle: "minus", dateFormat: "DD.MM.YYYY" },
    components: {
      showCodes: true,
      showZeroRows: false,
      showSectionTotals: false,
      layout: "dual",
      columnWidths: { code: 12, name: 56, amount: 32 },
      overrides: {},
    },
    sections: sectionsFromCatalog(GOVERNMENT_ORDER, {
      employee: { title: "Personal Information" },
      summary: { labels: { grossSalary: "Gross Pay (Rs.)", totalEmployeeDeductions: "Deductions (Rs.)", netSalary: "Net Pay (Rs.)" } },
      payment: { title: "Payee and Bank Details" },
    }),
    customFields: [],
    textBlocks: [],
    footer: {
      showSignatures: false,
      signatureLabels: ["Drawing & Disbursing Officer", "Accounts Officer"],
      notes: "",
      digitalNotice: "System generated document. * All amounts are in Pak Rupees. * Errors & omissions excepted.",
      customText: "",
    },
  };
}

export const BUILT_IN_TEMPLATE_KEYS: BuiltInTemplateKey[] = ["government", "corporate"];

// ============================================================================
// NORMALIZATION & VALIDATION
// ============================================================================

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function str(value: unknown, fallback = "", maxLen = 500): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, maxLen);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * Merges a stored (possibly partial, outdated or corrupted) template with the
 * defaults of its base template so rendering never fails. New catalog fields
 * are appended; unknown sections/fields are dropped.
 */
export function normalizeTemplate(raw: any): PayslipTemplate {
  const baseKey: BuiltInTemplateKey = raw?.builtInKey === "corporate" ? "corporate" : "government";
  const base = createBuiltInTemplate(baseKey);
  if (!raw || typeof raw !== "object") return base;

  const page = raw.page || {};
  const header = raw.header || {};
  const logo = raw.logo || {};
  const format = raw.format || {};
  const comps = raw.components || {};
  const footer = raw.footer || {};

  // Sections: keep stored order for known keys, append any missing ones before footer.
  const storedSections: any[] = Array.isArray(raw.sections) ? raw.sections : [];
  const seen = new Set<PayslipSectionKey>();
  const sections: PayslipSectionConfig[] = [];
  for (const s of storedSections) {
    const key = s?.key as PayslipSectionKey;
    if (!SECTION_CATALOG[key] || seen.has(key)) continue;
    seen.add(key);
    const baseSection = base.sections.find((b) => b.key === key)!;
    const storedFields: any[] = Array.isArray(s.fields) ? s.fields : [];
    const fields: PayslipFieldConfig[] = [];
    const seenFields = new Set<string>();
    for (const f of storedFields) {
      const catField = baseSection.fields.find((bf) => bf.key === f?.key);
      if (!catField || seenFields.has(catField.key)) continue;
      seenFields.add(catField.key);
      fields.push({
        key: catField.key,
        label: str(f.label, catField.label, 120).trim() || catField.label,
        visible: isRequiredField(key, catField.key) ? true : typeof f.visible === "boolean" ? f.visible : catField.visible,
        ...(str(f.prefix, "", 200) ? { prefix: str(f.prefix, "", 200) } : {}),
        ...(str(f.suffix, "", 200) ? { suffix: str(f.suffix, "", 200) } : {}),
      });
    }
    for (const bf of baseSection.fields) {
      if (!seenFields.has(bf.key)) fields.push({ ...bf });
    }
    sections.push({
      key,
      title: str(s.title, baseSection.title, 120).trim() || baseSection.title,
      visible: typeof s.visible === "boolean" ? s.visible : true,
      fields,
    });
  }
  for (const b of base.sections) {
    if (!seen.has(b.key)) sections.push({ ...b, fields: b.fields.map((f) => ({ ...f })) });
  }
  // Header pinned first, footer pinned last.
  const header0 = sections.find((s) => s.key === "header")!;
  const footer0 = sections.find((s) => s.key === "footer")!;
  const body = sections.filter((s) => s.key !== "header" && s.key !== "footer");
  const orderedSections = [header0, ...body, footer0];

  const overrides: Record<string, PayslipComponentOverride> = {};
  if (comps.overrides && typeof comps.overrides === "object") {
    for (const [k, v] of Object.entries(comps.overrides as Record<string, any>)) {
      if (!v || typeof v !== "object") continue;
      const o: PayslipComponentOverride = {};
      if (typeof v.label === "string" && v.label.trim()) o.label = v.label.slice(0, 120);
      if (typeof v.hidden === "boolean") o.hidden = v.hidden;
      if (Number.isFinite(Number(v.order)) && v.order !== null && v.order !== undefined) o.order = Number(v.order);
      if (typeof v.group === "string" && v.group.trim()) o.group = v.group.slice(0, 80);
      if (typeof v.note === "string" && v.note.trim()) o.note = v.note.slice(0, 200);
      overrides[k.slice(0, 120)] = o;
    }
  }

  const customFields: PayslipCustomField[] = (Array.isArray(raw.customFields) ? raw.customFields : [])
    .filter((f: any) => f && typeof f === "object")
    .slice(0, 50)
    .map((f: any, i: number) => {
      const source: CustomFieldSource = f.source === "mapped" ? "mapped" : "text";
      const mappedKey = MAPPABLE_FIELDS.some((m) => m.key === f.mappedKey) ? f.mappedKey : undefined;
      return {
        id: str(f.id, `cf_${i}`, 60) || `cf_${i}`,
        label: str(f.label, "Custom Field", 120),
        visible: f.visible !== false,
        source: source === "mapped" && !mappedKey ? "text" : source,
        value: str(f.value, "", 1000),
        mappedKey,
        placement: pick(f.placement, CUSTOM_FIELD_PLACEMENTS, "custom"),
      };
    });

  const textBlocks: PayslipTextBlock[] = (Array.isArray(raw.textBlocks) ? raw.textBlocks : [])
    .filter((b: any) => b && typeof b === "object" && SECTION_CATALOG[b.anchor as PayslipSectionKey])
    .slice(0, 40)
    .map((b: any, i: number) => ({
      id: str(b.id, `tb_${i}`, 60) || `tb_${i}`,
      text: str(b.text, "", 2000),
      visible: b.visible !== false,
      anchor: b.anchor as PayslipSectionKey,
      position: b.position === "before" ? "before" : "after",
      align: pick(b.align, ["left", "center", "right"] as const, "left"),
      bold: b.bold === true,
      italic: b.italic === true,
      scale: clamp(b.scale, 0.6, 2.5, 1),
      color: isHexColor(b.color) ? b.color : "#000000",
      boxed: b.boxed === true,
    }));

  const cw = comps.columnWidths || {};
  const widths = {
    code: clamp(cw.code, 5, 40, base.components.columnWidths.code),
    name: clamp(cw.name, 20, 80, base.components.columnWidths.name),
    amount: clamp(cw.amount, 10, 50, base.components.columnWidths.amount),
  };

  return {
    id: str(raw.id, base.id, 200) || base.id,
    name: str(raw.name, base.name, 120).trim() || base.name,
    description: str(raw.description, "", 500),
    organizationId: typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    builtInKey: raw.builtInKey === "government" || raw.builtInKey === "corporate" ? raw.builtInKey : undefined,
    isBuiltIn: raw.isBuiltIn === true,
    isActive: raw.isActive !== false,
    schemaVersion: PAYSLIP_TEMPLATE_SCHEMA_VERSION,
    page: {
      size: pick(page.size, ["A4", "Letter"] as const, base.page.size),
      orientation: pick(page.orientation, ["portrait", "landscape"] as const, base.page.orientation),
      marginMm: clamp(page.marginMm, 4, 30, base.page.marginMm),
      fontFamily: FONT_FAMILIES.some((f) => f.key === page.fontFamily) ? page.fontFamily : base.page.fontFamily,
      fontSizePt: clamp(page.fontSizePt, 6, 14, base.page.fontSizePt),
      sectionSpacingPx: clamp(page.sectionSpacingPx, 0, 40, base.page.sectionSpacingPx),
      tableBorders: pick(page.tableBorders, ["grid", "horizontal", "none"] as const, base.page.tableBorders),
      accentColor: isHexColor(page.accentColor) ? page.accentColor : base.page.accentColor,
    },
    header: {
      align: pick(header.align, ["left", "center", "right"] as const, base.header.align),
      documentTitle: str(header.documentTitle, base.header.documentTitle, 120),
      showDivider: typeof header.showDivider === "boolean" ? header.showDivider : base.header.showDivider,
    },
    logo: {
      visible: typeof logo.visible === "boolean" ? logo.visible : base.logo.visible,
      heightPx: clamp(logo.heightPx, 20, 160, base.logo.heightPx),
      position: pick(logo.position, ["left", "center", "right"] as const, base.logo.position),
      spacingPx: clamp(logo.spacingPx, 0, 48, base.logo.spacingPx),
    },
    format: {
      currencyDisplay: pick(format.currencyDisplay, ["code", "symbol", "none"] as const, base.format.currencyDisplay),
      decimals: Number(format.decimals) === 0 ? 0 : Number(format.decimals) === 2 ? 2 : base.format.decimals,
      negativeStyle: pick(format.negativeStyle, ["minus", "parentheses"] as const, base.format.negativeStyle),
      dateFormat: pick(format.dateFormat, DATE_FORMATS, base.format.dateFormat),
    },
    components: {
      showCodes: typeof comps.showCodes === "boolean" ? comps.showCodes : base.components.showCodes,
      showZeroRows: typeof comps.showZeroRows === "boolean" ? comps.showZeroRows : base.components.showZeroRows,
      showSectionTotals: typeof comps.showSectionTotals === "boolean" ? comps.showSectionTotals : base.components.showSectionTotals,
      layout: pick(comps.layout, ["single", "dual"] as const, base.components.layout),
      columnWidths: widths,
      overrides,
    },
    sections: orderedSections,
    customFields,
    textBlocks,
    footer: {
      showSignatures: typeof footer.showSignatures === "boolean" ? footer.showSignatures : base.footer.showSignatures,
      signatureLabels: Array.isArray(footer.signatureLabels)
        ? footer.signatureLabels.filter((s: unknown) => typeof s === "string").slice(0, 4).map((s: string) => s.slice(0, 80))
        : base.footer.signatureLabels,
      notes: str(footer.notes, base.footer.notes, 1000),
      digitalNotice: str(footer.digitalNotice, base.footer.digitalNotice, 500),
      customText: str(footer.customText, base.footer.customText, 1000),
    },
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    createdBy: typeof raw.createdBy === "string" ? raw.createdBy : undefined,
    createdByName: typeof raw.createdByName === "string" ? raw.createdByName : undefined,
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : undefined,
    updatedByName: typeof raw.updatedByName === "string" ? raw.updatedByName : undefined,
  };
}

/** Returns human-readable problems that should block saving. */
export function validateTemplate(t: PayslipTemplate): string[] {
  const errors: string[] = [];
  if (!t.name || !t.name.trim()) errors.push("Template name is required.");
  if (t.name && t.name.length > 120) errors.push("Template name must be 120 characters or fewer.");
  const visibleBody = t.sections.filter((s) => s.visible && s.key !== "header" && s.key !== "footer");
  if (visibleBody.length === 0) errors.push("At least one content section must be visible.");
  const summary = t.sections.find((s) => s.key === "summary");
  const netVisible = summary?.visible && summary.fields.find((f) => f.key === "netSalary")?.visible;
  if (!netVisible) errors.push("Net salary must remain visible in the Salary Summary section.");
  for (const cf of t.customFields) {
    if (!cf.label.trim()) errors.push("Every custom field needs a label.");
    if (cf.source === "mapped" && !cf.mappedKey) errors.push(`Custom field "${cf.label}" must be mapped to a payroll value.`);
  }
  return Array.from(new Set(errors));
}

/** Key used to attach display overrides to a payroll component. */
export function componentKey(line: { code?: string; name: string }): string {
  const code = (line.code || "").trim();
  if (code) return `code:${code.toUpperCase()}`;
  return `name:${line.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function getSection(t: PayslipTemplate, key: PayslipSectionKey): PayslipSectionConfig {
  return t.sections.find((s) => s.key === key) || createBuiltInTemplate("government").sections.find((s) => s.key === key)!;
}

export function getField(section: PayslipSectionConfig, key: string): PayslipFieldConfig | undefined {
  return section.fields.find((f) => f.key === key);
}

/** Deep clone that is safe for Firestore (no undefined values). */
export function cloneTemplate<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Moves a reorderable section one step up or down. Header/footer stay pinned. */
export function moveSection(t: PayslipTemplate, key: PayslipSectionKey, direction: -1 | 1): PayslipTemplate {
  if (key === "header" || key === "footer") return t;
  const body = t.sections.filter((s) => s.key !== "header" && s.key !== "footer");
  const idx = body.findIndex((s) => s.key === key);
  const target = idx + direction;
  if (idx < 0 || target < 0 || target >= body.length) return t;
  const next = [...body];
  [next[idx], next[target]] = [next[target], next[idx]];
  return {
    ...t,
    sections: [t.sections.find((s) => s.key === "header")!, ...next, t.sections.find((s) => s.key === "footer")!],
  };
}

/** Moves a field one step within its section. */
export function moveField(t: PayslipTemplate, sectionKey: PayslipSectionKey, fieldKey: string, direction: -1 | 1): PayslipTemplate {
  return {
    ...t,
    sections: t.sections.map((s) => {
      if (s.key !== sectionKey) return s;
      const idx = s.fields.findIndex((f) => f.key === fieldKey);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= s.fields.length) return s;
      const fields = [...s.fields];
      [fields[idx], fields[target]] = [fields[target], fields[idx]];
      return { ...s, fields };
    }),
  };
}

// ============================================================================
// LIBRARY MERGING & RESOLUTION (pure — shared by the service, UI and tests)
// ============================================================================

/**
 * Combines stored Firestore documents with the built-in templates.
 * - A doc with `isBuiltInOverride` customizes the matching built-in (same stable id).
 * - Built-ins always exist, so they can never be lost or deleted.
 * - Docs from another organization are ignored (defence in depth on top of rules).
 */
export function mergeTemplateDocs(docs: any[], organizationId: string): PayslipTemplate[] {
  const own = (Array.isArray(docs) ? docs : []).filter(
    (d) => d && typeof d === "object" && (!d.organizationId || d.organizationId === organizationId)
  );
  const builtIns = BUILT_IN_TEMPLATE_KEYS.map((key) => {
    const override = own.find((d) => d.isBuiltInOverride === true && d.builtInKey === key);
    if (!override) return createBuiltInTemplate(key);
    return {
      ...normalizeTemplate({ ...override, builtInKey: key }),
      id: builtInTemplateId(key),
      builtInKey: key,
      isBuiltIn: true,
      isCustomizedBuiltIn: true,
    };
  });
  const customs = own
    .filter((d) => d.isBuiltInOverride !== true && typeof d.id === "string" && !isBuiltInTemplateId(d.id))
    .map((d) => ({ ...normalizeTemplate(d), isBuiltIn: false, isCustomizedBuiltIn: false }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...builtIns, ...customs];
}

/**
 * Picks the template to use: the requested one (if active), else the organization
 * default (if active), else the built-in government template.
 */
export function resolveTemplate(
  templates: PayslipTemplate[],
  requestedId?: string | null,
  defaultId?: string | null
): PayslipTemplate {
  const active = templates.filter((t) => t.isActive);
  return (
    (requestedId && active.find((t) => t.id === requestedId)) ||
    (defaultId && active.find((t) => t.id === defaultId)) ||
    templates.find((t) => t.id === DEFAULT_TEMPLATE_ID) ||
    createBuiltInTemplate("government")
  );
}

/** A new, empty free-text block placed below the given section. */
export function createTextBlock(anchor: PayslipSectionKey = "custom", position: "before" | "after" = "after"): PayslipTextBlock {
  return {
    id: `tb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    text: "",
    visible: true,
    anchor,
    position,
    align: "left",
    bold: false,
    italic: false,
    scale: 1,
    color: "#000000",
    boxed: false,
  };
}
