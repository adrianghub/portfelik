import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import type { Transaction } from "@/modules/transactions/transaction";
import dayjs from "dayjs";
import { orderBy, QueryConstraint, where } from "firebase/firestore";

export class TransactionService extends FirestoreService<Transaction> {
  constructor() {
    super(COLLECTIONS.TRANSACTIONS);
  }

  async get(id: string): Promise<Transaction | null> {
    return this.getById(id);
  }

  async create(transaction: Omit<Transaction, "id">): Promise<Transaction> {
    // Ensure date is in ISO string format
    const transactionWithFormattedDate = {
      ...transaction,
      date: dayjs(transaction.date).toISOString(),
    };
    return super.create(transactionWithFormattedDate);
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
    return super.update(id, updatesWithFormattedDate);
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
}

export const transactionService = new TransactionService();
