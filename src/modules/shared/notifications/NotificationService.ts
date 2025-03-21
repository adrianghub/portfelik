import dayjs from "@/lib/date-utils";
import { db, getCurrentUser } from "@/lib/firebase/firebase";
import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import { logger } from "@/lib/logger";
import { Notification as NotificationModel } from "@/modules/shared/notifications/notification";
import { User } from "firebase/auth";
import {
  doc,
  orderBy,
  QueryConstraint,
  setDoc,
  where,
} from "firebase/firestore";

export class NotificationService extends FirestoreService<NotificationModel> {
  constructor() {
    super(COLLECTIONS.NOTIFICATIONS);
  }

  async get(id: string): Promise<NotificationModel | null> {
    return this.getById(id);
  }

  async create(
    notification: Omit<NotificationModel, "id">,
  ): Promise<NotificationModel> {
    const notificationWithFormattedDate = {
      ...notification,
      createdAt: dayjs().toISOString(),
    };
    return super.create(notificationWithFormattedDate);
  }

  async update(
    id: string,
    updates: Partial<NotificationModel>,
  ): Promise<NotificationModel> {
    return super.update(id, updates);
  }

  async delete(id: string): Promise<void> {
    return super.delete(id);
  }

  async getUserNotifications(userId: string): Promise<NotificationModel[]> {
    const constraints: QueryConstraint[] = [
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
    ];

    return this.query(constraints);
  }

  async markAsRead(id: string): Promise<NotificationModel> {
    return this.update(id, { read: true });
  }

  async markAsUnread(id: string): Promise<NotificationModel> {
    return this.update(id, { read: false });
  }

  async toggleReadState(id: string): Promise<NotificationModel> {
    const notification = await this.getById(id);
    if (!notification) {
      throw new Error(`Notification with ID ${id} not found`);
    }

    return this.update(id, { read: !notification.read });
  }

  async markAllAsRead(userId: string): Promise<void> {
    const notifications = await this.getUserNotifications(userId);
    const unreadNotifications = notifications.filter((n) => !n.read);

    // Create a batch of promises to update all unread notifications
    const updatePromises = unreadNotifications.map((notification) =>
      this.update(notification.id, { read: true }),
    );

    await Promise.all(updatePromises);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const constraints: QueryConstraint[] = [
      where("userId", "==", userId),
      where("read", "==", false),
    ];

    const unreadNotifications = await this.query(constraints);
    return unreadNotifications.length;
  }

  /**
   * Returns a Firestore reference to the user's document
   */
  getUserRef(user: User) {
    return doc(db, "users", user.uid);
  }

  /**
   * Saves the FCM token to the user's document in Firestore
   */
  async saveFCMToken(token: string): Promise<void> {
    try {
      const user = await getCurrentUser();
      if (!user) {
        logger.warn(
          "Notifications",
          "No user logged in, cannot save FCM token.",
        );
        return;
      }

      await setDoc(
        this.getUserRef(user),
        {
          fcmToken: token,
          lastTokenUpdate: new Date().toISOString(),
          settings: { notificationsEnabled: true },
        },
        { merge: true },
      );

      logger.info(
        "Notifications",
        "FCM token saved and notifications enabled.",
      );
    } catch (error) {
      logger.error("Notifications", "Error saving FCM token:", error);
      throw error;
    }
  }

  /**
   * Removes the FCM token from the user's document in Firestore
   */
  async removeFCMToken(): Promise<void> {
    try {
      const user = await getCurrentUser();
      if (!user) {
        logger.warn(
          "Notifications",
          "No user logged in, cannot remove FCM token.",
        );
        return;
      }

      await setDoc(
        this.getUserRef(user),
        {
          fcmToken: null,
          lastTokenUpdate: new Date().toISOString(),
          settings: { notificationsEnabled: false },
        },
        { merge: true },
      );

      logger.info(
        "Notifications",
        "FCM token removed and notifications disabled.",
      );
    } catch (error) {
      logger.error("Notifications", "Error removing FCM token:", error);
      throw error;
    }
  }

  /**
   * Checks if the current browser supports push notifications and service workers
   */
  checkPushSupport() {
    if (!this.isSecureContext()) {
      return {
        supported: false,
        enabled: false,
        permission: "unsupported" as NotificationPermission,
        reason: "Requires HTTPS or localhost",
      };
    }

    if (!("Notification" in window)) {
      return {
        supported: false,
        enabled: false,
        permission: "unsupported" as NotificationPermission,
        reason: "Not supported in this browser",
      };
    }

    const permission = Notification.permission;
    return {
      supported: true,
      enabled: permission === "granted",
      permission,
      reason: null,
    };
  }

  /**
   * Checks if the current context is secure (https or localhost)
   */
  private isSecureContext(): boolean {
    return (
      window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    );
  }
}

// Export a singleton instance of the service
export const notificationService = new NotificationService();
