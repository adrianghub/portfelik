<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import FileUpload from "$lib/components/import/FileUpload.svelte";
  import ReviewTable from "$lib/components/import/ReviewTable.svelte";
  import {
    cancelImportSession,
    type CommitResult,
    type ImportSession,
  } from "$lib/services/bank-import";
  import { useQueryClient } from "@tanstack/svelte-query";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { cn, transactionsUrlForRange } from "$lib/utils";

  // Wizard state machine — bank kind is detected from the CSV, never picked
  // by the user. State machine: upload → review. On commit we redirect straight
  // to the transactions list filtered to the imported period (no "done" step).

  type Step = "upload" | "review";
  interface ImportedDateRange {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  }

  const steps: Step[] = ["upload", "review"];

  let step = $state<Step>("upload");
  let activeSession = $state<ImportSession | null>(null);
  // Retained across the upload⇄review back-nav so returning to "Wgraj plik"
  // shows the last file ready to re-process or remove. Cancelling the session
  // abandons the DB preview rows but keeps this in-memory file reference.
  let retainedFile = $state<File | null>(null);

  const queryClient = useQueryClient();

  function handleSessionReady(sess: ImportSession): void {
    activeSession = sess;
    step = "review";
  }

  function handleCommitted(result: CommitResult, dateRange?: ImportedDateRange): void {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    toast.success(m.bank_commit_success({ count: result.inserted }), {
      description: m.bank_commit_toast_detail({
        skipped: result.skipped,
        duplicates: result.duplicates_preview + result.duplicates_commit,
      }),
    });
    void goto(transactionsUrlForRange(dateRange));
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
    step = "upload";
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
    {#each steps as s, i (s)}
      {@const active = step === s}
      {@const completed = steps.indexOf(step) > i}
      {@const label = s === "upload" ? m.bank_import_step_upload() : m.bank_import_step_review()}
      {@const pillClass = cn(
        "rounded-full border px-3 py-1 transition-colors",
        active && "border-emerald-400 text-emerald-300",
        completed && !active && "border-emerald-400/40 text-emerald-300/70",
        !active && !completed && "border-white/10"
      )}
      <li>
        {#if completed}
          <!-- Completed step is a back button: returns to upload and abandons
               the in-progress review session. -->
          <button
            type="button"
            class={cn(pillClass, "hover:border-emerald-400 hover:text-emerald-200")}
            onclick={() => void handleCancel()}
          >
            {label}
          </button>
        {:else}
          <span class={pillClass}>{label}</span>
        {/if}
      </li>
      {#if i < steps.length - 1}
        <span class="text-slate-600">›</span>
      {/if}
    {/each}
  </ol>

  <section class="space-y-4">
    {#if step === "upload"}
      <FileUpload
        onSessionReady={handleSessionReady}
        initialFile={retainedFile}
        onFileRetained={(f) => (retainedFile = f)}
      />
    {:else if step === "review" && activeSession}
      <ReviewTable session={activeSession} onCommitted={handleCommitted} onCancel={handleCancel} />
    {/if}
  </section>
</div>
