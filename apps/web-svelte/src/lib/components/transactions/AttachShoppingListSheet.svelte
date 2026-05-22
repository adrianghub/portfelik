<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import {
    attachShoppingListToTransaction,
    fetchAttachableShoppingListsForTransaction,
  } from "$lib/services/shopping-lists";
  import type { ShoppingListSummary, TransactionWithCategory } from "$lib/types";
  import { toast } from "svelte-sonner";
  import { ShoppingCart, X } from "lucide-svelte";

  interface Props {
    transaction: TransactionWithCategory;
    onclose: () => void;
    onattached: () => void;
  }
  let { transaction, onclose, onattached }: Props = $props();

  const qc = useQueryClient();
  let attachedListId = $state<string | null>(null);

  const listsQuery = createQuery(() => ({
    queryKey: ["attachable_shopping_lists", transaction.group_id ?? null],
    queryFn: () => fetchAttachableShoppingListsForTransaction(transaction.group_id ?? null),
    staleTime: 30_000,
  }));

  const attachMutation = createMutation(() => ({
    mutationFn: (listId: string) => attachShoppingListToTransaction(listId, transaction.id),
    onSuccess: () => {
      toast.success(m.shopping_list_attach_success());
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["shopping_lists"] });
      if (attachedListId) qc.invalidateQueries({ queryKey: ["shopping_list", attachedListId] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      onattached();
      onclose();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message ?? "attach_failed");
    },
  }));

  function attach(list: ShoppingListSummary) {
    attachedListId = list.id;
    attachMutation.mutate(list.id);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm"
  role="presentation"
  onclick={onclose}
  aria-hidden="true"
></div>

<aside
  class="fixed inset-y-0 right-0 z-[70] flex w-full max-w-sm flex-col border-l border-white/5 bg-slate-950/95 shadow-[0_0_60px_rgba(16,185,129,0.08)] backdrop-blur"
  aria-label={m.transaction_attach_shopping_list_cta()}
>
  <div class="flex items-center justify-between border-b border-white/5 px-5 py-4">
    <h2 class="text-base font-semibold text-slate-100">
      {m.transaction_attach_shopping_list_cta()}
    </h2>
    <button
      type="button"
      onclick={onclose}
      class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
      aria-label={m.common_close()}
    >
      <X size={18} />
    </button>
  </div>

  <div class="flex-1 overflow-y-auto px-5 py-4">
    {#if listsQuery.isPending}
      <p class="text-sm text-slate-400">…</p>
    {:else if (listsQuery.data ?? []).length === 0}
      <p class="text-sm text-slate-400">{m.transaction_attach_shopping_list_empty()}</p>
    {:else}
      <ul class="space-y-2">
        {#each listsQuery.data ?? [] as list (list.id)}
          <li>
            <button
              type="button"
              onclick={() => attach(list)}
              disabled={attachMutation.isPending}
              class="flex w-full items-center justify-between rounded-lg border border-white/5 bg-slate-900/60 px-3 py-2 text-left text-sm text-slate-100 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              <span class="flex items-center gap-2 truncate">
                <ShoppingCart size={14} class="shrink-0 text-emerald-400" />
                <span class="truncate">{list.name}</span>
              </span>
              <span class="ml-2 shrink-0 text-xs text-slate-400 tabular-nums">
                {list.item_completed}/{list.item_total}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</aside>
