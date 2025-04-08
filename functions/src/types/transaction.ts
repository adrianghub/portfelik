/**
 * Transaction types shared across the application
 */

/**
 * Transaction status enum
 */
export type TransactionStatus = "draft" | "upcoming" | "overdue" | "paid";

/**
 * Transaction type enum
 */
export type TransactionType = "income" | "expense";

/**
 * Base transaction interface with common fields
 */
export interface BaseTransaction {
  amount: number;
  description: string;
  date: string;
  type: TransactionType;
  categoryId: string;
  userId: string;
  groupId?: string;
  shoppingListId?: string;
  status: TransactionStatus;
  isRecurring: boolean;
  recurringDate?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transaction interface with optional ID (used for creating transactions)
 */
export interface Transaction extends BaseTransaction {
  id?: string;
}

/**
 * Transaction interface that explicitly includes ID (used for existing transactions)
 */
export interface TransactionWithId extends BaseTransaction {
  id: string;
}

/**
 * Transaction document structure (Firestore safe - no undefined values)
 */
export interface TransactionDocument
  extends Omit<
    BaseTransaction,
    "groupId" | "shoppingListId" | "recurringDate"
  > {
  groupId?: string;
  shoppingListId?: string;
  recurringDate?: number;
}

/**
 * Notification data for transaction notifications
 */
export interface TransactionNotificationData {
  transactionId: string;
  amount: number;
  description: string;
  date: string;
  groupId?: string;
}
