-- Phase 12+: bank CSV import table grants.
--
-- The initial schema granted table-level DML to authenticated for tables that
-- existed at that time. These import tables were added later, so PostgREST
-- rejected requests before RLS could run (42501). Keep RLS as the row-level
-- boundary, but add the required table privileges explicitly.

grant select, insert on table bank_accounts to authenticated;

grant select, insert on table transaction_import_sessions to authenticated;

grant select, insert on table transaction_import_rows to authenticated;

-- Provenance links stay RPC-write-only. The review UI and duplicate scanner
-- only need owner-scoped reads.
grant select on table transaction_import_links to authenticated;

grant select, insert, delete on table categorization_rules to authenticated;
grant usage on type categorization_rule_kind to authenticated;
