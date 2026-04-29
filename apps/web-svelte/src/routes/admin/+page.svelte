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
  <h1 class="text-xl font-semibold text-zinc-900">{m.admin_title()}</h1>
  <h2 class="text-base font-medium text-zinc-700">{m.admin_users_title()}</h2>

  <input
    type="search"
    bind:value={search}
    placeholder={m.admin_search_placeholder()}
    class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none sm:max-w-xs"
  />

  {#if loading}
    <div class="space-y-2">
      {#each [0, 1, 2, 3] as _, i (i)}
        <div class="h-10 animate-pulse rounded-lg bg-zinc-100"></div>
      {/each}
    </div>
  {:else if error}
    <p class="text-sm text-rose-600">{error}</p>
  {:else if filtered.length === 0}
    <p class="py-8 text-center text-sm text-zinc-400">{m.admin_users_empty()}</p>
  {:else}
    <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-zinc-100 bg-zinc-50">
            <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500"
              >{m.admin_users_col_email()}</th
            >
            <th class="hidden px-4 py-3 text-left text-xs font-medium text-zinc-500 sm:table-cell"
              >{m.admin_users_col_name()}</th
            >
            <th class="px-4 py-3 text-left text-xs font-medium text-zinc-500"
              >{m.admin_users_col_role()}</th
            >
            <th class="hidden px-4 py-3 text-left text-xs font-medium text-zinc-500 md:table-cell"
              >{m.admin_users_col_created()}</th
            >
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as p (p.id)}
            <tr class="border-b border-zinc-50 last:border-0">
              <td class="px-4 py-3 text-zinc-900">{p.email}</td>
              <td class="hidden px-4 py-3 text-zinc-500 sm:table-cell">{p.name ?? "—"}</td>
              <td class="px-4 py-3">
                <span
                  class={p.role === "admin"
                    ? "inline-flex items-center rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white"
                    : "inline-flex items-center rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500"}
                >
                  {p.role}
                </span>
              </td>
              <td class="hidden px-4 py-3 text-zinc-400 md:table-cell"
                >{formatDate(p.created_at)}</td
              >
              <td class="px-4 py-3 text-right">
                <button
                  onclick={() => toggleRoleMutation.mutate(p)}
                  disabled={toggleRoleMutation.isPending}
                  class="rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-40"
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
