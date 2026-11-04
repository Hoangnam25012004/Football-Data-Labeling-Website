-- ============================================================
--  0026 — TAGGING DATA IS WRITTEN BY STAFF, AND THE PORTAL READS LESS
-- ============================================================
--  Read docs/design/infra-hardening-design.md before running this.
--
--  BEFORE RUNNING: put every analyst in public.staff, or this file stops at
--  step 0 and changes nothing. Run in the SQL editor, one row per analyst:
--
--      insert into public.staff (user_id, note)
--      select id, 'analyst' from auth.users
--       where email = '<analyst email>' and not is_anonymous
--      on conflict do nothing;
--
--  (Emails are not written into this file: the repo is public.)
--
--  WHY. Anonymous sign-ins are on (cloud-sync.js falls back to one), an
--  anonymous session runs as `authenticated`, and events / teams / players /
--  event_types were `for all to authenticated using (true)`. Anyone holding
--  the public key could sign in anonymously and rewrite or delete every
--  tagged event of every match. matches was readable the same way, which is
--  the hole 0017 called "Part B" and left open.
--
--  WHAT CHANGES
--    1. events, players          : staff only, read and write.
--       teams, event_types       : any account reads (the portal matches team
--                                  codes, the dictionary is not secret);
--                                  only staff write.
--       matches                  : read by staff, the match's creator, its
--                                  channel's admins, and its channel's members
--                                  once published. Created by staff.
--    2. auth.uid() / is_staff() wrapped in (select …) so Postgres evaluates
--       them once per query, not once per row (advisor: auth_rls_initplan).
--    3. `… for all` write policies split into insert/update/delete, so a
--       SELECT runs one policy, not two (advisor: multiple_permissive_policies).
--       Same expressions; nobody gains or loses access in this step.
--    4. SECURITY DEFINER helpers no longer executable by anon; the seven
--       trigger/helper functions get a fixed search_path.
--    5. match_reports_latest: one row per match, the newest version. The
--       portal's Data view read every version ever published (19 payloads,
--       9 MB, for 4 matches on the public channel).
--    6. match_stats stops aggregating public.events on every page load. The
--       rollup lives in private.match_stats_mv, refreshed by pg_cron once a
--       minute and only when public.events has changed. match_stats and
--       public_match_stats keep their names and columns, so supa.js is
--       unchanged; their numbers may trail tagging by up to a minute.
--       match_stats also gains the row filter it never had: a view runs with
--       its owner's rights, so until now any account read every match's totals.
--
--  Safe to run twice.
--
--  AFTER RUNNING, CHECK:
--    1. Tagger, signed in as an analyst: open a match, add and delete an event.
--    2. Portal, signed out: the public channel lists its matches with numbers.
--    3. select * from cron.job where jobname = 'refresh-match-stats';  -> one row
--    4. As an anonymous session (DevTools on the tagger before signing in):
--         await sb.from('events').delete().eq('id','00000000-0000-0000-0000-000000000000')
--       -> no error, 0 rows; and select on events returns [].
-- ============================================================

-- ---------- 0. refuse to lock everybody out ----------
do $$
begin
  if not exists (select 1 from public.staff) then
    raise exception 'public.staff is empty: add the analysts first (see the header of 0026). Nothing was changed.';
  end if;
end $$;

-- ---------- 1. events / players: staff only ----------
drop policy if exists events_rw    on public.events;
drop policy if exists events_staff on public.events;
create policy events_staff on public.events for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists players_rw    on public.players;
drop policy if exists players_staff on public.players;
create policy players_staff on public.players for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------- 1. teams / event_types: everyone reads, staff write ----------
drop policy if exists teams_rw     on public.teams;
drop policy if exists teams_read   on public.teams;
drop policy if exists teams_insert on public.teams;
drop policy if exists teams_update on public.teams;
drop policy if exists teams_delete on public.teams;
create policy teams_read   on public.teams for select to authenticated using (true);
create policy teams_insert on public.teams for insert to authenticated with check ((select public.is_staff()));
create policy teams_update on public.teams for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy teams_delete on public.teams for delete to authenticated using ((select public.is_staff()));

drop policy if exists event_types_rw     on public.event_types;
drop policy if exists event_types_read   on public.event_types;
drop policy if exists event_types_insert on public.event_types;
drop policy if exists event_types_update on public.event_types;
drop policy if exists event_types_delete on public.event_types;
create policy event_types_read   on public.event_types for select to authenticated using (true);
create policy event_types_insert on public.event_types for insert to authenticated with check ((select public.is_staff()));
create policy event_types_update on public.event_types for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy event_types_delete on public.event_types for delete to authenticated using ((select public.is_staff()));

