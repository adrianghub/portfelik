<script lang="ts">
  import {
    DEMO_BANNER_ACTIONS,
    demoBannerActionHref,
    demoBannerActionLabel,
    demoBannerCopy,
    type DemoBannerActionId,
  } from "$lib/content/onboarding";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import * as m from "$lib/paraglide/messages";
  import { cn } from "$lib/utils";

  interface Props {
    onclear: () => void | Promise<void>;
    onrestart?: () => void;
    clearing?: boolean;
    restarting?: boolean;
    class?: string;
  }

  let {
    onclear,
    onrestart,
    clearing = false,
    restarting = false,
    class: className = "",
  }: Props = $props();

  const banner = demoBannerCopy();

  // Clear matches rows by the "Demo:" prefix, so a stray user row named that
  // way would be deleted too — never fire it from a single tap.
  let confirmClearOpen = $state(false);

  const visibleActions = $derived(
    DEMO_BANNER_ACTIONS.filter((id) => id !== "restart_tour" || onrestart)
  );

  function actionHandler(id: DemoBannerActionId): (() => void) | undefined {
    switch (id) {
      case "restart_tour":
        return onrestart;
      case "clear":
        return () => (confirmClearOpen = true);
      default:
        return undefined;
    }
  }

  function actionDisabled(id: DemoBannerActionId): boolean {
    switch (id) {
      case "restart_tour":
        return restarting;
      case "clear":
        return clearing;
      default:
        return false;
    }
  }

  function isLinkAction(id: DemoBannerActionId): boolean {
    return id === "import" || id === "settings";
  }
</script>

<div
  class={cn(
    "flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
    className
  )}
  role="status"
>
  <p class="text-sm font-medium text-amber-100">{banner.title}</p>
  <div class="flex flex-wrap items-center gap-2">
    {#each visibleActions as actionId (actionId)}
      {#if isLinkAction(actionId)}
        {@const href = demoBannerActionHref(actionId)}
        {#if href}
          <a
            {href}
            class={cn(
              actionId === "import"
                ? "bg-accent-gradient rounded-full px-3 py-1.5 text-xs font-semibold text-slate-900"
                : "rounded-full border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/15"
            )}
          >
            {demoBannerActionLabel(actionId)}
          </a>
        {/if}
      {:else}
        {@const handler = actionHandler(actionId)}
        {#if handler}
          <button
            type="button"
            class="rounded-full border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/15 disabled:opacity-50"
            disabled={actionDisabled(actionId)}
            onclick={handler}
          >
            {demoBannerActionLabel(actionId)}
          </button>
        {/if}
      {/if}
    {/each}
  </div>
</div>

<ConfirmDialog
  open={confirmClearOpen}
  message={m.demo_clear_confirm_message()}
  pending={clearing}
  onconfirm={() => {
    void Promise.resolve(onclear()).then(() => {
      confirmClearOpen = false;
    });
  }}
  onclose={() => (confirmClearOpen = false)}
/>
