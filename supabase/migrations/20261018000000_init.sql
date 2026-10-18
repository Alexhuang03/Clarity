-- Clarity : schéma initial
-- Toutes les tables portent user_id et sont protégées par RLS (chaque utilisateur ne voit que ses données).

create extension if not exists vector with schema extensions;

-- Réglages par utilisateur (choix des modèles d'IA)
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  summary_model text not null default 'gemini:gemini-2.5-flash',
  bubble_model text not null default 'groq:openai/gpt-oss-120b',
  explanation_level text not null default 'debutant'
    check (explanation_level in ('debutant', 'intermediaire', 'revision')),
  updated_at timestamptz not null default now()
);

-- Matières (maths, anglais, IA...)
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

-- Un cours = un espace de chat qui regroupe des fichiers (cours + exos)
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title text not null,
  created_at timestamptz not null default now()
);

-- Fichiers uploadés
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  kind text not null default 'cours' check (kind in ('cours', 'exo')),
  filename text not null,
  mime_type text not null,
  storage_path text not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'parsing', 'ready', 'error')),
  page_count int,
  error text,
  created_at timestamptz not null default now()
);

-- Morceaux de texte extraits (servent de sources citables + recherche sémantique)
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  ordinal int not null,
  page int,
  section text,
  content text not null,
  embedding extensions.vector(768),
  created_at timestamptz not null default now()
);
create index chunks_course_idx on public.chunks (course_id, document_id, ordinal);
create index chunks_embedding_idx on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- Parties d'un cours long (l'utilisateur choisit par laquelle commencer)
create table public.course_parts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  ordinal int not null,
  title text not null,
  -- morceaux couverts : liste d'ids de chunks
  chunk_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Messages du chat principal. Un message de l'IA est figé : son contenu ne change jamais,
-- ce qui garantit que les annotations restent ancrées.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  part_id uuid references public.course_parts (id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]',
  model text,
  created_at timestamptz not null default now()
);
create index messages_course_idx on public.messages (course_id, created_at);

-- Annotations posées sur un message : surlignage, question, ou "ce que j'ai compris".
-- anchor = { quote, prefix, suffix, start, end } (sélecteur façon W3C Web Annotation)
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  kind text not null check (kind in ('highlight', 'question', 'understanding')),
  color text,
  anchor jsonb not null,
  note text,
  status text not null default 'open' check (status in ('open', 'understood')),
  created_at timestamptz not null default now()
);
create index annotations_message_idx on public.annotations (message_id);

-- Fil de discussion attaché à une annotation (bulle latérale)
create table public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  annotation_id uuid not null references public.annotations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]',
  model text,
  created_at timestamptz not null default now()
);
create index thread_messages_annotation_idx on public.thread_messages (annotation_id, created_at);

-- Les messages figés ne peuvent pas être modifiés
create function public.forbid_update() returns trigger language plpgsql as $$
begin
  raise exception 'Ce contenu est figé et ne peut pas être modifié';
end $$;
create trigger messages_immutable before update on public.messages
  for each row execute function public.forbid_update();

-- RLS : chaque utilisateur n'accède qu'à ses propres lignes
do $$
declare t text;
begin
  foreach t in array array['user_settings', 'subjects', 'courses', 'documents', 'chunks',
                           'course_parts', 'messages', 'annotations', 'thread_messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Recherche sémantique dans les morceaux d'un cours
create function public.match_chunks(
  p_course_id uuid,
  p_query_embedding extensions.vector(768),
  p_match_count int default 8
) returns table (
  id uuid, document_id uuid, ordinal int, page int, section text, content text, similarity float
) language sql stable security invoker set search_path = public, extensions as $$
  select c.id, c.document_id, c.ordinal, c.page, c.section, c.content,
         1 - (c.embedding <=> p_query_embedding) as similarity
  from public.chunks c
  where c.course_id = p_course_id and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- Stockage privé des fichiers : chemin = <user_id>/<course_id>/<fichier>
insert into storage.buckets (id, name, public) values ('documents', 'documents', false);

create policy "own files" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
