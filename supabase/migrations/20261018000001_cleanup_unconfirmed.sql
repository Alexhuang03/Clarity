-- Supprime chaque nuit les comptes jamais vérifiés depuis plus de 24 h
-- (fautes de frappe, fausses adresses, inscriptions abandonnées).
-- Le code de vérification expire après 1 h, donc ces comptes ne peuvent plus être activés.

create extension if not exists pg_cron;

select cron.schedule(
  'supprimer-comptes-non-verifies',
  '0 3 * * *',
  $$
    delete from auth.users
    where email_confirmed_at is null
      and created_at < now() - interval '24 hours'
  $$
);
