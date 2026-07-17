# PR4D — Demo clear atomicity + mutateAsync confirm hygiene

**Date:** 2026-07-16  
**Status:** implemented locally

## Problem

1. Clearing demo data used sequential client deletes (plans → txs → net-worth). A mid-flight failure left stranded `Demo:` rows.
2. Several confirm dialogs closed before the mutation settled (`mutate` / fire-and-forget), so a failed clear/commit/sync left the UI looking done.

## Direction

- **`clear_demo_data()`** SECURITY INVOKER RPC: one transaction deletes the caller's `Demo:%` plans (cascade), transactions, and net-worth items. Seed stays client-side (YAGNI for a full seed RPC).
- Confirm UIs await `mutateAsync` (or Promise-returning callbacks) and close only on success: demo banner/walkthrough, import commit, debt sync, save-plan adjust.

## Out of scope

- Full atomic demo seed RPC
- Broad mutate→mutateAsync rewrite outside confirm/settle paths
