import { logger } from "@/lib/logger";
import { notificationService } from "@/modules/shared/notifications/NotificationService";
import { doc, getDoc } from "firebase/firestore";
import { deleteToken, getToken, onMessage } from "firebase/messaging";
import { db, messaging } from "./firebase/firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// Prevents multiple simultaneous token generation operations
let isGettingToken = false;
// Store the last generated token to prevent duplicates
let lastGeneratedToken = "";

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
    // First check if we already have an active service worker
    const existingRegistration =
      await navigator.serviceWorker.getRegistration();
    if (existingRegistration && existingRegistration.active) {
      return existingRegistration;
    }

    // Only unregister/re-register if needed
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length > 0) {
      // Check if any are out of date or in a bad state before unregistering
      const needsUpdate = registrations.some(
        (reg) =>
          !reg.active ||
          reg.scope !== window.location.origin + "/" ||
          reg.updateViaCache !== "none",
      );

      if (needsUpdate) {
        for (const registration of registrations) {
          await registration.unregister();
        }
      } else {
        // Use the first valid registration
        return registrations[0];
      }
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

  // First check for existing token
  try {
    // If we have a token in memory, verify it before returning
    if (lastGeneratedToken) {
      // Try to get current token to compare
      const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });

      // If tokens match, reuse it
      if (currentToken && currentToken === lastGeneratedToken) {
        logger.info("Notifications", "Using verified token from memory");
        return lastGeneratedToken;
      }

      // If we get a different token but it's valid, update our reference
      if (currentToken && currentToken !== lastGeneratedToken) {
        logger.info("Notifications", "Updating to new valid token");
        lastGeneratedToken = currentToken;
        await notificationService.saveFCMToken(currentToken);
        return currentToken;
      }

      // If we couldn't get a current token, the saved one might be invalid
      logger.info(
        "Notifications",
        "Stored token potentially invalid, regenerating",
      );
    }
  } catch (verifyError) {
    logger.warn(
      "Notifications",
      "Error verifying existing token:",
      verifyError,
    );
    // Continue to token generation
  }

  // Prevent multiple simultaneous token requests
  if (isGettingToken) {
    logger.info(
      "Notifications",
      "Token request already in progress, waiting...",
    );

    // Wait for the current operation to complete
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!isGettingToken && lastGeneratedToken) {
        logger.info("Notifications", "Using already generated token");
        return lastGeneratedToken;
      }
    }

    logger.warn("Notifications", "Timed out waiting for token generation");
    return null;
  }

  isGettingToken = true;

  try {
    // Step 1: Make sure we have the Firebase Messaging service worker
    let messagingRegistration: ServiceWorkerRegistration | undefined;

    try {
      // Try to register the dedicated Firebase Messaging service worker
      messagingRegistration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
        { scope: "firebase-cloud-messaging-push-scope" },
      );
      logger.info(
        "Notifications",
        "Firebase Messaging service worker registered",
      );
    } catch (messagingSwError) {
      logger.warn(
        "Notifications",
        "Could not register Firebase Messaging service worker:",
        messagingSwError,
      );
      // Will fall back to the main service worker
    }

    // Step 2: Register the main app service worker if needed
    let mainRegistration: ServiceWorkerRegistration | null | undefined = null;

    try {
      // Get existing registration for the main service worker
      mainRegistration = await navigator.serviceWorker.getRegistration("/");

      if (!mainRegistration) {
        mainRegistration = await registerServiceWorker();
        logger.info("Notifications", "Registered main service worker");
      } else {
        logger.info("Notifications", "Using existing main service worker");
      }
    } catch (mainSwError) {
      logger.error(
        "Notifications",
        "Error with main service worker:",
        mainSwError,
      );
    }

    // If both registrations failed, we can't continue
    if (!messagingRegistration && !mainRegistration) {
      logger.error("Notifications", "All service worker registrations failed");
      isGettingToken = false;
      return null;
    }

    // Determine which registration to use for the token
    // Prefer Firebase Messaging service worker, fall back to main service worker
    const registration = messagingRegistration || mainRegistration;

    if (!registration) {
      logger.error("Notifications", "No service worker available for FCM");
      isGettingToken = false;
      return null;
    }

    // Make sure the selected service worker is ready
    if (registration.installing) {
      logger.info("Notifications", "Waiting for service worker activation");
      await new Promise<void>((resolve) => {
        const worker = registration.installing;
        if (!worker) {
          resolve();
          return;
        }

        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") {
            resolve();
          }
        });

        // If already activated, resolve immediately
        if (worker.state === "activated") {
          resolve();
        }
      });
    }

    // Set up message handling
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "NOTIFICATION_RECEIVED") {
        logger.info(
          "Received notification from service worker:",
          event.data.payload,
        );
      }
    });

    try {
      // Now get the FCM token using the selected service worker
      const tokenOptions = {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      };

      const token = await getToken(messaging, tokenOptions);

      if (token) {
        logger.info("Notifications", "FCM Token received");
        lastGeneratedToken = token;
        await notificationService.saveFCMToken(token);
        isGettingToken = false;
        return token;
      }
    } catch (tokenError) {
      // Handle specific errors differently
      logger.warn(
        "Notifications",
        "Error getting token, trying to refresh:",
        tokenError,
      );

      try {
        // Only delete token if we get a specific type of error
        if (
          tokenError instanceof Error &&
          (tokenError.message.includes("token") ||
            tokenError.message.includes("messaging"))
        ) {
          await deleteToken(messaging);
          logger.info(
            "Notifications",
            "Old token deleted, getting new token...",
          );
        }

        // Use the selected service worker for the new token request
        const newToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (newToken) {
          logger.info("Notifications", "New FCM Token received");
          lastGeneratedToken = newToken;
          await notificationService.saveFCMToken(newToken);
          isGettingToken = false;
          return newToken;
        }
      } catch (refreshError) {
        logger.error("Notifications", "Failed to refresh token:", refreshError);
        isGettingToken = false;
        return null;
      }
    }

    logger.warn("Notifications", "No FCM token available");
    isGettingToken = false;
    return null;
  } catch (error) {
    logger.error("Notifications", "Error getting FCM token:", error);
    isGettingToken = false;
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
    logger.warn(
      "Notifications",
      "Permission denied. Removing current device FCM token...",
    );
    // Only remove the current device's token, not all tokens
    await notificationService.removeCurrentFCMToken();
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
    logger.warn(
      "Notifications",
      "Blocked by user. Removing current device FCM token...",
    );
    await notificationService.removeCurrentFCMToken();
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

  // Check if we already have a token in memory
  if (lastGeneratedToken) {
    logger.info("Notifications", "Using existing token from memory");
    return lastGeneratedToken;
  }

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
    logger.warn(
      "Notifications",
      "Not enabled. Removing current device FCM token...",
    );
    await notificationService.removeCurrentFCMToken();
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
