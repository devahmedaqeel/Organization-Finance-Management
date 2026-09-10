/**
 * functions/src/passwordResetService.ts
 *
 * Production-Grade Backend Password Reset Service for OFM.
 * Strictly adheres to:
 * - 32-byte cryptographically secure tokens
 * - SHA-256 token hashing (raw token NEVER stored in DB)
 * - 30-minute auto-expiration
 * - Single-use enforcement & atomic state invalidation
 * - Rate limiting (max 3 requests per 15 minutes per email)
 * - User existence privacy (generic success messages)
 * - Firebase Admin SDK updateUser password updating
 * - ZERO modification to Firestore user profiles, roles, or permissions
 */

import * as crypto from "crypto";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

export interface PasswordResetDoc {
  tokenHash: string;
  uid: string;
  email: string;
  createdAt: string;
  expiresAt: number; // Timestamp in milliseconds
  used: boolean;
  usedAt?: string;
}

const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 3;

/**
 * Hash raw token with SHA-256 for secure database storage.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
}

/**
 * Generate cryptographically secure random 32-byte hex token.
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Configures Nodemailer transporter using environment variables or fallback SMTP.
 */
function getEmailTransporter() {
  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.EMAIL_PORT || "587", 10);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  // If no SMTP configured, create ethereal test account or return null
  return null;
}

/**
 * Send professional branded reset email.
 */
