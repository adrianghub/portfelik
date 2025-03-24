import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Category } from "@/modules/shared/category";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete Shopping List</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="amount" className="text-sm font-medium">
              Total Amount
            </label>
            <Input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00 zł"
              value={totalAmount}
              onChange={(e) => setTotalAmount(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Category</label>
            <div className="p-2 border rounded bg-muted">
              {selectedCategory
                ? selectedCategory.name
                : "No category selected"}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCompleteList}
            disabled={!totalAmount || !selectedCategory || completingList}
          >
            {completingList ? "Processing..." : "Complete & Create Transaction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
