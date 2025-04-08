import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { Notification } from "../types/notification";

/**
 * Saves a notification to Firestore
 */
export async function createNotification(
  notification: Notification,
): Promise<string> {
  try {
    const db = admin.firestore();
    const notificationsRef = db.collection("notifications");
    const docRef = await notificationsRef.add(notification);
    logger.info(`Created notification with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    logger.error("Error creating notification:", error);
    throw error;
  }
}
