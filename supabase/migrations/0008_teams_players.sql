-- ============================================================
--  Teams & Players — reusable squad data.
--  A team has many players; a player belongs to exactly one team.
--  Mirrors the RLS / realtime / updated_at conventions of the
--  matches, events and event_types tables.
--
--  Non-destructive: only CREATE ... IF NOT EXISTS and guarded
--  creates — no DROP / TRUNCATE / DELETE, safe to run (and re-run).
-- ============================================================

-- shared "touch updated_at on UPDATE" helper (safe to re-create)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- TEAMS ----------
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text,                                  -- e.g. abbreviation shown on the scoreboard
  color       text,                                  -- kit / display colour (hex)
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists teams_name_idx on public.teams (name);

-- ---------- PLAYERS ----------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  number      smallint,                              -- shirt number
  name        text not null,
  position    text,                                  -- GK / CB / CM ... (matches formation zones)
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (team_id, number)                           -- a shirt number is unique within a team
);

create index if not exists players_team_idx on public.players (team_id);

-- ---------- updated_at triggers (create only if missing — no DROP) ----------
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'teams_touch') then
    create trigger teams_touch before update on public.teams
    for each row execute function public.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'players_touch') then
    create trigger players_touch before update on public.players
    for each row execute function public.touch_updated_at();
  end if;
end $$;

-- ---------- ROW-LEVEL SECURITY (same shareable model as the rest) ----------
alter table public.teams   enable row level security;
alter table public.players enable row level security;

-- create policies only if missing (no DROP)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='teams' and policyname='teams_rw') then
    create policy teams_rw on public.teams
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='players' and policyname='players_rw') then
    create policy players_rw on public.players
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ---------- REALTIME ----------
alter table public.teams   replica identity full;
alter table public.players replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='teams'
  ) then
    alter publication supabase_realtime add table public.teams;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end $$;
