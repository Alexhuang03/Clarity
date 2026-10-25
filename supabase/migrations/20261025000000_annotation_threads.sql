-- Bulles de discussion dans les marges (étape 4b)

-- Jugement de l'IA :
-- - erreur signalée : le passage revérifié est-il juste ? (right = passage correct, wrong = erreur confirmée)
-- - « ce que j'ai compris » : la reformulation de l'étudiant est-elle juste ?
alter table public.annotations
  add column verdict text check (verdict in ('right', 'partial', 'wrong'));

-- Un fil appartient toujours à une annotation de son auteur (la RLS seule vérifie user_id, pas l'annotation visée)
create function public.check_thread_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.annotations a where a.id = new.annotation_id and a.user_id = new.user_id) then
    raise exception 'Annotation introuvable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger thread_messages_owner before insert on public.thread_messages
  for each row execute function public.check_thread_owner();
