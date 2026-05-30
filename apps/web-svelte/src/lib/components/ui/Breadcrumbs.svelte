<script lang="ts">
  import { page } from "$app/stores";
  import * as m from "$lib/paraglide/messages";
  import { ChevronLeft, ChevronRight } from "lucide-svelte";

  // Global breadcrumb trail for secondary (nested/detail) screens. Top-level
  // nav destinations and public routes return null → nothing renders. Desktop
  // shows the full trail; mobile collapses to a single "‹ parent" back link.

  interface Crumb {
    label: string;
    href?: string;
  }

  const trail = $derived.by<Crumb[] | null>(() => {
    const path = $page.url.pathname;
    const seg = path.split("/").filter(Boolean);

    if (path === "/transactions/import") {
      return [
        { label: m.nav_transactions(), href: "/transactions" },
        { label: m.bank_import_title() },
      ];
    }
    if (seg[0] === "shopping-lists" && seg.length === 2) {
      return [
        { label: m.nav_shopping_lists(), href: "/shopping-lists" },
        { label: m.breadcrumb_list_detail() },
      ];
    }
    if (path === "/admin/notifications") {
      return [{ label: m.nav_admin(), href: "/admin" }, { label: m.breadcrumb_notifications() }];
    }
    return null;
  });

  // Mobile target: the nearest ancestor crumb that has an href.
  const parent = $derived(trail ? [...trail].reverse().find((c) => c.href) : undefined);
</script>

{#if trail}
  <nav aria-label={m.breadcrumb_nav()} class="mx-auto w-full max-w-5xl px-4 pt-4 md:px-6">
    {#if parent}
      <a
        href={parent.href}
        class="focus-visible:ring-accent inline-flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-slate-100 focus-visible:ring-2 focus-visible:outline-none md:hidden"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        {parent.label}
      </a>
    {/if}

    <ol class="hidden items-center gap-1.5 text-sm md:flex">
      {#each trail as crumb, i (i)}
        <li class="flex items-center gap-1.5">
          {#if crumb.href}
            <a
              href={crumb.href}
              class="focus-visible:ring-accent text-slate-400 transition-colors hover:text-slate-100 focus-visible:ring-2 focus-visible:outline-none"
            >
              {crumb.label}
            </a>
          {:else}
            <span class="font-medium text-slate-200" aria-current="page">{crumb.label}</span>
          {/if}
          {#if i < trail.length - 1}
            <ChevronRight size={14} class="text-slate-600" aria-hidden="true" />
          {/if}
        </li>
      {/each}
    </ol>
  </nav>
{/if}
