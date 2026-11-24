-- Geplante Angebote und Klick-Statistik.
-- Geplante Angebote verschickt ein Zeitdienst, der /api/cron/dispatch regelmäßig aufruft.
-- Der Aufruf ist durch ein geheimes Kennwort geschützt, in der Datenbank steht nur dessen Hash.

create table if not exists public.loyalty_settings (
  key   text primary key,
  value text not null
);
alter table public.loyalty_settings enable row level security;
revoke all on public.loyalty_settings from anon, authenticated;

alter table public.loyalty_campaigns
  add column if not exists scheduled_at timestamptz,
  add column if not exists click_count  integer not null default 0;

alter table public.loyalty_campaigns drop constraint if exists loyalty_campaigns_status_check;
alter table public.loyalty_campaigns add constraint loyalty_campaigns_status_check
  check (status in ('scheduled', 'sending', 'sent', 'failed', 'cancelled'));

create or replace function public.loyalty_cron_ok(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select char_length(coalesce(p_secret, '')) >= 24
     and exists (select 1 from public.loyalty_settings
                 where key = 'cron_secret_hash' and value = public.loyalty_hash(p_secret));
$$;

-- Neue Fassung mit Versandzeit (ersetzt die alte mit fünf Parametern).
drop function if exists public.start_campaign(text, text, text, text, timestamptz);
create or replace function public.start_campaign(
  p_name text, p_title text, p_body text, p_segment text, p_valid_until timestamptz,
  p_scheduled_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_program uuid; v_active boolean; v_business text; v_slug text; v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_when timestamptz := coalesce(p_scheduled_at, now());
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
     or (p_scheduled_at is not null and (p_scheduled_at < now() + interval '5 minutes'
                                         or p_scheduled_at > now() + interval '30 days'))
     or (p_valid_until is not null and (p_valid_until <= v_when or p_valid_until > v_when + interval '90 days')) then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if public.loyalty_in_quiet_hours(v_when) then
    return jsonb_build_object('ok', false, 'error', 'quiet_hours');
  end if;

  -- höchstens ein Angebot pro Programm innerhalb von 24 Stunden (auch bei geplanten)
  if exists (select 1 from public.loyalty_campaigns
             where program_id = v_program and status in ('scheduled', 'sending', 'sent')
               and abs(extract(epoch from (coalesce(scheduled_at, created_at) - v_when))) < 86400) then
    return jsonb_build_object('ok', false, 'error', 'too_frequent');
  end if;

  insert into public.loyalty_campaigns
    (program_id, name, title, body, segment, valid_until, scheduled_at, status, created_by)
  values (v_program, v_name, v_title, v_body, p_segment, p_valid_until, p_scheduled_at,
          case when p_scheduled_at is null then 'sending' else 'scheduled' end, auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'campaign_id', v_id, 'business_name', v_business,
                            'slug', v_slug, 'title', v_title, 'body', v_body,
                            'scheduled', p_scheduled_at is not null);
end;
$$;

create or replace function public.cancel_campaign(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update public.loyalty_campaigns cm set status = 'cancelled'
  from public.loyalty_programs lp, public.businesses b
  where cm.id = p_campaign_id and cm.status = 'scheduled'
    and lp.id = cm.program_id and b.id = lp.business_id and b.owner_id = auth.uid();
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.list_my_campaigns();
create or replace function public.list_my_campaigns()
returns table (id uuid, name text, title text, body text, segment text, valid_until timestamptz,
               sent_count integer, click_count integer, status text, scheduled_at timestamptz,
               created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    select cm.id, cm.name, cm.title, cm.body, cm.segment, cm.valid_until, cm.sent_count, cm.click_count,
           cm.status, cm.scheduled_at, cm.created_at
    from public.loyalty_campaigns cm
    join public.loyalty_programs lp on lp.id = cm.program_id
    join public.businesses b on b.id = lp.business_id
    where b.owner_id = auth.uid()
    order by coalesce(cm.scheduled_at, cm.created_at) desc
    limit 50;
end;
$$;

-- ---------------------------------------------------------------- Zeitdienst

-- Holt fällige Kampagnen ab und markiert sie als "wird gesendet". Nur mit dem geheimen Kennwort.
create or replace function public.claim_due_campaigns(p_secret text)
returns table (campaign_id uuid, title text, body text, slug text, business_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.loyalty_cron_ok(p_secret) then
    return;
  end if;

  -- abgelaufene oder verpasste (länger als 12 Stunden überfällige) Kampagnen nicht mehr senden
  update public.loyalty_campaigns
     set status = 'cancelled'
   where status = 'scheduled' and valid_until is not null and valid_until <= now();
  update public.loyalty_campaigns
     set status = 'failed'
   where status = 'scheduled' and scheduled_at < now() - interval '12 hours';
  -- Programm nicht mehr aktiv oder Profil nicht veröffentlicht: nicht senden
  update public.loyalty_campaigns cm
     set status = 'failed'
   where cm.status = 'scheduled' and cm.scheduled_at <= now()
     and not exists (select 1 from public.loyalty_programs lp
                     join public.business_profiles bp on bp.business_id = lp.business_id
                     where lp.id = cm.program_id and lp.is_active and bp.is_published);

  if public.loyalty_in_quiet_hours(now()) then
    return;
  end if;

  return query
    with due as (
      update public.loyalty_campaigns cm
         set status = 'sending'
       where cm.status = 'scheduled' and cm.scheduled_at <= now()
      returning cm.id, cm.program_id, cm.title, cm.body
    )
    select due.id, due.title, due.body, bp.slug, bp.name
    from due
    join public.loyalty_programs lp on lp.id = due.program_id
    join public.business_profiles bp on bp.business_id = lp.business_id;
end;
$$;

create or replace function public.get_scheduled_targets(p_secret text, p_campaign_id uuid)
returns table (endpoint text, p256dh_key text, auth_key text, card_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_program uuid; v_segment text;
begin
  if not public.loyalty_cron_ok(p_secret) then
    return;
  end if;
  select cm.program_id, cm.segment into v_program, v_segment
  from public.loyalty_campaigns cm
  where cm.id = p_campaign_id and cm.status = 'sending' and cm.scheduled_at is not null
    and cm.scheduled_at > now() - interval '1 day';
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

create or replace function public.finish_scheduled_campaign(p_secret text, p_campaign_id uuid, p_sent integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.loyalty_cron_ok(p_secret) then
    return jsonb_build_object('ok', false);
  end if;
  update public.loyalty_campaigns
     set status = 'sent', sent_count = greatest(0, coalesce(p_sent, 0)), sent_at = now()
   where id = p_campaign_id and status = 'sending' and scheduled_at is not null;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.prune_dead_subscription(p_secret text, p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.loyalty_cron_ok(p_secret) then
    return jsonb_build_object('ok', false);
  end if;
  delete from public.loyalty_push_subscriptions where endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- Klicks

-- Zählt einen Klick auf eine Angebots-Nachricht (anonym, nur eine Zahl, nach oben begrenzt).
create or replace function public.record_campaign_click(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.loyalty_campaigns
     set click_count = click_count + 1
   where id = p_campaign_id and status = 'sent' and sent_at > now() - interval '30 days'
     and click_count < greatest(sent_count, 1) * 2;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- Rechte

revoke all on function public.loyalty_cron_ok(text) from public, anon, authenticated;
revoke all on function public.start_campaign(text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.cancel_campaign(uuid) from public, anon, authenticated;
revoke all on function public.list_my_campaigns() from public, anon, authenticated;
revoke all on function public.claim_due_campaigns(text) from public, anon, authenticated;
revoke all on function public.get_scheduled_targets(text, uuid) from public, anon, authenticated;
revoke all on function public.finish_scheduled_campaign(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.prune_dead_subscription(text, text) from public, anon, authenticated;
revoke all on function public.record_campaign_click(uuid) from public, anon, authenticated;

grant execute on function public.start_campaign(text, text, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.cancel_campaign(uuid) to authenticated;
grant execute on function public.list_my_campaigns() to authenticated;
-- Der Zeitdienst ruft mit dem öffentlichen Schlüssel auf; jede Funktion prüft das geheime Kennwort selbst.
grant execute on function public.claim_due_campaigns(text) to anon, authenticated;
grant execute on function public.get_scheduled_targets(text, uuid) to anon, authenticated;
grant execute on function public.finish_scheduled_campaign(text, uuid, integer) to anon, authenticated;
grant execute on function public.prune_dead_subscription(text, text) to anon, authenticated;
grant execute on function public.record_campaign_click(uuid) to anon, authenticated;
