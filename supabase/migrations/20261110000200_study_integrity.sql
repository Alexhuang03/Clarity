-- Intégrité des quiz : l'utilisateur ne peut ni lire le corrigé avant de rendre sa copie,
-- ni modifier lui-même ses notes.
-- 1. Corrigés déplacés dans study_quiz_keys (aucun accès pour anon / authenticated : serveur seulement).
--    study_quizzes.questions ne garde que la version publique (énoncé, choix, notion, difficulté, points).
-- 2. Les tentatives (démarrage, réponses, notes, date de remise) ne sont plus écrites que par le serveur
--    (clé secrète), après vérification de la propriété. L'utilisateur garde la lecture et la suppression.
-- 3. Les quiz ne sont plus modifiables par l'utilisateur (durée, questions...) : création et suppression seulement.

create table public.study_quiz_keys (
  quiz_id uuid primary key references public.study_quizzes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  -- Questions complètes : réponses, corrigés, barèmes, explications, sources
  questions jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS activée sans politique + privilèges retirés : illisible et non modifiable hors serveur
alter table public.study_quiz_keys enable row level security;
revoke all on public.study_quiz_keys from anon, authenticated;
grant all on public.study_quiz_keys to service_role;

-- Reprise des quiz existants : corrigé copié, puis retiré de la version lisible
insert into public.study_quiz_keys (quiz_id, user_id, course_id, questions, created_at)
select id, user_id, course_id, questions, created_at from public.study_quizzes
on conflict (quiz_id) do nothing;

update public.study_quizzes q
set questions = coalesce((
  select jsonb_agg(e - array['answer', 'answers', 'expected', 'rubric', 'explanation', 'sources'] order by ord)
  from jsonb_array_elements(q.questions) with ordinality as t (e, ord)
), '[]'::jsonb)
where jsonb_typeof(q.questions) = 'array';

-- Quiz : plus de modification directe
revoke update on public.study_quizzes from anon, authenticated;

-- Tentatives : plus d'insertion ni de modification directes (le serveur écrit avec la clé secrète)
revoke insert, update on public.study_attempts from anon, authenticated;
