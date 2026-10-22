<script lang="ts">
  import { fillDemoSample } from "$lib/services/demo-sample";
  import * as m from "$lib/paraglide/messages";
  let {
    onComplete,
    onDismiss,
    onStart,
    recovering = false,
  }: {
    onComplete: () => Promise<void>;
    onDismiss: () => void;
    onStart: () => void;
    recovering?: boolean;
  } = $props();
  let busy = $state(false);
  let complete = $state(false);
  let failed = $state(false);
  async function fill() {
    if (busy || complete) return;
    busy = true;
    failed = false;
    onStart();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        fillDemoSample(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("demo_sample_timeout")), 60_000);
        }),
      ]);
      if (result.total !== 96) throw new Error("demo_sample_incomplete");
      await onComplete();
      complete = true;
    } catch {
      failed = true;
    } finally {
      clearTimeout(timer);
      busy = false;
    }
  }
</script>

<section class="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5" aria-busy={busy}>
  {#if complete}
    <h2 class="text-lg font-semibold text-slate-100" role="status">{m.demo_sample_success()}</h2>
    <p class="mt-2 text-sm text-slate-300">{m.demo_sample_success_body()}</p>
    <a
      href="/analysis"
      class="bg-accent-gradient mt-4 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-slate-950"
      >{m.demo_sample_analysis()}</a
    >
  {:else}
    <h2 class="text-lg font-semibold text-slate-100">{m.demo_sample_title()}</h2>
    <p class="mt-2 text-sm text-slate-300">{m.demo_sample_body()}</p>
    <p class="mt-2 text-xs text-slate-400">{m.demo_sample_details()}</p>
    {#if failed}<p role="alert" class="mt-3 text-sm text-rose-300">{m.demo_sample_error()}</p>{/if}
    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        onclick={fill}
        disabled={busy}
        class="bg-accent-gradient min-h-11 rounded-full px-4 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >{busy
          ? m.demo_sample_loading()
          : recovering
            ? m.demo_sample_retry()
            : m.demo_sample_fill()}</button
      >
      <button
        type="button"
        onclick={onDismiss}
        disabled={busy}
        class="min-h-11 rounded-full px-4 text-sm text-slate-300 disabled:opacity-50"
        >{m.demo_sample_later()}</button
      >
    </div>
    {#if failed}<a href="/import" class="mt-3 inline-block text-sm text-emerald-300 underline"
        >{m.tour_welcome_import()}</a
      >{/if}
  {/if}
</section>
