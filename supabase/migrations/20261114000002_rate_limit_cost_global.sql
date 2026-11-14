-- Limitation de débit : coût par appel et compteurs globaux (tous utilisateurs)
-- 1. p_cost : un seul appel compte plusieurs unités (ex. une génération du mode professeur = 8 appels à l'IA prévus).
--    Défaut 1 : les appels existants (4 paramètres nommés) ne changent pas.
-- 2. Compteurs globaux : l'identifiant sentinelle 00000000-0000-0000-0000-000000000000 (pas un utilisateur,
--    rate_limits.user_id référence auth.users) est compté dans une table à part.

create table if not exists public.rate_limits_global (
  bucket text primary key check (bucket ~ '^[a-z0-9:_.-]{1,64}$'),
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table public.rate_limits_global enable row level security;
revoke all on public.rate_limits_global from anon, authenticated;

-- Remplace la version à 4 paramètres : deux surcharges rendraient les appels nommés ambigus
drop function if exists public.rate_limit_hit(uuid, text, int, int);

create or replace function public.rate_limit_hit(
  p_user_id uuid,
  p_bucket text,
  p_limit int,
  p_window_seconds int,
  p_cost int default 1
) returns table (allowed boolean, remaining int, retry_after int)
language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz;
  v_hits int;
  v_window interval;
begin
  if p_limit < 1 or p_limit > 100000 or p_window_seconds < 1 or p_window_seconds > 604800
     or p_cost < 1 or p_cost > 1000 then
    raise exception 'Paramètres de limite invalides' using errcode = '22023';
  end if;
  v_window := make_interval(secs => p_window_seconds);

  if p_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    insert into public.rate_limits_global as r (bucket, window_start, hits)
    values (p_bucket, now(), p_cost)
    on conflict (bucket) do update
      set window_start = case when r.window_start + v_window <= now() then now() else r.window_start end,
          hits = case when r.window_start + v_window <= now() then p_cost else r.hits + p_cost end
    returning r.window_start, r.hits into v_start, v_hits;
  else
    insert into public.rate_limits as r (user_id, bucket, window_start, hits)
    values (p_user_id, p_bucket, now(), p_cost)
    on conflict (user_id, bucket) do update
      set window_start = case when r.window_start + v_window <= now() then now() else r.window_start end,
          hits = case when r.window_start + v_window <= now() then p_cost else r.hits + p_cost end
    returning r.window_start, r.hits into v_start, v_hits;
  end if;

  allowed := v_hits <= p_limit;
  remaining := greatest(p_limit - v_hits, 0);
  retry_after := greatest(ceil(extract(epoch from (v_start + v_window - now())))::int, 1);
  return next;
end $$;

revoke execute on function public.rate_limit_hit(uuid, text, int, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(uuid, text, int, int, int) to service_role;
