/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { ScheduledEvent, onSchedule } from "firebase-functions/v2/scheduler";
import { sendAdminTransactionSummaryFunction } from "./notifications/sendAdminTransactionSummary";

try {
  admin.initializeApp();
} catch (error) {
  logger.error("Error initializing Firebase Admin:", error);
  throw error;
}

type UserRole = "user" | "admin";

export interface User {
  uid: string;
  email: string | null;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date;
  fcmTokens?: string[];
  settings?: {
    notificationsEnabled?: boolean;
  };
}

// Function to send daily transaction summaries to users - SKIPPED FOR NOW
// export const sendTransactionSummary = onSchedule(
//   {
//     schedule: "0 8 * * *", // 8 AM every day
//     timeZone: "Europe/Warsaw",
//     retryCount: 3,
//   },
//   async (_event: ScheduledEvent) => {
//     logger.info("Running sendTransactionSummary scheduled function");
//     await sendTransactionSummaryFunction();
//   },
// );

export const sendAdminTransactionSummary = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "Europe/Warsaw",
    retryCount: 3,
  },
  async (_event: ScheduledEvent) => {
    logger.info("Running sendAdminTransactionSummary scheduled function");
    await sendAdminTransactionSummaryFunction();
  },
);

export const sendAdminTransactionSummaryManual = onRequest(
  async (_req, res) => {
    try {
      logger.info("Running sendAdminTransactionSummary manual function");
      await sendAdminTransactionSummaryFunction();

      res.json({
        success: true,
        message: "Admin transaction summary sent successfully",
      });
    } catch (error) {
      logger.error("Error in manual admin transaction summary:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred while sending admin transaction summary",
      });
    }
  },
);
