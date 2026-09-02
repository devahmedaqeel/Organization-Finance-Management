import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
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
      organization: "Organization Finance Management",
      organizationId: "demo-org",
    },
  },
  "accountant@ofm.com": {
    password: "Account123",
    user: {
      id: "u2",
      name: "Maryam Naz",
      email: "accountant@ofm.com",
      role: "accountant",
      organization: "Organization Finance Management",
      organizationId: "demo-org",
    },
  },
  "manager@ofm.com": {
    password: "Manager123",
    user: {
      id: "u3",
      name: "Dr. Sundas Iftikhar",
      email: "manager@ofm.com",
      role: "manager",
      organization: "Organization Finance Management",
      organizationId: "demo-org",
    },
  },
  "employee@ofm.com": {
    password: "Employee123",
    user: {
      id: "u4",
      name: "Tariq Mahmood",
      email: "employee@ofm.com",
      role: "employee",
      organization: "Organization Finance Management",
      organizationId: "demo-org",
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
  // Synchronous optimistic state initialization for Web to eliminate blank screen loading delays
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
    return null;
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("ofm_user");
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed && parsed.email) return false;
        }
      } catch (e) {}
    }
    return true;
  });

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
                organization: "",
                organizationId: "",
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const formattedEmail = (firebaseUser.email || "").toLowerCase().trim();
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          let activeUser: User;

          if (userDoc.exists()) {
            activeUser = { id: firebaseUser.uid, ...userDoc.data() } as User;
          } else {
            const q = query(collection(db, "users"), where("email", "==", formattedEmail));
            const snap = await getDocs(q);
            if (!snap.empty) {
              activeUser = { id: firebaseUser.uid, ...snap.docs[0].data() } as User;
            } else {
              activeUser = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || formattedEmail.split("@")[0] || "User",
                email: formattedEmail,
                role: "admin",
                organization: "My Organization",
                organizationId: `org_${firebaseUser.uid.slice(0, 8)}`,
              };
            }
            await setDoc(doc(db, "users", firebaseUser.uid), activeUser, { merge: true });
          }
          setUser(activeUser);
          await AsyncStorage.setItem("ofm_user", JSON.stringify(activeUser));
        } catch (error) {
          const localData = await AsyncStorage.getItem("ofm_user");
          if (localData) setUser(JSON.parse(localData));
        }
      } else {
        try {
          const localData = await AsyncStorage.getItem("ofm_user");
          if (localData) {
            const parsed = JSON.parse(localData);
            if (parsed && parsed.email) {
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
      await AsyncStorage.setItem("ofm_user", JSON.stringify(demoRecord.user));
      setUser(demoRecord.user);
      return true;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, formattedEmail, password);
      const firebaseUser = userCredential.user;
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      let activeUser: User;

      if (userDoc.exists()) {
        activeUser = { id: firebaseUser.uid, ...userDoc.data() } as User;
      } else {
        const q = query(collection(db, "users"), where("email", "==", formattedEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          activeUser = { id: firebaseUser.uid, ...snap.docs[0].data() } as User;
        } else {
          activeUser = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || formattedEmail.split("@")[0],
            email: formattedEmail,
            role: role || "admin",
            organization: "My Organization",
            organizationId: `org_${firebaseUser.uid.slice(0, 8)}`,
          };
        }
        await setDoc(doc(db, "users", firebaseUser.uid), activeUser, { merge: true });
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

      // 1. Check if there is an active invite for this email in Firestore
      try {
        const inviteDoc = await getDoc(doc(db, "invitations", normalizedEmail));
        if (inviteDoc.exists()) {
          const inviteData = inviteDoc.data() as any;
          if (inviteData.organization) organization = inviteData.organization;
          if (inviteData.organizationId) organizationId = inviteData.organizationId;
          if (inviteData.role) assignedRole = inviteData.role;
        }
      } catch (e) {
        console.log("Check invite error:", e);
      }

      // 2. If creating as Admin
      if (role === "admin") {
        organization = orgNameOrInvite.trim() || "My Organization";
        organizationId = "org-" + Math.random().toString(36).substring(2, 11);
      } else if (organizationId === "default-org") {
        // If not found in invitations, validate the Admin email / Invite Code entered by user
        const adminEmail = orgNameOrInvite.trim().toLowerCase();
        if (!adminEmail) {
          return { success: false, error: "Please enter an Admin's Email as your invite code." };
        }

        // Check demo admin users first (so demo invite codes work seamlessly)
        const demoAdminEntry = Object.values(DEMO_USERS).find(
          (entry) => entry.user.email.toLowerCase() === adminEmail && entry.user.role === "admin"
        );

        if (demoAdminEntry) {
          organization = demoAdminEntry.user.organization;
          organizationId = demoAdminEntry.user.organizationId;
        } else {
          const q = query(collection(db, "users"), where("email", "==", adminEmail), where("role", "==", "admin"));
          const querySnapshot = await getDocs(q);

          if (querySnapshot.empty) {
            return { success: false, error: "Invalid invite code. No Admin found with this email." };
          }

          const adminData = querySnapshot.docs[0].data() as User;
          organization = adminData.organization || "My Organization";
          organizationId = adminData.organizationId || "default-org";
        }
      }

      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const firebaseUser = userCredential.user;

      await updateProfile(firebaseUser, { displayName: name });

      const newUser: User = {
        id: firebaseUser.uid,
        name,
        email: normalizedEmail,
        role: assignedRole,
        organization,
        organizationId,
      };

      if (assignedRole === "admin") {
        await setDoc(doc(db, "organizations", organizationId), {
          id: organizationId,
          name: organization,
          adminId: firebaseUser.uid,
          createdAt: Timestamp.now(),
        });
      }

      await setDoc(doc(db, "users", firebaseUser.uid), {
        ...newUser,
        createdAt: Timestamp.now(),
        status: "active",
      });

      // Mark invite as accepted if existed
      try {
        await setDoc(doc(db, "invitations", normalizedEmail), { status: "accepted", acceptedAt: Timestamp.now() }, { merge: true });
      } catch {}

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

  const loginWithGoogle = async (role: UserRole): Promise<boolean> => {
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

  const loginWithGoogleCredential = async (idToken: string, accessToken: string, role: UserRole): Promise<boolean> => {
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
    if (typeof window !== "undefined") {
      try {
        sessionStorage.clear();
      } catch (e) {}
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        loginWithGoogle,
        loginWithGoogleCredential,
        signUp,
        forgotPassword,
        logout,
        hasPermission: (perm) => hasPermission(user?.role, perm),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
