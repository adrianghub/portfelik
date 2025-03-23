export interface Transaction {
  id?: string;
  amount: number;
  description: string;
  date: Date;
  type: "income" | "expense";
  categoryId: string;
  userId?: string;
  shoppingListId?: string;
}
