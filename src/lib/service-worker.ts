import { notificationService } from "@/modules/shared/notifications/NotificationService";
import { getToken, onMessage } from "firebase/messaging";
import { messaging } from "./firebase/firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

if (!VAPID_KEY) {
  console.warn(
    "[Service Worker] VAPID key is not set. Push notifications may not work.",
  );
}

/**
 * Checks if the current context is secure (HTTPS or localhost)
 */
function isSecureContext(): boolean {
  return (
    window.isSecureContext ||
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost"
  );
}

/**
 * Registers the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isSecureContext()) {
    console.warn("[Service Worker] Requires HTTPS or localhost");
    return null;
  }

  if (!("serviceWorker" in navigator)) {
    console.warn("[Service Worker] Not supported in this browser");
    return null;
  }

  try {
    const existingRegistration =
      await navigator.serviceWorker.getRegistration();
    if (existingRegistration) {
      console.log("[Service Worker] Already registered:", existingRegistration);
      return existingRegistration;
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    console.log("[Service Worker] Registered with scope:", registration.scope);
    return registration;
  } catch (error) {
    console.error("[Service Worker] Registration failed:", error);
    return null;
  }
}

/**
 * Gets the FCM token for push notifications
 */
export async function getFCMToken(): Promise<string | null> {
  if (!VAPID_KEY) {
    console.warn("[Notifications] VAPID key missing. Cannot get FCM token.");
    return null;
  }

  if (!isSecureContext()) {
    console.warn("[Notifications] Requires HTTPS or localhost");
    return null;
  }

  try {
    const registration = await registerServiceWorker();
    if (!registration) throw new Error("Service worker registration failed");

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log("[Notifications] FCM Token received:", token);
      await notificationService.saveFCMToken(token);
      return token;
    }

    console.warn("[Notifications] No FCM token available");
    return null;
  } catch (error) {
    console.error("[Notifications] Error getting FCM token:", error);
    return null;
  }
}

/**
 * Requests permission for push notifications
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isSecureContext()) {
    console.warn("[Notifications] Requires HTTPS or localhost");
    return false;
  }

  if (!("Notification" in window)) {
    console.warn("[Notifications] Not supported in this browser");
    return false;
  }

  if (Notification.permission === "granted") {
    console.log("[Notifications] Already enabled");
    return true;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log("[Notifications] Permission status:", permission);

    handlePermissionChange(permission);

    return permission === "granted";
  } catch (error) {
    console.error("[Notifications] Error requesting permission:", error);
    return false;
  }
}

/**
 * Handles changes in notification permission status
 */
async function handlePermissionChange(permission: NotificationPermission) {
  if (permission === "denied") {
    console.warn("[Notifications] Permission denied. Removing FCM token...");
    await notificationService.removeFCMToken();
  } else if (permission === "granted") {
    console.log("[Notifications] Permission granted. Getting FCM token...");
    await getFCMToken();
  }
}

/**
 * Checks if notifications are supported and their current status
 */
export function checkNotificationSupport() {
  return notificationService.checkPushSupport();
}

/**
 * Checks and updates notification status
 */
export async function checkNotificationStatus(): Promise<boolean> {
  const support = checkNotificationSupport();
  if (!support.supported) {
    console.warn("[Notifications] Not supported:", support.reason);
    return false;
  }

  if (support.permission === "denied") {
    console.warn("[Notifications] Blocked by user. Removing FCM token...");
    await notificationService.removeFCMToken();
    return false;
  }

  if (support.permission === "default") {
    console.log("[Notifications] Asking user for permission...");
    const granted = await requestNotificationPermission();
    return granted;
  }

  return true;
}

/**
 * Sets up foreground message handling
 */
export function setupMessageHandling() {
  console.log("[Notifications] Setting up message handling...");

  onMessage(messaging, (payload) => {
    console.log("[Notifications] Received foreground message:", payload);

    const notificationTitle =
      payload.notification?.title || "Portfelik Notification";
    const notificationOptions = {
      body: payload.notification?.body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      vibrate: [100, 50, 100],
      data: payload.data || {},
      actions: [
        { action: "explore", title: "View Details", icon: "/icon-192x192.png" },
        { action: "close", title: "Close", icon: "/icon-192x192.png" },
      ],
    };

    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(notificationTitle, notificationOptions);
      });
    }
  });
}

/**
 * Initializes notifications: checks status, gets FCM token, and sets up listeners
 */
export async function initializeNotifications() {
  const notificationEnabled = await checkNotificationStatus();
  if (!notificationEnabled) {
    console.warn("[Notifications] Not enabled. Removing FCM token...");
    await notificationService.removeFCMToken();
    return null;
  }

  const token = await getFCMToken();
  if (token) {
    setupMessageHandling();
  }

  return token;
}

// Watch for permission changes and remove FCM token when necessary
navigator.permissions
  ?.query({ name: "notifications" })
  .then((permissionStatus) => {
    permissionStatus.onchange = () => {
      console.log(
        "[Notifications] Permission changed:",
        permissionStatus.state,
      );
      handlePermissionChange(permissionStatus.state as NotificationPermission);
    };
  });
