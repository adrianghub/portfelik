/** @jsxImportSource react */
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDisplayDate } from "@/lib/date-utils";
import { cn } from "@/lib/styling-utils";
import type { Transaction } from "@/modules/transactions/transaction";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Edit, ShoppingCart, Trash2 } from "lucide-react";

interface UseTransactionColumnsProps {
  isMobile: boolean;
  onEdit?: (transaction: Transaction) => void;
  showUserInfo: boolean;
  userEmails: Record<string, string>;
  shoppingLists: Record<string, { name: string }>;
  loadingUsers: boolean;
  loadingShoppingLists: boolean;
  deletingId: string | null;
  getCategoryName: (id: string) => string;
  handleDelete: (id?: string) => void;
  setSelectedTransaction: (tx: Transaction) => void;
}

export const useTransactionColumns = ({
  isMobile,
  ...rest
}: UseTransactionColumnsProps): ColumnDef<Transaction, unknown>[] => {
  return isMobile ? getMobileColumns(rest) : getDesktopColumns(rest);
};

function getMobileColumns({
  handleDelete,
  setSelectedTransaction,
}: Pick<
  UseTransactionColumnsProps,
  "handleDelete" | "setSelectedTransaction"
>): ColumnDef<Transaction, unknown>[] {
  return [
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <div
          className="flex items-center justify-between w-full"
          onClick={() => setSelectedTransaction(row.original)}
        >
          <div className="flex flex-col">
            <div className="font-medium truncate max-w-[150px]">
              {row.original.description}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatDisplayDate(row.original.date)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {renderAmount(row.original)}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(row.original.id);
              }}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ),
    },
  ];
}

function getDesktopColumns({
  onEdit,
  showUserInfo,
  userEmails,
  shoppingLists,
  loadingUsers,
  loadingShoppingLists,
  deletingId,
  getCategoryName,
  handleDelete,
}: Omit<
  UseTransactionColumnsProps,
  "isMobile" | "setSelectedTransaction"
>): ColumnDef<Transaction, unknown>[] {
  const columns: ColumnDef<Transaction, unknown>[] = [
    {
      id: "select",
      size: 32,
      header: ({ table }) => (
        <div className="flex items-center justify-center w-8">
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            onCheckedChange={(checked) =>
              table.toggleAllRowsSelected(!!checked)
            }
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center w-8">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          />
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <div className="font-medium truncate max-w-[250px]">
          {row.original.description}
        </div>
      ),
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => formatDisplayDate(row.original.date),
    },
    {
      accessorKey: "categoryId",
      header: "Category",
      cell: ({ row }) => getCategoryName(row.original.categoryId),
    },
  ];

  if (Object.keys(shoppingLists).length) {
    columns.push({
      id: "shoppingList",
      header: "Shopping List",
      cell: ({ row }) => {
        const id = row.original.shoppingListId;
        const list = id ? shoppingLists[id] : null;
        if (loadingShoppingLists) return "Loading...";
        if (!id || !list) return null;
        return (
          <Link
            to="/shopping-lists/$id"
            params={{ id }}
            className="flex items-center gap-1 text-accent-foreground hover:underline"
          >
            <ShoppingCart className="h-3 w-3" />
            {list.name}
          </Link>
        );
      },
    });
  }

  if (showUserInfo) {
    columns.push({
      accessorKey: "userId",
      header: "User",
      cell: ({ row }) =>
        loadingUsers
          ? "Loading..."
          : userEmails[row.original.userId ?? ""] || "Unknown",
    });
  }

  columns.push({
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => renderAmount(row.original),
  });

  columns.push({
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) =>
      renderActions(row.original, onEdit, handleDelete, deletingId),
  });

  return columns;
}

function renderAmount(transaction: Transaction) {
  return (
    <p
      className={cn(
        "font-semibold",
        transaction.type === "income" ? "text-green-600" : "text-destructive",
      )}
    >
      {transaction.type === "income" ? "+" : "-"}
      {Math.abs(transaction.amount).toFixed(2)} zł
    </p>
  );
}

function renderActions(
  transaction: Transaction,
  onEdit?: (tx: Transaction) => void,
  handleDelete?: (id?: string) => void,
  deletingId?: string | null,
) {
  return (
    <div className="flex justify-end gap-2">
      {onEdit && (
        <Button variant="ghost" size="sm" onClick={() => onEdit(transaction)}>
          <Edit className="w-4 h-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleDelete?.(transaction.id)}
        disabled={deletingId === transaction.id}
        className="text-red-600 hover:text-red-600 hover:bg-red-50"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
