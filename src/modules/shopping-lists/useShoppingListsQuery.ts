import { useAuth } from "@/lib/AuthContext";
import { logger } from "@/lib/logger";
import type {
  ShoppingList,
  ShoppingListItem,
} from "@/modules/shopping-lists/shopping-list";
import { shoppingListService } from "@/modules/shopping-lists/ShoppingListService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useShoppingListToasts } from "./useShoppingListToasts";

const SHOPPING_LISTS_QUERY_KEY = ["shopping-lists"];

export function useShoppingLists(status?: "active" | "completed") {
  return useQuery({
    queryKey: [...SHOPPING_LISTS_QUERY_KEY, status],
    queryFn: async () => {
      try {
        let lists: ShoppingList[];
        if (status === "active") {
          lists = await shoppingListService.getActiveShoppingLists();
        } else if (status === "completed") {
          lists = await shoppingListService.getCompletedShoppingLists();
        } else {
          lists = await shoppingListService.getAllShoppingLists();
        }

        return lists;
      } catch (error) {
        logger.error(
          "useShoppingLists",
          "Error fetching shopping lists:",
          error,
        );
        throw error;
      }
    },
  });
}

export function useShoppingList(id?: string) {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: [...SHOPPING_LISTS_QUERY_KEY, id],
    queryFn: async () => {
      if (!id) return null;

      try {
        const shoppingList = await shoppingListService.get(id);
        return shoppingList;
      } catch (error) {
        logger.error(
          "useShoppingList",
          `Error fetching shopping list ${id}:`,
          error,
        );
        throw error;
      }
    },
    enabled: !!id && !!userId,
  });
}

export function useCreateShoppingList() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;
  const { showSuccessToast, showErrorToast } = useShoppingListToasts();

  return useMutation({
    mutationFn: async (
      shoppingList:
        | Omit<ShoppingList, "id" | "userId">
        | { name: string; items?: ShoppingListItem[]; categoryId?: string },
    ) => {
      if (!userId) throw new Error("User not authenticated");

      try {
        // If it's a full shopping list object with createdAt, updatedAt and status
        if (
          "createdAt" in shoppingList &&
          "updatedAt" in shoppingList &&
          "status" in shoppingList
        ) {
          const newList = await shoppingListService.create({
            ...shoppingList,
            userId,
          });
          return newList;
        } else {
          // If it's a simplified object with just name, items, and categoryId
          const now = new Date().toISOString();
          const newList = await shoppingListService.create({
            name: shoppingList.name,
            items: shoppingList.items || [],
            createdAt: now,
            updatedAt: now,
            status: "active",
            userId,
            categoryId: shoppingList.categoryId,
          });
          return newList;
        }
      } catch (error) {
        logger.error(
          "useCreateShoppingList",
          "Error creating shopping list:",
          error,
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
      showSuccessToast("create");
    },
    onError: (error) => {
      showErrorToast("create", error);
    },
  });
}

export function useUpdateShoppingList() {
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useShoppingListToasts();

  return useMutation({
    mutationFn: async ({
      id,
      shoppingList,
    }: {
      id: string;
      shoppingList: Partial<ShoppingList>;
    }) => {
      try {
        return await shoppingListService.update(id, shoppingList);
      } catch (error) {
        logger.error(
          "useUpdateShoppingList",
          `Error updating shopping list ${id}:`,
          error,
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
      showSuccessToast("update");
    },
    onError: (error) => {
      showErrorToast("update", error);
    },
  });
}

export function useDeleteShoppingList() {
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useShoppingListToasts();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await shoppingListService.delete(id);
      } catch (error) {
        logger.error(
          "useDeleteShoppingList",
          `Error deleting shopping list ${id}:`,
          error,
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
      showSuccessToast("delete");
    },
    onError: (error) => {
      showErrorToast("delete", error);
    },
  });
}

export function useCompleteShoppingList() {
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useShoppingListToasts();

  return useMutation({
    mutationFn: async ({
      id,
      totalAmount,
      categoryId,
      linkedTransactionId,
    }: {
      id: string;
      totalAmount: number;
      categoryId: string;
      linkedTransactionId?: string;
    }) => {
      try {
        return await shoppingListService.completeShoppingList(
          id,
          totalAmount,
          categoryId,
          linkedTransactionId,
        );
      } catch (error) {
        logger.error(
          "useCompleteShoppingList",
          `Error completing shopping list ${id}:`,
          error,
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
      showSuccessToast("complete");
    },
    onError: (error) => {
      showErrorToast("complete", error);
    },
  });
}

export function useDuplicateShoppingList() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;
  const { showSuccessToast, showErrorToast } = useShoppingListToasts();

  return useMutation({
    mutationFn: async (shoppingList: ShoppingList) => {
      if (!userId) throw new Error("User not authenticated");

      try {
        const now = new Date().toISOString();
        const { id, ...shoppingListWithoutId } = shoppingList;
        const newList = await shoppingListService.create({
          ...shoppingListWithoutId,
          name: `${shoppingList.name} (kopia)`,
          createdAt: now,
          updatedAt: now,
          status: "active",
          userId,
        });
        return newList;
      } catch (error) {
        logger.error(
          "useDuplicateShoppingList",
          `Error duplicating shopping list ${shoppingList.id}:`,
          error,
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });
      showSuccessToast("duplicate");
    },
    onError: (error) => {
      showErrorToast("duplicate", error);
    },
  });
}
