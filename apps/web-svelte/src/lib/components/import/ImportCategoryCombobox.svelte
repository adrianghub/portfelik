<script lang="ts">
  import SingleValueCombobox from "$lib/components/ui/SingleValueCombobox.svelte";
  import * as m from "$lib/paraglide/messages";
  import { cn } from "$lib/utils";
  import { X } from "lucide-svelte";
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
  }: Props = $props();

  // The combobox edits a display name; this wrapper maps name <-> id and only
  // notifies the parent on an explicit select/create/clear (never on raw typing),
  // so there's no feedback loop with the externally-driven `selectedId`.
  let name = $state("");

  const items = $derived(categories.map((c) => c.name));

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
  });

  function handleSelect(picked: string): void {
    onchange(idForName(picked));
  }

  async function handleCreate(value: string): Promise<void> {
    const newId = await oncreate(value, type);
    if (newId) {
      name = value;
      onchange(newId);
    }
  }

  function clear(): void {
    name = "";
    onchange(null);
  }
</script>

<div class="flex w-full min-w-0 items-center gap-1">
  <div class="relative min-w-0 flex-1">
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
  {#if selectedId}
    <button
      type="button"
      class={cn(
        "shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:text-slate-200",
        disabled && "pointer-events-none opacity-50"
      )}
      title={m.bank_review_category_clear()}
      aria-label={m.bank_review_category_clear()}
      onclick={clear}
    >
      <X size={14} aria-hidden="true" />
    </button>
  {/if}
</div>
