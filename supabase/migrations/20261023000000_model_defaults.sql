-- Modèles d'IA : null = chaîne par défaut du code (src/lib/ai/models.ts).
-- Les anciennes valeurs par défaut figées (gemini-2.5-flash…) passaient devant les modèles à jour
-- dès qu'une ligne de réglages existait (créée par exemple en personnalisant les pings).
alter table public.user_settings alter column summary_model drop not null;
alter table public.user_settings alter column summary_model drop default;
alter table public.user_settings alter column bubble_model drop not null;
alter table public.user_settings alter column bubble_model drop default;

update public.user_settings set summary_model = null where summary_model = 'gemini:gemini-2.5-flash';
update public.user_settings set bubble_model = null where bubble_model = 'groq:openai/gpt-oss-120b';
