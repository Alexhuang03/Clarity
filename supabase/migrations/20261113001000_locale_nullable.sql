-- Langue : null = pas encore choisie. Avec « not null default 'fr' », toutes les lignes existantes valaient 'fr'
-- sans que personne ne l'ait choisi, et la synchronisation à la connexion imposait le français à tout le monde.
-- Désormais : null → la langue de l'interface (cookie) s'applique et est enregistrée à la connexion.

alter table public.user_settings alter column locale drop default;
alter table public.user_settings alter column locale drop not null;

alter table public.user_settings drop constraint if exists user_settings_locale_check;
alter table public.user_settings
  add constraint user_settings_locale_check check (locale is null or locale in ('fr', 'en', 'zh'));

-- Aucune langue n'a encore été choisie délibérément (fonction toute récente) : on repart de zéro
update public.user_settings set locale = null where locale is not null;
