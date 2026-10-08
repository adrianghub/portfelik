<script lang="ts">
  import ImportHistory from "$lib/components/import/ImportHistory.svelte";
  import { importHistoryCopy } from "$lib/content/import-history-copy";
</script>

<svelte:head>
  <title>{importHistoryCopy.title} · JakStoimy</title>
</svelte:head>

<div class="container mx-auto max-w-5xl space-y-4 px-4 py-6">
  <a href="/settings" class="text-sm text-slate-400 hover:text-slate-100">← Ustawienia</a>
  <ImportHistory />
</div>
