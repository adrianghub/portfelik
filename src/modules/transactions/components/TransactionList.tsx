import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date-utils";
import { userService } from "@/modules/admin/users/UserService";
import { useFetchCategories } from "@/modules/shared/useCategoriesQuery";
import type { Transaction } from "@/modules/transactions/transaction";
import { useDeleteTransaction } from "@/modules/transactions/useTransactionsQuery";
import { useEffect, useState } from "react";

interface TransactionListProps {
  transactions: Transaction[];
  onEdit?: (transaction: Transaction) => void;
  showUserInfo?: boolean;
}

export function TransactionList({
  transactions,
  onEdit,
  showUserInfo = false,
}: TransactionListProps) {
  const deleteTransaction = useDeleteTransaction();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const { data: categories = [], isLoading: loadingCategories } =
    useFetchCategories();

  useEffect(() => {
    if (!showUserInfo) return;

    const loadUserEmails = async () => {
      setLoadingUsers(true);

      const userIds = [
        ...new Set(transactions.filter((t) => t.userId).map((t) => t.userId!)),
      ];

      if (userIds.length === 0) {
        setLoadingUsers(false);
        return;
      }

      const emailsMap: Record<string, string> = {};
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const user = await userService.getById(userId);
            emailsMap[userId] = user?.email || "Unknown";
          } catch (error) {
            console.error(`Error fetching user ${userId}:`, error);
            emailsMap[userId] = "Unknown";
          }
        }),
      );

      setUserEmails(emailsMap);
      setLoadingUsers(false);
    };

    loadUserEmails();
  }, [transactions, showUserInfo]);

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

  const getCategoryName = (categoryId: string): string => {
    if (loadingCategories) return "Loading...";
    const category = categories.find((cat) => cat.id === categoryId);
    return category ? category.name : "Unknown category";
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
            <p className="text-sm text-gray-500">
              {formatDate(transaction.date)}
            </p>
            <p className="text-xs text-gray-500">
              {getCategoryName(transaction.categoryId)}
            </p>
            {showUserInfo && transaction.userId && (
              <p className="text-xs text-gray-400 mt-1">
                {loadingUsers
                  ? "Loading user..."
                  : `User: ${userEmails[transaction.userId] || "Unknown"}`}
              </p>
            )}
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
