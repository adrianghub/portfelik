---
description: Hard-won SvelteKit + Supabase gotchas for apps/web-svelte. Loaded automatically when working on Svelte files.
paths:
  - "apps/web-svelte/**"
---

# Svelte + Supabase Gotchas

1. **`createMutation` is NOT a Svelte store.** `createQuery()` returns store-compatible (use `query.data` directly). `createMutation()` returns a plain reactive object — NO `.subscribe`. Always: `mutation.mutate(...)`, `mutation.isPending`, `mutation.isError`.

2. **Paraglide: manual recompile after every pl.json edit.** `svelte-check`/`tsc` see the old generated file until: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide` (from `apps/web-svelte/`).

3. **PostgREST insert requires ALL NOT NULL columns.** Pass `user_id: user.id` explicitly from `supabase.auth.getUser()`. RLS does NOT auto-set it.

4. **`complete_shopping_list` RPC returns a `transactions` row** (not void). Invalidate `shopping_list`, `transactions`, and `summary` query keys on success.

5. **Group writes are ALL SECURITY DEFINER RPCs.** Direct writes to `user_groups`, `group_members`, `group_invitations` blocked by `using (false)`. Use RPCs in `services/groups.ts`.

6. **`$state()` reading a prop → `state_referenced_locally` warning.** Wrap in `untrack(() => ...)` for intentional one-time init. For re-sync on dialog reopen: use `$effect(() => { if (open) { reset fields } })`.

7. **`svelte-ignore` + ESLint `svelte/no-unused-svelte-ignore` conflict.** ESLint errors if `svelte-ignore X` doesn't suppress anything from *ESLint's* perspective, even if `svelte-check` warns. Do NOT add `svelte-ignore` preemptively.
   - For backdrop divs: `role="presentation"` (no svelte-ignore needed).
   - For clickable `<li>`/`<tr>`: use `role="button"` + `tabindex={condition ? 0 : undefined}` + `onkeydown` (Enter/Space) — then add `<!-- svelte-ignore a11y_no_noninteractive_tabindex -->` ONLY if svelte-check still warns.
   - For autofocus: `<!-- svelte-ignore a11y_autofocus -->` is fine (svelte-check warns, ESLint agrees).

8. **`Uint8Array` type for VAPID key.** Use `new ArrayBuffer(n)` + `new Uint8Array(buffer)` and declare return type as `Uint8Array<ArrayBuffer>` explicitly.

9. **Supabase MCP lacks `ALTER DATABASE SET` privilege.** Use `apply_migration` for privileged DDL. Use Vault (`vault.create_secret`) for secrets — no superuser needed.

10. **Supabase Vault for trigger secrets.** `select decrypted_secret into v_key from vault.decrypted_secrets where name = 'internal_trigger_secret'`. Set `search_path = public, vault` on SECURITY DEFINER fns. Vault name: `internal_trigger_secret`.

11. **`group_invitations` RLS visible to invitee + creator + owner.** `fetchReceivedInvitations()` must filter `.eq('invited_user_email', user.email)`. Guard: `!user?.email`.

12. **`createCategory` and any user-owned table insert must pass `user_id` explicitly.** `NULL` = system category only.

13. **`void expr` in `$effect` tracks reactive dependency without lint error.** Bare `expr;` triggers `@typescript-eslint/no-unused-expressions`. Use `void query;` or `void someReactiveProp;` to force dependency tracking.

14. **`bind:this` on Svelte 5 component gets exported function handles.** Pattern for keyboard delegation:
    ```svelte
    let ref = $state<{ handleKeydown: (e: KeyboardEvent) => void } | null>(null);
    <Child bind:this={ref} />
    <input onkeydown={(e) => ref?.handleKeydown(e)} />
    ```
    Works for `export function` in the child's `<script>`.

15. **`fetchTransactions(start, end)` not `(year, month)`.** Signature changed 2026-04-29 — takes ISO date strings. Use `getDateRangeBounds(sy, sm, ey, em)` from `utils.ts` to produce `{start, end}`. `computeSummary(transactions)` computes summary client-side — no separate RPC call.
