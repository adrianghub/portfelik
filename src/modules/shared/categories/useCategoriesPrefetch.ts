import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  USER_CATEGORIES_QUERY_KEY,
  useFetchCategories,
} from "./useCategoriesQuery";

/**
 * Hook that handles prefetching and caching of categories data
 */
export function useCategoriesPrefetch() {
  const { userData, getIdToken, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const { data: categories, isLoading: categoriesLoading } =
    useFetchCategories();

  useEffect(() => {
    if (isLoading || !userData?.uid) return;

    queryClient.setQueryData(["currentUserId"], userData.uid);

    const prefetchIfNeeded = async () => {
      const existingData = queryClient.getQueryData([
        USER_CATEGORIES_QUERY_KEY,
        userData.uid,
      ]);
      if (existingData) return;

      try {
        const token = await getIdToken();
        if (!token) return;

        await queryClient.prefetchQuery({
          queryKey: [USER_CATEGORIES_QUERY_KEY, userData.uid],
          staleTime: 5 * 60 * 1000, // 5 minutes
        });
      } catch (error) {
        console.error("Failed to prefetch categories:", error);
      }
    };

    prefetchIfNeeded();
  }, [userData?.uid, isLoading, queryClient, getIdToken]);

  return {
    categories,
    isLoading: isLoading || categoriesLoading,
  };
}
