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
import {
  GroupInvitation,
  sendGroupInvitationNotification,
} from "./notifications/sendGroupInvitationNotification";

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
  tokenMetadata: Record<string, object>;
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
    region: "europe-central2",
  },
  async (_event: ScheduledEvent) => {
    logger.info("Running sendAdminTransactionSummary scheduled function");
    await sendAdminTransactionSummaryFunction();
  },
);

export const sendAdminTransactionSummaryManual = onRequest(
  {
    region: "europe-central2",
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
    region: "europe-central2",
  },
  async (event) => {
    try {
      // Get the invitation data
      const invitationData = event.data?.data();
      if (!invitationData || invitationData.status !== "pending") {
        logger.info("Skipping notification for non-pending invitation");
        return;
      }

      logger.info(
        `Processing new group invitation: ${event.params.invitationId}`,
      );

      // Get the inviter's information to include their name in the notification
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
      const inviterName = inviter.email?.split("@")[0] || "Someone"; // Use first part of email as name

      // Construct the invitation object with the required fields
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

// Export role management functions
export * from "./users/roles";
