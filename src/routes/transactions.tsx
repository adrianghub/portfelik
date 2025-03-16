import {
  DateRange,
  DateRangeFilter,
  getMonthName,
} from "@/components/filters/DateRangeFilter";
import {
  Transaction,
  TransactionDialog,
} from "@/components/transactions/TransactionDialog";
import { Button } from "@/components/ui/button";
import {
  getFirstDayOfMonth,
  getLastDayOfMonth,
  isDateInRange,
} from "@/lib/date-utils";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";

export const Route = createFileRoute("/transactions")({
  component: Transactions,
});

function Transactions() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: getFirstDayOfMonth(),
    end: getLastDayOfMonth(),
  });

  const handleDateRangeChange = useCallback((newDateRange: DateRange) => {
    setDateRange(newDateRange);
  }, []);

  const filteredTransactions = transactions.filter((transaction) => {
    return isDateInRange(transaction.date, dateRange.start, dateRange.end);
  });

  const hasTransactions = filteredTransactions.length > 0;
  const currentMonthName = getMonthName(dateRange.start);

  return (
    <div className="py-6 px-4 md:px-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          Transactions{" "}
          <span className="text-gray-500 text-xl">({currentMonthName})</span>
        </h1>
        {hasTransactions && (
          <Button onClick={() => setIsDialogOpen(true)}>Add Transaction</Button>
        )}
      </div>

      <div className="flex justify-between items-center mb-4">
        <DateRangeFilter onDateRangeChange={handleDateRangeChange} />
      </div>

      {hasTransactions ? (
        <div className="bg-white shadow rounded-lg p-4 md:p-6">
          {/* Transaction list will go here */}
          <p className="text-gray-500 py-4">
            Transactions for {currentMonthName}
          </p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-4 md:p-6 flex flex-col items-center justify-center">
          <p className="text-gray-500 text-center py-6">
            No transactions for {currentMonthName}. Click below to get started.
          </p>
          <Button onClick={() => setIsDialogOpen(true)} className="mt-2">
            Add Transaction
          </Button>
        </div>
      )}

      <TransactionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={(transaction: Transaction) => {
          console.log("New transaction:", transaction);

          setTransactions([...transactions, transaction]);
          setIsDialogOpen(false);
        }}
      />
    </div>
  );
}
