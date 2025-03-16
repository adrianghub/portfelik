import { Category } from "@/components/transactions/CategorySelect";
import {
  addCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from "@/lib/categories";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const CATEGORIES_QUERY_KEY = ["categories"];

export function useFetchCategories() {
  return useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: getCategories,
  });
}

export function useAddCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addCategory,
    onSuccess: (data) => {
      queryClient.setQueryData<Category[]>(CATEGORIES_QUERY_KEY, data);
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
      updates: Partial<Omit<Category, "id">>;
    }) => updateCategory(categoryId, updates),
    onSuccess: (data) => {
      queryClient.setQueryData<Category[]>(CATEGORIES_QUERY_KEY, data);
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: (data) => {
      queryClient.setQueryData<Category[]>(CATEGORIES_QUERY_KEY, data);
    },
  });
}
