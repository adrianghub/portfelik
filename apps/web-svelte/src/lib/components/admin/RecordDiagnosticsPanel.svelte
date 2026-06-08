<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import {
    fetchMaskedImportSession,
    fetchMaskedTransaction,
    fetchMaskedUserContext,
  } from "$lib/services/admin-diagnostics";

  type Kind = "transaction" | "session" | "user";
  let kind = $state<Kind>("transaction");
  let recordId = $state("");
  let result = $state<Record<string, unknown> | null>(null);
  let status = $state<"idle" | "loading" | "notfound" | "error">("idle");

  async function search() {
    if (!recordId.trim()) return;
    status = "loading";
    result = null;
    try {
      const data =
        kind === "transaction"
          ? await fetchMaskedTransaction(recordId.trim())
          : kind === "session"
            ? await fetchMaskedImportSession(recordId.trim())
            : await fetchMaskedUserContext(recordId.trim());
      if (!data) {
        status = "notfound";
        return;
      }
      result = data as unknown as Record<string, unknown>;
      status = "idle";
    } catch {
      status = "error";
    }
  }

  function isToken(key: string) {
    return key.endsWith("_token");
  }
</script>

<section
  class="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
  aria-labelledby="diag-record-heading"
>
  <h2 id="diag-record-heading" class="text-lg font-semibold">
    {m.admin_diag_record_title()}
  </h2>
  <p class="text-muted-foreground mt-1 text-sm">{m.admin_diag_record_hint()}</p>

  <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
    <label class="flex flex-col text-sm">
      <span class="sr-only">{m.admin_diag_record_id_label()}</span>
      <select bind:value={kind} class="rounded-md border px-2 py-2">
        <option value="transaction">{m.admin_diag_record_type_tx()}</option>
        <option value="session">{m.admin_diag_record_type_session()}</option>
        <option value="user">{m.admin_diag_record_type_user()}</option>
      </select>
    </label>
    <input
      bind:value={recordId}
      placeholder={m.admin_diag_record_id_label()}
      class="flex-1 rounded-md border px-3 py-2 font-mono text-sm"
      onkeydown={(e) => e.key === "Enter" && search()}
    />
    <button
      onclick={search}
      class="bg-primary text-primary-foreground rounded-md px-4 py-2"
      disabled={status === "loading"}
    >
      {m.admin_diag_record_search()}
    </button>
  </div>

  {#if status === "notfound"}
    <p class="text-muted-foreground mt-3 text-sm">{m.admin_diag_record_not_found()}</p>
  {:else if status === "error"}
    <p class="text-destructive mt-3 text-sm">{m.admin_diag_record_error()}</p>
  {:else if result}
    <dl class="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {#each Object.entries(result) as [key, value] (key)}
        <dt class="text-muted-foreground font-medium">{key}</dt>
        <dd class:font-mono={isToken(key)} class="break-all">
          {value === null ? "-" : String(value)}
        </dd>
      {/each}
    </dl>
  {/if}
</section>
