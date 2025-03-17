import { useAuth } from "@/lib/AuthContext";
import { categoryService } from "@/modules/admin/categories/CategoryService";
import {
  firestoreCategoriesToUICategories,
  uiCategoryToFirestoreCategory,
  type CategoryDTO,
  type Category as UICategory,
} from "@/modules/shared/category";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const CATEGORIES_QUERY_KEY = ["categories"];

export function useFetchCategories() {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: [...CATEGORIES_QUERY_KEY, userId],
    queryFn: async () => {
      try {
        const categories = await categoryService.getAllCategories();

        const uiCategories = firestoreCategoriesToUICategories(
          categories as CategoryDTO[],
        );
        return uiCategories;
      } catch (error) {
        console.error("Error fetching categories:", error);
        throw error;
      }
    },
    enabled: !!userId,
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

      console.log("Adding category:", category);

      const firestoreCategory = uiCategoryToFirestoreCategory(category, userId);

      const categoryToSave = { ...firestoreCategory };

      if ("id" in categoryToSave) {
        delete (categoryToSave as Record<string, unknown>).id;
      }

      return categoryService.create(categoryToSave);
    },
    onSuccess: (result) => {
      console.log("Category created successfully:", result);
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
    },
    onError: (error) => {
      console.error("Error adding category:", error);
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
      const firestoreUpdates: Record<string, string | null> = {};

      if (updates.name) firestoreUpdates.name = updates.name;
      if (updates.type) firestoreUpdates.type = updates.type;

      return categoryService.update(categoryId, firestoreUpdates);
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
