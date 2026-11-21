-- Push-Benachrichtigungen für Kunden (freiwillig, mit Einwilligung im Browser).
-- Gespeichert werden nur die technischen Daten eines Push-Abos (Endpunkt und Schlüssel).
-- Der Browser darf die Tabelle nicht direkt lesen oder schreiben, alles läuft über Funktionen.

create table if not exists public.loyalty_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.loyalty_cards(id) on delete cascade,
  endpoint   text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh_key text not null check (char_length(p256dh_key) between 1 and 200),
  auth_key   text not null check (char_length(auth_key) between 1 and 100),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists loyalty_push_subscriptions_card_idx
  on public.loyalty_push_subscriptions (card_id);

alter table public.loyalty_push_subscriptions enable row level security;
revoke all on public.loyalty_push_subscriptions from anon, authenticated;

-- Kunde (mit geheimem Kartenlink): Push-Abo speichern. Höchstens 5 Geräte pro Karte.
create or replace function public.save_push_subscription(
  p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_card uuid;
begin
  select c.id into v_card
  from public.loyalty_cards c
  where c.secret_hash = public.loyalty_hash(coalesce(p_token, '')) and c.status = 'active';
  if v_card is null then
    return jsonb_build_object('ok', false, 'error', 'card_not_found');
  end if;

  if p_endpoint is null or p_endpoint not like 'https://%' or char_length(p_endpoint) > 1000
     or coalesce(char_length(p_p256dh), 0) not between 1 and 200
     or coalesce(char_length(p_auth), 0) not between 1 and 100 then
    return jsonb_build_object('ok', false, 'error', 'invalid_subscription');
  end if;

  insert into public.loyalty_push_subscriptions (card_id, endpoint, p256dh_key, auth_key)
  values (v_card, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set card_id = excluded.card_id, p256dh_key = excluded.p256dh_key, auth_key = excluded.auth_key;

  delete from public.loyalty_push_subscriptions
  where card_id = v_card
    and id not in (select id from public.loyalty_push_subscriptions
                   where card_id = v_card order by created_at desc limit 5);

  return jsonb_build_object('ok', true);
end;
$$;

-- Kunde: Push-Abo wieder löschen.
create or replace function public.remove_push_subscription(p_token text, p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  delete from public.loyalty_push_subscriptions s
  using public.loyalty_cards c
  where s.card_id = c.id
    and c.secret_hash = public.loyalty_hash(coalesce(p_token, ''))
    and s.endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end;
$$;

-- Inhaber: Empfänger und Kartenstand für eine eigene Karte (für den Versand nach dem Stempeln).
create or replace function public.get_push_targets(p_card_id uuid)
returns table (endpoint text, p256dh_key text, auth_key text, business_name text,
               program_name text, reward text, stamps integer, stamps_required integer,
               last_stamp_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    select s.endpoint, s.p256dh_key, s.auth_key, bp.name, lp.name, lp.reward,
           c.stamps, lp.stamps_required, c.last_stamp_at
    from public.loyalty_cards c
    join public.loyalty_programs lp on lp.id = c.program_id
    join public.businesses b on b.id = lp.business_id
    join public.business_profiles bp on bp.business_id = b.id
    join public.loyalty_push_subscriptions s on s.card_id = c.id
    where c.id = p_card_id and b.owner_id = auth.uid();
end;
$$;

-- Inhaber: abgelaufenes Abo (Gerät hat es widerrufen) entfernen.
create or replace function public.prune_push_subscription(p_card_id uuid, p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  delete from public.loyalty_push_subscriptions s
  using public.loyalty_cards c, public.loyalty_programs lp, public.businesses b
  where s.card_id = c.id and c.id = p_card_id and lp.id = c.program_id
    and b.id = lp.business_id and b.owner_id = auth.uid() and s.endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon, authenticated;
revoke all on function public.remove_push_subscription(text, text)          from public, anon, authenticated;
revoke all on function public.get_push_targets(uuid)                        from public, anon, authenticated;
revoke all on function public.prune_push_subscription(uuid, text)           from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to anon, authenticated;
grant execute on function public.remove_push_subscription(text, text)          to anon, authenticated;
grant execute on function public.get_push_targets(uuid)                        to authenticated;
grant execute on function public.prune_push_subscription(uuid, text)           to authenticated;
