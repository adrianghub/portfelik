import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatDateToISOString } from "@/lib/date-utils";
import { COLLECTIONS } from "@/lib/firebase/firestore";
import { API_BASE_URL } from "@/modules/shared/constants";
import { fetcher } from "@/modules/shared/fetcher";
import type { Transaction } from "@/modules/transactions/transaction";
import { transactionService } from "@/modules/transactions/TransactionService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { buildUrl } from "./buildUrl";
export type {
  CategorySummary,
  MonthlySummary,
  TransactionSummaryResponse,
} from "./useTransactionsSummaryQuery";

/**
 * Fetches user and shared transactions from the API
 */
const fetchTransactions = async (
  token: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
  categoryId?: string,
): Promise<Transaction[]> => {
  const url = buildUrl(
    `${API_BASE_URL}/api/v1/transactions`,
    startDate,
    endDate,
    categoryId,
  );

  try {
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.transactions;
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }
};

/**
 * Hook to fetch user and shared transactions
 */
export function useTransactions(
  startDate?: Date,
  endDate?: Date,
  categoryId?: string,
) {
  const { userData, getIdToken } = useAuth();
  const userId = userData?.uid;

  const dayjsStartDate = startDate ? dayjs(startDate) : undefined;
  const dayjsEndDate = endDate ? dayjs(endDate) : undefined;

  return useQuery({
    queryKey: [
      COLLECTIONS.TRANSACTIONS,
      userId,
      dayjsStartDate?.toISOString(),
      dayjsEndDate?.toISOString(),
      categoryId,
    ],
    queryFn: async () => {
      if (!userId) return [];

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Authentication token not available");

        return await fetchTransactions(
          token,
          dayjsStartDate,
          dayjsEndDate,
          categoryId,
        );
      } catch (error) {
        console.error("Error fetching transactions:", error);
        throw error;
      }
    },
    enabled: !!userId,
  });
}

/**
 * Hook to add a new transaction
 */
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
        date: formatDateToISOString(transaction.date),
        amount:
          transaction.type === "expense"
            ? Math.abs(transaction.amount)
            : Math.abs(transaction.amount),
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString(),
      };

      return transactionService.create(firestoreTransaction);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.TRANSACTIONS] }),
  });
}

/**
 * Hook to update an existing transaction
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient();

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
            ? Math.abs(transaction.amount ?? 0)
            : Math.abs(transaction.amount ?? 0),
        updatedAt: dayjs().toISOString(),
      };

      return transactionService.update(id, firestoreTransaction);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.TRANSACTIONS] }),
  });
}

/**
 * Hook to delete a transaction
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => transactionService.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.TRANSACTIONS] }),
  });
}

/**
 * Utility function to check if a transaction is shared
 */
export function isSharedTransaction(
  transaction: Transaction,
  currentUserId?: string,
): boolean {
  if (!currentUserId || !transaction.userId) return false;
  return transaction.userId !== currentUserId;
}
