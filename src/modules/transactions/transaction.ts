export interface Transaction {
  id?: string;
  amount: number;
  description: string;
  date: string;
  type: "income" | "expense";
  categoryId: string;
  userId?: string;
  groupId?: string;
  shoppingListId?: string;
}
