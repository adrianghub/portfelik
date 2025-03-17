import { Button } from "@/components/ui/button";
import { useDeleteTransaction } from "@/hooks/useTransactionsQuery";
import { useState } from "react";
import { Transaction } from "./TransactionDialog";

interface TransactionListProps {
  transactions: Transaction[];
  onEdit?: (transaction: Transaction) => void;
}

export function TransactionList({
  transactions,
  onEdit,
}: TransactionListProps) {
  const deleteTransaction = useDeleteTransaction();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = (id?: string) => {
    if (!id) return;

    setDeletingId(id);
    deleteTransaction.mutate(id, {
      onSuccess: () => {
        setDeletingId(null);
      },
      onError: (error) => {
        console.error("Error deleting transaction:", error);
        setDeletingId(null);
      },
    });
  };

  return (
    <div className="space-y-4">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="border-b pb-3 flex justify-between items-center"
        >
          <div>
            <p className="font-medium">{transaction.description}</p>
            <p className="text-sm text-gray-500">{transaction.date}</p>
          </div>
          <div className="flex items-center gap-2">
            <p
              className={`font-semibold ${transaction.type === "income" ? "text-green-600" : "text-red-600"}`}
            >
              {transaction.type === "income" ? "+" : "-"}
              {Math.abs(transaction.amount).toFixed(2)} zł
            </p>

            <div className="flex gap-2">
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(transaction)}
                >
                  Edit
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDelete(transaction.id)}
                disabled={deletingId === transaction.id}
                className="text-red-600 hover:bg-red-50"
              >
                {deletingId === transaction.id ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
