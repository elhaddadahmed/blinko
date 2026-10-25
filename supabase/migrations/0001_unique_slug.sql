-- Sichert die Eindeutigkeit der öffentlichen Profiladresse und
-- genau ein Profil pro Unternehmen. Nicht destruktiv.
-- Schlägt fehl, wenn bereits doppelte Slugs existieren (dann zuerst bereinigen).
create unique index if not exists business_profiles_slug_key
  on public.business_profiles (slug);

create unique index if not exists business_profiles_business_id_key
  on public.business_profiles (business_id);
