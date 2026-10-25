-- Blinko Treueprogramm (Phase 1: Datenmodell und Sicherheit)
-- Voraussetzung: Tabellen businesses und business_profiles sowie auth.uid() (Supabase).
--
-- Sicherheitsprinzip:
--  * Der Browser darf Karten, Stempel, Einlösungen und Scan-Tokens NIE direkt schreiben.
--  * Schreiben läuft ausschließlich über SECURITY-DEFINER-Funktionen, die selbst prüfen,
--    wer aufruft und wem das Unternehmen gehört. Es wird nie eine Unternehmens-ID vom
--    Aufrufer vertraut.
--  * Geheime Kartenlinks und Scan-Tokens werden nur als SHA-256-Hash gespeichert.

-- ---------------------------------------------------------------- Tabellen

create table if not exists public.loyalty_programs (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null unique references public.businesses(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  description     text check (description is null or char_length(description) <= 500),
  stamps_required integer not null check (stamps_required between 2 and 50),
  reward          text not null check (char_length(reward) between 1 and 120),
  terms           text check (terms is null or char_length(terms) <= 2000),
  is_active       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.loyalty_cards (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.loyalty_programs(id) on delete cascade,
  secret_hash   text not null unique,
  stamps        integer not null default 0 check (stamps >= 0),
  status        text not null default 'active' check (status in ('active', 'blocked')),
  created_at    timestamptz not null default now(),
  last_stamp_at timestamptz
);
create index if not exists loyalty_cards_program_idx on public.loyalty_cards (program_id);

create table if not exists public.loyalty_stamps (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.loyalty_cards(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_stamps_card_idx on public.loyalty_stamps (card_id);
create index if not exists loyalty_stamps_program_idx on public.loyalty_stamps (program_id, created_at);

create table if not exists public.loyalty_redemptions (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.loyalty_cards(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  stamps_used integer not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_redemptions_card_idx on public.loyalty_redemptions (card_id);
create index if not exists loyalty_redemptions_program_idx on public.loyalty_redemptions (program_id, created_at);

create table if not exists public.loyalty_scan_tokens (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.loyalty_cards(id) on delete cascade,
  token_hash text not null unique,
  code       text not null check (code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_scan_tokens_card_idx on public.loyalty_scan_tokens (card_id);
create index if not exists loyalty_scan_tokens_code_idx on public.loyalty_scan_tokens (code) where used_at is null;

-- Fehlversuche des Inhabers (Begrenzung von Ausprobieren)
create table if not exists public.loyalty_attempts (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_attempts_owner_idx on public.loyalty_attempts (owner_id, created_at);

-- updated_at pflegen
create or replace function public.loyalty_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists loyalty_programs_touch on public.loyalty_programs;
create trigger loyalty_programs_touch before update on public.loyalty_programs
  for each row execute function public.loyalty_touch_updated_at();

-- ---------------------------------------------------------------- RLS

alter table public.loyalty_programs    enable row level security;
alter table public.loyalty_cards       enable row level security;
alter table public.loyalty_stamps      enable row level security;
alter table public.loyalty_redemptions enable row level security;
alter table public.loyalty_scan_tokens enable row level security;
alter table public.loyalty_attempts    enable row level security;

-- Programme: Besucher sehen nur aktive Programme veröffentlichter Profile.
drop policy if exists "Public read active programs" on public.loyalty_programs;
create policy "Public read active programs" on public.loyalty_programs
  for select to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.business_profiles p
      where p.business_id = loyalty_programs.business_id and p.is_published = true
    )
  );

drop policy if exists "Owners read own programs" on public.loyalty_programs;
create policy "Owners read own programs" on public.loyalty_programs
  for select to authenticated
  using (exists (select 1 from public.businesses b
                 where b.id = loyalty_programs.business_id and b.owner_id = (select auth.uid())));

drop policy if exists "Owners create own programs" on public.loyalty_programs;
create policy "Owners create own programs" on public.loyalty_programs
  for insert to authenticated
  with check (exists (select 1 from public.businesses b
                      where b.id = loyalty_programs.business_id and b.owner_id = (select auth.uid())));

drop policy if exists "Owners update own programs" on public.loyalty_programs;
create policy "Owners update own programs" on public.loyalty_programs
  for update to authenticated
  using (exists (select 1 from public.businesses b
                 where b.id = loyalty_programs.business_id and b.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b
                      where b.id = loyalty_programs.business_id and b.owner_id = (select auth.uid())));

-- Karten, Stempel, Einlösungen: Inhaber dürfen NUR LESEN (für Statistiken).
drop policy if exists "Owners read own cards" on public.loyalty_cards;
create policy "Owners read own cards" on public.loyalty_cards
  for select to authenticated
  using (exists (select 1 from public.loyalty_programs lp
                 join public.businesses b on b.id = lp.business_id
                 where lp.id = loyalty_cards.program_id and b.owner_id = (select auth.uid())));

drop policy if exists "Owners read own stamps" on public.loyalty_stamps;
create policy "Owners read own stamps" on public.loyalty_stamps
  for select to authenticated
  using (exists (select 1 from public.loyalty_programs lp
                 join public.businesses b on b.id = lp.business_id
                 where lp.id = loyalty_stamps.program_id and b.owner_id = (select auth.uid())));

drop policy if exists "Owners read own redemptions" on public.loyalty_redemptions;
create policy "Owners read own redemptions" on public.loyalty_redemptions
  for select to authenticated
  using (exists (select 1 from public.loyalty_programs lp
                 join public.businesses b on b.id = lp.business_id
                 where lp.id = loyalty_redemptions.program_id and b.owner_id = (select auth.uid())));

-- Scan-Tokens und Versuche: KEINE Policy = für Browser komplett gesperrt.

-- Zusätzlich Tabellenrechte entziehen (Defense in Depth)
revoke all on public.loyalty_cards, public.loyalty_stamps, public.loyalty_redemptions,
              public.loyalty_scan_tokens, public.loyalty_attempts
  from anon, authenticated;
grant select on public.loyalty_cards, public.loyalty_stamps, public.loyalty_redemptions
  to authenticated;
revoke all on public.loyalty_programs from anon, authenticated;
grant select on public.loyalty_programs to anon, authenticated;
grant insert, update on public.loyalty_programs to authenticated;

-- ---------------------------------------------------------------- Funktionen

-- Hilfsfunktion: SHA-256 als Hex
create or replace function public.loyalty_hash(p_value text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_value, 'UTF8')), 'hex');
$$;

-- Kunde (ohne Konto): neue Karte für ein aktives Programm eines veröffentlichten Profils.
-- Gibt den geheimen Kartenlink-Token EINMALIG zurück; gespeichert wird nur der Hash.
create or replace function public.create_loyalty_card(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_program uuid;
  v_token   text;
begin
  select lp.id into v_program
  from public.business_profiles bp
  join public.loyalty_programs lp on lp.business_id = bp.business_id
  where bp.slug = p_slug and bp.is_published = true and lp.is_active = true;

  if v_program is null then
    return jsonb_build_object('ok', false, 'error', 'program_unavailable');
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.loyalty_cards (program_id, secret_hash)
  values (v_program, public.loyalty_hash(v_token));

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

-- Kunde: Karte anzeigen (nur mit geheimem Token).
create or replace function public.get_loyalty_card(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select c.stamps, c.status, lp.name as program_name, lp.description, lp.reward,
         lp.stamps_required, lp.terms, lp.is_active, bp.name as business_name, bp.slug
  into r
  from public.loyalty_cards c
  join public.loyalty_programs lp on lp.id = c.program_id
  join public.business_profiles bp on bp.business_id = lp.business_id
  where c.secret_hash = public.loyalty_hash(coalesce(p_token, ''))
    and bp.is_published = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'card_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'business_name', r.business_name, 'slug', r.slug,
    'program_name', r.program_name, 'description', r.description,
    'reward', r.reward, 'terms', r.terms,
    'stamps_required', r.stamps_required, 'stamps', r.stamps,
    'status', r.status, 'program_active', r.is_active,
    'reward_ready', r.stamps >= r.stamps_required
  );
end;
$$;

-- Kunde: kurzlebigen, einmaligen Scan-Token (QR) samt 6-stelligem Code erzeugen.
create or replace function public.issue_scan_token(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_card    uuid;
  v_program uuid;
  v_new     text;
  v_code    text;
  v_exp     timestamptz := now() + interval '60 seconds';
  i         integer := 0;
  v_hex     text;
  v_num     integer;
begin
  select c.id, c.program_id into v_card, v_program
  from public.loyalty_cards c
  join public.loyalty_programs lp on lp.id = c.program_id
  where c.secret_hash = public.loyalty_hash(coalesce(p_token, ''))
    and c.status = 'active' and lp.is_active = true;

  if v_card is null then
    return jsonb_build_object('ok', false, 'error', 'card_not_found');
  end if;

  -- alte, unbenutzte Tokens dieser Karte verwerfen; Abgelaufenes aufräumen
  delete from public.loyalty_scan_tokens
  where (card_id = v_card and used_at is null) or expires_at < now() - interval '1 day';

  -- Code ist innerhalb des Programms unter gültigen Tokens eindeutig
  loop
    v_hex  := replace(gen_random_uuid()::text, '-', '');
    v_num  := get_byte(decode(substr(v_hex, 1, 6), 'hex'), 0) * 65536
            + get_byte(decode(substr(v_hex, 1, 6), 'hex'), 1) * 256
            + get_byte(decode(substr(v_hex, 1, 6), 'hex'), 2);
    v_code := lpad((v_num % 1000000)::text, 6, '0');
    exit when not exists (
      select 1 from public.loyalty_scan_tokens t
      join public.loyalty_cards c2 on c2.id = t.card_id
      where c2.program_id = v_program and t.code = v_code
        and t.used_at is null and t.expires_at > now());
    i := i + 1;
    if i > 20 then
      return jsonb_build_object('ok', false, 'error', 'try_again');
    end if;
  end loop;

  v_new := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.loyalty_scan_tokens (card_id, token_hash, code, expires_at)
  values (v_card, public.loyalty_hash(v_new), v_code, v_exp);

  return jsonb_build_object('ok', true, 'token', v_new, 'code', v_code, 'expires_at', v_exp);
end;
$$;

-- Inhaber: interne Suche nach einem gültigen Scan-Token (per Token ODER 6-stelligem Code),
-- eingeschränkt auf Programme des angemeldeten Inhabers. Sperrt die Token-Zeile.
create or replace function public.loyalty_find_token(p_token text, p_code text, p_lock boolean)
returns table (token_id uuid, card_id uuid, program_id uuid, stamps integer, card_status text,
               stamps_required integer, program_name text, reward text, is_active boolean,
               business_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_lock then
    return query
      select t.id, c.id, lp.id, c.stamps, c.status, lp.stamps_required, lp.name, lp.reward,
             lp.is_active, bp.name
      from public.loyalty_scan_tokens t
      join public.loyalty_cards c on c.id = t.card_id
      join public.loyalty_programs lp on lp.id = c.program_id
      join public.businesses b on b.id = lp.business_id
      join public.business_profiles bp on bp.business_id = b.id
      where b.owner_id = auth.uid()
        and t.used_at is null and t.expires_at > now()
        and ((p_token is not null and t.token_hash = public.loyalty_hash(p_token))
          or (p_code is not null and t.code = p_code))
      for update of t, c;
  else
    return query
      select t.id, c.id, lp.id, c.stamps, c.status, lp.stamps_required, lp.name, lp.reward,
             lp.is_active, bp.name
      from public.loyalty_scan_tokens t
      join public.loyalty_cards c on c.id = t.card_id
      join public.loyalty_programs lp on lp.id = c.program_id
      join public.businesses b on b.id = lp.business_id
      join public.business_profiles bp on bp.business_id = b.id
      where b.owner_id = auth.uid()
        and t.used_at is null and t.expires_at > now()
        and ((p_token is not null and t.token_hash = public.loyalty_hash(p_token))
          or (p_code is not null and t.code = p_code));
  end if;
end;
$$;

-- Inhaber: Zu viele Fehlversuche? (10 in 5 Minuten)
create or replace function public.loyalty_is_limited()
returns boolean language sql security definer set search_path = '' as $$
  select count(*) >= 10 from public.loyalty_attempts
  where owner_id = auth.uid() and created_at > now() - interval '5 minutes';
$$;

-- Inhaber: Scan prüfen, OHNE etwas zu verändern (Bestätigungsansicht).
create or replace function public.preview_scan(p_token text default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if public.loyalty_is_limited() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into r from public.loyalty_find_token(nullif(p_token, ''), nullif(p_code, ''), false) limit 1;
  if not found then
    insert into public.loyalty_attempts (owner_id) values (auth.uid());
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  return jsonb_build_object(
    'ok', true, 'card_id', r.card_id, 'business_name', r.business_name,
    'program_name', r.program_name, 'reward', r.reward,
    'stamps', r.stamps, 'stamps_required', r.stamps_required,
    'reward_ready', r.stamps >= r.stamps_required,
    'card_status', r.card_status, 'program_active', r.is_active);
end;
$$;

-- Inhaber: Stempel vergeben. Token wird in derselben Transaktion verbraucht.
create or replace function public.stamp_card(p_token text default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_new integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if public.loyalty_is_limited() then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into r from public.loyalty_find_token(nullif(p_token, ''), nullif(p_code, ''), true) limit 1;
  if not found then
    insert into public.loyalty_attempts (owner_id) values (auth.uid());
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;
  if r.card_status <> 'active' or not r.is_active then
    return jsonb_build_object('ok', false, 'error', 'card_or_program_inactive');
  end if;
  if r.stamps >= r.stamps_required then
    return jsonb_build_object('ok', false, 'error', 'reward_ready', 'card_id', r.card_id);
  end if;

  update public.loyalty_scan_tokens set used_at = now(), used_by = auth.uid() where id = r.token_id;
  update public.loyalty_cards set stamps = stamps + 1, last_stamp_at = now()
    where id = r.card_id returning stamps into v_new;
  insert into public.loyalty_stamps (card_id, program_id, created_by)
    values (r.card_id, r.program_id, auth.uid());

  return jsonb_build_object('ok', true, 'card_id', r.card_id, 'stamps', v_new,
    'stamps_required', r.stamps_required, 'reward_ready', v_new >= r.stamps_required);
end;
$$;

-- Inhaber: Belohnung einlösen. Karte wird gesperrt, damit nichts doppelt eingelöst wird.
create or replace function public.redeem_reward(p_card_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select c.id, c.stamps, c.status, lp.id as program_id, lp.stamps_required
  into r
  from public.loyalty_cards c
  join public.loyalty_programs lp on lp.id = c.program_id
  join public.businesses b on b.id = lp.business_id
  where c.id = p_card_id and b.owner_id = auth.uid()
  for update of c;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'card_not_found');
  end if;
  if r.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'card_or_program_inactive');
  end if;
  if r.stamps < r.stamps_required then
    return jsonb_build_object('ok', false, 'error', 'not_enough_stamps');
  end if;

  update public.loyalty_cards set stamps = stamps - r.stamps_required where id = r.id;
  insert into public.loyalty_redemptions (card_id, program_id, stamps_used, created_by)
    values (r.id, r.program_id, r.stamps_required, auth.uid());

  return jsonb_build_object('ok', true, 'stamps', r.stamps - r.stamps_required);
end;
$$;

-- ---------------------------------------------------------------- Funktionsrechte

revoke all on function public.loyalty_hash(text)                    from public, anon, authenticated;
revoke all on function public.loyalty_find_token(text, text, boolean) from public, anon, authenticated;
revoke all on function public.loyalty_is_limited()                  from public, anon, authenticated;
revoke all on function public.create_loyalty_card(text)             from public, anon, authenticated;
revoke all on function public.get_loyalty_card(text)                from public, anon, authenticated;
revoke all on function public.issue_scan_token(text)                from public, anon, authenticated;
revoke all on function public.preview_scan(text, text)              from public, anon, authenticated;
revoke all on function public.stamp_card(text, text)                from public, anon, authenticated;
revoke all on function public.redeem_reward(uuid)                   from public, anon, authenticated;

-- Kundenfunktionen (kein Konto): anon + authenticated
grant execute on function public.create_loyalty_card(text) to anon, authenticated;
grant execute on function public.get_loyalty_card(text)    to anon, authenticated;
grant execute on function public.issue_scan_token(text)    to anon, authenticated;
-- Inhaberfunktionen: nur angemeldet
grant execute on function public.preview_scan(text, text)  to authenticated;
grant execute on function public.stamp_card(text, text)    to authenticated;
grant execute on function public.redeem_reward(uuid)       to authenticated;
