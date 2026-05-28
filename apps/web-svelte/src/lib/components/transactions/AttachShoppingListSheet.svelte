<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import {
    attachShoppingListToTransaction,
    createShoppingList,
    createShoppingListItem,
    fetchAttachableShoppingListsForTransaction,
  } from "$lib/services/shopping-lists";
  import type { ShoppingListSummary, TransactionWithCategory } from "$lib/types";
  import { toast } from "svelte-sonner";
  import { ListPlus, ShoppingCart, X } from "lucide-svelte";

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

  const createAndAttachMutation = createMutation(() => ({
    mutationFn: async () => {
      const list = await createShoppingList({
        name: transaction.description,
        group_id: transaction.group_id,
        category_id: transaction.category_id,
        planned_for: transaction.date,
      });
      attachedListId = list.id;
      await createShoppingListItem({
        shopping_list_id: list.id,
        name: transaction.description,
        quantity: 1,
        unit: "szt.",
        category: null,
        position: 1,
      });
      return attachShoppingListToTransaction(list.id, transaction.id);
    },
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
      <div class="space-y-4">
        <div class="rounded-2xl border border-white/5 bg-slate-900/45 p-4">
          <div
            class="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
          >
            <ListPlus size={18} aria-hidden="true" />
          </div>
          <p class="text-sm font-medium text-slate-100">
            {m.transaction_attach_shopping_list_empty_title()}
          </p>
          <p class="mt-1 text-sm text-slate-400">
            {m.transaction_attach_shopping_list_empty()}
          </p>
        </div>
        <button
          type="button"
          onclick={() => createAndAttachMutation.mutate()}
          disabled={createAndAttachMutation.isPending}
          class="bg-accent-gradient flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ListPlus size={16} aria-hidden="true" />
          {createAndAttachMutation.isPending
            ? m.common_saving()
            : m.transaction_attach_shopping_list_create_from_transaction()}
        </button>
      </div>
    {:else}
      <div
        class="mb-4 rounded-2xl border border-white/5 bg-slate-900/35 p-3 text-sm text-slate-400"
      >
        {m.transaction_attach_shopping_list_pick_hint()}
      </div>
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
      <button
        type="button"
        onclick={() => createAndAttachMutation.mutate()}
        disabled={createAndAttachMutation.isPending || attachMutation.isPending}
        class="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ListPlus size={16} aria-hidden="true" />
        {createAndAttachMutation.isPending
          ? m.common_saving()
          : m.transaction_attach_shopping_list_create_from_transaction()}
      </button>
    {/if}
  </div>
</aside>
