/** @jsxImportSource react */
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDisplayDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format-currency";
import { cn } from "@/lib/styling-utils";
import type { UserData } from "@/modules/admin/users/UserService";
import { SharedTransactionIndicator } from "@/modules/transactions/components/SharedTransactionIndicator";
import type {
  Transaction,
  TransactionStatus,
} from "@/modules/transactions/transaction";
import { getStatusDisplayProperties } from "@/modules/transactions/utils/getStatusColor";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Edit, Repeat, ShoppingCart, Trash2 } from "lucide-react";

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
  userData: UserData | null;
}

export const useTransactionColumns = ({
  isMobile,
  ...rest
}: UseTransactionColumnsProps): ColumnDef<Transaction, unknown>[] => {
  return isMobile ? getMobileColumns(rest) : getDesktopColumns(rest);
};

function getMobileColumns({
  setSelectedTransaction,
  shoppingLists,
  loadingShoppingLists,
}: Pick<
  UseTransactionColumnsProps,
  "setSelectedTransaction" | "shoppingLists" | "loadingShoppingLists"
>): ColumnDef<Transaction, unknown>[] {
  return [
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <div
          className="flex flex-col gap-1 w-full"
          onClick={() => setSelectedTransaction(row.original)}
        >
          <div className="flex items-center justify-between">
            <div className="font-medium truncate max-w-[200px] flex items-center">
              {row.original.description}
              <SharedTransactionIndicator transaction={row.original} />
            </div>
            {renderAmount(row.original)}
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>{formatDisplayDate(row.original.date)}</span>
              {renderStatusBadge(row.original.status)}
              {row.original.isRecurring && (
                <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
                  <Repeat className="h-3 w-3" />
                </span>
              )}
            </div>
            {row.original.shoppingListId && (
              <div onClick={(e) => e.stopPropagation()}>
                {renderShoppingListLink(
                  row.original.shoppingListId,
                  shoppingLists,
                  loadingShoppingLists,
                )}
              </div>
            )}
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
  userData,
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
        <div className="font-medium truncate max-w-[250px] flex items-center">
          {row.original.description}
          <SharedTransactionIndicator transaction={row.original} />
          {row.original.isRecurring && (
            <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
              <Repeat className="h-3 w-3" />
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => formatDisplayDate(row.original.date),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 justify-center">
          {renderStatusBadge(row.original.status)}
        </div>
      ),
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
            <span className="truncate max-w-[100px]">{list.name}</span>
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
      renderActions(row.original, onEdit, handleDelete, deletingId, userData),
  });

  return columns;
}

function renderStatusBadge(status: TransactionStatus) {
  const { color, icon } = getStatusDisplayProperties(status);
  return <span className={`rounded-full text-xs ${color}`}>{icon}</span>;
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
      {formatCurrency(transaction.amount)}
    </p>
  );
}

function renderActions(
  transaction: Transaction,
  onEdit?: (tx: Transaction) => void,
  handleDelete?: (id?: string) => void,
  deletingId?: string | null,
  userData?: UserData | null,
) {
  if (userData?.role !== "admin" && transaction.userId !== userData?.uid) {
    return null;
  }

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
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

function renderShoppingListLink(
  id: string,
  shoppingLists: Record<string, { name: string }>,
  loadingShoppingLists: boolean,
) {
  if (loadingShoppingLists) return null;
  const list = shoppingLists[id];
  if (!list) return null;

  return (
    <Link
      to="/shopping-lists/$id"
      params={{ id }}
      className="flex items-center gap-1 text-accent-foreground hover:underline text-xs"
    >
      <ShoppingCart className="h-3 w-3" />
      <span className="truncate max-w-[100px]">{list.name}</span>
    </Link>
  );
}
