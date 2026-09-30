export const DATA_API_PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

/** Fetch every PostgREST page without relying on the project's max_rows setting. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += DATA_API_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + DATA_API_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < DATA_API_PAGE_SIZE) return all;
  }
}

export function chunksOf<T>(items: T[], size = 100): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}
