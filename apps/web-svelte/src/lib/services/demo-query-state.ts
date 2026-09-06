import { qk } from "$lib/query-keys";
import type { QueryClient } from "@tanstack/svelte-query";

/**
 * Demo touches several financial aggregates. Invalidating the complete user
 * namespace prevents a deleted showcase row from surviving in an inactive
 * plan, cashflow, net-worth, or settlement cache.
 */
export async function refreshDemoState(queryClient: QueryClient, userId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: qk.user(userId) });
}
