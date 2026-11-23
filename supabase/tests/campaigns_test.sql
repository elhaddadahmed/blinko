-- Tests für 0007_campaigns_nearby.sql. NUR gegen lokale Test-Datenbank (benötigt 0002, 0006, 0007).
\set ON_ERROR_STOP on
create or replace function pg_temp.expect(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  raise notice 'PASS: %', name;
end $$;
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'

insert into auth.users (id) values (:'A'), (:'B'), (:'C');
insert into businesses (id, owner_id) values ('00000000-0000-0000-0000-0000000000a1', :'A'), ('00000000-0000-0000-0000-0000000000b1', :'B');
insert into business_profiles (business_id, slug, name, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', 'cafe-a', 'Café A', true),
  ('00000000-0000-0000-0000-0000000000b1', 'cafe-b', 'Café B', true);
insert into loyalty_programs (business_id, name, stamps_required, reward, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'A', 3, 'Kaffee', true),
  ('00000000-0000-0000-0000-0000000000b1', 'B', 3, 'Kuchen', true);

-- Ruhezeiten (feste Zeitpunkte, Berlin im Winter = +01)
select pg_temp.expect('Nachts gilt Ruhezeit', loyalty_in_quiet_hours('2026-11-21 22:30:00+01') and loyalty_in_quiet_hours('2026-11-21 03:00:00+01'));
select pg_temp.expect('Tagsüber keine Ruhezeit', not loyalty_in_quiet_hours('2026-11-21 10:00:00+01') and not loyalty_in_quiet_hours('2026-11-21 20:59:00+01'));
create or replace function public.loyalty_in_quiet_hours(p_ts timestamptz) returns boolean language sql stable as $$ select false $$;

-- Kunden: drei Karten mit Push-Abo, zwei erlauben Angebote
set role anon;
select create_loyalty_card('cafe-a')->>'token' as t1 \gset
select create_loyalty_card('cafe-a')->>'token' as t2 \gset
select create_loyalty_card('cafe-a')->>'token' as t3 \gset
select save_push_subscription(:'t1', 'https://push.example/e1', 'k', 'a');
select save_push_subscription(:'t2', 'https://push.example/e2', 'k', 'a');
select save_push_subscription(:'t3', 'https://push.example/e3', 'k', 'a');
select pg_temp.expect('Karte 1 erlaubt Angebote', set_offers_opt_in(:'t1', 'https://push.example/e1', true)->>'ok' = 'true');
select pg_temp.expect('Karte 2 erlaubt Angebote', set_offers_opt_in(:'t2', 'https://push.example/e2', true)->>'ok' = 'true');
select pg_temp.expect('Falscher Kartenlink ändert nichts', set_offers_opt_in('falsch', 'https://push.example/e3', true)->>'error' = 'subscription_not_found');
select pg_temp.expect('Status zeigt Einwilligung', get_push_status(:'t1', 'https://push.example/e1')->>'offers_opt_in' = 'true');
select pg_temp.expect('Status ohne Einwilligung', get_push_status(:'t3', 'https://push.example/e3')->>'offers_opt_in' = 'false');
select pg_temp.expect('Status ohne Abo', get_push_status(:'t3', 'https://push.example/unbekannt')->>'subscribed' = 'false');

-- Inhaber
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'C', false);
select pg_temp.expect('Ohne Programm kein Versand', start_campaign('x', 'T', 'B', 'all', null)->>'error' = 'no_program');
select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.expect('Ungültige Gruppe', start_campaign('x', 'T', 'B', 'alle', null)->>'error' = 'invalid_input');
select pg_temp.expect('Titel zu lang', start_campaign('x', repeat('x', 51), 'B', 'all', null)->>'error' = 'invalid_input');
select pg_temp.expect('Leere Nachricht', start_campaign('x', 'T', '   ', 'all', null)->>'error' = 'invalid_input');
select pg_temp.expect('Ablaufdatum in der Vergangenheit', start_campaign('x', 'T', 'B', 'all', now() - interval '1 day')->>'error' = 'invalid_input');
select pg_temp.expect('Erreichbare Geräte: nur mit Einwilligung', campaign_audience('all') = 2);
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.expect('Andere Inhaber sehen fremde Geräte nicht', campaign_audience('all') = 0);
select set_config('request.jwt.claim.sub', :'A', false);

select start_campaign('Test', 'Heute Cappuccino', 'Nur bis 17 Uhr', 'all', now() + interval '2 days')->>'campaign_id' as cid \gset
select pg_temp.expect('Kampagne gestartet', length(:'cid') = 36);
select pg_temp.expect('Zweites Angebot innerhalb 24 Stunden wird gebremst', start_campaign('y', 'T', 'B', 'all', null)->>'error' = 'too_frequent');
select set_config('request.jwt.claim.sub', :'B', false);
select pg_temp.expect('Fremde Kampagne: keine Empfänger', (select count(*) from get_campaign_targets(:'cid'::uuid)) = 0);
select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.expect('Eigene Kampagne: genau die zwei Geräte mit Einwilligung', (select count(*) from get_campaign_targets(:'cid'::uuid)) = 2);
select pg_temp.expect('Kein doppelter Versand', (select count(*) from get_campaign_targets(:'cid'::uuid)) = 0);
select set_config('request.jwt.claim.sub', :'B', false);
select finish_campaign(:'cid'::uuid, 2);
reset role;
select pg_temp.expect('Fremder Inhaber kann Kampagne nicht abschließen', (select status from loyalty_campaigns where id = :'cid') = 'sending');
set role authenticated; select set_config('request.jwt.claim.sub', :'A', false);
select finish_campaign(:'cid'::uuid, 2);
select pg_temp.expect('Eigener Inhaber schließt ab', (select sent_count from list_my_campaigns() where id = :'cid'::uuid) = 2);
select pg_temp.expect('Inhaber sieht Verlauf mit Namen', (select name from list_my_campaigns() limit 1) = 'Test');

-- Öffentliche Sicht
reset role; set role anon;
select pg_temp.expect('Besucher sehen das aktuelle Angebot', (select count(*) from loyalty_campaigns) = 1);
select pg_temp.expect('Karte zeigt das Angebot', get_loyalty_card(:'t1')->'offer'->>'title' = 'Heute Cappuccino');
do $$ begin
  begin perform name from loyalty_campaigns; raise exception 'FAIL: Besucher lesen interne Spalte';
  exception when insufficient_privilege then raise notice 'PASS: Interne Spalten sind für Besucher gesperrt'; end;
  begin insert into loyalty_campaigns (program_id, name, title, body, created_by) values (gen_random_uuid(), 'a', 'b', 'c', gen_random_uuid());
    raise exception 'FAIL: Besucher legen Kampagne an';
  exception when insufficient_privilege then raise notice 'PASS: Besucher können keine Kampagne anlegen'; end;
  begin perform start_campaign('a', 'b', 'c', 'all', null); raise exception 'FAIL: Besucher starten Kampagne';
  exception when insufficient_privilege then raise notice 'PASS: start_campaign für Besucher gesperrt'; end;
end $$;
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :'A', false);
do $$ begin
  begin insert into loyalty_campaigns (program_id, name, title, body, created_by) values (gen_random_uuid(), 'a', 'b', 'c', gen_random_uuid());
    raise exception 'FAIL: Inhaber schreibt direkt';
  exception when insufficient_privilege then raise notice 'PASS: Inhaber schreiben nur über Funktionen'; end;
