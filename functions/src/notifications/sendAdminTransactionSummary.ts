import dayjs from "dayjs";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import type { User } from "../index";
import { createNotification } from "./createNotification";
import type { Notification } from "./notification";
import type { Transaction } from "./transaction";

interface UserTransactionSummary {
  userId: string;
  email: string;
  income: number;
  expenses: number;
  transactionCount: number;
}

export async function sendAdminTransactionSummaryFunction() {
  const db = admin.firestore();
  const now = dayjs();
  const yesterday = now.subtract(1, "day").startOf("day");

  try {
    const adminUsersSnapshot = await db
      .collection("users")
      .where("role", "==", "admin")
      .get();

    if (adminUsersSnapshot.empty) {
      logger.info("No admin users found, skipping admin transaction summary");
      return;
    }

    logger.info(`Found ${adminUsersSnapshot.size} admin users`);
    const adminUsers = adminUsersSnapshot.docs.map((doc) => ({
      ...doc.data(),
      uid: doc.id,
    })) as User[];

    logger.info(
      `Admin users with UIDs:`,
      adminUsers.map((user) => ({
        uid: user.uid,
        email: user.email,
      })),
    );

    const transactionsSnapshot = await db
      .collection("transactions")
      .where("date", ">=", yesterday.toISOString())
      .get();

    if (transactionsSnapshot.empty) {
      logger.info(
        "No transactions found from yesterday, skipping admin summary",
      );
      return;
    }

    const transactions = transactionsSnapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
      date: dayjs(doc.data().date).toDate(),
    })) as (Transaction & { id: string; userId: string })[];

    logger.info(`Found ${transactions.length} transactions from yesterday`);

    const usersSnapshot = await db.collection("users").get();
    const userMap = new Map<string, User>();
    usersSnapshot.docs.forEach((doc) => {
      const userData = doc.data() as User;
      userMap.set(doc.id, {
        ...userData,
        uid: doc.id,
      });
    });

    const userSummaries = new Map<string, UserTransactionSummary>();

    transactions.forEach((transaction) => {
      const userId = transaction.userId;
      if (!userId) return;

      const user = userMap.get(userId);
      if (!user) return;

      if (!userSummaries.has(userId)) {
        userSummaries.set(userId, {
          userId,
          email: user.email || "Unknown email",
          income: 0,
          expenses: 0,
          transactionCount: 0,
        });
      }

      const summary = userSummaries.get(userId)!;

      if (transaction.type === "income") {
        summary.income += transaction.amount;
      } else if (transaction.type === "expense") {
        summary.expenses += transaction.amount;
      }

      summary.transactionCount++;
    });

    const totalUsers = userSummaries.size;
    const totalTransactions = transactions.length;
    const totalIncome = Array.from(userSummaries.values()).reduce(
      (sum, summary) => sum + summary.income,
      0,
    );
    const totalExpenses = Array.from(userSummaries.values()).reduce(
      (sum, summary) => sum + summary.expenses,
      0,
    );

    const title = "Admin Daily Transaction Summary";

    let body = `Yesterday's platform activity (${yesterday.format("YYYY-MM-DD")}):\n`;
    body += `Users with transactions: ${totalUsers}\n`;
    body += `Total transactions: ${totalTransactions}\n`;
    body += `Total income: ${totalIncome.toFixed(2)} zł\n`;
    body += `Total expenses: ${totalExpenses.toFixed(2)} zł\n\n`;

    if (userSummaries.size <= 10) {
      body += "User breakdown:\n";
      Array.from(userSummaries.values())
        .sort((a, b) => b.transactionCount - a.transactionCount)
        .forEach((summary) => {
          body += `- ${summary.email}: ${summary.transactionCount} transactions, Income: ${summary.income.toFixed(2)} zł, Expenses: ${summary.expenses.toFixed(2)} zł\n`;
        });
    } else {
      body += "Top 5 users by transaction count:\n";
      Array.from(userSummaries.values())
        .sort((a, b) => b.transactionCount - a.transactionCount)
        .slice(0, 5)
        .forEach((summary) => {
          body += `- ${summary.email}: ${summary.transactionCount} transactions, Income: ${summary.income.toFixed(2)} zł, Expenses: ${summary.expenses.toFixed(2)} zł\n`;
        });
    }

    for (const adminUser of adminUsers) {
      const adminId = adminUser.uid;

      logger.info(`Processing admin user:`, {
        uid: adminUser.uid,
        email: adminUser.email,
        hasNotificationsEnabled: adminUser.settings?.notificationsEnabled,
        fcmTokensCount: adminUser.fcmTokens?.length || 0,
      });

      if (!adminId) {
        logger.error("Admin user has no uid, skipping notification");
        continue;
      }

      const notification: Notification = {
        userId: adminId,
        title,
        body,
        type: "admin_transaction_summary",
        read: false,
        createdAt: now.toISOString(),
      };

      try {
        await createNotification(notification);
        logger.info(
          `Created admin summary notification for admin user ${adminId}`,
        );
      } catch (error) {
        logger.error(
          `Error creating admin summary notification for admin user ${adminId}:`,
          error,
        );
      }

      if (
        adminUser.settings?.notificationsEnabled &&
        Array.isArray(adminUser.fcmTokens) &&
        adminUser.fcmTokens.length > 0
      ) {
        const userTokens = adminUser.fcmTokens;
        logger.info(
          `Sending FCM notifications to admin user ${adminId} with ${userTokens.length} tokens`,
        );

        const baseMessage = {
          notification: {
            title,
            body: body.substring(0, 1000),
          },
          data: {
            type: "admin_transaction_summary",
            date: now.toISOString(),
          },
        };

        for (const token of userTokens) {
          try {
            await admin.messaging().send({
              ...baseMessage,
              token,
            });
            logger.info(
              `Successfully sent admin FCM notification to admin user ${adminId}`,
            );
          } catch (error) {
            logger.error(
              `Error sending admin FCM notification to admin user ${adminId}:`,
              error,
            );
          }
        }
      }
    }

    logger.info("Admin transaction summary notifications sent successfully");
  } catch (error) {
    logger.error("Error in sendAdminTransactionSummary:", error);
    throw error;
  }
}
