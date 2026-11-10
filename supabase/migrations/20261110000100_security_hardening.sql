-- Durcissement de la sécurité
-- 1. Limitation de débit (appels aux IA, imports) partagée entre toutes les instances du serveur
-- 2. Cohérence de propriété : la RLS vérifiait seulement user_id, pas que le cours / document / message
--    référencé appartienne au même utilisateur (on pouvait rattacher une ligne au cours d'un autre)
-- 3. Lien de partage : n'expose que les lignes du propriétaire du cours
-- 4. Chemins de stockage et jetons de partage contraints

-- ---------------------------------------------------------------------------
-- 1. Limitation de débit : une ligne par (utilisateur, compteur), fenêtre fixe
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket ~ '^[a-z0-9:_.-]{1,64}$'),
  window_start timestamptz not null default now(),
  hits int not null default 0,
  primary key (user_id, bucket)
);

-- Aucune politique : seul le serveur (clé secrète, service_role) y accède, via la fonction ci-dessous
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Compte un appel et dit s'il est autorisé. Atomique (un seul upsert), donc sûr en parallèle.
create or replace function public.rate_limit_hit(
  p_user_id uuid,
  p_bucket text,
  p_limit int,
  p_window_seconds int
) returns table (allowed boolean, remaining int, retry_after int)
language plpgsql security definer set search_path = public as $$
declare
  v_row public.rate_limits;
  v_window interval;
begin
  if p_limit < 1 or p_limit > 100000 or p_window_seconds < 1 or p_window_seconds > 604800 then
    raise exception 'Paramètres de limite invalides' using errcode = '22023';
  end if;
  v_window := make_interval(secs => p_window_seconds);

  insert into public.rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user_id, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set window_start = case when r.window_start + v_window <= now() then now() else r.window_start end,
        hits = case when r.window_start + v_window <= now() then 1 else r.hits + 1 end
  returning * into v_row;

  allowed := v_row.hits <= p_limit;
  remaining := greatest(p_limit - v_row.hits, 0);
  retry_after := greatest(ceil(extract(epoch from (v_row.window_start + v_window - now())))::int, 1);
  return next;
end $$;

