-- Réflexion du modèle pendant la rédaction (affichée repliée au-dessus de la réponse)
alter table public.messages add column thinking text;
alter table public.messages add column thinking_ms int;
