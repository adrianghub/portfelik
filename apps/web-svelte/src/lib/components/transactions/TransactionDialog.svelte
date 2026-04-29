<script lang="ts">
  import { untrack } from "svelte";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { createTransaction, updateTransaction } from "$lib/services/transactions";
  import { fetchCategories } from "$lib/services/categories";
  import type { Transaction, TransactionType, TransactionStatus } from "$lib/types";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    open: boolean;
    onclose: () => void;
    initial?: Transaction | null;
  }
  let { open, onclose, initial = null }: Props = $props();

  const queryClient = useQueryClient();

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  let type = $state<TransactionType>(untrack(() => initial?.type ?? "expense"));
  let amount = $state(untrack(() => (initial ? String(Math.abs(initial.amount)) : "")));
  let description = $state(untrack(() => initial?.description ?? ""));
  let date = $state(
    untrack(() =>
      initial?.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    )
  );
  let category_id = $state(untrack(() => initial?.category_id ?? ""));
  let status = $state<TransactionStatus>(untrack(() => initial?.status ?? "paid"));
  let is_recurring = $state(untrack(() => initial?.is_recurring ?? false));
  let recurring_day = $state(untrack(() => initial?.recurring_day ?? new Date().getDate()));

  $effect(() => {
    if (open) {
      type = initial?.type ?? "expense";
      amount = initial ? String(Math.abs(initial.amount)) : "";
      description = initial?.description ?? "";
      date = initial?.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      category_id = initial?.category_id ?? "";
      status = initial?.status ?? "paid";
      is_recurring = initial?.is_recurring ?? false;
      recurring_day = initial?.recurring_day ?? new Date().getDate();
    }
  });

  const filteredCategories = $derived(categoriesQuery.data?.filter((c) => c.type === type) ?? []);

  $effect(() => {
    // Reset category if it doesn't match the new type
    if (category_id && categoriesQuery.data) {
      const cat = categoriesQuery.data.find((c) => c.id === category_id);
      if (cat && cat.type !== type) category_id = "";
    }
  });

  const isEdit = $derived(!!initial);
  const title = $derived(isEdit ? m.transaction_form_title_edit() : m.transaction_form_title_add());

  const mutation = createMutation(() => ({
    mutationFn: (input: Parameters<typeof createTransaction>[0]) =>
      isEdit ? updateTransaction(initial!.id, input) : createTransaction(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(isEdit ? m.toast_transaction_updated() : m.toast_transaction_created());
      onclose();
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function handleSubmit(e: Event) {
    e.preventDefault();
    mutation.mutate({
      amount: parseFloat(amount),
      type,
      description,
      date,
      category_id,
      status,
      is_recurring,
      recurring_day: is_recurring ? recurring_day : null,
    });
  }
</script>

<Dialog {open} {onclose} {title}>
  <form onsubmit={handleSubmit} class="space-y-4">
    <!-- Type toggle -->
    <div class="flex overflow-hidden rounded-lg border border-zinc-200 text-sm">
      <button
        type="button"
        onclick={() => (type = "expense")}
        class="flex-1 py-2 font-medium transition-colors {type === 'expense'
          ? 'bg-rose-600 text-white'
          : 'bg-white text-zinc-500 hover:bg-zinc-50'}"
      >
        {m.common_expense()}
      </button>
      <button
        type="button"
        onclick={() => (type = "income")}
        class="flex-1 py-2 font-medium transition-colors {type === 'income'
          ? 'bg-emerald-600 text-white'
          : 'bg-white text-zinc-500 hover:bg-zinc-50'}"
      >
        {m.common_income()}
      </button>
    </div>

    <!-- Amount -->
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600" for="tx-amount"
        >{m.transaction_form_amount()}</label
      >
      <input
        id="tx-amount"
        type="number"
        min="0.01"
        step="0.01"
        required
        bind:value={amount}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      />
    </div>

    <!-- Description -->
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600" for="tx-desc"
        >{m.transaction_form_description()}</label
      >
      <input
        id="tx-desc"
        type="text"
        required
        bind:value={description}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      />
    </div>

    <!-- Date -->
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600" for="tx-date"
        >{m.transaction_form_date()}</label
      >
      <input
        id="tx-date"
        type="date"
        required
        bind:value={date}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      />
    </div>

    <!-- Category -->
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600" for="tx-cat"
        >{m.transaction_form_category()}</label
      >
      <select
        id="tx-cat"
        required
        bind:value={category_id}
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      >
        <option value="">{m.transaction_form_select_category()}</option>
        {#each filteredCategories as cat (cat.id)}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>

    <!-- Status -->
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600" for="tx-status"
        >{m.transaction_form_status()}</label
      >
      <select
        id="tx-status"
        bind:value={status}
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      >
        <option value="paid">{m.transactions_status_paid()}</option>
        <option value="upcoming">{m.transactions_status_upcoming()}</option>
        <option value="draft">{m.transactions_status_draft()}</option>
        <option value="overdue">{m.transactions_status_overdue()}</option>
      </select>
    </div>

    <!-- Recurring -->
    <label class="flex cursor-pointer items-center gap-3 select-none">
      <input type="checkbox" bind:checked={is_recurring} class="sr-only" />
      <div
        class="relative h-5 w-9 rounded-full transition-colors {is_recurring
          ? 'bg-zinc-800'
          : 'bg-zinc-200'}"
      >
        <div
          class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform {is_recurring
            ? 'translate-x-4'
            : 'translate-x-0'}"
        ></div>
      </div>
      <span class="text-sm text-zinc-700">{m.transaction_form_recurring()}</span>
    </label>

    {#if is_recurring}
      <div class="space-y-1">
        <label class="text-xs font-medium text-zinc-600" for="tx-recday"
          >{m.transaction_form_recurring_day()}</label
        >
        <input
          id="tx-recday"
          type="number"
          min="1"
          max="28"
          bind:value={recurring_day}
          class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
        />
      </div>
    {/if}

    {#if mutation.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}

    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={onclose}
        class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={mutation.isPending}
        class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {mutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>
