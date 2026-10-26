-- Documents importés depuis un lien (page web, fichier en ligne, Google Drive...) : adresse d'origine
alter table public.documents
  add column source_url text check (source_url is null or (char_length(source_url) <= 2000 and source_url ~ '^https?://'));
