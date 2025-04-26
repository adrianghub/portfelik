import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/hooks/useAuth";
import {
  useAddCategory,
  useDeleteCategory,
  useFetchCategories,
  useUpdateCategory,
} from "@/modules/shared/categories/useCategoriesQuery";
import { FormField } from "@/modules/shared/components/FormField";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

// Use the same query key pattern as in useCategoriesQuery.ts
const USER_CATEGORIES_QUERY_KEY = ["userCategories"];

export function CategoriesSection() {
  const { t } = useTranslation();
  const { userData } = useAuth();
  const userId = userData?.uid;
  const { data: categories = [], isLoading } = useFetchCategories();
  const addCategory = useAddCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const queryClient = useQueryClient();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [editedType, setEditedType] = useState<"income" | "expense">("expense");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  // Helper function to invalidate category queries
  const invalidateCategoryQueries = async () => {
    // Invalidate both the general and user-specific queries
    await queryClient.invalidateQueries({
      queryKey: USER_CATEGORIES_QUERY_KEY,
    });

    if (userId) {
      await queryClient.invalidateQueries({
        queryKey: [USER_CATEGORIES_QUERY_KEY, userId],
      });
    }

    // Force a refetch
    await queryClient.refetchQueries({
      queryKey: [USER_CATEGORIES_QUERY_KEY, userId],
      type: "active",
    });
  };

  // Create form
  const createForm = useForm({
    defaultValues: {
      name: "",
      type: "expense" as "income" | "expense",
    },
    onSubmit: async ({ value }) => {
      try {
        await addCategory.mutateAsync({
          id: "",
          name: value.name,
          type: value.type,
        });

        // Invalidate queries to refresh the categories list
        await invalidateCategoryQueries();

        createForm.reset();
        setCreateDialogOpen(false);
      } catch (error) {
        console.error("Error creating category:", error);
      }
    },
  });

  // Set up the form when editing is initiated
  const startEditing = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;

    // Set the local state variables to the current category values
    setEditedName(category.name);
    setEditedType(category.type);
    setEditingCategory(categoryId);
  };

  const saveEdit = async () => {
    if (!editingCategory) return;

    try {
      await updateCategory.mutateAsync({
        categoryId: editingCategory,
        updates: {
          name: editedName,
          type: editedType,
        },
      });

      // Invalidate queries to refresh the categories list
      await invalidateCategoryQueries();

      setEditingCategory(null);
    } catch (error) {
      console.error("Error updating category:", error);
    }
  };

  const confirmDelete = (categoryId: string) => {
    setCategoryToDelete(categoryId);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;

    try {
      await deleteCategory.mutateAsync(categoryToDelete);

      // Invalidate queries to refresh the categories list
      await invalidateCategoryQueries();

      setCategoryToDelete(null);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error("Error deleting category:", error);
    }
  };

  if (isLoading) {
    return <div>{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">
          {t("settings.categories.myCategories")}
        </h3>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t("settings.categories.addCategory")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("settings.categories.createNew")}</DialogTitle>
              <DialogDescription>
                {t("settings.categories.createNewDescription")}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void createForm.handleSubmit();
              }}
              className="space-y-4"
            >
              <createForm.Field name="name">
                {(field) => (
                  <FormField
                    name="name"
                    label={t("settings.categories.name")}
                    error={field.state.meta.errors?.[0]}
                  >
                    <Input
                      placeholder={t("settings.categories.namePlaceholder")}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </FormField>
                )}
              </createForm.Field>

              <createForm.Field name="type">
                {(field) => (
                  <FormField
                    name="type"
                    label={t("settings.categories.type")}
                    error={field.state.meta.errors?.[0]}
                  >
                    <Select
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(value as "income" | "expense")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("settings.categories.typePlaceholder")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">
                          {t("settings.categories.typeExpense")}
                        </SelectItem>
                        <SelectItem value="income">
                          {t("settings.categories.typeIncome")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              </createForm.Field>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={addCategory.isPending}>
                  {addCategory.isPending
                    ? t("common.saving")
                    : t("common.save")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings.categories.tableName")}</TableHead>
              <TableHead>{t("settings.categories.tableType")}</TableHead>
              <TableHead className="text-right">
                {t("settings.categories.tableActions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length > 0 ? (
              categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    {editingCategory === category.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveEdit();
                        }}
                      >
                        <Input
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          className="h-8"
                          autoFocus
                        />
                      </form>
                    ) : (
                      category.name
                    )}
                  </TableCell>
                  <TableCell>
                    {editingCategory === category.id ? (
                      <Select
                        value={editedType}
                        onValueChange={(value) =>
                          setEditedType(value as "income" | "expense")
                        }
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">
                            {t("settings.categories.typeIncome")}
                          </SelectItem>
                          <SelectItem value="expense">
                            {t("settings.categories.typeExpense")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : category.type === "income" ? (
                      t("settings.categories.typeIncome")
                    ) : (
                      t("settings.categories.typeExpense")
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingCategory === category.id ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingCategory(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => void saveEdit()}
                        >
                          {t("common.save")}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(category.id)}
                          title={t("common.edit")}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmDelete(category.id)}
                          title={t("common.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  {t("settings.categories.noCategories")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.categories.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.categories.deleteDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending
                ? t("common.deleting")
                : t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
