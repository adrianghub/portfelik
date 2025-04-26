import { useAuth } from "@/hooks/useAuth";
import { categoryService } from "@/modules/shared/categories/CategoryService";
import {
  firestoreCategoriesToUICategories,
  uiCategoryToFirestoreCategory,
  type CategoryDTO,
  type Category as UICategory,
} from "@/modules/shared/category";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const USER_CATEGORIES_QUERY_KEY = ["userCategories"];

export function useFetchCategories() {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: [USER_CATEGORIES_QUERY_KEY, userId],
    queryFn: async () => {
      if (!userId) {
        return [];
      }
      try {
        const categories = await categoryService.getAllUserCategories(userId);
        const uiCategories = firestoreCategoriesToUICategories(
          categories as CategoryDTO[],
        );
        return uiCategories;
      } catch (error) {
        console.error("Error fetching user categories:", error);
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
    mutationFn: async (category: UICategory) => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      const firestoreCategory = uiCategoryToFirestoreCategory(category, userId);
      const categoryToSave = { ...firestoreCategory };

      if ("id" in categoryToSave) {
        delete (categoryToSave as Record<string, unknown>).id;
      }

      const result = await categoryService.create(categoryToSave);
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [USER_CATEGORIES_QUERY_KEY, userId],
        refetchType: "active",
      });
    },
    onError: (error) => {
      console.error("Error adding category:", error);
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [USER_CATEGORIES_QUERY_KEY, userId],
        refetchType: "active",
      });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useMutation({
    mutationFn: (categoryId: string) => categoryService.delete(categoryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [USER_CATEGORIES_QUERY_KEY, userId],
        refetchType: "active",
      });
    },
  });
}
