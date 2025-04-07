import { formatCurrency } from "@/lib/format-currency";
import { cn } from "@/lib/styling-utils";
import { useFetchCategories } from "@/modules/shared/categories/useCategoriesQuery";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MonthlySummary } from "../hooks/useTransactionsSummaryQuery";

// Fixed category id for now - I'm interesting in the category related to groceries
const GROCERIES_CATEGORY_ID = "bT2wDeZ5wfCf3GJTfhLK";

interface TransactionsSummaryCardProps {
  summary: MonthlySummary;
}

export function TransactionsSummaryCard({
  summary,
}: TransactionsSummaryCardProps) {
  const { t } = useTranslation();
  const { data: categories = [] } = useFetchCategories();

  const getCategoryName = (categoryId: string) => {
    const category = categories.find((cat) => cat.id === categoryId);
    return category?.name || categoryId;
  };

  const sortedCategories = [...summary.categorySummaries].sort(
    (a, b) => b.amount - a.amount,
  );

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

        {sortedCategories.length > 0 && (
          <div className="space-y-2">
            {sortedCategories
              .filter(
                (category) => category.categoryId === GROCERIES_CATEGORY_ID,
              )
              .map((category) => (
                <div key={category.categoryId}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="truncate max-w-[70%]">
                      {getCategoryName(category.categoryId)}
                    </span>
                    <span>{Math.round(category.percentage)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-full h-2 bg-muted rounded overflow-hidden">
                      <div
                        className={`h-full bg-accent-foreground`}
                        style={{ width: `${category.percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-medium">
                      {formatCurrency(category.amount)}
                    </span>
                  </div>
                </div>
              ))}
            {sortedCategories.length > 5 && (
              <div className="text-xs text-muted-foreground text-center mt-1">
                {t("transactions.andNMoreCategories", {
                  count: sortedCategories.length - 5,
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
