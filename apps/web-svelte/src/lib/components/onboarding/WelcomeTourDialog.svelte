<script lang="ts">
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import { onboardingWelcomeCopy } from "$lib/content/onboarding";
  import * as m from "$lib/paraglide/messages";
  import { Check, Sparkles, Upload } from "lucide-svelte";

  interface Props {
    open: boolean;
    loading?: boolean;
    onclose: () => void;
    ondemo: () => void;
    onimport: () => void;
  }

  let { open, loading = false, onclose, ondemo, onimport }: Props = $props();

  const copy = onboardingWelcomeCopy();
</script>

<Dialog {open} {onclose} title={copy.title}>
  <div class="space-y-5">
    <p class="text-sm leading-relaxed text-slate-300">{copy.body}</p>
    <ul class="space-y-2.5">
      {#each copy.points as point (point)}
        <li class="flex gap-2.5 text-sm leading-snug text-slate-300">
          <span
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"
          >
            <Check size={13} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <span>{point}</span>
        </li>
      {/each}
    </ul>
    <div class="flex flex-col gap-2 pt-1">
      <button
        type="button"
        class="bg-accent-gradient focus-visible:ring-accent flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        disabled={loading}
        onclick={ondemo}
      >
        <Sparkles size={16} aria-hidden="true" />
        {loading ? m.tour_welcome_loading() : copy.demo}
      </button>
      <button
        type="button"
        class="focus-visible:ring-accent flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
        disabled={loading}
        onclick={onimport}
      >
        <Upload size={16} aria-hidden="true" />
        {copy.skip}
      </button>
    </div>
  </div>
</Dialog>
