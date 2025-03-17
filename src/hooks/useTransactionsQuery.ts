import { Transaction as UITransaction } from "@/components/transactions/TransactionDialog";
import { useAuth } from "@/lib/auth-context";
import {
  Transaction as FirestoreTransaction,
  transactionService,
} from "@/lib/services";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Adapter functions to convert between UI and Firestore transaction formats
const firestoreToUITransaction = (
  firestoreTransaction: FirestoreTransaction,
): UITransaction => {
  console.log("Converting Firestore transaction to UI:", firestoreTransaction);
  return {
    id: firestoreTransaction.id,
    amount: firestoreTransaction.amount,
    description: firestoreTransaction.description,
    date: firestoreTransaction.date.toISOString().split("T")[0], // Convert to YYYY-MM-DD
    type: firestoreTransaction.amount >= 0 ? "income" : "expense",
    category: firestoreTransaction.categoryId,
    userId: firestoreTransaction.userId, // Include userId for admin views
  };
};

const uiToFirestoreTransaction = (
  uiTransaction: UITransaction,
  userId: string,
): Omit<FirestoreTransaction, "id" | "createdAt" | "updatedAt"> => {
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
    categoryId: uiTransaction.category,
    date: new Date(uiTransaction.date),
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
            console.log("Fetching transactions by date range");
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

            // If we get an index error, fall back to getting all transactions and filtering in memory
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

              // Filter by date range in memory
              console.log("Filtering transactions by date range in memory");
              transactions = transactions.filter((transaction) => {
                const transactionDate = transaction.date;
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
        const uiTransactions = transactions.map(firestoreToUITransaction);
        console.log("Converted UI transactions:", uiTransactions);
        return uiTransactions;
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
    mutationFn: (transaction: UITransaction) => {
      console.log("Adding transaction:", transaction);

      if (!userId) {
        console.error("No userId available");
        throw new Error("User not authenticated");
      }

      const firestoreTransaction = uiToFirestoreTransaction(
        transaction,
        userId,
      );
      const now = new Date();

      console.log("Firestore transaction to create:", {
        ...firestoreTransaction,
        createdAt: now,
        updatedAt: now,
      });

      return transactionService.create({
        ...firestoreTransaction,
        createdAt: now,
        updatedAt: now,
      });
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
      updates: Partial<UITransaction>;
    }) => {
      if (!userId) throw new Error("User not authenticated");

      const firestoreUpdates: Record<string, unknown> = {};

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
        firestoreUpdates.categoryId = updates.category;
      }

      if (updates.date !== undefined) {
        firestoreUpdates.date = new Date(updates.date);
      }

      return transactionService.update(transactionId, {
        ...firestoreUpdates,
        updatedAt: new Date(),
      });
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
