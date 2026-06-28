# Spec 2 — Plausible instrumentation

Date: 2026-06-28  
Status: Implemented  
Depends on: Spec #1 (`lib/analytics.ts` event catalog)

## Goal

Wire the existing `track()` / `trackOnce()` stub to [Plausible](https://plausible.io/) custom events so beta readiness metrics from Spec #1 can be measured without PII.

## Decisions

| Topic | Decision |
| --- | --- |
| Provider | Plausible (cookieless, no consent banner required for basic pageview + custom events) |
| Enable flag | `PUBLIC_PLAUSIBLE_DOMAIN` — empty/unset = stub only (local dev, CI) |
| Staging | Operator sets `STAGING_PUBLIC_PLAUSIBLE_DOMAIN=dev.portfelik.pages.dev` (or separate Plausible site) |
| Production | `PUBLIC_PLAUSIBLE_DOMAIN=portfelik.adrianzinko.com` until domain cutover, then jakstoimy host |
| Props | All values stringified — Plausible custom prop requirement |
| Dedup | `trackOnce()` keeps localStorage keys from Spec #1 |

## Implementation

- `initPlausible()` in `lib/analytics.ts` — queue + inject `script.js` when domain set
- `+layout.svelte` `onMount` → `initPlausible()`
- Milestone hooks: `commitImportSession`, `createTransaction`, `createPlan`, `linkPlanTransaction`
- Privacy policy section: aggregate usage analytics, no cookies, no PII in event props
- `.env.example` + deploy workflows pass through optional domain secret

## Plausible dashboard goals (operator)

Create custom event goals matching `AnalyticsEvent` names:

- `onboarding_started`, `first_import_committed`, `first_transaction_created`, `first_plan_created`, `first_settlement_linked`
- `demo_loaded`, `demo_cleared`, `import_reminder_enabled`, `glossary_opened`, `pwa_installed`, `push_enabled`

Filter props: `source`, `kind`, `cadence_days`, `entry_id`, `row_count`, `step_count`.

## Out of scope

- Spec #3 coachmarks
- Spec #4 Capacitor
- Spec #5 domain/OAuth rebrand
