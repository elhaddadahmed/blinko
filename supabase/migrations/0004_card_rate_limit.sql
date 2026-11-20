-- Begrenzung beim Anlegen von Treuekarten (Schutz vor Massenanlage).
-- Pro Programm: höchstens 30 neue Karten in 10 Minuten und 300 pro Tag.
-- Hinweis: Das schützt die Datenbank, ersetzt aber kein Captcha. Wer das Limit ausschöpft,
-- kann kurzzeitig neue Karten blockieren. Die Grenzen lassen sich unten anpassen.
create index if not exists loyalty_cards_program_created_idx
  on public.loyalty_cards (program_id, created_at);

create or replace function public.create_loyalty_card(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_program uuid;
  v_token   text;
begin
  select lp.id into v_program
  from public.business_profiles bp
  join public.loyalty_programs lp on lp.business_id = bp.business_id
  where bp.slug = p_slug and bp.is_published = true and lp.is_active = true;

  if v_program is null then
    return jsonb_build_object('ok', false, 'error', 'program_unavailable');
  end if;

  if (select count(*) from public.loyalty_cards
        where program_id = v_program and created_at > now() - interval '10 minutes') >= 30
     or (select count(*) from public.loyalty_cards
        where program_id = v_program and created_at > now() - interval '1 day') >= 300 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.loyalty_cards (program_id, secret_hash)
  values (v_program, public.loyalty_hash(v_token));

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;
