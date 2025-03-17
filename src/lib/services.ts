import { limit, orderBy, QueryConstraint, where } from "firebase/firestore";
import { UserData as AuthUserData } from "./auth-context";
import { COLLECTIONS, FirestoreService } from "./firestore";

// Extended UserData interface to ensure it has an id property
export interface UserData extends AuthUserData {
  id?: string;
}

// Transaction interface
export interface Transaction {
  id?: string;
  userId: string;
  amount: number;
  description: string;
  categoryId: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Category interface
export interface Category {
  id?: string;
  name: string;
  type: "income" | "expense";
  userId?: string | null;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// User service
export class UserService extends FirestoreService<UserData> {
  constructor() {
    super(COLLECTIONS.USERS);
  }

  // Get user by email
  async getUserByEmail(email: string): Promise<UserData | null> {
    const constraints: QueryConstraint[] = [
      where("email", "==", email),
      limit(1),
    ];

    const users = await this.query(constraints);
    return users.length > 0 ? users[0] : null;
  }

  // Update user role
  async updateUserRole(
    userId: string,
    role: "user" | "admin",
  ): Promise<UserData> {
    return this.update(userId, { role });
  }
}

// Transaction service
export class TransactionService extends FirestoreService<Transaction> {
  constructor() {
    super(COLLECTIONS.TRANSACTIONS);
  }

  // Get a single transaction by ID
  async get(id: string): Promise<Transaction | null> {
    return this.getById(id);
  }

  // Create a new transaction
  async create(transaction: Omit<Transaction, "id">): Promise<Transaction> {
    return super.create(transaction);
  }

  // Update a transaction
  async update(
    id: string,
    updates: Partial<Transaction>,
  ): Promise<Transaction> {
    return super.update(id, updates);
  }

  // Delete a transaction
  async delete(id: string): Promise<void> {
    return super.delete(id);
  }

  // Get user transactions
  async getUserTransactions(userId: string): Promise<Transaction[]> {
    const constraints: QueryConstraint[] = [
      where("userId", "==", userId),
      orderBy("date", "desc"),
    ];

    return this.query(constraints);
  }

  // Get all transactions (for admin users)
  async getAllTransactions(): Promise<Transaction[]> {
    const constraints: QueryConstraint[] = [orderBy("date", "desc")];

    return this.query(constraints);
  }

  // Get transactions by date range
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

  // Get all transactions by date range (for admin users)
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

  // Get transactions by category
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

// Category service
export class CategoryService extends FirestoreService<Category> {
  constructor() {
    super(COLLECTIONS.CATEGORIES);
  }

  // Create a new category
  async create(category: Omit<Category, "id">): Promise<Category> {
    return super.create(category);
  }

  // Update a category
  async update(id: string, updates: Partial<Category>): Promise<Category> {
    return super.update(id, updates);
  }

  // Delete a category
  async delete(id: string): Promise<void> {
    return super.delete(id);
  }

  // Get all categories
  async getAllCategories(): Promise<Category[]> {
    const constraints: QueryConstraint[] = [orderBy("name", "asc")];

    return this.query(constraints);
  }

  // Get user categories including default ones
  async getUserCategories(userId: string): Promise<Category[]> {
    // This query needs to get both:
    // 1. Categories where userId matches the current user
    // 2. Default categories (which don't have a userId or have isDefault=true)
    const allCategories = await this.getAll();
    return allCategories.filter(
      (category) =>
        category.userId === userId ||
        category.isDefault === true ||
        !category.userId,
    );
  }

  // Get income categories
  async getIncomeCategories(): Promise<Category[]> {
    const constraints: QueryConstraint[] = [
      where("type", "==", "income"),
      orderBy("name", "asc"),
    ];

    return this.query(constraints);
  }

  // Get expense categories
  async getExpenseCategories(): Promise<Category[]> {
    const constraints: QueryConstraint[] = [
      where("type", "==", "expense"),
      orderBy("name", "asc"),
    ];

    return this.query(constraints);
  }
}

// Create service instances
export const userService = new UserService();
export const transactionService = new TransactionService();
export const categoryService = new CategoryService();
