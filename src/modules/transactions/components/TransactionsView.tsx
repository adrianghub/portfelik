import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import dayjs, {
  getFirstDayOfMonth,
  getLastDayOfMonth,
  getMonthNameWithYear,
} from "@/lib/date-utils";
import { COLLECTIONS } from "@/lib/firebase/firestore";
import { useUserGroups } from "@/modules/settings/hooks/useUserGroups";
import { FloatingActionButtonGroup } from "@/modules/shared/components/FloatingActionButtonGroup";
import { TransactionTable } from "@/modules/transactions/components/TransactionTable";
import { TRANSACTION_SUMMARY_QUERY_KEY } from "@/modules/transactions/hooks/useTransactionsSummaryQuery";
import { Route } from "@/routes/transactions";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, RefreshCw } from "lucide-react";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAddTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from "../hooks/useTransactionsQuery";
import { useTransactionToasts } from "../hooks/useTransactionToasts";
import type { Transaction } from "../transaction";
import { type DateRange } from "./DateRangeFilter";
import { TableFilters } from "./TableFilters";
import { TransactionDialog } from "./TransactionDialog";
import { TransactionsSummary } from "./TransactionsSummary";

export function TransactionsView() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const dateRange = React.useMemo(() => {
    const defaultStart = getFirstDayOfMonth();
    const defaultEnd = getLastDayOfMonth();

    const start =
      search.startDate && dayjs(search.startDate, "YYYY-MM-DD", true).isValid()
        ? dayjs(search.startDate, "YYYY-MM-DD", true)
        : defaultStart;
    const end =
      search.endDate && dayjs(search.endDate, "YYYY-MM-DD", true).isValid()
        ? dayjs(search.endDate, "YYYY-MM-DD", true)
        : defaultEnd;

    if (start.isAfter(end)) {
      return { start: defaultStart, end: defaultEnd };
    }
    return { start, end };
  }, [search.startDate, search.endDate]);

  const { userData } = useAuth();
  const { data: userGroups } = useUserGroups();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useTransactionToasts();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    data: transactions = [],
    isLoading,
    refetch,
    error,
  } = useTransactions(dateRange.start.toDate(), dateRange.end.toDate());

  const addTransaction = useAddTransaction();
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const handleDateRangeChange = useCallback(
    (newDateRange: DateRange) => {
      navigate({
        search: (prev) => ({
          ...prev,
          startDate: newDateRange.start.format("YYYY-MM-DD"),
          endDate: newDateRange.end.format("YYYY-MM-DD"),
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleOpenDialog = (transaction?: Transaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
    } else {
      setEditingTransaction(null);
    }
    setIsDialogOpen(true);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const startTime = Date.now();
      await queryClient.invalidateQueries({
        queryKey: [COLLECTIONS.TRANSACTIONS, TRANSACTION_SUMMARY_QUERY_KEY],
      });
      await refetch();
      showSuccessToast("refresh");

      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 - elapsedTime));
      }
    } catch (error) {
      showErrorToast("refresh", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSubmitTransaction = (transaction: Transaction) => {
    if (editingTransaction?.id) {
      updateTransaction.mutate(
        {
          id: editingTransaction.id,
          transaction: transaction,
        },
        {
          onSuccess: () => {
            showSuccessToast("update");
            setIsDialogOpen(false);
            setEditingTransaction(null);
          },
          onError: (error) => {
            showErrorToast("update", error);
          },
        },
      );
    } else {
      addTransaction.mutate(transaction, {
        onSuccess: () => {
          showSuccessToast("create");
          setIsDialogOpen(false);
          setEditingTransaction(null);
          queryClient.invalidateQueries({
            queryKey: [COLLECTIONS.TRANSACTIONS],
          });
          refetch();
        },
        onError: (error) => {
          showErrorToast("create", error);
        },
      });
    }
  };

  const hasTransactions = transactions.length > 0;

  console.log(dateRange);

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const handleBulkDelete = () => {
    Object.keys(rowSelection).forEach((id) => {
      if (rowSelection[id]) {
        deleteTransaction.mutate(id, {
          onSuccess: () => {
            showSuccessToast("delete");
          },
          onError: (error) => {
            showErrorToast("delete", error);
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
              {t("transactions.greetings", {
                userName: userData?.name ?? userData?.email,
              })}
            </h1>
            {userGroups && userGroups.length > 1 ? (
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "transactions.viewingAllUsersTransactionsSummaryFromRelatedGroups",
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                {t("transactions.viewingUserTransactionsSummary")}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center">
          <TableFilters
            startDate={dateRange.start}
            endDate={dateRange.end}
            onDateRangeChange={handleDateRangeChange}
            rowSelection={rowSelection}
            onBulkDelete={handleBulkDelete}
            onUnselectAll={() => setRowSelection({})}
          />

          <div className="flex gap-2 ml-auto">
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              variant="ghost"
              className="flex items-center gap-1"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>{t("transactions.refresh")}</span>
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              className="hidden md:flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              <span>{t("transactions.addTransaction")}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <TransactionsSummary
          startDate={dateRange.start.toDate()}
          endDate={dateRange.end.toDate()}
        />
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold">
          {t("transactions.transactionsList")}
        </h2>
      </div>

      {isLoading ? (
        <div className="shadow rounded-lg p-4 md:p-6 flex justify-center">
          <p className="text-muted-foreground">
            {t("transactions.loadingTransactions")}
          </p>
        </div>
      ) : error ? (
        <div className="shadow rounded-lg p-4 md:p-6 flex flex-col items-center justify-center">
          <p className="text-destructive font-medium mb-2">
            {t("transactions.errorLoadingTransactions")}
          </p>
          <Button variant="outline" className="mt-2" onClick={() => refetch()}>
            {t("transactions.retry")}
          </Button>
        </div>
      ) : hasTransactions ? (
        <TransactionTable
          transactions={transactions}
          onEdit={handleOpenDialog}
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          userData={userData}
        />
      ) : (
        <div className="shadow rounded-lg p-4 md:p-6 flex flex-col items-center justify-center">
          <p className="text-muted-foreground text-center py-6">
            {dateRange.start.isSame(dateRange.end, "month")
              ? t("transactions.noTransactionsForMonth", {
                  month: getMonthNameWithYear(dateRange.start),
                })
              : t("transactions.noTransactionsForDateRange", {
                  startDate: getMonthNameWithYear(dateRange.start),
                  endDate: getMonthNameWithYear(dateRange.end),
                })}
          </p>
        </div>
      )}

      <FloatingActionButtonGroup
        buttons={[
          {
            icon: Plus,
            onClick: () => handleOpenDialog(),
            label: t("transactions.addTransaction"),
          },
        ]}
      />

      <TransactionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        transaction={editingTransaction}
        onSubmit={handleSubmitTransaction}
      />
    </div>
  );
}
