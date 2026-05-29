<script lang="ts">
  import SingleValueCombobox from "$lib/components/ui/SingleValueCombobox.svelte";
  import * as m from "$lib/paraglide/messages";
  import type { Category } from "$lib/types";

  interface Props {
    /** Categories already filtered to the relevant transaction type. */
    categories: Category[];
    categoryId?: string;
    id?: string;
    placeholder?: string;
    required?: boolean;
  }

  let {
    categories,
    categoryId = $bindable(""),
    id = "tx-category",
    placeholder = m.transaction_form_select_category(),
    required = false,
  }: Props = $props();

  // The combobox works on display names; this wrapper maps name <-> id so the
  // form keeps binding a category id. Free-typed text that matches no category
  // resolves to "" (caught by the hidden required input below).
  let name = $state("");

  const items = $derived(categories.map((c) => c.name));

  function idForName(value: string): string {
    const q = value.trim().toLocaleLowerCase("pl");
    return categories.find((c) => c.name.toLocaleLowerCase("pl") === q)?.id ?? "";
  }

  // Resolve the typed/selected name to a category id.
  $effect(() => {
    const resolved = idForName(name);
    if (resolved !== categoryId) categoryId = resolved;
  });

  // Sync an externally-set id back into the display name (initial load, reset,
  // type change clearing the selection). Skip when the current name already
  // resolves to that id, to avoid clobbering in-progress typing.
  $effect(() => {
    const expected = categories.find((c) => c.id === categoryId)?.name ?? "";
    if (idForName(name) !== categoryId) name = expected;
  });
</script>

<SingleValueCombobox bind:value={name} {items} {id} {placeholder} showAllOnFocus />
{#if required}
  <input tabindex="-1" class="sr-only" required bind:value={categoryId} />
{/if}
