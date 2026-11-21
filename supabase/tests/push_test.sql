-- Tests für 0006_push.sql. NUR gegen lokale Test-Datenbank ausführen (benötigt 0002 und 0003).
\set ON_ERROR_STOP on
create or replace function pg_temp.expect(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  raise notice 'PASS: %', name;
end $$;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into businesses (id, owner_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b');
insert into business_profiles (business_id, slug, name, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', 'cafe-a', 'Café A', true),
  ('00000000-0000-0000-0000-0000000000b1', 'cafe-b', 'Café B', true);
insert into loyalty_programs (business_id, name, stamps_required, reward, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'A', 3, 'Kaffee', true),
  ('00000000-0000-0000-0000-0000000000b1', 'B', 3, 'Kuchen', true);

set role anon;
select create_loyalty_card('cafe-a')->>'token' as tok_a \gset
select create_loyalty_card('cafe-b')->>'token' as tok_b \gset

select pg_temp.expect('Abo mit gültigem Kartenlink wird gespeichert',
  save_push_subscription(:'tok_a', 'https://push.example/abc', 'p256-key', 'auth-key')->>'ok' = 'true');
select pg_temp.expect('Falscher Kartenlink wird abgelehnt',
  save_push_subscription('falsch', 'https://push.example/x', 'k', 'a')->>'error' = 'card_not_found');
select pg_temp.expect('Endpunkt ohne https wird abgelehnt',
  save_push_subscription(:'tok_a', 'http://push.example/x', 'k', 'a')->>'error' = 'invalid_subscription');
select pg_temp.expect('Leerer Schlüssel wird abgelehnt',
  save_push_subscription(:'tok_a', 'https://push.example/y', '', 'a')->>'error' = 'invalid_subscription');
select pg_temp.expect('Gleicher Endpunkt wird aktualisiert',
  save_push_subscription(:'tok_a', 'https://push.example/abc', 'neu', 'neu')->>'ok' = 'true');

select count(save_push_subscription(:'tok_a', 'https://push.example/dev' || g, 'k', 'a')) from generate_series(1, 7) g;
reset role;
select id as card_a from loyalty_cards where program_id = (select id from loyalty_programs where name = 'A') \gset
select id as card_b from loyalty_cards where program_id = (select id from loyalty_programs where name = 'B') \gset
select pg_temp.expect('Höchstens 5 Geräte pro Karte',
  (select count(*) from loyalty_push_subscriptions where card_id = :'card_a') = 5);

select endpoint as ep1 from loyalty_push_subscriptions where card_id = :'card_a' order by endpoint limit 1 \gset
select endpoint as ep2 from loyalty_push_subscriptions where card_id = :'card_a' order by endpoint desc limit 1 \gset

-- Direkter Tabellenzugriff ist gesperrt
set role anon;
do $$ begin
  begin perform 1 from loyalty_push_subscriptions; raise exception 'FAIL: anon liest Abos';
  exception when insufficient_privilege then raise notice 'PASS: Besucher können Abos nicht lesen'; end;
  begin perform get_push_targets(gen_random_uuid()); raise exception 'FAIL: anon ruft get_push_targets';
  exception when insufficient_privilege then raise notice 'PASS: get_push_targets für Besucher gesperrt'; end;
  begin perform prune_push_subscription(gen_random_uuid(), 'https://x'); raise exception 'FAIL: anon ruft prune';
  exception when insufficient_privilege then raise notice 'PASS: prune_push_subscription für Besucher gesperrt'; end;
end $$;

-- Inhaber sehen nur Abos eigener Karten
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect('Inhaber A sieht Empfänger der eigenen Karte',
  (select count(*) from get_push_targets(:'card_a')) = 5);
select pg_temp.expect('Inhaber A sieht Kartenstand und Belohnung',
  (select bool_and(reward = 'Kaffee' and stamps_required = 3 and business_name = 'Café A') from get_push_targets(:'card_a')));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect('Inhaber B sieht keine Empfänger fremder Karten',
  (select count(*) from get_push_targets(:'card_a')) = 0);
select pg_temp.expect('Inhaber B kann fremdes Abo nicht entfernen',
  prune_push_subscription(:'card_a', :'ep1')->>'ok' = 'true');
reset role;
select pg_temp.expect('Fremdes Abo ist unverändert',
  (select count(*) from loyalty_push_subscriptions where card_id = :'card_a') = 5);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select prune_push_subscription(:'card_a', :'ep1');
reset role;
select pg_temp.expect('Inhaber A kann abgelaufenes Abo entfernen',
  (select count(*) from loyalty_push_subscriptions where card_id = :'card_a') = 4);

-- Kunde entfernt sein Abo selbst, nur mit dem richtigen Link
set role anon;
select remove_push_subscription(:'tok_b', :'ep2');
reset role;
select pg_temp.expect('Falscher Kartenlink entfernt nichts',
  (select count(*) from loyalty_push_subscriptions where card_id = :'card_a') = 4);
set role anon;
select remove_push_subscription(:'tok_a', :'ep2');
reset role;
select pg_temp.expect('Richtiger Kartenlink entfernt das Abo',
  (select count(*) from loyalty_push_subscriptions where card_id = :'card_a') = 3);

-- Konto löschen entfernt auch die Abos
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select delete_my_account();
reset role;
select pg_temp.expect('Beim Löschen des Kontos verschwinden die Abos',
  (select count(*) from loyalty_push_subscriptions) = 0);
select 'ALLE TESTS BESTANDEN' as ergebnis;
