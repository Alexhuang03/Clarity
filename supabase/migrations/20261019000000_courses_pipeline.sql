-- Étapes 2 et 3 : traitement des documents, plan du cours, résumés et chat

-- Modèles par défaut : alias "latest" de Gemini (2.5 n'est plus ouvert aux nouveaux comptes)
alter table public.user_settings alter column summary_model set default 'gemini:gemini-flash-latest';

-- Suivi du traitement des documents
alter table public.documents add column progress int not null default 0;
alter table public.documents add column char_count int;

-- Date de la dernière analyse (découpage en parties). null = pas encore analysé.
alter table public.courses add column analyzed_at timestamptz;

-- Type de message dans la conversation principale
alter table public.messages add column kind text not null default 'chat'
  check (kind in ('chat', 'summary'));

-- Les parties sont recréées à chaque nouvelle analyse
alter table public.course_parts add constraint course_parts_ordinal_unique unique (course_id, ordinal);

-- Recherche sémantique, avec filtre optionnel sur certains documents (ex. seulement les exos)
drop function public.match_chunks(uuid, extensions.vector, int);
create function public.match_chunks(
  p_course_id uuid,
  p_query_embedding extensions.vector(768),
  p_match_count int default 8,
  p_document_ids uuid[] default null
) returns table (
  id uuid, document_id uuid, ordinal int, page int, section text, content text, similarity float
) language sql stable security invoker set search_path = public, extensions as $$
  select c.id, c.document_id, c.ordinal, c.page, c.section, c.content,
         1 - (c.embedding <=> p_query_embedding) as similarity
  from public.chunks c
  where c.course_id = p_course_id
    and c.embedding is not null
    and (p_document_ids is null or c.document_id = any (p_document_ids))
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- Fichiers : 20 Mo max (limite d'envoi direct à Gemini) et types acceptés
update storage.buckets
set file_size_limit = 20 * 1024 * 1024,
    allowed_mime_types = array[
      'application/pdf',
      'text/markdown', 'text/plain', 'text/x-markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/png', 'image/jpeg', 'image/webp'
    ]
where id = 'documents';

-- Seul le contenu d'un message est figé (les annotations s'y ancrent). Le lien vers une partie
-- peut changer : il passe à null quand une nouvelle analyse remplace les parties.
create or replace function public.forbid_update() returns trigger language plpgsql as $$
begin
  if new.content is distinct from old.content
     or new.sources is distinct from old.sources
     or new.role is distinct from old.role
     or new.kind is distinct from old.kind
     or new.course_id is distinct from old.course_id then
    raise exception 'Ce contenu est figé et ne peut pas être modifié';
  end if;
  return new;
end $$;
