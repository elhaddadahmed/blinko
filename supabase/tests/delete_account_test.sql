-- Test für 0003_delete_account.sql. NUR gegen eine lokale Test-Datenbank ausführen.
-- Voraussetzung: 0002_loyalty.sql ist angewendet.
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
  ('00000000-0000-0000-0000-0000000000a1', 'A', 3, 'x', true),
  ('00000000-0000-0000-0000-0000000000b1', 'B', 3, 'y', true);
insert into loyalty_cards (program_id, secret_hash) select id, 'h-' || name from loyalty_programs;
insert into loyalty_stamps (card_id, program_id, created_by)
  select c.id, c.program_id, '00000000-0000-0000-0000-00000000000a' from loyalty_cards c;

-- anon darf nicht
set role anon;
do $$ begin
  begin perform delete_my_account(); raise exception 'FAIL: anon darf löschen';
  exception when insufficient_privilege then raise notice 'PASS: anon kann Konto nicht löschen'; end;
end $$;

-- angemeldet, aber ohne uid
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect('Ohne Anmeldung nichts gelöscht', delete_my_account()->>'error' = 'not_authenticated');

-- Inhaber A löscht sein Konto
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect('Löschung meldet Erfolg', delete_my_account()->>'ok' = 'true');
reset role;
select pg_temp.expect('Nutzer A ist weg', (select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000000a') = 0);
select pg_temp.expect('Unternehmen, Profil, Programm von A sind weg',
  (select count(*) from businesses where owner_id = '00000000-0000-0000-0000-00000000000a') = 0
  and (select count(*) from business_profiles where slug = 'cafe-a') = 0
  and (select count(*) from loyalty_programs where name = 'A') = 0);
select pg_temp.expect('Karten und Stempel von A sind weg',
  (select count(*) from loyalty_cards where secret_hash = 'h-A') = 0
  and (select count(*) from loyalty_stamps s where not exists (select 1 from loyalty_cards c where c.id = s.card_id)) = 0);
select pg_temp.expect('Daten von B bleiben unberührt',
  (select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000000b') = 1
  and (select count(*) from business_profiles where slug = 'cafe-b') = 1
  and (select count(*) from loyalty_cards where secret_hash = 'h-B') = 1
  and (select count(*) from loyalty_stamps) = 1);
select 'ALLE TESTS BESTANDEN' as ergebnis;
