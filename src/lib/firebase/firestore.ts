import { t } from "@/lib/i18n/translations";
import { logger } from "@/lib/logger";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  query,
  QueryConstraint,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { db } from "./firebase";

// Collection names
export enum COLLECTIONS {
  USERS = "users",
  TRANSACTIONS = "transactions",
  CATEGORIES = "categories",
  NOTIFICATIONS = "notifications",
  SHOPPING_LISTS = "shopping-lists",
  USER_GROUPS = "user-groups",
  GROUP_INVITATIONS = "group-invitations",
}

// Convert Firestore timestamp to Date
export const timestampToDate = (timestamp: Timestamp): Date => {
  return timestamp.toDate();
};

// Convert Date to Firestore timestamp
export const dateToTimestamp = (date: Date): Timestamp => {
  return Timestamp.fromDate(date);
};

// Convert Firestore document to typed object
export const convertDoc = <T>(doc: DocumentData): T => {
  const data = doc.data();
  logger.debug("Firestore", `Converting doc ${doc.id}:`, data);

  // Convert all Timestamp fields to Date
  Object.keys(data).forEach((key) => {
    if (data[key] instanceof Timestamp) {
      data[key] = timestampToDate(data[key]);
    }
  });

  return {
    id: doc.id,
    ...data,
  } as T;
};

