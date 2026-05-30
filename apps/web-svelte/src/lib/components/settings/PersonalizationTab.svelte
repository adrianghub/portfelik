<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { updateProfile } from "$lib/services/profiles";
  import {
    ACCENT_PRESETS,
    DEFAULT_ACCENT_ID,
    applyAccent,
    type AccentPresetId,
  } from "$lib/theme/accent-presets";
  import type { Profile } from "$lib/types";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";

  const ACCENT_LABELS: Record<AccentPresetId, () => string> = {
    green: m.accent_green,
    blue: m.accent_blue,
    red: m.accent_red,
    pink: m.accent_pink,
    purple: m.accent_purple,
    orange: m.accent_orange,
  };

  interface Props {
    profile: Profile | null;
  }
  let { profile }: Props = $props();

  const queryClient = useQueryClient();

  const selected = $derived(
    (profile?.settings?.accentColor ?? DEFAULT_ACCENT_ID) as AccentPresetId
  );

  const mutation = createMutation(() => ({
    mutationFn: (accentColor: AccentPresetId) =>
      updateProfile(profile!.id, {
        settings: { ...profile!.settings, accentColor },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => {
      // Revert to the persisted value on failure.
      applyAccent(profile?.settings?.accentColor ?? DEFAULT_ACCENT_ID);
      toast.error(m.toast_error());
    },
  }));

  function choose(id: AccentPresetId) {
    if (!profile || id === selected) return;
    applyAccent(id); // optimistic — reskins instantly + mirrors to localStorage
    mutation.mutate(id);
  }
</script>

<div class="space-y-4">
  <div>
    <h2 class="text-sm font-semibold text-slate-100">{m.personalization_heading()}</h2>
    <p class="mt-1 text-xs text-slate-500">{m.personalization_desc()}</p>
  </div>

  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    {#each ACCENT_PRESETS as preset (preset.id)}
      {@const active = preset.id === selected}
      <button
        type="button"
        onclick={() => choose(preset.id)}
        disabled={mutation.isPending}
        aria-pressed={active}
        class="group relative flex items-center gap-3 rounded-2xl border bg-slate-900/60 px-3 py-3 text-left backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none disabled:opacity-60"
        style={active
          ? "border-color: rgba(255,255,255,0.4)"
          : "border-color: rgba(255,255,255,0.05)"}
      >
        <span
          class="h-9 w-9 shrink-0 rounded-full shadow-[0_0_18px_var(--swatch-glow)]"
          style="background-image: linear-gradient(135deg, {preset.from}, {preset.to}); --swatch-glow: color-mix(in oklch, {preset.from} 30%, transparent)"
          aria-hidden="true"
        ></span>
        <span class="min-w-0 flex-1 text-sm font-medium text-slate-100"
          >{ACCENT_LABELS[preset.id]()}</span
        >
        {#if active}
          <svg
            class="h-4 w-4 shrink-0 text-slate-100"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        {/if}
      </button>
    {/each}
  </div>
</div>
