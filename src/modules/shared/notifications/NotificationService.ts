import dayjs from "@/lib/date-utils";
import { db, getCurrentUser } from "@/lib/firebase/firebase";
import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import { logger } from "@/lib/logger";
import { Notification as NotificationModel } from "@/modules/shared/notifications/notification";
import { User } from "firebase/auth";
import {
  doc,
  getDoc,
  orderBy,
  QueryConstraint,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getMessaging, getToken } from "firebase/messaging";

// Max number of FCM tokens to keep per user
const MAX_FCM_TOKENS = 5;

// Minimum time between token updates (in milliseconds) - 24 hours
const TOKEN_UPDATE_COOLDOWN = 24 * 60 * 60 * 1000;
// Local storage key for tracking last token update time
const LAST_TOKEN_UPDATE_KEY = "fcm_token_last_update";

// Interface for FCM token metadata
export interface FCMTokenMetadata {
  deviceType: "mobile" | "desktop" | "tablet" | "unknown";
  deviceName?: string;
  lastUsed: string;
  createdAt: string;
  userAgent: string;
  interactionCount: number;
}

// Interface for token management
export interface TokenManagementData {
  tokens: string[];
  metadata: Record<string, FCMTokenMetadata>;
}

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
   * Detects the device type from user agent
   */
  private detectDeviceType(): "mobile" | "desktop" | "tablet" | "unknown" {
    const userAgent = navigator.userAgent.toLowerCase();

    if (
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent,
      )
    ) {
      if (/ipad|tablet/i.test(userAgent)) {
        return "tablet";
      }
      return "mobile";
    } else if (/macintosh|windows|linux/i.test(userAgent)) {
      return "desktop";
    }

    return "unknown";
  }

  /**
   * Generates a friendly device name based on device info
   */
  private generateDeviceName(): string {
    const deviceType = this.detectDeviceType();
    const browserInfo = this.getBrowserInfo();
    const osInfo = this.getOSInfo();

    return `${osInfo} ${browserInfo} (${deviceType})`;
  }

  /**
   * Gets browser information from user agent
   */
  private getBrowserInfo(): string {
    const userAgent = navigator.userAgent.toLowerCase();

    if (userAgent.includes("firefox")) return "Firefox";
    if (userAgent.includes("edg")) return "Edge";
    if (userAgent.includes("chrome")) return "Chrome";
    if (userAgent.includes("safari")) return "Safari";

    return "Browser";
  }

  /**
   * Gets OS information from user agent
   */
  private getOSInfo(): string {
    const userAgent = navigator.userAgent.toLowerCase();

    if (userAgent.includes("windows")) return "Windows";
    if (userAgent.includes("mac os")) return "macOS";
    if (userAgent.includes("android")) return "Android";
    if (
      userAgent.includes("ios") ||
      userAgent.includes("iphone") ||
      userAgent.includes("ipad")
    )
      return "iOS";
    if (userAgent.includes("linux")) return "Linux";

    return "Unknown OS";
  }

  /**
   * Saves the FCM token with device metadata and limits the number of tokens
   */
  async saveFCMToken(token: string): Promise<void> {
    try {
      // Safety check for empty tokens
      if (!token || token.trim() === "") {
        logger.warn("Notifications", "Empty token provided, skipping save");
        return;
      }

      const user = await getCurrentUser();
      if (!user) {
        logger.warn(
          "Notifications",
          "No user logged in, cannot save FCM token.",
        );
        return;
      }

      // Check if we've updated the token recently
      const lastUpdateStr = localStorage.getItem(LAST_TOKEN_UPDATE_KEY);
      if (lastUpdateStr) {
        const lastUpdate = parseInt(lastUpdateStr, 10);
        const now = Date.now();

        // If token was updated recently and it's the same token, skip update
        if (now - lastUpdate < TOKEN_UPDATE_COOLDOWN) {
          const lastToken = localStorage.getItem("last_saved_fcm_token");
          if (lastToken === token) {
            logger.info(
              "Notifications",
              "Skipping token update - last update was too recent",
            );
            return;
          }
        }
      }

      const userRef = this.getUserRef(user);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        // Create new user document with token
        const deviceType = this.detectDeviceType();
        const deviceName = this.generateDeviceName();
        const now = new Date().toISOString();

        await setDoc(
          userRef,
          {
            fcmTokens: [token],
            lastTokenUpdate: now,
            settings: { notificationsEnabled: true },
            tokenMetadata: {
              [token]: {
                deviceType,
                deviceName,
                lastUsed: now,
                createdAt: now,
                userAgent: navigator.userAgent,
                interactionCount: 1,
              },
            },
          },
          { merge: true },
        );

        // Update local storage with the time of this update
        localStorage.setItem(LAST_TOKEN_UPDATE_KEY, Date.now().toString());
        localStorage.setItem("last_saved_fcm_token", token);

        logger.info(
          "Notifications",
          `First FCM token saved for user: ${deviceName}`,
        );
        return;
      }

      // User already exists
      const userData = userDoc.data();
      const existingTokens: string[] = userData.fcmTokens || [];
      const tokenMetadata = userData.tokenMetadata || {};

      // ⚠️ Double-check to make sure we don't add duplicates
      if (existingTokens.includes(token)) {
        // Just update the timestamp and increment usage count
        const deviceName =
          tokenMetadata[token]?.deviceName || this.generateDeviceName();
        const interactionCount =
          (tokenMetadata[token]?.interactionCount || 0) + 1;

        await updateDoc(userRef, {
          lastTokenUpdate: new Date().toISOString(),
          [`tokenMetadata.${token}`]: {
            ...tokenMetadata[token],
            lastUsed: new Date().toISOString(),
            interactionCount,
            deviceName,
          },
        });

        // Update local storage with the time of this update
        localStorage.setItem(LAST_TOKEN_UPDATE_KEY, Date.now().toString());
        localStorage.setItem("last_saved_fcm_token", token);

        logger.info(
          "Notifications",
          `Updated existing FCM token for ${deviceName}`,
        );
        return;
      }

      // Make sure we don't have duplicates in the token array
      const uniqueExistingTokens = [...new Set(existingTokens)];

      // This is a new token
      const deviceType = this.detectDeviceType();
      const deviceName = this.generateDeviceName();
      const now = new Date().toISOString();

      // Prepare new token metadata
      const newMetadata = {
        deviceType,
        deviceName,
        lastUsed: now,
        createdAt: now,
        userAgent: navigator.userAgent,
        interactionCount: 1,
      };

      // If we're at or over the limit, remove the oldest/least used token
      let tokensToSave = [...uniqueExistingTokens, token];
      let updatedMetadata = { ...tokenMetadata, [token]: newMetadata };

      if (tokensToSave.length > MAX_FCM_TOKENS) {
        // Sort tokens by priority:
        // 1. Mobile/tablet devices have highest priority
        // 2. Then by interaction count (higher = more important)
        // 3. Then by last used date (more recent = more important)
        const tokenDetails = uniqueExistingTokens.map((t: string) => ({
          token: t,
          metadata: tokenMetadata[t] || {},
        }));

        tokenDetails.sort(
          (
            a: { token: string; metadata: FCMTokenMetadata },
            b: { token: string; metadata: FCMTokenMetadata },
          ) => {
            // Mobile/tablet first
            const aIsMobile =
              a.metadata.deviceType === "mobile" ||
              a.metadata.deviceType === "tablet";
            const bIsMobile =
              b.metadata.deviceType === "mobile" ||
              b.metadata.deviceType === "tablet";

            if (aIsMobile && !bIsMobile) return -1;
            if (!aIsMobile && bIsMobile) return 1;

            // Then by interaction count
            const aCount = a.metadata.interactionCount || 0;
            const bCount = b.metadata.interactionCount || 0;
            if (aCount !== bCount) return bCount - aCount;

            // Then by last used date
            const aLastUsed =
              a.metadata.lastUsed || a.metadata.createdAt || "0";
            const bLastUsed =
              b.metadata.lastUsed || b.metadata.createdAt || "0";
            return aLastUsed < bLastUsed ? 1 : -1;
          },
        );

        // Keep all but the last token (which is the lowest priority)
        const tokensToKeep = tokenDetails
          .slice(0, MAX_FCM_TOKENS - 1)
          .map((t: { token: string }) => t.token);
        const removedToken = tokenDetails[MAX_FCM_TOKENS - 1]?.token;

        // Create final updated lists
        tokensToSave = [...tokensToKeep, token];

        // Remove metadata for the removed token
        if (removedToken && updatedMetadata[removedToken]) {
          const { [removedToken]: _, ...remainingMetadata } = updatedMetadata;
          updatedMetadata = remainingMetadata;

          logger.info(
            "Notifications",
            `Removed old FCM token: ${tokenMetadata[removedToken]?.deviceName || "Unknown device"}`,
          );
        }
      }

      // Save the updated tokens and metadata
      await setDoc(
        userRef,
        {
          fcmTokens: tokensToSave,
          tokenMetadata: updatedMetadata,
          lastTokenUpdate: now,
          settings: { notificationsEnabled: true },
        },
        { merge: true },
      );

      // Update local storage with the time of this update
      localStorage.setItem(LAST_TOKEN_UPDATE_KEY, Date.now().toString());
      localStorage.setItem("last_saved_fcm_token", token);

      logger.info(
        "Notifications",
        `Added new FCM token for ${deviceName} (total: ${tokensToSave.length})`,
      );
    } catch (error) {
      logger.error("Notifications", "Error saving FCM token:", error);
      throw error;
    }
  }

  /**
   * Gets all FCM tokens and their metadata for a user
   */
  async getUserTokens(userId: string): Promise<TokenManagementData> {
    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return { tokens: [], metadata: {} };
      }

      const userData = userDoc.data();
      const tokens = userData.fcmTokens || [];
      const metadata = userData.tokenMetadata || {};

      return { tokens, metadata };
    } catch (error) {
      logger.error("Notifications", "Error getting user tokens:", error);
      throw error;
    }
  }

  /**
   * Removes a specific FCM token by ID
   */
  async removeTokenById(userId: string, tokenToRemove: string): Promise<void> {
    try {
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return;
      }

      const userData = userDoc.data();
      const existingTokens = userData.fcmTokens || [];
      const tokenMetadata = userData.tokenMetadata || {};

      if (!existingTokens.includes(tokenToRemove)) {
        logger.warn("Notifications", "Token not found for removal");
        return;
      }

      // Remove the token
      const updatedTokens = existingTokens.filter(
        (t: string) => t !== tokenToRemove,
      );

      // Remove metadata for this token
      const updatedMetadata = { ...tokenMetadata };
      delete updatedMetadata[tokenToRemove];

      await updateDoc(userRef, {
        fcmTokens: updatedTokens,
        tokenMetadata: updatedMetadata,
        lastTokenUpdate: new Date().toISOString(),
        ...(updatedTokens.length === 0
          ? { "settings.notificationsEnabled": false }
          : {}),
      });

      logger.info(
        "Notifications",
        `Token removed. Remaining: ${updatedTokens.length}`,
      );
    } catch (error) {
      logger.error("Notifications", "Error removing token:", error);
      throw error;
    }
  }

  /**
   * Removes the least active tokens to ensure the count is within limits
   */
  async cleanupTokens(
    userId: string,
    maxTokens = MAX_FCM_TOKENS,
  ): Promise<void> {
    try {
      const { tokens, metadata } = await this.getUserTokens(userId);

      if (tokens.length <= maxTokens) {
        return; // Already within limits
      }

      // Sort tokens by priority
      const tokenDetails = tokens.map((token) => ({
        token,
        metadata: metadata[token] || {},
      }));

      tokenDetails.sort(
        (
          a: { token: string; metadata: FCMTokenMetadata },
          b: { token: string; metadata: FCMTokenMetadata },
        ) => {
          // Mobile/tablet first
          const aIsMobile =
            a.metadata.deviceType === "mobile" ||
            a.metadata.deviceType === "tablet";
          const bIsMobile =
            b.metadata.deviceType === "mobile" ||
            b.metadata.deviceType === "tablet";

          if (aIsMobile && !bIsMobile) return -1;
          if (!aIsMobile && bIsMobile) return 1;

          // Then by interaction count
          const aCount = a.metadata.interactionCount || 0;
          const bCount = b.metadata.interactionCount || 0;
          if (aCount !== bCount) return bCount - aCount;

          // Then by last used date
          const aLastUsed = a.metadata.lastUsed || a.metadata.createdAt || "0";
          const bLastUsed = b.metadata.lastUsed || b.metadata.createdAt || "0";
          return aLastUsed < bLastUsed ? 1 : -1;
        },
      );

      // Keep only the highest priority tokens
      const tokensToKeep = tokenDetails
        .slice(0, maxTokens)
        .map((t: { token: string }) => t.token);
      const tokensToRemove = tokens.filter((t) => !tokensToKeep.includes(t));

      if (tokensToRemove.length === 0) {
        return; // Nothing to remove
      }

      // Build updated metadata object
      const updatedMetadata: Record<string, FCMTokenMetadata> = {};
      tokensToKeep.forEach((token: string) => {
        if (metadata[token]) {
          updatedMetadata[token] = metadata[token];
        }
      });

      // Update the user document
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        fcmTokens: tokensToKeep,
        tokenMetadata: updatedMetadata,
        lastTokenUpdate: new Date().toISOString(),
      });

      logger.info(
        "Notifications",
        `Cleaned up ${tokensToRemove.length} tokens. Remaining: ${tokensToKeep.length}`,
      );
    } catch (error) {
      logger.error("Notifications", "Error cleaning up tokens:", error);
      throw error;
    }
  }

  /**
   * Removes a specific FCM token from the user's document in Firestore
   */
  async removeCurrentFCMToken(tokenToRemove?: string): Promise<void> {
    try {
      const user = await getCurrentUser();
      if (!user) {
        logger.warn(
          "Notifications",
          "No user logged in, cannot remove FCM token.",
        );
        return;
      }

      // Get current token if not provided
      let token = tokenToRemove;
      if (!token) {
        try {
          // Try to get the current device token
          const messaging = getMessaging();
          token = await getToken(messaging);
        } catch (error) {
          logger.warn("Notifications", "Could not get current token:", error);
        }
      }

      const userRef = this.getUserRef(user);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists() && token) {
        const userData = userDoc.data();
        const existingTokens = userData.fcmTokens || [];
        const tokenMetadata = userData.tokenMetadata || {};

        // Skip if token doesn't exist
        if (!existingTokens.includes(token)) {
          logger.info("Notifications", "Token not found, nothing to remove");
          return;
        }

        const updatedTokens = existingTokens.filter((t: string) => t !== token);

        // Remove the token from metadata
        const updatedMetadata = { ...tokenMetadata };
        if (token in updatedMetadata) {
          delete updatedMetadata[token];
        }

        // Only disable notifications completely if there are no tokens left
        const updateNotificationsEnabled = updatedTokens.length === 0;

        const deviceName = tokenMetadata[token]?.deviceName || "Unknown device";

        await setDoc(
          userRef,
          {
            fcmTokens: updatedTokens,
            tokenMetadata: updatedMetadata,
            lastTokenUpdate: new Date().toISOString(),
            ...(updateNotificationsEnabled
              ? {
                  "settings.notificationsEnabled": false,
                }
              : {}),
          },
          { merge: true },
        );

        logger.info(
          "Notifications",
          `FCM token removed for ${deviceName}. Remaining devices: ${updatedTokens.length}`,
        );
      } else {
        // If we couldn't get the current token or user doc doesn't exist,
        // we shouldn't remove all tokens as that affects other devices
        logger.warn(
          "Notifications",
          "Could not identify specific token to remove",
        );
      }
    } catch (error) {
      logger.error("Notifications", "Error removing FCM token:", error);
      throw error;
    }
  }

  /**
   * Removes all FCM tokens from the user's document in Firestore
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
          fcmTokens: [],
          tokenMetadata: {},
          lastTokenUpdate: new Date().toISOString(),
          settings: { notificationsEnabled: false },
        },
        { merge: true },
      );

      logger.info(
        "Notifications",
        "All FCM tokens removed and notifications disabled.",
      );
    } catch (error) {
      logger.error("Notifications", "Error removing FCM tokens:", error);
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