-- ---------- 1. matches ----------
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches for select to authenticated using (
  (select public.is_staff())
  or created_by = (select auth.uid())
  or (club_id is not null and (public.is_club_admin(club_id)
                               or (published and public.is_club_member(club_id))))
);

drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches for insert to authenticated
  with check ((select public.is_staff()));

-- 0025's three arms, unchanged, with the calls hoisted (step 2)
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches for update to authenticated
  using ((select public.is_staff()) or created_by = (select auth.uid())
         or (club_id is not null and public.is_club_admin(club_id)))
  with check ((select public.is_staff()) or created_by = (select auth.uid())
         or (club_id is not null and public.is_club_admin(club_id)));

-- ---------- 2. evaluate auth.uid() once per query ----------
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists clubs_insert on public.clubs;
create policy clubs_insert on public.clubs for insert to authenticated
  with check ((select public.is_staff()) or created_by = (select auth.uid()));

drop policy if exists club_members_read on public.club_members;
create policy club_members_read on public.club_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()) or public.is_club_member(club_id));

drop policy if exists user_prefs_own on public.user_prefs;
create policy user_prefs_own on public.user_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- 3. one SELECT policy per table ----------
drop policy if exists club_members_modify on public.club_members;
drop policy if exists club_members_insert on public.club_members;
drop policy if exists club_members_update on public.club_members;
drop policy if exists club_members_delete on public.club_members;
create policy club_members_insert on public.club_members for insert to authenticated
  with check ((select public.is_staff()) or public.is_club_admin(club_id));
create policy club_members_update on public.club_members for update to authenticated
  using ((select public.is_staff()) or public.is_club_admin(club_id))
  with check ((select public.is_staff()) or public.is_club_admin(club_id));
create policy club_members_delete on public.club_members for delete to authenticated
  using ((select public.is_staff()) or public.is_club_admin(club_id));

drop policy if exists club_invites_modify on public.club_invites;
drop policy if exists club_invites_insert on public.club_invites;
drop policy if exists club_invites_update on public.club_invites;
drop policy if exists club_invites_delete on public.club_invites;
create policy club_invites_insert on public.club_invites for insert to authenticated
  with check ((select public.is_staff()) or public.is_club_admin(club_id));
create policy club_invites_update on public.club_invites for update to authenticated
  using ((select public.is_staff()) or public.is_club_admin(club_id))
  with check ((select public.is_staff()) or public.is_club_admin(club_id));
create policy club_invites_delete on public.club_invites for delete to authenticated
  using ((select public.is_staff()) or public.is_club_admin(club_id));

drop policy if exists match_reports_write  on public.match_reports;
drop policy if exists match_reports_insert on public.match_reports;
drop policy if exists match_reports_update on public.match_reports;
drop policy if exists match_reports_delete on public.match_reports;
create policy match_reports_insert on public.match_reports for insert to authenticated
  with check ((select public.is_staff()) or (club_id is not null and public.is_club_admin(club_id)));
create policy match_reports_update on public.match_reports for update to authenticated
  using ((select public.is_staff()) or (club_id is not null and public.is_club_admin(club_id)))
  with check ((select public.is_staff()) or (club_id is not null and public.is_club_admin(club_id)));
create policy match_reports_delete on public.match_reports for delete to authenticated
  using ((select public.is_staff()) or (club_id is not null and public.is_club_admin(club_id)));

-- ---------- 4. functions ----------
-- Functions are executable by PUBLIC by default, which is how anon got them.
-- Trigger functions need no EXECUTE grant to fire.
revoke execute on function public.claim_club_invites()    from public, anon;
revoke execute on function public.club_creator_is_admin() from public, anon, authenticated;
revoke execute on function public.club_keep_an_admin()    from public, anon, authenticated;
revoke execute on function public.is_club_admin(uuid)     from public, anon;
revoke execute on function public.is_club_member(uuid)    from public, anon;
revoke execute on function public.is_staff()              from public, anon;
revoke execute on function public.publish_match_report(uuid, uuid, jsonb, integer, integer) from public, anon;
grant  execute on function public.claim_club_invites()    to authenticated;
grant  execute on function public.is_club_admin(uuid)     to authenticated;
grant  execute on function public.is_club_member(uuid)    to authenticated;
grant  execute on function public.is_staff()              to authenticated;
grant  execute on function public.publish_match_report(uuid, uuid, jsonb, integer, integer) to authenticated;

