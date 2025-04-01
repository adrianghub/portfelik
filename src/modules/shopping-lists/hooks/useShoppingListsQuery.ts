import { useAuth } from "@/hooks/useAuth";
import { COLLECTIONS } from "@/lib/firebase/firestore";
import { logger } from "@/lib/logger";
import type {
  ShoppingList,
  ShoppingListItem,
} from "@/modules/shopping-lists/shopping-list";
import { shoppingListService } from "@/modules/shopping-lists/ShoppingListService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useShoppingListToasts } from "./useShoppingListToasts";

export function useShoppingLists(status?: "active" | "completed") {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: [...COLLECTIONS.SHOPPING_LISTS, status, userId, "withShared"],
    queryFn: async () => {
      if (!userId) return [];

      try {
        let lists: ShoppingList[];

        // For regular users, show their lists + lists from shared groups
        if (status === "active") {
          lists = await shoppingListService.getAllActiveShoppingLists(userId);
        } else if (status === "completed") {
          lists =
            await shoppingListService.getAllCompletedShoppingLists(userId);
        } else {
          lists = await shoppingListService.getAllUserShoppingLists(userId);
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
    enabled: !!userId,
  });
}

export function useShoppingList(id?: string) {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: [...COLLECTIONS.SHOPPING_LISTS, id],
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
    | (Omit<ShoppingList, "id" | "userId"> & { groupId?: string })
    | {
        name: string;
        items?: ShoppingListItem[];
        categoryId?: string;
        groupId?: string;
      };

  return useMutation({
    mutationFn: async (newShoppingList: CreateShoppingListInput) => {
      if (!userId) throw new Error("User not authenticated");

      try {
        const groupId =
          "groupId" in newShoppingList ? newShoppingList.groupId : undefined;

        if (
          "createdAt" in newShoppingList &&
          "updatedAt" in newShoppingList &&
          "status" in newShoppingList
        ) {
          const { groupId: _, ...rest } = newShoppingList;
          const newList = await shoppingListService.createWithGroup(
            {
              ...rest,
              userId,
            },
            groupId,
          );
          return newList;
        } else {
          const now = new Date().toISOString();
          const newList = await shoppingListService.createWithGroup(
            {
              name: newShoppingList.name,
              items: newShoppingList.items || [],
              createdAt: now,
              updatedAt: now,
              status: "active",
              userId,
              categoryId: newShoppingList.categoryId,
            },
            groupId,
          );
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
      await queryClient.cancelQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });

      // Snapshot the previous value
      const previousLists = queryClient.getQueryData<ShoppingList[]>([
        ...COLLECTIONS.SHOPPING_LISTS,
      ]);

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
        [...COLLECTIONS.SHOPPING_LISTS],
        (old) => {
          if (!old) return [optimisticList];
          return [optimisticList, ...old];
        },
      );

      queryClient.setQueryData(
        [...COLLECTIONS.SHOPPING_LISTS, optimisticList.id],
        optimisticList,
      );

      return { previousLists, optimisticList };
    },
    onError: (err, _newShoppingList, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousLists) {
        queryClient.setQueryData(
          [...COLLECTIONS.SHOPPING_LISTS],
          context.previousLists,
        );
      }
      if (context?.optimisticList) {
        queryClient.removeQueries({
          queryKey: [...COLLECTIONS.SHOPPING_LISTS, context.optimisticList.id],
        });
      }
      showErrorToast("create", err);
    },
    onSuccess: (newList) => {
      // Update the optimistic list with the real one
      queryClient.setQueryData<ShoppingList[]>(
        [...COLLECTIONS.SHOPPING_LISTS],
        (old) => {
          if (!old) return [newList];
          return old.map((list) => (list.id === newList.id ? newList : list));
        },
      );

      queryClient.setQueryData(
        [...COLLECTIONS.SHOPPING_LISTS, newList.id],
        newList,
      );

      queryClient.invalidateQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });
      queryClient.invalidateQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS, newList.id],
      });

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
      await queryClient.cancelQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });
      await queryClient.cancelQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS, id],
      });

      const previousList = queryClient.getQueryData<ShoppingList>([
        ...COLLECTIONS.SHOPPING_LISTS,
        id,
      ]);
      const previousLists = queryClient.getQueryData<ShoppingList[]>([
        ...COLLECTIONS.SHOPPING_LISTS,
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData<ShoppingList[]>(
        [...COLLECTIONS.SHOPPING_LISTS],
        (old) => {
          if (!old) return old;
          return old.filter((list) => list.id !== id);
        },
      );

      queryClient.removeQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS, id],
      });

      return { previousList, previousLists, deletedId: id };
    },
    onError: (err, id, context) => {
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
      showErrorToast("delete", err);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });
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
    mutationFn: async (shoppingList: ShoppingList & { groupId?: string }) => {
      if (!userId) throw new Error("User not authenticated");

      try {
        const now = new Date().toISOString();
        const { id, groupId, ...shoppingListWithoutId } = shoppingList;
        const newList = await shoppingListService.createWithGroup(
          {
            ...shoppingListWithoutId,
            name: `${shoppingList.name} (kopia)`,
            createdAt: now,
            updatedAt: now,
            status: "active",
            userId,
          },
          groupId,
        );
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
      await queryClient.cancelQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });

      // Snapshot the previous value
      const previousLists = queryClient.getQueryData<ShoppingList[]>([
        ...COLLECTIONS.SHOPPING_LISTS,
      ]);

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
        [...COLLECTIONS.SHOPPING_LISTS],
        (old) => {
          if (!old) return [optimisticList];
          return [optimisticList, ...old];
        },
      );

      queryClient.setQueryData(
        [...COLLECTIONS.SHOPPING_LISTS, optimisticList.id],
        optimisticList,
      );

      return { previousLists, optimisticList };
    },
    onError: (err, _shoppingList, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousLists) {
        queryClient.setQueryData(
          [...COLLECTIONS.SHOPPING_LISTS],
          context.previousLists,
        );
      }
      if (context?.optimisticList) {
        queryClient.removeQueries({
          queryKey: [...COLLECTIONS.SHOPPING_LISTS, context.optimisticList.id],
        });
      }
      showErrorToast("duplicate", err);
    },
    onSuccess: (newList) => {
      // Update the optimistic list with the real one
      queryClient.setQueryData<ShoppingList[]>(
        [...COLLECTIONS.SHOPPING_LISTS],
        (old) => {
          if (!old) return [newList];
          return old.map((list) => (list.id === newList.id ? newList : list));
        },
      );

      queryClient.setQueryData(
        [...COLLECTIONS.SHOPPING_LISTS, newList.id],
        newList,
      );

      queryClient.invalidateQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS],
      });
      queryClient.invalidateQueries({
        queryKey: [...COLLECTIONS.SHOPPING_LISTS, newList.id],
      });

      showSuccessToast("duplicate");
    },
  });
}
