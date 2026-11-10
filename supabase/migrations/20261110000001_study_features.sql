-- Outils de révision générés à partir du contenu d'un cours :
-- quiz / examen blanc / test rapide, flashcards (répétition espacée), fiches de révision,
-- cartes mentales et suivi de la maîtrise par notion.
--
-- Chaque table porte user_id ET course_id : la RLS vérifie que la ligne appartient à l'utilisateur
-- et que le cours visé est bien le sien (impossible de rattacher une ligne au cours d'un autre).

-- ---------------------------------------------------------------- Quiz, examens blancs, tests rapides
create table public.study_quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  mode text not null check (mode in ('quiz', 'exam', 'quick')),
  title text not null check (char_length(title) <= 200),
  -- Réglages de génération (nombre, difficulté, types, périmètre...)
  config jsonb not null default '{}',
  -- Questions complètes, réponses comprises (jamais renvoyées avant la remise d'une tentative)
  questions jsonb not null default '[]',
  question_count int not null default 0,
  -- Examen blanc : durée en secondes (null = pas de limite)
  time_limit_sec int check (time_limit_sec is null or time_limit_sec between 60 and 14400),
  model text,
  created_at timestamptz not null default now()
);
create index study_quizzes_course_idx on public.study_quizzes (course_id, created_at desc);

create table public.study_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  quiz_id uuid not null references public.study_quizzes (id) on delete cascade,
  started_at timestamptz not null default now(),
  -- Fin prévue (examen blanc chronométré), null sinon
  deadline_at timestamptz,
  -- Réponses reçues (figées dès la première remise, même si la correction par l'IA échoue et doit être relancée)
  answered_at timestamptz,
  -- Correction terminée
  submitted_at timestamptz,
  -- Rendu après la fin prévue (+ marge)
  late boolean not null default false,
  score numeric,
  max_score numeric,
  answers jsonb not null default '{}',
  -- Correction question par question (exactitude, points, explication, retour, sources)
  results jsonb not null default '[]',
  feedback text
);
create index study_attempts_quiz_idx on public.study_attempts (quiz_id, started_at desc);
create index study_attempts_course_idx on public.study_attempts (course_id, submitted_at desc);

-- ---------------------------------------------------------------- Flashcards
create table public.study_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  created_at timestamptz not null default now()
);
create index study_decks_course_idx on public.study_decks (course_id, created_at desc);

create table public.study_flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  deck_id uuid not null references public.study_decks (id) on delete cascade,
  front text not null check (char_length(front) between 1 and 2000),
  back text not null check (char_length(back) between 1 and 4000),
  concept text check (concept is null or char_length(concept) <= 120),
  sources jsonb not null default '[]',
  -- Répétition espacée (SM-2)
  ease real not null default 2.5,
  interval_days real not null default 0,
  repetitions int not null default 0,
  lapses int not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_flashcards_deck_idx on public.study_flashcards (deck_id, created_at);
create index study_flashcards_due_idx on public.study_flashcards (user_id, course_id, due_at) where not suspended;

create table public.study_card_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  card_id uuid not null references public.study_flashcards (id) on delete cascade,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  interval_days real not null,
  reviewed_at timestamptz not null default now()
);
create index study_card_reviews_course_idx on public.study_card_reviews (user_id, course_id, reviewed_at desc);

-- ---------------------------------------------------------------- Fiches de révision
create table public.study_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  scope jsonb not null default '{}',
  -- Fiche structurée (notions, définitions, formules, pièges) et sa version markdown
  data jsonb not null default '{}',
  content text not null default '',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_sheets_course_idx on public.study_sheets (course_id, updated_at desc);

-- ---------------------------------------------------------------- Cartes mentales
create table public.study_mindmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  scope jsonb not null default '{}',
  tree jsonb not null,
  model text,
  created_at timestamptz not null default now()
);
create index study_mindmaps_course_idx on public.study_mindmaps (course_id, created_at desc);

-- ---------------------------------------------------------------- Maîtrise par notion
-- Un événement par question corrigée ou carte révisée : score entre 0 et 1 pour une notion.
create table public.study_concept_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  concept_key text not null check (char_length(concept_key) between 1 and 120),
  concept_label text not null check (char_length(concept_label) between 1 and 120),
  score real not null check (score between 0 and 1),
  source text not null check (source in ('quiz', 'exam', 'quick', 'flashcard')),
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index study_concept_events_course_idx on public.study_concept_events (user_id, course_id, created_at desc);

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['study_quizzes', 'study_attempts', 'study_decks', 'study_flashcards',
                           'study_card_reviews', 'study_sheets', 'study_mindmaps', 'study_concept_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (
           user_id = (select auth.uid())
           and exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid()))
         )', t);
  end loop;
end $$;

-- Les lignes rattachées à un parent (tentative → quiz, carte → paquet, révision → carte)
-- doivent viser un parent de l'utilisateur, dans le même cours.
create policy "parent quiz" on public.study_attempts as restrictive for all to authenticated
  using (true)
  with check (exists (
    select 1 from public.study_quizzes q
    where q.id = quiz_id and q.user_id = (select auth.uid()) and q.course_id = study_attempts.course_id
  ));

create policy "parent deck" on public.study_flashcards as restrictive for all to authenticated
  using (true)
  with check (exists (
    select 1 from public.study_decks d
    where d.id = deck_id and d.user_id = (select auth.uid()) and d.course_id = study_flashcards.course_id
  ));

create policy "parent card" on public.study_card_reviews as restrictive for all to authenticated
  using (true)
  with check (exists (
    select 1 from public.study_flashcards f
    where f.id = card_id and f.user_id = (select auth.uid()) and f.course_id = study_card_reviews.course_id
  ));
