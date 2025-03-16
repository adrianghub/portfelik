import { Category } from "@/components/transactions/CategorySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useState } from "react";
import { DeleteCategoryDialog } from "./DeleteCategoryDialog";
import { useCategoriesContext } from "./useCategoriesContext";

export function CategoryTable() {
  const {
    categories,
    isLoading,
    error,
    editingCategory,
    setEditingCategory,
    updateExistingCategory,
  } = useCategoriesContext();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const handleUpdateCategory = () => {
    if (!editingCategory) return;

    updateExistingCategory(editingCategory.id, {
      name: editingCategory.name,
      type: editingCategory.type,
    });

    setEditingCategory(null);
  };

  const confirmDelete = (categoryId: string) => {
    setCategoryToDelete(categoryId);
    setDeleteDialogOpen(true);
  };

  const columns: ColumnDef<Category>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const category = row.original;
        return editingCategory?.id === category.id ? (
          <Input
            value={editingCategory.name}
            onChange={(e) =>
              setEditingCategory({
                ...editingCategory,
                name: e.target.value,
              })
            }
            className="min-w-[150px]"
          />
        ) : (
          <div className="font-medium">{category.name}</div>
        );
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const category = row.original;
        return editingCategory?.id === category.id ? (
          <Select
            value={editingCategory.type}
            onValueChange={(value) =>
              setEditingCategory({
                ...editingCategory,
                type: value as "income" | "expense",
              })
            }
          >
            <SelectTrigger className="min-w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="capitalize">
            {category.type.charAt(0).toUpperCase() + category.type.slice(1)}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const category = row.original;
        return (
          <div className="flex justify-end gap-2">
            {editingCategory?.id === category.id ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingCategory(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleUpdateCategory}
                  disabled={!editingCategory.name.trim()}
                >
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingCategory(category)}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => confirmDelete(category.id)}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: categories,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading categories...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-red-500">Error: {error.message}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No categories found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DeleteCategoryDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        categoryId={categoryToDelete}
        onCancel={() => setCategoryToDelete(null)}
      />
    </>
  );
}
