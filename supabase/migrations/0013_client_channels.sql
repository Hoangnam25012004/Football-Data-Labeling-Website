-- ============================================================
--  Client channels — what the customer-facing site reads.
--
--  A CHANNEL IS A CLUB. A club sees its own matches, and only the
--  ones an analyst has signed off. Everything here is additive:
--  no DROP, no DELETE, safe to run and re-run.
--
--  PART A (this file, top half) only ADDS tables/columns/views.
--  Running it changes nothing about who can read what.
--
--  PART B (bottom half, commented out) is the one that actually
--  tightens row-level security. Read the warning before running it
--  — run it without putting yourself in public.staff first and you
--  will lock your own analysts out of the tagging app.
-- ============================================================

-- ---------- CLUBS (= channels) ----------
create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- /app?club=saint-lucia
  name        text not null,
  crest_text  text,                          -- 3-letter monogram shown when there is no crest image
  competition text,                          -- "FIFA World Cup 26 Qualifying"
  stage       text,                          -- "Concacaf Second Round · Group C"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists clubs_slug_idx on public.clubs (slug);

-- ---------- WHO SEES WHICH CHANNEL ----------
create table if not exists public.club_members (
  club_id  uuid not null references public.clubs(id) on delete cascade,
  user_id  uuid not null references auth.users(id)   on delete cascade,
  role     text not null default 'viewer'
           check (role in ('viewer','analyst','admin')),
  added_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index if not exists club_members_user_idx on public.club_members (user_id);

-- ---------- STAFF (your analysts — full access to everything) ----------
-- Anyone in here keeps the unrestricted access the tagging app relies on.
-- PUT YOURSELF IN HERE BEFORE RUNNING PART B.
create table if not exists public.staff (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  note     text,
  added_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid());
$$;

-- ---------- MATCH → CHANNEL, AND THE PUBLISH GATE ----------
-- published defaults to FALSE: a match a client can see is a decision
-- someone makes, not something that happens by tagging it.
alter table public.matches add column if not exists club_id     uuid references public.clubs(id) on delete set null;
alter table public.matches add column if not exists published   boolean not null default false;
alter table public.matches add column if not exists kickoff     date;
alter table public.matches add column if not exists competition text;
alter table public.matches add column if not exists stage       text;
alter table public.matches add column if not exists venue       text;
alter table public.matches add column if not exists home_score  smallint;
alter table public.matches add column if not exists away_score  smallint;
-- which side of the fixture is the channel's own club
alter table public.matches add column if not exists our_side    text
  check (our_side in ('home','away'));

create index if not exists matches_club_pub_idx on public.matches (club_id, published, kickoff desc);

-- ============================================================
--  MATCH STATS VIEW
--  Rolls the raw event rows up into the per-team numbers the
--  client site shows, so the browser never downloads 1,800 events
--  just to draw ten bars.
--
--  Event names come from the shared, user-editable event_types
--  dictionary, so this matches on the naming convention the
--  tagging app ships with (#pass success, #shot on target, ...).
--  Rename an event there and the matching column here goes to 0 —
--  adjust the ILIKE patterns if you change the dictionary.
-- ============================================================
create or replace view public.match_stats as
with e as (
  select
    match_id,
    team,
    lower(event_name) as ev
  from public.events
)
select
  match_id,
  team,
  count(*) filter (where ev like '#goal%')                                     as goals,
  count(*) filter (where ev like '#shot on target%' or ev like '#goal%')       as on_target,
  count(*) filter (where ev like '#shot off target%')                          as off_target,
  count(*) filter (where ev like '#shot blocked%')                             as blocked,
  count(*) filter (where ev like '#shot%' or ev like '#goal%')                 as shots,
  count(*) filter (where ev like '#pass%')                                     as passes,
  count(*) filter (where ev like '#pass success%')                             as passes_done,
  count(*) filter (where ev like '#cross%')                                    as crosses,
  count(*) filter (where ev like '#cross success%')                            as crosses_done,
  count(*) filter (where ev like '#take-on%')                                  as take_ons,
  count(*) filter (where ev like '#step in%')                                  as step_ins,
  count(*) filter (where ev like '#tackle%')                                   as tackles,
  count(*) filter (where ev like '#interception%')                             as interceptions,
  count(*) filter (where ev like '#clearance%')                                as clearances,
  count(*) filter (where ev like '#aerial duel%')                              as aerial_duels,
  count(*) filter (where ev like '#foul%' and ev not like '#foul won%')        as fouls,
  count(*) filter (where ev like '#offside%')                                  as offsides,
  count(*)                                                                     as events_tagged
from e
group by match_id, team;

comment on view public.match_stats is
  'Per-team rollup of public.events for the client site. Inherits row-level security from public.events.';

-- ============================================================
--  PART B — TIGHTEN ROW-LEVEL SECURITY
--
--  ⚠ READ THIS FIRST ⚠
--  Today every policy on matches/events is `to authenticated`, which
--  means ANY signed-in account — including the anonymous sessions the
--  tagging app creates — can read every match in the database. That is
--  fine while only your own team has logins. It is not fine once a
--  client has one.
--
--  Before you run anything below:
--    1. Sign in to the tagging app as yourself.
--    2. Find your id:      select auth.uid();
--    3. Add yourself:      insert into public.staff (user_id, note)
--                          values ('<that-uuid>', 'owner');
--       ...and do the same for every analyst who tags matches.
--    4. Only then uncomment and run the rest.
--
--  Skipping step 3 locks your own analysts out of their own data.
-- ============================================================

-- Enable RLS on the new tables straight away — they hold no data yet,
-- so there is nothing to lock anyone out of.
alter table public.clubs        enable row level security;
alter table public.club_members enable row level security;
alter table public.staff        enable row level security;

drop policy if exists clubs_read on public.clubs;
create policy clubs_read on public.clubs for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.club_members m
               where m.club_id = clubs.id and m.user_id = auth.uid())
  );

