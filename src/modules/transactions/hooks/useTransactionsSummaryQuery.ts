import { useAuth } from "@/hooks/useAuth";
import { COLLECTIONS } from "@/lib/firebase/firestore";
import { API_BASE_URL } from "@/modules/shared/constants";
import { fetcher } from "@/modules/shared/fetcher";
import { buildUrl } from "@/modules/transactions/hooks/buildUrl";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

export interface CategorySummary {
  categoryId: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface MonthlySummary {
  month: string;
  totalExpenses: number;
  totalIncome: number;
  delta: number;
  categorySummaries: CategorySummary[];
}

export interface TransactionSummaryResponse {
  summary: MonthlySummary | null;
}

export const TRANSACTION_SUMMARY_QUERY_KEY = ["transactions-summary"];

/**
 * Fetches transaction summaries from the API
 */
const fetchTransactionSummaries = async (
  token: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
): Promise<MonthlySummary | null> => {
  const url = buildUrl(
    `${API_BASE_URL}/api/v1/transactions/summary`,
    startDate,
    endDate,
  );

  try {
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.summary;
  } catch (error) {
    console.error("Error fetching transaction summaries:", error);
    throw error;
  }
};

/**
 * Fetches shared transaction summaries from the API
 */
const fetchSharedTransactionSummaries = async (
  token: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
): Promise<MonthlySummary | null> => {
  const url = buildUrl(
    `${API_BASE_URL}/api/v1/transactions/summary/shared`,
    startDate,
    endDate,
  );

  try {
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.summary;
  } catch (error) {
    console.error("Error fetching shared transaction summaries:", error);
    throw error;
  }
};

/**
 * Combines two category summaries into one
 */
const combineCategorySummaries = (
  existing: CategorySummary,
  newCategory: CategorySummary,
  totalExpenses: number,
): CategorySummary => {
  const combinedAmount = existing.amount + newCategory.amount;
  const combinedTransactionCount =
    existing.transactionCount + newCategory.transactionCount;

  return {
    ...existing,
    amount: combinedAmount,
    transactionCount: combinedTransactionCount,
    percentage: totalExpenses > 0 ? (combinedAmount / totalExpenses) * 100 : 0,
  };
};

/**
 * Combines user and shared transaction summaries
 */
const combineSummaries = (
  userSummary: MonthlySummary | null,
  sharedSummary: MonthlySummary | null,
): MonthlySummary => {
  // Create base combined summary
  const combinedSummary: MonthlySummary = {
    month: userSummary?.month || sharedSummary?.month || "",
    totalExpenses:
      (userSummary?.totalExpenses || 0) + (sharedSummary?.totalExpenses || 0),
    totalIncome:
      (userSummary?.totalIncome || 0) + (sharedSummary?.totalIncome || 0),
    delta: (userSummary?.delta || 0) + (sharedSummary?.delta || 0),
    categorySummaries: [],
  };

  // Combine category summaries
  const categoryMap = new Map<string, CategorySummary>();

  // Process user summary categories
  if (userSummary?.categorySummaries) {
    userSummary.categorySummaries.forEach((category) => {
      categoryMap.set(category.categoryId, { ...category });
    });
  }

  // Process shared summary categories and combine with user categories
  if (sharedSummary?.categorySummaries) {
    sharedSummary.categorySummaries.forEach((category) => {
      if (categoryMap.has(category.categoryId)) {
        // Category exists in both summaries, combine them
        const existingCategory = categoryMap.get(category.categoryId)!;
        categoryMap.set(
          category.categoryId,
          combineCategorySummaries(
            existingCategory,
            category,
            combinedSummary.totalExpenses,
          ),
        );
      } else {
        // Category only exists in shared summary
        categoryMap.set(category.categoryId, { ...category });
      }
    });
  }

  // Convert map to array and sort by amount (descending)
  combinedSummary.categorySummaries = Array.from(categoryMap.values()).sort(
    (a, b) => b.amount - a.amount,
  );

  return combinedSummary;
};

/**
 * Hook to fetch and combine user and shared transaction summaries
 */
export function useTransactionsSummary(startDate?: Date, endDate?: Date) {
  const { userData, getIdToken } = useAuth();
  const userId = userData?.uid;

  const dayjsStartDate = startDate ? dayjs(startDate) : undefined;
  const dayjsEndDate = endDate ? dayjs(endDate) : undefined;

  return useQuery({
    queryKey: [
      COLLECTIONS.TRANSACTIONS,
      TRANSACTION_SUMMARY_QUERY_KEY,
      userId,
      dayjsStartDate?.toISOString(),
      dayjsEndDate?.toISOString(),
    ],
    queryFn: async () => {
      if (!userId) return null;

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Authentication token not available");

        const [userSummary, sharedSummary] = await Promise.all([
          fetchTransactionSummaries(token, dayjsStartDate, dayjsEndDate),
          fetchSharedTransactionSummaries(token, dayjsStartDate, dayjsEndDate),
        ]);

        return combineSummaries(userSummary, sharedSummary);
      } catch (error) {
        console.error("Error in useTransactionsSummary:", error);
        throw error;
      }
    },
  });
}

/**
 * Hook to fetch only shared transaction summaries
 */
export function useSharedTransactionsSummary(startDate?: Date, endDate?: Date) {
  const { userData, getIdToken } = useAuth();
  const userId = userData?.uid;

  const dayjsStartDate = startDate ? dayjs(startDate) : undefined;
  const dayjsEndDate = endDate ? dayjs(endDate) : undefined;

  return useQuery({
    queryKey: [
      COLLECTIONS.TRANSACTIONS,
      TRANSACTION_SUMMARY_QUERY_KEY,
      "shared",
      userId,
      dayjsStartDate?.toISOString(),
      dayjsEndDate?.toISOString(),
    ],
    queryFn: async () => {
      if (!userId) return null;

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Authentication token not available");

        return await fetchSharedTransactionSummaries(
          token,
          dayjsStartDate,
          dayjsEndDate,
        );
      } catch (error) {
        console.error("Error fetching shared transaction summaries:", error);
        throw error;
      }
    },
    enabled: !!userId,
  });
}
