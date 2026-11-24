import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, Timestamp, onSnapshot } from "firebase/firestore";
import { Platform } from "react-native";
import { auth, db } from "../config/firebase";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { getGoogleRedirectResult } from "@/services/googleRedirectResult";
import { isGoogleBridgePath, isGooglePopupCancellation, googleAuthErrorMessage, normalizeGoogleRole, parseNativeGoogleCallback, withAuthTimeout } from "@/services/googleAuthFlow";
import { requestPasswordReset } from "@/services/passwordResetClientService";

WebBrowser.maybeCompleteAuthSession();

export type UserRole = "admin" | "accountant" | "manager" | "employee";

export interface RolePermissions {
  manageOrganization: boolean;     // Admin only
  manageUsers: boolean;            // Admin only
  manageRoles: boolean;            // Admin only
  viewAuditLogs: boolean;          // Admin only
  manageSettings: boolean;         // Admin only
  manageBudgets: boolean;          // Admin, Accountant, Manager
  createTransaction: boolean;      // Admin, Accountant
  editTransaction: boolean;        // Admin, Accountant
  deleteTransaction: boolean;      // Admin, Accountant
  viewFinancialLedger: boolean;    // Admin, Accountant, Manager
  approveExpenses: boolean;        // Admin, Manager
  submitExpenseClaim: boolean;     // All
  viewReports: boolean;            // Admin, Accountant, Manager
  viewAnalytics: boolean;          // Admin, Manager
  viewPersonalExpenses: boolean;   // All
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    manageOrganization: true,
    manageUsers: true,
    manageRoles: true,
    viewAuditLogs: true,
    manageSettings: true,
    manageBudgets: true,
    createTransaction: true,
    editTransaction: true,
    deleteTransaction: true,
    viewFinancialLedger: true,
    approveExpenses: true,
    submitExpenseClaim: true,
    viewReports: true,
    viewAnalytics: true,
    viewPersonalExpenses: true,
  },
  accountant: {
    manageOrganization: false,
    manageUsers: false,
    manageRoles: false,
    viewAuditLogs: false,
    manageSettings: false,
    manageBudgets: true,
    createTransaction: true,
    editTransaction: true,
    deleteTransaction: true,
    viewFinancialLedger: true,
    approveExpenses: false,
    submitExpenseClaim: true,
    viewReports: true,
    viewAnalytics: false,
    viewPersonalExpenses: true,
  },
  manager: {
    manageOrganization: false,
    manageUsers: false,
    manageRoles: false,
    viewAuditLogs: false,
    manageSettings: false,
    manageBudgets: true,
    createTransaction: false,
    editTransaction: false,
    deleteTransaction: false,
    viewFinancialLedger: true,
    approveExpenses: true,
    submitExpenseClaim: true,
    viewReports: true,
    viewAnalytics: true,
    viewPersonalExpenses: true,
  },
  employee: {
    manageOrganization: false,
    manageUsers: false,
    manageRoles: false,
    viewAuditLogs: false,
    manageSettings: false,
    manageBudgets: false,
    createTransaction: false,
    editTransaction: false,
    deleteTransaction: false,
    viewFinancialLedger: false,
    approveExpenses: false,
    submitExpenseClaim: true,
    viewReports: false,
    viewAnalytics: false,
    viewPersonalExpenses: true,
  },
};

export function hasPermission(role: UserRole | undefined, permission: keyof RolePermissions): boolean {
  if (!role) return false;
  return Boolean(ROLE_PERMISSIONS[role]?.[permission]);
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organization: string;
  organizationId: string;
  department?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  googleSignInError: string | null;
  login: (email: string, password: string, role?: UserRole) => Promise<boolean>;
  loginWithGoogle: (role?: UserRole) => Promise<boolean>;
  loginWithGoogleCredential: (idToken: string, accessToken: string, role?: UserRole) => Promise<boolean>;
  signUp: (name: string, email: string, password: string, role: UserRole, orgNameOrInvite: string) => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  logout: () => Promise<void>;
  hasPermission: (permission: keyof RolePermissions) => boolean;
  updateUserOrganization: (newOrgName: string) => Promise<void>;
}


const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  googleSignInError: null,
  login: async () => false,
  loginWithGoogle: async () => false,
  loginWithGoogleCredential: async () => false,
  signUp: async () => ({ success: false }),
  forgotPassword: async () => ({ success: false }),
  logout: async () => {},
  hasPermission: () => false,
  updateUserOrganization: async () => {},
});

