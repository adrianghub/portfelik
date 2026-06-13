<!-- src/lib/components/transactions/CategorySelect.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import SingleValueCombobox from "$lib/components/ui/SingleValueCombobox.svelte";
  import * as m from "$lib/paraglide/messages";
  import { cn } from "$lib/utils";
  import type { Category, TransactionType } from "$lib/types";

  interface Props {
    /** Categories already filtered to `type`. */
    categories: Category[];
    /** Selection by id; "" or null means none. Bindable. */
    selectedId?: string | null;
    type: TransactionType;
    onchange?: (id: string | null) => void;
    /** Inline create; resolves to the new id (or null on failure). Omit to disable create. */
    oncreate?: (name: string, type: TransactionType) => Promise<string | null>;
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    /** Pill-with-× display once selected (import review style). Default false. */
    pillMode?: boolean;
    class?: string;
  }

  let {
    categories,
    selectedId = $bindable(null),
    type,
    onchange,
    oncreate,
    id,
    placeholder = m.transaction_form_select_category(),
    disabled = false,
    required = false,
    pillMode = false,
    class: className,
  }: Props = $props();

  let name = $state("");
  let editing = $state(true);
  let rootRef = $state<HTMLDivElement | null>(null);
  let lastSelectedId = $state<string | null>(null);

  const items = $derived(categories.map((c) => c.name));
  const selectedCategory = $derived(categories.find((c) => c.id === selectedId) ?? null);

  function idForName(value: string): string | null {
    const q = value.trim().toLocaleLowerCase("pl");
    if (!q) return null;
    return categories.find((c) => c.name.toLocaleLowerCase("pl") === q)?.id ?? null;
  }

  function emit(next: string | null): void {
    selectedId = next;
    onchange?.(next);
  }

  // Sync display name when selection changes from outside; keep pill/edit state.
  $effect(() => {
    const expected = categories.find((c) => c.id === selectedId)?.name ?? "";
    if (idForName(name) !== selectedId) name = expected;
    if (selectedId !== lastSelectedId) {
      editing = pillMode ? !selectedId : true;
      lastSelectedId = selectedId ?? null;
    } else if (!selectedId && pillMode) {
      editing = true;
    }
  });

  function handleSelect(picked: string): void {
    const next = idForName(picked);
    emit(next);
    if (next && pillMode) editing = false;
  }

  async function handleCreate(value: string): Promise<void> {
    if (!oncreate) return;
    const newId = await oncreate(value, type);
    if (newId) {
      name = value;
      emit(newId);
      if (pillMode) editing = false;
    }
  }

  async function clearSelected(): Promise<void> {
    name = "";
    emit(null);
    editing = true;
    await tick();
    rootRef?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
  }
</script>

<div bind:this={rootRef} class={cn("flex w-full min-w-0 items-center", className)}>
  {#if pillMode && selectedId && !editing}
    <button
      type="button"
      class={cn(
        "focus:ring-accent/30 inline-flex min-h-10 w-full items-center justify-between overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-left transition-colors hover:bg-white/5 focus:ring-2 focus:outline-none",
        disabled && "opacity-50"
      )}
      title={m.bank_review_category_clear()}
      aria-label={m.bank_review_category_clear()}
      {disabled}
      onclick={() => void clearSelected()}
    >
      <span class="min-w-0 truncate text-sm font-medium text-slate-100"
        >{selectedCategory?.name ?? ""}</span
      >
      <span class="ml-2 shrink-0 text-sm text-slate-400" aria-hidden="true">×</span>
    </button>
  {:else}
    <div class="min-w-0 flex-1">
      <SingleValueCombobox
        bind:value={name}
        {items}
        {id}
        {placeholder}
        {disabled}
        allowCreate={!!oncreate}
        showAllOnFocus
        createLabel={(v) => m.combobox_create({ value: v })}
        onchange={handleSelect}
        oncreate={(v) => void handleCreate(v)}
      />
    </div>
  {/if}
  {#if required}
    <input tabindex="-1" class="sr-only" {required} value={selectedId ?? ""} />
  {/if}
</div>
