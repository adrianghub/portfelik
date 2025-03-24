import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { getFirstDayOfMonth, getLastDayOfMonth } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../transaction";
import {
  useAddTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from "../useTransactionsQuery";
import { DateRange, getMonthName } from "./DateRangeFilter";
import { TableFilters } from "./TableFilters";
import { TransactionDialog } from "./TransactionDialog";
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
  const { t } = useTranslation();
  const isAdmin = userData?.role === "admin";

  const {
    data: transactions = [],
    isLoading,
    refetch,
    error,
  } = useTransactions(dateRange.start.toDate(), dateRange.end.toDate());

  const addTransaction = useAddTransaction();
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();

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
            logger.info(
              "TransactionsView",
              "Transaction updated successfully:",
              result,
            );
            setIsDialogOpen(false);
            setEditingTransaction(null);
          },
          onError: (error) => {
            logger.error(
              "TransactionsView",
              "Error updating transaction:",
              error,
            );
          },
        },
      );
    } else {
      addTransaction.mutate(transaction, {
        onSuccess: (result) => {
          logger.info(
            "TransactionsView",
            "Transaction added successfully:",
            result,
          );
          setIsDialogOpen(false);
          setEditingTransaction(null);
        },
        onError: (error) => {
          logger.error("TransactionsView", "Error adding transaction:", error);
        },
      });
    }
  };

  const hasTransactions = transactions.length > 0;
  const currentMonthName = getMonthName(dateRange.start);

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const handleBulkDelete = () => {
    Object.keys(rowSelection).forEach((id) => {
      if (rowSelection[id]) {
        deleteTransaction.mutate(id, {
          onSuccess: () => {
            logger.info(
              "TransactionsView",
              `Transaction ${id} deleted successfully.`,
            );
          },
          onError: (error) => {
            logger.error(
              "TransactionsView",
              `Error deleting transaction ${id}:`,
              error,
            );
          },
        });
      }
    });
    setRowSelection({});
  };

  return (
    <div className="py-6 px-4 md:px-6">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
          <div className="mb-3 sm:mb-0">
            <h1 className="flex items-center flex-wrap">
              {isAdmin
                ? t("transactions.allTransactions")
                : t("transactions.myTransactions")}
            </h1>
            {isAdmin && (
              <p className="text-sm text-gray-500 mt-1">
                {t("transactions.viewingTransactionsFromAllUsers")}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center">
          <TableFilters
            onDateRangeChange={handleDateRangeChange}
            rowSelection={rowSelection}
            onBulkDelete={handleBulkDelete}
            onUnselectAll={() => setRowSelection({})}
          />

          <div className="flex gap-2 ml-auto">
            <Button
              onClick={handleRefresh}
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-1"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              <span className="hidden lg:inline">Refresh</span>
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              className="flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden lg:inline">Add Transaction</span>
              <span className="lg:hidden">Add</span>
            </Button>
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
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
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
