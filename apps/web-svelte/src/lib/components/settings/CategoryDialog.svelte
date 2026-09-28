<script lang="ts">
  import { untrack } from "svelte";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { requireSessionUserId, session } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import { createCategory, isCategoryReferenced, updateCategory } from "$lib/services/categories";
  import { normalizeCapAmount } from "$lib/services/pile-progress";
  import type { Category, CategoryCapPeriod, TransactionType } from "$lib/types";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    open: boolean;
    onclose: () => void;
    initial?: Category | null;
  }
  let { open, onclose, initial = null }: Props = $props();

  const queryClient = useQueryClient();

  let name = $state(untrack(() => initial?.name ?? ""));
  let type = $state<TransactionType>(untrack(() => initial?.type ?? "expense"));
  let capAmount = $state<number | null>(untrack(() => initial?.cap_amount ?? null));
  let capPeriod = $state<CategoryCapPeriod>(untrack(() => initial?.cap_period ?? "month"));
  const capValue = $derived(normalizeCapAmount(capAmount));

  $effect(() => {
    if (open) {
      name = initial?.name ?? "";
      type = initial?.type ?? "expense";
      capAmount = initial?.cap_amount ?? null;
      capPeriod = initial?.cap_period ?? "month";
    }
  });

  const isEdit = $derived(!!initial);
  const title = $derived(isEdit ? m.category_form_title_edit() : m.category_form_title_add());

  const refsQuery = createQuery(() => ({
    queryKey: [...qk.categories(session.userId ?? "anon"), "refs", initial?.id ?? "new"] as const,
    queryFn: () => isCategoryReferenced(initial!.id),
    enabled: () => open && !!session.userId && !!initial?.id,
  }));
  const typeLocked = $derived(isEdit && refsQuery.data === true);

  const mutation = createMutation(() => ({
    mutationFn: () => {
      const amount = normalizeCapAmount(capAmount);
      const cap =
        type === "expense" && amount != null
          ? { cap_amount: amount, cap_period: capPeriod }
          : { cap_amount: null, cap_period: null };
      return isEdit
        ? updateCategory(initial!.id, typeLocked ? { name, ...cap } : { name, type, ...cap })
        : createCategory({ name, type, ...cap });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.categories(requireSessionUserId()) });
      toast.success(isEdit ? m.toast_category_updated() : m.toast_category_created());
      onclose();
    },
    onError: (err) => toastError(err),
  }));

  function handleSubmit(e: Event) {
    e.preventDefault();
    void mutation.mutateAsync().catch(() => {
      // onError already toasted
    });
  }
</script>

<Dialog {open} {onclose} {title}>
  <form onsubmit={handleSubmit} class="space-y-4">
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="cat-name"
        >{m.category_form_name()}</label
      >
      <input
        id="cat-name"
        type="text"
        required
        bind:value={name}
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
      />
    </div>

    <div class="space-y-1">
      <span class="text-xs font-medium text-slate-600 dark:text-slate-300"
        >{m.category_form_type()}</span
      >
      <div
        class="flex overflow-hidden rounded-lg border border-slate-200 text-sm dark:border-slate-700"
        class:opacity-60={typeLocked}
      >
        <button
          type="button"
          disabled={typeLocked}
          onclick={() => (type = "expense")}
          class="flex-1 py-2 font-medium transition-colors {type === 'expense'
            ? 'bg-rose-600 text-white'
            : 'bg-white text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'} disabled:cursor-not-allowed"
        >
          {m.common_expense()}
        </button>
        <button
          type="button"
          disabled={typeLocked}
          onclick={() => (type = "income")}
          class="flex-1 py-2 font-medium transition-colors {type === 'income'
            ? 'bg-emerald-600 text-white'
            : 'bg-white text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'} disabled:cursor-not-allowed"
        >
          {m.common_income()}
        </button>
      </div>
      {#if typeLocked}
        <p class="text-xs text-slate-400">{m.category_form_type_locked_hint()}</p>
      {/if}
    </div>

    {#if type === "expense"}
      <div class="space-y-1">
        <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="cat-cap"
          >{m.category_form_cap()}</label
        >
        <input
          id="cat-cap"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          bind:value={capAmount}
          placeholder={m.category_form_cap_placeholder()}
          class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
        />
        <p class="text-xs text-slate-400">{m.category_form_cap_hint()}</p>
      </div>
      {#if capValue != null}
        <div class="space-y-1">
          <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="cat-cap-period"
            >{m.category_form_cap_period()}</label
          >
          <select
            id="cat-cap-period"
            bind:value={capPeriod}
            class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 focus:ring-2 focus:outline-none"
          >
            <option value="month">{m.category_form_cap_month()}</option>
            <option value="year">{m.category_form_cap_year()}</option>
          </select>
        </div>
      {/if}
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
        class="bg-accent-gradient flex-1 rounded-lg py-2 text-sm font-medium text-slate-900 transition-transform hover:brightness-110 disabled:opacity-50"
      >
        {mutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>
