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
