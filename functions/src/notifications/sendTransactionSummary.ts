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

      if (user.settings?.notificationsEnabled && user.fcmToken) {
        const message = {
          notification: {
            title,
            body,
          },
          data: {
            type: "transaction_summary",
            date: now.toISOString(),
          },
          token: user.fcmToken,
        };

        try {
          logger.info(
            `Sending FCM notification to user ${userDoc.id} with message:`,
            message,
          );
          await admin.messaging().send(message);
          logger.info(
            `Successfully sent FCM notification to user ${userDoc.id}`,
          );
        } catch (error) {
          logger.error(
            `Error sending FCM notification to user ${userDoc.id}:`,
            error,
          );
        }
      } else {
        logger.info(
          `Skipping FCM for user ${userDoc.id}: notifications disabled or no FCM token`,
        );
      }
    }
  } catch (error) {
    logger.error("Error in sendTransactionSummary:", error);
    throw error;
  }
}