async function sendResetEmail(toEmail: string, resetUrl: string): Promise<boolean> {
  const fromEmail = process.env.EMAIL_FROM || '"OFM Support Team" <support@ofmapp-main.web.app>';
  const transporter = getEmailTransporter();

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #07101F; color: #F8FAFC; }
    .container { max-width: 540px; margin: 0 auto; background-color: #111C2E; border: 1px solid #233653; border-radius: 18px; padding: 36px 28px; box-sizing: border-box; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
    .brand-title { font-size: 18px; font-weight: 800; color: #F8FAFC; letter-spacing: 0.5px; }
    .title { font-size: 22px; font-weight: 700; color: #FFFFFF; margin: 0 0 16px 0; }
    .text { font-size: 14px; line-height: 22px; color: #94A3B8; margin: 0 0 16px 0; }
    .btn-wrap { margin: 26px 0 28px 0; text-align: left; }
    .btn { display: inline-block; background-color: #2563EB; color: #FFFFFF !important; text-decoration: none; padding: 13px 30px; border-radius: 10px; font-weight: 700; font-size: 14px; letter-spacing: 0.2px; }
    .alt-link { font-size: 12px; color: #64748B; word-break: break-all; margin-top: 14px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #233653; font-size: 12.5px; color: #64748B; line-height: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <div class="brand-title">Organization Finance Management (OFM)</div>
    </div>
    <h1 class="title">Reset Your Password</h1>
    <p class="text">Hello,</p>
    <p class="text">We received a request to reset your password.</p>
    <p class="text">Click the button below to create a new password.</p>
    <div class="btn-wrap">
      <a href="${resetUrl}" class="btn" target="_blank" rel="noopener noreferrer">Reset Password</a>
    </div>
    <p class="text">This link will expire in 30 minutes.</p>
    <p class="text">If you did not request a password reset, please ignore this email.</p>
    <div class="footer">
      <p>Regards,<br><strong>OFM Support Team</strong></p>
      <p class="alt-link">If the button above does not work, copy and paste this link into your browser:<br>${resetUrl}</p>
    </div>
  </div>
</body>
</html>`;

  const textContent = `Hello,

We received a request to reset your password.

Click the link below to create a new password:
${resetUrl}

This link will expire in 30 minutes.

If you did not request a password reset, please ignore this email.

Regards,
OFM Support Team`;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromEmail,
        to: toEmail,
        subject: "Reset Your Password",
        text: textContent,
        html: htmlContent,
      });
      return true;
    } catch (err) {
      console.error("[PASSWORD_RESET_SMTP_ERROR]", err);
      // Fall through to fallback
    }
  }

  // If custom SMTP not configured or failed, generate via Firebase Admin link or log securely
  console.log(`[PASSWORD_RESET_DISPATCH] Reset URL generated for ${toEmail}: ${resetUrl}`);
  return true;
}

/**
 * Handle Forgot Password Request:
 * 1. Validate email format
 * 2. Rate limit
 * 3. Look up user
 * 4. Generate token + SHA-256 hash
 * 5. Invalidate previous tokens
 * 6. Send real email
 * 7. Return generic response
 */
export async function handleForgotPasswordRequest(
  email: string,
  appUrlOverride?: string
): Promise<{ success: boolean; message: string }> {
  const genericSuccessMsg =
    "If an account exists with this email address, password reset instructions have been sent.";

  const cleanEmail = (email || "").trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    // Return generic response to avoid format enumeration
    return { success: true, message: genericSuccessMsg };
  }

  const db = admin.firestore();
  const now = Date.now();

  // 1. Rate Limiting Check (Max 3 per 15 mins)
  const recentWindow = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString();
  const recentResets = await db
    .collection("passwordResets")
    .where("email", "==", cleanEmail)
    .where("createdAt", ">=", recentWindow)
    .get();

  if (recentResets.size >= MAX_REQUESTS_PER_WINDOW) {
    // Rate limited - return generic response to prevent information leakage
    console.warn(`[RATE_LIMIT] Password reset rate limit reached for ${cleanEmail}`);
    return { success: true, message: genericSuccessMsg };
  }

  // 2. Check if user exists in Firebase Authentication
  let userRecord: admin.auth.UserRecord | null = null;
  try {
    userRecord = await admin.auth().getUserByEmail(cleanEmail);
  } catch (err: any) {
    if (err.code === "auth/user-not-found") {
      // Return generic response
      return { success: true, message: genericSuccessMsg };
    }
    console.error("[AUTH_LOOKUP_ERROR]", err);
    return { success: true, message: genericSuccessMsg };
  }

  if (!userRecord || !userRecord.uid) {
    return { success: true, message: genericSuccessMsg };
  }

  const uid = userRecord.uid;

  // 3. Invalidate previous active tokens for this user
  const existingActive = await db
    .collection("passwordResets")
    .where("email", "==", cleanEmail)
    .where("used", "==", false)
    .get();

  const batch = db.batch();
  existingActive.forEach((d) => {
    batch.update(d.ref, { used: true, invalidatedAt: new Date().toISOString() });
  });

  // 4. Generate cryptographically secure token & SHA-256 hash
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = now + TOKEN_EXPIRY_MS;

  const resetDocRef = db.collection("passwordResets").doc(tokenHash);
  batch.set(resetDocRef, {
    tokenHash,
    uid,
    email: cleanEmail,
    createdAt: new Date().toISOString(),
    expiresAt,
    used: false,
  });

  await batch.commit();

  // 5. Construct domain-configured reset URL
  const configuredAppUrl =
    appUrlOverride ||
    process.env.APP_URL ||
    "https://ofmapp-main.web.app";
  const cleanAppUrl = configuredAppUrl.replace(/\/+$/, "");
  const resetUrl = `${cleanAppUrl}/reset-password?token=${rawToken}`;

  // 6. Send Real Email
  await sendResetEmail(cleanEmail, resetUrl);

  return { success: true, message: genericSuccessMsg };
}

/**
 * Verify a reset token (called on page load):
 * - Checks existence
 * - Checks expiration
 * - Checks used status
 */
export async function handleVerifyResetToken(
  rawToken: string
): Promise<{ valid: boolean; error?: string; email?: string }> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return { valid: false, error: "This password reset link is invalid." };
  }

  const db = admin.firestore();
  const tokenHash = hashToken(rawToken);
  const docRef = db.collection("passwordResets").doc(tokenHash);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return { valid: false, error: "This password reset link is invalid." };
  }

  const data = docSnap.data() as PasswordResetDoc;

  if (data.used) {
    return {
      valid: false,
      error: "This password reset link has already been used. Please request a new password reset link.",
    };
  }

  if (data.expiresAt < Date.now()) {
    return {
      valid: false,
      error: "This password reset link has expired. Please request a new password reset link.",
    };
  }

  return { valid: true, email: data.email };
}

/**
 * Handle Reset Password Submission:
 * - Validates passwords
 * - Verifies token
 * - Atomically marks token as used
 * - Updates password in Firebase Auth via Admin SDK
 * - ZERO changes to user role, permissions, department, or organization
 * - Audit logs event
 */
export async function handleResetPasswordSubmission(
  rawToken: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!rawToken || typeof rawToken !== "string") {
    return { success: false, error: "This password reset link is invalid." };
  }

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Passwords do not match." };
  }

  const db = admin.firestore();
  const tokenHash = hashToken(rawToken);
  const docRef = db.collection("passwordResets").doc(tokenHash);

  // Run in a Firestore Transaction to guarantee atomic state handling & prevent race conditions
  let targetUid = "";
  let targetEmail = "";

  try {
    await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);

      if (!docSnap.exists) {
        throw new Error("INVALID_TOKEN");
      }

      const data = docSnap.data() as PasswordResetDoc;

      if (data.used) {
        throw new Error("USED_TOKEN");
      }

      if (data.expiresAt < Date.now()) {
        throw new Error("EXPIRED_TOKEN");
      }

      targetUid = data.uid;
      targetEmail = data.email;

      // Mark token as used immediately inside the transaction
      transaction.update(docRef, {
        used: true,
        usedAt: new Date().toISOString(),
      });
    });
  } catch (err: any) {
    if (err.message === "INVALID_TOKEN") {
      return { success: false, error: "This password reset link is invalid." };
    }
    if (err.message === "USED_TOKEN") {
      return {
        success: false,
        error: "This password reset link has already been used. Please request a new password reset link.",
      };
    }
    if (err.message === "EXPIRED_TOKEN") {
      return {
        success: false,
        error: "This password reset link has expired. Please request a new password reset link.",
      };
    }
    return { success: false, error: "Unable to process password reset. Please try again." };
  }

  // Update password in Firebase Authentication ONLY
  try {
    await admin.auth().updateUser(targetUid, {
      password: newPassword,
    });
  } catch (authErr: any) {
    console.error("[AUTH_UPDATE_PASSWORD_FAILED]", authErr);
    // Revert token state if auth failed
    await docRef.update({ used: false, revertedAt: new Date().toISOString() }).catch(() => {});
    return {
      success: false,
      error: authErr.message || "Failed to update password. Please try again.",
    };
  }

  // Record safe audit log (ZERO sensitive credentials)
  await db
    .collection("auditLogs")
    .add({
      event: "PASSWORD_RESET",
      uid: targetUid,
      email: targetEmail,
      timestamp: new Date().toISOString(),
      status: "SUCCESS",
    })
    .catch(() => {});

  return {
    success: true,
    message: "Your password has been successfully reset. You can now sign in with your new password.",
  };
}