drop policy if exists clubs_write on public.clubs;
create policy clubs_write on public.clubs for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists club_members_read on public.club_members;
create policy club_members_read on public.club_members for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists club_members_write on public.club_members;
create policy club_members_write on public.club_members for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_staff());


-- ------------------------------------------------------------
--  The part that changes existing behaviour. Uncomment to apply.
-- ------------------------------------------------------------
--
-- -- MATCHES: staff see everything; a club sees its own published matches.
-- drop policy if exists matches_all      on public.matches;
-- drop policy if exists matches_rw       on public.matches;
-- drop policy if exists "matches read"   on public.matches;
-- drop policy if exists "matches write"  on public.matches;
--
-- create policy matches_select on public.matches for select to authenticated
--   using (
--     public.is_staff()
--     or (published and exists (
--           select 1 from public.club_members m
--           where m.club_id = matches.club_id and m.user_id = auth.uid()))
--   );
-- create policy matches_modify on public.matches for all to authenticated
--   using (public.is_staff()) with check (public.is_staff());
--
-- -- EVENTS: visible exactly when the match they belong to is.
-- drop policy if exists events_all     on public.events;
-- drop policy if exists events_rw      on public.events;
-- drop policy if exists "events read"  on public.events;
-- drop policy if exists "events write" on public.events;
--
-- create policy events_select on public.events for select to authenticated
--   using (exists (
--     select 1 from public.matches mt
--     where mt.id = events.match_id
--       and (public.is_staff()
--            or (mt.published and exists (
--                  select 1 from public.club_members m
--                  where m.club_id = mt.club_id and m.user_id = auth.uid())))
--   ));
-- create policy events_modify on public.events for all to authenticated
--   using (public.is_staff()) with check (public.is_staff());


-- ============================================================
--  SEEDING THE FIRST CHANNEL
--  The four Saint Lucia qualifiers already live in this database
--  under these ids. Point them at a channel and publish them:
--
--    insert into public.clubs (slug, name, crest_text, competition, stage)
--    values ('saint-lucia','Saint Lucia','SLU',
--            'FIFA World Cup 26 Qualifying',
--            'Concacaf Second Round · Group C')
--    on conflict (slug) do nothing;
--
--    -- give the client account access
--    insert into public.club_members (club_id, user_id, role)
--    select c.id, '<client-user-uuid>', 'viewer'
--    from public.clubs c where c.slug = 'saint-lucia'
--    on conflict do nothing;
--
--  Then set club_id / published / scores per match. Match ids as
--  they appear in the tagging app's Recent list:
--    45956  Haiti 2–1 Saint Lucia        07/06/2024  (our_side = away)
--    55357  Saint Lucia 2–2 Aruba        12/06/2024  (our_side = home)
--    51977  Curaçao 4–0 Saint Lucia      07/06/2025  (our_side = away)
--    32746  Saint Lucia 2–1 Barbados     11/06/2025  (our_side = home)
--
--  Those are the app's short match codes, not the uuid primary key —
--  match on public.matches.code (see 0002_match_code.sql, which names the
--  column `code`; match_code is only the name of the trigger function).
-- ============================================================
