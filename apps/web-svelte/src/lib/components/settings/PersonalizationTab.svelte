<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import { updateProfile } from "$lib/services/profiles";
  import {
    ACCENT_PRESETS,
    DEFAULT_ACCENT_ID,
    applyAccent,
    type AccentPresetId,
  } from "$lib/theme/accent-presets";
  import { AVATAR_PRESET_IDS, avatarSrc, type AvatarPresetId } from "$lib/theme/avatar-presets";
  import type { Profile } from "$lib/types";
  import { toastError } from "$lib/toast-error";
  import * as m from "$lib/paraglide/messages";
  import { cn } from "$lib/utils";

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
  const selectedAvatar = $derived(profile?.settings?.avatarPresetId ?? null);

  const accentMutation = createMutation(() => ({
    mutationFn: (accentColor: AccentPresetId) =>
      updateProfile(profile!.id, {
        settings: { ...profile!.settings, accentColor },
      }),
    onSuccess: async (updated) => {
      applyAccent(updated.settings?.accentColor ?? DEFAULT_ACCENT_ID);
      const u = requireSessionUserId();
      queryClient.setQueryData(qk.profile(u), updated);
      await queryClient.invalidateQueries({ queryKey: qk.profile(u) });
    },
    onError: (err) => {
      applyAccent(profile?.settings?.accentColor ?? DEFAULT_ACCENT_ID);
      toastError(err);
    },
  }));

  const avatarMutation = createMutation(() => ({
    mutationFn: (avatarPresetId: string | null) => {
      const nextSettings = { ...profile!.settings };
      if (avatarPresetId) nextSettings.avatarPresetId = avatarPresetId;
      else delete nextSettings.avatarPresetId;
      return updateProfile(profile!.id, { settings: nextSettings });
    },
    onSuccess: async (updated) => {
      const u = requireSessionUserId();
      queryClient.setQueryData(qk.profile(u), updated);
      await queryClient.invalidateQueries({ queryKey: qk.profile(u) });
    },
    onError: (err) => toastError(err),
  }));

  function chooseAccent(id: AccentPresetId) {
    if (!profile || id === selected) return;
    applyAccent(id);
    accentMutation.mutate(id);
  }

  function chooseAvatar(id: AvatarPresetId) {
    if (!profile || id === selectedAvatar) return;
    avatarMutation.mutate(id);
  }

  function clearAvatar() {
    if (!profile || !selectedAvatar) return;
    avatarMutation.mutate(null);
  }
</script>

<div class="space-y-6">
  <div>
    <h2 class="text-sm font-semibold text-slate-100">{m.personalization_heading()}</h2>
    <p class="mt-1 text-xs text-slate-400">{m.personalization_desc()}</p>
  </div>

  <div class="space-y-2">
    <h3 class="text-xs font-medium text-slate-300">{m.personalization_avatar_heading()}</h3>
    <p class="text-xs text-slate-500">{m.personalization_avatar_desc()}</p>
    <div class="grid grid-cols-5 gap-2 sm:grid-cols-5">
      {#each AVATAR_PRESET_IDS as id (id)}
        {@const active = selectedAvatar === id}
        <button
          type="button"
          onclick={() => chooseAvatar(id)}
          disabled={avatarMutation.isPending}
          aria-pressed={active}
          class={cn(
            "focus-visible:ring-accent aspect-square overflow-hidden rounded-2xl border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
            active ? "border-white/50 ring-2 ring-white/20" : "border-white/5 hover:border-white/20"
          )}
        >
          <img src={avatarSrc(id)!} alt="" class="h-full w-full object-cover" />
        </button>
      {/each}
    </div>
    {#if selectedAvatar}
      <button
        type="button"
        onclick={clearAvatar}
        disabled={avatarMutation.isPending}
        class="focus-visible:ring-accent text-xs text-slate-400 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.personalization_avatar_clear()}
      </button>
    {/if}
  </div>

  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    {#each ACCENT_PRESETS as preset (preset.id)}
      {@const active = preset.id === selected}
      <button
        type="button"
        onclick={() => chooseAccent(preset.id)}
        disabled={accentMutation.isPending}
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
</div>
