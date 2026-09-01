import { initializeApp, getApps, getApp } from "firebase/app";
// @ts-expect-error - getReactNativePersistence is native-only but available at runtime in React Native
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDPpbHAUApFuyq-u1L891fvl95C5mHeSKY",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "ofmapp-main.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "ofmapp-main",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "ofmapp-main.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "940511583527",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:940511583527:web:7aa8d59fc3e2a8939c1d02",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth: Web uses getAuth, Native uses AsyncStorage persistence
export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : (() => {
        try {
          return initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage),
          });
        } catch (e: any) {
          // If already initialized (hot reload), get existing instance
          if (e.code === "auth/already-initialized") return getAuth(app);
          throw e;
        }
      })();

// Firestore: Web = persistent cache, Native = memory cache (IndexedDB not available on Android)
export const db = (() => {
  try {
    return initializeFirestore(app, {
      localCache:
        Platform.OS === "web"
          ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
          : memoryLocalCache(),
    });
  } catch (e: any) {
    // Already initialized (hot reload) — return existing instance
    return getFirestore(app);
  }
})();

import { getFunctions, httpsCallable } from "firebase/functions";

export const functions = getFunctions(app);
export { httpsCallable };
export { app };
