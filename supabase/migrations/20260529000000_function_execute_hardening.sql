-- Function execution hardening
--
-- Closes prod advisor findings (verified 2026-05-24):
--   * `anon_security_definer_function_executable`     (30 fns)
--   * `authenticated_security_definer_function_executable` for non-client fns
--   * `function_search_path_mutable`                  (7 fns)
--
-- Strategy (belt-and-suspenders, order matters):
--   1. Blanket REVOKE EXECUTE FROM PUBLIC, anon on every public function.
--   2. Explicit REVOKE FROM authenticated on trigger/cron/internal-only fns
--      (removes any *direct* grant the blanket step in 1 cannot reach).
--   3. Explicit GRANT TO authenticated on the client-callable + RLS-helper
--      allow-list (re-establishes access in case the only grant was via PUBLIC,
--      which step 1 just removed).
--   4. Pin search_path on the 7 mutable functions.
--
-- Trigger functions do NOT require an EXECUTE grant on the session role to fire
-- during a user statement (they run in the table-owner context). Cron functions
-- run as the job owner. So both are safe to fully revoke from clients.
--
-- Idempotent: REVOKE/GRANT/ALTER FUNCTION ... SET are all repeatable.

-- ---------------------------------------------------------------------------
-- 1. Blanket revoke: no public function is callable by anon (or via PUBLIC).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Revoke trigger/cron/internal-only functions from authenticated.
--    These are never invoked via PostgREST /rpc/ by the client.
-- ---------------------------------------------------------------------------
revoke execute on function public.bump_last_used_at() from authenticated;
revoke execute on function public.enforce_list_group_id_owner_only() from authenticated;
revoke execute on function public.enforce_max_user_cap() from authenticated;
revoke execute on function public.enforce_tx_group_id_owner_only() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.handle_updated_at() from authenticated;
revoke execute on function public.handle_user_email_update() from authenticated;
revoke execute on function public.notify_on_group_invitation() from authenticated;
revoke execute on function public.notify_on_role_change() from authenticated;
revoke execute on function public.set_shopping_list_completed_at() from authenticated;
revoke execute on function public.trigger_send_push() from authenticated;
revoke execute on function public.trigger_sync_user_role() from authenticated;
revoke execute on function public.process_recurring_transactions() from authenticated;
revoke execute on function public.update_transaction_statuses() from authenticated;
revoke execute on function public.trigger_send_admin_summary() from authenticated;
revoke execute on function public._setting(text) from authenticated;
revoke execute on function public.edge_functions_base_url() from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Re-grant the client-callable + RLS-helper allow-list to authenticated.
--    Client RPCs are the set found via `.rpc(...)` in the SvelteKit app, plus
--    transfer_group_ownership + get_monthly_summary (defensive: referenced in
--    generated types, owner-checked internally, own-user scoped) and the three
--    RLS helper functions used inside policy expressions.
-- ---------------------------------------------------------------------------
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.assign_admin_role(uuid) to authenticated;
grant execute on function public.attach_shopping_list_to_transaction(uuid, uuid) to authenticated;
grant execute on function public.cancel_invitation(uuid) to authenticated;
grant execute on function public.commit_import_session(uuid) to authenticated;
grant execute on function public.complete_shopping_list(uuid, numeric, uuid) to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.delete_account() to authenticated;
grant execute on function public.delete_admin_push_subscription(text) to authenticated;
grant execute on function public.disband_group(uuid) to authenticated;
grant execute on function public.duplicate_shopping_list(uuid) to authenticated;
grant execute on function public.fetch_admin_notifications(integer) to authenticated;
grant execute on function public.fetch_admin_push_subscriptions() to authenticated;
grant execute on function public.invite_user(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.preview_fingerprint_warnings(uuid) to authenticated;
grant execute on function public.reject_invitation(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_admin_role(uuid) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.trigger_admin_summary() to authenticated;
grant execute on function public.get_monthly_summary(integer, integer) to authenticated;
-- RLS policy helpers - authenticated evaluates these inside USING/WITH CHECK.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Pin search_path on the 7 mutable functions (advisor: function_search_path_mutable).
-- ---------------------------------------------------------------------------
alter function public._setting(text) set search_path = public;
alter function public.bump_last_used_at() set search_path = public;
alter function public.enforce_list_group_id_owner_only() set search_path = public;
alter function public.enforce_tx_group_id_owner_only() set search_path = public;
alter function public.handle_updated_at() set search_path = public;
alter function public.mark_all_notifications_read() set search_path = public;
alter function public.mark_notification_read(uuid) set search_path = public;
