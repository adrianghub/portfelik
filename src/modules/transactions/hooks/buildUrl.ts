import type dayjs from "dayjs";

/**
 * Builds the URL for transaction API with optional date and category parameters
 */
export const buildUrl = (
  baseUrl: string,
  startDate?: dayjs.Dayjs,
  endDate?: dayjs.Dayjs,
  categoryId?: string,
): string => {
  let url = baseUrl;
  const params = new URLSearchParams();

  if (startDate) {
    params.append("startDate", startDate.toISOString());
  }
  if (endDate) {
    params.append("endDate", endDate.toISOString());
  }
  if (categoryId) {
    params.append("category", categoryId);
  }

  const paramString = params.toString();
  if (paramString) {
    url += `?${paramString}`;
  }

  return url;
};
