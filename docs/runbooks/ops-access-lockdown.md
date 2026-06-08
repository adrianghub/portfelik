# Operational access lockdown runbook (Layer 2)

Last updated: 2026-06-08

This is **Layer 2** of the three-layer privacy posture described in
`docs/architecture/flows/admin-diagnostics-privacy.md`:

- **Layer 1 - masked admin diagnostics** (shipped): admin/support tooling never
  shows raw financial data; HMAC pseudonymisation, bucketed amounts, masked
  descriptions/emails.
- **Layer 2 - operational access lockdown** (this doc): who can technically
  reach the production database/keys, what those keys are, where they live, and
  how access is revoked. This is process, not code.
- **Layer 3 - selective column encryption** (future track): cryptographic
  hiding of specific columns from the operator. Not in scope for beta.

> The app is **not** end-to-end encrypted. Raw data exists in the production DB
> because imports, categorization, summaries, dashboards, and plan matching need
> it. A database owner / service-role holder / production operator can
> technically read it. Layer 2 limits **who** that is and makes access auditable.

---

## 1. Access roster

Production project ref: `emqzcygfwcvbmhxhfkcc`.
Staging project ref: `portfelik-staging`.

| Principal                  | Scope        | Access level                                  | Justification                          | Review             |
| -------------------------- | ------------ | --------------------------------------------- | -------------------------------------- | ------------------ |
| Adrian Zinko (owner)       | prod+staging | Supabase org Owner                            | Sole maintainer/operator               | each review cycle  |
| GitHub Actions (CI/CD)     | prod+staging | Service-role via secrets, scoped access token | Migrations, seed, Edge Function deploy | on secret rotation |
| _(add collaborators here)_ | -            | -                                             | -                                      | -                  |

**Principle:** keep production human access to the owner plus only essential
operators. Every added human must appear in this table with a justification and
a review date. Prefer giving a collaborator **staging** access first; grant
production only when a task genuinely requires it.

### Supabase dashboard collaborators

- Audit current members: Supabase Dashboard → Organization → **Team / Members**
  (per project: Project Settings → Members).
- Remove anyone not in the roster above. Production should list the owner only
  unless a collaborator row exists here with justification.

---

## 2. Key & credential inventory

Application/push secrets and their rotation live in
`docs/runbooks/secret-rotation.md`. This section adds the **operational /
infrastructure** credentials that grant access rather than power a feature.

| Credential                              | Where it lives                                                                        | Grants                                      | Revoke / rotate                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Supabase **service-role** key (prod)    | GitHub Actions secrets; `apps/web-svelte/.env.cloud.local` (gitignored, opt-in debug) | Full RLS-bypass DB access                   | Dashboard → Project Settings → API → roll keys; update GH secret + local file |
| Supabase **service-role** key (staging) | GitHub Actions **Staging** secrets only (`STAGING_SUPABASE_SERVICE_ROLE_KEY`)         | Full RLS-bypass DB access on staging        | Staging project → API → roll; update GH Staging secret                        |
| Supabase **access token** (prod)        | GitHub Actions secrets (CLI auth for migrate/deploy)                                  | CLI/management API as the token owner       | Dashboard → Account → Access Tokens → revoke; reissue                         |
| Supabase **access token** (staging)     | GitHub Actions Staging secret (`STAGING_SUPABASE_ACCESS_TOKEN`)                       | CLI/management API on staging               | revoke + reissue as above                                                     |
| DB password (prod / staging)            | GitHub secrets (`*_SUPABASE_DB_PASSWORD`)                                             | Direct Postgres connection                  | Dashboard → Database → reset password; update secret                          |
| **anon / publishable** key              | `PUBLIC_SUPABASE_ANON_KEY` (build-time, shipped to client - by design)                | RLS-scoped client access only               | rolling invalidates clients; only on compromise                               |
| MCP connection secrets                  | `.mcp.json` server config (local), per-developer                                      | MCP server access to the configured project | rotate the underlying token it wraps                                          |

**Vault-stored secrets** (`internal_trigger_secret`, `privacy_pepper`,
`edge_functions_base_url`, `max_user_cap`, VAPID keys) are inventoried and
rotated in `docs/runbooks/secret-rotation.md`. The `privacy_pepper` is
security-critical: leaking it defeats Layer-1 admin masking.

