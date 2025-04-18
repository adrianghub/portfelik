import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format-currency";
import type { Category } from "@/modules/shared/category";
import { useTranslation } from "react-i18next";

interface ShoppingListCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalAmount: number;
  setTotalAmount: (amount: number) => void;
  handleCompleteList: () => void;
  completingList: boolean;
  categories: Category[];
  selectedCategory: Category | undefined;
}

export function ShoppingListCompleteDialog({
  open,
  onOpenChange,
  totalAmount,
  setTotalAmount,
  handleCompleteList,
  completingList,
  selectedCategory,
}: ShoppingListCompleteDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("shoppingLists.shoppingListCompleteDialog.completeShoppingList")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="amount" className="text-sm font-medium">
              {t("shoppingLists.shoppingListCompleteDialog.totalAmount")}
            </label>
            <Input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder={formatCurrency(0)}
              value={totalAmount}
              onChange={(e) => setTotalAmount(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("shoppingLists.shoppingListCompleteDialog.category")}
            </label>
            <div className="p-2 border rounded bg-muted">
              {selectedCategory
                ? selectedCategory.name
                : t(
                    "shoppingLists.shoppingListCompleteDialog.noCategorySelected",
                  )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("shoppingLists.shoppingListCompleteDialog.cancel")}
          </Button>
          <Button
            onClick={handleCompleteList}
            disabled={!totalAmount || !selectedCategory || completingList}
          >
            {completingList
              ? t("shoppingLists.shoppingListCompleteDialog.processing")
              : t(
                  "shoppingLists.shoppingListCompleteDialog.completeAndCreateTransaction",
                )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
