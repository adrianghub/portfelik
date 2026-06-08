-- Weekly admin summary: run daily and let send-admin-summary decide whether
-- today is a send day (Monday in Europe/Warsaw, or the day after an import
-- reminder for admins with import alerts enabled).

select cron.unschedule('send-admin-summary');

select cron.schedule(
  'send-admin-summary',
  '0 7 * * *',
  $$ select public.trigger_send_admin_summary(); $$
);

comment on function public.trigger_send_admin_summary() is
  'Daily dispatch hook for send-admin-summary. The Edge Function sends on Warsaw Mondays or the day after a bank_import_reminder.';
