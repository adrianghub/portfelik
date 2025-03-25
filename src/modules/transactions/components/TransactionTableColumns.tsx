/** @jsxImportSource react */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDisplayDate } from "@/lib/date-utils";
import type { Transaction } from "@/modules/transactions/transaction";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Edit, ShoppingCart, Trash2 } from "lucide-react";

interface GetColumnsProps {
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

export function TransactionTableColumns({
  isMobile,
  onEdit,
  showUserInfo,
  userEmails,
  shoppingLists,
  loadingUsers,
  loadingShoppingLists,
  deletingId,
  getCategoryName,
  handleDelete,
  setSelectedTransaction,
}: GetColumnsProps): ColumnDef<Transaction, unknown>[] {
  if (isMobile) {
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
              <div className="text-sm text-gray-500">
                {formatDisplayDate(row.original.date)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "font-semibold whitespace-nowrap",
                  row.original.type === "income"
                    ? "text-green-600"
                    : "text-red-600",
                )}
              >
                {row.original.type === "income" ? "+" : "-"}
                {Math.abs(row.original.amount).toFixed(2)} zł
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(row.original.id)}
                className="text-red-600 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ),
      },
    ];
  }

  const columns: ColumnDef<Transaction, unknown>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
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

  const hasShoppingLists = Object.values(shoppingLists).length > 0;

  if (hasShoppingLists) {
    columns.push({
      id: "shoppingList",
      header: "Shopping List",
      cell: ({ row }) => {
        const id = row.original.shoppingListId;
        if (!id) return null;
        const list = shoppingLists[id];
        if (loadingShoppingLists) return "Loading...";
        return (
          <Link
            to="/shopping-lists/$id"
            params={{ id }}
            className="flex items-center gap-1 text-blue-600 hover:underline"
          >
            <ShoppingCart className="h-3 w-3" />
            {list?.name || ""}
          </Link>
        );
      },
    });
  }

  if (showUserInfo) {
    columns.push({
      accessorKey: "userId",
      header: "User",
      cell: ({ row }) => {
        const userId = row.original.userId;
        return loadingUsers
          ? "Loading..."
          : userEmails[userId as string] || "Unknown";
      },
    });
  }

  columns.push({
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => {
      const t = row.original;
      return (
        <p
          className={cn(
            "font-semibold",
            t.type === "income" ? "text-green-600" : "text-red-600",
          )}
        >
          {t.type === "income" ? "+" : "-"}
          {Math.abs(t.amount).toFixed(2)} zł
        </p>
      );
    },
  });

  columns.push({
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      const t = row.original;
      return (
        <div className="flex justify-end gap-2">
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={() => onEdit(t)}>
              <Edit className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(t.id)}
            disabled={deletingId === t.id}
            className="text-red-600 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      );
    },
  });

  return columns;
}
