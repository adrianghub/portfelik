<script lang="ts">
  import SingleValueCombobox from "$lib/components/ui/SingleValueCombobox.svelte";
  import * as m from "$lib/paraglide/messages";
  import { DEFAULT_SHOPPING_LIST_UNIT, SHOPPING_LIST_UNIT_OPTIONS } from "$lib/shopping-list-units";

  interface Props {
    value?: string;
    id?: string;
    label?: string;
    placeholder?: string;
    showLabel?: boolean;
  }

  let {
    value = $bindable(DEFAULT_SHOPPING_LIST_UNIT),
    id = "shopping-list-unit",
    label = m.shopping_list_item_unit(),
    placeholder = m.shopping_list_item_unit_placeholder(),
    showLabel = false,
  }: Props = $props();
</script>

<SingleValueCombobox
  bind:value
  items={[...SHOPPING_LIST_UNIT_OPTIONS]}
  {id}
  {label}
  {placeholder}
  {showLabel}
  allowCreate
  showAllOnFocus
/>
