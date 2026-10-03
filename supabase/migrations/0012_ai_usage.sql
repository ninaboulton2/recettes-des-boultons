-- ============================================================================
--  0012 — Journal des appels IA (ai_usage) + quota journalier (check_ai_quota)
-- ============================================================================
--  QUOI
--   - Table `public.ai_usage` : une ligne par appel au fournisseur IA
--     (traducteur de recettes aujourd'hui, transcription/image demain) :
--     qui, quand, quel fournisseur/modèle, tokens entrée/sortie, coût estimé
--     (USD, grille `server/utils/ai/pricing.ts`), statut ok|error, durée.
--     `feature` distingue les usages ('translate' par défaut).
--   - RLS : lecture par le propriétaire (`auth.uid() = user_id`) ou un admin
--     (`private.is_admin()`, 0009) ; insertion par le propriétaire uniquement ;
--     ni update ni delete (journal en append-only).
--   - Fonction `public.check_ai_quota(p_max_per_day int) returns boolean`,
--     SECURITY INVOKER : vrai si l'appelant a fait strictement moins de
--     `p_max_per_day` appels (ok ou error) depuis minuit (Europe/Paris).
--     Compte sous RLS → chaque utilisateur ne voit que ses propres lignes.
--
--  POURQUOI
--   Nina paie l'usage du fournisseur IA : il faut mesurer le coût réel par
--   personne et pouvoir plafonner (AI_DAILY_QUOTA, 50/jour par défaut) avant
--   d'ouvrir le traducteur au-delà des admins (phase 4).
--
--  RÉVERSIBILITÉ : drop function public.check_ai_quota(int) ;
--  drop table public.ai_usage (aucune autre table ne la référence).
--
--  PRÉREQUIS : 0009 (private.is_admin). Idempotente, rejouable.
-- ============================================================================

begin;

create table if not exists public.ai_usage (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  provider           text        not null,
  model              text        not null,
  feature            text        not null default 'translate',
  input_tokens       integer     not null default 0 check (input_tokens >= 0),
  output_tokens      integer     not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  status             text        not null check (status in ('ok', 'error')),
  duration_ms        integer     check (duration_ms is null or duration_ms >= 0)
);

comment on table  public.ai_usage is 'Journal des appels aux fournisseurs IA (coût, tokens, statut) — un enregistrement par appel.';
comment on column public.ai_usage.feature is 'Usage : translate (texte → recette), transcribe, image… ';
comment on column public.ai_usage.estimated_cost_usd is 'Coût estimé en USD d''après la grille serveur (NULL si modèle inconnu).';

create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own_or_admin" on public.ai_usage;
create policy "ai_usage_select_own_or_admin" on public.ai_usage
  for select to authenticated
  using (auth.uid() = user_id or private.is_admin());

drop policy if exists "ai_usage_insert_own" on public.ai_usage;
create policy "ai_usage_insert_own" on public.ai_usage
  for insert to authenticated
  with check (auth.uid() = user_id);

revoke all on public.ai_usage from anon, public;
grant select, insert on public.ai_usage to authenticated;

-- Quota : strictement moins de p_max_per_day appels depuis minuit (Europe/Paris).
create or replace function public.check_ai_quota(p_max_per_day integer)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (
    select count(*)
      from public.ai_usage
     where user_id = auth.uid()
       and created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
  ) < coalesce(p_max_per_day, 0);
$$;

comment on function public.check_ai_quota(integer) is
  'Vrai si l''utilisateur courant a fait moins de p_max_per_day appels IA aujourd''hui (Europe/Paris). SECURITY INVOKER : compte sous RLS.';

revoke execute on function public.check_ai_quota(integer) from public, anon;
grant execute on function public.check_ai_quota(integer) to authenticated, service_role;

do $$
begin
  assert to_regclass('public.ai_usage') is not null, '[0012] table ai_usage absente';
  assert (select relrowsecurity from pg_class where oid = 'public.ai_usage'::regclass), '[0012] RLS non activée sur ai_usage';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ai_usage') = 2, '[0012] 2 politiques attendues sur ai_usage';
  assert to_regprocedure('public.check_ai_quota(integer)') is not null, '[0012] fonction check_ai_quota absente';
  raise notice '[0012] ai_usage + check_ai_quota OK';
end $$;

commit;
