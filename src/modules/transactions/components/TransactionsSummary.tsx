import { Skeleton } from "@/components/ui/skeleton";
import { ExpansesByCategoryCard } from "@/modules/transactions/components/ExpansesByCategoryCard";
import { useTransactionsSummary } from "../hooks/useTransactionsSummaryQuery";
import { TransactionsSummaryCard } from "./TransactionsSummaryCard";

interface TransactionsSummaryProps {
  startDate?: Date;
  endDate?: Date;
}

export function TransactionsSummary({
  startDate,
  endDate,
}: TransactionsSummaryProps) {
  const { data: summary, isLoading } = useTransactionsSummary(
    startDate,
    endDate,
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-lg p-4 shadow">
            <Skeleton className="h-6 w-3/4 mb-4" />
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!summary || summary.categorySummaries.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <TransactionsSummaryCard key={summary.month} summary={summary} />
      <ExpansesByCategoryCard categorySummaries={summary.categorySummaries} />
    </div>
  );
}
