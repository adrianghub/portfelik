import { logger } from "@/lib/logger";
import { notificationService } from "@/modules/shared/notifications/NotificationService";
import { doc, getDoc } from "firebase/firestore";
import { deleteToken, getToken, onMessage } from "firebase/messaging";
import { db, messaging } from "./firebase/firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

if (!VAPID_KEY) {
  logger.warn(
    "Service Worker",
    "VAPID key is not set. Push notifications may not work.",
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
    logger.warn("Service Worker", "Requires HTTPS or localhost");
    return null;
  }

  if (!("serviceWorker" in navigator)) {
    logger.warn("Service Worker", "Not supported in this browser");
    return null;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
      logger.info("Service Worker", "Unregistered existing service worker");
    }

    // Register the new service worker
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    logger.info(
      "Service Worker",
      `Registered with scope: ${registration.scope}`,
    );

    // Handle service worker updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          logger.info("Service Worker", "New version available");
          // You can show a notification to the user here
        }
      });
    });

    return registration;
  } catch (error) {
    logger.error("Service Worker", "Registration failed:", error);
    if (error instanceof Error) {
      logger.error("Service Worker", "Error details:", {
        message: error.message,
        stack: error.stack,
      });
    }
    return null;
  }
}

/**
 * Gets the FCM token for push notifications
 */
export async function getFCMToken(): Promise<string | null> {
  if (!VAPID_KEY) {
    logger.warn("Notifications", "VAPID key missing. Cannot get FCM token.");
    return null;
  }

  if (!isSecureContext()) {
    logger.warn("Notifications", "Requires HTTPS or localhost");
    return null;
  }

  try {
    const registration = await registerServiceWorker();
    if (!registration) throw new Error("Service worker registration failed");

    try {
      // First try to get a token
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (token) {
        logger.info("Notifications", "FCM Token received:", token);
        await notificationService.saveFCMToken(token);
        return token;
      }
    } catch (tokenError) {
      // If getting token fails, try deleting and regenerating
      logger.warn(
        "Notifications",
        "Error getting token, trying to refresh:",
        tokenError,
      );

      try {
        await deleteToken(messaging);
        logger.info("Notifications", "Old token deleted, getting new token...");

        const newToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (newToken) {
          logger.info("Notifications", "New FCM Token received:", newToken);
          await notificationService.saveFCMToken(newToken);
          return newToken;
        }
      } catch (refreshError) {
        logger.error("Notifications", "Failed to refresh token:", refreshError);
        return null;
      }
    }

    logger.warn("Notifications", "No FCM token available");
    return null;
  } catch (error) {
    logger.error("Notifications", "Error getting FCM token:", error);
    return null;
  }
}

/**
 * Requests permission for push notifications
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isSecureContext()) {
    logger.warn("Notifications", "Requires HTTPS or localhost");
    return false;
  }

  if (!("Notification" in window)) {
    logger.warn("Notifications", "Not supported in this browser");
    return false;
  }

  if (Notification.permission === "granted") {
    logger.info("Notifications", "Already enabled");
    return true;
  }

  try {
    const permission = await Notification.requestPermission();
    logger.info("Notifications", `Permission status: ${permission}`);

    handlePermissionChange(permission);

    return permission === "granted";
  } catch (error) {
    logger.error("Notifications", "Error requesting permission:", error);
    return false;
  }
}

/**
 * Handles changes in notification permission status
 */
async function handlePermissionChange(
  permission: NotificationPermission | "prompt",
) {
  if (permission === "prompt" || permission === "denied") {
    logger.warn("Notifications", "Permission denied. Removing FCM token...");
    await notificationService.removeFCMToken();
  } else if (permission === "granted") {
    logger.info("Notifications", "Permission granted. Getting FCM token...");
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
    logger.warn("Notifications", `Not supported: ${support.reason}`);
    return false;
  }

  if (support.permission === "denied") {
    logger.warn("Notifications", "Blocked by user. Removing FCM token...");
    await notificationService.removeFCMToken();
    return false;
  }

  if (support.permission === "default") {
    logger.info("Notifications", "Asking user for permission...");
    const granted = await requestNotificationPermission();
    return granted;
  }

  return true;
}

/**
 * Type definition for notification payload
 */
interface NotificationPayload {
  notification?: {
    title?: string;
    body?: string;
  };
  data?: Record<string, string>;
}

