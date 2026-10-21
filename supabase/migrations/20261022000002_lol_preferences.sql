-- Personnalisation des pings et des émotes (page « Mon compte »)

alter table public.user_settings
  -- Ping choisi pour chaque action : {"question": "missing", ...}. Une action absente garde son ping par défaut.
  add column ping_map jsonb not null default '{}'::jsonb check (jsonb_typeof(ping_map) = 'object'),
  -- Les 8 émotes de la roue, de haut dans le sens des aiguilles d'une montre :
  -- slug d'une émote LoL, ou « u:<id> » pour une émote importée. Null = roue par défaut.
  add column emote_wheel text[] check (emote_wheel is null or cardinality(emote_wheel) = 8),
  add column sound_volume real not null default 0.5 check (sound_volume between 0 and 1),
  add column sound_muted boolean not null default false;

-- Émotes importées par l'utilisateur (image et son facultatif, dans le bucket « emotes »)
create table public.custom_emotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  image_path text not null,
  image_type text not null check (image_type in ('png', 'jpeg', 'gif', 'webp')),
  sound_path text,
  sound_type text check (sound_type in ('ogg', 'mp3', 'wav')),
  created_at timestamptz not null default now(),
  check ((sound_path is null) = (sound_type is null))
);
create index custom_emotes_user_idx on public.custom_emotes (user_id, created_at);

alter table public.custom_emotes enable row level security;
create policy "own rows" on public.custom_emotes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Au plus 30 émotes importées par compte (le site tourne sur un petit serveur)
create function public.limit_custom_emotes() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.custom_emotes where user_id = new.user_id) >= 30 then
    raise exception 'Limite de 30 émotes importées atteinte' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger custom_emotes_limit before insert on public.custom_emotes
  for each row execute function public.limit_custom_emotes();

-- Fichiers des émotes : privés, 2 Mo au plus, images et sons uniquement
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emotes', 'emotes', false, 2 * 1024 * 1024,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/wav']);

create policy "own emote files" on storage.objects for all to authenticated
  using (bucket_id = 'emotes' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'emotes' and (storage.foldername(name))[1] = (select auth.uid())::text);
