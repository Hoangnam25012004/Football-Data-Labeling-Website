-- ============================================================
--  Seed: the Saint Lucia channel, with its four qualifiers.
--
--  DATA, not schema — this is not a migration and does not belong
--  in migrations/. Run it ONCE, in the Supabase SQL Editor, after
--  0014, 0015 and 0016. Running it again changes nothing.
--
--  It does four things:
--    1. creates the channel and makes the account below its admin
--    2. points the four tagged qualifiers at it and publishes them
--    3. fills in the scores, dates and which side Saint Lucia was
--    4. writes each match's first report, so the Analysis tab works
--       straight away instead of waiting for four Submit Analysis
--       runs on the tagging site
--
--  WHY IT EXISTS: creating a channel from the client site needs a
--  signed-in session, because whoever creates one becomes its admin.
--  The SQL Editor has no session, so the admin is named here instead.
--
--  CHANGE THIS if the account is not the one that should own it:
--    the email on the line marked >>> OWNER <<< below.
-- ============================================================

-- ---------- 1. the channel ----------
with owner as (
  select id, email,
         coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) as name
    from auth.users
   where lower(email) = lower('dnam2501@gmail.com')      -- >>> OWNER <<<
   limit 1
)
insert into public.clubs (slug, name, crest_text, sport, country, created_by)
select 'saint-lucia', 'Saint Lucia', 'SLU', 'football', 'Saint Lucia', owner.id
  from owner
on conflict (slug) do nothing;

-- The insert trigger already made the owner an admin, but it reads the email
-- out of a JWT and there is none in the SQL Editor — so the row exists with
-- nothing readable on it. Fill it in, and cover the case where the channel
-- was already there from an earlier run.
with owner as (
  select id, email,
         coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) as name
    from auth.users where lower(email) = lower('dnam2501@gmail.com') limit 1
), club as (
  select id from public.clubs where slug = 'saint-lucia'
)
insert into public.club_members (club_id, user_id, role, email, display_name)
select club.id, owner.id, 'admin', owner.email, owner.name
  from club, owner
on conflict (club_id, user_id)
do update set role = 'admin',
              email = excluded.email,
              display_name = excluded.display_name;

-- ---------- 2. the four qualifiers ----------
-- Match codes are the five-digit ones the tagging app shows in its Recent list.
-- home_name / away_name are set as well: if the analyst already named the sides
-- these write the same values back, and if the match was left on the 'Home' /
-- 'Away' defaults this is what fixes the fixture list. Drop those two columns
-- from the update if you would rather keep whatever is stored.
--
-- competition and stage go on the MATCH, not on the club: a club plays in
-- several competitions, and the fixture list reads each match's own.
update public.matches m
   set club_id     = c.id,
       published   = true,
       home_name   = v.home_name,
       away_name   = v.away_name,
       home_score  = v.home_score,
       away_score  = v.away_score,
       kickoff     = v.kickoff,
       our_side    = v.our_side,
       venue       = v.venue,
       competition = 'FIFA World Cup 26 Qualifying',
       stage       = 'Concacaf Second Round · Group C'
  from (values
    ('45956', 'Haiti',       'Saint Lucia', 2, 1, date '2024-06-07', 'away', 'Away'),
    ('55357', 'Saint Lucia', 'Aruba',       2, 2, date '2024-06-12', 'home', 'Home'),
    ('51977', 'Curaçao',     'Saint Lucia', 4, 0, date '2025-06-07', 'away', 'Away'),
    ('32746', 'Saint Lucia', 'Barbados',    2, 1, date '2025-06-11', 'home', 'Home')
  ) as v(code, home_name, away_name, home_score, away_score, kickoff, our_side, venue),
  public.clubs c
 where m.code = v.code
   and c.slug = 'saint-lucia';

-- ---------- 3. the first report for each ----------
-- The same snapshot Submit Analysis writes, built here in SQL. The `rows` shape
-- is dbToRow() in cloud-sync.js, field for field — a test pins the two together,
-- because a snapshot the view cannot read is a match that opens blank.
--
-- Only where a match has no report yet, so re-running this does not stack up
-- versions of the same thing.
insert into public.match_reports (match_id, club_id, version, schema, payload, event_count)
select
  m.id,
  m.club_id,
  1,
  1,
  jsonb_build_object(
    'schema', 1,
    'meta', jsonb_build_object(
      'home',       m.home_name,
      'away',       m.away_name,
      'sport',      coalesce(m.sport, 'football'),
      'homeTeamId', m.home_team_id,
      'awayTeamId', m.away_team_id,
      'matchId',    m.id,
      'matchCode',  m.code
    ),
    'lineups', m.lineups,
    'dur',     coalesce(m.config, '{}'::jsonb),
    'rows',    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',         e.id,
          't',          e.t_seconds,
          'rt',         e.attributes->'rt',
          'team',       e.team,
          'teamName',   coalesce(e.attributes->>'team_name', e.team),
          'event',      e.event_name,
          'playerFrom', coalesce(e.player_from::text, ''),
          'playerTo',   coalesce(e.player_to::text, ''),
          'action',     coalesce(e.action_code, ''),
          'raw',        coalesce(e.attributes->>'raw', ''),
          'grp',        e.attributes->'grp',
          'ord',        coalesce(e.attributes->'ord', to_jsonb(0)),
          'pXY',        case when e.x      is not null then jsonb_build_object('x', e.x,      'y', e.y)      end,
          'rXY',        case when e.rx     is not null then jsonb_build_object('x', e.rx,     'y', e.ry)     end,
          'gXY',        case when e.goal_x is not null then jsonb_build_object('x', e.goal_x, 'y', e.goal_y) end
        )
        order by e.t_seconds
      )
      from public.events e where e.match_id = m.id
    ), '[]'::jsonb)
  ),
  (select count(*) from public.events e where e.match_id = m.id)
from public.matches m
join public.clubs c on c.id = m.club_id and c.slug = 'saint-lucia'
where not exists (select 1 from public.match_reports r where r.match_id = m.id);

-- ---------- 4. what happened ----------
-- Read this before closing the editor. Four rows, each with an event count
-- that looks like a tagged match, is what success looks like. A count of 0
-- means that match has no events in this database — the report will open,
-- and every number in it will be zero.
select
  m.code                                   as match_code,
  m.home_name || ' ' || coalesce(m.home_score, 0) || '–' ||
    coalesce(m.away_score, 0) || ' ' || m.away_name   as fixture,
  m.kickoff,
  m.our_side,
  m.published,
  r.version                                as report_version,
  r.event_count,
  case when m.lineups is null then 'no line-up saved' else 'line-up ok' end as lineups
from public.matches m
left join public.match_reports r
       on r.match_id = m.id
      and r.version = (select max(version) from public.match_reports x where x.match_id = m.id)
join public.clubs c on c.id = m.club_id and c.slug = 'saint-lucia'
order by m.kickoff;
