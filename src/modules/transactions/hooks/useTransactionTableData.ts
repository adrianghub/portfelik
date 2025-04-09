import { logger } from "@/lib/logger";
import { userGroupService } from "@/modules/settings/UserGroupService";
import { useFetchCategories } from "@/modules/shared/categories/useCategoriesQuery";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import { shoppingListService } from "@/modules/shopping-lists/ShoppingListService";
import { useDeleteTransaction } from "@/modules/transactions/hooks/useTransactionsQuery";
import type { Transaction } from "@/modules/transactions/transaction";
import { useEffect, useState } from "react";

export function useTransactionTableData(
  transactions: Transaction[],
  userId?: string,
) {
  const deleteTransaction = useDeleteTransaction();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [shoppingLists, setShoppingLists] = useState<
    Record<string, ShoppingList>
  >({});
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingShoppingLists, setLoadingShoppingLists] = useState(false);

  const { data: categories = [], isLoading: loadingCategories } =
    useFetchCategories();

  useEffect(() => {
    if (!userId) return;
    setLoadingUsers(true);

    const fetchUserGroups = async () => {
      const userGroups = await userGroupService.getUserGroups(userId);
      return userGroups;
    };

    const fetchUserEmails = async () => {
      const userGroups = await fetchUserGroups();

      userGroups.forEach(async (group) => {
        const { memberIds, memberEmails } = group;

        memberIds.forEach((id, index) => {
          userEmails[id] = memberEmails[index];
        });

        setUserEmails(userEmails);
      });
    };

    fetchUserEmails();
    setLoadingUsers(false);
  }, [userEmails, userId]);

  useEffect(() => {
    const fetchShoppingLists = async () => {
      const listIds = [
        ...new Set(transactions.map((t) => t.shoppingListId).filter(Boolean)),
      ];
      if (listIds.length === 0) return;

      setLoadingShoppingLists(true);
      const listsMap: Record<string, ShoppingList> = {};

      await Promise.all(
        listIds.map(async (id) => {
          try {
            const list = await shoppingListService.get(id!);
            if (list) listsMap[id!] = list;
          } catch (err) {
            logger.error(
              "useTransactionTableData",
              `Failed to fetch list ${id}`,
              err,
            );
          }
        }),
      );

      setShoppingLists(listsMap);
      setLoadingShoppingLists(false);
    };

    fetchShoppingLists();
  }, [transactions]);

  const handleDelete = (id?: string) => {
    if (!id) return;
    setDeletingId(id);

    deleteTransaction.mutate(id, {
      onSuccess: () => setDeletingId(null),
      onError: (err) => {
        logger.error(
          "useTransactionTableData",
          "Failed to delete transaction",
          err,
        );
        setDeletingId(null);
      },
    });
  };

  const getCategoryName = (categoryId: string): string => {
    if (loadingCategories) return "Loading...";
    const found = categories.find((cat) => cat.id === categoryId);
    return found?.name || "Unknown category";
  };

  return {
    userEmails,
    shoppingLists,
    deletingId,
    loadingShoppingLists,
    loadingUsers,
    loadingCategories,
    categories,
    handleDelete,
    getCategoryName,
  };
}
