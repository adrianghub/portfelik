<script lang="ts">
  import { untrack } from "svelte";
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { createCategory, updateCategory } from "$lib/services/categories";
  import type { Category, TransactionType } from "$lib/types";
  import Dialog from "$lib/components/ui/Dialog.svelte";
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
      onclose();
    },
  }));

  function handleSubmit(e: Event) {
    e.preventDefault();
    mutation.mutate();
  }
</script>

<Dialog {open} {onclose} {title}>
  <form onsubmit={handleSubmit} class="space-y-4">
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600" for="cat-name"
        >{m.category_form_name()}</label
      >
      <input
        id="cat-name"
        type="text"
        required
        bind:value={name}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      />
    </div>

    <div class="space-y-1">
      <span class="text-xs font-medium text-zinc-600">{m.category_form_type()}</span>
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
    </div>

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
