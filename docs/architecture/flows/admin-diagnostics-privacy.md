# Admin Diagnostics Privacy

**This is pseudonymisation + masking, NOT anonymisation.** A record retrievable
by ID and tied to an account is not anonymous. The goal: make re-identification
impossible from the admin/support surface alone — not against a DB superuser or
a leaked pepper.

## What this is — and is not

This is **privacy Layer 1 of 3: masked admin/support diagnostics.** It is NOT
database encryption and NOT operational access lockdown. Frame it accurately:

> Support and admin diagnostics are privacy-preserving: sensitive financial
> details are masked and records are correlated with pseudonymous tokens. Raw
> financial data is not exposed in admin tools.

Do **not** market this as "database data is encrypted from admins." Anyone with
Supabase project-owner access or direct DB credentials can still read raw tables
— that is Layer 2/3 territory (below).

## Three privacy layers

1. **Masked admin access — DONE (this work).** Admin tools use masked RPCs, not
   raw table reads. Solves: normal admin UI / support diagnostics no longer
   expose raw financial data.
2. **Operational access lockdown — NOT in this work (operational).** Admins
   should not have routine SQL/dashboard access to raw production tables. Solved
   operationally, not in code: limit Supabase project access, no shared
   service-role keys, audit admin access, least privilege, and do not build raw
   lookup admin screens.
3. **Sensitive-column encryption — FUTURE (separate track).** Store the
   highest-risk values encrypted so even direct DB reads show ciphertext without
   the key. Deliberately deferred — see roadmap below.

## Model

- Admins look up transactions, import sessions, and user context **by ID** via
  three `security definer` RPCs (`admin_masked_*`), each guarded by `is_admin()`.
- Correlation uses keyed HMAC tokens computed on-read: `privacy_hmac_token(value,
context)` = `hex(hmac(context || ':' || lower(trim(value)), privacy_pepper,
'sha256'))`. The pepper lives in Supabase Vault and never reaches the client.
- **Context separation:** fixed contexts (`user`, `merchant`, `group`,
  `category`, `email`, `import_source`) prevent the same string correlating
  across field types.
- Amounts are bucketed (`< 50 / 50-200 / 200-1000 / > 1000 PLN`); descriptions,
  names, labels are masked (`[masked]`); emails masked (`a***@domain`).
- `privacy_hmac_token` **fails closed**: it raises if the pepper is missing and
  rejects unknown contexts. Helper functions are revoked from all client roles
  (`public, anon, authenticated, service_role`) — callable only by the
  SECURITY DEFINER RPCs.

## Boundary

The masked RPCs are the only deliberate admin cross-user financial path. No
`is_admin()` bypass RLS exists on `transactions` / import tables. `fetch_admin_notifications`
is masked (title/body → `[masked]`) and returns `user_token`, not raw `user_id`.

## Threat model

In scope: stop routine admin/support UI from exposing raw financial/personal
data; make masked records irreversible without the pepper; allow by-ID debugging

- stable pseudonymous correlation.

Out of scope: production DB superuser, leaked pepper, full client-side
encryption, reversible admin decryption.

## Encryption roadmap (future — Layer 3)

Do **not** jump to full column encryption for MVP. It affects search, filtering,
categorization, imports, duplicate detection, debugging, backups, migrations, and
support. Portfelik's deterministic categorization and import matching need
readable descriptions/counterparties somewhere; encrypting those naively breaks
core product logic. Encrypt selectively, highest-risk fields first, and only
after designing search/categorization around it.

**Candidates to encrypt first** (low product-logic coupling):

- `transaction_import_sessions.source_filename`
- `bank_accounts.label`
- raw import-row payloads / descriptions if retained
- notification `title` / `body` when they can contain amounts or merchants
- `transactions.description` — only after redesigning search/categorization around it

**Do NOT encrypt first** (needed for summaries, dashboards, filtering, reports,
RLS): `amount`, `date`, `type`, `status`, `category_id`, `user_id`.

**Sequencing:** keep the masked admin RPCs (Layer 1) → publish the privacy
statement above → lock down operational production-DB access (Layer 2) → then
selectively encrypt the highest-risk fields (Layer 3). Treat Layer 3 as a
separate, deeper security track, not an MVP blocker.

## Beta trust posture

Honest trust level for using **real** transaction/import data:

- **OK for:** the owner, close collaborators, trusted early testers — people who
  understand this is beta software.
- **Not yet ideal for:** broad public onboarding of highly privacy-sensitive
  users, until privacy policy, access controls, operational process,
  deletion/export, and incident posture are all clear.

**The app is NOT end-to-end encrypted.** Raw data exists in the production
database because the product needs it for imports, categorization, summaries,
dashboards, and future plan matching. A database owner / service-role holder /
production operator can technically access it. Protection is account-level
access control + privacy-preserving admin tooling + operational restriction —
**not** cryptographic hiding from the operator.

User-facing wording to use (do not overpromise "no one can ever see your data"):

> Your data is protected by account-level access controls. Admin/support tools
> are privacy-preserving and show masked diagnostic data. Raw financial data is
> not exposed through normal admin screens. Production database access is
> restricted to operators who need it. The app is beta and not end-to-end
> encrypted.

### Pre-beta readiness checklist

- [x] RLS suite green (account-level isolation).
- [x] Admin UI shows no raw financial details (Layer 1, this work).
- [x] Users can delete their account/data (`delete_account()` RPC + Settings → Profile).
- [~] Production Supabase access limited to owner / essential operators (Layer 2). Runbook authored (`docs/runbooks/ops-access-lockdown.md`); **verify before public launch** — roster §1.
- [x] Service-role keys not exposed anywhere client-side. Audited 2026-06-05 — clean (no `service_role` in client `src`, no `PUBLIC_`-prefixed secret, example envs placeholder-only, CI passes keys via `${{ secrets.* }}`, no secret echoed to logs). Re-run procedure in the Layer-2 runbook §3.
- [x] Privacy policy states what is stored and who can access it (`docs/legal/privacy-policy.md` + in-app `/privacy` route).
- [ ] Full account-data export — **public launch blocker**. CSV transaction export exists; full export (categories, plans, groups, rules, import metadata) required before public launch.
- [x] Onboarding asks testers to upload only the history they need (`docs/product/beta-onboarding-note.md`).
- [x] Beta + "not end-to-end encrypted" communicated to testers (beta note + `/privacy` route + login-page notice).
