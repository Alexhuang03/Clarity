-- Mode professeur : cours rédigé par l'IA à partir d'un sujet, sourcé sur le web (Google Search grounding,
-- Wikipédia en secours, ou de mémoire). Le cours est ensuite un cours ordinaire : un document Markdown
-- (dans le stockage), des morceaux + embeddings, une partie par chapitre et un résumé figé par partie.
--
-- Écriture : uniquement par le serveur (clé secrète). Lecture : le propriétaire, et le lien de partage
-- (fonction get_shared_course) pour les sources.

-- ---------------------------------------------------------------------------
-- 1. Origine du cours : 'upload' (fichiers de l'utilisateur) ou 'web' (mode professeur)
-- ---------------------------------------------------------------------------
alter table public.courses add column if not exists origin text not null default 'upload';
alter table public.courses drop constraint if exists courses_origin_check;
alter table public.courses add constraint courses_origin_check check (origin in ('upload', 'web'));

-- La politique « own rows » laisse l'utilisateur modifier ses cours : l'origine, elle, n'est fixée que par le serveur
create or replace function public.protect_course_origin() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.origin is distinct from 'upload' then
      raise exception 'Origine du cours refusée' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.origin is distinct from old.origin then
      raise exception 'Origine du cours non modifiable' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.protect_course_origin() from public, anon, authenticated;

drop trigger if exists courses_origin_protect on public.courses;
create trigger courses_origin_protect before insert or update on public.courses
  for each row execute function public.protect_course_origin();

-- ---------------------------------------------------------------------------
-- 2. Métadonnées d'un cours web (une ligne par cours)
-- ---------------------------------------------------------------------------
create table if not exists public.course_web (
  course_id uuid primary key references public.courses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Document Markdown qui porte le texte du cours (null s'il a été supprimé)
  document_id uuid references public.documents (id) on delete set null,
  topic text not null check (char_length(topic) between 1 and 200),
  level text check (level is null or char_length(level) <= 60),
  goal text check (goal is null or char_length(goal) <= 300),
  locale text not null default 'fr' check (locale in ('fr', 'en', 'zh')),
  -- false : rédigé sans source vérifiée (l'interface affiche un avertissement)
  grounded boolean not null default false,
  provider text not null default 'none' check (provider in ('google', 'wikipedia', 'none')),
  -- Suggestions de recherche Google (HTML fourni par Google, affiché dans une iframe isolée)
  search_entry_point_html text check (search_entry_point_html is null or char_length(search_entry_point_html) <= 65536),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Sources web d'un cours, numérotées [1], [2]... (liste unifiée et dédupliquée)
-- ---------------------------------------------------------------------------
create table if not exists public.course_web_sources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  n int not null check (n between 1 and 500),
  title text not null check (char_length(title) between 1 and 300),
  url text not null check (char_length(url) <= 2048 and url ~ '^https?://'),
  domain text not null check (char_length(domain) between 1 and 255),
  created_at timestamptz not null default now(),
  unique (course_id, n)
);
create index if not exists course_web_sources_course_idx on public.course_web_sources (course_id, n);

-- Lecture seule pour le propriétaire ; aucune écriture possible depuis le navigateur
alter table public.course_web enable row level security;
alter table public.course_web_sources enable row level security;

drop policy if exists "owner read" on public.course_web;
create policy "owner read" on public.course_web for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "owner read" on public.course_web_sources;
create policy "owner read" on public.course_web_sources for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.course_web, public.course_web_sources from anon, authenticated;
revoke all on public.course_web, public.course_web_sources from anon;

-- ---------------------------------------------------------------------------
-- 4. Lien de partage : les sources web accompagnent le contenu partagé (le texte cite [1], [2]...)
--    Reprise de la version de 20261110000100_security_hardening.sql, avec la clé « web » en plus.
-- ---------------------------------------------------------------------------
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
    ), '[]'::jsonb),
    'web', (
      select jsonb_build_object(
        'origin', 'web',
        'grounded', w.grounded,
        'provider', w.provider,
        'searchEntryPointHtml', w.search_entry_point_html,
        'sources', coalesce((
          select jsonb_agg(jsonb_build_object('n', ws.n, 'title', ws.title, 'url', ws.url, 'domain', ws.domain) order by ws.n)
          from public.course_web_sources ws where ws.course_id = c.id and ws.user_id = c.user_id
        ), '[]'::jsonb)
      )
      from public.course_web w where w.course_id = c.id and w.user_id = c.user_id
    )
  )
  from public.course_shares sh
  join public.courses c on c.id = sh.course_id and c.user_id = sh.user_id
  where p_token ~ '^[0-9a-f]{32}$' and sh.token = p_token;
$$;

revoke execute on function public.get_shared_course(text) from public;
grant execute on function public.get_shared_course(text) to anon, authenticated;
