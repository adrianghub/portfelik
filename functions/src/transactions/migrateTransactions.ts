import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { dayjs } from "../i18n";

/**
 * Migrates existing transactions to include the new status and recurring fields
 * This should be run once when deploying the new version with these fields
 */
export async function migrateTransactionsFunction(): Promise<void> {
  logger.info(
    "Starting transaction migration for adding status and recurring fields",
  );

  try {
    const db = admin.firestore();
    const now = dayjs();

    // Get all transactions
    const allTransactionsSnapshot = await db.collection("transactions").get();

    logger.info(
      `Found ${allTransactionsSnapshot.size} transactions to potentially migrate`,
    );

    let batch = db.batch();
    let batchCount = 0;
    let totalProcessed = 0;
    const BATCH_LIMIT = 500; // Firestore batch limit is 500 operations

    for (const doc of allTransactionsSnapshot.docs) {
      const data = doc.data();
      const needsUpdate = !data.status || data.isRecurring === undefined;

      if (needsUpdate) {
        // Only update if fields are missing
        const updates: Record<string, string | boolean> = {
          updatedAt: now.toISOString(),
        };

        if (!data.status) {
          updates.status = "paid"; // Set default status to paid for existing transactions
        }

        if (data.isRecurring === undefined) {
          updates.isRecurring = false; // Set default isRecurring to false
        }

        batch.update(doc.ref, updates);
        batchCount++;
        totalProcessed++;

        // If we reach batch limit, commit and start a new batch
        if (batchCount >= BATCH_LIMIT) {
          logger.info(`Committing batch of ${batchCount} transactions`);
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    // Commit any remaining transactions
    if (batchCount > 0) {
      logger.info(`Committing final batch of ${batchCount} transactions`);
      await batch.commit();
    }

    logger.info(
      `Migration completed. Processed ${totalProcessed} transactions.`,
    );
  } catch (error) {
    logger.error("Error migrating transactions:", error);
    throw error;
  }
}
