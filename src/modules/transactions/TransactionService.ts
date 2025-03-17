import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import type { Transaction } from "@/modules/transactions/transaction";
import { orderBy, QueryConstraint, where } from "firebase/firestore";

export class TransactionService extends FirestoreService<Transaction> {
  constructor() {
    super(COLLECTIONS.TRANSACTIONS);
  }

  async get(id: string): Promise<Transaction | null> {
    return this.getById(id);
  }

  async create(transaction: Omit<Transaction, "id">): Promise<Transaction> {
    return super.create(transaction);
  }

  async update(
    id: string,
    updates: Partial<Transaction>,
  ): Promise<Transaction> {
    return super.update(id, updates);
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
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "desc"),
    ];

    return this.query(constraints);
  }

  async getAllTransactionsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    const constraints: QueryConstraint[] = [
      where("date", ">=", startDate),
      where("date", "<=", endDate),
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
