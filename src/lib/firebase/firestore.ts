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
import { db } from "./firebase";

// Collection names
export const COLLECTIONS = {
  USERS: "users",
  TRANSACTIONS: "transactions",
  CATEGORIES: "categories",
  NOTIFICATIONS: "notifications",
  SHOPPING_LISTS: "shopping-lists",
};

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

  constructor(collectionName: string) {
    this.collectionName = collectionName;
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
    const docRef = doc(db, this.collectionName, id);
    await deleteDoc(docRef);
    logger.debug(
      "Firestore",
      `Deleted document ${id} from ${this.collectionName}`,
    );
  }

  // Query documents
  async query(constraints: QueryConstraint[]): Promise<T[]> {
    logger.debug(
      "Firestore",
      `Querying ${this.collectionName} with constraints:`,
      constraints,
    );
    const q = query(collection(db, this.collectionName), ...constraints);
    const querySnapshot = await getDocs(q);
    logger.debug(
      "Firestore",
      `Found ${querySnapshot.docs.length} documents in ${this.collectionName} query`,
    );
    return querySnapshot.docs.map((doc) => convertDoc<T>(doc));
  }
}
