<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { goto } from "$app/navigation";
  import { decodeBankCsv } from "$lib/import/csv/decode";
  import { detectBank, getAdapter } from "$lib/import/banks/detect";
  import { normalize } from "$lib/import/normalize";
  import {
    cancelImportSession,
    fetchSessionRows,
    findExistingSession,
    findOrCreateActiveAccount,
    insertPreviewRows,
    openImportSession,
    type BankKind,
    type ImportSession,
  } from "$lib/services/bank-import";
  import Button from "$lib/components/ui/Button.svelte";
  import { cn } from "$lib/utils";
  import { toast } from "svelte-sonner";
  import { Upload } from "lucide-svelte";

  interface Props {
    onSessionReady: (session: ImportSession) => void;
  }
  let { onSessionReady }: Props = $props();

  let busy = $state(false);
  let dragOver = $state(false);
  let error = $state<string | null>(null);
  let parseErrorCount = $state(0);
  let detectedBankLabel = $state<string | null>(null);
  let committedConflict = $state<ImportSession | null>(null);

  function kindLabel(kind: BankKind): string {
    return kind === "ing" ? m.bank_account_kind_ing() : m.bank_account_kind_mbank();
  }

  async function handleFile(file: File): Promise<void> {
    error = null;
    parseErrorCount = 0;
    detectedBankLabel = null;
    committedConflict = null;
    busy = true;
    try {
      const bytes = await file.arrayBuffer();
      const text = decodeBankCsv(bytes);

      const detected = detectBank(text);
      if (!detected) {
        error = m.bank_upload_kind_unknown();
        return;
      }
      const bankLabel = kindLabel(detected);
      detectedBankLabel = bankLabel;

      // Auto-find-or-create the user's active account for this kind. The
      // user never picks a bank — detection is enough.
      const account = await findOrCreateActiveAccount({
        kind: detected,
        defaultLabel: bankLabel,
      });

      const adapter = getAdapter(detected);
      const parsed = adapter.parse(text);
      const normalized = await normalize(parsed, bytes);
      parseErrorCount = normalized.errors.length;

      const existing = await findExistingSession({
        bankAccountId: account.id,
        sourceFileHash: normalized.sourceFileHash,
      });

      if (existing?.status === "committed") {
        committedConflict = existing;
        return;
      }
      if (existing?.status === "preview") {
        toast.success(m.bank_upload_resumed());
        onSessionReady(existing);
        return;
      }

      const session = await openImportSession({
        bankAccountId: account.id,
        sourceFilename: file.name,
        sourceFileHash: normalized.sourceFileHash,
        detectedKind: detected,
      });

      await insertPreviewRows(session.id, normalized.rows);
      onSessionReady(session);
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
      detectedBankLabel = null;
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

      const params = new URLSearchParams({
        startYear: String(startYear),
        startMonth: String(startMonth),
        endYear: String(endYear),
        endMonth: String(endMonth),
      });
      await goto(`/transactions?${params.toString()}`);
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
</script>

<div class="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur">
  <label
    class={cn(
      "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
      dragOver ? "border-emerald-400 bg-emerald-400/5" : "border-white/10"
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

  {#if busy}
    <p class="text-sm text-slate-400">{m.bank_upload_parsing()}</p>
  {/if}

  {#if detectedBankLabel && !error}
    <p
      class="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
    >
      {m.bank_upload_detected({ bank: detectedBankLabel })}
    </p>
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
          date: committedConflict.committed_at?.slice(0, 10) ?? "—",
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