// Generic database service
export class FirestoreService<T extends { id?: string }> {
  collectionName: string;
  private offlineQueue: Map<string, () => Promise<T | void>> = new Map();
  private isProcessingQueue: boolean = false;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
    this.setupOfflineQueue();
  }

  private setupOfflineQueue() {
    // Listen for online/offline status
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        toast.info(t("transactions.toasts.online"));
        this.processOfflineQueue();
      });
      window.addEventListener("offline", () => {
        toast.warning(t("transactions.toasts.offline"));
        logger.warn("Firestore", "App is offline, operations will be queued");
      });
    }
  }

  private async processOfflineQueue() {
    if (this.offlineQueue.size === 0 || this.isProcessingQueue) return;

    this.isProcessingQueue = true;
    logger.info("Firestore", "Processing offline queue...");
    const queueSize = this.offlineQueue.size;

    for (const [key, operation] of this.offlineQueue.entries()) {
      try {
        await operation();
        this.offlineQueue.delete(key);
      } catch (error) {
        logger.error(
          "Firestore",
          `Error processing queued operation ${key}:`,
          error,
        );
      }
    }

    if (this.offlineQueue.size === 0) {
      toast.success(
        t(
          queueSize > 1
            ? "transactions.toasts.queueProcessedPlural"
            : "transactions.toasts.queueProcessed",
          { count: queueSize },
        ),
      );
    } else {
      toast.error(
        t(
          this.offlineQueue.size > 1
            ? "transactions.toasts.queueFailedPlural"
            : "transactions.toasts.queueFailed",
          { count: this.offlineQueue.size },
        ),
      );
    }

    this.isProcessingQueue = false;
  }

  private isOnline(): boolean {
    return typeof window !== "undefined" && navigator.onLine;
  }

  // Get all documents
  async getAll(constraints: QueryConstraint[] = []): Promise<T[]> {
    logger.debug(
      "Firestore",
      `Getting all documents from ${this.collectionName} with constraints:`,
      constraints,
    );
    const q = query(collection(db, this.collectionName), ...constraints);
    const querySnapshot = await getDocs(q);
    logger.debug(
      "Firestore",
      `Found ${querySnapshot.docs.length} documents in ${this.collectionName}`,
    );
    return querySnapshot.docs.map((doc) => convertDoc<T>(doc));
  }

  // Get document by ID
  async getById(id: string): Promise<T | null> {
    logger.debug(
      "Firestore",
      `Getting document ${id} from ${this.collectionName}`,
    );
    const docRef = doc(db, this.collectionName, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      logger.debug(
        "Firestore",
        `Document ${id} found in ${this.collectionName}`,
      );
      return convertDoc<T>(docSnap);
    }

    logger.debug(
      "Firestore",
      `Document ${id} not found in ${this.collectionName}`,
    );
    return null;
  }

  // Create document with auto-generated ID
  async create(data: Omit<T, "id">): Promise<T> {
    logger.debug(
      "Firestore",
      `Creating document in ${this.collectionName}:`,
      data,
    );

    if (!this.isOnline()) {
      logger.warn("Firestore", "App is offline, operation will be queued");
      const operation = async () => {
        const docRef = await addDoc(collection(db, this.collectionName), data);
        const newDoc = await getDoc(docRef);
        return convertDoc<T>(newDoc);
      };
      this.offlineQueue.set(`create_${Date.now()}`, operation);
      throw new Error("Operation queued for offline processing");
    }

    const docRef = await addDoc(collection(db, this.collectionName), data);
    const newDoc = await getDoc(docRef);
    logger.debug(
      "Firestore",
      `Created document ${docRef.id} in ${this.collectionName}`,
    );
    return convertDoc<T>(newDoc);
  }

  // Create document with specific ID
  async createWithId(id: string, data: Omit<T, "id">): Promise<T> {
    logger.debug(
      "Firestore",
      `Creating document with ID ${id} in ${this.collectionName}:`,
      data,
    );

    if (!this.isOnline()) {
      logger.warn("Firestore", "App is offline, operation will be queued");
      const operation = async () => {
        const docRef = doc(db, this.collectionName, id);
        await setDoc(docRef, data);
        const newDoc = await getDoc(docRef);
        return convertDoc<T>(newDoc);
      };
      this.offlineQueue.set(`createWithId_${id}`, operation);
      throw new Error("Operation queued for offline processing");
    }

    const docRef = doc(db, this.collectionName, id);
    await setDoc(docRef, data);
    const newDoc = await getDoc(docRef);
    logger.debug(
      "Firestore",
      `Created document with ID ${id} in ${this.collectionName}`,
    );
    return convertDoc<T>(newDoc);
  }

  // Update document
  async update(id: string, data: Partial<T>): Promise<T> {
    logger.debug(
      "Firestore",
      `Updating document ${id} in ${this.collectionName}:`,
      data,
    );

    if (!this.isOnline()) {
      logger.warn("Firestore", "App is offline, operation will be queued");
      const operation = async () => {
        const docRef = doc(db, this.collectionName, id);
        await updateDoc(docRef, data as DocumentData);
        const updatedDoc = await getDoc(docRef);
        return convertDoc<T>(updatedDoc);
      };
      this.offlineQueue.set(`update_${id}`, operation);
      throw new Error("Operation queued for offline processing");
    }

    const docRef = doc(db, this.collectionName, id);
    await updateDoc(docRef, data as DocumentData);
    const updatedDoc = await getDoc(docRef);
    logger.debug(
      "Firestore",
      `Updated document ${id} in ${this.collectionName}`,
    );
    return convertDoc<T>(updatedDoc);
  }

  // Delete document
  async delete(id: string): Promise<void> {
    logger.debug(
      "Firestore",
      `Deleting document ${id} from ${this.collectionName}`,
    );

    if (!this.isOnline()) {
      logger.warn("Firestore", "App is offline, operation will be queued");
      const operation = async () => {
        const docRef = doc(db, this.collectionName, id);
        await deleteDoc(docRef);
      };
      this.offlineQueue.set(`delete_${id}`, operation);
      throw new Error("Operation queued for offline processing");
    }

    const docRef = doc(db, this.collectionName, id);
    await deleteDoc(docRef);
    logger.debug(
      "Firestore",
      `Deleted document ${id} from ${this.collectionName}`,
    );
  }

  // Query documents with constraints
  async query(constraints: QueryConstraint[]): Promise<T[]> {
    logger.debug(
      "Firestore",
      `Querying documents from ${this.collectionName} with constraints:`,
      constraints,
    );
    const q = query(collection(db, this.collectionName), ...constraints);
    const querySnapshot = await getDocs(q);
    logger.debug(
      "Firestore",
      `Found ${querySnapshot.docs.length} documents in ${this.collectionName}`,
    );
    return querySnapshot.docs.map((doc) => convertDoc<T>(doc));
  }
}
