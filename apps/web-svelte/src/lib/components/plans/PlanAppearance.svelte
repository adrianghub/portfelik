<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import { updatePlanIcon } from "$lib/services/plans";
  import type { Plan } from "$lib/types";
  import { toastError } from "$lib/toast-error";
  import AppearanceFields from "$lib/components/ui/AppearanceFields.svelte";
  import * as m from "$lib/paraglide/messages";
  let { plan }: { plan: Plan } = $props();
  let icon = $derived(plan.icon ?? null);
  const queryClient = useQueryClient();
  const mutation = createMutation(() => ({
    mutationFn: () => updatePlanIcon(plan.id, icon),
    onSuccess: async () => {
      const u = requireSessionUserId();
      await Promise.all(
        [qk.plan(u, plan.id), qk.plans(u), qk.planProgress(u), qk.planProgressList(u)].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey })
        )
      );
    },
    onError: (error) => toastError(error),
  }));
</script>

<details class="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300">
  <summary class="min-h-11 cursor-pointer content-center">{m.plan_icon_settings()}</summary>
  <form
    class="space-y-3 py-2"
    onsubmit={(event) => {
      event.preventDefault();
      if (!mutation.isPending) mutation.mutate();
    }}
  >
    <fieldset disabled={mutation.isPending} class="space-y-3">
      <AppearanceFields bind:icon showColor={false} id="plan" />
      <button
        type="submit"
        disabled={icon === (plan.icon ?? null)}
        class="bg-accent min-h-11 rounded-full px-4 font-medium text-slate-900 disabled:opacity-40"
        >{mutation.isPending ? m.common_saving() : m.common_save()}</button
      >
    </fieldset>
  </form>
</details>
