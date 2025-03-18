import { useAuth } from "@/lib/AuthContext";
import type { Transaction } from "@/modules/transactions/transaction";
import { transactionService } from "@/modules/transactions/TransactionService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

const formatDate = (date: string | Date) => dayjs(date).toISOString();

const filterTransactionsByDate = (
  transactions: Transaction[],
  startDate: Date,
  endDate: Date,
) => {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  return transactions.filter((transaction) => {
    const transactionDate = dayjs(transaction.date);
    return (
      transactionDate.isAfter(start, "day") &&
      transactionDate.isBefore(end, "day")
    );
  });
};

export function useTransactions(startDate?: Date, endDate?: Date) {
  const { userData } = useAuth();
  const userId = userData?.uid;
  const isAdmin = userData?.role === "admin";

  return useQuery({
    queryKey: [
      "transactions",
      userId,
      isAdmin,
      startDate?.toISOString(),
      endDate?.toISOString(),
    ],
    queryFn: async () => {
      if (!userId) return [];

      try {
        const transactions =
          startDate && endDate
            ? isAdmin
              ? await transactionService.getAllTransactionsByDateRange(
                  startDate,
                  endDate,
                )
              : await transactionService.getTransactionsByDateRange(
                  userId,
                  startDate,
                  endDate,
                )
            : isAdmin
              ? await transactionService.getAllTransactions()
              : await transactionService.getUserTransactions(userId);

        return startDate && endDate
          ? filterTransactionsByDate(transactions, startDate, endDate)
          : transactions;
      } catch (error) {
        console.error("Error fetching transactions:", error);
        throw error;
      }
    },
    enabled: !!userId,
  });
}

export function useAddTransaction() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useMutation({
    mutationFn: (transaction: Transaction) => {
      if (!userId) throw new Error("User not authenticated");

      const firestoreTransaction = {
        ...transaction,
        userId,
        date: formatDate(transaction.date),
        amount:
          transaction.type === "expense"
            ? -Math.abs(transaction.amount)
            : Math.abs(transaction.amount),
      };

      return transactionService.create(firestoreTransaction);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (error) => {
      console.error("Error adding transaction:", error);
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useMutation({
    mutationFn: ({
      transactionId,
      updates,
    }: {
      transactionId: string;
      updates: Partial<Transaction>;
    }) => {
      if (!userId) throw new Error("User not authenticated");

      const firestoreUpdates: Partial<Transaction> = {
        ...updates,
        ...(updates.amount !== undefined && {
          amount:
            updates.type === "expense"
              ? -Math.abs(updates.amount)
              : Math.abs(updates.amount),
        }),
        ...(updates.date && { date: formatDate(updates.date) }),
      };

      return transactionService.update(transactionId, firestoreUpdates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) =>
      transactionService.delete(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
