import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
    formatAmount,
    getTranslatedMessage,
    getTranslatedTitle,
    getUserLanguage,
} from "../i18n";
import type { Notification } from "../types/notification";
import type { Transaction } from "../types/transaction";
import type { User } from "../types/user";
import { createNotification } from "./createNotification";

dayjs.extend(weekOfYear);

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

  // Calculate the previous full week (Monday to Sunday)
  // If today is Monday, we want the previous week (Monday to Sunday)
  const startOfPreviousWeek = now.subtract(1, "week").startOf("week").add(1, "day"); // Monday of previous week
  const endOfPreviousWeek = startOfPreviousWeek.add(6, "days").endOf("day"); // Sunday of previous week

  const startOfPeriod = startOfPreviousWeek;
  const endOfPeriod = endOfPreviousWeek;

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
      .where("date", ">=", startOfPeriod.toISOString())
      .where("date", "<=", endOfPeriod.toISOString())
      .get();

    if (transactionsSnapshot.empty) {
      logger.info(
        `No transactions found from the previous week (${startOfPeriod.format("YYYY-MM-DD")} to ${endOfPeriod.format("YYYY-MM-DD")}), skipping admin summary`,
      );
      return;
    }

    const transactions = transactionsSnapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
      date: dayjs(doc.data().date).toISOString(),
    })) as (Transaction & { id: string; userId: string })[];

    logger.info(
      `Found ${transactions.length} transactions from the previous week (${startOfPeriod.format("YYYY-MM-DD")} to ${endOfPeriod.format("YYYY-MM-DD")})`,
    );

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

    for (const adminUser of adminUsers) {
      const adminId = adminUser.uid;

      logger.info(`Processing admin user:`, {
        uid: adminUser.uid,
        email: adminUser.email,
        hasNotificationsEnabled: adminUser.settings?.notificationsEnabled,
        fcmTokensCount: Array.isArray(adminUser.fcmTokens)
          ? adminUser.fcmTokens.length
          : 0,
      });

      if (!adminId) {
        logger.error("Admin user has no uid, skipping notification");
        continue;
      }

      const language = await getUserLanguage(adminId);

      const title = getTranslatedTitle(
        "admin_weekly_transaction_summary",
        language,
      );

      const formattedStartDate = startOfPeriod.format("YYYY-MM-DD");
      const formattedEndDate = endOfPeriod.format("YYYY-MM-DD");

      const formattedTotalIncome = formatAmount(totalIncome, language);
      const formattedTotalExpenses = formatAmount(totalExpenses, language);

      let body = getTranslatedMessage(
        "admin_weekly_transaction_summary_header",
        language,
        {
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          userCount: totalUsers,
          transactionCount: totalTransactions,
          totalIncome: formattedTotalIncome,
          totalExpenses: formattedTotalExpenses,
        },
      );

      if (userSummaries.size <= 10) {
        body +=
          getTranslatedMessage(
            "admin_transaction_summary_all_users",
            language,
          ) + "\n";
        Array.from(userSummaries.values())
          .sort((a, b) => b.transactionCount - a.transactionCount)
          .forEach((summary) => {
            body +=
              getTranslatedMessage(
                "admin_transaction_summary_user_row",
                language,
                {
                  email: summary.email,
                  transactionCount: summary.transactionCount,
                  income: formatAmount(summary.income, language),
                  expenses: formatAmount(summary.expenses, language),
                },
              ) + "\n";
          });
      } else {
        body +=
          getTranslatedMessage(
            "admin_transaction_summary_top_users",
            language,
            { count: 5 },
          ) + "\n";
        Array.from(userSummaries.values())
          .sort((a, b) => b.transactionCount - a.transactionCount)
          .slice(0, 5)
          .forEach((summary) => {
            body +=
              getTranslatedMessage(
                "admin_transaction_summary_user_row",
                language,
                {
                  email: summary.email,
                  transactionCount: summary.transactionCount,
                  income: formatAmount(summary.income, language),
                  expenses: formatAmount(summary.expenses, language),
                },
              ) + "\n";
          });
      }

      const notification: Notification = {
        userId: adminId,
        title,
        body,
        type: "admin_weekly_transaction_summary",
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
            type: "admin_weekly_transaction_summary",
            date: now.toISOString(),
            startDate: startOfPeriod.toISOString(),
            endDate: endOfPeriod.toISOString(),
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
