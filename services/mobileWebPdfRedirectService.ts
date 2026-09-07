import { Linking, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";

export const OFM_WEB_BASE_URL = "https://ofmapp-main.web.app";

export interface ReportPdfRedirectOptions {
  reportType?: string;
  scope?: string;
  startDate?: string;
  endDate?: string;
  dept?: string;
  format?: string;
  orientation?: string;
  currency?: string;
}

export interface PayslipPdfRedirectOptions {
  payrollId?: string;
  empId?: string;
  employeeName?: string;
  month?: string;
  department?: string;
}

/**
 * Directs mobile user to the Web Application to automatically generate and download
 * the financial report PDF via the web browser.
 */
export async function redirectMobileToWebReportPdf(options: ReportPdfRedirectOptions = {}): Promise<void> {
  const query = new URLSearchParams({
    tab: "reports",
    export: "dossier",
    auto: "pdf",
    reportType: options.reportType || "consolidated_statement",
    scope: options.scope || "period",
    startDate: options.startDate || "",
    endDate: options.endDate || "",
    dept: options.dept || "all",
    format: options.format || "pdf",
    orientation: options.orientation || "portrait",
    v: String(Date.now()),
  });

  if (options.currency) {
    query.set("currency", options.currency);
  }

  const targetUrl = `${OFM_WEB_BASE_URL}/?${query.toString()}`;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.location.href = targetUrl;
    }
    return;
  }

  try {
    await WebBrowser.openBrowserAsync(targetUrl);
  } catch {
    await Linking.openURL(targetUrl);
  }
}

/**
 * Directs mobile user to the Web Application to automatically generate and download
 * the employee payslip PDF via the web browser.
 */
export async function redirectMobileToWebPayslipPdf(options: PayslipPdfRedirectOptions = {}): Promise<void> {
  const query = new URLSearchParams({
    tab: "payroll",
    export: "payslip",
    auto: "pdf",
    v: String(Date.now()),
  });

  if (options.payrollId) query.set("payrollId", options.payrollId);
  if (options.empId) query.set("empId", options.empId);
  if (options.employeeName) query.set("employeeName", options.employeeName);
  if (options.month) query.set("month", options.month);
  if (options.department) query.set("department", options.department);

  const targetUrl = `${OFM_WEB_BASE_URL}/?${query.toString()}`;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.location.href = targetUrl;
    }
    return;
  }

  try {
    await WebBrowser.openBrowserAsync(targetUrl);
  } catch {
    await Linking.openURL(targetUrl);
  }
}
