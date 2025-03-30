import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { initializeNotifications } from "@/lib/service-worker";
import { ReactNode, useEffect } from "react";
import { useSaveFCMToken } from "./hooks/useNotificationsQuery";
import { notificationService } from "./NotificationService";

// Cleanup FCM tokens once per week
const TOKEN_CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const TOKEN_CLEANUP_STORAGE_KEY = "lastFcmTokenCleanup";

// Check for notification setup - once per day
const NOTIFICATION_INIT_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const NOTIFICATION_INIT_STORAGE_KEY = "lastNotificationInit";

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { userData } = useAuth();
  const saveFCMToken = useSaveFCMToken();

  useEffect(() => {
    // Only initialize notifications for logged in users
    if (!userData?.uid) return;

    const setupNotifications = async () => {
      try {
        // Check if notifications were initialized recently
        const now = Date.now();
        const lastInit = Number(
          localStorage.getItem(NOTIFICATION_INIT_STORAGE_KEY) || 0,
        );

        // Skip initialization if it was done recently (unless forced)
        const shouldInitialize = now - lastInit >= NOTIFICATION_INIT_INTERVAL;

        if (!shouldInitialize) {
          logger.info(
            "Notifications",
            "Skipping notification initialization - was performed recently",
          );
          return;
        }

        logger.info("Notifications", "Initializing notifications...");
        const token = await initializeNotifications(userData.uid);

        if (token) {
          await saveFCMToken.mutateAsync(token);
          // Update initialization timestamp
          localStorage.setItem(NOTIFICATION_INIT_STORAGE_KEY, now.toString());
        }
      } catch (error) {
        console.error("Failed to initialize notifications:", error);
      }
    };

    setupNotifications();
  }, [userData?.uid, saveFCMToken]);

  // Periodic token cleanup
  useEffect(() => {
    // Only run cleanup for logged in users
    if (!userData?.uid) return;

    const checkAndRunCleanup = async () => {
      try {
        const now = Date.now();
        const lastCleanup = Number(
          localStorage.getItem(TOKEN_CLEANUP_STORAGE_KEY) || 0,
        );

        // Check if it's time to run the cleanup
        if (now - lastCleanup >= TOKEN_CLEANUP_INTERVAL) {
          logger.info("Notifications", "Running scheduled FCM token cleanup");

          // Run the cleanup
          await notificationService.cleanupTokens(userData.uid);

          // Update the timestamp
          localStorage.setItem(TOKEN_CLEANUP_STORAGE_KEY, now.toString());

          logger.info("Notifications", "Scheduled FCM token cleanup completed");
        }
      } catch (error) {
        logger.error(
          "Notifications",
          "Error during scheduled token cleanup:",
          error,
        );
      }
    };

    // Run the check immediately and then whenever the component is mounted
    checkAndRunCleanup();
  }, [userData?.uid]);

  return <>{children}</>;
}
