<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import BrandMark from "$lib/components/BrandMark.svelte";
  import * as m from "$lib/paraglide/messages";

  const message = $derived(
    page.error?.message && page.error.message !== "Not Found"
      ? page.error.message
      : m.common_error_description()
  );

  async function retry() {
    await invalidateAll();
  }
</script>

<main class="grid min-h-screen place-items-center bg-slate-950 px-4">
  <div
    class="w-full max-w-md rounded-2xl border border-white/5 bg-slate-900/60 px-6 py-10 text-center backdrop-blur"
  >
    <BrandMark class="justify-center" />
    <p class="text-eyebrow mt-6 text-slate-500">{page.status}</p>
    <h1 class="mt-2 text-lg font-semibold text-slate-100">{m.common_error_title()}</h1>
    <p class="mt-2 text-sm text-slate-400">{message}</p>
    <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onclick={retry}
        class="focus-visible:ring-accent rounded-full border border-white/10 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.common_retry()}
      </button>
      <a
        href="/dashboard"
        class="bg-accent-gradient focus-visible:ring-accent rounded-full px-4 py-2 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.nav_dashboard()}
      </a>
    </div>
  </div>
</main>
