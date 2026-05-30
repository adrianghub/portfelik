<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { supabase } from "$lib/supabase";
  import { fetchProfile, assignAdminRole, revokeAdminRole } from "$lib/services/profiles";
  import type { Profile } from "$lib/types";
  import { formatDate } from "$lib/utils";
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { Users } from "lucide-svelte";

  const queryClient = useQueryClient();

  let profiles = $state<Profile[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let search = $state("");

  const filtered = $derived(
    search.trim()
      ? profiles.filter(
          (p) =>
            p.email.toLowerCase().includes(search.toLowerCase()) ||
            (p.name ?? "").toLowerCase().includes(search.toLowerCase())
        )
      : profiles
  );

  onMount(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      goto("/login");
      return;
    }

    const currentProfile = await fetchProfile(sessionData.session.user.id).catch(() => null);
    if (currentProfile?.role !== "admin") {
      toast.error(m.admin_required());
      goto("/transactions");
      return;
    }

    await loadProfiles();
  });

  async function loadProfiles() {
    loading = true;
    error = null;
    const { data, error: err } = await supabase
      .from("profiles")
      .select("id, email, name, role, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (err) {
      error = err.message;
    } else {
      profiles = (data ?? []) as Profile[];
    }
    loading = false;
  }

  const toggleRoleMutation = createMutation(() => ({
    mutationFn: async (profile: Profile) => {
      if (profile.role === "admin") {
        await revokeAdminRole(profile.id);
      } else {
        await assignAdminRole(profile.id);
      }
    },
    onSuccess: async (_data, profile) => {
      const wasAdmin = profile.role === "admin";
      toast.success(wasAdmin ? m.admin_role_changed_to_user() : m.admin_role_changed_to_admin());
      await loadProfiles();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err: Error) => {
      const msg = err.message.includes("cannot_revoke_own_admin")
        ? m.admin_role_error_own()
        : m.admin_role_error();
      toast.error(msg);
    },
  }));
</script>

<div class="container mx-auto max-w-4xl space-y-4 px-4 py-6">
  <h1 class="text-hero font-semibold text-slate-100">{m.admin_title()}</h1>

  <nav class="flex gap-2 border-b border-white/5">
    <a
      href="/admin"
      aria-current="page"
      class="border-accent -mb-px border-b-2 px-3 py-2 text-sm font-medium text-slate-100"
    >
      {m.admin_tab_users()}
    </a>
    <a
      href="/admin/notifications"
      class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 hover:text-slate-100"
    >
      {m.admin_tab_diagnostics()}
    </a>
  </nav>

  <h2 class="text-eyebrow text-slate-300">{m.admin_users_title()}</h2>

  <input
    type="search"
    bind:value={search}
    placeholder={m.admin_search_placeholder()}
    class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none sm:max-w-xs"
  />

  {#if loading}
    <div class="space-y-2">
      {#each [0, 1, 2, 3] as _, i (i)}
        <div class="h-10 animate-pulse rounded-xl bg-slate-800/60"></div>
      {/each}
    </div>
  {:else if error}
    <p class="text-sm text-rose-600">{error}</p>
  {:else if filtered.length === 0}
    <EmptyState title={m.admin_users_empty()} body={m.admin_users_empty_hint()}>
      {#snippet icon()}
        <Users size={28} strokeWidth={1.4} />
      {/snippet}
    </EmptyState>
  {:else}
    <div class="overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-white/5 bg-white/5">
            <th class="text-eyebrow px-4 py-3 text-left text-slate-400"
              >{m.admin_users_col_email()}</th
            >
            <th class="text-eyebrow hidden px-4 py-3 text-left text-slate-400 sm:table-cell"
              >{m.admin_users_col_name()}</th
            >
            <th class="text-eyebrow px-4 py-3 text-left text-slate-400"
              >{m.admin_users_col_role()}</th
            >
            <th class="text-eyebrow hidden px-4 py-3 text-left text-slate-400 md:table-cell"
              >{m.admin_users_col_created()}</th
            >
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as p (p.id)}
            <tr class="border-b border-white/5 last:border-0">
              <td class="px-4 py-3 text-slate-100">{p.email}</td>
              <td class="hidden px-4 py-3 text-slate-400 sm:table-cell">{p.name ?? "—"}</td>
              <td class="px-4 py-3">
                <span
                  class={p.role === "admin"
                    ? "inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white"
                    : "inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 dark:border-slate-600 dark:text-slate-400"}
                >
                  {p.role}
                </span>
              </td>
              <td class="hidden px-4 py-3 text-slate-500 md:table-cell"
                >{formatDate(p.created_at)}</td
              >
              <td class="px-4 py-3 text-right">
                <button
                  onclick={() => toggleRoleMutation.mutate(p)}
                  disabled={toggleRoleMutation.isPending}
                  class="rounded-full border border-white/10 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300 backdrop-blur transition-colors hover:bg-white/5 hover:text-slate-100 disabled:opacity-40"
                >
                  {p.role === "admin" ? "→ user" : "→ admin"}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