revoke execute on function public.rate_limit_hit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(uuid, text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Cohérence de propriété des lignes liées
-- ---------------------------------------------------------------------------
-- À l'insertion, et à la modification seulement si une référence change : une mise à null en cascade
-- (ex. messages.part_id pendant la suppression d'un cours) ne doit jamais être bloquée.
create or replace function public.check_owned_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  owner_changed boolean := o is null or n->'user_id' is distinct from o->'user_id';
begin
  if tg_table_name = 'courses' then
    if new.subject_id is not null and (owner_changed or n->'subject_id' is distinct from o->'subject_id')
       and not exists (select 1 from public.subjects s where s.id = new.subject_id and s.user_id = new.user_id) then
      raise exception 'Matière introuvable' using errcode = '42501';
    end if;

  elsif tg_table_name in ('documents', 'course_parts', 'messages', 'chunks') then
    if (owner_changed or n->'course_id' is distinct from o->'course_id')
       and not exists (select 1 from public.courses c where c.id = new.course_id and c.user_id = new.user_id) then
      raise exception 'Cours introuvable' using errcode = '42501';
    end if;
    if tg_table_name = 'documents' and (owner_changed or n->'storage_path' is distinct from o->'storage_path')
       and (n->>'storage_path' not like new.user_id::text || '/%' or n->>'storage_path' like '%..%') then
      raise exception 'Chemin de fichier refusé' using errcode = '42501';
    end if;
    if tg_table_name = 'chunks'
       and (owner_changed or n->'course_id' is distinct from o->'course_id' or n->'document_id' is distinct from o->'document_id')
       and not exists (select 1 from public.documents d
                       where d.id = (n->>'document_id')::uuid and d.user_id = new.user_id and d.course_id = new.course_id) then
      raise exception 'Document introuvable' using errcode = '42501';
    end if;
    if tg_table_name = 'messages' and n->>'part_id' is not null
       and (n->'part_id' is distinct from o->'part_id' or n->'course_id' is distinct from o->'course_id')
       and not exists (select 1 from public.course_parts p
                       where p.id = (n->>'part_id')::uuid and p.course_id = new.course_id and p.user_id = new.user_id) then
      raise exception 'Partie introuvable' using errcode = '42501';
    end if;

  elsif tg_table_name = 'annotations' then
    if (owner_changed or n->'message_id' is distinct from o->'message_id')
       and not exists (select 1 from public.messages m where m.id = (n->>'message_id')::uuid and m.user_id = new.user_id) then
      raise exception 'Message introuvable' using errcode = '42501';
    end if;

  elsif tg_table_name = 'custom_emotes' then
    if n->>'image_path' not like new.user_id::text || '/%' or n->>'image_path' like '%..%'
       or (n->>'sound_path' is not null
           and (n->>'sound_path' not like new.user_id::text || '/%' or n->>'sound_path' like '%..%')) then
      raise exception 'Chemin de fichier refusé' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['courses', 'documents', 'course_parts', 'messages', 'chunks', 'annotations', 'custom_emotes']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_owned_refs', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.check_owned_refs()',
      t || '_owned_refs', t);
  end loop;
end $$;

-- Un fil de discussion ne peut pas non plus être déplacé vers l'annotation d'un autre
drop trigger if exists thread_messages_owner on public.thread_messages;
create trigger thread_messages_owner before insert or update on public.thread_messages
  for each row execute function public.check_thread_owner();

-- ---------------------------------------------------------------------------
-- 3. Jeton de partage : toujours 32 caractères hexadécimaux (128 bits, dont 122 aléatoires).
--    Empêche un utilisateur de choisir un jeton court ou devinable via l'API.
-- ---------------------------------------------------------------------------
alter table public.course_shares drop constraint if exists course_shares_token_format;
alter table public.course_shares add constraint course_shares_token_format check (token ~ '^[0-9a-f]{32}$');

-- Contenu visible avec le lien : seulement les lignes appartenant au propriétaire du cours
create or replace function public.get_shared_course(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', c.title,
    'subject', (select jsonb_build_object('name', s.name, 'color', s.color)
                from public.subjects s where s.id = c.subject_id and s.user_id = c.user_id),
    'shared_at', sh.shared_at,
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'ordinal', p.ordinal, 'title', p.title) order by p.ordinal)
      from public.course_parts p where p.course_id = c.id and p.user_id = c.user_id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'role', m.role, 'kind', m.kind, 'part_id', m.part_id, 'content', m.content,
        'sources', m.sources, 'thinking', m.thinking, 'thinking_ms', m.thinking_ms, 'created_at', m.created_at
      ) order by m.created_at)
      from public.messages m
      where m.course_id = c.id and m.user_id = c.user_id and m.created_at <= sh.shared_at
    ), '[]'::jsonb)
  )
  from public.course_shares sh
  join public.courses c on c.id = sh.course_id and c.user_id = sh.user_id
  where p_token ~ '^[0-9a-f]{32}$' and sh.token = p_token;
$$;

revoke execute on function public.get_shared_course(text) from public;
grant execute on function public.get_shared_course(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Modèles d'IA choisis : format « fournisseur:identifiant » uniquement
--    (le code n'accepte de toute façon que les modèles de sa liste, voir src/lib/ai/models.ts)
-- ---------------------------------------------------------------------------
alter table public.user_settings drop constraint if exists user_settings_model_format;
alter table public.user_settings add constraint user_settings_model_format check (
  (summary_model is null or summary_model ~ '^(gemini|groq|openrouter):[A-Za-z0-9._/:-]{1,100}$')
  and (bubble_model is null or bubble_model ~ '^(gemini|groq|openrouter):[A-Za-z0-9._/:-]{1,100}$')
) not valid;

-- Fonctions internes des déclencheurs : pas appelables directement via l'API
revoke execute on function public.check_owned_refs() from public, anon, authenticated;
