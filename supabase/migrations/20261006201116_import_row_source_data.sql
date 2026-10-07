-- Decoded source cells stay private under the existing owner-only import RLS.
-- Existing imports have no source snapshot; do not reconstruct one from edits.
alter table public.transaction_import_rows add column source_data jsonb;

create function public.valid_import_source_data(data jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  cell jsonb;
begin
  if data is null then return true; end if;
  if jsonb_typeof(data) <> 'object'
     or jsonb_typeof(data -> 'columns') is distinct from 'array'
     or octet_length(data::text) > 1048576 then
    return false;
  end if;
  if jsonb_array_length(data -> 'columns') > 128 then return false; end if;
  for cell in select value from jsonb_array_elements(data -> 'columns') loop
    if jsonb_typeof(cell) <> 'object'
       or jsonb_typeof(cell -> 'label') is distinct from 'string'
       or jsonb_typeof(cell -> 'value') is distinct from 'string' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.valid_import_source_data(jsonb) from public, anon;
grant execute on function public.valid_import_source_data(jsonb) to authenticated, service_role;

alter table public.transaction_import_rows
  add constraint transaction_import_rows_source_data_shape
  check (public.valid_import_source_data(source_data));

-- Table-level SELECT/INSERT grants cover this column. UPDATE remains restricted
-- to the existing review decision columns, so source_data cannot be edited even
-- before commit. No grants or owner-only policies are broadened here.
comment on column public.transaction_import_rows.source_data is
  'Original decoded bank column labels and values. Private immutable client provenance; null for older imports.';