-- `extensions` stays on the path: that is where Supabase keeps pgcrypto.
alter function public.bump_version()     set search_path = public, extensions, pg_temp;
alter function public.gen_match_code()    set search_path = public, extensions, pg_temp;
alter function public.gen_team_code()     set search_path = public, extensions, pg_temp;
alter function public.jwt_email()         set search_path = public, extensions, pg_temp;
alter function public.jwt_name()          set search_path = public, extensions, pg_temp;
alter function public.touch_updated_at()  set search_path = public, extensions, pg_temp;
alter function public.touch_user_prefs()  set search_path = public, extensions, pg_temp;

-- ---------- 5. the newest report of each match ----------
-- security_invoker: the reader's row-level security on match_reports applies,
-- so anon still sees only public channels and a club only its own.
create or replace view public.match_reports_latest with (security_invoker = true) as
  select distinct on (match_id) *
    from public.match_reports
   order by match_id, version desc;
revoke all on public.match_reports_latest from anon, authenticated;
grant select on public.match_reports_latest to anon, authenticated;

-- ---------- 6. match_stats from a rollup, not from every event ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- 0015's rollup, unchanged. The event names here are matched by name, like
-- 0015's were: renaming an event means editing this list (CLAUDE.md rule 5).
create materialized view if not exists private.match_stats_mv as
with e as (
  select match_id, team, lower(trim(event_name)) as ev
    from public.events
)
select
  match_id,
  team,
  count(*) filter (where ev = 'goal')                                  as goals,
  count(*) filter (where ev in ('goal','shot on target'))               as on_target,
  count(*) filter (where ev = 'shot off target')                        as off_target,
  count(*) filter (where ev = 'blocked shot')                           as blocked,
  count(*) filter (where ev in ('goal','shot on target','shot off target',
                                'blocked shot','miss shot'))            as shots,
  count(*) filter (where ev in ('pass success','pass fail'))            as passes,
  count(*) filter (where ev = 'pass success')                           as passes_done,
  count(*) filter (where ev in ('cross success','cross fail'))          as crosses,
  count(*) filter (where ev = 'cross success')                          as crosses_done,
  count(*) filter (where ev in ('take-on succes','take-on success',
                                'take-on fail'))                        as take_ons,
  count(*) filter (where ev = 'step in')                                as step_ins,
  count(*) filter (where ev in ('tackle success','tackle fail'))        as tackles,
  count(*) filter (where ev = 'interception')                           as interceptions,
  count(*) filter (where ev = 'clearance')                              as clearances,
  count(*) filter (where ev in ('aerial duel success','aerial duel fail')) as aerial_duels,
  count(*) filter (where ev in ('foul','handball foul'))                as fouls,
  count(*) filter (where ev = 'offside')                                as offsides,
  count(*)                                                              as events_tagged
from e
group by match_id, team;

-- events.team is NOT NULL, so (match_id, team) is a key; CONCURRENTLY needs one
create unique index if not exists match_stats_mv_key on private.match_stats_mv (match_id, team);
revoke all on private.match_stats_mv from public, anon, authenticated;

-- Same columns, same order: create or replace keeps both views' grants.
create or replace view public.match_stats as
  select s.*
    from private.match_stats_mv s
    join public.matches m on m.id = s.match_id
   where (select public.is_staff())
      or m.created_by = (select auth.uid())
      or (m.club_id is not null and m.published and public.is_club_member(m.club_id));

create or replace view public.public_match_stats as
  select s.*
    from private.match_stats_mv s
    join public.matches m on m.id = s.match_id
    join public.clubs   c on c.id = m.club_id
   where m.published
     and c.is_public;

revoke select on public.match_stats from anon;
revoke insert, update, delete, truncate, references, trigger on public.match_stats        from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.public_match_stats from anon, authenticated;

-- Refresh only when public.events has changed since the last refresh. The
-- counters are Postgres's own, so the check costs one catalog read.
create table if not exists private.refresh_state (
  id integer primary key check (id = 1),
  events_fp bigint
);
revoke all on private.refresh_state from public, anon, authenticated;

create or replace function private.refresh_match_stats() returns void
language plpgsql security definer set search_path = '' as $$
declare
  fp   bigint;
  last bigint;
begin
  select coalesce(n_tup_ins, 0) + coalesce(n_tup_upd, 0) + coalesce(n_tup_del, 0)
    into fp from pg_catalog.pg_stat_user_tables where relid = 'public.events'::regclass;
  select r.events_fp into last from private.refresh_state r where r.id = 1;
  if last is not distinct from fp then return; end if;
  refresh materialized view concurrently private.match_stats_mv;
  insert into private.refresh_state (id, events_fp) values (1, fp)
    on conflict (id) do update set events_fp = excluded.events_fp;
end $$;
revoke execute on function private.refresh_match_stats() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('refresh-match-stats', '* * * * *', 'select private.refresh_match_stats()');
