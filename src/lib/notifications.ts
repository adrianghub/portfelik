import { getAuth, User } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase/firebase";
import { logger } from "./logger";

/**
 * Gets the current authenticated user
 */
function getCurrentUser(): User | null {
  return getAuth().currentUser;
}

/**
 * Returns a Firestore reference to the user's document
 */
function getUserRef(user: User) {
  return doc(db, "users", user.uid);
}

/**
 * Saves the FCM token to the user's document in Firestore
 */
export async function saveFCMToken(token: string): Promise<void> {
  try {
    const user = getCurrentUser();
    if (!user) {
      logger.warn("Notifications", "No user logged in, cannot save FCM token.");
      return;
    }

    await setDoc(
      getUserRef(user),
      {
        fcmToken: token,
        lastTokenUpdate: new Date().toISOString(),
        settings: { notificationsEnabled: true },
      },
      { merge: true },
    );

    logger.info("Notifications", "FCM token saved and notifications enabled.");
  } catch (error) {
    logger.error("Notifications", "Error saving FCM token:", error);
    throw error;
  }
}

/**
 * Removes the FCM token from the user's document in Firestore
 */
export async function removeFCMToken(): Promise<void> {
  try {
    const user = getCurrentUser();
    if (!user) {
      logger.warn(
        "Notifications",
        "No user logged in, cannot remove FCM token.",
      );
      return;
    }

    await setDoc(
      getUserRef(user),
      {
        fcmToken: null,
        lastTokenUpdate: new Date().toISOString(),
        settings: { notificationsEnabled: false },
      },
      { merge: true },
    );

    logger.info(
      "Notifications",
      "FCM token removed and notifications disabled.",
    );
  } catch (error) {
    logger.error("Notifications", "Error removing FCM token:", error);
    throw error;
  }
}

/**
 * Checks if the current browser supports push notifications and service workers
 */
export function checkPushSupport() {
  const missingFeature = !("serviceWorker" in navigator)
    ? "Service Worker"
    : !("PushManager" in window)
      ? "Push API"
      : !("Notification" in window)
        ? "Notifications"
        : null;

  return {
    supported: !missingFeature,
    reason: missingFeature ? `${missingFeature} not supported` : null,
  };
}
