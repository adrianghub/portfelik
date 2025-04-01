import { COLLECTIONS } from "@/lib/firebase/firestore";
import { logger } from "@/lib/logger";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import { shoppingListService } from "@/modules/shopping-lists/ShoppingListService";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useShoppingListToasts } from "./useShoppingListToasts";

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
    onMutate: async ({ id, shoppingList }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS, id],
      });
      await queryClient.cancelQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });

      // Snapshot the previous values
      const previousList = queryClient.getQueryData<ShoppingList>([
        ...COLLECTIONS.SHOPPING_LISTS,
        id,
      ]);
      const previousLists = queryClient.getQueryData<ShoppingList[]>([
        ...COLLECTIONS.SHOPPING_LISTS,
      ]);

      // Optimistically update the list
      if (previousList) {
        queryClient.setQueryData<ShoppingList>(
          [...COLLECTIONS.SHOPPING_LISTS, id],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              ...shoppingList,
              updatedAt: new Date().toISOString(),
            };
          },
        );
      }

      // Optimistically update the lists collection
      if (previousLists) {
        queryClient.setQueryData<ShoppingList[]>(
          [...COLLECTIONS.SHOPPING_LISTS],
          (old) => {
            if (!old) return old;
            return old.map((list) =>
              list.id === id
                ? {
                    ...list,
                    ...shoppingList,
                    updatedAt: new Date().toISOString(),
                  }
                : list,
            );
          },
        );
      }

      return { previousList, previousLists };
    },
    onError: (err, { id }, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousList) {
        queryClient.setQueryData(
          [...COLLECTIONS.SHOPPING_LISTS, id],
          context.previousList,
        );
      }
      if (context?.previousLists) {
        queryClient.setQueryData(
          [...COLLECTIONS.SHOPPING_LISTS],
          context.previousLists,
        );
      }
      showErrorToast("update", err);
    },
    onSuccess: (updatedList) => {
      // Update both caches with the real data
      queryClient.setQueryData(
        [...COLLECTIONS.SHOPPING_LISTS, updatedList.id],
        updatedList,
      );
      queryClient.setQueryData<ShoppingList[]>(
        [...COLLECTIONS.SHOPPING_LISTS],
        (old) => {
          if (!old) return [updatedList];
          return old.map((list) =>
            list.id === updatedList.id ? updatedList : list,
          );
        },
      );

      queryClient.invalidateQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS, updatedList.id],
      });
      queryClient.invalidateQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });

      showSuccessToast("update");
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
    onMutate: async ({ id, totalAmount, categoryId, linkedTransactionId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS, id],
      });
      await queryClient.cancelQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });

      // Snapshot the previous values
      const previousList = queryClient.getQueryData<ShoppingList>([
        ...COLLECTIONS.SHOPPING_LISTS,
        id,
      ]);
      const previousLists = queryClient.getQueryData<ShoppingList[]>([
        ...COLLECTIONS.SHOPPING_LISTS,
      ]);

      if (previousList) {
        queryClient.setQueryData<ShoppingList>(
          [...COLLECTIONS.SHOPPING_LISTS, id],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              status: "completed",
              totalAmount,
              categoryId,
              linkedTransactionId,
              updatedAt: new Date().toISOString(),
            };
          },
        );
      }

      if (previousLists) {
        queryClient.setQueryData<ShoppingList[]>(
          [...COLLECTIONS.SHOPPING_LISTS],
          (old) => {
            if (!old) return old;
            return old.map((list) =>
              list.id === id
                ? {
                    ...list,
                    status: "completed",
                    totalAmount,
                    categoryId,
                    linkedTransactionId,
                    updatedAt: new Date().toISOString(),
                  }
                : list,
            );
          },
        );
      }

      return { previousList, previousLists };
    },
    onError: (err, { id }, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousList) {
        queryClient.setQueryData(
          [...COLLECTIONS.SHOPPING_LISTS, id],
          context.previousList,
        );
      }
      if (context?.previousLists) {
        queryClient.setQueryData(
          [...COLLECTIONS.SHOPPING_LISTS],
          context.previousLists,
        );
      }
      showErrorToast("complete", err);
    },
    onSuccess: (updatedList) => {
      queryClient.setQueryData(
        [...COLLECTIONS.SHOPPING_LISTS, updatedList.id],
        updatedList,
      );
      queryClient.setQueryData<ShoppingList[]>(
        [...COLLECTIONS.SHOPPING_LISTS],
        (old) => {
          if (!old) return [updatedList];
          return old.map((list) =>
            list.id === updatedList.id ? updatedList : list,
          );
        },
      );

      queryClient.invalidateQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS, updatedList.id],
      });
      queryClient.invalidateQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });

      showSuccessToast("complete");
    },
  });
}
