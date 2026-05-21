<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Button from "$lib/components/ui/Button.svelte";
  import { CheckCircle2 } from "lucide-svelte";
  import type { CommitResult } from "$lib/services/bank-import";

  interface Props {
    result: CommitResult;
    onDone: () => void;
  }
  let { result, onDone }: Props = $props();
</script>

<div class="space-y-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 backdrop-blur">
  <div class="flex items-start gap-3">
    <CheckCircle2 class="text-emerald-400" size={28} aria-hidden="true" />
    <div>
      <h2 class="text-lg font-semibold text-slate-100">
        {m.bank_commit_success({ count: result.inserted })}
      </h2>
    </div>
  </div>

  <dl class="grid gap-2 text-sm sm:grid-cols-2">
    <div class="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <dt class="text-slate-400">{m.bank_commit_summary_inserted({ n: result.inserted })}</dt>
    </div>
    <div class="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <dt class="text-slate-400">
        {m.bank_commit_summary_duplicates_preview({ n: result.duplicates_preview })}
      </dt>
    </div>
    <div class="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <dt class="text-slate-400">
        {m.bank_commit_summary_duplicates_commit({ n: result.duplicates_commit })}
      </dt>
    </div>
    <div class="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <dt class="text-slate-400">{m.bank_commit_summary_skipped({ n: result.skipped })}</dt>
    </div>
  </dl>

  {#if result.fingerprint_warnings.length > 0}
    <section class="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h3 class="text-sm font-medium text-amber-200">
        {m.bank_commit_summary_warnings({ n: result.fingerprint_warnings.length })}
      </h3>
      <ul class="space-y-1 text-sm text-amber-100/90">
        {#each result.fingerprint_warnings as w (w.row_id)}
          <li class="flex items-center justify-between gap-3">
            <span class="font-mono text-xs">{w.row_id.slice(0, 8)}…</span>
            <a
              class="text-emerald-300 hover:underline"
              href="/transactions?focus={w.duplicate_of_transaction_id}"
            >
              {m.bank_commit_warning_view()}
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <div class="flex justify-end">
    <Button variant="primary" onclick={onDone}>{m.bank_commit_done()}</Button>
  </div>
</div>