/**
 * Shows a notification using the service worker
 */
export function showNotification(payload: NotificationPayload) {
  if (!("serviceWorker" in navigator)) {
    logger.warn("Notifications", "Service workers not supported");
    return;
  }

  navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage({
        type: "SHOW_NOTIFICATION",
        payload,
      });
    })
    .catch((error) => {
      logger.error("Notifications", "Error showing notification:", error);
    });
}

/**
 * Sets up foreground message handling
 */
export function setupMessageHandling() {
  logger.info("Notifications", "Setting up message handling...");

  onMessage(messaging, (payload) => {
    logger.info("Notifications", "Received foreground message:", payload);

    // Use service worker to show the notification
    showNotification(payload);
  });
}

/**
 * Initializes notifications: checks status, gets FCM token, and sets up listeners
 */
export async function initializeNotifications(
  userId?: string,
): Promise<string | null> {
  logger.info("Notifications", "Initializing...");

  // If user ID is provided, check if notifications are already enabled
  if (userId) {
    const hasExistingSettings = await checkExistingNotificationSettings(userId);

    if (hasExistingSettings) {
      logger.info(
        "Notifications",
        "User already has notifications enabled, setting up",
      );

      // Register service worker and set up message handling without asking for new permission
      const registration = await registerServiceWorker();
      if (!registration) {
        logger.error("Notifications", "Service worker registration failed");
        return null;
      }

      try {
        // Get token using existing permission
        const token = await getFCMToken();
        if (token) {
          logger.info(
            "Notifications",
            "Successfully initialized with existing token",
          );
          setupMessageHandling();
          return token;
        }
      } catch (error) {
        logger.error(
          "Notifications",
          "Error initializing with existing settings:",
          error,
        );
      }
    }
  }

  // Continue with normal flow if no existing settings or failed to initialize with existing settings
  const notificationEnabled = await checkNotificationStatus();
  if (!notificationEnabled) {
    logger.warn("Notifications", "Not enabled. Removing FCM token...");
    await notificationService.removeFCMToken();
    return null;
  }

  // Register service worker first
  const registration = await registerServiceWorker();
  if (!registration) {
    logger.error("Notifications", "Service worker registration failed");
    return null;
  }

  logger.info(
    "Notifications",
    "Service worker registered, getting FCM token...",
  );

  try {
    // Get FCM token
    const token = await getFCMToken();
    if (!token) {
      logger.warn("Notifications", "Failed to get FCM token");
      return null;
    }

    logger.info("Notifications", "Successfully initialized with token:", token);

    // Set up message handling for foreground messages
    setupMessageHandling();

    return token;
  } catch (error) {
    logger.error("Notifications", "Initialization error:", error);
    return null;
  }
}

/**
 * Checks if the user has previously enabled notifications and has a valid FCM token
 */
export async function checkExistingNotificationSettings(
  userId: string,
): Promise<boolean> {
  if (!userId) {
    logger.info(
      "Notifications",
      "No user ID provided, can't check existing settings",
    );
    return false;
  }

  try {
    logger.info(
      "Notifications",
      `Checking existing notification settings for user: ${userId}`,
    );
    const userDoc = await getDoc(doc(db, "users", userId));

    if (!userDoc.exists()) {
      logger.info("Notifications", "User document not found");
      return false;
    }

    const userData = userDoc.data();
    const notificationsEnabled =
      userData?.settings?.notificationsEnabled === true;
    const hasFcmTokens = !!userData?.fcmTokens?.length;

    logger.info("Notifications", "User settings:", {
      notificationsEnabled,
      fcmTokens: userData?.fcmTokens?.length
        ? `${userData.fcmTokens[0].substring(0, 10)}...`
        : null,
      lastTokenUpdate: userData?.lastTokenUpdate,
    });

    return notificationsEnabled && hasFcmTokens;
  } catch (error) {
    logger.error("Notifications", "Error checking existing settings:", error);
    return false;
  }
}

// Watch for permission changes and remove FCM token when necessary
navigator.permissions
  ?.query({ name: "notifications" })
  .then((permissionStatus) => {
    permissionStatus.onchange = () => {
      logger.info(
        "Notifications",
        `Permission changed: ${permissionStatus.state}`,
      );
      handlePermissionChange(permissionStatus.state as NotificationPermission);
    };
  });
