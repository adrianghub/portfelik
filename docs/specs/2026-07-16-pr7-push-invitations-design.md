# PR7 — Push notifications and invitation continuation

**Date:** 2026-07-16  
**Status:** implemented locally

## Problems

1. Push upsert errors ignored; settings “active” from browser sub alone.
2. PWA install pruned other mobile devices by user-agent.
3. Visible-but-unfocused tabs suppressed both OS notification and toast.
4. Quick-settle marked notifications read before settlement succeeded.
5. Magic-link Auth `redirectTo` omitted invite path → other devices lost continuation.
6. Wrong-email invite page had no switch-account path.

## Direction

- Upsert throws; active = browser subscription ∩ server row.
- Stop UA-based multi-device prune.
- SW suppresses OS notification only when a **focused** client exists (not merely visible).
- Mark notification read in settle `onSuccess` only; popover settle click does not pre-mark.
- Auth access links use `/auth/callback?redirectTo=/invite/{token}`; invite page OAuth matches.
- Authenticated invite page offers sign-out to switch accounts.

## Deferred (YAGNI)

- Durable push delivery retry queue / delivery table.
- Stable device_id column (only if prune returns in a narrower form).
