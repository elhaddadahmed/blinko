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
