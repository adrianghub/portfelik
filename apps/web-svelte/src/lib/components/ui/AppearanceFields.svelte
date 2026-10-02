<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { CATEGORY_RING_COLORS } from "$lib/services/spending-category-display";
  import VisualIcon from "./VisualIcon.svelte";
  let {
    icon = $bindable<string | null>(null),
    color = $bindable<string | null>(null),
    showColor = true,
    id = "appearance",
  }: { icon?: string | null; color?: string | null; showColor?: boolean; id?: string } = $props();
  const choices = $derived([
    ["tag", m.visual_icon_tag()],
    ["shopping-basket", m.visual_icon_shopping()],
    ["home", m.visual_icon_home()],
    ["car", m.visual_icon_car()],
    ["heart", m.visual_icon_heart()],
    ["utensils", m.visual_icon_food()],
    ["briefcase", m.visual_icon_work()],
    ["wallet", m.visual_icon_wallet()],
    ["target", m.visual_icon_target()],
    ["landmark", m.visual_icon_bank()],
    ["plane", m.visual_icon_travel()],
    ["graduation-cap", m.visual_icon_education()],
  ]);
  const colors = $derived([
    m.visual_color_green(),
    m.visual_color_blue(),
    m.visual_color_purple(),
    m.visual_color_yellow(),
    m.visual_color_red(),
    m.visual_color_cyan(),
    m.visual_color_pink(),
    m.visual_color_orange(),
  ]);
</script>

<div class="space-y-1">
  <label for={`${id}-icon`} class="text-xs font-medium text-slate-300"
    >{m.visual_icon_label()}</label
  >
  <div class="flex items-center gap-3">
    <VisualIcon name={icon} />
    <select
      id={`${id}-icon`}
      bind:value={icon}
      class="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-slate-100"
    >
      <option value={null}>{m.visual_automatic()}</option>
      {#each choices as [value, label] (value)}<option {value}>{label}</option>{/each}
    </select>
  </div>
</div>
{#if showColor}
  <div class="space-y-1">
    <label for={`${id}-color`} class="text-xs font-medium text-slate-300"
      >{m.visual_color_label()}</label
    >
    <select
      id={`${id}-color`}
      bind:value={color}
      class="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-slate-100"
    >
      <option value={null}>{m.visual_automatic()}</option>
      {#each CATEGORY_RING_COLORS as value, i (value)}<option {value}>{colors[i]}</option>{/each}
    </select>
  </div>
{/if}
