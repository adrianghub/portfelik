-- P0-4A: atomic net-worth save — financial_snapshots + private cash_positions +
-- net_worth_items in one transaction. Orphan item deletes run last.

create or replace function public.save_net_worth_snapshot(
  p_as_of_date date,
  p_opening_amount numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_id uuid;
  v_label text;
  v_amount numeric;
  v_currency text;
  v_position int := 0;
  v_kept_ids uuid[] := array[]::uuid[];
  v_seen_ids uuid[] := array[]::uuid[];
  v_snapshot public.financial_snapshots;
  v_cash public.cash_positions;
  v_row public.net_worth_items;
  v_saved_items jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_as_of_date is null then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;

  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items_payload' using errcode = 'P0001';
  end if;

  -- Validate every non-blank item before any mutation.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_label := nullif(btrim(v_item->>'label'), '');
    if v_label is null then
      continue;
    end if;

    if char_length(v_label) > 60 then
      raise exception 'invalid_item_label' using errcode = 'P0001';
    end if;

    begin
      v_amount := (v_item->>'amount')::numeric;
    exception
      when others then
        raise exception 'invalid_amount' using errcode = 'P0001';
    end;
    if v_amount is null or v_amount < 0 then
      raise exception 'invalid_amount' using errcode = 'P0001';
    end if;

    v_currency := upper(btrim(coalesce(v_item->>'currency', '')));
    if v_currency = ''
       or v_currency !~ '^[A-Z]{3}$'
       or v_currency not in ('PLN', 'EUR', 'USD', 'GBP', 'CHF') then
      raise exception 'invalid_currency' using errcode = 'P0001';
    end if;

    if v_item ? 'id' and nullif(btrim(v_item->>'id'), '') is not null then
      begin
        v_id := (v_item->>'id')::uuid;
      exception
        when others then
          raise exception 'item_not_owned' using errcode = 'P0001';
      end;

      if v_id = any(v_seen_ids) then
        raise exception 'duplicate_item_id' using errcode = 'P0001';
      end if;
      v_seen_ids := array_append(v_seen_ids, v_id);

      if not exists (
        select 1 from public.net_worth_items
        where id = v_id and user_id = v_uid
      ) then
        raise exception 'item_not_owned' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  insert into public.financial_snapshots (
    user_id, as_of_date, cash_amount, investments_amount, real_estate_amount
  ) values (
    v_uid, p_as_of_date, 0, 0, 0
  )
  on conflict (user_id) do update set
    as_of_date = excluded.as_of_date,
    cash_amount = 0,
    investments_amount = 0,
    real_estate_amount = 0,
    updated_at = now()
  returning * into v_snapshot;

  insert into public.cash_positions (
    owner_id, group_id, opening_amount, as_of_date
  ) values (
    v_uid, null, p_opening_amount, p_as_of_date
  )
  on conflict (owner_id) do update set
    opening_amount = excluded.opening_amount,
    as_of_date = excluded.as_of_date,
    updated_at = now()
  returning * into v_cash;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_label := nullif(btrim(v_item->>'label'), '');
    if v_label is null then
      continue;
    end if;

    v_amount := greatest(0, (v_item->>'amount')::numeric);
    v_currency := upper(btrim(v_item->>'currency'));

    if v_item ? 'id' and nullif(btrim(v_item->>'id'), '') is not null then
      v_id := (v_item->>'id')::uuid;
      update public.net_worth_items set
        label = v_label,
        amount = v_amount,
        currency = v_currency,
        position = v_position,
        updated_at = now()
      where id = v_id and user_id = v_uid
      returning * into v_row;
    else
      insert into public.net_worth_items (
        user_id, label, amount, currency, position
      ) values (
        v_uid, v_label, v_amount, v_currency, v_position
      )
      returning * into v_row;
      v_id := v_row.id;
    end if;

    v_kept_ids := array_append(v_kept_ids, v_id);
    v_saved_items := v_saved_items || jsonb_build_array(to_jsonb(v_row));
    v_position := v_position + 1;
  end loop;

  delete from public.net_worth_items
  where user_id = v_uid
    and (
      cardinality(v_kept_ids) = 0
      or id <> all(v_kept_ids)
    );

  return jsonb_build_object(
    'snapshot', to_jsonb(v_snapshot),
    'cash_position', to_jsonb(v_cash),
    'items', v_saved_items
  );
end;
$$;

comment on function public.save_net_worth_snapshot(date, numeric, jsonb) is
  'Atomically saves private net-worth: as-of date, cash anchor, and asset items.';

revoke all on function public.save_net_worth_snapshot(date, numeric, jsonb) from public, anon;
grant execute on function public.save_net_worth_snapshot(date, numeric, jsonb) to authenticated;
