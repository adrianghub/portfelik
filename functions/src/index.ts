/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { sendTransactionSummaryFunction } from "./notifications/sendTransactionSummary";

admin.initializeApp();

type UserRole = "user" | "admin";

export interface User {
  uid: string;
  email: string | null;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date;
  fcmTokens?: string[];
  settings?: {
    notificationsEnabled: boolean;
  };
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
