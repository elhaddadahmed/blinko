-- ============================================================================
-- Blinko: komplette Datenbank-Einrichtung in EINER Datei (Migrationen 0001 bis 0007)
-- Kann gefahrlos mehrfach ausgeführt werden. Ganzen Inhalt in den Supabase SQL Editor
-- einfügen und auf Run klicken. Bei einer Sicherheitswarnung: Run this query.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0001_keep_slug_stable.sql
-- ---------------------------------------------------------------------------
-- Der Slug eines Profils darf nach dem Anlegen nicht mehr geändert werden,
-- damit gedruckte QR-Codes und NFC-Tags dauerhaft funktionieren.
-- Eindeutigkeit besteht bereits (business_profiles_slug_key, PK auf business_id).
create or replace function public.prevent_slug_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'Der Slug eines Profils darf nicht geändert werden.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists business_profiles_keep_slug on public.business_profiles;

create trigger business_profiles_keep_slug
  before update on public.business_profiles
  for each row execute function public.prevent_slug_change();

-- ---------------------------------------------------------------------------
-- 0002_loyalty.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 0003_delete_account.sql
-- ---------------------------------------------------------------------------
-- Konto löschen (DSGVO): Ein angemeldeter Nutzer löscht sich selbst samt Unternehmen,
-- Profil, Treueprogramm, Karten, Stempeln und Einlösungen.
-- Läuft als SECURITY DEFINER, weil der Browser auth.users nicht löschen darf.
-- Die Funktion löscht ausschließlich Daten des aufrufenden Nutzers (auth.uid()).
create or replace function public.delete_my_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  delete from public.loyalty_attempts where owner_id = v_uid;
  delete from public.business_profiles
    where business_id in (select id from public.businesses where owner_id = v_uid);
  -- Programme, Karten, Stempel, Einlösungen und Tokens folgen per ON DELETE CASCADE
  delete from public.businesses where owner_id = v_uid;
  delete from auth.users where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 0004_card_rate_limit.sql
-- ---------------------------------------------------------------------------
-- Begrenzung beim Anlegen von Treuekarten (Schutz vor Massenanlage).
-- Pro Programm: höchstens 30 neue Karten in 10 Minuten und 300 pro Tag.
-- Hinweis: Das schützt die Datenbank, ersetzt aber kein Captcha. Wer das Limit ausschöpft,
-- kann kurzzeitig neue Karten blockieren. Die Grenzen lassen sich unten anpassen.
create index if not exists loyalty_cards_program_created_idx
  on public.loyalty_cards (program_id, created_at);

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

  if (select count(*) from public.loyalty_cards
        where program_id = v_program and created_at > now() - interval '10 minutes') >= 30
     or (select count(*) from public.loyalty_cards
        where program_id = v_program and created_at > now() - interval '1 day') >= 300 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.loyalty_cards (program_id, secret_hash)
  values (v_program, public.loyalty_hash(v_token));

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- 0005_logo_storage.sql
-- ---------------------------------------------------------------------------
-- Logo-Upload: öffentlicher Speicher "logos", Schreiben nur im Ordner des eigenen Unternehmens.
-- Voraussetzung: Supabase Storage ist aktiv (bei jedem Supabase-Projekt der Fall).
-- Erlaubt sind nur PNG, JPEG und WebP bis 1 MB (kein SVG, wegen Skript-Risiko).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "Logos are publicly readable" on storage.objects;
create policy "Logos are publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'logos');

drop policy if exists "Owners upload own logo" on storage.objects;
create policy "Owners upload own logo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and exists (select 1 from public.businesses b
                where b.owner_id = (select auth.uid())
                  and b.id::text = (storage.foldername(name))[1])
  );

drop policy if exists "Owners update own logo" on storage.objects;
create policy "Owners update own logo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and exists (select 1 from public.businesses b
                where b.owner_id = (select auth.uid())
                  and b.id::text = (storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'logos'
    and exists (select 1 from public.businesses b
                where b.owner_id = (select auth.uid())
                  and b.id::text = (storage.foldername(name))[1])
  );

drop policy if exists "Owners delete own logo" on storage.objects;
create policy "Owners delete own logo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and exists (select 1 from public.businesses b
                where b.owner_id = (select auth.uid())
                  and b.id::text = (storage.foldername(name))[1])
  );

-- ---------------------------------------------------------------------------
-- 0006_push.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 0007_campaigns_nearby.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Prüfung: alle Werte müssen true sein
-- ---------------------------------------------------------------------------
select
  exists (select 1 from pg_trigger where tgname = 'business_profiles_keep_slug') as slug_schutz,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'loyalty_cards') as treueprogramm,
  exists (select 1 from pg_proc where proname = 'delete_my_account') as konto_loeschen,
  exists (select 1 from pg_indexes where indexname = 'loyalty_cards_program_created_idx') as kartenbegrenzung,
  exists (select 1 from storage.buckets where id = 'logos') as logo_speicher,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'loyalty_push_subscriptions') as push,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'loyalty_campaigns') as angebote;
