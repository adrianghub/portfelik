export interface Transaction {
  amount: number;
  type: "income" | "expense";
  date: Date;
}
