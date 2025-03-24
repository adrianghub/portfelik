import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/modules/shared/category";

interface ShoppingListCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalAmount: number;
  setTotalAmount: (amount: number) => void;
  selectedCategoryId: string;
  setSelectedCategoryId: (id: string) => void;
  handleCompleteList: () => void;
  completingList: boolean;
  loadingCategories: boolean;
  categories: Category[];
}

export function ShoppingListCompleteDialog({
  open,
  onOpenChange,
  totalAmount,
  setTotalAmount,
  selectedCategoryId,
  setSelectedCategoryId,
  handleCompleteList,
  completingList,
  loadingCategories,
  categories,
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
            <label htmlFor="category" className="text-sm font-medium">
              Category
            </label>
            <Select
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {loadingCategories ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : (
                  categories
                    .filter((category) => category.type === "expense")
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCompleteList}
            disabled={!totalAmount || !selectedCategoryId || completingList}
          >
            {completingList ? "Processing..." : "Complete & Create Transaction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
