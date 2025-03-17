import { Transaction, transactionService } from "@/lib/services";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const TRANSACTIONS_QUERY_KEY = ["transactions"];

export function useFetchTransactions(userId: string) {
  return useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEY, userId],
    queryFn: () => transactionService.getUserTransactions(userId),
    enabled: !!userId,
  });
}

export function useFetchTransactionsByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date,
) {
  return useQuery({
    queryKey: [
      ...TRANSACTIONS_QUERY_KEY,
      userId,
      "dateRange",
      startDate.toISOString(),
      endDate.toISOString(),
    ],
    queryFn: () =>
      transactionService.getTransactionsByDateRange(userId, startDate, endDate),
    enabled: !!userId && !!startDate && !!endDate,
  });
}

export function useFetchTransactionsByCategory(
  userId: string,
  categoryId: string,
) {
  return useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEY, userId, "category", categoryId],
    queryFn: () =>
      transactionService.getTransactionsByCategory(userId, categoryId),
    enabled: !!userId && !!categoryId,
  });
}

export function useAddTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      transaction: Omit<Transaction, "id" | "createdAt" | "updatedAt">,
    ) => {
      const now = new Date();
      return transactionService.create({
        ...transaction,
        createdAt: now,
        updatedAt: now,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...TRANSACTIONS_QUERY_KEY, variables.userId],
      });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transactionId,
      updates,
    }: {
      transactionId: string;
      updates: Partial<Omit<Transaction, "id" | "createdAt" | "updatedAt">>;
    }) => {
      return transactionService.update(transactionId, {
        ...updates,
        updatedAt: new Date(),
      });
    },
    onSuccess: (transaction) => {
      if (transaction && transaction.userId) {
        queryClient.invalidateQueries({
          queryKey: [...TRANSACTIONS_QUERY_KEY, transaction.userId],
        });
      }
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: string) => {
      // Get the transaction to find the userId before deleting
      const transaction = await transactionService.get(transactionId);
      const userId = transaction?.userId;

      // Delete the transaction
      await transactionService.delete(transactionId);

      return { transactionId, userId };
    },
    onSuccess: (result) => {
      if (result.userId) {
        queryClient.invalidateQueries({
          queryKey: [...TRANSACTIONS_QUERY_KEY, result.userId],
        });
      }
    },
  });
}
