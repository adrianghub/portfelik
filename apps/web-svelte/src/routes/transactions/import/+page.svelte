<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import FileUpload from "$lib/components/import/FileUpload.svelte";
  import ReviewTable from "$lib/components/import/ReviewTable.svelte";
  import CommitSummary from "$lib/components/import/CommitSummary.svelte";
  import {
    cancelImportSession,
    type CommitResult,
    type ImportSession,
  } from "$lib/services/bank-import";
  import { useQueryClient } from "@tanstack/svelte-query";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { cn } from "$lib/utils";

  // Wizard state machine — bank kind is detected from the CSV, never picked
  // by the user. State machine: upload → review → done.

  type Step = "upload" | "review" | "done";
  interface ImportedDateRange {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  }

  let step = $state<Step>("upload");
  let activeSession = $state<ImportSession | null>(null);
  let commitResult = $state<CommitResult | null>(null);
  let committedDateRange = $state<ImportedDateRange | null>(null);

  const queryClient = useQueryClient();

  function handleSessionReady(sess: ImportSession): void {
    activeSession = sess;
    step = "review";
  }

  function handleCommitted(result: CommitResult, dateRange?: ImportedDateRange): void {
    commitResult = result;
    committedDateRange = dateRange ?? null;
    step = "done";
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    toast.success(m.bank_commit_success({ count: result.inserted }));
  }

  async function handleCancel(): Promise<void> {
    if (!activeSession) {
      resetToUpload();
      return;
    }
    try {
      await cancelImportSession(activeSession.id);
    } catch {
      // ignore — session already cancelled or gone
    }
    resetToUpload();
  }

  function resetToUpload(): void {
    activeSession = null;
    commitResult = null;
    committedDateRange = null;
    step = "upload";
  }

  function backToTransactions(): void {
    if (!committedDateRange) {
      void goto("/transactions");
      return;
    }

    const params = new URLSearchParams({
      startYear: String(committedDateRange.startYear),
      startMonth: String(committedDateRange.startMonth),
      endYear: String(committedDateRange.endYear),
      endMonth: String(committedDateRange.endMonth),
    });
    void goto(`/transactions?${params.toString()}`);
  }
</script>

<svelte:head>
  <title>{m.bank_import_title()} · Portfelik</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
  <header class="space-y-1">
    <h1 class="text-2xl font-semibold text-slate-100">{m.bank_import_title()}</h1>
  </header>

  <ol class="flex flex-wrap items-center gap-2 text-xs text-slate-400">
    {#each ["upload", "review", "done"] as s, i (s)}
      {@const active = step === s}
      {@const completed = (["upload", "review", "done"] as Step[]).indexOf(step) > i}
      <li
        class={cn(
          "rounded-full border px-3 py-1 transition-colors",
          active && "border-emerald-400 text-emerald-300",
          completed && !active && "border-emerald-400/40 text-emerald-300/70",
          !active && !completed && "border-white/10"
        )}
      >
        {#if s === "upload"}{m.bank_import_step_upload()}{/if}
        {#if s === "review"}{m.bank_import_step_review()}{/if}
        {#if s === "done"}{m.bank_import_step_done()}{/if}
      </li>
      {#if i < 2}
        <span class="text-slate-600">›</span>
      {/if}
    {/each}
  </ol>

  <section class="space-y-4">
    {#if step === "upload"}
      <FileUpload onSessionReady={handleSessionReady} />
    {:else if step === "review" && activeSession}
      <ReviewTable session={activeSession} onCommitted={handleCommitted} onCancel={handleCancel} />
    {:else if step === "done" && commitResult}
      <CommitSummary result={commitResult} onDone={backToTransactions} />
    {/if}
  </section>
</div>
