import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatDateToISOString } from "@/lib/date-utils";
import { COLLECTIONS } from "@/lib/firebase/firestore";
import { API_BASE_URL } from "@/modules/shared/constants";
import { fetcher } from "@/modules/shared/fetcher";
import type { Transaction } from "@/modules/transactions/transaction";
import { transactionService } from "@/modules/transactions/TransactionService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

export type {
  CategorySummary,
  MonthlySummary,
  TransactionSummaryResponse,
} from "./useTransactionsSummaryQuery";

const fetchTransactions = async (
  token: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
): Promise<Transaction[]> => {
  let url = `${API_BASE_URL}/api/v1/transactions`;

  if (startDate && endDate) {
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();
    url += `?startDate=${encodeURIComponent(startDateStr)}&endDate=${encodeURIComponent(endDateStr)}`;
  }

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

const fetchSharedTransactions = async (
  token: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
): Promise<Transaction[]> => {
  let url = `${API_BASE_URL}/api/v1/transactions/shared`;

  if (startDate && endDate) {
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();
    url += `?startDate=${encodeURIComponent(startDateStr)}&endDate=${encodeURIComponent(endDateStr)}`;
  }

  try {
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.transactions;
  } catch (error) {
    console.error("Error fetching shared transactions:", error);
    throw error;
  }
};

export function useTransactions(startDate?: Date, endDate?: Date) {
  const { userData, getIdToken } = useAuth();
  const userId = userData?.uid;
  const isAdmin = userData?.role === "admin";

  const dayjsStartDate = startDate ? dayjs(startDate) : undefined;
  const dayjsEndDate = endDate ? dayjs(endDate) : undefined;

  return useQuery({
    queryKey: [
      COLLECTIONS.TRANSACTIONS,
      userId,
      isAdmin,
      dayjsStartDate?.toISOString(),
      dayjsEndDate?.toISOString(),
      "withShared",
    ],
    queryFn: async () => {
      if (!userId) return [];

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Authentication token not available");
        const transactions = await fetchTransactions(
          token,
          dayjsStartDate,
          dayjsEndDate,
        );

        if (!isAdmin) {
          const sharedTransactions = await fetchSharedTransactions(
            token,
            dayjsStartDate,
            dayjsEndDate,
          );

          const allTransactions = [...transactions, ...sharedTransactions];
          allTransactions.sort((a, b) => {
            return dayjs(b.date).valueOf() - dayjs(a.date).valueOf();
          });

          return allTransactions;
        }

        return transactions;
      } catch (error) {
        console.error("Error fetching transactions:", error);
        throw error;
      }
    },
    enabled: !!userId,
  });
}

export function useSharedTransactions(startDate?: Date, endDate?: Date) {
  const { userData, getIdToken } = useAuth();
  const userId = userData?.uid;

  const dayjsStartDate = startDate ? dayjs(startDate) : undefined;
  const dayjsEndDate = endDate ? dayjs(endDate) : undefined;

  return useQuery({
    queryKey: [
      COLLECTIONS.TRANSACTIONS,
      "shared",
      userId,
      dayjsStartDate?.toISOString(),
      dayjsEndDate?.toISOString(),
    ],
    queryFn: async () => {
      if (!userId) return [];

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Authentication token not available");

        return await fetchSharedTransactions(
          token,
          dayjsStartDate,
          dayjsEndDate,
        );
      } catch (error) {
        console.error("Error fetching shared transactions:", error);
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

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => transactionService.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.TRANSACTIONS] }),
  });
}

export function isSharedTransaction(
  transaction: Transaction,
  currentUserId?: string,
): boolean {
  if (!currentUserId || !transaction.userId) return false;
  return transaction.userId !== currentUserId;
}
