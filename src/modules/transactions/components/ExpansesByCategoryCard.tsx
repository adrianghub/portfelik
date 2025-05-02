import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format-currency";
import { ExpansesByCategoryDialog } from "@/modules/transactions/components/ExpansesByCategoryDialog";
import { useTranslation } from "react-i18next";
import { type CategorySummary } from "../hooks/useTransactionsSummaryQuery";

interface ExpansesByCategoryCardProps {
  categorySummaries: CategorySummary[];
}

export function ExpansesByCategoryCard({
  categorySummaries,
}: ExpansesByCategoryCardProps) {
  const { t } = useTranslation();

  const sortedCategories = [...categorySummaries].sort(
    (a, b) => b.transactionCount - a.transactionCount,
  );

  return (
    <div className="bg-card rounded-lg p-4 shadow">
      <div className="space-y-4">
        {sortedCategories.length > 0 && (
          <div className="space-y-2">
            {sortedCategories.slice(0, 3).map((category) => (
              <div key={category.categoryId}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="truncate max-w-[70%]">
                    {category.categoryName} ({category.transactionCount})
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
          </div>
        )}
        {sortedCategories.length > 3 && (
          <ExpansesByCategoryDialog
            trigger={
              <Button variant="ghost" className="text-sm w-full">
                + {sortedCategories.length - 3}{" "}
                {t("transactions.expensesByCategory.more")}
              </Button>
            }
            categoriesSummary={sortedCategories}
          />
        )}
      </div>
    </div>
  );
}
