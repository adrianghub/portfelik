/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import dayjs from "dayjs";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

admin.initializeApp();

interface Transaction {
  amount: number;
  type: "income" | "expense";
  date: Date;
}

type UserRole = "user" | "admin";

interface User {
  uid: string;
  email: string | null;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date;
  fcmToken?: string;
  settings?: {
    notificationsEnabled: boolean;
  };
}

async function sendTransactionSummaryFunction() {
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

      if (!user.settings?.notificationsEnabled || !user.fcmToken) {
        logger.info(
          `Skipping user ${userDoc.id}: notifications disabled or no FCM token`,
        );
        continue;
      }

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

      const message = {
        notification: {
          title: "Daily Transaction Summary",
          body: `Yesterday's transactions:\nIncome: ${income.toFixed(2)} zł\nExpenses: ${expenses.toFixed(2)} zł`,
        },
        data: {
          type: "transaction_summary",
          date: now.toISOString(),
        },
        token: user.fcmToken,
      };

      try {
        logger.info(
          `Sending notification to user ${userDoc.id} with message:`,
          message,
        );
        await admin.messaging().send(message);
        logger.info(`Successfully sent notification to user ${userDoc.id}`);
      } catch (error) {
        logger.error(
          `Error sending notification to user ${userDoc.id}:`,
          error,
        );
      }
    }
  } catch (error) {
    logger.error("Error in sendTransactionSummary:", error);
    throw error;
  }
}

export const sendTransactionSummary = onSchedule(
  "every 24 hours",
  async (_event) => {
    await sendTransactionSummaryFunction();
  },
);

export const sendTransactionSummaryManual = onRequest(
  { cors: true },
  async (_req, res) => {
    try {
      await sendTransactionSummaryFunction();
      res.json({
        success: true,
        message: "Transaction summary notifications sent successfully",
      });
    } catch (error) {
      logger.error("Error in manual trigger:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to send notifications" });
    }
  },
);
