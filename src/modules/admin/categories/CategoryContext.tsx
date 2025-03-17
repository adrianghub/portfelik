import type { Category } from "@/modules/shared/category";
import {
  useAddCategory,
  useDeleteCategory,
  useFetchCategories,
  useUpdateCategory,
} from "@/modules/shared/useCategoriesQuery";
import { createContext, ReactNode, useState } from "react";

export interface CategoryContextType {
  categories: Category[];
  isLoading: boolean;
  error: Error | null;
  addNewCategory: (category: Category) => void;
  updateExistingCategory: (
    categoryId: string,
    updates: Partial<Category>,
  ) => void;
  deleteExistingCategory: (categoryId: string) => void;
  editingCategory: Category | null;
  setEditingCategory: (category: Category | null) => void;
}

export const CategoryContext = createContext<CategoryContextType | null>(null);

interface CategoryProviderProps {
  children: ReactNode;
}

export function CategoryProvider({ children }: CategoryProviderProps) {
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const { data: categories = [], isLoading, error } = useFetchCategories();

  const addCategoryMutation = useAddCategory();
  const updateCategoryMutation = useUpdateCategory();
  const deleteCategoryMutation = useDeleteCategory();

  const addNewCategory = (category: Category) => {
    addCategoryMutation.mutate(category);
  };

  const updateExistingCategory = (
    categoryId: string,
    updates: Partial<Category>,
  ) => {
    updateCategoryMutation.mutate({ categoryId, updates });
  };

  const deleteExistingCategory = (categoryId: string) => {
    deleteCategoryMutation.mutate(categoryId);
  };

  return (
    <CategoryContext.Provider
      value={{
        categories,
        isLoading:
          isLoading ||
          addCategoryMutation.isPending ||
          updateCategoryMutation.isPending ||
          deleteCategoryMutation.isPending,
        error: error as Error | null,
        addNewCategory,
        updateExistingCategory,
        deleteExistingCategory,
        editingCategory,
        setEditingCategory,
      }}
    >
      {children}
    </CategoryContext.Provider>
  );
}
