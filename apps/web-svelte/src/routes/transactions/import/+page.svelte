<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { onMount } from "svelte";
  import FileUpload from "$lib/components/import/FileUpload.svelte";
  import ImportReviewFlow from "$lib/components/import/ImportReviewFlow.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import {
    cancelImportSession,
    fetchActivePreviewSession,
    type CommitResult,
    type ImportSession,
  } from "$lib/services/bank-import";
  import { useQueryClient } from "@tanstack/svelte-query";
  import { beforeNavigate, goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { cn, transactionsUrlForRange } from "$lib/utils";

  // Wizard state machine - bank kind is detected from the CSV, never picked
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
  let activeParseErrorCount = $state(0);
  // Retained across the upload⇄review back-nav so returning to "Wgraj plik"
  // shows the last file ready to re-process or remove. Cancelling the session
  // abandons the DB preview rows but keeps this in-memory file reference.
  let retainedFile = $state<File | null>(null);

  // Draft resume + leave guard (issue #66). The review rows persist server-side,
  // so leaving mid-review keeps the session as a resumable draft unless the user
  // explicitly discards it.
  let resumeSession = $state<ImportSession | null>(null);
  let leaveDialogOpen = $state(false);
  let pendingHref = $state<string | null>(null);
  // Plain (non-reactive) flag: set right before an intentional navigation
  // (commit redirect, or after the user chose save/discard) so the guard lets it
  // through exactly once.
  let bypassGuard = false;

  const queryClient = useQueryClient();

  onMount(async () => {
    if (step === "review") return;
    try {
      resumeSession = await fetchActivePreviewSession();
    } catch {
      resumeSession = null;
    }
  });

  beforeNavigate((nav) => {
    if (bypassGuard) {
      bypassGuard = false;
      return;
    }
    if (step !== "review" || !activeSession) return;
    // Full page unload (tab close) can't host a custom dialog - let it pass.
    if (!nav.to) return;
    nav.cancel();
    pendingHref = nav.to.url.href;
    leaveDialogOpen = true;
  });

  function leaveTo(href: string | null): void {
    bypassGuard = true;
    leaveDialogOpen = false;
    if (href) void goto(href);
  }

  function saveDraftAndLeave(): void {
    // Keep the session in 'preview' - nothing to persist, just navigate away.
    leaveTo(pendingHref);
  }

  async function discardDraftAndLeave(): Promise<void> {
    const target = pendingHref;
    if (activeSession) {
      try {
        await cancelImportSession(activeSession.id);
      } catch {
        // ignore - session already cancelled or gone
      }
    }
    activeSession = null;
    leaveTo(target);
  }

  function stayOnPage(): void {
    leaveDialogOpen = false;
    pendingHref = null;
  }

  function handleSessionReady(sess: ImportSession, parseErrorCount: number): void {
    resumeSession = null;
    activeSession = sess;
    activeParseErrorCount = parseErrorCount;
    step = "review";
  }

  function resumeDraft(): void {
    if (!resumeSession) return;
    activeSession = resumeSession;
    activeParseErrorCount = 0;
    resumeSession = null;
    step = "review";
  }

  async function discardDraft(): Promise<void> {
    if (!resumeSession) return;
    try {
      await cancelImportSession(resumeSession.id);
    } catch {
      // ignore
    }
    resumeSession = null;
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
    // Committed → the session is done; let the post-commit redirect through.
    bypassGuard = true;
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
      // ignore - session already cancelled or gone
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
        active && "border-accent text-accent",
        completed && !active && "border-accent/40 text-accent/70",
        !active && !completed && "border-white/10"
      )}
      <li>
        {#if completed}
          <!-- Completed step is a back button: returns to upload and abandons
               the in-progress review session. -->
          <button
            type="button"
            class={cn(pillClass, "hover:border-accent hover:text-accent")}
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
      {#if resumeSession}
        <div
          class="surface-hi border-accent/30 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-100">{m.bank_import_resume_title()}</p>
            <p class="mt-0.5 truncate text-xs text-slate-400">
              {m.bank_import_resume_body({
                filename: resumeSession.source_filename ?? resumeSession.detected_kind,
              })}
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onclick={() => void discardDraft()}>
              {m.bank_import_resume_discard()}
            </Button>
            <Button variant="primary" size="sm" onclick={resumeDraft}>
              {m.bank_import_resume_action()}
            </Button>
          </div>
        </div>
      {/if}
      <FileUpload
        onSessionReady={handleSessionReady}
        initialFile={retainedFile}
        onFileRetained={(f) => (retainedFile = f)}
      />
    {:else if step === "review" && activeSession}
      <ImportReviewFlow
        session={activeSession}
        parseErrorCount={activeParseErrorCount}
        onCommitted={handleCommitted}
        onCancel={handleCancel}
      />
    {/if}
  </section>
</div>

<Dialog open={leaveDialogOpen} onclose={stayOnPage} title={m.bank_import_leave_title()}>
  <div class="space-y-3">
    <p class="text-sm text-slate-300">{m.bank_import_leave_body_stepper()}</p>
    <div class="flex items-center justify-between gap-2 pt-1">
      <Button variant="ghost" size="sm" onclick={stayOnPage}>{m.bank_import_leave_stay()}</Button>
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" onclick={() => void discardDraftAndLeave()}>
          {m.bank_import_leave_discard()}
        </Button>
        <Button variant="primary" size="sm" onclick={saveDraftAndLeave}>
          {m.bank_import_leave_save()}
        </Button>
      </div>
    </div>
  </div>
</Dialog>
