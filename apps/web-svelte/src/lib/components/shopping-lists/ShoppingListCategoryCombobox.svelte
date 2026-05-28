<script lang="ts">
  import SingleValueCombobox from "$lib/components/ui/SingleValueCombobox.svelte";
  import * as m from "$lib/paraglide/messages";
  import {
    DEFAULT_SHOPPING_LIST_ITEM_CATEGORIES,
    SHOPPING_LIST_CATEGORY_FALLBACK,
  } from "$lib/shopping-list-categories";
  import { fetchShoppingItemCategories } from "$lib/services/shopping-item-categories";
  import { createQuery } from "@tanstack/svelte-query";

  interface Props {
    value?: string;
    id?: string;
    label?: string;
    placeholder?: string;
    showLabel?: boolean;
  }

  let {
    value = $bindable(""),
    id = "shopping-list-category",
    label = m.shopping_list_item_category(),
    placeholder = m.shopping_list_item_category_placeholder(),
    showLabel = true,
  }: Props = $props();

  const categoriesQuery = createQuery(() => ({
    queryKey: ["shopping_item_categories"],
    queryFn: fetchShoppingItemCategories,
    staleTime: 5 * 60_000,
  }));

  const categoryOptions = $derived.by(() => {
    const saved = categoriesQuery.data?.map((category) => category.name);
    const base = saved && saved.length > 0 ? saved : DEFAULT_SHOPPING_LIST_ITEM_CATEGORIES;
    return [...base, SHOPPING_LIST_CATEGORY_FALLBACK].filter(
      (name, index, all) => all.indexOf(name) === index
    );
  });
</script>

<SingleValueCombobox
  bind:value
  items={categoryOptions}
  {id}
  {label}
  {placeholder}
  {showLabel}
  allowCreate
  showAllOnFocus
/>
