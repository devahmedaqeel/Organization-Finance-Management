/**
 * functions/src/index.ts
 *
 * Cloud Functions for Organization Finance Management (OFM).
 * Exposes secure server-side PDF generation endpoints via HTMLPDF.dev & PDFMonkey.
 *
 * ZERO CLIENT SECRETS: The HTMLPDF_API_KEY remains strictly server-side.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { generatePdfFromHtml } from "./services/htmlPdfService";
import { createPdfMonkeyDocument, waitForPdfMonkeyGeneration } from "./pdfMonkeyService";
import {
  handleForgotPasswordRequest,
  handleVerifyResetToken,
  handleResetPasswordSubmission,
} from "./passwordResetService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Callable Function: generatePdfFromHtml (Primary HTMLPDF.dev Endpoint)
 *
 * Request: { html: string, filename?: string, organizationId?: string, documentType?: string, format?: string }
 * Response: { success: boolean, base64Pdf: string, filename: string, size: number }
 */
export const generatePdfFromHtmlCallable = functions.https.onCall(async (data, context) => {
  // 1. Authentication Check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "AUTH_REQUIRED: You must be authenticated to generate official PDF documents."
    );
  }

  const callerUid = context.auth.uid;
  const { html, filename, organizationId, documentType = "document", format = "A4", landscape = false, margin } = data;

  if (!html || typeof html !== "string" || html.trim().length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "INVALID_ARGUMENTS: 'html' content is required."
    );
  }

  // 2. Organization Permission Verification
  const userDoc = await db.collection("users").doc(callerUid).get();
  const userData = userDoc.data();

  if (userData && userData.organizationId && organizationId) {
    if (userData.organizationId !== organizationId && userData.role !== "admin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "SECURITY_VIOLATION: Cross-tenant data generation is strictly prohibited."
      );
    }
  }

  // 3. Server-Side Secret Key (Pure Server Secret)
  const apiKey =
    process.env.HTMLPDF_API_KEY ||
    functions.config().htmlpdf?.api_key;

  if (!apiKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "CONFIG_ERROR: HTMLPDF_API_KEY is not configured on the server."
    );
  }

  try {
    const cleanFilename = filename || `OFM_${documentType}_${Date.now()}.pdf`;

    const result = await generatePdfFromHtml(
      {
        html,
        filename: cleanFilename,
        format,
        landscape,
        margin,
      },
      apiKey
    );

    if (!result.success || !result.base64) {
      if (result.statusCode === 429) {
        throw new functions.https.HttpsError("resource-exhausted", result.error || "Quota exceeded.");
      }
      throw new functions.https.HttpsError("internal", result.error || "HTMLPDF.dev generation failed.");
    }

    // 4. Record Audit Log
    await db.collection("auditLogs").add({
      organizationId: organizationId || userData?.organizationId || "default_org",
      actorUid: callerUid,
      actorName: userData?.name || userData?.email || "Finance Officer",
      actorRole: userData?.role || "user",
      action: "export_pdf_htmlpdf",
      entity: documentType,
      metadata: {
        filename: cleanFilename,
        size: result.size,
        generatedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return {
      success: true,
      base64: result.base64,
      base64Pdf: result.base64,
      filename: result.filename,
      size: result.size,
      mimeType: "application/pdf",
      message: "PDF generated successfully via HTMLPDF.dev",
    };
  } catch (err: any) {
    console.error("[HTMLPDF_CALLABLE_ERROR]", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Failed to generate PDF via HTMLPDF.dev");
  }
});

/**
 * Callable Function: generatePdf (PDFMonkey Fallback Endpoint)
 */
export const generatePdf = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "AUTH_REQUIRED: You must be logged in to generate official PDF documents."
    );
  }

  const { documentType, payload, filename } = data;

  if (!documentType || !payload) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "INVALID_ARGUMENTS: 'documentType' and 'payload' are required."
    );
  }

  const secretKey =
    process.env.PDFMONKEY_SECRET_KEY ||
    functions.config().pdfmonkey?.secret_key;

  if (!secretKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "CONFIG_ERROR: PDFMONKEY_SECRET_KEY is not configured on the server."
    );
  }

  const createdDoc = await createPdfMonkeyDocument(
    {
      documentType,
      payload,
      filename: filename || `OFM_${documentType}_${Date.now()}.pdf`,
    },
    secretKey
  );

  const result = await waitForPdfMonkeyGeneration(createdDoc.document.id, secretKey, 15, 1200);

  if (!result.success || !result.downloadUrl) {
    throw new functions.https.HttpsError("internal", result.error || "PDFMonkey generation failed.");
  }

  return {
    success: true,
    downloadUrl: result.downloadUrl,
    fileName: result.filename,
    documentId: createdDoc.document.id,
  };
});

/**
 * Callable Function: forgotPassword (Password Reset Request)
 * Input: { email: string, appUrl?: string }
 * Output: { success: boolean, message: string }
 */
export const forgotPasswordCallable = functions.https.onCall(async (data) => {
  const { email, appUrl } = data || {};
  return await handleForgotPasswordRequest(email, appUrl);
});

/**
 * Callable Function: verifyResetToken
 * Input: { token: string }
 * Output: { valid: boolean, error?: string, email?: string }
 */
export const verifyResetTokenCallable = functions.https.onCall(async (data) => {
  const { token } = data || {};
  return await handleVerifyResetToken(token);
});

/**
 * Callable Function: resetPassword
 * Input: { token: string, password: string, confirmPassword: string }
 * Output: { success: boolean, message?: string, error?: string }
 */
export const resetPasswordCallable = functions.https.onCall(async (data) => {
  const { token, password, confirmPassword } = data || {};
  return await handleResetPasswordSubmission(token, password, confirmPassword);
});

/**
 * HTTP REST API: /api/auth/forgot-password & /api/auth/reset-password
 */
export const authApi = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const path = req.path || "";

  try {
    if (req.method === "POST" && (path.endsWith("/forgot-password") || path === "/forgot-password")) {
      const { email, appUrl } = req.body || {};
      const result = await handleForgotPasswordRequest(email, appUrl);
      res.status(200).json(result);
      return;
    }

    if (req.method === "POST" && (path.endsWith("/verify-token") || path === "/verify-token")) {
      const { token } = req.body || {};
      const result = await handleVerifyResetToken(token);
      res.status(200).json(result);
      return;
    }

    if (req.method === "POST" && (path.endsWith("/reset-password") || path === "/reset-password")) {
      const { token, password, confirmPassword } = req.body || {};
      const result = await handleResetPasswordSubmission(token, password, confirmPassword);
      res.status(result.success ? 200 : 400).json(result);
      return;
    }

    res.status(404).json({ error: "Endpoint not found" });
  } catch (error: any) {
    console.error("[AUTH_API_ERROR]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

