-- ============================================================
--  Public channels — a club choosing to be readable by anyone.
--
--  ⚠ READ THIS BEFORE RUNNING IT ⚠
--
--  This is the one migration in the project that makes private data
--  world-readable. Turning the flag on for a channel means:
--
--    • Public means PUBLIC, not unlisted. The anon key is committed
--      to this repository and served in the JavaScript of a static
--      site, so anyone can query this database directly with it.
--      There is no secret link.
--    • What becomes readable is the whole signed-off report: every
--      tagged event with its pitch coordinates, the line-ups, and
--      the shirt numbers AND NAMES of the players. Player names are
--      personal data about real people.
--    • The opposition goes with it. A report holds both teams, so a
--      club publishing its own analysis publishes analysis of a club
--      that never agreed to anything.
--    • Turning it back off stops new reads. It does not un-download
--      or un-index what was already taken.
--
--  It is off for every channel until an admin of that channel turns
--  it on. Nothing here changes what a signed-in account can already
--  see, and nothing here touches the tagging app.
--
--  Safe to run and re-run:  supabase db push
-- ============================================================

alter table public.clubs
  add column if not exists is_public boolean not null default false;

comment on column public.clubs.is_public is
  'When true, this channel and its published matches and reports are readable
   by anyone, signed in or not, including the player names in those reports.
   Set only by an admin of the channel (see clubs_update in 0014).';

create index if not exists clubs_public_idx on public.clubs (is_public) where is_public;

-- ============================================================
--  WHAT AN ANONYMOUS VISITOR MAY READ
--
--  Everything so far is `to authenticated`, which is why a signed-out
--  browser sees nothing at all. These three are the only doors opened,
--  and each one checks the flag for itself rather than trusting the
--  one before it.
-- ============================================================
drop policy if exists clubs_read_public on public.clubs;
create policy clubs_read_public on public.clubs for select to anon
  using (is_public);

drop policy if exists matches_read_public on public.matches;
create policy matches_read_public on public.matches for select to anon
  using (
    published
    and exists (select 1 from public.clubs c
                 where c.id = matches.club_id and c.is_public)
  );

drop policy if exists match_reports_read_public on public.match_reports;
create policy match_reports_read_public on public.match_reports for select to anon
  using (
    exists (select 1 from public.clubs c
             where c.id = match_reports.club_id and c.is_public)
  );

-- Writing stays exactly where 0014 and 0016 left it: an anonymous visitor
-- has no insert, update or delete policy anywhere, on any table.

-- ============================================================
--  THE VIEW THAT WOULD HAVE LEAKED
--
--  public.match_stats is a VIEW. A view in Postgres runs with the
--  privileges of whoever owns it — not the caller — so row-level
--  security on public.events does NOT apply to it. Every policy above
--  could be perfect and an anonymous visitor granted SELECT on that
--  view would still read the rolled-up numbers of every match in the
--  database, public channel or not.
--
--  So: anon is taken off match_stats entirely, and given a second view
--  that does the filtering itself. The filter inside the view IS the
--  boundary here, which is why it joins all the way back to the flag
--  rather than trusting anything upstream.
-- ============================================================
revoke select on public.match_stats from anon;

create or replace view public.public_match_stats as
  select s.*
    from public.match_stats s
    join public.matches m on m.id = s.match_id
    join public.clubs   c on c.id = m.club_id
   where m.published
     and c.is_public;

grant select on public.public_match_stats to anon, authenticated;

comment on view public.public_match_stats is
  'match_stats, narrowed to published matches of channels whose is_public is
   true. A view does not inherit row-level security, so this filter is the
   access boundary — the client site reads this one when signed out.';

-- ============================================================
--  WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--  It does not open public.events to anyone. A public visitor reads a
--  signed-off report, the same one row a club reads, and never the
--  live event stream.
--
--  It does not touch Part B of 0013, which is still commented out
--  there: today ANY signed-in account can read every match in this
--  database. That is a separate hole and a separate decision, and it
--  is worth closing whether or not any channel is ever made public.
-- ============================================================
