-- Sicherheitstests für 0002_loyalty.sql. NUR gegen eine lokale Test-Datenbank ausführen,
-- NICHT in der Produktionsdatenbank (legt Testdaten an und räumt sie nicht auf).
-- Erwartung: Jede Zeile "PASS ...". Bei einem Fehler bricht das Skript ab.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  raise notice 'PASS: %', name;
end $$;

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
end $$;

-- Testdaten (als Superuser)
insert into businesses (id, owner_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b');
insert into business_profiles (business_id, slug, name, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', 'cafe-a', 'Café A', true),
  ('00000000-0000-0000-0000-0000000000b1', 'cafe-b', 'Café B', true);
insert into loyalty_programs (business_id, name, stamps_required, reward, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'A-Karte', 3, 'Gratis Kaffee', true),
  ('00000000-0000-0000-0000-0000000000b1', 'B-Karte', 3, 'Gratis Kuchen', true);

\set owner_a '00000000-0000-0000-0000-00000000000a'
\set owner_b '00000000-0000-0000-0000-00000000000b'

-- 1. Kunde ohne Konto legt Karte an und kann sie lesen
set role anon;
select pg_temp.as_user(null);
select (create_loyalty_card('cafe-a')->>'token') as tok_a \gset
select pg_temp.expect('Kunde erhält Kartenlink', length(:'tok_a') = 64);
select pg_temp.expect('Karte lesbar mit Token', (get_loyalty_card(:'tok_a')->>'stamps')::int = 0);
select pg_temp.expect('Falscher Token liefert nichts', get_loyalty_card('falsch')->>'ok' = 'false');
select pg_temp.expect('Unbekanntes Profil abgelehnt', create_loyalty_card('gibts-nicht')->>'ok' = 'false');

-- 2. Anon darf nichts direkt lesen/schreiben
do $$ begin
  begin perform 1 from loyalty_cards; raise exception 'FAIL: anon liest Karten';
  exception when insufficient_privilege then raise notice 'PASS: anon kann Karten nicht lesen'; end;
  begin insert into loyalty_stamps (card_id, program_id, created_by) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL: anon schreibt Stempel';
  exception when insufficient_privilege then raise notice 'PASS: anon kann Stempel nicht schreiben'; end;
  begin perform 1 from loyalty_scan_tokens; raise exception 'FAIL: anon liest Tokens';
  exception when insufficient_privilege then raise notice 'PASS: anon kann Tokens nicht lesen'; end;
end $$;

-- 3. Anon darf nicht stempeln
do $$ begin
  begin perform stamp_card('x', null); raise exception 'FAIL: anon darf stamp_card';
  exception when insufficient_privilege then raise notice 'PASS: stamp_card für anon gesperrt'; end;
  begin perform redeem_reward(gen_random_uuid()); raise exception 'FAIL: anon darf redeem';
  exception when insufficient_privilege then raise notice 'PASS: redeem_reward für anon gesperrt'; end;
end $$;

-- 4. Scan-Token erzeugen
select (issue_scan_token(:'tok_a')->>'token') as scan1, (get_loyalty_card(:'tok_a')->>'stamps') as _s \gset
select (issue_scan_token(:'tok_a')) as j \gset
select (:'j'::jsonb->>'token') as scan2, (:'j'::jsonb->>'code') as code2 \gset
select pg_temp.expect('Scan-Token hat 64 Zeichen, Code 6 Ziffern', length(:'scan2') = 64 and :'code2' ~ '^[0-9]{6}$');

-- 5. Fremder Inhaber B kann Karte von A nicht stempeln
reset role; set role authenticated;
select pg_temp.as_user(:'owner_b');
select pg_temp.expect('Fremder Inhaber: Token abgelehnt', stamp_card(:'scan2', null)->>'error' = 'invalid_or_expired');
select pg_temp.expect('Fremder Inhaber: Code abgelehnt', stamp_card(null, :'code2')->>'error' = 'invalid_or_expired');

-- 6. Nicht angemeldet (authenticated-Rolle ohne uid)
select pg_temp.as_user(null);
select pg_temp.expect('Ohne Anmeldung kein Stempel', stamp_card(:'scan2', null)->>'error' = 'not_authenticated');

-- 7. Inhaber A: Vorschau verändert nichts, Stempel klappt genau einmal
select pg_temp.as_user(:'owner_a');
select pg_temp.expect('Vorschau zeigt Karte', preview_scan(:'scan2', null)->>'stamps' = '0');
select pg_temp.expect('Vorschau verbraucht Token nicht', preview_scan(:'scan2', null)->>'ok' = 'true');
select pg_temp.expect('Stempel 1 per QR', stamp_card(:'scan2', null)->>'stamps' = '1');
select pg_temp.expect('Token nicht wiederverwendbar', stamp_card(:'scan2', null)->>'error' = 'invalid_or_expired');
select pg_temp.expect('Code nicht wiederverwendbar', stamp_card(null, :'code2')->>'error' = 'invalid_or_expired');

-- 8. Alter Token wird durch neuen ersetzt; Stempel per 6-stelligem Code
reset role; set role anon; select pg_temp.as_user(null);
select (issue_scan_token(:'tok_a')) as j \gset
select (:'j'::jsonb->>'token') as scan3, (:'j'::jsonb->>'code') as code3 \gset
select (issue_scan_token(:'tok_a')) as j \gset
select (:'j'::jsonb->>'token') as scan4, (:'j'::jsonb->>'code') as code4 \gset
reset role; set role authenticated; select pg_temp.as_user(:'owner_a');
select pg_temp.expect('Älterer Token verworfen', stamp_card(:'scan3', null)->>'error' = 'invalid_or_expired');
select pg_temp.expect('Stempel 2 per Code', stamp_card(null, :'code4')->>'stamps' = '2');

-- 9. Abgelaufener Token
reset role; update loyalty_scan_tokens set expires_at = now() - interval '1 second';
set role anon; select pg_temp.as_user(null);
select (issue_scan_token(:'tok_a')) as j \gset
select (:'j'::jsonb->>'token') as scan5 \gset
reset role; update loyalty_scan_tokens set expires_at = now() - interval '1 second' where token_hash = encode(sha256(convert_to(:'scan5','UTF8')),'hex');
set role authenticated; select pg_temp.as_user(:'owner_a');
select pg_temp.expect('Abgelaufener Token abgelehnt', stamp_card(:'scan5', null)->>'error' = 'invalid_or_expired');

-- 10. Voll: dritter Stempel, danach kein weiterer, Einlösung genau einmal
reset role; set role anon; select pg_temp.as_user(null);
select (issue_scan_token(:'tok_a')) as j \gset
select (:'j'::jsonb->>'token') as scan6 \gset
reset role; set role authenticated; select pg_temp.as_user(:'owner_a');
select pg_temp.expect('Stempel 3 erreicht Belohnung', stamp_card(:'scan6', null)->>'reward_ready' = 'true');
reset role; set role anon; select pg_temp.as_user(null);
select (issue_scan_token(:'tok_a')) as j \gset
select (:'j'::jsonb->>'token') as scan7 \gset
reset role; set role authenticated; select pg_temp.as_user(:'owner_a');
select pg_temp.expect('Volle Karte: kein weiterer Stempel', stamp_card(:'scan7', null)->>'error' = 'reward_ready');
select (preview_scan(:'scan7', null)->>'card_id') as card_a \gset
select pg_temp.as_user(:'owner_b');
select pg_temp.expect('Fremder Inhaber: Einlösung abgelehnt', redeem_reward(:'card_a'::uuid)->>'error' = 'card_not_found');
select pg_temp.as_user(:'owner_a');
select pg_temp.expect('Einlösung 1 klappt', redeem_reward(:'card_a'::uuid)->>'ok' = 'true');
select pg_temp.expect('Einlösung 2 (Doppelklick) scheitert', redeem_reward(:'card_a'::uuid)->>'error' = 'not_enough_stamps');
select pg_temp.expect('Karte beginnt neue Runde', (select stamps from loyalty_cards where id = :'card_a'::uuid) = 0);

-- 11. Sichtbarkeit (RLS)
select pg_temp.expect('Inhaber A sieht nur eigene Karten', (select count(*) from loyalty_cards) = 1);
select pg_temp.as_user(:'owner_b');
select pg_temp.expect('Inhaber B sieht keine fremden Karten', (select count(*) from loyalty_cards) = 0);
select pg_temp.expect('Inhaber B sieht keine fremden Stempel', (select count(*) from loyalty_stamps) = 0);
do $$ begin
  begin update loyalty_cards set stamps = 99; raise exception 'FAIL: Inhaber darf Karten ändern';
  exception when insufficient_privilege then raise notice 'PASS: Inhaber kann Karten nicht direkt ändern'; end;
  begin insert into loyalty_programs (business_id, name, stamps_required, reward)
    values ('00000000-0000-0000-0000-0000000000a1', 'Fremd', 3, 'x');
    raise exception 'FAIL: B legt Programm für A an';
  exception when insufficient_privilege or check_violation then raise notice 'PASS: B kann kein Programm für A anlegen'; end;
end $$;
reset role; set role anon;
select pg_temp.expect('Anon sieht aktive Programme veröffentlichter Profile', (select count(*) from loyalty_programs) = 2);
reset role; update loyalty_programs set is_active = false where name = 'B-Karte';
update business_profiles set is_published = false where slug = 'cafe-a';
set role anon;
select pg_temp.expect('Inaktive/unveröffentlichte Programme unsichtbar', (select count(*) from loyalty_programs) = 0);
select pg_temp.expect('Karte unveröffentlichter Profile nicht lesbar', get_loyalty_card(:'tok_a')->>'ok' = 'false');
select pg_temp.expect('Keine neue Karte bei inaktivem Programm', create_loyalty_card('cafe-b')->>'ok' = 'false');

-- 12. Begrenzung von Fehlversuchen
reset role; update business_profiles set is_published = true; update loyalty_programs set is_active = true;
set role authenticated; select pg_temp.as_user(:'owner_a');
do $$ declare i int; r jsonb; begin
  for i in 1..10 loop perform preview_scan('00', null); end loop;
  r := preview_scan('00', null);
  if r->>'error' <> 'rate_limited' then raise exception 'FAIL: keine Begrenzung (%)', r; end if;
  raise notice 'PASS: Fehlversuche werden begrenzt';
end $$;
reset role;
select 'ALLE TESTS BESTANDEN' as ergebnis;
