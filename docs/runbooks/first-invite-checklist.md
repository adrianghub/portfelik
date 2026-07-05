# First invite checklist (Phase 5)

Last updated: 2026-06-29

Operator runbook before inviting the first test couple (50/50 single/couple
cohort). Derived from the core hardening roadmap Phase 0–5 gates; see
[CLAUDE.md](../../CLAUDE.md) for current project state.

## Pre-invite gates

Complete every section below (or document an explicit accepted risk) before
sending the first invite.

### 1. JakStoimy cutover (Phase 0)

See [jakstoimy-rebrand-cutover-checklist.md](../specs/2026-06-28-jakstoimy-rebrand-cutover-checklist.md).

- [ ] Production deploy workflow landed on `main`; prod deploy run green
- [ ] PWA icons locked from design system → `static/`
- [ ] Staging dress rehearsal: OAuth + PWA install on staging URL
- [ ] Google OAuth consent + redirect URIs for `app.jakstoimy.pl`
- [ ] DNS: `app.jakstoimy.pl` → Cloudflare Pages project `jakstoimy`; legacy domain 301
- [ ] Supabase auth email templates + push notification titles updated
- [ ] Prod migration audit: cloud applied through latest on `dev` (debt-engine, cash-position, spend removal, action dismissals, recurring, Cele categories)
- [ ] Post-cutover smoke: login (Google + seeded email on staging), PWA install, push opt-in

### 2. Financial trust fixes (Phase 1)

From [PRODUCT_REVIEW_2026-06-09.md](../PRODUCT_REVIEW_2026-06-09.md) — or accept documented risk:

- [ ] Surplus/debt assumption guards or explicit estimate copy in UI
- [ ] Save-pace distinguishes recurring vs one-off contributions
- [ ] Debt payment consolidation deterministic for mixed dated/undated links
- [ ] Planning queue ranks by severity, not raw `monthlyNeeded`
- [ ] Unit specs cover misleading branches (not just happy path)

### 3. Staging smoke + personas

- [ ] Latest `dev` push: `migrate-staging` + `deploy-staging` + smoke job green
- [ ] `pnpm seed:staging` personas verified (smoke user, demo user, `admin@portfelik.test` / `user@portfelik.test`)
- [ ] Staging browser network calls hit staging Supabase URL (not prod)
- [ ] Smoke data tagged `__e2e_smoke__` cleans up idempotently

### 4. Readiness instrumentation (Plausible)

See [plausible-instrumentation-design.md](../specs/2026-06-28-plausible-instrumentation-design.md).

- [ ] GH secrets set: `STAGING_PUBLIC_PLAUSIBLE_DOMAIN`, `PUBLIC_PLAUSIBLE_DOMAIN` (`app.jakstoimy.pl`)
- [ ] Plausible custom-event goals created for milestone events (`onboarding_started`, `first_import_committed`, `first_plan_created`, `first_settlement_linked`, `demo_loaded`, etc.)
- [ ] Staging/prod pageviews and at least one milestone event verified in Plausible dashboard
- [ ] In-app onboarding checklist live (Spec #1 — no coachmarks required)

### 5. Invite couple + observe

- [ ] Pick single-user and couple cohort (one pair with group invite path)
- [ ] Send invite with privacy-policy date and JakStoimy copy
- [ ] Disable public sign-up remains enforced (invite-only access)

**Observe during first 7–14 days:**

| Signal | Where to watch |
| --- | --- |
| Import cadence | Plausible `first_import_committed`; onboarding checklist completion |
| Plan creation / settlement | `first_plan_created`, `first_settlement_linked`; `/plans` settle flow |
| Group invite friction | Support notes; invite→accept path if couple cohort |
| Dashboard action noise | `action_dismissals` patterns; dismiss/snooze on Pulpit actions |
| Demo usage | `demo_loaded` / `demo_cleared` among zero-data users |

**Beta targets** (define/refine after first week — from onboarding spec):

- ≥60% of invited users complete import within 7 days
- ≥40% create or link a plan within 14 days

## Exit criteria

Prod serves `app.jakstoimy.pl` with OAuth and Plausible live; staging smoke
green; trust fixes landed or risk accepted in writing; first couple invited with
metrics dashboard open.

## Related docs

- [env-workflow.md](../architecture/env-workflow.md) — tier map
- [mvp-hardening.md](../product/mvp-hardening.md) — launch baseline
- [ops-access-lockdown.md](./ops-access-lockdown.md) — Layer 2 access roster