---

## 2b. Supabase Auth hardening (dashboard toggles)

Operator-only; not enforced in app code.

| Toggle | Where | Prod | Staging |
| --- | --- | --- | --- |
| Leaked-password protection (HaveIBeenPwned) | Dashboard → Authentication → Providers → Email | Enable | Enable |

Low impact while Google OAuth is primary, but enable before inviting email/password beta users.

Re-run **Database → Advisors → Security** after migrations land; CI runs
`scripts/check-security-advisors.sh` (extensions-not-in-public) on every PR.

---

## 3. Service-role / client-exposure audit (Layer-2 gate)

Run before every beta-tester onboarding wave and after any change touching env
plumbing, CI, or the Supabase client. Last run: **2026-06-08 - clean** (launch certification).

```bash
# A. service_role must never appear in client src (server-only files excepted)
grep -rniE "service_role|service-role" apps/web-svelte/src \
  | grep -viE "\.server\.|/server/|hooks\.server"

# B. no JWT literals / secret prefixes committed (allowlisted local-demo keys in .gitleaks.toml are OK).
#    Excludes: lockfiles (base64 integrity hashes can contain "eyJ"), and the two docs that
#    quote these patterns verbatim (this runbook + CLAUDE.md) and would self-match.
git grep -nE "eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|sbp_[a-zA-Z0-9]{20,}" \
  -- . ':(exclude)*.lock' ':(exclude)pnpm-lock.yaml' \
  ':(exclude)docs/runbooks/ops-access-lockdown.md' ':(exclude)CLAUDE.md'

# C. SvelteKit only bundles PUBLIC_-prefixed env to the client → no PUBLIC_ secret
git grep -nE "PUBLIC_[A-Z_]*(SERVICE|SECRET|PRIVATE|ROLE_KEY)" -- . ':(exclude)*.lock'

# D. example env files must be placeholders only
grep -nE "eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|sbp_[a-zA-Z0-9]{20,}" \
  .env.local.example apps/web-svelte/.env.example apps/web-svelte/.env.test.example supabase/.env.example
```

Expected result: A/C/D empty; B only matches the allowlisted local-demo JWTs in
`.gitleaks.toml`. Anything else is a blocker - stop and remediate before
onboarding.

> Note: the per-change secret scan in `CLAUDE.md` (step 4) scans changed files
> directly, so it will flag this runbook (and `CLAUDE.md` itself) on the
> `sb_secret_` pattern text. Those are documented-example false positives -
> exclude both files when scanning, same as command B above.

**CI note:** the RLS-suite step writes `SUPABASE_SERVICE_ROLE_KEY` into
`$GITHUB_ENV` (not stdout), and that value is the **local** `supabase start`
demo key (publicly known), not a cloud secret. Real cloud keys flow only via
`${{ secrets.* }}`. No `set -x` or `cat .env` exposes secrets to logs.

---

## 4. Revocation procedures

**Offboard a human collaborator**

1. Supabase Dashboard → remove from Organization/Project members (prod first,
   then staging).
2. If they ever held a personal access token or the DB password, rotate those
   (§2) - membership removal does not invalidate already-issued tokens.
3. Remove them from the GitHub repo / Actions environment if applicable.
4. Update the roster table (§1) and note the date.

**Suspected credential compromise** (service-role, access token, DB password,
or `privacy_pepper`)

1. Treat as a full rotation event - follow `docs/runbooks/secret-rotation.md`
   for the affected secret, plus §2 here for infra credentials.
2. Roll the Supabase API keys (invalidates leaked service-role/anon).
3. Reset the DB password.
4. Revoke and reissue access tokens.
5. Update all GitHub secrets and `.env.cloud.local`.
6. Review recent DB activity for anomalous access.

---

## 5. Access review schedule

- **Cadence:** every release-promotion to production and before each new
  beta-tester wave.
- **Checklist:**
  - [ ] Roster (§1) matches actual Supabase members; no stragglers.
  - [ ] Production human access = owner + justified operators only.
  - [ ] §3 audit run and clean.
  - [ ] No service-role key or DB password in the client bundle, docs, examples,
        or CI logs.
  - [ ] Outstanding offboarding completed and tokens rotated.
- Record the date and result at the top of this file (`Last updated:` + a one
  line note), the same way `secret-rotation.md` does.
