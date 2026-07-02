-- ============================================================
--  0010: Matches reference teams from the database.
--  A match can only be created for teams that already exist in
--  public.teams (enforced in the app; FKs enforce integrity here).
--
--  Shirt numbers are PER MATCH (a player wears different numbers
--  in different matches), so players.number is no longer written —
--  the per-match number lives in matches.lineups (JSONB roster).
--  Kept drop-free: no DROP / DELETE, safe to run and re-run.
-- ============================================================

alter table public.matches
  add column if not exists home_team_id uuid references public.teams(id),
  add column if not exists away_team_id uuid references public.teams(id);

create index if not exists matches_home_team_idx on public.matches (home_team_id);
create index if not exists matches_away_team_idx on public.matches (away_team_id);

-- players.number is deprecated (nullable, so the old unique(team_id, number)
-- never fires — Postgres allows any number of NULLs in a unique constraint)
comment on column public.players.number is
  'DEPRECATED — shirt numbers are per-match, stored in matches.lineups (JSONB roster).';
