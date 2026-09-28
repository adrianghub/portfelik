<script lang="ts">
  import { page } from "$app/state";
  import {
    appVersion,
    changelog,
    changelogReturnHref,
    formatChangelogDate,
  } from "$lib/content/changelog";
  import * as m from "$lib/paraglide/messages";

  const backHref = $derived(changelogReturnHref(page.url.searchParams.get("from")));
</script>

<svelte:head>
  <title>{m.changelog_title()} · JakStoimy</title>
</svelte:head>

<main class="mx-auto min-h-screen max-w-2xl px-4 pt-8 pb-[max(2.5rem,var(--safe-bottom))]">
  <a
    href={backHref}
    class="focus-visible:ring-accent text-sm font-medium text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
  >
    {m.changelog_close()}
  </a>

  <h1 class="mt-6 text-2xl font-semibold text-slate-100">{m.changelog_title()}</h1>
  <p class="mt-2 text-sm text-slate-300">{m.changelog_current({ version: appVersion })}</p>

  <div class="mt-8 space-y-10">
    {#each changelog as entry (entry.version)}
      <article>
        <h2 class="text-lg font-semibold text-slate-100">
          {entry.version}, {formatChangelogDate(entry.date)}
        </h2>
        <ul class="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300">
          {#each entry.items as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
      </article>
    {/each}
  </div>
</main>
