import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {
  getTranslatedMessage,
  getTranslatedTitle,
  getUserLanguage,
} from "../i18n";
import type { GroupInvitation } from "../types/group-invitation";
import { Notification } from "../types/notification";
import type { User } from "../types/user";
import { sendFCMNotification } from "../utils/fcm";
import { createNotification } from "./createNotification";

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

    const userLanguage = await getUserLanguage(userId);
    const notificationType = "group_invitation";
    const title = getTranslatedTitle(notificationType, userLanguage);
    const body = getTranslatedMessage(notificationType, userLanguage, {
      inviterName,
      groupName: invitation.groupName,
    });

    const notification: Notification = {
      userId,
      title,
      body,
      type: notificationType,
      read: false,
      createdAt: new Date().toISOString(),
      data: {
        groupId: invitation.groupId,
        groupName: invitation.groupName,
        invitationId: invitation.id || "",
        link: "/settings?tab=groups&subtab=invitations",
      },
    };

    try {
      await createNotification(notification);
      logger.info(`Successfully created notification for user: ${userId}`);
    } catch (error) {
      logger.error(`Error creating notification: ${error}`);
      throw error;
    }

    await sendFCMNotification(
      userId,
      {
        title: notification.title,
        body: notification.body,
      },
      {
        type: notification.type,
        groupId: invitation.groupId,
        groupName: invitation.groupName,
        invitationId: invitation.id || "",
        link: "/settings?tab=groups&subtab=invitations",
      },
    ).catch((error) => {
      logger.error("Error sending FCM notification:", error);
    });
  } catch (error) {
    logger.error("Error sending group invitation notification:", error);
    throw error;
  }
}
