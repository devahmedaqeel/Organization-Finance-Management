import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "./AuthContext";

export type AppTheme = "system" | "light" | "dark";

interface Settings {
  organizationName: string;
  organizationAddress: string;
  organizationEmail: string;
  organizationPhone: string;
  currency: string;
  fiscalYear: string;
  organizationLogo?: string;
  emailAutomatedEnabled?: boolean;
  emailjsServiceId?: string;
  emailjsTemplateId?: string;
  emailjsPublicKey?: string;
  theme?: AppTheme;
}

const DEFAULT_SETTINGS: Settings = {
  organizationName: "DevOrbit Tech Kotli",
  organizationAddress: "Kotli, Azad Kashmir",
  organizationEmail: "",
  organizationPhone: "+92-586-444111",
  currency: "PKR",
  fiscalYear: "2025-2026",
  organizationLogo: "",
  emailAutomatedEnabled: false,
  emailjsServiceId: "",
  emailjsTemplateId: "",
  emailjsPublicKey: "",
  theme: "system",
};

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  isLoading: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Load from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem("ofm_settings").then((data) => {
      if (data) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(data) });
      setIsLoading(false);
    });
  }, []);

  // Real-time 2-way sync across Web and Mobile via Firestore
  useEffect(() => {
    if (!user) return;

    const docId = user.organizationId || (user.organization ? user.organization.replace(/\s+/g, "_") : "default_org");
    const unsub = onSnapshot(
      doc(db, "orgSettings", docId),
      (snap) => {
        if (snap.exists()) {
          const firebaseSettings = snap.data() as Partial<Settings>;
          setSettings((prev) => {
            const merged = { ...DEFAULT_SETTINGS, ...prev, ...firebaseSettings };
            if (firebaseSettings.organizationLogo === "" || firebaseSettings.organizationLogo === undefined) {
              merged.organizationLogo = firebaseSettings.organizationLogo ?? "";
            }
            AsyncStorage.setItem("ofm_settings", JSON.stringify(merged));
            return merged;
          });
        }
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Settings live sync notice:", err.message);
        }
      }
    );

    return () => unsub();
  }, [user]);

  const updateSettings = async (patch: Partial<Settings>) => {
    let nextSettings: Settings = DEFAULT_SETTINGS;
    setSettings((prev) => {
      nextSettings = { ...prev, ...patch };
      AsyncStorage.setItem("ofm_settings", JSON.stringify(nextSettings));
      return nextSettings;
    });

    const docId = user?.organizationId || (user?.organization ? user.organization.replace(/\s+/g, "_") : "default_org");
    try {
      await setDoc(doc(db, "orgSettings", docId), nextSettings, { merge: true });
    } catch (err) {
      console.log("Settings cloud write notice (saved offline):", err);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
