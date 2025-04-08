export interface Transaction {
  id?: string;
  amount: number;
  description: string;
  date: string;
  type: TransactionType;
  categoryId: string;
  userId?: string;
  shoppingListId?: string;
  status: TransactionStatus;
  isRecurring: boolean;
  recurringDate?: number;
}

export const statuses = {
  draft: "draft",
  upcoming: "upcoming",
  overdue: "overdue",
  paid: "paid",
} as const;

export type TransactionStatus = (typeof statuses)[keyof typeof statuses];

export const types = {
  income: "income",
  expense: "expense",
} as const;

export type TransactionType = (typeof types)[keyof typeof types];
