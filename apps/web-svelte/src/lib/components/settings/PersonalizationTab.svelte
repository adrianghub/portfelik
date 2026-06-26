<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { updateProfile } from "$lib/services/profiles";
  import {
    ACCENT_PRESETS,
    DEFAULT_ACCENT_ID,
    applyAccent,
    type AccentPresetId,
  } from "$lib/theme/accent-presets";
  import { AVATAR_PRESET_IDS, avatarSrc } from "$lib/theme/avatar-presets";
  import type { Profile } from "$lib/types";
  import { toastError } from "$lib/toast-error";
  import * as m from "$lib/paraglide/messages";

  const ACCENT_LABELS: Record<AccentPresetId, () => string> = {
    green: m.accent_green,
    blue: m.accent_blue,
    amber: m.accent_amber,
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
    onSuccess: async (updated) => {
      applyAccent(updated.settings?.accentColor ?? DEFAULT_ACCENT_ID);
      queryClient.setQueryData(["profile", updated.id], updated);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => {
      // Revert to the persisted value on failure.
      applyAccent(profile?.settings?.accentColor ?? DEFAULT_ACCENT_ID);
      toastError(err);
    },
  }));

  function choose(id: AccentPresetId) {
    if (!profile || id === selected) return;
    applyAccent(id);
    mutation.mutate(id);
  }

  const selectedAvatar = $derived(profile?.settings?.avatarPresetId ?? null);

  const avatarMutation = createMutation(() => ({
    mutationFn: (avatarPresetId: string | undefined) =>
      updateProfile(profile!.id, {
        settings: { ...profile!.settings, avatarPresetId },
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["profile", updated.id], updated);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => toastError(err),
  }));

  function chooseAvatar(id: string | undefined) {
    if (!profile || (id ?? null) === selectedAvatar) return;
    avatarMutation.mutate(id);
  }
</script>

<div class="space-y-4">
  <div>
    <h2 class="text-sm font-semibold text-slate-100">{m.personalization_heading()}</h2>
    <p class="mt-1 text-xs text-slate-400">{m.personalization_desc()}</p>
  </div>

  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    {#each ACCENT_PRESETS as preset (preset.id)}
      {@const active = preset.id === selected}
      <button
        type="button"
        onclick={() => choose(preset.id)}
        disabled={mutation.isPending}
        aria-pressed={active}
        class="group focus-visible:ring-accent relative flex items-center gap-3 rounded-2xl border bg-slate-900/60 px-3 py-3 text-left backdrop-blur transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
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

  <div class="pt-2">
    <h2 class="text-sm font-semibold text-slate-100">{m.avatar_heading()}</h2>
    <p class="mt-1 text-xs text-slate-400">{m.avatar_desc()}</p>
  </div>

  <div class="grid grid-cols-4 gap-3 sm:grid-cols-6">
    <button
      type="button"
      onclick={() => chooseAvatar(undefined)}
      disabled={avatarMutation.isPending}
      aria-pressed={selectedAvatar === null}
      class="focus-visible:ring-accent flex aspect-square items-center justify-center rounded-2xl border bg-slate-900/60 px-1 text-center text-xs font-medium text-slate-300 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
      style={selectedAvatar === null
        ? "border-color: rgba(255,255,255,0.4)"
        : "border-color: rgba(255,255,255,0.05)"}
    >
      {m.avatar_default()}
    </button>
    {#each AVATAR_PRESET_IDS as id (id)}
      {@const active = id === selectedAvatar}
      <button
        type="button"
        onclick={() => chooseAvatar(id)}
        disabled={avatarMutation.isPending}
        aria-pressed={active}
        aria-label={id}
        class="focus-visible:ring-accent aspect-square overflow-hidden rounded-2xl border bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
        style={active
          ? "border-color: rgba(255,255,255,0.4)"
          : "border-color: rgba(255,255,255,0.05)"}
      >
        <img src={avatarSrc(id)} alt="" class="h-full w-full object-cover" />
      </button>
    {/each}
  </div>
</div>
