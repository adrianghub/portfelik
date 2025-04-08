import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import type {
  FCMDataPayload,
  FCMNotificationPayload,
  MessagingResponse,
} from "../types/fcm";

/**
 * Sends an FCM notification to a user and cleans up invalid tokens
 *
 * @param userId The user ID to send the notification to
 * @param notification The notification payload (title and body)
 * @param data Additional data to include with the notification
 * @returns A promise that resolves when the notification is sent
 */
export async function sendFCMNotification(
  userId: string,
  notification: FCMNotificationPayload,
  data: FCMDataPayload,
): Promise<boolean> {
  try {
    const db = admin.firestore();
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      logger.warn(`User document not found for userId: ${userId}`);
      return false;
    }

    const userData = userDoc.data();
    if (!userData) {
      logger.warn(`User data is empty for userId: ${userId}`);
      return false;
    }

    const notificationsEnabled =
      userData.settings?.notificationsEnabled !== false;
    if (!notificationsEnabled) {
      logger.info(`Notifications are disabled for user: ${userId}`);
      return false;
    }

    if (
      !userData.fcmTokens ||
      !Array.isArray(userData.fcmTokens) ||
      userData.fcmTokens.length === 0
    ) {
      logger.info(`No FCM tokens found for user: ${userId}`);
      return false;
    }

    const message = {
      notification,
      data,
      tokens: userData.fcmTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    logger.info(
      `FCM notification for user ${userId}: ${response.successCount}/${response.responses.length} successful`,
    );

    // Handle invalid tokens cleanup
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];

      response.responses.forEach((resp: MessagingResponse, idx: number) => {
        if (!resp.success) {
          const error = resp.error;

          const isPermanentError =
            error &&
            (error.code === "messaging/registration-token-not-registered" ||
              error.code === "messaging/invalid-argument" ||
              error.code === "messaging/invalid-registration-token");

          if (isPermanentError) {
            logger.info(`Removing permanently invalid token: ${error.code}`);
            invalidTokens.push(userData.fcmTokens[idx]);
          } else {
            logger.warn(`Temporary FCM error: ${error?.code || "unknown"}`);
          }
        }
      });

      if (invalidTokens.length > 0) {
        const validTokens = userData.fcmTokens.filter(
          (token) => !invalidTokens.includes(token),
        );

        const tokenMetadata = userData.tokenMetadata || {};
        const updatedMetadata = { ...tokenMetadata };

        invalidTokens.forEach((token) => {
          if (updatedMetadata[token]) {
            delete updatedMetadata[token];
          }
        });

        await userDoc.ref.update({
          fcmTokens: validTokens,
          tokenMetadata: updatedMetadata,
        });

        logger.info(
          `Removed ${invalidTokens.length} permanently invalid tokens and their metadata for user: ${userId}`,
        );
      }
    }

    return response.successCount > 0;
  } catch (error) {
    logger.error(`Error sending FCM notification to user ${userId}:`, error);
    return false;
  }
}
