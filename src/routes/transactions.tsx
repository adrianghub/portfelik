import {
  DateRange,
  DateRangeFilter,
  getMonthName,
} from "@/components/filters/DateRangeFilter";
import {
  Transaction,
  TransactionDialog,
} from "@/components/transactions/TransactionDialog";
import { TransactionList } from "@/components/transactions/TransactionList";
import { Button } from "@/components/ui/button";
import {
  useAddTransaction,
  useTransactions,
  useUpdateTransaction,
} from "@/hooks/useTransactionsQuery";
import { useAuth } from "@/lib/auth-context";
import { getFirstDayOfMonth, getLastDayOfMonth } from "@/lib/date-utils";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore";
import { createProtectedLoader } from "@/lib/protected-route";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export const Route = createFileRoute("/transactions")({
  component: Transactions,
  loader: createProtectedLoader(),
});

function Transactions() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: getFirstDayOfMonth(),
    end: getLastDayOfMonth(),
  });
  const { userData } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = userData?.role === "admin";

  useEffect(() => {
    console.log("Date range:", {
      start: dateRange.start.format("YYYY-MM-DD"),
      startDate: dateRange.start.toDate(),
      end: dateRange.end.format("YYYY-MM-DD"),
      endDate: dateRange.end.toDate(),
    });
  }, [dateRange]);

  useEffect(() => {
    if (!userData?.uid) return;

    const checkFirestore = async () => {
      try {
        console.log("Directly checking Firestore for transactions...");
        const q = isAdmin
          ? query(collection(db, COLLECTIONS.TRANSACTIONS))
          : query(
              collection(db, COLLECTIONS.TRANSACTIONS),
              where("userId", "==", userData.uid),
            );
        const querySnapshot = await getDocs(q);

        console.log(
          `Found ${querySnapshot.size} transactions directly in Firestore`,
        );

        querySnapshot.forEach((doc) => {
          console.log("Transaction from Firestore:", {
            id: doc.id,
            ...doc.data(),
          });
        });
      } catch (error) {
        console.error("Error directly checking Firestore:", error);
      }
    };

    checkFirestore();
  }, [userData, isAdmin]);

  const {
    data: transactions = [],
    isLoading,
    refetch,
    error,
  } = useTransactions(dateRange.start.toDate(), dateRange.end.toDate());

  useEffect(() => {
    console.log("Transactions from query:", transactions);
  }, [transactions]);

  const addTransaction = useAddTransaction();
  const updateTransaction = useUpdateTransaction();

  const handleDateRangeChange = useCallback((newDateRange: DateRange) => {
    setDateRange(newDateRange);
  }, []);

  const handleOpenDialog = (transaction?: Transaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
    } else {
      setEditingTransaction(null);
    }
    setIsDialogOpen(true);
  };

  const handleRefresh = () => {
    console.log("Manually refreshing transactions...");
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    refetch();
  };

  const handleSubmitTransaction = (transaction: Transaction) => {
    console.log("Submitting transaction:", transaction);

    if (editingTransaction?.id) {
      updateTransaction.mutate(
        {
          transactionId: editingTransaction.id,
          updates: transaction,
        },
        {
          onSuccess: (result) => {
            console.log("Transaction updated successfully:", result);
            setIsDialogOpen(false);
            setEditingTransaction(null);
          },
          onError: (error) => {
            console.error("Error updating transaction:", error);
          },
        },
      );
    } else {
      addTransaction.mutate(transaction, {
        onSuccess: (result) => {
          console.log("Transaction added successfully:", result);
          setIsDialogOpen(false);
          setEditingTransaction(null);
        },
        onError: (error) => {
          console.error("Error adding transaction:", error);
        },
      });
    }
  };

  const hasTransactions = transactions.length > 0;
  const currentMonthName = getMonthName(dateRange.start);

  // Check if the error is a Firestore index error
  const isIndexError = error?.message?.includes("requires an index");
  const indexUrl = error?.message?.match(
    /https:\/\/console\.firebase\.google\.com[^\s]*/,
  )?.[0];

  return (
    <div className="py-6 px-4 md:px-6">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
          <div className="mb-3 sm:mb-0">
            <h1 className="text-2xl font-bold flex items-center flex-wrap">
              {isAdmin ? "All Transactions" : "My Transactions"}
              <span className="text-gray-500 text-xl ml-2">
                ({currentMonthName})
              </span>
            </h1>
            {isAdmin && (
              <p className="text-sm text-gray-500 mt-1">
                Viewing transactions from all users
              </p>
            )}
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <Button
              onClick={handleRefresh}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              className="flex items-center gap-1"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Transaction</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        <div className="w-full">
          <DateRangeFilter onDateRangeChange={handleDateRangeChange} />
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white shadow rounded-lg p-4 md:p-6 flex justify-center">
          <p className="text-gray-500">Loading transactions...</p>
        </div>
      ) : error ? (
        <div className="bg-white shadow rounded-lg p-4 md:p-6 flex flex-col items-center justify-center">
          <p className="text-red-500 font-medium mb-2">
            Error loading transactions
          </p>
          <p className="text-gray-600 text-center mb-4">
            {isIndexError
              ? "This query requires a Firestore index to be created."
              : error.message}
          </p>

          {isIndexError && indexUrl && (
            <div className="mb-4 text-center">
              <p className="mb-2">
                Click the button below to create the required index:
              </p>
              <a
                href={indexUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                Create Firestore Index
              </a>
            </div>
          )}

          <Button variant="outline" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : hasTransactions ? (
        <div className="bg-white shadow rounded-lg p-4 md:p-6">
          <TransactionList
            transactions={transactions}
            onEdit={handleOpenDialog}
            showUserInfo={isAdmin}
          />
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-4 md:p-6 flex flex-col items-center justify-center">
          <p className="text-gray-500 text-center py-6">
            No transactions for {currentMonthName}. Click below to get started.
          </p>
          <Button onClick={() => handleOpenDialog()} className="mt-2">
            Add Transaction
          </Button>
        </div>
      )}

      <TransactionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        transaction={editingTransaction || undefined}
        onSubmit={handleSubmitTransaction}
      />
    </div>
  );
}
