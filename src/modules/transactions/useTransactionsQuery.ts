import { useAuth } from "@/hooks/useAuth";
import type { Transaction } from "@/modules/transactions/transaction";
import { transactionService } from "@/modules/transactions/TransactionService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTransactionToasts } from "./useTransactionToasts";

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
  const { showSuccessToast, showErrorToast } = useTransactionToasts();

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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return transactionService.create(firestoreTransaction);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      showSuccessToast("create");
    },
    onError: (error) => {
      showErrorToast("create", error);
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useTransactionToasts();

  return useMutation({
    mutationFn: ({
      id,
      transaction,
    }: {
      id: string;
      transaction: Partial<Transaction>;
    }) => {
      const firestoreTransaction = {
        ...transaction,
        date: transaction.date ? formatDate(transaction.date) : undefined,
        amount:
          transaction.type === "expense"
            ? -Math.abs(transaction.amount ?? 0)
            : Math.abs(transaction.amount ?? 0),
      };

      return transactionService.update(id, firestoreTransaction);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      showSuccessToast("update");
    },
    onError: (error) => {
      showErrorToast("update", error);
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useTransactionToasts();

  return useMutation({
    mutationFn: (id: string) => transactionService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      showSuccessToast("delete");
    },
    onError: (error) => {
      showErrorToast("delete", error);
    },
  });
}
