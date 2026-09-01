import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Configure notifications behavior when app is in the foreground (only in custom development builds / standalone)
if (Platform.OS !== "web" && !isExpoGo) {
  try {
    const Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Ignored in unsupported environments
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web" || isExpoGo) return false;
  try {
    const Notifications = require("expo-notifications");
    const existing = (await Notifications.getPermissionsAsync()) as any;
    let granted = existing?.granted || existing?.status === "granted";
    if (!granted) {
      const requested = (await Notifications.requestPermissionsAsync()) as any;
      granted = requested?.granted || requested?.status === "granted";
    }
    return Boolean(granted);
  } catch {
    return false;
  }
}

export async function triggerLocalNotification(title: string, body: string) {
  if (Platform.OS === "web" || isExpoGo) return;
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    const Notifications = require("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: null, // trigger immediately
    });
  } catch {
    // In-app floating toast handles foreground notifications
  }
}

