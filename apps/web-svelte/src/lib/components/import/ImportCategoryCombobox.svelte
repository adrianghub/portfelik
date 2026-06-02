<script lang="ts">
  import { tick } from "svelte";
  import SingleValueCombobox from "$lib/components/ui/SingleValueCombobox.svelte";
  import * as m from "$lib/paraglide/messages";
  import { cn } from "$lib/utils";
  import type { Category, TransactionType } from "$lib/types";

  interface Props {
    /** Categories already filtered to `type`. */
    categories: Category[];
    type: TransactionType;
    /** Currently selected category id, or null. */
    selectedId: string | null;
    /** Fired when the selection changes (existing pick, create, or clear). */
    onchange: (id: string | null) => void;
    /** Create a category inline; resolves to the new id (or null on failure). */
    oncreate: (name: string, type: TransactionType) => Promise<string | null>;
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    class?: string;
  }

  let {
    categories,
    type,
    selectedId,
    onchange,
    oncreate,
    id,
    placeholder = m.bank_review_header_category(),
    disabled = false,
    class: className,
  }: Props = $props();

  // The combobox edits a display name; this wrapper maps name <-> id and only
  // notifies the parent on an explicit select/create/clear (never on raw typing),
  // so there's no feedback loop with the externally-driven `selectedId`.
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

  // Keep the display name in sync when the selection changes from the outside
  // (a rule applies, a row resets, the type switches the category set). Skip when
  // the typed name already resolves to the current selection, so in-progress
  // typing isn't clobbered.
  $effect(() => {
    const expected = categories.find((c) => c.id === selectedId)?.name ?? "";
    if (idForName(name) !== selectedId) name = expected;
    // Keep behavior consistent no matter how category was assigned:
    // manual pick, auto-rule application, or restored session.
    if (selectedId !== lastSelectedId) {
      editing = !selectedId;
      lastSelectedId = selectedId;
    } else if (!selectedId) {
      editing = true;
    }
  });

  function handleSelect(picked: string): void {
    const id = idForName(picked);
    onchange(id);
    if (id) editing = false;
  }

  async function handleCreate(value: string): Promise<void> {
    const newId = await oncreate(value, type);
    if (newId) {
      name = value;
      onchange(newId);
      editing = false;
    }
  }

  async function clearSelected(): Promise<void> {
    name = "";
    onchange(null);
    editing = true;
    await tick();
    rootRef?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
  }
</script>

<div bind:this={rootRef} class={cn("flex w-full min-w-0 items-center", className)}>
  {#if selectedId && !editing}
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
        allowCreate
        showAllOnFocus
        createLabel={(v) => m.bank_review_category_create({ value: v })}
        onchange={handleSelect}
        oncreate={(v) => void handleCreate(v)}
      />
    </div>
  {/if}
</div>
