import dayjs from "dayjs";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import type { User } from "../index";
import { createNotification } from "./createNotification";
import type { Notification } from "./notification";
import type { Transaction } from "./transaction";

export async function sendTransactionSummaryFunction() {
  const db = admin.firestore();
  const now = dayjs();
  const yesterday = now.subtract(1, "day").startOf("day");

  try {
    const usersSnapshot = await db.collection("users").get();
    logger.info(`Found ${usersSnapshot.size} users`);

    for (const userDoc of usersSnapshot.docs) {
      const user = userDoc.data() as User;
      logger.info(`Processing user ${userDoc.id}:`, {
        notificationsEnabled: user.settings?.notificationsEnabled,
        hasFcmToken: !!user.fcmToken,
      });

      // Continue processing even if notifications are disabled or no FCM token,
      // as we'll still create the in-app notification
      logger.info(
        `Querying transactions for user ${userDoc.id} from ${yesterday.toISOString()}`,
      );
      const transactionsSnapshot = await db
        .collection("transactions")
        .where("userId", "==", userDoc.id)
        .where("date", ">=", yesterday.toISOString())
        .get();

      const transactions = transactionsSnapshot.docs.map((doc) => {
        const data = doc.data();
        logger.info(`Transaction data:`, {
          id: doc.id,
          date: data.date,
          dateType: typeof data.date,
          amount: data.amount,
          type: data.type,
        });
        return {
          ...data,
          date: dayjs(data.date).toDate(),
        };
      }) as Transaction[];

      // Calculate summary
      const income = transactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);

      const expenses = transactions
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0);

      logger.info(`Summary for user ${userDoc.id}:`, {
        income,
        expenses,
        totalTransactions: transactions.length,
      });

      if (transactions.length === 0) {
        logger.info(
          `No transactions for user ${userDoc.id}, skipping notification`,
        );
        continue;
      }

      const title = "Daily Transaction Summary";
      const body = `Yesterday's transactions:\nIncome: ${income.toFixed(2)} zł\nExpenses: ${expenses.toFixed(2)} zł`;

      const notification: Notification = {
        userId: userDoc.id,
        title,
        body,
        type: "transaction_summary",
        read: false,
        createdAt: now.toISOString(),
      };

      try {
        await createNotification(notification);
        logger.info(`Created in-app notification for user ${userDoc.id}`);
      } catch (error) {
        logger.error(
          `Error creating in-app notification for user ${userDoc.id}:`,
          error,
        );
      }

      if (user.settings?.notificationsEnabled) {
        // Check for tokens - use either fcmTokens array (new) or single token (legacy)
        const userTokens =
          user.fcmTokens || (user.fcmToken ? [user.fcmToken] : []);

        if (userTokens.length === 0) {
          logger.info(
            `User ${userDoc.id} has notifications enabled but no tokens, skipping FCM notification`,
          );
          continue;
        }

        logger.info(
          `Found ${userTokens.length} devices for user ${userDoc.id}, sending notifications`,
        );

        const baseMessage = {
          notification: {
            title,
            body,
          },
          data: {
            type: "transaction_summary",
            date: now.toISOString(),
          },
        };

        // Track invalid tokens to clean up later
        const invalidTokens: string[] = [];

        for (const deviceToken of userTokens) {
          if (
            !deviceToken ||
            typeof deviceToken !== "string" ||
            deviceToken.trim() === ""
          ) {
            logger.warn(
              `Invalid FCM token format for user ${userDoc.id}, skipping`,
            );
            invalidTokens.push(deviceToken);
            continue;
          }

          try {
            // Send notification to this device
            const message = {
              ...baseMessage,
              token: deviceToken,
            };

            logger.info(
              `Sending FCM notification to user ${userDoc.id} device with token: ${deviceToken.substring(0, 10)}...`,
            );

            const sendResult = await admin.messaging().send(message);
            logger.info(
              `Successfully sent FCM notification to user ${userDoc.id} device:`,
              sendResult,
            );
          } catch (error) {
            const fcmError = error as { code?: string };
            logger.error(
              `Error sending FCM notification to user ${userDoc.id} device:`,
              error,
            );

            // Check for specific FCM errors that indicate an invalid token
            if (
              fcmError.code === "messaging/invalid-registration-token" ||
              fcmError.code === "messaging/registration-token-not-registered"
            ) {
              logger.warn(
                `FCM token for user ${userDoc.id} is invalid, marking for removal`,
              );
              invalidTokens.push(deviceToken);
            }
          }
        }

        // Clean up invalid tokens if any were found
        if (invalidTokens.length > 0) {
          try {
            // Get fresh user data to avoid race conditions
            const latestUserDocRef = await db
              .collection("users")
              .doc(userDoc.id)
              .get();
            if (latestUserDocRef.exists) {
              const userData = latestUserDocRef.data() as User;
              if (userData) {
                const allTokens = userData.fcmTokens || [];

                // Remove invalid tokens
                const validTokens = allTokens.filter(
                  (token: string) => !invalidTokens.includes(token),
                );

                const updates: Record<string, unknown> = {
                  fcmTokens: validTokens,
                  tokenUpdateReason: "Removed invalid tokens by cloud function",
                };

                // Update single token field if it was invalid
                if (
                  userData.fcmToken &&
                  invalidTokens.includes(userData.fcmToken)
                ) {
                  updates.fcmToken = validTokens[0] || null;
                }

                // Disable notifications if all tokens are invalid
                if (validTokens.length === 0) {
                  updates["settings.notificationsEnabled"] = false;
                }

                await db.collection("users").doc(userDoc.id).update(updates);

                logger.info(
                  `Cleaned up ${invalidTokens.length} invalid tokens for user ${userDoc.id}. Remaining tokens: ${validTokens.length}`,
                );
              }
            }
          } catch (cleanupError) {
            logger.error(
              `Error cleaning up invalid tokens for user ${userDoc.id}:`,
              cleanupError,
            );
          }
        }
      } else {
        logger.info(
          `Skipping FCM for user ${userDoc.id}: notifications disabled`,
        );
      }
    }
  } catch (error) {
    logger.error("Error in sendTransactionSummary:", error);
    throw error;
  }
}
