export interface Transaction {
  id?: string;
  amount: number;
  description: string;
  date: string;
  type: "income" | "expense";
  category: string;
  userId?: string;
}
