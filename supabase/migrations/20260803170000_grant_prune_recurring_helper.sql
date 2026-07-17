-- Fix: end/prune series RPCs are SECURITY INVOKER and call
-- _prune_recurring_occurrences_from. Migration 20260803050000 revoked PUBLIC
-- execute without granting authenticated, so callers hit 42501.

grant execute on function public._prune_recurring_occurrences_from(uuid, date)
  to authenticated, service_role;
