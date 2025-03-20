import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { getFirstDayOfMonth, getLastDayOfMonth } from "@/lib/date-utils";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Transaction } from "../transaction";
import {
  useAddTransaction,
  useTransactions,
  useUpdateTransaction,
} from "../useTransactionsQuery";
import { DateRange, DateRangeFilter, getMonthName } from "./DateRangeFilter";
import { TransactionDialog } from "./TransactionDialog";
import { TransactionHeaderButtons } from "./TransactionHeaderButtons";
import { TransactionTable } from "./TransactionTable";

export function TransactionsView() {
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
            <h1 className="flex items-center flex-wrap">
              {isAdmin ? "All Transactions" : "My Transactions"}
            </h1>
            {isAdmin && (
              <p className="text-sm text-gray-500 mt-1">
                Viewing transactions from all users
              </p>
            )}
          </div>
          <div className="flex">
            <div className="sm:flex gap-2 hidden mr-auto">
              <TransactionHeaderButtons
                handleRefresh={handleRefresh}
                handleOpenDialog={handleOpenDialog}
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <DateRangeFilter onDateRangeChange={handleDateRangeChange} />

          <div className="flex gap-2 self-auto ml-auto sm:hidden">
            <TransactionHeaderButtons
              handleRefresh={handleRefresh}
              handleOpenDialog={handleOpenDialog}
              isLoading={isLoading}
            />
          </div>
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
