-- Tests für 0004 und 0005. NUR gegen lokale Test-Datenbank (mit Storage-Nachbau) ausführen.
\set ON_ERROR_STOP on
create or replace function pg_temp.expect(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  raise notice 'PASS: %', name;
end $$;

insert into businesses (id, owner_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b');
insert into business_profiles (business_id, slug, name, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', 'cafe-a', 'Café A', true),
  ('00000000-0000-0000-0000-0000000000b1', 'cafe-b', 'Café B', true);
insert into loyalty_programs (business_id, name, stamps_required, reward, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'A', 3, 'x', true),
  ('00000000-0000-0000-0000-0000000000b1', 'B', 3, 'y', true);

-- Begrenzung: 30 Karten gehen, die 31. nicht; andere Programme sind nicht betroffen
set role anon;
do $$ declare i int; r jsonb; begin
  for i in 1..30 loop
    r := create_loyalty_card('cafe-a');
    if r->>'ok' <> 'true' then raise exception 'FAIL: Karte % abgelehnt (%)', i, r; end if;
  end loop;
  r := create_loyalty_card('cafe-a');
  if r->>'error' <> 'rate_limited' then raise exception 'FAIL: keine Begrenzung (%)', r; end if;
  raise notice 'PASS: 30 Karten erlaubt, die 31. wird begrenzt';
  r := create_loyalty_card('cafe-b');
  if r->>'ok' <> 'true' then raise exception 'FAIL: anderes Programm blockiert'; end if;
  raise notice 'PASS: anderes Programm bleibt unberührt';
end $$;
reset role;
update loyalty_cards set created_at = now() - interval '11 minutes'
  where program_id = (select id from loyalty_programs where name = 'A');
set role anon;
select pg_temp.expect('Nach 10 Minuten wieder erlaubt', create_loyalty_card('cafe-a')->>'ok' = 'true');
reset role;
update loyalty_cards set created_at = now() - interval '12 hours'
  where program_id = (select id from loyalty_programs where name = 'A');
insert into loyalty_cards (program_id, secret_hash, created_at)
  select (select id from loyalty_programs where name = 'A'), 'x' || g, now() - interval '12 hours' from generate_series(1, 270) g;
set role anon;
select pg_temp.expect('Tageslimit (300) greift', create_loyalty_card('cafe-a')->>'error' = 'rate_limited');
reset role;

-- Logo-Speicher
select pg_temp.expect('Bucket logos ist öffentlich und auf 1 MB begrenzt',
  (select public and file_size_limit = 1048576 from storage.buckets where id = 'logos'));
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into storage.objects (bucket_id, name) values ('logos', '00000000-0000-0000-0000-0000000000a1/logo.png');
select pg_temp.expect('Inhaber lädt Logo im eigenen Ordner hoch', true);
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('logos', '00000000-0000-0000-0000-0000000000b1/logo.png');
    raise exception 'FAIL: Upload in fremden Ordner';
  exception when insufficient_privilege then raise notice 'PASS: Upload in fremden Ordner abgelehnt'; end;
  begin insert into storage.objects (bucket_id, name) values ('logos', 'logo.png');
    raise exception 'FAIL: Upload ohne Ordner';
  exception when insufficient_privilege then raise notice 'PASS: Upload ohne Ordner abgelehnt'; end;
  begin insert into storage.objects (bucket_id, name) values ('andere', '00000000-0000-0000-0000-0000000000a1/logo.png');
    raise exception 'FAIL: Upload in anderen Bucket';
  exception when insufficient_privilege then raise notice 'PASS: Upload in anderen Bucket abgelehnt'; end;
end $$;
reset role; set role anon;
select pg_temp.expect('Besucher sehen Logos', (select count(*) from storage.objects where bucket_id = 'logos') = 1);
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('logos', '00000000-0000-0000-0000-0000000000a1/x.png');
    raise exception 'FAIL: anon lädt hoch';
  exception when insufficient_privilege then raise notice 'PASS: Besucher können nicht hochladen'; end;
end $$;
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
delete from storage.objects where name = '00000000-0000-0000-0000-0000000000a1/logo.png';
reset role;
select pg_temp.expect('Fremder Inhaber kann Logo nicht löschen', (select count(*) from storage.objects) = 1);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
delete from storage.objects where name = '00000000-0000-0000-0000-0000000000a1/logo.png';
reset role;
select pg_temp.expect('Eigener Inhaber kann Logo löschen', (select count(*) from storage.objects) = 0);
select 'ALLE TESTS BESTANDEN' as ergebnis;
