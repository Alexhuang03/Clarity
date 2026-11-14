-- Preuve du consentement aux CGU / politique de confidentialité (RGPD), non modifiable par l'utilisateur.
-- L'inscription envoie legal_version et legal_accepted_at dans les métadonnées du compte ; celles-ci restent
-- modifiables par l'utilisateur (auth.updateUser), donc on les recopie ici à la création du compte,
-- dans une table que seul le serveur peut écrire.

create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legal_version text not null check (legal_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, legal_version)
);
create index if not exists legal_consents_user_idx on public.legal_consents (user_id, created_at desc);

-- Lecture seule pour le propriétaire ; aucune écriture hors serveur (service_role) et déclencheur
alter table public.legal_consents enable row level security;
revoke all on public.legal_consents from anon, authenticated;
grant select on public.legal_consents to authenticated;
grant all on public.legal_consents to service_role;
drop policy if exists "own consents" on public.legal_consents;
create policy "own consents" on public.legal_consents for select to authenticated
  using (user_id = (select auth.uid()));

-- Recopie depuis les métadonnées : format validé, longueurs plafonnées, date bornée.
-- Ne fait JAMAIS échouer l'inscription : toute donnée invalide est simplement ignorée.
create or replace function public.record_legal_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_version text;
  v_raw_date text;
  v_accepted timestamptz;
begin
  begin
    v_version := left(new.raw_user_meta_data ->> 'legal_version', 32);
    v_raw_date := left(new.raw_user_meta_data ->> 'legal_accepted_at', 40);
    if v_version is null or v_version !~ '^[A-Za-z0-9._-]{1,32}$' then
      return new;
    end if;
    -- Date fournie par le navigateur : acceptée seulement si plausible (sinon, date de création du compte)
    begin
      v_accepted := v_raw_date::timestamptz;
    exception when others then
      v_accepted := null;
    end;
    if v_accepted is null
       or v_accepted > coalesce(new.created_at, now()) + interval '5 minutes'
       or v_accepted < coalesce(new.created_at, now()) - interval '1 day' then
      v_accepted := coalesce(new.created_at, now());
    end if;
    insert into public.legal_consents (user_id, legal_version, accepted_at)
    values (new.id, v_version, v_accepted)
    on conflict (user_id, legal_version) do nothing;
  exception when others then
    raise warning 'legal_consents : consentement non enregistré pour % (%)', new.id, sqlerrm;
  end;
  return new;
end $$;

revoke execute on function public.record_legal_consent() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_legal_consent on auth.users;
create trigger on_auth_user_created_legal_consent
  after insert on auth.users
  for each row execute function public.record_legal_consent();

-- Comptes existants : reprise depuis leurs métadonnées actuelles (mêmes règles, une erreur n'arrête rien)
do $$
declare
  u record;
  v_accepted timestamptz;
begin
  for u in
    select id, created_at, raw_user_meta_data from auth.users
    where (raw_user_meta_data ->> 'legal_version') ~ '^[A-Za-z0-9._-]{1,32}$'
  loop
    begin
      v_accepted := left(u.raw_user_meta_data ->> 'legal_accepted_at', 40)::timestamptz;
    exception when others then
      v_accepted := null;
    end;
    if v_accepted is null
       or v_accepted > u.created_at + interval '5 minutes'
       or v_accepted < u.created_at - interval '1 day' then
      v_accepted := u.created_at;
    end if;
    insert into public.legal_consents (user_id, legal_version, accepted_at)
    values (u.id, u.raw_user_meta_data ->> 'legal_version', v_accepted)
    on conflict (user_id, legal_version) do nothing;
  end loop;
end $$;
