import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMobileDialog } from "@/hooks/useMobileDialog";
import { formatCurrency } from "@/lib/format-currency";
import type { CategorySummary } from "@/modules/transactions/hooks/useTransactionsSummaryQuery";
import { type Transaction } from "@/modules/transactions/transaction";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ExpansesByCategoryDialogProps {
  trigger?: React.ReactNode;
  onSubmit?: (transaction: Transaction) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  categoriesSummary: CategorySummary[];
  onCategoryClick: (categoryId: string, categoryName: string) => void;
}

export function ExpansesByCategoryDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  categoriesSummary,
  onCategoryClick,
}: ExpansesByCategoryDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const setIsOpen = isControlled ? onOpenChange! : setOpen;

  const { contentRef } = useMobileDialog(isOpen);

  const handleCategoryClick = (categoryId: string, categoryName: string) => {
    onCategoryClick(categoryId, categoryName);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        ref={contentRef}
        className="w-full max-w-md mx-auto sm:max-w-lg p-4 sm:p-6 overflow-y-auto max-h-[95vh]"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">
            {t("transactions.expensesByCategory.title")}
          </DialogTitle>
          <DialogDescription>
            {t("transactions.expensesByCategory.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <div className="space-y-2">
            {categoriesSummary.map((category) => (
              <div
                key={category.categoryId}
                className="cursor-pointer hover:bg-muted p-1 rounded"
                onClick={() =>
                  handleCategoryClick(
                    category.categoryId,
                    category.categoryName,
                  )
                }
              >
                <div className="flex justify-between text-xs mb-1">
                  <span
                    className="truncate max-w-[70%]"
                    title={category.categoryName || category.categoryId}
                  >
                    {category.categoryName || category.categoryId} (
                    {category.transactionCount})
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
