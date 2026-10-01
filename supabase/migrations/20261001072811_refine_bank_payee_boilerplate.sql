-- mBank prefixes card purchases with ZAKUP TOWARÓW I USŁUG.
-- These words describe the operation, not the merchant identity.
create or replace function public.import_obligation_payee_matches(a text, b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with sides as (
    select side, token, ord
      from (values (1, a), (2, b)) input(side, label)
      cross join lateral regexp_split_to_table(
        translate(lower(coalesce(label, '')), 'ąćęłńóśźżäöü', 'acelnoszzaou'),
        '[^[:alnum:]]+'
      ) with ordinality words(token, ord)
     where length(token) >= 4
       and token !~ '^[0-9]+$'
       and token <> all(array[
         'platnosc', 'platnosci', 'karta', 'karty', 'blik',
         'przelew', 'przelewy', 'przelewem', 'transakcja', 'transakcje',
         'zakup', 'zakupy', 'towarow', 'towary', 'uslug', 'elixir', 'operacja', 'operacji',
         'wplata', 'wyplata', 'obciazenie', 'uznanie', 'tytul', 'tytulem',
         'konto', 'rachunek', 'rachunku', 'platnicza', 'platnicze',
         'visa', 'mastercard', 'master', 'card', 'payment', 'debit', 'credit',
         'terminal', 'oplata', 'oplaty', 'polska', 'poland',
         'spolka', 'akcyjna', 'limited', 'uslugi'
       ])
  ), identities as (
    select distinct on (side) side, token
      from sides
     order by side, ord
  )
  select coalesce(
    (select token from identities where side = 1)
    = (select token from identities where side = 2),
    false
  );
$$;

revoke all on function public.import_obligation_payee_matches(text, text)
  from public, anon, authenticated, service_role;

