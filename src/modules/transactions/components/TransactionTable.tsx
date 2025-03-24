import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDisplayDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { userService } from "@/modules/admin/users/UserService";
import { useFetchCategories } from "@/modules/shared/useCategoriesQuery";
import { shoppingListService } from "@/modules/shopping-lists/ShoppingListService";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import type { Transaction } from "@/modules/transactions/transaction";
import { useDeleteTransaction } from "@/modules/transactions/useTransactionsQuery";
import { Link } from "@tanstack/react-router";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Edit, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface TransactionTableProps {
  transactions: Transaction[];
  onEdit?: (transaction: Transaction) => void;
  showUserInfo?: boolean;
  rowSelection: Record<string, boolean>;
  setRowSelection: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
}

export function TransactionTable({
  transactions,
  onEdit,
  showUserInfo = false,
  rowSelection,
  setRowSelection,
}: TransactionTableProps) {
  const deleteTransaction = useDeleteTransaction();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [shoppingLists, setShoppingLists] = useState<
    Record<string, ShoppingList>
  >({});
  const [loadingShoppingLists, setLoadingShoppingLists] =
    useState<boolean>(false);
  const { data: categories = [], isLoading: loadingCategories } =
    useFetchCategories();

  const hasSelectedRows = Object.keys(rowSelection).some(
    (id) => rowSelection[id],
  );

  useEffect(() => {
    if (!showUserInfo) return;

    const loadUserEmails = async () => {
      setLoadingUsers(true);

      const userIds = [
        ...new Set(transactions.filter((t) => t.userId).map((t) => t.userId!)),
      ];

      if (userIds.length === 0) {
        setLoadingUsers(false);
        return;
      }

      const emailsMap: Record<string, string> = {};
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const user = await userService.getById(userId);
            emailsMap[userId] = user?.email || "Unknown";
          } catch (error) {
            logger.error(
              "TransactionTable",
              `Error fetching user ${userId}:`,
              error,
            );
            emailsMap[userId] = "Unknown";
          }
        }),
      );

      setUserEmails(emailsMap);
      setLoadingUsers(false);
    };

    loadUserEmails();
  }, [transactions, showUserInfo]);

  // Fetch shopping lists for transactions that have them
  useEffect(() => {
    const loadShoppingLists = async () => {
      const shoppingListIds = transactions
        .filter((t) => t.shoppingListId)
        .map((t) => t.shoppingListId!);

      if (shoppingListIds.length === 0) return;

      setLoadingShoppingLists(true);

      const listsMap: Record<string, ShoppingList> = {};
      await Promise.all(
        [...new Set(shoppingListIds)].map(async (listId) => {
          try {
            const list = await shoppingListService.get(listId);
            if (list) {
              listsMap[listId] = list;
            }
          } catch (error) {
            logger.error(
              "TransactionTable",
              `Error fetching shopping list ${listId}:`,
              error,
            );
          }
        }),
      );

      setShoppingLists(listsMap);
      setLoadingShoppingLists(false);
    };

    loadShoppingLists();
  }, [transactions]);

  const handleDelete = (id?: string) => {
    if (!id) return;

    setDeletingId(id);
    deleteTransaction.mutate(id, {
      onSuccess: () => {
        setDeletingId(null);
      },
      onError: (error) => {
        logger.error("TransactionTable", "Error deleting transaction:", error);
        setDeletingId(null);
      },
    });
  };

  const getCategoryName = (categoryId: string): string => {
    if (loadingCategories) return "Loading...";
    const category = categories.find((cat) => cat.id === categoryId);
    return category ? category.name : "Unknown category";
  };

  const hasShoppingLists = transactions.some((t) => t.shoppingListId);

  const baseColumns: ColumnDef<Transaction, unknown>[] = [
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
        <div className="font-medium">{row.original.description}</div>
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

  const shoppingListColumn: ColumnDef<Transaction, unknown>[] = hasShoppingLists
    ? [
        {
          id: "shoppingList",
          header: "Shopping List",
          cell: ({ row }) => {
            const shoppingListId = row.original.shoppingListId;
            if (!shoppingListId) return null;

            const list = shoppingLists[shoppingListId];

            if (loadingShoppingLists) return "Loading...";
            if (!list) return "";

            return (
              <Link
                to="/shopping-lists/$id"
                params={{ id: shoppingListId }}
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <ShoppingCart className="h-3 w-3" />
                {list.name}
              </Link>
            );
          },
        },
      ]
    : [];

  const userColumn: ColumnDef<Transaction, unknown>[] = showUserInfo
    ? [
        {
          accessorKey: "userId",
          header: "User",
          cell: ({ row }: { row: { original: Transaction } }) => {
            const userId = row.original.userId;
            if (!userId) return null;
            return loadingUsers
              ? "Loading user..."
              : userEmails[userId] || "Unknown";
          },
        },
      ]
    : [];

  const amountColumn: ColumnDef<Transaction, unknown>[] = [
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }: { row: { original: Transaction } }) => {
        const transaction = row.original;
        return (
          <p
            className={`font-semibold ${
              transaction.type === "income" ? "text-green-600" : "text-red-600"
            }`}
          >
            {transaction.type === "income" ? "+" : "-"}
            {Math.abs(transaction.amount).toFixed(2)} zł
          </p>
        );
      },
    },
  ];

  const actionsColumn: ColumnDef<Transaction, unknown>[] = [
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const transaction = row.original;
        return (
          <div className="flex justify-end gap-2">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(transaction)}
              >
                <Edit className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(transaction.id)}
              disabled={deletingId === transaction.id}
              className="text-red-600 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const columns = [
    ...baseColumns,
    ...shoppingListColumn,
    ...userColumn,
    ...amountColumn,
    ...actionsColumn,
  ];

  const table = useReactTable({
    data: transactions,
    columns,
    getRowId: (row) => row.id ?? "",
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border isolate">
      <div className="relative w-full overflow-auto">
        <Table className="relative">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header, index) => {
                  let stickyClass = "";

                  if (hasSelectedRows) {
                    if (index === 0) {
                      stickyClass = "sticky left-0 bg-background z-20";
                    } else if (index === 1) {
                      stickyClass = "sticky left-[32px] bg-background z-10";
                    }
                  } else if (index === 1) {
                    stickyClass = "sticky left-0 bg-background z-10";
                  }

                  return (
                    <TableHead
                      key={header.id}
                      className={cn("text-sm font-medium", stickyClass)}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell, index) => {
                  let stickyClass = "";

                  if (hasSelectedRows) {
                    if (index === 0) {
                      stickyClass = "sticky left-0 bg-background z-20";
                    } else if (index === 1) {
                      stickyClass = "sticky left-[32px] bg-background z-10";
                    }
                  } else if (index === 1) {
                    stickyClass = "sticky left-0 bg-background z-10";
                  }

                  return (
                    <TableCell
                      key={cell.id}
                      className={stickyClass}
                      onClick={(e) => {
                        if (index !== 0) {
                          e.stopPropagation();
                        } else {
                          row.getToggleSelectedHandler()(e);
                        }
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
