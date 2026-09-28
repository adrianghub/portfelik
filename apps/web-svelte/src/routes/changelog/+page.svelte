<script lang="ts">
  import { page } from "$app/state";
  import { currentBuildSha } from "$lib/build-info";
  import {
    appVersion,
    changelog,
    changelogReturnHref,
    formatChangelogDate,
  } from "$lib/content/changelog";
  import * as m from "$lib/paraglide/messages";

  const backHref = $derived(changelogReturnHref(page.url.searchParams.get("from")));
  const buildSha = currentBuildSha();
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
  <p class="mt-2 text-sm text-slate-300">
    {m.changelog_current({ version: `v${appVersion}` })}
  </p>
  {#if buildSha}
    <p class="mt-1 font-mono text-xs text-slate-500">{m.changelog_build({ sha: buildSha })}</p>
  {/if}

  <div class="mt-8 space-y-10">
    {#each changelog as entry (entry.version)}
      <article>
        <h2 class="text-lg font-semibold text-slate-100">
          v{entry.version}, {formatChangelogDate(entry.date)}
        </h2>
        <div class="mt-4 space-y-5">
          {#each entry.sections as section (section.title)}
            <section>
              <h3 class="text-eyebrow text-slate-400">{section.title}</h3>
              <ul class="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300">
                {#each section.items as item (item)}
                  <li>{item}</li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      </article>
    {/each}
  </div>
</main>
