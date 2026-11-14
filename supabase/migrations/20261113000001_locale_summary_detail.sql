-- Langue de l'interface et des réponses de l'IA (fr / en / zh), et niveau de détail des résumés.

alter table public.user_settings
  add column if not exists locale text not null default 'fr'
    constraint user_settings_locale_check check (locale in ('fr', 'en', 'zh'));

-- concis : un appel par partie ; détaillé (défaut) : ~16 000 caractères de cours par appel ;
-- très détaillé : ~8 000 caractères par appel (plus d'appels à l'IA, résumés plus longs)
alter table public.user_settings
  add column if not exists summary_detail text not null default 'detaille'
    constraint user_settings_summary_detail_check check (summary_detail in ('concis', 'detaille', 'tres_detaille'));
