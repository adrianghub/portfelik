import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { formatDisplayDate } from "@/lib/date-utils";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import { Link } from "@tanstack/react-router";
import { Edit, ShoppingCart, Trash2 } from "lucide-react";
import type { Transaction } from "../transaction";

interface TransactionDetailsSheetProps {
  selectedTransaction: Transaction | null;
  onClose: () => void;
  onEdit?: (transaction: Transaction) => void;
  handleDelete: (id?: string) => void;
  getCategoryName: (id: string) => string;
  userEmails: Record<string, string>;
  shoppingLists: Record<string, ShoppingList>;
  loadingUsers: boolean;
  loadingShoppingLists: boolean;
  showUserInfo: boolean;
}

export function TransactionDetailsSheet({
  selectedTransaction,
  onClose,
  onEdit,
  handleDelete,
  getCategoryName,
  userEmails,
  shoppingLists,
  loadingUsers,
  loadingShoppingLists,
  showUserInfo,
}: TransactionDetailsSheetProps) {
  if (!selectedTransaction) return null;

  return (
    <Sheet open={!!selectedTransaction} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Transaction Details</SheetTitle>
          <SheetDescription>
            View complete transaction information
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Description</h3>
            <p className="mt-1">{selectedTransaction.description}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500">Amount</h3>
            <p
              className={cn(
                "mt-1 font-semibold",
                selectedTransaction.type === "income"
                  ? "text-green-600"
                  : "text-red-600",
              )}
            >
              {selectedTransaction.type === "income" ? "+" : "-"}
              {Math.abs(selectedTransaction.amount).toFixed(2)} zł
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500">Date</h3>
            <p className="mt-1">
              {formatDisplayDate(selectedTransaction.date)}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500">Category</h3>
            <p className="mt-1">
              {getCategoryName(selectedTransaction.categoryId)}
            </p>
          </div>
          {showUserInfo && selectedTransaction.userId && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">User</h3>
              <p className="mt-1">
                {loadingUsers
                  ? "Loading user..."
                  : userEmails[selectedTransaction.userId] || "Unknown"}
              </p>
            </div>
          )}
          {selectedTransaction.shoppingListId && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">
                Shopping List
              </h3>
              <Link
                to="/shopping-lists/$id"
                params={{ id: selectedTransaction.shoppingListId }}
                className="flex items-center gap-1 text-blue-600 hover:underline mt-1"
              >
                <ShoppingCart className="h-3 w-3" />
                {loadingShoppingLists
                  ? "Loading..."
                  : shoppingLists[selectedTransaction.shoppingListId]?.name ||
                    ""}
              </Link>
            </div>
          )}
          <div className="flex gap-2 mt-6">
            {onEdit && (
              <Button
                onClick={() => {
                  onEdit(selectedTransaction);
                  onClose();
                }}
                className="flex items-center gap-1"
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => {
                handleDelete(selectedTransaction.id);
                onClose();
              }}
              className="flex items-center gap-1"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
