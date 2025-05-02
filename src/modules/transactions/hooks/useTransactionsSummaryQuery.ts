import { useAuth } from "@/hooks/useAuth";
import { COLLECTIONS } from "@/lib/firebase/firestore";
import { API_BASE_URL } from "@/modules/shared/constants";
import { fetcher } from "@/modules/shared/fetcher";
import { buildUrl } from "@/modules/transactions/hooks/buildUrl";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

export interface CategorySummary {
  categoryId: string;
  categoryName: string;
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
  categoryId?: string,
): Promise<MonthlySummary | null> => {
  const url = buildUrl(
    `${API_BASE_URL}/api/v1/transactions/summary`,
    startDate,
    endDate,
    categoryId,
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
 * Hook to fetch transaction summaries
 */
export function useTransactionsSummary(
  startDate?: Date,
  endDate?: Date,
  categoryId?: string,
) {
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
      categoryId,
    ],
    queryFn: async () => {
      if (!userId) return null;

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Authentication token not available");

        return await fetchTransactionSummaries(
          token,
          dayjsStartDate,
          dayjsEndDate,
          categoryId,
        );
      } catch (error) {
        console.error("Error in useTransactionsSummary:", error);
        throw error;
      }
    },
  });
}
