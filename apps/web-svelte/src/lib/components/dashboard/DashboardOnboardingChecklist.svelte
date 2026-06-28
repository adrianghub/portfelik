<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import ProgressBar from "$lib/components/ui/ProgressBar.svelte";
  import {
    buildOnboardingSteps,
    CORE_ONBOARDING_STEPS,
    type OnboardingStepId,
  } from "$lib/services/onboarding-progress";
  import { cn } from "$lib/utils";
  import { Check, ChevronRight, X } from "lucide-svelte";

  interface Props {
    steps: ReturnType<typeof buildOnboardingSteps>;
    coreDone: number;
    onDismiss: () => void;
    onNavigate: (href: string) => void;
    onLoadDemo?: () => void;
    showDemoCta?: boolean;
    demoLoading?: boolean;
  }

  let {
    steps,
    coreDone,
    onDismiss,
    onNavigate,
    onLoadDemo,
    showDemoCta = false,
    demoLoading = false,
  }: Props = $props();

  const coreSteps = $derived(steps.filter((s) => !s.optional));
  const coreComplete = $derived(coreSteps.every((s) => s.done));

  const stepMeta: Record<
    OnboardingStepId,
    { label: () => string; href: string; cta?: () => string }
  > = {
    dashboard: { label: () => m.onboarding_step_dashboard(), href: "/dashboard" },
    import: {
      label: () => m.onboarding_step_import(),
      href: "/import",
      cta: () => m.onboarding_cta_import(),
    },
    transactions: {
      label: () => m.onboarding_step_transactions(),
      href: "/transactions",
    },
    plans: {
      label: () => m.onboarding_step_plans(),
      href: "/plans",
      cta: () => m.onboarding_cta_plans(),
    },
    reminders: {
      label: () => m.onboarding_step_reminders(),
      href: "/settings",
      cta: () => m.onboarding_cta_reminders(),
    },
  };
</script>

<section
  class="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
  aria-labelledby="onboarding-checklist-title"
>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0 flex-1">
      <h2 id="onboarding-checklist-title" class="text-sm font-semibold text-slate-100">
        {m.onboarding_title()}
      </h2>
      <p class="mt-1 text-xs text-slate-400">
        {m.onboarding_subtitle({ appName: m.app_name() })}
      </p>
      {#if coreComplete}
        <p class="mt-1 text-xs text-emerald-400">{m.onboarding_step_done()}</p>
      {:else}
        <p class="mt-2 text-xs text-slate-400">
          {m.onboarding_progress({
            done: coreDone,
            total: CORE_ONBOARDING_STEPS.length,
          })}
        </p>
        <div class="mt-2">
          <ProgressBar
            value={coreDone}
            max={CORE_ONBOARDING_STEPS.length}
            label={m.onboarding_progress({
              done: coreDone,
              total: CORE_ONBOARDING_STEPS.length,
            })}
          />
        </div>
      {/if}
    </div>
    <button
      type="button"
      class="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200"
      aria-label={m.onboarding_dismiss()}
      onclick={onDismiss}
    >
      <X size={16} aria-hidden="true" />
    </button>
  </div>

  <ul class="mt-3 space-y-2">
    {#each steps as step (step.id)}
      {@const meta = stepMeta[step.id]}
      <li>
        <button
          type="button"
          class={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
            step.done ? "text-slate-400" : "bg-white/5 text-slate-100 hover:bg-white/10"
          )}
          disabled={step.done}
          onclick={() => onNavigate(meta.href)}
        >
          <span
            class={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border",
              step.done
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                : "border-white/15 text-slate-500"
            )}
            aria-hidden="true"
          >
            {#if step.done}
              <Check size={14} />
            {:else}
              <span class="size-1.5 rounded-full bg-current"></span>
            {/if}
          </span>
          <span class="min-w-0 flex-1">
            {meta.label()}
            {#if step.optional && !step.done}
              <span class="ml-1 text-[10px] tracking-wide text-slate-400 uppercase">opc.</span>
            {/if}
          </span>
          {#if !step.done && meta.cta}
            <span class="shrink-0 text-xs font-semibold text-emerald-400">{meta.cta()}</span>
            <ChevronRight size={14} class="shrink-0 text-slate-500" aria-hidden="true" />
          {/if}
        </button>
      </li>
    {/each}
  </ul>

  {#if showDemoCta && onLoadDemo}
    <div class="mt-3 border-t border-white/5 pt-3">
      <button
        type="button"
        class="w-full rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50"
        disabled={demoLoading}
        onclick={onLoadDemo}
      >
        {m.onboarding_cta_demo()}
      </button>
    </div>
  {/if}
</section>
