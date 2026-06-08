-- Optional merchant / counterparty name on committed transactions (import + manual).
alter table public.transactions
  add column if not exists counterparty text;

comment on column public.transactions.counterparty is
  'Optional payee or merchant name (kontrahent), separate from free-text description.';
