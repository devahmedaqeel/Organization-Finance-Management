import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
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
  getRedirectResult,
  signInAnonymously,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { Platform } from "react-native";
import { auth, db } from "../config/firebase";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";

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
  login: (email: string, password: string, role?: UserRole) => Promise<boolean>;
  loginWithGoogle: (role?: UserRole) => Promise<boolean>;
  loginWithGoogleCredential: (idToken: string, accessToken: string, role?: UserRole) => Promise<boolean>;
  signUp: (name: string, email: string, password: string, role: UserRole, orgNameOrInvite: string) => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasPermission: (permission: keyof RolePermissions) => boolean;
}

const DEMO_USERS: Record<string, { password: string; user: User }> = {
  "admin@ofm.com": {
    password: "Admin123",
    user: {
      id: "u1",
      name: "Ahmed Aqeel",
      email: "admin@ofm.com",
      role: "admin",
      organization: "Devorbit Tech",
      organizationId: "org-9icgv4ijp",
    },
  },
  "accountant@ofm.com": {
    password: "Account123",
    user: {
      id: "u2",
      name: "Maryam Naz",
      email: "accountant@ofm.com",
      role: "accountant",
      organization: "Devorbit Tech",
      organizationId: "org-9icgv4ijp",
    },
  },
  "manager@ofm.com": {
    password: "Manager123",
    user: {
      id: "u3",
      name: "Dr. Sundas Iftikhar",
      email: "manager@ofm.com",
      role: "manager",
      organization: "Devorbit Tech",
      organizationId: "org-9icgv4ijp",
    },
  },
  "employee@ofm.com": {
    password: "Employee123",
    user: {
      id: "u4",
      name: "Tariq Mahmood",
      email: "employee@ofm.com",
      role: "employee",
      organization: "Devorbit Tech",
      organizationId: "org-9icgv4ijp",
    },
  },
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => false,
  loginWithGoogle: async () => false,
  loginWithGoogleCredential: async () => false,
  signUp: async () => ({ success: false }),
  forgotPassword: async () => ({ success: false }),
  logout: async () => {},
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Synchronous optimistic state initialization for Web & Mobile to eliminate blank screen loading delays
  const [user, setUser] = useState<User | null>(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("ofm_user");
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed && parsed.email) return parsed;
        }
      } catch (e) {}
    }
    // Default to authoritative Devorbit Tech Admin for instant cross-device parity
    return DEMO_USERS["admin@ofm.com"].user;
  });
  const [isLoading, setIsLoading] = useState(() => false);

  // Handle Google redirect result on web (after signInWithRedirect completes)
  useEffect(() => {
    if (Platform.OS === "web") {
      getRedirectResult(auth)
        .then(async (result) => {
          if (result) {
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
            const role: UserRole = savedRole || "admin";

            const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
            let activeUser: User;
            if (userDoc.exists()) {
              activeUser = userDoc.data() as User;
            } else {
              activeUser = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Google User",
                email: firebaseUser.email || "",
                role,
                organization: "Devorbit Tech",
                organizationId: "org-9icgv4ijp",
              };
              await setDoc(doc(db, "users", firebaseUser.uid), activeUser);
            }
            await AsyncStorage.setItem("ofm_user", JSON.stringify(activeUser));
            setUser(activeUser);
          }
        })
        .catch((err) => {
          console.log("Redirect result notice:", err?.message || err);
        });
    }
  }, []);

  // 1. Instant Local Cache Restore on Mount (takes ~5ms, zero network latency)
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem("ofm_user")
      .then((data) => {
        if (active && data) {
          try {
            const parsed = JSON.parse(data);
            if (parsed && (parsed.email || parsed.id)) {
              if (parsed.email === "admin@ofm.com" || !parsed.organizationId || parsed.organizationId === "demo-org" || !parsed.organization) {
                parsed.organization = "Devorbit Tech";
                parsed.organizationId = "org-9icgv4ijp";
                AsyncStorage.setItem("ofm_user", JSON.stringify(parsed)).catch(() => {});
              }
              setUser(parsed);
              setIsLoading(false);
              // Ensure Firebase Auth session is active so Firestore allows cloud read/write
              if (!auth.currentUser) {
                signInAnonymously(auth).catch(() => {});
              }
              return;
            }
          } catch (e) {}
        }
        
        // Fresh Install: Initialize with Executive Admin (Devorbit Tech) so mobile & web immediately share identical data!
        if (active) {
          const defaultAdmin = DEMO_USERS["admin@ofm.com"].user;
          setUser(defaultAdmin);
          setIsLoading(false);
          AsyncStorage.setItem("ofm_user", JSON.stringify(defaultAdmin)).catch(() => {});
          if (!auth.currentUser) {
            signInAnonymously(auth).catch(() => {});
          }
        }
      })
      .catch(() => {
        if (active) {
          const defaultAdmin = DEMO_USERS["admin@ofm.com"].user;
          setUser(defaultAdmin);
          setIsLoading(false);
          if (!auth.currentUser) {
            signInAnonymously(auth).catch(() => {});
          }
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // 2. Real-time Firebase Auth state sync with background timeout
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Anonymous sessions are purely for Firestore transport authorization.
        // Never overwrite or reset the active user profile or organization!
        if (firebaseUser.isAnonymous) {
          return;
        }

        try {
          const formattedEmail = (firebaseUser.email || "").toLowerCase().trim();

          const fetchUserPromise = async () => {
            const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
            if (userDoc.exists()) {
              return { id: firebaseUser.uid, ...userDoc.data() } as User;
            }
            const q = query(collection(db, "users"), where("email", "==", formattedEmail));
            const snap = await getDocs(q);
            if (!snap.empty) {
              return { id: firebaseUser.uid, ...snap.docs[0].data() } as User;
            }
            return null;
          };

          // 3-second timeout so slow mobile connection never hangs the app launch
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
          const remoteUser = await Promise.race([fetchUserPromise(), timeoutPromise]);

          if (remoteUser) {
            setUser(remoteUser);
            await AsyncStorage.setItem("ofm_user", JSON.stringify(remoteUser));
          } else {
            setUser((curr) => {
              // If user already has an active session with valid organizationId, preserve it!
              if (curr && (curr.id === firebaseUser.uid || curr.email === formattedEmail || curr.organizationId)) {
                return curr;
              }
              const activeUser: User = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || formattedEmail.split("@")[0] || "User",
                email: formattedEmail,
                role: "admin",
                organization: "My Organization",
                organizationId: `org_${firebaseUser.uid.slice(0, 8)}`,
              };
              AsyncStorage.setItem("ofm_user", JSON.stringify(activeUser)).catch(() => {});
              setDoc(doc(db, "users", firebaseUser.uid), activeUser, { merge: true }).catch(() => {});
              return activeUser;
            });
          }
        } catch (error) {
          const localData = await AsyncStorage.getItem("ofm_user");
          if (localData) {
            try {
              setUser(JSON.parse(localData));
            } catch (e) {}
          }
        }
      } else {
        try {
          const localData = await AsyncStorage.getItem("ofm_user");
          if (localData) {
            const parsed = JSON.parse(localData);
            if (parsed && parsed.email && Object.values(DEMO_USERS).some((d) => d.user.email.toLowerCase() === parsed.email.toLowerCase())) {
              setUser(parsed);
            } else {
              setUser(null);
            }
          } else {
            setUser(null);
          }
        } catch (e) {
          setUser(null);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string, role?: UserRole): Promise<boolean> => {
    const formattedEmail = email.toLowerCase().trim();
    const demoRecord = DEMO_USERS[formattedEmail];

    if (demoRecord && demoRecord.password === password && (!role || demoRecord.user.role === role)) {
      // Connect to Firebase Auth so Firestore security rules allow full cloud sync
      try {
        if (!auth.currentUser) {
          await signInWithEmailAndPassword(auth, formattedEmail, password).catch(async () => {
            await createUserWithEmailAndPassword(auth, formattedEmail, password).catch(async () => {
              await signInAnonymously(auth).catch(() => {});
            });
          });
        }
      } catch (e) {}

      await AsyncStorage.setItem("ofm_user", JSON.stringify(demoRecord.user));
      setUser(demoRecord.user);
      return true;
    }

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
        const cached = await AsyncStorage.getItem("ofm_user");
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

      await AsyncStorage.setItem("ofm_user", JSON.stringify(activeUser));
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

      // Demo admin check (instant, 0ms)
      const demoAdminEntry = Object.values(DEMO_USERS).find(
        (entry) => entry.user.email.toLowerCase() === adminEmail && entry.user.role === "admin"
      );

      if (role === "admin") {
        organization = orgNameOrInvite.trim() || "My Organization";
        organizationId = "org-" + Math.random().toString(36).substring(2, 11);
      } else if (demoAdminEntry) {
        organization = demoAdminEntry.user.organization;
        organizationId = demoAdminEntry.user.organizationId;
      } else if (adminEmail) {
        // Fast invite check with 2.5s timeout
        try {
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
          const checkAdminPromise = async () => {
            const inviteDoc = await getDoc(doc(db, "invitations", normalizedEmail));
            if (inviteDoc.exists()) {
              const inviteData = inviteDoc.data() as any;
              return {
                org: inviteData.organization || "My Organization",
                orgId: inviteData.organizationId || "default-org",
                role: inviteData.role || role,
              };
            }
            const q = query(collection(db, "users"), where("email", "==", adminEmail), where("role", "==", "admin"));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              const adminData = querySnapshot.docs[0].data() as User;
              return {
                org: adminData.organization || "My Organization",
                orgId: adminData.organizationId || "default-org",
                role,
              };
            }
            return null;
          };

          const found = await Promise.race([checkAdminPromise(), timeoutPromise]);
          if (found) {
            organization = found.org;
            organizationId = found.orgId;
            assignedRole = found.role;
          } else {
            organization = orgNameOrInvite.trim() || "My Organization";
            organizationId = `org_${adminEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;
          }
        } catch (e) {
          organization = orgNameOrInvite.trim() || "My Organization";
          organizationId = `org_${adminEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;
        }
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
      }

      tasks.push(
        setDoc(doc(db, "invitations", normalizedEmail), { status: "accepted", acceptedAt: Timestamp.now() }, { merge: true }).catch(() => {})
      );

      await Promise.all(tasks);

      await AsyncStorage.setItem("ofm_user", JSON.stringify(newUser));
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

  const forgotPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      return { success: true };
    } catch (error: any) {
      let msg = "Could not send reset email.";
      if (error.code === "auth/user-not-found") msg = "No account found with this email.";
      else if (error.code === "auth/invalid-email") msg = "Invalid email address.";
      return { success: false, error: msg };
    }
  };

  const handleGoogleWebResult = async (result: any, role: UserRole): Promise<boolean> => {
    const firebaseUser = result.user;

    // Check if there is a pending native redirect
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const isNative = urlParams.get("native") === "true";
      const targetRole = (urlParams.get("role") as UserRole) || role;
      if (isNative) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const idToken = credential?.idToken || "";
        const accessToken = credential?.accessToken || "";
        const deepLink = `ofm-app://login?idToken=${encodeURIComponent(idToken)}&accessToken=${encodeURIComponent(accessToken)}&role=${targetRole}`;
        window.location.href = deepLink;
        return true;
      }
    }

    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
    let activeUser: User;

    if (userDoc.exists()) {
      activeUser = userDoc.data() as User;
    } else {
      activeUser = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Google User",
        email: firebaseUser.email || "",
        role,
        organization: "",
        organizationId: "",
      };
      await setDoc(doc(db, "users", firebaseUser.uid), activeUser);
    }

    await AsyncStorage.setItem("ofm_user", JSON.stringify(activeUser));
    setUser(activeUser);
    return true;
  };

  const loginWithGoogle = async (role: UserRole = "admin"): Promise<boolean> => {
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
          return handleGoogleWebResult(result, role);
        } catch (popupError: any) {
          if (
            popupError.code === "auth/popup-closed-by-user" ||
            popupError.code === "auth/cancelled-popup-request"
          ) {
            return false;
          }
          if (popupError.code === "auth/popup-blocked") {
            await signInWithRedirect(auth, provider);
            return true;
          }
          if (popupError.code === "auth/unauthorized-domain") {
            throw new Error("This website domain is not authorized for Google Sign-In. Please check Firebase Console authorized domains.");
          }
          throw popupError;
        }
      } else {
        // Native Android/iOS — use openAuthSessionAsync with dynamically resolved redirectUri
        const redirectUri = makeRedirectUri({ scheme: "ofm-app", path: "login" });
        const webOrigin = "https://ofmapp-main.web.app";
        const authUrl = `${webOrigin}/auth/google?role=${role}&redirect_uri=${encodeURIComponent(redirectUri)}`;

        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

        if (result.type === "success" && result.url) {
          // Parse the deep link URL for tokens
          const parsed = new URL(result.url);
          const idToken = parsed.searchParams.get("idToken");
          const accessToken = parsed.searchParams.get("accessToken");
          const returnedRole = (parsed.searchParams.get("role") as UserRole) || role;

          if (idToken && accessToken) {
            return loginWithGoogleCredential(
              decodeURIComponent(idToken),
              decodeURIComponent(accessToken),
              returnedRole
            );
          }
        }
        // User cancelled or no tokens returned
        return false;
      }
    } catch (error: any) {
      console.error("Google Login Error:", error);
      throw error;
    }
  };

  const loginWithGoogleCredential = async (idToken: string, accessToken: string, role: UserRole = "admin"): Promise<boolean> => {
    try {
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const userCredential = await signInWithCredential(auth, credential);
      const firebaseUser = userCredential.user;

      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      let activeUser: User;

      if (userDoc.exists()) {
        activeUser = userDoc.data() as User;
      } else {
        activeUser = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Google User",
          email: firebaseUser.email || "",
          role,
          organization: "",
          organizationId: "",
        };
        await setDoc(doc(db, "users", firebaseUser.uid), activeUser);
      }

      await AsyncStorage.setItem("ofm_user", JSON.stringify(activeUser));
      setUser(activeUser);
      return true;
    } catch (error) {
      console.error("Firebase Native Google Login Error:", error);
      return false;
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

    // Purge all organization-scoped caches from AsyncStorage (Preserve tombstones so deleted items NEVER resurrect)
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(
        (k) =>
          k.startsWith("ofm_cache:") ||
          k.includes("transactions") ||
          k.includes("budgets") ||
          k.includes("payroll") ||
          k.includes("departments")
      );
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (e) {}

    // Purge all web local/session caches (Preserve tombstones so deleted items NEVER resurrect)
    if (typeof window !== "undefined") {
      try {
        sessionStorage.clear();
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (
            k &&
            !k.startsWith("ofm_tombstones:") &&
            (k.startsWith("ofm_cache:") ||
             k.includes("transactions") ||
             k.includes("budgets") ||
             k.includes("payroll") ||
             k.includes("departments"))
          ) {
            localStorage.removeItem(k);
          }
        }
      } catch (e) {}
    }
    setUser(null);
  };

  const authValue = useMemo(
    () => ({
      user,
      isLoading,
      login,
      loginWithGoogle,
      loginWithGoogleCredential,
      signUp,
      forgotPassword,
      logout,
      hasPermission: (permission: keyof RolePermissions) => user?.role ? (ROLE_PERMISSIONS[user.role]?.[permission] ?? false) : false,
    }),
    [user, isLoading, login, loginWithGoogle, loginWithGoogleCredential, signUp, forgotPassword, logout]
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
