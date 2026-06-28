# Spec 3 — Coachmarks

Date: 2026-06-28  
Status: Implemented  
Depends on: Spec #1 (onboarding checklist), Spec #2 (instrumentation)

## Goal

Lightweight first-visit hints on key routes — complementary to the dashboard
checklist, not a product tour framework.

## Decisions

| Topic | Decision |
| --- | --- |
| State | `localStorage` keys `coachmark:{id}`; legacy `plans-hub-onboarding` still read |
| Overlap | Coachmarks hide when route-specific condition no longer applies; checklist stays dashboard-only |
| UI | `CoachmarkBanner` — same emerald callout as plans hub hint |
| Analytics | No new events (dismiss is low-signal) |

## Surfaces

| ID | Route | Show when |
| --- | --- | --- |
| `plans_hub` | `/plans` | No active plans and not dismissed |
| `transactions_import` | `/transactions` | Zero transactions and not dismissed |

## Out of scope

- Anchored popovers / spotlight tours
- Server-backed dismiss state
- Spec #4 Capacitor, Spec #5 rebrand cutover
