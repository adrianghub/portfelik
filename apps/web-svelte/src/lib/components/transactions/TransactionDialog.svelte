<script lang="ts">
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import { createTransaction, updateTransaction } from "$lib/services/transactions";
  import type { Transaction, TransactionStatus, TransactionType } from "$lib/types";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";

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

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
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
  let group_id = $state<string>(untrack(() => initial?.group_id ?? ""));

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
      group_id = initial?.group_id ?? "";
    }
  });

  const filteredCategories = $derived(categoriesQuery.data?.filter((c) => c.type === type) ?? []);

  $effect(() => {
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
      group_id: group_id || null,
    });
  }

  const inputClass =
    "w-full scroll-mb-32 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 backdrop-blur focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none";
  const labelClass = "text-eyebrow block text-slate-400";
</script>

<Dialog {open} {onclose} {title}>
  <form onsubmit={handleSubmit} class="space-y-4">
    <!-- Type toggle -->
    <div
      class="flex overflow-hidden rounded-full border border-white/10 bg-slate-900/60 p-1 text-sm"
    >
      <button
        type="button"
        onclick={() => (type = "expense")}
        class="flex-1 rounded-full py-1.5 font-medium transition-colors {type === 'expense'
          ? 'bg-rose-500/90 text-white shadow-[0_0_18px_rgba(244,63,94,0.25)]'
          : 'text-slate-300 hover:text-slate-100'}"
      >
        {m.common_expense()}
      </button>
      <button
        type="button"
        onclick={() => (type = "income")}
        class="flex-1 rounded-full py-1.5 font-medium transition-colors {type === 'income'
          ? 'bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]'
          : 'text-slate-300 hover:text-slate-100'}"
      >
        {m.common_income()}
      </button>
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-amount">{m.transaction_form_amount()}</label>
      <input
        id="tx-amount"
        type="number"
        min="0.01"
        step="0.01"
        required
        bind:value={amount}
        class={inputClass}
      />
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-desc">{m.transaction_form_description()}</label>
      <input id="tx-desc" type="text" required bind:value={description} class={inputClass} />
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-date">{m.transaction_form_date()}</label>
      <input id="tx-date" type="date" required bind:value={date} class={inputClass} />
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-cat">{m.transaction_form_category()}</label>
      <select id="tx-cat" required bind:value={category_id} class={inputClass}>
        <option value="">{m.transaction_form_select_category()}</option>
        {#each filteredCategories as cat (cat.id)}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>

    <div class="space-y-1">
      <label class={labelClass} for="tx-status">{m.transaction_form_status()}</label>
      <select id="tx-status" bind:value={status} class={inputClass}>
        <option value="paid">{m.transactions_status_paid()}</option>
        <option value="upcoming">{m.transactions_status_upcoming()}</option>
        <option value="draft">{m.transactions_status_draft()}</option>
        <option value="overdue">{m.transactions_status_overdue()}</option>
      </select>
    </div>

    {#if groupsQuery.data && groupsQuery.data.length > 0}
      <div class="space-y-1">
        <label class={labelClass} for="tx-group">{m.group_assign_label()}</label>
        <select id="tx-group" bind:value={group_id} class={inputClass}>
          <option value="">{m.group_assign_none()}</option>
          {#each groupsQuery.data as g (g.id)}
            <option value={g.id}>{g.name}</option>
          {/each}
        </select>
        <p class="text-xs text-slate-500">{m.group_assign_help()}</p>
      </div>
    {/if}

    <label class="flex cursor-pointer items-center gap-3 select-none">
      <input type="checkbox" bind:checked={is_recurring} class="sr-only" />
      <div
        class="relative h-5 w-9 rounded-full transition-colors {is_recurring
          ? 'bg-accent-gradient shadow-[0_0_12px_var(--color-accent-glow)]'
          : 'bg-slate-700'}"
      >
        <div
          class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform {is_recurring
            ? 'translate-x-4'
            : 'translate-x-0'}"
        ></div>
      </div>
      <span class="text-sm text-slate-200">{m.transaction_form_recurring()}</span>
    </label>

    {#if is_recurring}
      <div class="space-y-1">
        <label class={labelClass} for="tx-recday">{m.transaction_form_recurring_day()}</label>
        <input
          id="tx-recday"
          type="number"
          min="1"
          max="31"
          bind:value={recurring_day}
          class={inputClass}
        />
      </div>
    {/if}

    {#if mutation.isError}
      <p class="text-sm text-rose-300">{m.common_error_title()}</p>
    {/if}

    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={onclose}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={mutation.isPending}
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-50"
      >
        {mutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>
