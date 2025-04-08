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
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { ScheduledEvent, onSchedule } from "firebase-functions/v2/scheduler";
import { sendAdminTransactionSummaryFunction } from "./notifications/sendAdminTransactionSummary";
import { sendGroupInvitationNotification } from "./notifications/sendGroupInvitationNotification";
import { migrateTransactionsFunction } from "./transactions/migrateTransactions";
import { processRecurringTransactionsFunction } from "./transactions/processRecurringTransactions";
import { updateTransactionStatusesFunction } from "./transactions/updateTransactionStatuses";
import type { GroupInvitation } from "./types/group-invitation";
import type { User } from "./types/user";

const defaultProperties = {
  timeZone: "Europe/Warsaw",
  retryCount: 3,
  region: "europe-central2",
};

try {
  admin.initializeApp();
} catch (error) {
  logger.error("Error initializing Firebase Admin:", error);
  throw error;
}

// Function to send admin transaction summary at 8 AM every Monday
export const sendAdminTransactionSummary = onSchedule(
  {
    schedule: "0 8 * * 1", // 8 AM every Monday
    ...defaultProperties,
  },
  async (_event: ScheduledEvent) => {
    logger.info("Running sendAdminTransactionSummary scheduled function");
    await sendAdminTransactionSummaryFunction();
  },
);

export const sendAdminTransactionSummaryManual = onRequest(
  {
    region: defaultProperties.region,
  },
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

// Function to send notifications when a new group invitation is created
export const onGroupInvitationCreated = onDocumentCreated(
  {
    document: "group-invitations/{invitationId}",
    region: defaultProperties.region,
  },
  async (event) => {
    try {
      const invitationData = event.data?.data();
      if (!invitationData || invitationData.status !== "pending") {
        logger.info("Skipping notification for non-pending invitation");
        return;
      }

      logger.info(
        `Processing new group invitation: ${event.params.invitationId}`,
      );

      const db = admin.firestore();
      const inviterDoc = await db
        .collection("users")
        .doc(invitationData.createdBy)
        .get();

      if (!inviterDoc.exists) {
        logger.error(`Inviter user not found: ${invitationData.createdBy}`);
        return;
      }

      const inviter = inviterDoc.data() as User;
      const inviterName = inviter.email?.split("@")[0] || "Anonymous";

      const invitation: GroupInvitation = {
        id: event.params.invitationId,
        groupId: invitationData.groupId,
        groupName: invitationData.groupName,
        invitedUserEmail: invitationData.invitedUserEmail,
        invitedUserId: invitationData.invitedUserId,
        createdBy: invitationData.createdBy,
        status: invitationData.status,
        createdAt: invitationData.createdAt,
        updatedAt: invitationData.updatedAt,
      };

      // Send the notification
      await sendGroupInvitationNotification(invitation, inviterName);

      logger.info(
        `Successfully processed group invitation: ${event.params.invitationId}`,
      );
    } catch (error) {
      logger.error("Error processing group invitation:", error);
    }
  },
);

// Function to process recurring transactions at the beginning of each month
export const processRecurringTransactions = onSchedule(
  {
    schedule: "0 0 1 * *", // Midnight on the 1st day of every month
    ...defaultProperties,
  },
  async (_event: ScheduledEvent) => {
    logger.info("Running processRecurringTransactions scheduled function");
    await processRecurringTransactionsFunction();
  },
);

export const processRecurringTransactionsManual = onRequest(
  {
    region: defaultProperties.region,
  },
  async (_req, res) => {
    try {
      logger.info("Running processRecurringTransactions manual function");
      await processRecurringTransactionsFunction();

      res.json({
        success: true,
        message: "Recurring transactions processed successfully",
      });
    } catch (error) {
      logger.error("Error in manual recurring transactions processing:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred while processing recurring transactions",
      });
    }
  },
);

// Function to update transaction statuses daily
export const updateTransactionStatuses = onSchedule(
  {
    schedule: "0 6 * * *", // 6 AM every day
    ...defaultProperties,
  },
  async (_event: ScheduledEvent) => {
    logger.info("Running updateTransactionStatuses scheduled function");
    await updateTransactionStatusesFunction();
  },
);

export const updateTransactionStatusesManual = onRequest(
  {
    region: defaultProperties.region,
  },
  async (_req, res) => {
    try {
      logger.info("Running updateTransactionStatuses manual function");
      await updateTransactionStatusesFunction();

      res.json({
        success: true,
        message: "Transaction statuses updated successfully",
      });
    } catch (error) {
      logger.error("Error in manual transaction status update:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred while updating transaction statuses",
      });
    }
  },
);

// Manual trigger for migrating transactions to include status and recurring fields
export const migrateTransactions = onRequest(
  {
    region: defaultProperties.region,
  },
  async (_req, res) => {
    try {
      logger.info("Running transaction migration function");
      await migrateTransactionsFunction();

      res.json({
        success: true,
        message: "Transactions migration completed successfully",
      });
    } catch (error) {
      logger.error("Error in transaction migration:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred while migrating transactions",
      });
    }
  },
);

// Export role management functions
export * from "./users/roles";
