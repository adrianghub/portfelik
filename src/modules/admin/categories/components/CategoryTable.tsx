import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCategoryColumns } from "@/modules/admin/categories/hooks/useCategoryColumns";
import { useCategoryTableData } from "@/modules/admin/categories/hooks/useCategoryTableData";
import { useFetchCategories } from "@/modules/shared/categories/useCategoriesQuery";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DeleteCategoryDialog } from "./DeleteCategoryDialog";

export function CategoryTable() {
  const { data: categories, isLoading, error } = useFetchCategories();

  const {
    editingId,
    editForm,
    deleteDialogOpen,
    categoryToDelete,
    setDeleteDialogOpen,
    setCategoryToDelete,
    handleUpdateCategory,
    resetEditState,
    handleStartEdit,
    confirmDelete,
    updateFormField,
    isSaveDisabled,
  } = useCategoryTableData();

  const columns = useCategoryColumns({
    editingId,
    editForm,
    updateFormField,
    handleStartEdit,
    handleCancelEdit: resetEditState,
    handleUpdateCategory,
    confirmDelete,
    isSaveDisabled,
  });

  const table = useReactTable({
    data: categories ?? [],
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

  if (error)
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">Error: {error.message}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
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
