import { useAuth } from "@/lib/AuthContext";
import type { Transaction } from "@/modules/transactions/transaction";
import { transactionService } from "@/modules/transactions/TransactionService";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const uiToFirestoreTransaction = (
  uiTransaction: Transaction,
  userId: string,
): Omit<Transaction, "id"> => {
  console.log(
    "Converting UI transaction to Firestore:",
    uiTransaction,
    "userId:",
    userId,
  );
  return {
    userId,
    amount:
      uiTransaction.type === "expense"
        ? -Math.abs(uiTransaction.amount)
        : Math.abs(uiTransaction.amount),
    description: uiTransaction.description,
    category: uiTransaction.category,
    date: uiTransaction.date,
    type: uiTransaction.type,
  };
};

const TRANSACTIONS_QUERY_KEY = ["transactions"];

export function useTransactions(startDate?: Date, endDate?: Date) {
  const { userData } = useAuth();
  const userId = userData?.uid;
  const isAdmin = userData?.role === "admin";

  console.log("useTransactions hook called with:", {
    userId,
    isAdmin,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
    userData,
  });

  return useQuery({
    queryKey: [
      ...TRANSACTIONS_QUERY_KEY,
      userId,
      isAdmin,
      startDate?.toISOString(),
      endDate?.toISOString(),
    ],
    queryFn: async () => {
      console.log("Transaction query function executing with:", {
        userId,
        isAdmin,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      });

      if (!userId) {
        console.log("No userId available, returning empty array");
        return [];
      }

      try {
        let transactions;

        // First try to get transactions with date range filtering
        if (startDate && endDate) {
          try {
            if (isAdmin) {
              // Admin users can see all transactions
              transactions =
                await transactionService.getAllTransactionsByDateRange(
                  startDate,
                  endDate,
                );
            } else {
              // Regular users can only see their own transactions
              transactions =
                await transactionService.getTransactionsByDateRange(
                  userId,
                  startDate,
                  endDate,
                );
            }
            console.log("Successfully fetched transactions by date range");
          } catch (error) {
            console.error("Error fetching transactions by date range:", error);

            if (
              error instanceof Error &&
              error.message.includes("requires an index")
            ) {
              console.log(
                "Index error detected, falling back to fetching all transactions",
              );
              if (isAdmin) {
                transactions = await transactionService.getAllTransactions();
              } else {
                transactions =
                  await transactionService.getUserTransactions(userId);
              }

              console.log("Filtering transactions by date range in memory");
              transactions = transactions.filter((transaction: Transaction) => {
                // Convert string date to Date object for comparison
                const transactionDate = new Date(transaction.date);
                return (
                  transactionDate >= startDate && transactionDate <= endDate
                );
              });
            } else {
              // If it's not an index error, rethrow
              throw error;
            }
          }
        } else {
          // If no date range is provided, just get all transactions
          console.log("Fetching all transactions");
          if (isAdmin) {
            transactions = await transactionService.getAllTransactions();
          } else {
            transactions = await transactionService.getUserTransactions(userId);
          }
        }

        console.log("Raw transactions from Firestore:", transactions);
        return transactions;
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
      console.log("Adding transaction:", transaction);

      if (!userId) {
        console.error("No userId available");
        throw new Error("User not authenticated");
      }

      const firestoreTransaction = uiToFirestoreTransaction(
        transaction,
        userId,
      );

      console.log("Firestore transaction to create:", firestoreTransaction);

      return transactionService.create(firestoreTransaction);
    },
    onSuccess: (result) => {
      console.log("Transaction added successfully:", result);
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
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

      const firestoreUpdates: Partial<Transaction> = {};

      if (updates.amount !== undefined || updates.type !== undefined) {
        const amount = updates.amount ?? 0;
        const type = updates.type ?? "expense";
        firestoreUpdates.amount =
          type === "expense" ? -Math.abs(amount) : Math.abs(amount);
      }

      if (updates.description !== undefined) {
        firestoreUpdates.description = updates.description;
      }

      if (updates.category !== undefined) {
        firestoreUpdates.category = updates.category;
      }

      if (updates.date !== undefined) {
        firestoreUpdates.date = updates.date;
      }

      if (updates.type !== undefined) {
        firestoreUpdates.type = updates.type;
      }

      return transactionService.update(transactionId, firestoreUpdates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) =>
      transactionService.delete(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
    },
  });
}
