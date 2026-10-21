-- Roue d'émotes : une réaction (émote LoL) collée sur un passage
alter table public.annotations add column emote text;

alter table public.annotations drop constraint annotations_kind_check;
alter table public.annotations add constraint annotations_kind_check
  check (kind in ('highlight', 'question', 'understanding', 'error', 'reaction'));

-- Une réaction a toujours une émote, et seulement elle
alter table public.annotations add constraint annotations_emote_check
  check ((kind = 'reaction') = (emote is not null));
