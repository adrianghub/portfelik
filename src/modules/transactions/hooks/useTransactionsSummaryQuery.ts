import { useAuth } from "@/hooks/useAuth";
import { COLLECTIONS } from "@/lib/firebase/firestore";
import { API_BASE_URL } from "@/modules/shared/constants";
import { fetcher } from "@/modules/shared/fetcher";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

export interface CategorySummary {
  categoryId: string;
  amount: number;
  percentage: number;
}

export interface MonthlySummary {
  month: string;
  totalExpenses: number;
  totalIncome: number;
  delta: number;
  categorySummaries: CategorySummary[];
}

export interface TransactionSummaryResponse {
  summaries: MonthlySummary[];
}

const fetchTransactionSummaries = async (
  token: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
): Promise<MonthlySummary[]> => {
  let url = `${API_BASE_URL}/api/v1/transactions/summary`;

  if (startDate && endDate) {
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();
    url += `?startDate=${encodeURIComponent(startDateStr)}&endDate=${encodeURIComponent(endDateStr)}`;
  }

  try {
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.summaries;
  } catch (error) {
    console.error("Error fetching transaction summaries:", error);
    throw error;
  }
};

const fetchSharedTransactionSummaries = async (
  token: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
): Promise<MonthlySummary[]> => {
  let url = `${API_BASE_URL}/api/v1/transactions/summary/shared`;

  if (startDate && endDate) {
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();
    url += `?startDate=${encodeURIComponent(startDateStr)}&endDate=${encodeURIComponent(endDateStr)}`;
  }

  try {
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.summaries;
  } catch (error) {
    console.error("Error fetching shared transaction summaries:", error);
    throw error;
  }
};

export function useTransactionsSummary(startDate?: Date, endDate?: Date) {
  const { userData, getIdToken } = useAuth();
  const userId = userData?.uid;
  const isAdmin = userData?.role === "admin";

  const dayjsStartDate = startDate ? dayjs(startDate) : undefined;
  const dayjsEndDate = endDate ? dayjs(endDate) : undefined;

  return useQuery({
    queryKey: [
      COLLECTIONS.TRANSACTIONS,
      "summary",
      userId,
      isAdmin,
      dayjsStartDate?.toISOString(),
      dayjsEndDate?.toISOString(),
    ],
    queryFn: async () => {
      if (!userId) return [];

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Authentication token not available");

        const summaries = await fetchTransactionSummaries(
          token,
          dayjsStartDate,
          dayjsEndDate,
        );

        if (!isAdmin) {
          const sharedSummaries = await fetchSharedTransactionSummaries(
            token,
            dayjsStartDate,
            dayjsEndDate,
          );

          // Merge summaries by month, combining regular and shared data
          const allSummaries = [...summaries];

          // Index regular summaries by month
          const summariesByMonth = summaries.reduce(
            (acc, summary) => {
              acc[summary.month] = summary;
              return acc;
            },
            {} as Record<string, MonthlySummary>,
          );

          // Process shared summaries
          sharedSummaries.forEach((sharedSummary) => {
            const monthKey = sharedSummary.month;

            if (summariesByMonth[monthKey]) {
              // Month exists in regular summaries, merge data
              const existingSummary = summariesByMonth[monthKey];

              // Build a map of category amounts from existing summary
              const categoryMap = existingSummary.categorySummaries.reduce(
                (acc, category) => {
                  acc[category.categoryId] = category.amount;
                  return acc;
                },
                {} as Record<string, number>,
              );

              // Add amounts from shared categories
              sharedSummary.categorySummaries.forEach((sharedCategory) => {
                if (categoryMap[sharedCategory.categoryId]) {
                  categoryMap[sharedCategory.categoryId] +=
                    sharedCategory.amount;
                } else {
                  categoryMap[sharedCategory.categoryId] =
                    sharedCategory.amount;
                }
              });

              // Calculate combined total expenses
              const combinedTotalExpenses =
                existingSummary.totalExpenses + sharedSummary.totalExpenses;

              // Create merged category summaries with updated percentages
              const mergedCategorySummaries = Object.entries(categoryMap).map(
                ([categoryId, amount]) => ({
                  categoryId,
                  amount,
                  percentage:
                    combinedTotalExpenses > 0
                      ? (amount / combinedTotalExpenses) * 100
                      : 0,
                }),
              );

              // Replace the summary in allSummaries with merged data
              const index = allSummaries.findIndex((s) => s.month === monthKey);
              if (index !== -1) {
                allSummaries[index] = {
                  ...existingSummary,
                  totalExpenses: combinedTotalExpenses,
                  totalIncome:
                    existingSummary.totalIncome + sharedSummary.totalIncome,
                  delta:
                    existingSummary.totalIncome +
                    sharedSummary.totalIncome -
                    combinedTotalExpenses,
                  categorySummaries: mergedCategorySummaries,
                };
              }
            } else {
              // Month doesn't exist in regular summaries, add it
              allSummaries.push(sharedSummary);
            }
          });

          // Sort by month (newest first)
          allSummaries.sort((a, b) => {
            return (
              dayjs(b.month + "-01").valueOf() -
              dayjs(a.month + "-01").valueOf()
            );
          });

          return allSummaries;
        }

        // Sort by month (newest first)
        summaries.sort((a, b) => {
          return (
            dayjs(b.month + "-01").valueOf() - dayjs(a.month + "-01").valueOf()
          );
        });

        return summaries;
      } catch (error) {
        console.error("Error fetching transaction summaries:", error);
        throw error;
      }
    },
    enabled: !!userId,
  });
}

export function useSharedTransactionsSummary(startDate?: Date, endDate?: Date) {
  const { userData, getIdToken } = useAuth();
  const userId = userData?.uid;

  const dayjsStartDate = startDate ? dayjs(startDate) : undefined;
  const dayjsEndDate = endDate ? dayjs(endDate) : undefined;

  return useQuery({
    queryKey: [
      COLLECTIONS.TRANSACTIONS,
      "summary",
      "shared",
      userId,
      dayjsStartDate?.toISOString(),
      dayjsEndDate?.toISOString(),
    ],
    queryFn: async () => {
      if (!userId) return [];

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
