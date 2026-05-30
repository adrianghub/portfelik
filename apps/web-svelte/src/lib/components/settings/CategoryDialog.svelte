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
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
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
