import { formatCurrency } from "@/lib/format-currency";
import { cn } from "@/lib/styling-utils";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MonthlySummary } from "../hooks/useTransactionsSummaryQuery";

interface TransactionsSummaryCardProps {
  summary: MonthlySummary;
}

export function TransactionsSummaryCard({
  summary,
}: TransactionsSummaryCardProps) {
  const { t } = useTranslation();
  const isPositiveDelta = summary.delta >= 0;

  return (
    <div className="bg-card rounded-lg p-4 shadow">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted p-3 rounded-md">
            <div className="flex items-center text-green-600 mb-1">
              <ArrowUpIcon className="h-4 w-4 mr-1" />
              <span className="text-xs font-medium">
                {t("transactions.income")}
              </span>
            </div>
            <div className="text-lg font-bold">
              {formatCurrency(summary.totalIncome)}
            </div>
          </div>

          <div className="bg-muted p-3 rounded-md">
            <div className="flex items-center text-destructive mb-1">
              <ArrowDownIcon className="h-4 w-4 mr-1" />
              <span className="text-xs font-medium">
                {t("transactions.expenses")}
              </span>
            </div>
            <div className="text-lg font-bold">
              {formatCurrency(summary.totalExpenses)}
            </div>
          </div>
        </div>

        <div className="bg-muted p-3 rounded-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">
              {t("transactions.netIncome")}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                isPositiveDelta ? "text-green-600" : "text-destructive",
              )}
            >
              {isPositiveDelta
                ? t("transactions.surplus")
                : t("transactions.deficit")}
            </span>
          </div>
          <div
            className={cn(
              "text-lg font-bold",
              isPositiveDelta ? "text-green-600" : "text-destructive",
            )}
          >
            {formatCurrency(summary.delta)}
          </div>
        </div>
      </div>
    </div>
  );
}
