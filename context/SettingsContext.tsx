import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "./AuthContext";
import { enqueueOperation } from "@/services/offlineSyncService";

import {
  AppTheme,
  Settings,
  getCleanDefaultSettings,
} from "../services/settingsHelper";
export { AppTheme, Settings, getCleanDefaultSettings };

const DEFAULT_SETTINGS: Settings = getCleanDefaultSettings();

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  addCustomCategory: (type: "income" | "expense", category: string) => Promise<void>;
  deleteCustomCategory: (type: "income" | "expense", category: string) => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  addCustomCategory: async () => {},
  deleteCustomCategory: async () => {},
  isLoading: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUserOrganization } = useAuth();
  const orgKey = user?.organizationId || "default";
  const settingsStorageKey = `ofm_settings:${orgKey}`;
  const durableSettingsKey = `ofm_data:${orgKey}:settings`;
  const baseDefaults = useMemo(() => {
    if (user?.organizationId === "org-9icgv4ijp" || user?.email === "engrahmedaqeel14@gmail.com") {
      return {
        ...getCleanDefaultSettings("DevOrbit Tech Kotli"),
        organizationAddress: "Kotli, Azad Kashmir",
        organizationPhone: "+92-586-444111",
      };
    }
    return getCleanDefaultSettings(user?.organization);
  }, [user?.organization, user?.organizationId, user?.email]);

  const [settings, setSettings] = useState<Settings>(baseDefaults);
  const [isLoading, setIsLoading] = useState(true);

  // Load from AsyncStorage scoped to active organization on mount or org switch
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(durableSettingsKey),
      AsyncStorage.getItem(settingsStorageKey),
    ]).then(([durableData, legacyData]) => {
      const data = durableData || legacyData;
      if (data) {
        try {
          setSettings({ ...baseDefaults, ...JSON.parse(data) });
        } catch (e) {
          setSettings(baseDefaults);
        }
      } else {
        setSettings(baseDefaults);
      }
      setIsLoading(false);
    });
  }, [settingsStorageKey, durableSettingsKey, baseDefaults]);

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
            const merged = { ...baseDefaults, ...prev, ...firebaseSettings };
            if (firebaseSettings.organizationLogo === "" || firebaseSettings.organizationLogo === undefined) {
              merged.organizationLogo = firebaseSettings.organizationLogo ?? "";
            }
            AsyncStorage.setItem(settingsStorageKey, JSON.stringify(merged));
            AsyncStorage.setItem(durableSettingsKey, JSON.stringify(merged));
            return merged;
          });

          // Sync organization name with user auth profile if updated remotely
          if (
            firebaseSettings.organizationName &&
            firebaseSettings.organizationName !== user.organization &&
            updateUserOrganization
          ) {
            updateUserOrganization(firebaseSettings.organizationName).catch(() => {});
          }
        }
      },
      (err) => {
        if (err.code !== "permission-denied") {
          console.log("Settings live sync notice:", err.message);
        }
      }
    );

    return () => unsub();
  }, [user?.id, user?.organizationId, user?.organization, baseDefaults, settingsStorageKey, durableSettingsKey]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    let nextSettings: Settings = baseDefaults;
    setSettings((prev) => {
      nextSettings = { ...prev, ...patch };
      AsyncStorage.setItem(settingsStorageKey, JSON.stringify(nextSettings)).catch(() => {});
      AsyncStorage.setItem(durableSettingsKey, JSON.stringify(nextSettings)).catch(() => {});
      return nextSettings;
    });

    const docId = user?.organizationId || (user?.organization ? user.organization.replace(/\s+/g, "_") : "default_org");
    
    await enqueueOperation({
      entityType: "setting",
      entityId: docId,
      operationType: "UPDATE",
      organizationId: user?.organizationId || "demo-org",
      userId: user?.id || "anonymous",
      payload: nextSettings,
    }).catch(() => {});

    try {
      await setDoc(doc(db, "orgSettings", docId), nextSettings, { merge: true });
    } catch (err) {
      console.log("Settings cloud write notice (saved offline):", err);
    }

    if (patch.organizationName && updateUserOrganization) {
      updateUserOrganization(patch.organizationName).catch(() => {});
    }
  }, [user?.organizationId, user?.organization, updateUserOrganization, baseDefaults, settingsStorageKey, durableSettingsKey]);

  const addCustomCategory = useCallback(async (type: "income" | "expense", category: string) => {
    const cleanCat = category.trim();
    if (!cleanCat) return;

    const key = type === "income" ? "customIncomeCategories" : "customExpenseCategories";
    const currentList = settings[key] || [];
    if (currentList.includes(cleanCat)) return;

    const updatedList = [...currentList, cleanCat];
    await updateSettings({ [key]: updatedList });
  }, [settings, updateSettings]);

  const deleteCustomCategory = useCallback(async (type: "income" | "expense", category: string) => {
    const cleanCat = category.trim().toLowerCase();
    if (!cleanCat) return;

    const key = type === "income" ? "customIncomeCategories" : "customExpenseCategories";
    const currentList = settings[key] || [];
    const updatedList = currentList.filter((c) => c.trim().toLowerCase() !== cleanCat);
    await updateSettings({ [key]: updatedList });
  }, [settings, updateSettings]);

  const value = useMemo(
    () => ({ settings, updateSettings, addCustomCategory, deleteCustomCategory, isLoading }),
    [settings, updateSettings, addCustomCategory, deleteCustomCategory, isLoading]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
