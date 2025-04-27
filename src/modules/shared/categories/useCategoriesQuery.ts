import { useAuth } from "@/hooks/useAuth";
import { categoryService } from "@/modules/shared/categories/CategoryService";
import type { Category } from "@/modules/shared/category";
import {
  uiCategoryToFirestoreCategory,
  type Category as UICategory,
} from "@/modules/shared/category";
import { API_BASE_URL } from "@/modules/shared/constants";
import { fetcher } from "@/modules/shared/fetcher";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const USER_CATEGORIES_QUERY_KEY = ["userCategories"];

/**
 * Fetches both user's own categories and shared categories from other users in the same groups.
 */
export function useFetchCategories() {
  const { userData, getIdToken } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: [USER_CATEGORIES_QUERY_KEY, userId],
    queryFn: async () => {
      if (!userId) {
        return [];
      }

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Authentication token not available");

        const url = `${API_BASE_URL}/api/v1/categories`;
        const response = await fetcher(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        console.log(`Fetched ${response.categories?.length || 0} categories.`);
        return response.categories as Category[];
      } catch (error) {
        console.error("Error fetching categories from API:", error);
        return [];
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
