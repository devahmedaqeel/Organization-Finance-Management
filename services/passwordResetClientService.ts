/**
 * services/passwordResetClientService.ts
 *
 * Client-Side Password Reset Service for OFM.
 * Communicates with backend Cloud Functions and Firebase Authentication.
 * Handles:
 * 1. requestPasswordReset(email)
 * 2. verifyResetToken(token)
 * 3. submitPasswordReset(token, password, confirmPassword)
 */

import { auth, functions, httpsCallable } from "@/config/firebase";
import { sendPasswordResetEmail, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { Platform } from "react-native";

export const GENERIC_RESET_SUCCESS_MSG =
  "If an account exists with this email address, password reset instructions have been sent. Please check your Inbox and Spam / Junk folder. If you registered with Google, you can sign in directly using 'Sign in with Google'.";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_APP_URL ||
  (Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : "https://ofmapp-main.web.app");

/**
 * Request password reset email.
 * Dispatches real email immediately via Firebase Authentication.
 * Never exposes whether the email exists to protect user privacy.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const cleanEmail = (email || "").trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    return { success: false, error: "Please enter a valid email address." };
  }

  // 1. Immediate Dispatch: Firebase Auth Password Reset Email with ActionCodeSettings
  try {
    const actionCodeSettings = {
      url: `${API_BASE_URL}/reset-password`,
      handleCodeInApp: true,
    };
    await sendPasswordResetEmail(auth, cleanEmail, actionCodeSettings);
    console.log("[FIREBASE_RESET_SUCCESS] Sent reset email with action code to:", cleanEmail);
  } catch (fbErr: any) {
    console.log("[FIREBASE_RESET_ACTION_CODE_CODE]", fbErr?.code, fbErr?.message);
    if (fbErr?.code === "auth/invalid-email") {
      return { success: false, error: "Please enter a valid email address." };
    }
    if (fbErr?.code === "auth/network-request-failed") {
      return { success: false, error: "Network error. Please check your internet connection and try again." };
    }
    if (fbErr?.code === "auth/too-many-requests") {
      return { success: false, error: "Too many reset attempts. Please wait a few minutes and try again." };
    }

    // Fallback to standard sendPasswordResetEmail
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      console.log("[FIREBASE_RESET_SUCCESS] Sent standard reset email to:", cleanEmail);
    } catch (fallbackErr: any) {
      console.log("[FIREBASE_RESET_STANDARD_FALLBACK]", fallbackErr?.code, fallbackErr?.message);
      if (fallbackErr?.code === "auth/invalid-email") {
        return { success: false, error: "Please enter a valid email address." };
      }
      if (fallbackErr?.code === "auth/network-request-failed") {
        return { success: false, error: "Network error. Please check your internet connection and try again." };
      }
      if (fallbackErr?.code === "auth/too-many-requests") {
        return { success: false, error: "Too many reset attempts. Please wait a few minutes and try again." };
      }
    }
  }

  // 2. Also call backend Cloud Function in parallel if deployed
  try {
    const forgotFn = httpsCallable<{ email: string; appUrl?: string }, { success: boolean; message: string }>(
      functions,
      "forgotPasswordCallable"
    );
    forgotFn({ email: cleanEmail, appUrl: API_BASE_URL }).catch(() => {});
  } catch {}

  return { success: true, message: GENERIC_RESET_SUCCESS_MSG };
}

/**
 * Verify reset token validity before showing password fields.
 */
export async function verifyResetToken(
  token: string
): Promise<{ valid: boolean; error?: string; email?: string }> {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { valid: false, error: "This password reset link is invalid." };
  }

  const cleanToken = token.trim();

  // 1. Direct Firebase Auth oobCode Verification (Authoritative Primary)
  try {
    const email = await verifyPasswordResetCode(auth, cleanToken);
    return { valid: true, email };
  } catch (fbErr: any) {
    if (fbErr.code === "auth/expired-action-code") {
      return {
        valid: false,
        error: "This password reset link has expired. Please request a new password reset link.",
      };
    }
    if (fbErr.code === "auth/invalid-action-code") {
      // Check if custom backend token fallback is available
    } else {
      console.log("[FIREBASE_VERIFY_CODE_ERROR]", fbErr?.code, fbErr?.message);
    }
  }

  // 2. Custom Token Fallback (Cloud Function / REST API if deployed)
  try {
    const verifyFn = httpsCallable<{ token: string }, { valid: boolean; error?: string; email?: string }>(
      functions,
      "verifyResetTokenCallable"
    );
    const res = await verifyFn({ token: cleanToken });
    if (res.data && res.data.valid) {
      return res.data;
    }
  } catch {}

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/verify-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: cleanToken }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return { valid: false, error: "This password reset link is invalid." };
}

/**
 * Submit new password to backend with token.
 * Updates password in Firebase Authentication.
 * ZERO modification to user role, permissions, department, or profile.
 */
export async function submitPasswordReset(
  token: string,
  password: string,
  confirmPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!token || typeof token !== "string") {
    return { success: false, error: "This password reset link is invalid." };
  }

  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { success: false, error: "Passwords do not match." };
  }

  const cleanToken = token.trim();

  // 1. Direct Firebase Auth confirmPasswordReset (Authoritative Primary)
  try {
    await confirmPasswordReset(auth, cleanToken, password);
    return {
      success: true,
      message: "Your password has been successfully reset. You can now sign in with your new password.",
    };
  } catch (fbErr: any) {
    if (fbErr.code === "auth/expired-action-code") {
      return {
        success: false,
        error: "This password reset link has expired. Please request a new password reset link.",
      };
    }
    if (fbErr.code === "auth/invalid-action-code") {
      // Check if custom backend token fallback is available
    } else if (fbErr.code === "auth/weak-password") {
      return {
        success: false,
        error: "Password is too weak. Please use a stronger password.",
      };
    } else {
      console.log("[FIREBASE_CONFIRM_CODE_ERROR]", fbErr?.code, fbErr?.message);
    }
  }

  // 2. Custom Token Fallback (Cloud Function / REST API if deployed)
  try {
    const resetFn = httpsCallable<
      { token: string; password: string; confirmPassword: string },
      { success: boolean; message?: string; error?: string }
    >(functions, "resetPasswordCallable");
    const res = await resetFn({
      token: cleanToken,
      password,
      confirmPassword,
    });
    if (res.data && res.data.success) {
      return res.data;
    }
    if (res.data && res.data.error) {
      return res.data;
    }
  } catch {}

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: cleanToken,
        password,
        confirmPassword,
      }),
    });
    const data = await res.json();
    if (data && data.success) {
      return data;
    }
    if (data && data.error) {
      return data;
    }
  } catch {}

  return {
    success: false,
    error: "This password reset link is invalid or has expired. Please request a new link.",
  };
}
