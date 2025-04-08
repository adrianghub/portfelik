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

const fetchTransactionSummaries = async (
  token: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
): Promise<MonthlySummary | null> => {
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

    return response.summary;
  } catch (error) {
    console.error("Error fetching transaction summaries:", error);
    throw error;
  }
};

const fetchSharedTransactionSummaries = async (
  token: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
): Promise<MonthlySummary | null> => {
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

    return response.summary;
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
      TRANSACTION_SUMMARY_QUERY_KEY,
      userId,
      isAdmin,
      dayjsStartDate?.toISOString(),
      dayjsEndDate?.toISOString(),
    ],
    queryFn: async () => {
      if (!userId) return null;

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Authentication token not available");

        const summary = await fetchTransactionSummaries(
          token,
          dayjsStartDate,
          dayjsEndDate,
        );

        return summary;
      } catch (error) {
        console.error("Error in useTransactionsSummary:", error);
        throw error;
      }
    },
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
