import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import type {
  ShoppingList,
  ShoppingListItem,
} from "@/modules/shopping-lists/shopping-list";
import { shoppingListService } from "@/modules/shopping-lists/ShoppingListService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useShoppingListToasts } from "./useShoppingListToasts";

export const SHOPPING_LISTS_QUERY_KEY = ["shopping-lists"];

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

  type CreateShoppingListInput =
    | Omit<ShoppingList, "id" | "userId">
    | { name: string; items?: ShoppingListItem[]; categoryId?: string };

  return useMutation({
    mutationFn: async (newShoppingList: CreateShoppingListInput) => {
      if (!userId) throw new Error("User not authenticated");

      try {
        if (
          "createdAt" in newShoppingList &&
          "updatedAt" in newShoppingList &&
          "status" in newShoppingList
        ) {
          const newList = await shoppingListService.create({
            ...newShoppingList,
            userId,
          });
          return newList;
        } else {
          const now = new Date().toISOString();
          const newList = await shoppingListService.create({
            name: newShoppingList.name,
            items: newShoppingList.items || [],
            createdAt: now,
            updatedAt: now,
            status: "active",
            userId,
            categoryId: newShoppingList.categoryId,
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
    onMutate: async (newShoppingList: CreateShoppingListInput) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });

      // Snapshot the previous value
      const previousLists = queryClient.getQueryData<ShoppingList[]>(
        SHOPPING_LISTS_QUERY_KEY,
      );

      // Create optimistic list
      const optimisticList: ShoppingList = {
        id: crypto.randomUUID(), // Temporary ID
        name: newShoppingList.name,
        items:
          "createdAt" in newShoppingList
            ? newShoppingList.items
            : newShoppingList.items || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
        userId: userData?.uid || "",
        categoryId:
          "createdAt" in newShoppingList
            ? newShoppingList.categoryId
            : newShoppingList.categoryId,
      };

      // Optimistically update to the new value
      queryClient.setQueryData<ShoppingList[]>(
        SHOPPING_LISTS_QUERY_KEY,
        (old) => {
          if (!old) return [optimisticList];
          return [optimisticList, ...old];
        },
      );

      return { previousLists, optimisticList };
    },
    onError: (err, _newShoppingList, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousLists) {
        queryClient.setQueryData(
          SHOPPING_LISTS_QUERY_KEY,
          context.previousLists,
        );
      }
      showErrorToast("create", err);
    },
    onSuccess: (newList) => {
      // Update the optimistic list with the real one
      queryClient.setQueryData<ShoppingList[]>(
        SHOPPING_LISTS_QUERY_KEY,
        (old) => {
          if (!old) return [newList];
          return old.map((list) => (list.id === newList.id ? newList : list));
        },
      );
      showSuccessToast("create");
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
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });

      // Snapshot the previous value
      const previousLists = queryClient.getQueryData<ShoppingList[]>(
        SHOPPING_LISTS_QUERY_KEY,
      );

      // Optimistically update to the new value
      queryClient.setQueryData<ShoppingList[]>(
        SHOPPING_LISTS_QUERY_KEY,
        (old) => {
          if (!old) return old;
          return old.filter((list) => list.id !== id);
        },
      );

      return { previousLists, deletedId: id };
    },
    onError: (err, _id, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousLists) {
        queryClient.setQueryData(
          SHOPPING_LISTS_QUERY_KEY,
          context.previousLists,
        );
      }
      showErrorToast("delete", err);
    },
    onSuccess: () => {
      showSuccessToast("delete");
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
    onMutate: async (shoppingList) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: SHOPPING_LISTS_QUERY_KEY });

      // Snapshot the previous value
      const previousLists = queryClient.getQueryData<ShoppingList[]>(
        SHOPPING_LISTS_QUERY_KEY,
      );

      // Create optimistic duplicate
      const optimisticList: ShoppingList = {
        ...shoppingList,
        id: crypto.randomUUID(), // Temporary ID
        name: `${shoppingList.name} (kopia)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
        items: shoppingList.items.map((item) => ({
          ...item,
          id: crypto.randomUUID(), // New IDs for items
          completed: false,
        })),
      };

      // Optimistically update to the new value
      queryClient.setQueryData<ShoppingList[]>(
        SHOPPING_LISTS_QUERY_KEY,
        (old) => {
          if (!old) return [optimisticList];
          return [optimisticList, ...old];
        },
      );

      return { previousLists, optimisticList };
    },
    onError: (err, _shoppingList, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousLists) {
        queryClient.setQueryData(
          SHOPPING_LISTS_QUERY_KEY,
          context.previousLists,
        );
      }
      showErrorToast("duplicate", err);
    },
    onSuccess: (newList) => {
      // Update the optimistic list with the real one
      queryClient.setQueryData<ShoppingList[]>(
        SHOPPING_LISTS_QUERY_KEY,
        (old) => {
          if (!old) return [newList];
          return old.map((list) => (list.id === newList.id ? newList : list));
        },
      );
      showSuccessToast("duplicate");
    },
  });
}
