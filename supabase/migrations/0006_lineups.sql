-- ============================================================
--  Per-match player lists / starting XI / subs / formation.
--  Stored as JSONB on the match (no extra table needed).
--  Shape: { home:{roster,xi,subs,dir}, away:{...} }
-- ============================================================
alter table public.matches add column if not exists lineups jsonb;
