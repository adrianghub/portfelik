import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  dayjs,
  formatAmount,
  getTranslatedMessage,
  getTranslatedTitle,
  getUserLanguage,
} from "../i18n";
import {
  Transaction,
  TransactionNotificationData,
  TransactionStatus,
} from "../types/transaction";
import { sendFCMNotification } from "../utils/fcm";

/**
 * Updates transaction statuses - changes upcoming to overdue if the date has passed
 * Runs daily to check for overdue transactions
 */
export async function updateTransactionStatusesFunction(): Promise<void> {
  logger.info("Starting updateTransactionStatuses function");

  try {
    const db = admin.firestore();
    const now = dayjs();
    const todayStart = now.startOf("day");

    const overdueTransactionsSnapshot = await db
      .collection("transactions")
      .where("status", "==", "upcoming" as TransactionStatus)
      .where("date", "<", todayStart.toISOString())
      .get();

    logger.info(
      `Found ${overdueTransactionsSnapshot.size} transactions to mark as overdue`,
    );

    const batch = db.batch();
    let processedCount = 0;

    for (const doc of overdueTransactionsSnapshot.docs) {
      const transaction = doc.data() as Transaction;

      // Update the transaction status to overdue
      batch.update(doc.ref, {
        status: "overdue" as TransactionStatus,
        updatedAt: now.toISOString(),
      });

      processedCount++;

      // Get user preferred language
      const userLanguage = await getUserLanguage(transaction.userId);

      // Create notification for the user
      const notificationRef = db.collection("notifications").doc();
      const notificationType = "transaction_overdue";

      // Create notification data object and handle groupId explicitly
      const notificationData: TransactionNotificationData = {
        transactionId: doc.id,
        amount: transaction.amount,
        description: transaction.description,
        date: transaction.date,
      };

      // Only include groupId if it exists and is not undefined
      if (transaction.groupId) {
        notificationData.groupId = transaction.groupId;
      }

      const notification = {
        userId: transaction.userId,
        title: getTranslatedTitle(notificationType, userLanguage),
        body: getTranslatedMessage(notificationType, userLanguage, {
          description: transaction.description,
          amount: formatAmount(transaction.amount, userLanguage),
        }),
        type: notificationType,
        read: false,
        createdAt: now.toISOString(),
        data: notificationData,
        language: userLanguage,
      };

      batch.set(notificationRef, notification);

      // Send FCM push notification
      // Convert notification data to strings for FCM
      const fcmData: Record<string, string> = {
        type: notification.type,
        transactionId: doc.id,
        amount: transaction.amount.toString(),
        description: transaction.description,
        date: transaction.date,
      };

      // Only add groupId to FCM data if it exists
      if (transaction.groupId) {
        fcmData.groupId = transaction.groupId;
      }

      // Using the FCM utility function to send push notification
      sendFCMNotification(
        transaction.userId,
        {
          title: notification.title,
          body: notification.body,
        },
        fcmData,
      ).catch((error) => {
        // Just log any errors but don't interrupt the main process
        logger.error(`Error sending overdue FCM notification: ${error}`);
      });
    }

    // Find upcoming transactions due today or tomorrow for notifications
    const tomorrow = now.add(1, "day").endOf("day");

    const upcomingTransactionsSnapshot = await db
      .collection("transactions")
      .where("status", "==", "upcoming" as TransactionStatus)
      .where("date", ">=", todayStart.toISOString())
      .where("date", "<=", tomorrow.toISOString())
      .get();

    logger.info(
      `Found ${upcomingTransactionsSnapshot.size} upcoming transactions due today or tomorrow`,
    );

    for (const doc of upcomingTransactionsSnapshot.docs) {
      const transaction = doc.data() as Transaction;
      const transactionDate = dayjs(transaction.date);

      // Determine if it's due today or tomorrow
      const isDueToday = transactionDate.isSame(todayStart, "day");

      // Get user preferred language
      const userLanguage = await getUserLanguage(transaction.userId);

      // Create notification for the user
      const notificationRef = db.collection("notifications").doc();
      const notificationType = isDueToday
        ? "transaction_reminder_today"
        : "transaction_reminder_tomorrow";

      // Create notification data object and handle groupId explicitly
      const notificationData: TransactionNotificationData & {
        isDueToday: boolean;
      } = {
        transactionId: doc.id,
        amount: transaction.amount,
        description: transaction.description,
        date: transaction.date,
        isDueToday,
      };

      const notification = {
        userId: transaction.userId,
        title: getTranslatedTitle(notificationType, userLanguage),
        body: getTranslatedMessage(notificationType, userLanguage, {
          description: transaction.description,
          amount: formatAmount(transaction.amount, userLanguage),
        }),
        type: "transaction_reminder",
        read: false,
        createdAt: now.toISOString(),
        data: notificationData,
        language: userLanguage,
      };

      batch.set(notificationRef, notification);
      processedCount++;

      // Send FCM push notification for upcoming/due transaction
      // Convert notification data to strings for FCM
      const fcmData: Record<string, string> = {
        type: notification.type,
        transactionId: doc.id,
        amount: transaction.amount.toString(),
        description: transaction.description,
        date: transaction.date,
        isDueToday: isDueToday.toString(),
      };

      // Only add groupId to FCM data if it exists
      if (transaction.groupId) {
        fcmData.groupId = transaction.groupId;
      }

      // Using the FCM utility function to send push notification
      sendFCMNotification(
        transaction.userId,
        {
          title: notification.title,
          body: notification.body,
        },
        fcmData,
      ).catch((error) => {
        // Just log any errors but don't interrupt the main process
        logger.error(`Error sending reminder FCM notification: ${error}`);
      });
    }

    // Commit all updates
    if (processedCount > 0) {
      await batch.commit();
      logger.info(`Successfully processed ${processedCount} transactions`);
    } else {
      logger.info("No transactions needed processing");
    }
  } catch (error) {
    logger.error("Error updating transaction statuses:", error);
    throw error;
  }
}
