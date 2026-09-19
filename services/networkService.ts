/**
 * services/networkService.ts
 *
 * Universal Network Connectivity Service for OFM.
 * Reliably tracks connectivity status across Web, iOS, and Android
 * without requiring native binary dependencies.
 */

import { Platform } from "react-native";

export type NetworkStatus = "online" | "offline" | "reconnecting";

type NetworkListener = (status: NetworkStatus) => void;

class NetworkService {
  private currentStatus: NetworkStatus = "online";
  private listeners = new Set<NetworkListener>();
  private checkInterval: any = null;
  private isChecking = false;

  constructor() {
    this.init();
  }

  private init() {
    // Initial check
    if (Platform.OS === "web" && typeof navigator !== "undefined") {
      this.currentStatus = navigator.onLine ? "online" : "offline";

      if (typeof window !== "undefined") {
        window.addEventListener("online", () => {
          this.setStatus("online");
          this.verifyConnectivity();
        });

        window.addEventListener("offline", () => {
          this.setStatus("offline");
        });
      }
    } else {
      // Native initial guess
      this.currentStatus = "online";
    }

    // Periodic connectivity verification (runs every 15s to catch silent drops or restores)
    this.startPeriodicCheck();
  }

  private setStatus(newStatus: NetworkStatus) {
    if (this.currentStatus !== newStatus) {
      this.currentStatus = newStatus;
      this.listeners.forEach((listener) => {
        try {
          listener(newStatus);
        } catch (e) {
          console.warn("Error in network status listener:", e);
        }
      });
    }
  }

  /**
   * Fast probe to verify if Firebase / internet is actually reachable
   */
  public async verifyConnectivity(): Promise<boolean> {
    if (this.isChecking) return this.currentStatus === "online";
    this.isChecking = true;

    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && !navigator.onLine) {
        this.setStatus("offline");
        this.isChecking = false;
        return false;
      }

      // Fast HEAD request with 2.5s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      // Probe Firebase firestore endpoint
      const response = await fetch("https://firestore.googleapis.com", {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      const isReachable = response !== null;
      this.setStatus(isReachable ? "online" : "offline");
      this.isChecking = false;
      return isReachable;
    } catch {
      this.setStatus("offline");
      this.isChecking = false;
      return false;
    }
  }

  /**
   * Mark network as offline immediately when a fetch or Firestore call fails with a network error
   */
  public reportNetworkFailure() {
    if (this.currentStatus !== "offline") {
      this.setStatus("offline");
      // Schedule verification in 3s
      setTimeout(() => this.verifyConnectivity(), 3000);
    }
  }

  /**
   * Mark network as online immediately when any successful network call completes
   */
  public reportNetworkSuccess() {
    if (this.currentStatus !== "online") {
      this.setStatus("online");
    }
  }

  public isOnline(): boolean {
    return this.currentStatus === "online";
  }

  public getStatus(): NetworkStatus {
    return this.currentStatus;
  }

  public subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    // Immediately notify caller with current status
    listener(this.currentStatus);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private startPeriodicCheck() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      this.verifyConnectivity().catch(() => {});
    }, 15000);
  }

  public destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.listeners.clear();
  }
}

export const networkService = new NetworkService();
