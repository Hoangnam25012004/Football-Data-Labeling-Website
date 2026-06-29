-- ============================================================
--  Football Data Labeling — real-time schema (Supabase / Postgres)
--  Run with: supabase db push   (or paste into the SQL Editor)
-- ============================================================

-- ---------- MATCHES ----------
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users(id) default auth.uid(),
  home_name   text not null default 'Home',
  away_name   text not null default 'Away',
  sport       text not null default 'football',
  config      jsonb not null default '{}'::jsonb,   -- duration mapping etc.
  created_at  timestamptz not null default now()
);

-- ---------- EVENTS (hot table, realtime source) ----------
create table if not exists public.events (
  id           uuid primary key,                    -- client-generated (idempotency)
  match_id     uuid not null references public.matches(id) on delete cascade,
  team         text not null check (team in ('home','away')),
  event_name   text not null,
  action_code  text,
  player_from  smallint,
  player_to    smallint,
  x  real, y  real,                                 -- Player dot (0..100)
  rx real, ry real,                                 -- Receiver dot
  t_seconds    double precision not null,           -- timeline (Player dot time)
  half         smallint not null default 1,
  attributes   jsonb not null default '{}'::jsonb,  -- flexible, unlimited attributes
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1
);

-- ---------- INDEXES (access patterns) ----------
create index if not exists events_match_time_idx on public.events (match_id, t_seconds);
create index if not exists events_filter_idx     on public.events (match_id, team, event_name);
create index if not exists events_passer_idx     on public.events (match_id, player_from);
create index if not exists events_attr_gin       on public.events using gin (attributes jsonb_path_ops);

-- ---------- updated_at + version bump on UPDATE ----------
create or replace function public.bump_version()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.version = coalesce(old.version, 0) + 1;
  return new;
end $$;

drop trigger if exists events_bump on public.events;
create trigger events_bump before update on public.events
for each row execute function public.bump_version();

-- ============================================================
--  ROW-LEVEL SECURITY
--  Simple shareable model: any signed-in user (incl. anonymous)
--  can read/write. Tighten later with public.match_members.
-- ============================================================
alter table public.matches enable row level security;
alter table public.events  enable row level security;

drop policy if exists matches_rw on public.matches;
create policy matches_rw on public.matches
  for all to authenticated using (true) with check (true);

drop policy if exists events_rw on public.events;
create policy events_rw on public.events
  for all to authenticated using (true) with check (true);

-- ============================================================
--  REALTIME (Postgres Changes)
--  Include old row on UPDATE/DELETE, and add to the publication.
-- ============================================================
alter table public.events replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- ============================================================
--  OPTIONAL — tighter access via membership (uncomment to use)
-- ============================================================
-- create table public.match_members (
--   match_id uuid references public.matches(id) on delete cascade,
--   user_id  uuid references auth.users(id) on delete cascade,
--   role     text not null default 'editor',
--   primary key (match_id, user_id)
-- );
-- create index on public.match_members (user_id);
-- -- replace the permissive policies above with membership checks, e.g.:
-- -- using (exists (select 1 from public.match_members m
-- --                where m.match_id = events.match_id and m.user_id = auth.uid()))

-- ============================================================
--  OPTIONAL — Broadcast-from-DB (scales past Postgres Changes)
--  Use instead of the publication above for very high fan-out.
-- ============================================================
-- create or replace function public.events_broadcast()
-- returns trigger language plpgsql security definer set search_path = '' as $$
-- begin
--   perform realtime.broadcast_changes(
--     'match:' || coalesce(new.match_id, old.match_id)::text,
--     tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
--   return null;
-- end $$;
-- create trigger events_broadcast_trg
-- after insert or update or delete on public.events
-- for each row execute function public.events_broadcast();
