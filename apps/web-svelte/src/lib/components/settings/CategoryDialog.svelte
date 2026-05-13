<script lang="ts">
  import { untrack } from "svelte";
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { createCategory, updateCategory } from "$lib/services/categories";
  import type { Category, TransactionType } from "$lib/types";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import { toast } from "svelte-sonner";
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

  $effect(() => {
    if (open) {
      name = initial?.name ?? "";
      type = initial?.type ?? "expense";
    }
  });

  const isEdit = $derived(!!initial);
  const title = $derived(isEdit ? m.category_form_title_edit() : m.category_form_title_add());

  const mutation = createMutation(() => ({
    mutationFn: () =>
      isEdit ? updateCategory(initial!.id, { name, type }) : createCategory({ name, type }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(isEdit ? m.toast_category_updated() : m.toast_category_created());
      onclose();
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function handleSubmit(e: Event) {
    e.preventDefault();
    mutation.mutate();
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
        class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/10 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-white/10"
      />
    </div>

    <div class="space-y-1">
      <span class="text-xs font-medium text-slate-600 dark:text-slate-300"
        >{m.category_form_type()}</span
      >
      <div
        class="flex overflow-hidden rounded-lg border border-slate-200 text-sm dark:border-slate-700"
      >
        <button
          type="button"
          onclick={() => (type = "expense")}
          class="flex-1 py-2 font-medium transition-colors {type === 'expense'
            ? 'bg-rose-600 text-white'
            : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'}"
        >
          {m.common_expense()}
        </button>
        <button
          type="button"
          onclick={() => (type = "income")}
          class="flex-1 py-2 font-medium transition-colors {type === 'income'
            ? 'bg-emerald-600 text-white'
            : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'}"
        >
          {m.common_income()}
        </button>
      </div>
    </div>

    {#if mutation.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}

    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={onclose}
        class="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={mutation.isPending}
        class="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
      >
        {mutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>
