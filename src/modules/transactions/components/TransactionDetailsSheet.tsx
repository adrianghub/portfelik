import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDisplayDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format-currency";
import { cn } from "@/lib/styling-utils";
import type { UserData } from "@/modules/admin/users/UserService";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import { getStatusDisplayProperties } from "@/modules/transactions/utils/getStatusColor";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import { Edit, ShoppingCart, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Transaction } from "../transaction";
import { SharedTransactionIndicator } from "./SharedTransactionIndicator";

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
  userData: UserData | null;
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
  userData,
}: TransactionDetailsSheetProps) {
  const { t } = useTranslation();

  const { color, icon } = getStatusDisplayProperties(
    selectedTransaction?.status || "draft",
  );

  return (
    <Sheet open={!!selectedTransaction} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-lg">
        {selectedTransaction && (
          <>
            <SheetHeader>
              <SheetTitle>
                {t("transactions.transactionDetailsSheet.title")}{" "}
                <SharedTransactionIndicator transaction={selectedTransaction} />
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("transactions.transactionDetailsSheet.description")}
                </h3>
                <p className="mt-1">{selectedTransaction.description}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("transactions.transactionDetailsSheet.amount")}
                </h3>
                <p
                  className={cn(
                    "mt-1 font-semibold",
                    selectedTransaction.type === "income"
                      ? "text-green-600"
                      : "text-destructive",
                  )}
                >
                  {selectedTransaction.type === "income" ? "+" : "-"}
                  {formatCurrency(selectedTransaction.amount)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("transactions.transactionDetailsSheet.date")}
                </h3>
                <p className="mt-1">
                  {formatDisplayDate(selectedTransaction.date)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("transactions.transactionDetailsSheet.category")}
                </h3>
                <p className="mt-1">
                  {getCategoryName(selectedTransaction.categoryId)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("transactions.transactionDetailsSheet.status")}
                </h3>
                <div className="flex items-center mt-1 gap-2">
                  <span
                    className={`py-1 rounded-full text-xs ${color} flex items-center gap-1`}
                  >
                    {icon}
                    {selectedTransaction.status.charAt(0).toUpperCase() +
                      selectedTransaction.status.slice(1)}
                  </span>
                </div>
              </div>
              <div>
                {selectedTransaction.isRecurring && (
                  <div className="mt-2">
                    <Label className="text-xs text-muted-foreground">
                      {t("transactions.transactionDetailsSheet.recurringDate")}
                    </Label>
                    <p className="mt-1 text-sm">
                      {selectedTransaction.recurringDate ||
                        dayjs(selectedTransaction.date).date()}
                    </p>
                  </div>
                )}
              </div>
              {selectedTransaction.userId && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {t("transactions.transactionDetailsSheet.user")}
                  </h3>
                  <p className="mt-1">
                    {loadingUsers
                      ? t("transactions.transactionDetailsSheet.loadingUser")
                      : userEmails[selectedTransaction.userId] ||
                        t("transactions.transactionDetailsSheet.unknown")}
                  </p>
                </div>
              )}
              {selectedTransaction.shoppingListId && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {t("transactions.transactionDetailsSheet.shoppingList")}
                  </h3>
                  <Link
                    to="/shopping-lists/$id"
                    params={{ id: selectedTransaction.shoppingListId }}
                    className="flex items-center gap-1 text-accent-foreground hover:underline mt-1"
                  >
                    <ShoppingCart className="h-3 w-3" />
                    {loadingShoppingLists
                      ? t(
                          "transactions.transactionDetailsSheet.loadingShoppingList",
                        )
                      : shoppingLists[selectedTransaction.shoppingListId]
                          ?.name || ""}
                  </Link>
                </div>
              )}
              {userData?.uid === selectedTransaction.userId && (
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
                      {t("transactions.transactionDetailsSheet.edit")}
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
                    {t("transactions.transactionDetailsSheet.delete")}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
