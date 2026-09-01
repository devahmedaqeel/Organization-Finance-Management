/**
 * functions/src/services/htmlPdfService.ts
 *
 * Server-Side HTMLPDF.dev Integration Service.
 * Uses native responseType: "base64" from HTMLPDF.dev to return pure Base64 PDF directly.
 *
 * REST API: POST https://api.htmlpdf.dev/api/pdf
 */

export interface HtmlPdfOptions {
  html: string;
  filename?: string;
  format?: "A4" | "Letter" | "Legal";
  landscape?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
}

export interface HtmlPdfResult {
  success: boolean;
  base64?: string;
  filename: string;
  size?: number;
  mimeType: string;
  error?: string;
  statusCode?: number;
}

const HTMLPDF_API_URL = "https://api.htmlpdf.dev/api/pdf";

/**
 * Generates a real, valid PDF document using HTMLPDF.dev with native Base64 response mode.
 */
export async function generatePdfFromHtml(
  options: HtmlPdfOptions,
  apiKey: string
): Promise<HtmlPdfResult> {
  const filename = options.filename || `Document_${Date.now()}.pdf`;

  if (!options.html || options.html.trim().length === 0) {
    throw new Error("HTML_EMPTY: Provided HTML content is empty.");
  }

  const payload = {
    html: options.html,
    format: options.format || "A4",
    landscape: options.landscape || false,
    printBackground: true,
    emulateMediaType: "print",
    filename,
    responseType: "base64",
    margin: options.margin || {
      top: "0.4in",
      right: "0.4in",
      bottom: "0.4in",
      left: "0.4in",
    },
  };

  const response = await fetch(HTMLPDF_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  // Handle Rate Limiting (429)
  if (response.status === 429) {
    return {
      success: false,
      filename,
      mimeType: "application/json",
      statusCode: 429,
      error: "PDF generation limit reached. Please try again later.",
    };
  }

  // Handle Authentication Failure (401)
  if (response.status === 401) {
    return {
      success: false,
      filename,
      mimeType: "application/json",
      statusCode: 401,
      error: "HTMLPDF.dev authentication failed. Please verify server secret configuration.",
    };
  }

  if (!response.ok) {
    const errText = await response.text();
    let parsedMsg = errText;
    try {
      const errJson = JSON.parse(errText);
      parsedMsg = errJson.error || errJson.message || errText;
    } catch {}
    return {
      success: false,
      filename,
      mimeType: "application/json",
      statusCode: response.status,
      error: `HTMLPDF.dev error (${response.status}): ${parsedMsg}`,
    };
  }

  const contentType = response.headers.get("content-type") || "";

  // 1. If HTMLPDF.dev returns JSON with Base64
  if (contentType.includes("application/json")) {
    const json = await response.json();
    const base64Str = json.base64 || json.data || json.pdf;

    if (!base64Str || typeof base64Str !== "string") {
      return {
        success: false,
        filename,
        mimeType: "application/json",
        error: "HTMLPDF.dev response did not contain a valid Base64 string.",
      };
    }

    return {
      success: true,
      base64: base64Str,
      filename,
      size: json.size || Math.round((base64Str.length * 3) / 4),
      mimeType: "application/pdf",
    };
  }

  // 2. If HTMLPDF.dev returns binary or raw Base64 string directly
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    return {
      success: false,
      filename,
      mimeType: "application/pdf",
      error: "HTMLPDF.dev returned empty 0-byte response.",
    };
  }

  // If the returned buffer is raw binary PDF, encode it to Base64 cleanly via Buffer
  const base64String = buffer.toString("base64");

  return {
    success: true,
    base64: base64String,
    filename,
    size: buffer.length,
    mimeType: "application/pdf",
  };
}
