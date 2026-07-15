-- Historical weekly digests predate the counts-only privacy contract and may
-- retain exact global and per-user financial amounts in body/data JSON.
-- These operational summaries are disposable, so remove them instead of
-- attempting to redact an open-ended legacy payload.
delete from public.notifications
where type = 'transaction_summary';
