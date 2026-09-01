/**
 * functions/src/pdfMonkeyService.ts
 *
 * Server-Side PDFMonkey Integration Service.
 * SECURE: The PDFMonkey API Secret Key is ONLY accessed server-side via process.env.PDFMONKEY_SECRET_KEY.
 *
 * REST API Base: https://api.pdfmonkey.io/api/v1/
 */

export interface PdfMonkeyDocumentResponse {
  document: {
    id: string;
    status: "pending" | "generating" | "success" | "failure";
    download_url?: string;
    preview_url?: string;
    filename?: string;
    failure_cause?: string;
    created_at: string;
    updated_at: string;
  };
}

export interface GeneratePdfOptions {
  documentType: "payslip" | "financial_report" | "expense_report" | "budget_report";
  payload: Record<string, any>;
  filename?: string;
}

const PDFMONKEY_API_BASE = "https://api.pdfmonkey.io/api/v1";

// Template IDs configured in PDFMonkey dashboard or environment
const DEFAULT_TEMPLATE_MAP: Record<string, string> = {
  payslip: process.env.PDFMONKEY_PAYSLIP_TEMPLATE_ID || "ofm_payslip_v1",
  financial_report: process.env.PDFMONKEY_REPORT_TEMPLATE_ID || "ofm_report_v1",
  expense_report: process.env.PDFMONKEY_EXPENSE_TEMPLATE_ID || "ofm_expense_v1",
  budget_report: process.env.PDFMONKEY_BUDGET_TEMPLATE_ID || "ofm_budget_v1",
};

/**
 * Creates a new document generation job in PDFMonkey.
 */
export async function createPdfMonkeyDocument(
  options: GeneratePdfOptions,
  secretKey: string
): Promise<PdfMonkeyDocumentResponse> {
  const templateId = DEFAULT_TEMPLATE_MAP[options.documentType] || DEFAULT_TEMPLATE_MAP.financial_report;

  const body = {
    document: {
      document_template_id: templateId,
      status: "pending",
      filename: options.filename,
      payload: options.payload,
      meta: {
        documentType: options.documentType,
        generatedAt: new Date().toISOString(),
      },
    },
  };

  const response = await fetch(`${PDFMONKEY_API_BASE}/documents`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`PDFMONKEY_API_ERROR (${response.status}): ${errText}`);
  }

  return (await response.json()) as PdfMonkeyDocumentResponse;
}

/**
 * Retrieves the current status and download URL of a document from PDFMonkey.
 */
export async function getPdfMonkeyDocument(
  documentId: string,
  secretKey: string
): Promise<PdfMonkeyDocumentResponse> {
  const response = await fetch(`${PDFMONKEY_API_BASE}/documents/${documentId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`PDFMONKEY_GET_ERROR (${response.status}): ${errText}`);
  }

  return (await response.json()) as PdfMonkeyDocumentResponse;
}

/**
 * Polls PDFMonkey until document status is 'success' or 'failure'.
 * Max wait time: 30 seconds.
 */
export async function waitForPdfMonkeyGeneration(
  documentId: string,
  secretKey: string,
  maxAttempts: number = 15,
  intervalMs: number = 1500
): Promise<{ success: boolean; downloadUrl?: string; filename?: string; error?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await getPdfMonkeyDocument(documentId, secretKey);
    const doc = res.document;

    if (doc.status === "success" && doc.download_url) {
      return {
        success: true,
        downloadUrl: doc.download_url,
        filename: doc.filename || `OFM_Document_${documentId.slice(-6)}.pdf`,
      };
    }

    if (doc.status === "failure") {
      return {
        success: false,
        error: doc.failure_cause || "PDF generation failed inside PDFMonkey rendering engine.",
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    success: false,
    error: "PDF generation timed out after 30 seconds.",
  };
}
