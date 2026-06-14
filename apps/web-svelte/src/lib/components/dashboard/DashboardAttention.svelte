<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { createQuery } from "@tanstack/svelte-query";
  import { ChevronRight } from "lucide-svelte";
  import { fetchProfile } from "$lib/services/profiles";
  import { fetchLastCommittedImportSession } from "$lib/services/bank-import";
  import { fetchDashboardPlanProgress } from "$lib/services/plan-settlement";
  import { getBankImportReminder } from "$lib/profile-settings";
  import { buildAttentionItems, type AttentionPlan } from "$lib/dashboard-attention";
  import { cn } from "$lib/utils";

  interface Props {
    userId: string | null;
    overdueCount: number;
  }
  let { userId, overdueCount }: Props = $props();

  const profileQuery = createQuery(() => ({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  }));

  const importHealthQuery = createQuery(() => ({
    queryKey: ["import-health"],
    queryFn: fetchLastCommittedImportSession,
  }));

  const planProgressQuery = createQuery(() => ({
    queryKey: ["plan-progress"],
    queryFn: () => fetchDashboardPlanProgress(),
  }));

  const cadenceDays = $derived(getBankImportReminder(profileQuery.data?.settings).cadenceDays);

  const daysSinceImport = $derived.by(() => {
    const committed = importHealthQuery.data?.committed_at;
    if (!committed) return null;
    const diff = (Date.now() - new Date(committed).getTime()) / (1000 * 60 * 60 * 24);
    return Math.floor(diff);
  });

  const plans = $derived<AttentionPlan[]>(
    (planProgressQuery.data ?? []).map((p) => ({
      planId: p.planId,
      planName: p.planName,
      kind: p.kind,
      eligibleCount: p.eligibleCount,
      monthlyNeeded: p.monthlyNeeded,
      monthlyActual: p.monthlyActual,
      monthlyActualBasis: p.monthlyActualBasis,
    }))
  );

  const items = $derived(
    buildAttentionItems({ daysSinceImport, cadenceDays, overdueCount, plans })
  );
</script>

<section
  class="rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_85%_0%,rgba(251,191,36,0.1),transparent_45%)] p-5"
  aria-labelledby="dashboard-attention-title"
>
  <p id="dashboard-attention-title" class="text-eyebrow text-slate-400">{m.attention_title()}</p>

  {#if items.length > 0}
    <ul class="mt-3 space-y-2">
      {#each items as item (item.id)}
        <li>
          <a
            href={item.href}
            class={cn(
              "focus-visible:ring-accent flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
              item.tone === "warn"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
                : "border-emerald-500/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
            )}
          >
            <span>{item.label}</span>
            <ChevronRight size={14} class="shrink-0 opacity-70" aria-hidden="true" />
          </a>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="mt-2 text-sm text-emerald-300/90">{m.attention_empty()}</p>
  {/if}
</section>
