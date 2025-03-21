import { addDoc, collection } from "firebase/firestore";
import { db, getCurrentUser } from "../../../lib/firebase/firebase";
import { Notification, NotificationType } from "./notification";

const NOTIFICATIONS_COLLECTION = "notifications";

/**
 * Creates a mock notification for the current user
 */
export async function createMockNotification(
  title: string,
  body: string,
  type: NotificationType = "system_notification",
  read = false,
): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn("No user logged in, cannot create mock notification");
      return null;
    }

    const notificationData: Omit<Notification, "id"> = {
      userId: user.uid,
      title,
      body,
      type,
      read,
      createdAt: new Date().toISOString(),
    };

    const notificationsRef = collection(db, NOTIFICATIONS_COLLECTION);
    const docRef = await addDoc(notificationsRef, notificationData);

    console.log(`Created mock notification with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error("Error creating mock notification:", error);
    return null;
  }
}

/**
 * Adds several mock notifications for testing
 */
export async function addMockNotifications(): Promise<void> {
  await createMockNotification(
    "Welcome to the app!",
    "Thanks for joining. Take a look around and explore the features.",
    "system_notification",
    false,
  );

  await createMockNotification(
    "Daily Transaction Summary",
    "Yesterday's transactions:\nIncome: 1,250.00 zł\nExpenses: 420.50 zł",
    "transaction_summary",
    false,
  );

  await createMockNotification(
    "Budget Alert",
    "You've reached 80% of your monthly budget for 'Dining Out'. Consider adjusting your spending.",
    "system_notification",
    false,
  );

  await createMockNotification(
    "Budget Alert 2",
    "You've reached 90% of your monthly budget for 'Dining Out'. Consider adjusting your spending.",
    "system_notification",
    false,
  );
}
