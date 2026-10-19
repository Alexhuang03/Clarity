-- Partage d'un cours par lien (lecture seule), comme les liens partagés de ChatGPT.
-- Le lien montre la conversation telle qu'elle était au moment du partage (shared_at) :
-- les messages envoyés ensuite n'apparaissent qu'après « Mettre à jour le lien ».

create table public.course_shares (
  course_id uuid primary key references public.courses (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 122 bits aléatoires : impossible à deviner
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  shared_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.course_shares enable row level security;

-- On ne peut partager que ses propres cours
create policy "own rows" on public.course_shares for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid()))
  );

-- Contenu visible avec le lien : titre, matière, parties et messages jusqu'à shared_at.
-- Les fichiers originaux et les morceaux de texte restent privés.
create function public.get_shared_course(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', c.title,
    'subject', (select jsonb_build_object('name', s.name, 'color', s.color) from public.subjects s where s.id = c.subject_id),
    'shared_at', sh.shared_at,
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'ordinal', p.ordinal, 'title', p.title) order by p.ordinal)
      from public.course_parts p where p.course_id = c.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'role', m.role, 'kind', m.kind, 'part_id', m.part_id, 'content', m.content,
        'sources', m.sources, 'thinking', m.thinking, 'thinking_ms', m.thinking_ms, 'created_at', m.created_at
      ) order by m.created_at)
      from public.messages m where m.course_id = c.id and m.created_at <= sh.shared_at
    ), '[]'::jsonb)
  )
  from public.course_shares sh
  join public.courses c on c.id = sh.course_id
  where sh.token = p_token;
$$;

revoke execute on function public.get_shared_course(text) from public;
grant execute on function public.get_shared_course(text) to anon, authenticated;
