import { useUpdateCategory } from "@/modules/shared/categories/useCategoriesQuery";
import type { Category } from "@/modules/shared/category";
import { useState } from "react";

type CategoryType = "income" | "expense";

interface EditFormState {
  name: string;
  type: CategoryType;
}

export const useCategoryTableData = () => {
  const { mutate: updateCategory } = useUpdateCategory();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const handleUpdateCategory = () => {
    if (!editingId || !editForm) return;

    updateCategory({
      categoryId: editingId,
      updates: {
        name: editForm.name.trim(),
        type: editForm.type,
      },
    });

    resetEditState();
  };

  const resetEditState = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleStartEdit = (category: Category) => {
    setEditingId(category.id);
    setEditForm({
      name: category.name,
      type: category.type,
    });
  };

  const confirmDelete = (categoryId: string) => {
    setCategoryToDelete(categoryId);
    setDeleteDialogOpen(true);
  };

  const updateFormField = (field: keyof EditFormState, value: string) => {
    setEditForm((prev) => {
      if (!prev) return null;
      return { ...prev, [field]: value };
    });
  };

  return {
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
    isSaveDisabled: !editForm?.name.trim(),
  };
};
