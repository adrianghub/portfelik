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
import { formatDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { userService } from "@/modules/admin/users/UserService";
import { useFetchCategories } from "@/modules/shared/useCategoriesQuery";
import type { Transaction } from "@/modules/transactions/transaction";
import { useDeleteTransaction } from "@/modules/transactions/useTransactionsQuery";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Edit, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface TransactionTableProps {
  transactions: Transaction[];
  onEdit?: (transaction: Transaction) => void;
  showUserInfo?: boolean;
}

export function TransactionTable({
  transactions,
  onEdit,
  showUserInfo = false,
}: TransactionTableProps) {
  const deleteTransaction = useDeleteTransaction();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const { data: categories = [], isLoading: loadingCategories } =
    useFetchCategories();

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

  const columns: ColumnDef<Transaction, unknown>[] = [
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
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      accessorKey: "categoryId",
      header: "Category",
      cell: ({ row }) => getCategoryName(row.original.categoryId),
    },
    ...(showUserInfo
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
      : []),
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
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const transaction = row.original;
        return (
          <div className="flex justify-end gap-2">
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(transaction)}
              >
                <span className="hidden sm:inline">Edit</span>
                <Edit className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDelete(transaction.id)}
              disabled={deletingId === transaction.id}
              className="text-red-600 hover:bg-red-50"
            >
              <span className="hidden sm:inline">Delete</span>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border isolate">
      <div className="relative w-full overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header, index) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "text-sm font-medium",
                      index === 0 && "sticky left-0 bg-background z-10",
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell, index) => (
                  <TableCell
                    key={cell.id}
                    className={
                      index === 0 ? "sticky left-0 bg-background z-10" : ""
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
