-- Tests für 0008_campaign_schedule.sql. NUR gegen lokale Test-Datenbank (benötigt 0002 bis 0008).
\set ON_ERROR_STOP on
create or replace function pg_temp.expect(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  raise notice 'PASS: %', name;
end $$;
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set SECRET 'geheimgeheimgeheimgeheim1234'

insert into auth.users (id) values (:'A'), (:'B');
insert into businesses (id, owner_id) values ('00000000-0000-0000-0000-0000000000a1', :'A'), ('00000000-0000-0000-0000-0000000000b1', :'B');
insert into business_profiles (business_id, slug, name, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', 'cafe-a', 'Café A', true),
  ('00000000-0000-0000-0000-0000000000b1', 'cafe-b', 'Café B', true);
insert into loyalty_programs (business_id, name, stamps_required, reward, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'A', 3, 'Kaffee', true),
  ('00000000-0000-0000-0000-0000000000b1', 'B', 3, 'Kuchen', true);

-- zwei Geräte mit Einwilligung
set role anon;
select create_loyalty_card('cafe-a')->>'token' as t1 \gset
select create_loyalty_card('cafe-a')->>'token' as t2 \gset
select save_push_subscription(:'t1', 'https://push.example/e1', 'k', 'a');
select save_push_subscription(:'t2', 'https://push.example/e2', 'k', 'a');
select set_offers_opt_in(:'t1', 'https://push.example/e1', true);
select set_offers_opt_in(:'t2', 'https://push.example/e2', true);
reset role;

-- Zeitpunkte in Berlin: morgen 12:00 (erlaubt), morgen 03:00 (Ruhezeit), übermorgen+1 12:00
select ((date_trunc('day', now() at time zone 'Europe/Berlin') + interval '1 day 12 hours') at time zone 'Europe/Berlin') as t_ok \gset
select ((date_trunc('day', now() at time zone 'Europe/Berlin') + interval '1 day 3 hours') at time zone 'Europe/Berlin') as t_night \gset
select ((date_trunc('day', now() at time zone 'Europe/Berlin') + interval '3 days 12 hours') at time zone 'Europe/Berlin') as t_later \gset

set role authenticated; select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.expect('Geplanter Versand in der Ruhezeit wird abgelehnt', start_campaign('n', 'T', 'B', 'all', null, :'t_night')->>'error' = 'quiet_hours');
select pg_temp.expect('Zu kurzfristig (unter 5 Minuten)', start_campaign('n', 'T', 'B', 'all', null, now() + interval '1 minute')->>'error' = 'invalid_input');
select pg_temp.expect('Zu weit in der Zukunft (über 30 Tage)', start_campaign('n', 'T', 'B', 'all', null, now() + interval '40 days')->>'error' = 'invalid_input');
select pg_temp.expect('Ablaufdatum vor dem Versand', start_campaign('n', 'T', 'B', 'all', :'t_ok'::timestamptz - interval '1 hour', :'t_ok')->>'error' = 'invalid_input');
select start_campaign('Plan', 'Geplant', 'Text', 'all', null, :'t_ok')->>'campaign_id' as cid \gset
select pg_temp.expect('Geplantes Angebot wird gespeichert', (select status from list_my_campaigns() where id = :'cid'::uuid) = 'scheduled');
select pg_temp.expect('Zweites Angebot am selben Tag wird gebremst', start_campaign('n2', 'T', 'B', 'all', null, :'t_ok'::timestamptz + interval '2 hours')->>'error' = 'too_frequent');
select pg_temp.expect('Anderer Tag ist erlaubt', start_campaign('n3', 'T', 'B', 'all', null, :'t_later')->>'ok' = 'true');

-- Abbrechen
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.expect('Fremder Inhaber kann nicht abbrechen', cancel_campaign(:'cid'::uuid)->>'error' = 'not_cancellable');
select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.expect('Eigener Inhaber bricht ab', cancel_campaign(:'cid'::uuid)->>'ok' = 'true');
select pg_temp.expect('Zweimal abbrechen geht nicht', cancel_campaign(:'cid'::uuid)->>'error' = 'not_cancellable');
select pg_temp.expect('Abgebrochener Termin blockiert nicht mehr', start_campaign('n4', 'T', 'B', 'all', null, :'t_ok')->>'ok' = 'true');
reset role;
select id as cid_ok from loyalty_campaigns where name = 'n4' \gset
select id as cid_later from loyalty_campaigns where name = 'n3' \gset

-- Zeitdienst: Geheimnis
insert into loyalty_settings (key, value) values ('cron_secret_hash', encode(sha256(convert_to(:'SECRET', 'UTF8')), 'hex'));
set role anon;
do $$ begin
  begin perform 1 from loyalty_settings; raise exception 'FAIL: Besucher lesen Einstellungen';
  exception when insufficient_privilege then raise notice 'PASS: Einstellungen sind für Besucher gesperrt'; end;
end $$;
select pg_temp.expect('Falsches Kennwort holt nichts ab', (select count(*) from claim_due_campaigns('falsch-falsch-falsch-falsch-falsch')) = 0);
select pg_temp.expect('Zu kurzes Kennwort holt nichts ab', (select count(*) from claim_due_campaigns('kurz')) = 0);
reset role;

-- Termin wird fällig (Ruhezeit-Hilfe ausschalten, damit der Test tageszeitunabhängig ist)
create or replace function public.loyalty_in_quiet_hours(p_ts timestamptz) returns boolean language sql stable as $$ select false $$;
update loyalty_campaigns set scheduled_at = now() + interval '10 minutes' where id = :'cid_ok';
set role anon;
select pg_temp.expect('Noch nicht fällig: nichts abgeholt', (select count(*) from claim_due_campaigns(:'SECRET')) = 0);
reset role;
update loyalty_campaigns set scheduled_at = now() - interval '1 minute' where id = :'cid_ok';
set role anon;
select pg_temp.expect('Fälliges Angebot wird abgeholt', (select count(*) from claim_due_campaigns(:'SECRET')) = 1);
select pg_temp.expect('Nicht doppelt abgeholt', (select count(*) from claim_due_campaigns(:'SECRET')) = 0);
select pg_temp.expect('Falsches Kennwort bekommt keine Empfänger', (select count(*) from get_scheduled_targets('falsch-falsch-falsch-falsch-falsch', :'cid_ok'::uuid)) = 0);
select pg_temp.expect('Richtiges Kennwort: beide Geräte', (select count(*) from get_scheduled_targets(:'SECRET', :'cid_ok'::uuid)) = 2);
select pg_temp.expect('Kein doppelter Versand', (select count(*) from get_scheduled_targets(:'SECRET', :'cid_ok'::uuid)) = 0);
select pg_temp.expect('Falsches Kennwort schließt nicht ab', finish_scheduled_campaign('falsch-falsch-falsch-falsch-falsch', :'cid_ok'::uuid, 2)->>'ok' = 'false');
select pg_temp.expect('Abschluss mit Kennwort', finish_scheduled_campaign(:'SECRET', :'cid_ok'::uuid, 2)->>'ok' = 'true');
reset role;
select pg_temp.expect('Status ist gesendet, Anzahl gespeichert', (select status = 'sent' and sent_count = 2 from loyalty_campaigns where id = :'cid_ok'));

-- überfällig, abgelaufen, Programm aus
update loyalty_campaigns set status = 'scheduled', scheduled_at = now() - interval '13 hours' where id = :'cid_later';
set role anon; select count(*) from claim_due_campaigns(:'SECRET'); reset role;
select pg_temp.expect('Über 12 Stunden überfällig: nicht mehr senden', (select status from loyalty_campaigns where id = :'cid_later') = 'failed');
update loyalty_campaigns set status = 'scheduled', scheduled_at = now() - interval '1 minute', valid_until = now() - interval '1 second' where id = :'cid_later';
set role anon; select count(*) from claim_due_campaigns(:'SECRET'); reset role;
select pg_temp.expect('Abgelaufen: abgebrochen', (select status from loyalty_campaigns where id = :'cid_later') = 'cancelled');
update loyalty_campaigns set status = 'scheduled', scheduled_at = now() - interval '1 minute', valid_until = null where id = :'cid_later';
update loyalty_programs set is_active = false where name = 'A';
set role anon; select count(*) from claim_due_campaigns(:'SECRET'); reset role;
select pg_temp.expect('Programm inaktiv: nicht senden', (select status from loyalty_campaigns where id = :'cid_later') = 'failed');
update loyalty_programs set is_active = true where name = 'A';

-- Ruhezeit beim Abholen
create or replace function public.loyalty_in_quiet_hours(p_ts timestamptz) returns boolean language sql stable as $$ select true $$;
update loyalty_campaigns set status = 'scheduled', scheduled_at = now() - interval '1 minute', valid_until = null where id = :'cid_later';
set role anon;
select pg_temp.expect('In der Ruhezeit wird nichts abgeholt', (select count(*) from claim_due_campaigns(:'SECRET')) = 0);
reset role;
select pg_temp.expect('Termin bleibt geplant', (select status from loyalty_campaigns where id = :'cid_later') = 'scheduled');

-- Klicks
set role anon;
select record_campaign_click(:'cid_ok'::uuid);
select record_campaign_click(:'cid_ok'::uuid);
select record_campaign_click(:'cid_ok'::uuid);
select record_campaign_click(:'cid_ok'::uuid);
select record_campaign_click(:'cid_ok'::uuid);
reset role;
select pg_temp.expect('Klicks sind nach oben begrenzt (höchstens 2 pro Empfänger)', (select click_count from loyalty_campaigns where id = :'cid_ok') = 4);
set role anon;
select record_campaign_click(:'cid_later'::uuid);
reset role;
select pg_temp.expect('Nicht gesendete Kampagne zählt keine Klicks', (select click_count from loyalty_campaigns where id = :'cid_later') = 0);

-- tote Geräte entfernen
set role anon;
select pg_temp.expect('Falsches Kennwort entfernt kein Gerät', prune_dead_subscription('falsch-falsch-falsch-falsch-falsch', 'https://push.example/e1')->>'ok' = 'false');
select prune_dead_subscription(:'SECRET', 'https://push.example/e1');
reset role;
select pg_temp.expect('Gerät wurde entfernt', (select count(*) from loyalty_push_subscriptions) = 1);
select 'ALLE TESTS BESTANDEN' as ergebnis;
