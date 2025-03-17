import { Category as UICategory } from "@/components/transactions/CategorySelect";
import { useAuth } from "@/lib/auth-context";
import {
  firestoreCategoriesToUICategories,
  uiCategoryToFirestoreCategory,
} from "@/lib/category-adapter";
import { categoryService } from "@/lib/services";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const CATEGORIES_QUERY_KEY = ["categories"];

export function useFetchCategories() {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: [...CATEGORIES_QUERY_KEY, userId],
    queryFn: async () => {
      console.log("Fetching all categories...");
      try {
        let categories;

        if (userId) {
          categories = await categoryService.getUserCategories(userId);
        } else {
          categories = await categoryService.getAllCategories();
        }

        console.log("Fetched categories:", categories);
        const uiCategories = firestoreCategoriesToUICategories(categories);
        console.log("Converted UI categories:", uiCategories);
        return uiCategories;
      } catch (error) {
        console.error("Error fetching categories:", error);
        throw error;
      }
    },
    enabled: !!userId,
  });
}

export function useFetchIncomeCategories() {
  return useQuery({
    queryKey: [...CATEGORIES_QUERY_KEY, "income"],
    queryFn: async () => {
      console.log("Fetching income categories...");
      try {
        const categories = await categoryService.getIncomeCategories();
        console.log("Fetched income categories:", categories);
        const uiCategories = firestoreCategoriesToUICategories(categories);
        console.log("Converted income UI categories:", uiCategories);
        return uiCategories;
      } catch (error) {
        console.error("Error fetching income categories:", error);
        throw error;
      }
    },
  });
}

export function useFetchExpenseCategories() {
  return useQuery({
    queryKey: [...CATEGORIES_QUERY_KEY, "expense"],
    queryFn: async () => {
      console.log("Fetching expense categories...");
      try {
        const categories = await categoryService.getExpenseCategories();
        console.log("Fetched expense categories:", categories);
        const uiCategories = firestoreCategoriesToUICategories(categories);
        console.log("Converted expense UI categories:", uiCategories);
        return uiCategories;
      } catch (error) {
        console.error("Error fetching expense categories:", error);
        throw error;
      }
    },
  });
}

export function useAddCategory() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useMutation({
    mutationFn: (category: UICategory) => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      const firestoreCategory = uiCategoryToFirestoreCategory(category, userId);
      const now = new Date();
      return categoryService.create({
        ...firestoreCategory,
        createdAt: now,
        updatedAt: now,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      categoryId,
      updates,
    }: {
      categoryId: string;
      updates: Partial<UICategory>;
    }) => {
      const firestoreUpdates: Record<string, string | Date> = {};

      if (updates.name) firestoreUpdates.name = updates.name;
      if (updates.type) firestoreUpdates.type = updates.type;

      return categoryService.update(categoryId, {
        ...firestoreUpdates,
        updatedAt: new Date(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => categoryService.delete(categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
  });
}
