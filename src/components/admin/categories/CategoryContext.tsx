import { Category } from "@/components/transactions/CategorySelect";
import {
  useAddCategory,
  useDeleteCategory,
  useFetchCategories,
  useFetchExpenseCategories,
  useFetchIncomeCategories,
  useUpdateCategory,
} from "@/hooks/useCategoriesQuery";
import { createContext, ReactNode, useEffect, useState } from "react";

export interface CategoryContextType {
  categories: Category[];
  incomeCategories: Category[];
  expenseCategories: Category[];
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

  const {
    data: categories = [],
    isLoading: isLoadingAll,
    error: errorAll,
  } = useFetchCategories();
  const {
    data: incomeCategories = [],
    isLoading: isLoadingIncome,
    error: errorIncome,
  } = useFetchIncomeCategories();
  const {
    data: expenseCategories = [],
    isLoading: isLoadingExpense,
    error: errorExpense,
  } = useFetchExpenseCategories();

  // Debug logging
  useEffect(() => {
    console.log("Categories data:", {
      categories,
      isLoadingAll,
      errorAll: errorAll?.message,
    });
    console.log("Income categories:", {
      incomeCategories,
      isLoadingIncome,
      errorIncome: errorIncome?.message,
    });
    console.log("Expense categories:", {
      expenseCategories,
      isLoadingExpense,
      errorExpense: errorExpense?.message,
    });
  }, [
    categories,
    incomeCategories,
    expenseCategories,
    isLoadingAll,
    isLoadingIncome,
    isLoadingExpense,
    errorAll,
    errorIncome,
    errorExpense,
  ]);

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

  // Combine errors
  const error = errorAll || errorIncome || errorExpense;

  return (
    <CategoryContext.Provider
      value={{
        categories,
        incomeCategories,
        expenseCategories,
        isLoading:
          isLoadingAll ||
          isLoadingIncome ||
          isLoadingExpense ||
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
