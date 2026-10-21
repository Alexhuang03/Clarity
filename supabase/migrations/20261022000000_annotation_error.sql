-- Roue d'actions : nouveau type « erreur » (passage jugé faux, à revérifier par l'IA)
-- et statut « resolved » (erreur revérifiée / traitée).
alter table public.annotations drop constraint annotations_kind_check;
alter table public.annotations add constraint annotations_kind_check
  check (kind in ('highlight', 'question', 'understanding', 'error'));

alter table public.annotations drop constraint annotations_status_check;
alter table public.annotations add constraint annotations_status_check
  check (status in ('open', 'understood', 'resolved'));
