import { logger } from "@/lib/logger";
import { userService } from "@/modules/admin/users/UserService";
import { useFetchCategories } from "@/modules/shared/useCategoriesQuery";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import { shoppingListService } from "@/modules/shopping-lists/ShoppingListService";
import type { Transaction } from "@/modules/transactions/transaction";
import { useDeleteTransaction } from "@/modules/transactions/useTransactionsQuery";
import { useEffect, useState } from "react";

export function useTransactionTableData(
  transactions: Transaction[],
  showUserInfo: boolean,
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
    if (!showUserInfo) return;

    const fetchUserEmails = async () => {
      setLoadingUsers(true);
      const userIds = [
        ...new Set(transactions.map((t) => t.userId).filter(Boolean)),
      ];

      const emailsMap: Record<string, string> = {};
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const user = await userService.getById(userId!);
            emailsMap[userId!] = user?.email || "Unknown";
          } catch (err) {
            logger.error(
              "useTransactionTableData",
              `Failed to fetch user ${userId}`,
              err,
            );
            emailsMap[userId!] = "Unknown";
          }
        }),
      );

      setUserEmails(emailsMap);
      setLoadingUsers(false);
    };

    fetchUserEmails();
  }, [transactions, showUserInfo]);

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
    loadingUsers,
    loadingShoppingLists,
    loadingCategories,
    categories,
    handleDelete,
    getCategoryName,
  };
}
