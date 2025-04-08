import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import { statuses, type Transaction } from "@/modules/transactions/transaction";
import dayjs from "dayjs";
import {
  doc,
  getDoc,
  getFirestore,
  orderBy,
  QueryConstraint,
  where,
} from "firebase/firestore";

export class TransactionService extends FirestoreService<Transaction> {
  constructor() {
    super(COLLECTIONS.TRANSACTIONS);
  }

  async get(id: string): Promise<Transaction | null> {
    return this.getById(id);
  }

  async create(transaction: Omit<Transaction, "id">): Promise<Transaction> {
    const transactionData = {
      ...transaction,
      date: dayjs(transaction.date).toISOString(),
      status: transaction.status || statuses.paid,
      isRecurring: transaction.isRecurring || false,
    };

    const cleanedData = this.removeUndefinedValues(transactionData);
    return super.create(cleanedData);
  }

  private removeUndefinedValues<T extends Record<string, unknown>>(obj: T): T {
    const result = { ...obj } as Record<string, unknown>;

    Object.keys(result).forEach((key) => {
      if (result[key] === undefined) {
        delete result[key];
      }
    });

    return result as T;
  }

  async update(
    id: string,
    updates: Partial<Transaction>,
  ): Promise<Transaction> {
    // Ensure date is in ISO string format if it's being updated
    const updatesWithFormattedDate = {
      ...updates,
      ...(updates.date && { date: dayjs(updates.date).toISOString() }),
    };
    const cleanedUpdates = this.removeUndefinedValues(updatesWithFormattedDate);
    return super.update(id, cleanedUpdates);
  }

  async delete(id: string): Promise<void> {
    return super.delete(id);
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    const constraints: QueryConstraint[] = [
      where("userId", "==", userId),
      orderBy("date", "desc"),
    ];

    return this.query(constraints);
  }

  async getAllTransactions(): Promise<Transaction[]> {
    const constraints: QueryConstraint[] = [orderBy("date", "desc")];

    return this.query(constraints);
  }

  async getTransactionsByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    const constraints: QueryConstraint[] = [
      where("userId", "==", userId),
      where("date", ">=", dayjs(startDate).toISOString()),
      where("date", "<=", dayjs(endDate).toISOString()),
      orderBy("date", "desc"),
    ];

    return this.query(constraints);
  }

  async getAllTransactionsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    const constraints: QueryConstraint[] = [
      where("date", ">=", dayjs(startDate).toISOString()),
      where("date", "<=", dayjs(endDate).toISOString()),
      orderBy("date", "desc"),
    ];

    return this.query(constraints);
  }

  async getTransactionsByCategory(
    userId: string,
    categoryId: string,
  ): Promise<Transaction[]> {
    const constraints: QueryConstraint[] = [
      where("userId", "==", userId),
      where("categoryId", "==", categoryId),
      orderBy("date", "desc"),
    ];

    return this.query(constraints);
  }

  async getSharedTransactions(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<Transaction[]> {
    try {
      const db = getFirestore();

      const userRef = doc(db, COLLECTIONS.USERS, userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return [];
      }

      const userData = userDoc.data();
      const userGroupIds = userData.groupIds || [];

      if (userGroupIds.length === 0) {
        return [];
      }

      const memberIds = new Set<string>();

      for (const groupId of userGroupIds) {
        const groupRef = doc(db, COLLECTIONS.USER_GROUPS, groupId);
        const groupDoc = await getDoc(groupRef);

        if (groupDoc.exists()) {
          const groupData = groupDoc.data();

          if (groupData.memberIds) {
            groupData.memberIds.forEach((memberId: string) => {
              if (memberId !== userId) {
                memberIds.add(memberId);
              }
            });
          }
        }
      }

      if (memberIds.size === 0) {
        return [];
      }

      const memberIdsArray = Array.from(memberIds);

      let constraints: QueryConstraint[] = [
        where("userId", "in", memberIdsArray),
        orderBy("date", "desc"),
      ];

      if (startDate && endDate) {
        constraints = [
          where("userId", "in", memberIdsArray),
          where("date", ">=", dayjs(startDate).toISOString()),
          where("date", "<=", dayjs(endDate).toISOString()),
          orderBy("date", "desc"),
        ];
      }

      return this.query(constraints);
    } catch (error) {
      console.error("Error fetching shared transactions:", error);
      return [];
    }
  }
}

export const transactionService = new TransactionService();
