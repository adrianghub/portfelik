import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { User } from "..";
import { createNotification } from "./createNotification";
import { Notification } from "./notification";

export interface GroupInvitation {
  id?: string;
  groupId: string;
  groupName: string;
  invitedUserEmail: string;
  invitedUserId: string;
  createdBy: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

interface MessagingResponse {
  success: boolean;
}

/**
 * Sends a notification to a user who has been invited to join a group
 */
export async function sendGroupInvitationNotification(
  invitation: GroupInvitation,
  inviterName: string,
): Promise<void> {
  try {
    logger.info(
      `Sending group invitation notification for invitation: ${invitation.id}`,
    );

    // Get user by email to check if notifications are enabled and get FCM tokens
    const usersCollection = admin.firestore().collection("users");
    const userQuerySnapshot = await usersCollection
      .where("email", "==", invitation.invitedUserEmail)
      .limit(1)
      .get();

    if (userQuerySnapshot.empty) {
      logger.info(`No user found with email: ${invitation.invitedUserEmail}`);
      return;
    }

    const userDoc = userQuerySnapshot.docs[0];
    const user = userDoc.data() as User;

    // Get the user ID from the document ID (this is the most reliable source)
    const userId = userDoc.id;

    if (!userId) {
      logger.error("User ID is undefined - cannot create notification");
      return;
    }

    logger.info(
      `Found user with ID: ${userId} for email: ${invitation.invitedUserEmail}`,
    );

    // Check if notifications are enabled - default to true if settings not found
    const notificationsEnabled = user.settings?.notificationsEnabled !== false;

    if (!notificationsEnabled) {
      logger.info(
        `Notifications are disabled for user: ${invitation.invitedUserEmail}`,
      );
      return;
    }

    // Create notification
    const notification: Notification = {
      userId: userId, // Use the document ID as the userId
      title: "New Group Invitation",
      body: `${inviterName} invited you to join the group "${invitation.groupName}"`,
      type: "group_invitation",
      read: false,
      createdAt: new Date().toISOString(),
      data: {
        groupId: invitation.groupId,
        groupName: invitation.groupName,
        invitationId: invitation.id || "",
        link: "/settings?tab=groups&subtab=invitations",
      },
    };

    // Save notification to Firestore
    try {
      await createNotification(notification);
      logger.info(`Successfully created notification for user: ${userId}`);
    } catch (error) {
      logger.error(`Error creating notification: ${error}`);
      throw error;
    }

    // Send push notification if FCM tokens exist
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          type: notification.type,
          groupId: invitation.groupId,
          groupName: invitation.groupName,
          invitationId: invitation.id || "",
          link: "/settings?tab=groups&subtab=invitations",
        },
        tokens: user.fcmTokens,
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(message);
        logger.info(
          `Successfully sent message: ${response.successCount} / ${response.responses.length}`,
        );

        // Remove invalid tokens
        if (response.failureCount > 0) {
          const invalidTokens: string[] = [];
          response.responses.forEach((resp: MessagingResponse, idx: number) => {
            if (!resp.success) {
              invalidTokens.push(user.fcmTokens![idx]);
            }
          });

          if (invalidTokens.length > 0) {
            // Filter out invalid tokens
            const validTokens = user.fcmTokens.filter(
              (token) => !invalidTokens.includes(token),
            );

            // Update user document with valid tokens
            await userDoc.ref.update({
              fcmTokens: validTokens,
            });

            logger.info(
              `Removed ${invalidTokens.length} invalid tokens for user: ${user.uid}`,
            );
          }
        }
      } catch (fcmError) {
        logger.error("Error sending FCM notification:", fcmError);
      }
    } else {
      logger.info(`No FCM tokens found for user: ${user.uid}`);
    }
  } catch (error) {
    logger.error("Error sending group invitation notification:", error);
    throw error;
  }
}
