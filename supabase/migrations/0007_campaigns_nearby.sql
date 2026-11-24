-- Angebote (Kampagnen) und Nähe-Hinweis.
-- Grundsätze: Angebote gehen nur an Geräte, die sie ausdrücklich erlaubt haben (offers_opt_in).
-- Ruhezeiten (21 bis 8 Uhr, Europe/Berlin), höchstens 1 Angebot pro Programm und 24 Stunden,
-- höchstens 1 Angebot pro Gerät und 3 Tage. Der Standort der Kunden wird nie gespeichert.

alter table public.loyalty_push_subscriptions
  add column if not exists offers_opt_in    boolean not null default false,
  add column if not exists offers_opt_in_at timestamptz,
  add column if not exists last_offer_at    timestamptz;

alter table public.loyalty_programs
  add column if not exists nearby_enabled   boolean not null default false,
  add column if not exists nearby_lat       double precision check (nearby_lat between -90 and 90),
  add column if not exists nearby_lng       double precision check (nearby_lng between -180 and 180),
  add column if not exists nearby_radius_m  integer not null default 200 check (nearby_radius_m between 50 and 1000),
  add column if not exists nearby_text      text check (nearby_text is null or char_length(nearby_text) <= 120);

create table if not exists public.loyalty_campaigns (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.loyalty_programs(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  title       text not null check (char_length(title) between 1 and 50),
  body        text not null check (char_length(body) between 1 and 160),
  segment     text not null default 'all'
              check (segment in ('all', 'recent_30', 'inactive_30', 'inactive_60', 'almost_full', 'reward_ready')),
  valid_until timestamptz,
  status      text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  sent_count  integer not null default 0,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists loyalty_campaigns_program_idx on public.loyalty_campaigns (program_id, created_at desc);

alter table public.loyalty_campaigns enable row level security;

-- Öffentlich sichtbar: nur aktuelle, bereits gesendete Angebote veröffentlichter Profile, nur bestimmte Spalten.
drop policy if exists "Public read current offers" on public.loyalty_campaigns;
create policy "Public read current offers" on public.loyalty_campaigns
  for select to anon, authenticated
  using (
    status = 'sent'
    and (valid_until is null or valid_until > now())
    and sent_at > now() - interval '30 days'
    and exists (select 1 from public.loyalty_programs lp
                join public.business_profiles bp on bp.business_id = lp.business_id
                where lp.id = loyalty_campaigns.program_id and lp.is_active and bp.is_published)
  );
revoke all on public.loyalty_campaigns from anon, authenticated;
grant select (id, program_id, title, body, valid_until, status, sent_at) on public.loyalty_campaigns to anon, authenticated;

-- ---------------------------------------------------------------- Hilfsfunktionen

create or replace function public.loyalty_in_quiet_hours(p_ts timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select extract(hour from (p_ts at time zone 'Europe/Berlin')) < 8
      or extract(hour from (p_ts at time zone 'Europe/Berlin')) >= 21;
$$;

create or replace function public.loyalty_segment_ok(
  p_segment text, p_stamps integer, p_required integer, p_last_stamp timestamptz, p_card_created timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select case p_segment
    when 'all'         then true
    when 'recent_30'   then p_last_stamp is not null and p_last_stamp >= now() - interval '30 days'
    when 'inactive_30' then coalesce(p_last_stamp, p_card_created) < now() - interval '30 days'
    when 'inactive_60' then coalesce(p_last_stamp, p_card_created) < now() - interval '60 days'
    when 'almost_full' then p_stamps < p_required and p_stamps >= p_required - 1
    when 'reward_ready' then p_stamps >= p_required
    else false end;
$$;

-- ---------------------------------------------------------------- Kunde

create or replace function public.set_offers_opt_in(p_token text, p_endpoint text, p_opt_in boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update public.loyalty_push_subscriptions s
     set offers_opt_in = coalesce(p_opt_in, false),
         offers_opt_in_at = case when coalesce(p_opt_in, false) then now() else null end
  from public.loyalty_cards c
  where s.card_id = c.id and s.endpoint = p_endpoint
    and c.secret_hash = public.loyalty_hash(coalesce(p_token, ''));
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'subscription_not_found');
  end if;
  return jsonb_build_object('ok', true, 'offers_opt_in', coalesce(p_opt_in, false));
end;
$$;

create or replace function public.get_push_status(p_token text, p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_opt boolean;
begin
  select s.offers_opt_in into v_opt
  from public.loyalty_push_subscriptions s
  join public.loyalty_cards c on c.id = s.card_id
  where s.endpoint = p_endpoint and c.secret_hash = public.loyalty_hash(coalesce(p_token, ''));
  if not found then
    return jsonb_build_object('ok', true, 'subscribed', false, 'offers_opt_in', false);
  end if;
  return jsonb_build_object('ok', true, 'subscribed', true, 'offers_opt_in', v_opt);
end;
$$;

-- Karte anzeigen: jetzt zusätzlich mit aktuellem Angebot und (falls aktiv) den Nähe-Daten des Geschäfts.
create or replace function public.get_loyalty_card(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_offer record;
begin
  select c.stamps, c.status, lp.id as program_id, lp.name as program_name, lp.description, lp.reward,
         lp.stamps_required, lp.terms, lp.is_active, lp.nearby_enabled, lp.nearby_lat, lp.nearby_lng,
         lp.nearby_radius_m, lp.nearby_text, bp.name as business_name, bp.slug
  into r
  from public.loyalty_cards c
  join public.loyalty_programs lp on lp.id = c.program_id
  join public.business_profiles bp on bp.business_id = lp.business_id
  where c.secret_hash = public.loyalty_hash(coalesce(p_token, ''))
    and bp.is_published = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'card_not_found');
  end if;

  select cm.title, cm.body, cm.valid_until into v_offer
  from public.loyalty_campaigns cm
  where cm.program_id = r.program_id and cm.status = 'sent'
    and (cm.valid_until is null or cm.valid_until > now())
    and cm.sent_at > now() - interval '30 days'
  order by cm.sent_at desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'business_name', r.business_name, 'slug', r.slug,
    'program_name', r.program_name, 'description', r.description,
    'reward', r.reward, 'terms', r.terms,
    'stamps_required', r.stamps_required, 'stamps', r.stamps,
    'status', r.status, 'program_active', r.is_active,
    'reward_ready', r.stamps >= r.stamps_required,
    'nearby', case when r.nearby_enabled and r.nearby_lat is not null and r.nearby_lng is not null
                   then jsonb_build_object('lat', r.nearby_lat, 'lng', r.nearby_lng,
                                           'radius_m', r.nearby_radius_m, 'text', r.nearby_text)
                   else null end,
    'offer', case when v_offer.title is not null
                  then jsonb_build_object('title', v_offer.title, 'body', v_offer.body,
                                          'valid_until', v_offer.valid_until)
                  else null end
  );
end;
$$;

-- ---------------------------------------------------------------- Inhaber

-- Anzahl erreichbarer Geräte für eine Empfängergruppe (Vorschau im Editor).
create or replace function public.campaign_audience(p_segment text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if auth.uid() is null then return 0; end if;
  select count(*) into v_n
  from public.loyalty_push_subscriptions s
  join public.loyalty_cards c on c.id = s.card_id
  join public.loyalty_programs lp on lp.id = c.program_id
  join public.businesses b on b.id = lp.business_id
  where b.owner_id = auth.uid() and s.offers_opt_in
    and (s.last_offer_at is null or s.last_offer_at < now() - interval '3 days')
    and public.loyalty_segment_ok(coalesce(p_segment, ''), c.stamps, lp.stamps_required, c.last_stamp_at, c.created_at);
  return v_n;
end;
$$;

create or replace function public.start_campaign(
  p_name text, p_title text, p_body text, p_segment text, p_valid_until timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_program uuid; v_active boolean; v_business text; v_slug text; v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select lp.id, lp.is_active, bp.name, bp.slug into v_program, v_active, v_business, v_slug
  from public.loyalty_programs lp
  join public.businesses b on b.id = lp.business_id
  join public.business_profiles bp on bp.business_id = b.id
  where b.owner_id = auth.uid();
  if v_program is null then
    return jsonb_build_object('ok', false, 'error', 'no_program');
  end if;
  if not v_active then
    return jsonb_build_object('ok', false, 'error', 'program_inactive');
  end if;

  if char_length(v_name) not between 1 and 80 or char_length(v_title) not between 1 and 50
     or char_length(v_body) not between 1 and 160
     or coalesce(p_segment, '') not in ('all', 'recent_30', 'inactive_30', 'inactive_60', 'almost_full', 'reward_ready')
     or (p_valid_until is not null and (p_valid_until <= now() or p_valid_until > now() + interval '90 days')) then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if public.loyalty_in_quiet_hours(now()) then
    return jsonb_build_object('ok', false, 'error', 'quiet_hours');
  end if;

  if exists (select 1 from public.loyalty_campaigns
             where program_id = v_program and status in ('sending', 'sent')
               and created_at > now() - interval '24 hours') then
    return jsonb_build_object('ok', false, 'error', 'too_frequent');
  end if;

  insert into public.loyalty_campaigns (program_id, name, title, body, segment, valid_until, created_by)
  values (v_program, v_name, v_title, v_body, p_segment, p_valid_until, auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'campaign_id', v_id, 'business_name', v_business,
                            'slug', v_slug, 'title', v_title, 'body', v_body);
end;
$$;

-- Empfänger einer Kampagne (nur direkt nach dem Start, nur einmal). Markiert die Geräte als bedient.
create or replace function public.get_campaign_targets(p_campaign_id uuid)
returns table (endpoint text, p256dh_key text, auth_key text, card_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_program uuid; v_segment text;
begin
  select cm.program_id, cm.segment into v_program, v_segment
  from public.loyalty_campaigns cm
  join public.loyalty_programs lp on lp.id = cm.program_id
  join public.businesses b on b.id = lp.business_id
  where cm.id = p_campaign_id and b.owner_id = auth.uid()
    and cm.status = 'sending' and cm.created_at > now() - interval '10 minutes';
  if v_program is null then
    return;
  end if;

  return query
    with picked as (
      update public.loyalty_push_subscriptions s
         set last_offer_at = now()
      from public.loyalty_cards c, public.loyalty_programs lp
      where s.card_id = c.id and lp.id = c.program_id and lp.id = v_program and s.offers_opt_in
        and (s.last_offer_at is null or s.last_offer_at < now() - interval '3 days')
        and public.loyalty_segment_ok(v_segment, c.stamps, lp.stamps_required, c.last_stamp_at, c.created_at)
      returning s.endpoint, s.p256dh_key, s.auth_key, s.card_id
    )
    select picked.endpoint, picked.p256dh_key, picked.auth_key, picked.card_id from picked;
end;
$$;

create or replace function public.finish_campaign(p_campaign_id uuid, p_sent integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.loyalty_campaigns cm
     set status = 'sent', sent_count = greatest(0, coalesce(p_sent, 0)), sent_at = now()
  from public.loyalty_programs lp, public.businesses b
  where cm.id = p_campaign_id and cm.status = 'sending'
    and lp.id = cm.program_id and b.id = lp.business_id and b.owner_id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.list_my_campaigns();
create or replace function public.list_my_campaigns()
returns table (id uuid, name text, title text, body text, segment text, valid_until timestamptz,
               sent_count integer, status text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    select cm.id, cm.name, cm.title, cm.body, cm.segment, cm.valid_until, cm.sent_count, cm.status, cm.created_at
    from public.loyalty_campaigns cm
    join public.loyalty_programs lp on lp.id = cm.program_id
    join public.businesses b on b.id = lp.business_id
    where b.owner_id = auth.uid()
    order by cm.created_at desc
    limit 50;
end;
$$;

-- ---------------------------------------------------------------- Rechte

revoke all on function public.loyalty_in_quiet_hours(timestamptz) from public, anon, authenticated;
revoke all on function public.loyalty_segment_ok(text, integer, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.set_offers_opt_in(text, text, boolean) from public, anon, authenticated;
revoke all on function public.get_push_status(text, text)            from public, anon, authenticated;
revoke all on function public.get_loyalty_card(text)                 from public, anon, authenticated;
revoke all on function public.campaign_audience(text)                from public, anon, authenticated;
revoke all on function public.start_campaign(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_campaign_targets(uuid)             from public, anon, authenticated;
revoke all on function public.finish_campaign(uuid, integer)         from public, anon, authenticated;
revoke all on function public.list_my_campaigns()                    from public, anon, authenticated;

grant execute on function public.set_offers_opt_in(text, text, boolean) to anon, authenticated;
grant execute on function public.get_push_status(text, text)            to anon, authenticated;
grant execute on function public.get_loyalty_card(text)                 to anon, authenticated;
grant execute on function public.campaign_audience(text)                to authenticated;
grant execute on function public.start_campaign(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.get_campaign_targets(uuid)             to authenticated;
grant execute on function public.finish_campaign(uuid, integer)         to authenticated;
grant execute on function public.list_my_campaigns()                    to authenticated;
