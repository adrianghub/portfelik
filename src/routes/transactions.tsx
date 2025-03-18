import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { getFirstDayOfMonth, getLastDayOfMonth } from "@/lib/date-utils";
import { createProtectedLoader } from "@/lib/ProtectedRoute";
import {
  DateRange,
  DateRangeFilter,
  getMonthName,
} from "@/modules/transactions/components/DateRangeFilter";
import { TransactionDialog } from "@/modules/transactions/components/TransactionDialog";
import { TransactionTable } from "@/modules/transactions/components/TransactionTable";
import type { Transaction } from "@/modules/transactions/transaction";
import {
  useAddTransaction,
  useTransactions,
  useUpdateTransaction,
} from "@/modules/transactions/useTransactionsQuery";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";

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

  const {
    data: transactions = [],
    isLoading,
    refetch,
    error,
  } = useTransactions(dateRange.start.toDate(), dateRange.end.toDate());

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
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    refetch();
  };

  const handleSubmitTransaction = (transaction: Transaction) => {
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
          <Button variant="outline" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : hasTransactions ? (
        <TransactionTable
          transactions={transactions}
          onEdit={handleOpenDialog}
          showUserInfo={isAdmin}
        />
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
        transaction={editingTransaction}
        onSubmit={handleSubmitTransaction}
      />
    </div>
  );
}
