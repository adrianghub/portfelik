-- Generic payment words are not a merchant. "Płatność kartą Lidl" and
-- "Płatność kartą Orange" share only boilerplate, so they must not fold
-- inside the ±3 day window. A match needs a shared token that names the payee.

create or replace function public.import_payee_similar(a text, b text)
returns boolean
language plpgsql
immutable
as $$
declare
  left_tokens text[];
  right_tokens text[];
  token text;
  stop text[] := array[
    'platnosc', 'platnosci', 'karta', 'karty', 'blik',
    'przelew', 'przelewy', 'przelewem', 'transakcja', 'transakcje',
    'zakup', 'zakupy', 'elixir', 'operacja', 'operacji',
    'wplata', 'wyplata', 'obciazenie', 'uznanie', 'tytul', 'tytulem',
    'konto', 'rachunek', 'rachunku', 'platnicza', 'platnicze',
    'visa', 'mastercard', 'master', 'card', 'payment', 'debit', 'credit',
    'terminal'
  ];
begin
  left_tokens := regexp_split_to_array(
    translate(lower(coalesce(a, '')), 'ąćęłńóśźżäöü', 'acelnoszzaou'),
    '[^[:alnum:]]+'
  );
  right_tokens := regexp_split_to_array(
    translate(lower(coalesce(b, '')), 'ąćęłńóśźżäöü', 'acelnoszzaou'),
    '[^[:alnum:]]+'
  );
  if left_tokens is null then
    return false;
  end if;
  foreach token in array left_tokens loop
    if length(token) >= 4
       and not (token = any(stop))
       and token = any(right_tokens) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

revoke all on function public.import_payee_similar(text, text) from public, anon, authenticated;
