<script lang="ts">
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { guidedTourUi, requestDemoSeedAndTour } from "$lib/guided-tour/ui.svelte";
  import * as m from "$lib/paraglide/messages";
  import { LayoutDashboard, Upload } from "lucide-svelte";

  interface Props {
    loading?: boolean;
  }

  let { loading = false }: Props = $props();
  let pending = $state(false);

  function startDemo(): void {
    pending = true;
    requestDemoSeedAndTour();
  }
</script>

<EmptyState title={m.dashboard_discovery_title()} body={m.dashboard_discovery_body()}>
  {#snippet icon()}
    <LayoutDashboard size={28} strokeWidth={1.4} />
  {/snippet}
  {#snippet action()}
    <div class="flex flex-col items-center justify-center gap-2 sm:flex-row">
      <a
        href="/import"
        class="bg-accent-gradient focus-visible:ring-accent inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Upload size={16} aria-hidden="true" />
        {m.tour_welcome_import()}
      </a>
      <button
        type="button"
        class="focus-visible:ring-accent inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        disabled={loading || pending || guidedTourUi.demoBusy}
        onclick={startDemo}
      >
        {loading || pending || guidedTourUi.demoBusy
          ? m.tour_welcome_loading()
          : m.tour_welcome_demo()}
      </button>
    </div>
  {/snippet}
</EmptyState>