function clearGoogleLoginIntent() {
  if (typeof window === "undefined") return;
  for (const storage of [() => window.sessionStorage, () => window.localStorage]) {
    try { storage().removeItem("google_login_role"); storage().removeItem("ofm_google_redirect_pending"); } catch {}
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [googleSignInError, setGoogleSignInError] = useState<string | null>(null);
  const googleSignInPending = useRef((() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return false;
    try { return window.sessionStorage.getItem("ofm_google_redirect_pending") === "1" || window.localStorage.getItem("ofm_google_redirect_pending") === "1"; } catch { return false; }
  })());
  const isNativeBridge = Platform.OS === "web" && typeof window !== "undefined" && isGoogleBridgePath(window.location.pathname);
  // Reliable cross-platform session persistence helper
  const persistUserSession = useCallback(async (userToPersist: User | null) => {
    if (userToPersist) {
      await AsyncStorage.setItem("ofm_user", JSON.stringify(userToPersist));
      if (Platform.OS === "web" && typeof window !== "undefined") {
        try {
          localStorage.setItem("ofm_user", JSON.stringify(userToPersist));
        } catch (e) {}
      }
    } else {
      await AsyncStorage.removeItem("ofm_user");
      if (Platform.OS === "web" && typeof window !== "undefined") {
        try {
          localStorage.removeItem("ofm_user");
        } catch (e) {}
      }
    }
  }, []);

  // Synchronous optimistic state initialization for Web & Mobile to eliminate blank screen loading delays
  const [user, setUser] = useState<User | null>(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("ofm_user");
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed && (parsed.email || parsed.id)) return parsed;
        }
      } catch (e) {}
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("ofm_user");
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed && (parsed.email || parsed.id)) return false;
        }
      } catch (e) {}
    }
    return true;
  });

  // Centralized canonical profile resolver ensuring 100% identity and organization parity across Web and Mobile
  const resolveCanonicalUserProfile = useCallback(async (firebaseUser: any, defaultRole: UserRole = "admin"): Promise<User> => {
    const formattedEmail = (firebaseUser.email || "").toLowerCase().trim();
    let existingData: Partial<User> = {};
    const deadline = Date.now() + 15000;
    const readProfile = <T,>(operation: Promise<T>) => withAuthTimeout(operation, Math.max(1, deadline - Date.now()), "Your organization details could not be loaded. Check your connection and try again.");

    try {
      const userDoc = await readProfile(getDoc(doc(db, "users", firebaseUser.uid)));
      if (userDoc.exists()) {
        existingData = userDoc.data() as Partial<User>;
      } else {
        const q = query(collection(db, "users"), where("email", "==", formattedEmail));
        const snap = await readProfile(getDocs(q));
        if (!snap.empty) {
          existingData = snap.docs[0].data() as Partial<User>;
        }
      }
    } catch (e) {
      // Do not create a different organization from a failed profile lookup.
      throw e;
    }

    let org = existingData.organization || "";
    let orgId = existingData.organizationId || "";
    let userRole: UserRole = existingData.role || defaultRole;

    // Brand-new account (e.g. first Google sign-in): an admin's invitation decides org and role
    if (!existingData.organizationId && formattedEmail) {
      try {
        const inviteDoc = await readProfile(getDoc(doc(db, "invitations", formattedEmail)));
        const invite = inviteDoc.exists() ? (inviteDoc.data() as any) : null;
        if (invite?.organizationId) {
          org = invite.organization || org;
          orgId = invite.organizationId;
          userRole = ["admin", "accountant", "manager", "employee"].includes(invite.role) ? invite.role : "employee";
          setDoc(doc(db, "invitations", formattedEmail), { status: "accepted", acceptedAt: Timestamp.now() }, { merge: true }).catch(() => {});
        }
      } catch (e) { throw e; }
    }

    // Canonical organization mapping: preserve user org or initialize clean tenant
    if (formattedEmail === "engrahmedaqeel14@gmail.com") {
      org = org || "Devorbit Tech";
      orgId = orgId || "org-9icgv4ijp";
    } else if (!orgId) {
      org = org || "My Organization";
      orgId = `org_${firebaseUser.uid.slice(0, 8)}`;
    }

    const resolvedUser: User = {
      id: firebaseUser.uid,
      name: existingData.name || firebaseUser.displayName || formattedEmail.split("@")[0] || "User",
      email: formattedEmail,
      role: userRole,
      organization: org,
      organizationId: orgId,
    };

    setDoc(doc(db, "users", firebaseUser.uid), resolvedUser, { merge: true }).catch(() => {});
    return resolvedUser;
  }, []);

  // Handle Google redirect result on web (after signInWithRedirect completes)
  useEffect(() => {
    if (Platform.OS === "web" && !isNativeBridge) {
      getGoogleRedirectResult(auth)
        .then(async (result) => {
          if (result) {
            googleSignInPending.current = true;
            const firebaseUser = result.user;
            let savedRole: UserRole | null = null;
            if (typeof window !== "undefined") {
              try {
                savedRole = (localStorage.getItem("google_login_role") ||
                  sessionStorage.getItem("google_login_role")) as UserRole | null;
                localStorage.removeItem("google_login_role");
                sessionStorage.removeItem("google_login_role");
              } catch (e) {}
            }
            const role: UserRole = normalizeGoogleRole(savedRole);
            const activeUser = await resolveCanonicalUserProfile(firebaseUser, role);
            await persistUserSession(activeUser);
            setUser(activeUser);
            clearGoogleLoginIntent();
            googleSignInPending.current = false;
          } else if (googleSignInPending.current) {
            clearGoogleLoginIntent();
            googleSignInPending.current = false;
            setGoogleSignInError("Google sign-in could not be restored. Please try again and allow sign-in popups for this website.");
          }
        })
        .catch((err) => {
          clearGoogleLoginIntent();
          googleSignInPending.current = false;
          setGoogleSignInError(googleAuthErrorMessage(err));
        });
    }
  }, [resolveCanonicalUserProfile, persistUserSession, isNativeBridge]);


  // 1. Instant Local Cache Restore on Mount (takes ~5ms, zero network latency)
  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      try {
        let cachedData: string | null = null;
        if (Platform.OS === "web" && typeof window !== "undefined") {
          try {
            cachedData = localStorage.getItem("ofm_user");
          } catch (e) {}
        }
        if (!cachedData) {
          cachedData = await AsyncStorage.getItem("ofm_user");
        }

        if (active && cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (parsed && (parsed.email || parsed.id)) {
              setUser(parsed);
              setIsLoading(false);
              persistUserSession(parsed).catch(() => {});
              return;
            }
          } catch (e) {}
        }

        if (active) {
          setIsLoading(false);
        }
      } catch (e) {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, [persistUserSession]);

  // 2. Real-time Firebase Auth state sync with background timeout
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // The bridge returns credentials to native; it must not provision a web profile.
      // Interactive Google sign-in resolves its selected role and profile itself.
      if (isNativeBridge || googleSignInPending.current) { setIsLoading(false); return; }
      if (firebaseUser) {
        // Anonymous sessions are purely for Firestore transport authorization.
        // Never overwrite or reset the active user profile or organization!
        if (firebaseUser.isAnonymous) {
          return;
        }

        try {
          // 3-second timeout so slow mobile connection never hangs the app launch
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
          const remoteUser = await Promise.race([
            resolveCanonicalUserProfile(firebaseUser),
            timeoutPromise,
          ]);

          if (remoteUser) {
            setUser(remoteUser);
            await persistUserSession(remoteUser);
          }
        } catch (error) {
          let localData: string | null = null;
          if (Platform.OS === "web" && typeof window !== "undefined") {
            try { localData = localStorage.getItem("ofm_user"); } catch (e) {}
          }
          if (!localData) {
            localData = await AsyncStorage.getItem("ofm_user");
          }
          if (localData) {
            try {
              setUser(JSON.parse(localData));
            } catch (e) {}
          }
        }
      } else {
        // Browser Refresh / Offline: Retain valid cached session from storage
        try {
          let localData: string | null = null;
          if (Platform.OS === "web" && typeof window !== "undefined") {
            try { localData = localStorage.getItem("ofm_user"); } catch (e) {}
          }
          if (!localData) {
            localData = await AsyncStorage.getItem("ofm_user");
          }
          if (localData) {
            const parsed = JSON.parse(localData);
            if (parsed && (parsed.email || parsed.id)) {
              if (parsed.email === "engrahmedaqeel14@gmail.com") {
                parsed.organization = parsed.organization || "Devorbit Tech";
                parsed.organizationId = parsed.organizationId || "org-9icgv4ijp";
              }
              setUser(parsed);
            }
          }
          // Do not overwrite user with null if already restored from storage and offline
        } catch (e) {}
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [resolveCanonicalUserProfile, persistUserSession, isNativeBridge]);

  // 3. Real-time Live Role and Permission Synchronization
  // Updates user role immediately if online when changed in Firestore; retains cached role if offline.
  useEffect(() => {
    if (!user?.id) return;

    const unsub = onSnapshot(
      doc(db, "users", user.id),
      (snap) => {
        if (snap.exists()) {
          const cloudData = snap.data() as Partial<User>;
          if (cloudData.role && cloudData.role !== user.role) {
            setUser((prev) => {
              if (!prev) return prev;
              const updated = { ...prev, role: cloudData.role as UserRole };
              persistUserSession(updated).catch(() => {});
              return updated;
            });
          }
        }
      },
      () => {
        // Suppress network/offline errors so local cached role is smoothly retained
      }
    );

    return () => unsub();
  }, [user?.id, user?.role, persistUserSession]);

  const login = async (email: string, password: string, role?: UserRole): Promise<boolean> => {
    const formattedEmail = email.toLowerCase().trim();

    try {
      const userCredential = await signInWithEmailAndPassword(auth, formattedEmail, password);
      const firebaseUser = userCredential.user;

      // Fast fetch with 2.5s maximum cutoff so mobile doesn't freeze
      let activeUser: User | null = null;
      try {
        const fetchPromise = getDoc(doc(db, "users", firebaseUser.uid)).then((docSnap) => {
          if (docSnap.exists()) return { id: firebaseUser.uid, ...docSnap.data() } as User;
          return null;
        });
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
        activeUser = await Promise.race([fetchPromise, timeoutPromise]);
      } catch (e) {}

      if (!activeUser) {
        let cached: string | null = null;
        if (Platform.OS === "web" && typeof window !== "undefined") {
          try { cached = localStorage.getItem("ofm_user"); } catch (e) {}
        }
        if (!cached) {
          cached = await AsyncStorage.getItem("ofm_user");
        }
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && (parsed.email === formattedEmail || parsed.id === firebaseUser.uid)) {
              activeUser = parsed;
            }
          } catch (e) {}
        }
      }

      if (!activeUser) {
        activeUser = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || formattedEmail.split("@")[0],
          email: formattedEmail,
          role: role || "admin",
          organization: "My Organization",
          organizationId: `org_${firebaseUser.uid.slice(0, 8)}`,
        };
        setDoc(doc(db, "users", firebaseUser.uid), activeUser, { merge: true }).catch(() => {});
      }

      await persistUserSession(activeUser);
      setUser(activeUser);
      return true;
    } catch (error) {
      console.error("Firebase Login Error:", error);
      return false;
    }
  };

  const signUp = async (
    name: string,
    email: string,
    password: string,
    role: UserRole,
    orgNameOrInvite: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      let organization = "My Organization";
      let organizationId = "default-org";
      let assignedRole = role;

      const normalizedEmail = email.trim().toLowerCase();
      const adminEmail = orgNameOrInvite.trim().toLowerCase();

      if (role === "admin") {
        organization = orgNameOrInvite.trim() || "My Organization";
        organizationId = "org-" + Math.random().toString(36).substring(2, 11);
      } else if (adminEmail) {
        // Joining an existing organization. The role ALWAYS comes from the admin's invitation,
        // never from the role picked on the sign-up form (that would let anyone who knows an
        // admin's email give themselves accountant/manager access).
        type JoinResult = { org: string; orgId: string; role: UserRole } | { error: string };
        const lookupJoin = async (): Promise<JoinResult> => {
          // 1. A personal invitation for this email decides org and role
          const inviteDoc = await getDoc(doc(db, "invitations", normalizedEmail));
          if (inviteDoc.exists()) {
            const inviteData = inviteDoc.data() as any;
            const invitedRole: UserRole = ["admin", "accountant", "manager", "employee"].includes(inviteData.role)
              ? inviteData.role
              : "employee";
            if (inviteData.organizationId) {
              return { org: inviteData.organization || "My Organization", orgId: inviteData.organizationId, role: invitedRole };
            }
          }
          // 2. No invitation, but a valid admin invite code: join with the lowest role.
          //    The admin can promote the member from Team Management.
          const q = query(collection(db, "users"), where("email", "==", adminEmail), where("role", "==", "admin"));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const adminData = querySnapshot.docs[0].data() as User;
            if (adminData.organizationId) {
              return { org: adminData.organization || "My Organization", orgId: adminData.organizationId, role: "employee" };
            }
          }
          return { error: "We couldn't find an invitation for this email or an admin with that invite code. Ask your admin to invite you, then try again." };
        };

        let joined: JoinResult;
        try {
          const timeout = new Promise<JoinResult>((resolve) =>
            setTimeout(() => resolve({ error: "Couldn't verify your invitation — check your internet connection and try again." }), 10000)
          );
          joined = await Promise.race([lookupJoin(), timeout]);
        } catch (e) {
          joined = { error: "Couldn't verify your invitation — check your internet connection and try again." };
        }

        // Never create a made-up organization: stop before the account is created
        if ("error" in joined) {
          return { success: false, error: joined.error };
        }
        organization = joined.org;
        organizationId = joined.orgId;
        assignedRole = joined.role;
      }

      // 1. Create User in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const firebaseUser = userCredential.user;

      const newUser: User = {
        id: firebaseUser.uid,
        name,
        email: normalizedEmail,
        role: assignedRole,
        organization,
        organizationId,
      };

      // 2. Parallel Cloud Writes via Promise.all (cuts time from 15s to ~1.5s)
      const tasks: Promise<any>[] = [
        updateProfile(firebaseUser, { displayName: name }).catch(() => {}),
        setDoc(doc(db, "users", firebaseUser.uid), {
          ...newUser,
          createdAt: Timestamp.now(),
          status: "active",
        }),
      ];

      if (assignedRole === "admin") {
        tasks.push(
          setDoc(doc(db, "organizations", organizationId), {
            id: organizationId,
            name: organization,
            adminId: firebaseUser.uid,
            createdAt: Timestamp.now(),
          }).catch(() => {})
        );
        tasks.push(
          setDoc(doc(db, "orgSettings", organizationId), {
            organizationName: organization,
            organizationAddress: "",
            organizationEmail: normalizedEmail,
            organizationPhone: "",
            currency: "PKR",
            fiscalYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
            organizationLogo: "",
            theme: "system",
            customIncomeCategories: [],
            customExpenseCategories: [],
          }).catch(() => {})
        );
      }

      tasks.push(
        setDoc(doc(db, "invitations", normalizedEmail), { status: "accepted", acceptedAt: Timestamp.now() }, { merge: true }).catch(() => {})
      );
      // Remove the invite placeholder ("u_<email>") now that the real account exists, so the
      // team list and role changes always point at this account
      const placeholderId = `u_${normalizedEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;
      if (placeholderId !== firebaseUser.uid) {
        tasks.push(deleteDoc(doc(db, "users", placeholderId)).catch(() => {}));
      }

      await Promise.all(tasks);

      // Cleanly purge stale in-memory / local caches from any prior session
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const staleKeys = allKeys.filter((k) => k.startsWith("ofm_cache:") || k.startsWith("ofm_settings"));
        if (staleKeys.length > 0) {
          await AsyncStorage.multiRemove(staleKeys);
        }
      } catch (e) {}

      await persistUserSession(newUser);
      setUser(newUser);
      return { success: true };
    } catch (error: any) {
      let msg = "Signup failed. Please try again.";
      if (error.code === "auth/email-already-in-use") msg = "This email is already registered.";
      else if (error.code === "auth/weak-password") msg = "Password must be at least 6 characters.";
      else if (error.code === "auth/invalid-email") msg = "Invalid email address.";
      return { success: false, error: msg };
    }
  };

  const forgotPassword = async (email: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        return { success: false, error: "Please enter your email address." };
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return { success: false, error: "Please enter a valid email address." };
      }

      const res = await requestPasswordReset(cleanEmail);
      if (!res.success) {
        return { success: false, error: res.error };
      }
      return { success: true, message: res.message };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Unable to send reset link. Please try again.",
      };
    }
  };

  const handleGoogleWebResult = async (result: any, role: UserRole): Promise<boolean> => {
    const firebaseUser = result.user;

    const activeUser = await resolveCanonicalUserProfile(firebaseUser, role);
    await persistUserSession(activeUser);
    setUser(activeUser);
    return true;
  };

  const loginWithGoogle = async (role: UserRole = "admin"): Promise<boolean> => {
    if (googleSignInPending.current) return false;
    googleSignInPending.current = true;
    setGoogleSignInError(null);
    try {
      if (Platform.OS === "web") {
        const provider = new GoogleAuthProvider();
        provider.addScope("email");
        provider.addScope("profile");
        provider.setCustomParameters({ prompt: "select_account" });

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("google_login_role", role);
            sessionStorage.setItem("google_login_role", role);
          } catch (e) {}
        }

        try {
          const result = await signInWithPopup(auth, provider);
          return await handleGoogleWebResult(result, role);
        } catch (popupError: any) {
          if (isGooglePopupCancellation(popupError)) {
            return false;
          }
          if (popupError.code === "auth/popup-blocked") {
            for (const storage of [() => window.sessionStorage, () => window.localStorage]) {
              try { storage().setItem("ofm_google_redirect_pending", "1"); } catch {}
            }
            await signInWithRedirect(auth, provider);
            return true;
          }
          if (popupError.code === "auth/unauthorized-domain") {
            throw new Error("This website domain is not authorized for Google Sign-In. Please check Firebase Console authorized domains.");
          }
          throw new Error(googleAuthErrorMessage(popupError));
        }
      } else {
        if (Constants.executionEnvironment === "storeClient") {
          throw new Error("Google sign-in requires the installed OFM app or a development build. Expo Go cannot handle this application callback.");
        }
        // The same auth session owns the return URL and credential exchange.
        const redirectUri = makeRedirectUri({ scheme: "ofm-app", path: "login" });
        const state = randomUUID();
        const webOrigin = (process.env.EXPO_PUBLIC_AUTH_BRIDGE_ORIGIN || "https://ofmapp-main.web.app").replace(/\/$/, "");
        const authUrl = `${webOrigin}/auth/google?role=${role}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

        if (result.type === "success" && result.url) {
          const tokens = parseNativeGoogleCallback(result.url, redirectUri, state);
          return await loginWithGoogleCredential(tokens.idToken || "", tokens.accessToken || "", tokens.role);
        }
        // User cancelled or no tokens returned
        return false;
      }
    } catch (error: any) {
      console.error("Google Login Error:", error);
      throw new Error(googleAuthErrorMessage(error));
    } finally {
      clearGoogleLoginIntent();
      googleSignInPending.current = false;
    }
  };

  const loginWithGoogleCredential = async (idToken: string, accessToken: string, role: UserRole = "admin"): Promise<boolean> => {
    try {
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const userCredential = await withAuthTimeout(signInWithCredential(auth, credential), 20000, "Could not complete Google sign-in. Check your internet connection and try again.");
      const firebaseUser = userCredential.user;

      const activeUser = await resolveCanonicalUserProfile(firebaseUser, role);
      await persistUserSession(activeUser);
      setUser(activeUser);
      return true;
    } catch (error) {
      throw new Error(googleAuthErrorMessage(error as { code?: string; message?: string }));
    }
  };

  const logout = async () => {
    try {
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
    } catch (e) {
      console.log("Firebase logout error:", e);
    }
    await AsyncStorage.removeItem("ofm_user");
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("ofm_user");
      } catch (e) {}
    }

    // Clear user session token
    setUser(null);
  };

  const updateUserOrganization = async (newOrgName: string) => {
    if (!user) return;
    const updatedUser = { ...user, organization: newOrgName };
    setUser(updatedUser);
    try {
      await AsyncStorage.setItem("ofm_user", JSON.stringify(updatedUser));
      if (Platform.OS === "web" && typeof localStorage !== "undefined") {
        localStorage.setItem("ofm_user", JSON.stringify(updatedUser));
      }
      if (user.id) {
        await setDoc(doc(db, "users", user.id), { organization: newOrgName }, { merge: true });
      }
    } catch (e) {}
  };

  const authValue = useMemo(
    () => ({
      user,
      isLoading,
      googleSignInError,
      login,
      loginWithGoogle,
      loginWithGoogleCredential,
      signUp,
      forgotPassword,
      logout,
      hasPermission: (permission: keyof RolePermissions) => user?.role ? (ROLE_PERMISSIONS[user.role]?.[permission] ?? false) : false,
      updateUserOrganization,
    }),
    [user, isLoading, googleSignInError, login, loginWithGoogle, loginWithGoogleCredential, signUp, forgotPassword, logout]
  );

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
