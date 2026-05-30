<script lang="ts">
  import { Trash2, X } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";
  import type { Category, TransactionStatus } from "$lib/types";

  interface Props {
    count: number;
    categories: Category[];
    pending?: boolean;
    onclear: () => void;
    onsetstatus: (status: TransactionStatus) => void;
    onsetcategory: (categoryId: string) => void;
    ondelete: () => void;
  }

  let {
    count,
    categories,
    pending = false,
    onclear,
    onsetstatus,
    onsetcategory,
    ondelete,
  }: Props = $props();

  const statusOptions: { value: TransactionStatus; label: string }[] = [
    { value: "paid", label: m.transactions_status_paid() },
    { value: "upcoming", label: m.transactions_status_upcoming() },
    { value: "draft", label: m.transactions_status_draft() },
    { value: "overdue", label: m.transactions_status_overdue() },
  ];

  function onStatusSelect(e: Event) {
    const el = e.target as HTMLSelectElement;
    if (el.value) {
      onsetstatus(el.value as TransactionStatus);
      el.value = "";
    }
  }

  function onCategorySelect(e: Event) {
    const el = e.target as HTMLSelectElement;
    if (el.value) {
      onsetcategory(el.value);
      el.value = "";
    }
  }

  const selectClass =
    "h-9 rounded-full border border-white/10 bg-slate-900/60 px-3 text-sm text-slate-200 backdrop-blur focus:border-accent/40 focus:ring-2 focus:ring-accent/30 focus:outline-none disabled:opacity-50";
</script>

<div
  class="surface-hi border-accent/20 sticky top-14 z-30 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-2.5 backdrop-blur"
>
  <span class="text-sm font-semibold text-slate-100">
    {m.transactions_bulk_selected({ count })}
  </span>
  <button
    type="button"
    onclick={onclear}
    disabled={pending}
    class="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
  >
    <X size={13} strokeWidth={2} aria-hidden="true" />
    {m.transactions_bulk_clear()}
  </button>

  <div class="ml-auto flex flex-wrap items-center gap-2">
    <select
      onchange={onStatusSelect}
      disabled={pending}
      class={selectClass}
      aria-label={m.transactions_bulk_set_status()}
    >
      <option value="">{m.transactions_bulk_set_status()}</option>
      {#each statusOptions as opt (opt.value)}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>

    <select
      onchange={onCategorySelect}
      disabled={pending}
      class={selectClass}
      aria-label={m.transactions_bulk_set_category()}
    >
      <option value="">{m.transactions_bulk_set_category()}</option>
      {#each categories as cat (cat.id)}
        <option value={cat.id}>{cat.name}</option>
      {/each}
    </select>

    <button
      type="button"
      onclick={ondelete}
      disabled={pending}
      class="flex items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
    >
      <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
      {m.transactions_bulk_delete()}
    </button>
  </div>
</div>
