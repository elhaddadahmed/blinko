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
