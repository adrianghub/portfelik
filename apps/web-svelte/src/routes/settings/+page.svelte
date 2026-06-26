<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { createQuery } from "@tanstack/svelte-query";
  import { supabase } from "$lib/supabase";
  import { fetchProfile } from "$lib/services/profiles";
  import CategoriesTab from "$lib/components/settings/CategoriesTab.svelte";
  import GroupsTab from "$lib/components/settings/GroupsTab.svelte";
  import ProfileTab from "$lib/components/settings/ProfileTab.svelte";
  import PersonalizationTab from "$lib/components/settings/PersonalizationTab.svelte";
  import RulesTab from "$lib/components/settings/RulesTab.svelte";
  import { SETTINGS_SECTIONS, searchSubsections, type SettingsTab } from "$lib/settings/sections";
  import { ChevronLeft, ChevronRight, Search } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";

  const TAB_IDS: SettingsTab[] = ["categories", "rules", "groups", "profile", "personalization"];

  // `?tab=` stays the canonical deep-link param. Absent/invalid → section landing.
  const activeTab = $derived.by<SettingsTab | null>(() => {
    const t = $page.url.searchParams.get("tab");
    return t && TAB_IDS.includes(t as SettingsTab) ? (t as SettingsTab) : null;
  });
  let search = $state("");
  const results = $derived(searchSubsections(search));

  let userId = $state<string | undefined>(undefined);
  supabase.auth.getSession().then(({ data }) => {
    userId = data.session?.user.id;
  });

  const profileQuery = createQuery(() => ({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  }));
  const profile = $derived(profileQuery.data ?? null);

  function openTab(tab: SettingsTab) {
    goto(`/settings?tab=${tab}`);
  }
  function backToLanding() {
    goto("/settings");
  }
</script>

<svelte:head>
  <title>{m.settings_title()} · Portfelik</title>
</svelte:head>

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-6">
  {#if activeTab}
    <!-- Drill-down: back link + the subsection panel -->
    <button
      type="button"
      onclick={backToLanding}
      class="focus-visible:ring-accent -ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-slate-400 transition-colors hover:text-slate-100 focus-visible:ring-2 focus-visible:outline-none"
    >
      <ChevronLeft size={16} aria-hidden="true" />
      {m.settings_title()}
    </button>

    <div role="tabpanel">
      {#if activeTab === "categories"}
        <CategoriesTab />
      {:else if activeTab === "rules"}
        <RulesTab />
      {:else if activeTab === "groups"}
        <GroupsTab />
      {:else if activeTab === "profile"}
        <ProfileTab {profile} />
      {:else if activeTab === "personalization"}
        <PersonalizationTab {profile} />
      {/if}
    </div>
  {:else}
    <!-- Landing: title + search + section cards -->
    <h1 class="text-hero font-semibold text-slate-100">{m.settings_title()}</h1>

    <label class="relative block">
      <Search
        size={16}
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500"
        aria-hidden="true"
      />
      <input
        type="search"
        bind:value={search}
        placeholder={m.settings_search_placeholder()}
        aria-label={m.settings_search_placeholder()}
        class="focus-visible:ring-accent w-full rounded-full border border-white/10 bg-slate-900/60 py-2.5 pr-3 pl-9 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus-visible:ring-2 focus-visible:outline-none"
      />
    </label>

    {#if search.trim()}
      {#if results.length > 0}
        <ul class="space-y-2">
          {#each results as r (r.tab)}
            <li>
              <button
                type="button"
                onclick={() => openTab(r.tab)}
                class="focus-visible:ring-accent flex w-full items-center justify-between gap-3 rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3 text-left backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span class="min-w-0">
                  <span class="block text-sm font-medium text-slate-100">{r.label()}</span>
                  <span class="block text-xs text-slate-400">{r.sectionLabel()}</span>
                </span>
                <ChevronRight size={16} class="shrink-0 text-slate-500" aria-hidden="true" />
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="py-6 text-center text-sm text-slate-400">{m.settings_search_empty()}</p>
      {/if}
    {:else}
      <div class="space-y-4">
        {#each SETTINGS_SECTIONS as section (section.id)}
          {@const Icon = section.icon}
          <section class="rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur">
            <div class="flex items-center gap-2 px-4 pt-4 pb-2">
              <Icon size={16} class="text-slate-400" aria-hidden="true" />
              <h2 class="text-eyebrow text-slate-400">{section.label()}</h2>
            </div>
            <ul class="divide-y divide-white/5">
              {#each section.subs as sub (sub.tab)}
                <li>
                  <button
                    type="button"
                    onclick={() => openTab(sub.tab)}
                    class="focus-visible:ring-accent flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span class="text-sm font-medium text-slate-100">{sub.label()}</span>
                    <ChevronRight size={16} class="shrink-0 text-slate-500" aria-hidden="true" />
                  </button>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {/if}
  {/if}
</div>
