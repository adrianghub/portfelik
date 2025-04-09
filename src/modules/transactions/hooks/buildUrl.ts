import type dayjs from "dayjs";

/**
 * Builds the URL for transaction API with optional date parameters
 */
export const buildUrl = (
  baseUrl: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
): string => {
  let url = baseUrl;

  if (startDate && endDate) {
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();
    url += `?startDate=${encodeURIComponent(startDateStr)}&endDate=${encodeURIComponent(endDateStr)}`;
  }

  return url;
};
