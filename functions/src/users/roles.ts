import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

/**
 * Firebase Cloud Function that automatically updates Firebase Auth custom claims
 * whenever a user's role is changed in Firestore
 */
export const onUserRoleChanged = onDocumentUpdated(
  {
    document: "users/{userId}",
    region: "europe-central2",
  },
  async (event) => {
    try {
      const userId = event.params.userId;
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();

      if (!afterData) {
        logger.info(`User document ${userId} was deleted, skipping`);
        return;
      }

      if (beforeData && beforeData.role === afterData.role) {
        logger.info(`Role unchanged for user ${userId}, skipping`);
        return;
      }

      const newRole = afterData.role;

      logger.info(
        `Updating Firebase Auth claims for user ${userId} to role: ${newRole}`,
      );
      await admin.auth().setCustomUserClaims(userId, { role: newRole });

      logger.info(`Successfully updated claims for user ${userId}`);
    } catch (error) {
      logger.error(`Error updating user claims:`, error);
    }
  },
);
