# ADR 0009 - No Realtime - staleTime polling is enough

**Status:** Accepted (2026-04, Phase 4)

## Context

Firestore had `onSnapshot` - a streaming listener that pushed updates to clients in real time. The legacy app **did not use it**: data was fetched via TanStack Query with explicit refetches, not via streaming subscriptions. There was no live-collaboration use case to justify the extra cost.

Supabase has Realtime (logical replication → WebSocket fan-out), which is the structural equivalent. Re-enabling streaming subscriptions on the new stack would be a deliberate addition, not a port.

## Decision

**No Realtime subscriptions in application code.** Reads are served from TanStack Query's cache with `staleTime: 5 min` plus `refetchOnReconnect: true`. The user sees fresh data on:

- first paint (cold cache),
- reconnection from offline,
- explicit invalidation after a mutation,
- five minutes of staleness elapsing while a relevant query is mounted.

## Consequences

**Good**

- One transport (PostgREST). No WebSocket connection to manage, no reconnect logic, no per-table subscription bookkeeping.
- Smaller client bundle. Realtime client adds tens of KB.
- Lower Supabase load. Realtime publications cost CPU and network on every relevant write.
- Simpler offline story. The only reconnection event we care about is "did the user come back online?" - TanStack Query already handles that.

**Bad**

- Two browsers belonging to the same user (e.g. desktop + phone) do not see each other's changes until staleTime expires or a refetch fires. For a personal-finance PWA used by one person at a time, this is fine. For shared-group editing (two users editing the same shopping list simultaneously), the lag matters more - but in practice each user mostly edits in their own window and our consistency is "eventually-correct within ~5 minutes".
- Notifications appear in the bell on the next refetch, not instantly. Push covers the urgent path.

**Neutral**

- We can add Realtime to one specific feature in the future without changing this decision globally - e.g. shared shopping list collaboration, if it ever becomes a problem.

## Alternatives considered

- **Realtime everywhere (mirror Firestore's `onSnapshot`).** Higher coupling, more failure modes, no win for the actual use case.
- **Realtime on a single table (e.g. `notifications`).** Could deliver in-app bell updates without a refetch. Not worth the WebSocket mechanics yet; web-push already covers the "must arrive even if tab is closed" path. Reconsider if push permission denial becomes a common case.
- **Server-sent events.** Same complexity bracket as Realtime, less standard on the Supabase stack.
