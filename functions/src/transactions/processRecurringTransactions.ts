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
  TransactionDocument,
  TransactionNotificationData,
  TransactionStatus,
} from "../types/transaction";
import { sendFCMNotification } from "../utils/fcm";

/**
 * Processes recurring transactions at the beginning of each month
 * Creates new upcoming transactions for all recurring transactions
 */
export async function processRecurringTransactionsFunction(): Promise<void> {
  logger.info("Starting processRecurringTransactions function");

  try {
    const db = admin.firestore();
    const now = dayjs();
    const currentMonth = now.month() + 1;
    const currentYear = now.year();

    // Get all recurring transactions
    const recurringTransactionsSnapshot = await db
      .collection("transactions")
      .where("isRecurring", "==", true)
      .get();

    logger.info(
      `Found ${recurringTransactionsSnapshot.size} recurring transactions`,
    );

    const batch = db.batch();
    let processedCount = 0;

    for (const doc of recurringTransactionsSnapshot.docs) {
      const transaction = doc.data() as Transaction;

      // Set the date to this month's recurring date
      const recurringDay = transaction.recurringDate || 1; // Default to 1st if not specified
      let nextDate = dayjs()
        .year(currentYear)
        .month(currentMonth - 1)
        .date(recurringDay)
        .startOf("day");

      // Don't create if it would be in the past (we're past that day this month)
      if (nextDate.isBefore(now)) {
        // Skip to next month if we're already past the recurring day this month
        nextDate = nextDate.add(1, "month");
      }

      // Create a new transaction with upcoming status
      const { id, ...transactionWithoutId } = transaction;

      // Create a new object for the transaction and handle groupId explicitly
      const newTransaction: TransactionDocument = {
        ...transactionWithoutId,
        date: nextDate.toISOString(),
        status: "upcoming" as TransactionStatus,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      // Only include groupId if it exists and is not undefined
      if (transaction.groupId) {
        newTransaction.groupId = transaction.groupId;
      }

      // Add to batch
      const newTransactionRef = db.collection("transactions").doc();
      batch.set(newTransactionRef, newTransaction);
      processedCount++;

      // Get user preferred language
      const userLanguage = await getUserLanguage(transaction.userId);

      // Format date and amount according to user's locale
      const formattedDate = nextDate.format("DD.MM.YYYY");
      const formattedAmount = formatAmount(transaction.amount, userLanguage);

      // Create notification for the user
      const notificationType = "transaction_upcoming";

      // Create notification data object and handle groupId explicitly
      const notificationData: TransactionNotificationData = {
        transactionId: newTransactionRef.id,
        amount: transaction.amount,
        description: transaction.description,
        date: nextDate.toISOString(),
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
          amount: formattedAmount,
          date: formattedDate,
        }),
        type: notificationType,
        read: false,
        createdAt: now.toISOString(),
        data: notificationData,
        language: userLanguage, // Store user language preference with notification
      };

      const notificationRef = db.collection("notifications").doc();
      batch.set(notificationRef, notification);

      // Add FCM push notification - outside of batch because it's a separate API call
      // Prepare FCM data payload with groupId properly handled
      const fcmData: Record<string, string> = {
        type: notification.type,
        transactionId: newTransactionRef.id,
        amount: transaction.amount.toString(),
        description: transaction.description,
        date: nextDate.toISOString(),
      };

      // Only add groupId to FCM data if it exists
      if (transaction.groupId) {
        fcmData.groupId = transaction.groupId;
      }

      // Using the new FCM utility function
      sendFCMNotification(
        transaction.userId,
        {
          title: notification.title,
          body: notification.body,
        },
        fcmData,
      ).catch((error) => {
        // Just log any errors but don't interrupt the main process
        logger.error(`Error sending FCM notification: ${error}`);
      });
    }

    // Commit all the new transactions and notifications
    if (processedCount > 0) {
      await batch.commit();
      logger.info(
        `Successfully processed ${processedCount} recurring transactions`,
      );
    } else {
      logger.info("No recurring transactions needed processing");
    }
  } catch (error) {
    logger.error("Error processing recurring transactions:", error);
    throw error;
  }
}
