<script lang="ts">
  import { goto } from "$app/navigation";
  import Button from "$lib/components/ui/Button.svelte";
  import {
    detectImportAdapter,
    getImportAdapter,
    importAdapterLabel,
    listImportAdapters,
  } from "$lib/import/banks/registry";
  import type { DetectionResult, ImportAdapterKind } from "$lib/import/banks/types";
  import { matchCategory } from "$lib/import/categorize";
  import { decodeBankCsv } from "$lib/import/csv/decode";
  import { normalize } from "$lib/import/normalize";
  import * as m from "$lib/paraglide/messages";
  import {
    cancelImportSession,
    fetchSessionRows,
    findExistingSession,
    findOrCreateActiveAccount,
    insertPreviewRows,
    markPreviewDuplicates,
    openImportSession,
    type ImportSession,
  } from "$lib/services/bank-import";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchCategorizationRules } from "$lib/services/categorization-rules";
  import { cn, transactionsUrlForRange } from "$lib/utils";
  import { FileText, Upload, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  interface Props {
    onSessionReady: (
      session: ImportSession,
      parseErrorCount: number,
      skippedRowCount: number
    ) => void;
    /** Last selected file, lifted to the page so it survives a back-nav. */
    initialFile?: File | null;
    /** Report the current file up so the page can retain it across steps. */
    onFileRetained?: (file: File | null) => void;
  }
  let { onSessionReady, initialFile = null, onFileRetained }: Props = $props();

  let busy = $state(false);
  let dragOver = $state(false);
  let error = $state<string | null>(null);
  let parseErrorCount = $state(0);
  let skippedRowCount = $state(0);
  let committedConflict = $state<ImportSession | null>(null);

  // Pending upload awaiting adapter confirmation.
  let pending = $state<{ file: File; bytes: ArrayBuffer; text: string } | null>(null);
  let detection = $state<DetectionResult>(null);
  let selectedKind = $state<ImportAdapterKind | null>(null);

  const bankAdapters = listImportAdapters({ sourceKind: "bank_statement" });

  async function proceedWithAdapter(kind: ImportAdapterKind): Promise<void> {
    if (!pending) return;
    const { file, bytes, text } = pending;
    const label = importAdapterLabel(kind);

    const adapter = getImportAdapter(kind);
    const parsed = adapter.parse(text);
    parseErrorCount = parsed.errors.length;
    if (parsed.rows.length === 0 && parsed.errors.length > 0) {
      error = m.bank_upload_parse_failed({ bank: label });
      return;
    }

    const normalized = await normalize(parsed, bytes);
    // Two distinct buckets: rows the adapter couldn't read (genuine parse
    // failures) vs rows normalize() intentionally skipped because the amount is
    // 0 (auth holds/reversals — DB rejects amount <= 0). They get separate copy.
    skippedRowCount = normalized.errors.filter((e) => e.reason === "non_positive_amount").length;
    parseErrorCount = normalized.errors.length - skippedRowCount;

    const account = await findOrCreateActiveAccount({ kind, defaultLabel: label });

    const existing = await findExistingSession({
      bankAccountId: account.id,
      sourceFileHash: normalized.sourceFileHash,
    });
    if (existing?.status === "committed") {
      committedConflict = existing;
      return;
    }
    // An uncommitted preview for the same file is an abandoned earlier
    // attempt. Cancel it (frees the partial unique index on file hash) and
    // start fresh - no mid-review resume.
    if (existing?.status === "preview") {
      await cancelImportSession(existing.id);
    }

    const session = await openImportSession({
      bankAccountId: account.id,
      sourceFilename: file.name,
      sourceFileHash: normalized.sourceFileHash,
      adapterKind: kind,
    });

    // Pre-fill categories from the user's deterministic rules when available.
    // Rule/category loading is optional; if it fails, keep the import usable
    // and let the user categorize rows manually in review.
    let resolver: ((row: (typeof normalized.rows)[number]) => string | null) | undefined;
    try {
      const [rules, categories] = await Promise.all([
        fetchCategorizationRules(),
        fetchCategories(),
      ]);
      resolver = (r) => matchCategory(r, rules, categories);
    } catch {
      resolver = undefined;
    }
    try {
      await insertPreviewRows(session.id, normalized.rows, resolver);
    } catch (e) {
      await cancelImportSession(session.id).catch(() => {});
      throw e;
    }
    // Default-skip probable duplicates once (issue #73). Best-effort: a failure
    // here must not block the import — the review surface still opens, and the
    // commit RPC re-detects duplicates as a safety net.
    try {
      await markPreviewDuplicates(session.id);
    } catch {
      /* non-fatal: dups will still be caught at commit */
    }
    pending = null;
    onSessionReady(session, parseErrorCount, skippedRowCount);
  }

  async function handleFile(file: File): Promise<void> {
    // Retain the file on the page so returning to this step shows it again.
    onFileRetained?.(file);
    error = null;
    parseErrorCount = 0;
    skippedRowCount = 0;
    committedConflict = null;
    pending = null;
    detection = null;
    selectedKind = null;
    busy = true;
    try {
      const bytes = await file.arrayBuffer();
      const text = decodeBankCsv(bytes);
      const result = detectImportAdapter(text);
      pending = { file, bytes, text };
      detection = result;
      selectedKind = result?.kind ?? null;

      // High-confidence detection: proceed straight through (one-click path).
      if (result && result.confidence === "high") {
        await proceedWithAdapter(result.kind);
      }
      // medium/low/null: render the selector and wait for confirmAdapter().
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error = msg;
      toast.error(msg);
    } finally {
      busy = false;
    }
  }

  async function confirmAdapter(): Promise<void> {
    if (!selectedKind) return;
    busy = true;
    try {
      await proceedWithAdapter(selectedKind);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error = msg;
      toast.error(msg);
    } finally {
      busy = false;
    }
  }

  async function cancelCommittedConflict(): Promise<void> {
    if (!committedConflict) return;
    try {
      await cancelImportSession(committedConflict.id);
      committedConflict = null;
      pending = null;
      detection = null;
      selectedKind = null;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function viewCommittedTransactions(): Promise<void> {
    if (!committedConflict) {
      await goto("/transactions");
      return;
    }

    try {
      const rows = await fetchSessionRows(committedConflict.id);
      const dates = rows.map((r) => r.posted_at).sort();
      const first = dates[0];
      const last = dates.at(-1);
      if (!first || !last) {
        await goto("/transactions");
        return;
      }

      const [startYear, startMonth] = first.split("-").map(Number);
      const [endYear, endMonth] = last.split("-").map(Number);
      if (!startYear || !startMonth || !endYear || !endMonth) {
        await goto("/transactions");
        return;
      }

      await goto(transactionsUrlForRange({ startYear, startMonth, endYear, endMonth }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function onSelect(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void handleFile(file);
    input.value = "";
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  }

  function removeFile(): void {
    onFileRetained?.(null);
    error = null;
    parseErrorCount = 0;
    committedConflict = null;
    pending = null;
    detection = null;
    selectedKind = null;
  }

  function reprocess(): void {
    if (initialFile) void handleFile(initialFile);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur">
  <label
    class={cn(
      "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
      dragOver ? "border-accent bg-accent/5" : "border-white/10"
    )}
    ondragover={(e) => {
      e.preventDefault();
      dragOver = true;
    }}
    ondragleave={() => (dragOver = false)}
    ondrop={onDrop}
  >
    <Upload class="text-slate-400" size={28} aria-hidden="true" />
    <p class="text-sm text-slate-300">{m.bank_upload_drop()}</p>
    <input type="file" accept=".csv,text/csv" class="hidden" disabled={busy} onchange={onSelect} />
  </label>

  {#if initialFile && !busy}
    <!-- Retained file: shows filename + remove. "Przetwórz ponownie" only makes
         sense when there's no active detection in progress (e.g. after coming
         back from review) - during a fresh upload the adapter selector below
         already owns the parse action, so showing reprocess too is redundant. -->
    <div
      class="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3"
    >
      <FileText class="shrink-0 text-slate-400" size={20} aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm text-slate-100">{initialFile.name}</p>
        <p class="text-xs text-slate-500">{formatSize(initialFile.size)}</p>
      </div>
      {#if !pending}
        <Button variant="ghost" size="sm" onclick={reprocess}>
          {m.bank_upload_reprocess()}
        </Button>
      {/if}
      <Button variant="ghost" size="sm" title={m.bank_upload_remove_file()} onclick={removeFile}>
        <X size={16} aria-hidden="true" />
      </Button>
    </div>
  {/if}

  {#if busy}
    <p class="text-sm text-slate-400">{m.bank_upload_parsing()}</p>
  {/if}

  {#if pending && !committedConflict && !busy}
    {#if detection?.confidence === "high" && !error}
      <p class="border-accent/30 bg-accent/10 text-accent rounded-xl border px-4 py-3 text-sm">
        {m.bank_upload_recognized({ bank: importAdapterLabel(detection.kind) })}
      </p>
    {:else if detection?.confidence !== "high"}
      <div class="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3">
        <p class="text-sm text-slate-300">
          {#if detection}
            {m.bank_upload_probable({ bank: importAdapterLabel(detection.kind) })}
          {:else}
            {m.bank_upload_pick_adapter()}
          {/if}
        </p>
        <label class="block text-xs text-slate-400" for="adapter-select">
          {m.bank_upload_adapter_label()}
        </label>
        <select
          id="adapter-select"
          bind:value={selectedKind}
          class="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          {#if !selectedKind}
            <option value={null} disabled>{m.bank_upload_adapter_placeholder()}</option>
          {/if}
          {#each bankAdapters as a (a.kind)}
            <option value={a.kind}>{a.label}</option>
          {/each}
        </select>
        <Button size="sm" disabled={!selectedKind || busy} onclick={confirmAdapter}>
          {m.bank_upload_adapter_confirm()}
        </Button>
      </div>
    {/if}
  {/if}

  {#if error}
    <p class="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      {error}
    </p>
  {/if}

  {#if parseErrorCount > 0 && !committedConflict}
    <p class="text-xs text-amber-300">{m.bank_upload_parse_errors({ count: parseErrorCount })}</p>
  {/if}

  {#if committedConflict}
    <div class="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <p class="text-sm font-semibold text-amber-100">
        {m.bank_upload_already_committed_title()}
      </p>
      <p class="text-sm text-amber-100/90">
        {m.bank_upload_already_committed_body({
          date: committedConflict.committed_at?.slice(0, 10) ?? "-",
          inserted: committedConflict.rows_committed,
          skipped: committedConflict.rows_skipped,
          duplicates: committedConflict.rows_duplicate,
        })}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onclick={viewCommittedTransactions}>
          {m.bank_upload_view_transactions()}
        </Button>
        <Button variant="ghost" size="sm" onclick={cancelCommittedConflict}>
          {m.bank_upload_cancel_previous()}
        </Button>
      </div>
      <p class="text-xs text-amber-200/70">{m.bank_upload_cancel_previous_hint()}</p>
    </div>
  {/if}
</div>