end $$;

-- Häufigkeitsgrenze pro Gerät (3 Tage) und Gruppen
reset role;
update loyalty_campaigns set created_at = now() - interval '2 days';
set role authenticated; select set_config('request.jwt.claim.sub', :'A', false);
select start_campaign('Zweite', 'Nochmal', 'Text', 'all', null)->>'campaign_id' as cid2 \gset
select pg_temp.expect('Gerät wurde gerade bedient: keine zweite Nachricht', (select count(*) from get_campaign_targets(:'cid2'::uuid)) = 0);
reset role;
update loyalty_campaigns set created_at = now() - interval '2 days';
update loyalty_push_subscriptions set last_offer_at = null;
update loyalty_cards set last_stamp_at = now() - interval '40 days' where secret_hash = encode(sha256(convert_to(:'t1','UTF8')),'hex');
update loyalty_cards set stamps = 2, last_stamp_at = now() where secret_hash = encode(sha256(convert_to(:'t2','UTF8')),'hex');
set role authenticated; select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.expect('Gruppe: länger nicht besucht', campaign_audience('inactive_30') = 1);
select pg_temp.expect('Gruppe: nicht seit 60 Tagen', campaign_audience('inactive_60') = 0);
select pg_temp.expect('Gruppe: Karte fast voll', campaign_audience('almost_full') = 1);
select pg_temp.expect('Gruppe: kürzlich besucht', campaign_audience('recent_30') = 1);
select pg_temp.expect('Gruppe: Belohnung bereit', campaign_audience('reward_ready') = 0);

-- Nähe-Daten erscheinen nur, wenn aktiv und mit Koordinaten
reset role;
set role anon;
select pg_temp.expect('Nähe zunächst aus', get_loyalty_card(:'t1')->'nearby' = 'null'::jsonb);
reset role;
update loyalty_programs set nearby_enabled = true where name = 'A';
set role anon;
select pg_temp.expect('Nähe ohne Koordinaten bleibt aus', get_loyalty_card(:'t1')->'nearby' = 'null'::jsonb);
reset role;
update loyalty_programs set nearby_lat = 53.0793, nearby_lng = 8.8017, nearby_radius_m = 300, nearby_text = 'Heute doppelter Stempel' where name = 'A';
set role anon;
select pg_temp.expect('Nähe mit Koordinaten wird geliefert', (get_loyalty_card(:'t1')->'nearby'->>'radius_m')::int = 300 and get_loyalty_card(:'t1')->'nearby'->>'text' = 'Heute doppelter Stempel');
reset role;
do $$ begin
  begin update loyalty_programs set nearby_radius_m = 5000 where name = 'A'; raise exception 'FAIL: Radius 5000 erlaubt';
  exception when check_violation then raise notice 'PASS: Radius über 1000 m wird abgelehnt'; end;
  begin update loyalty_programs set nearby_lat = 120 where name = 'A'; raise exception 'FAIL: Breitengrad 120 erlaubt';
  exception when check_violation then raise notice 'PASS: Ungültiger Breitengrad wird abgelehnt'; end;
end $$;

-- Ruhezeit blockiert den Versand
create or replace function public.loyalty_in_quiet_hours(p_ts timestamptz) returns boolean language sql stable as $$ select true $$;
update loyalty_campaigns set created_at = now() - interval '2 days';
set role authenticated; select set_config('request.jwt.claim.sub', :'A', false);
select pg_temp.expect('In der Ruhezeit wird nicht gesendet', start_campaign('z', 'T', 'B', 'all', null)->>'error' = 'quiet_hours');
reset role;
select 'ALLE TESTS BESTANDEN' as ergebnis;
