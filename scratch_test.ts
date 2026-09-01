import { buildPayslipPdfBinary, validatePayslipData, formatCurrency } from "./services/payslipPdfService";
import { generatePayslipPDF, downloadPayslipPDF, sharePayslipPDF } from "./services/payslipExportService";
import { createPayslipExportData, buildPayslipHTML } from "./services/payslipTemplate";

console.log("=== STARTING PAYSLIP & PDF TESTS ===");

const sampleEmployee: any = {
  id: "rec_emp_123",
  employeeName: "Ahmed Aqeel",
  employeeId: "EMP3922",
  department: "Administration",
  designation: "Administrative Lead",
  baseSalary: 3000,
  bonus: 0,
  deductions: 0,
  month: "2026-08",
  status: "paid"
};

const orgInfo = {
  organizationName: "DevOrbit Tech Kotli",
  organizationAddress: "Kotli, Azad Kashmir",
  organizationEmail: "finance@devorbit.tech",
  organizationPhone: "+92-586-444111",
  currency: "PKR",
  fiscalYear: "2025-2026"
};

// Test 1: Validation
const validation = validatePayslipData(sampleEmployee);
console.log("Test 1: Validation =>", validation);
if (!validation.valid) throw new Error("Validation failed: " + validation.error);

// Test 2: Binary PDF Generation
const pdfBinary = buildPayslipPdfBinary(sampleEmployee, {
  name: orgInfo.organizationName,
  address: orgInfo.organizationAddress,
  email: orgInfo.organizationEmail,
  phone: orgInfo.organizationPhone,
  currency: orgInfo.currency
});
console.log("Test 2: PDF Binary Header =>", pdfBinary.slice(0, 15));
console.log("Test 2: PDF Binary Length =>", pdfBinary.length, "bytes");
console.log("Test 2: PDF Binary EOF =>", pdfBinary.slice(-20));

if (!pdfBinary.startsWith("%PDF-1.4")) {
  throw new Error("PDF Header is invalid! Does not start with %PDF-1.4");
}
if (!pdfBinary.includes("%%EOF")) {
  throw new Error("PDF EOF is invalid! Does not contain %%EOF");
}
if (!pdfBinary.includes("DevOrbit Tech Kotli")) {
  throw new Error("PDF does not contain organization name!");
}
if (!pdfBinary.includes("Ahmed Aqeel")) {
  throw new Error("PDF does not contain employee name!");
}
if (!pdfBinary.includes("EMP3922")) {
  throw new Error("PDF does not contain employee ID!");
}
if (!pdfBinary.includes("PKR 3,000.00")) {
  throw new Error("PDF does not contain formatted currency!");
}

// Test 3: HTML Printable Template Generation
const exportData = createPayslipExportData(sampleEmployee, orgInfo);
const html = buildPayslipHTML(exportData);
console.log("Test 3: HTML Template Length =>", html.length, "characters");
if (!html.includes("DevOrbit Tech Kotli") || !html.includes("Ahmed Aqeel")) {
  throw new Error("HTML Template missing required information!");
}

// Test 4: Missing property resilience (e.g. basicSalary vs baseSalary)
const altEmployee: any = {
  employeeName: "Zahid Khan",
  employeeId: "EMP9901",
  department: "Software Engineering",
  basicSalary: 85000,
  bonus: 5000,
  deductions: 2000,
  month: "2026-08"
};

const altValidation = validatePayslipData(altEmployee);
console.log("Test 4: Alt Validation =>", altValidation);
if (!altValidation.valid) throw new Error("Alt validation failed: " + altValidation.error);

const altPdfBinary = buildPayslipPdfBinary(altEmployee, { name: "DevOrbit Tech Kotli" });
console.log("Test 4: Alt PDF Binary Length =>", altPdfBinary.length, "bytes");
if (!altPdfBinary.includes("Zahid Khan") || !altPdfBinary.includes("PKR 88,000.00")) {
  throw new Error("Alt PDF binary calculations mismatch!");
}

console.log("=== ALL PAYSLIP TESTS PASSED SUCCESSFULLY! ===");
