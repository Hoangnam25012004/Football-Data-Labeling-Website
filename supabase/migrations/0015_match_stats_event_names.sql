-- ============================================================
--  match_stats was counting nothing.
--
--  0013 built the view on patterns like  ev like '#goal%'  in the
--  belief that an event is stored under the name the tagger types,
--  hash and all. It is not: the hash is only how you address an
--  event while typing a chain ("7 #pass success 9"). What is stored
--  in public.events.event_name is the bare dictionary name —
--  'goal', 'pass success', 'shot on target' — as shipped in
--  pitchtagger_events.json, written straight through by cloud-sync.js
--  and read back by EVENT_INC in shared.js, none of which carry a '#'.
--
--  So every filter in the view matched zero rows. Only events_tagged,
--  which is a bare count(*), was ever right. That is what left the
--  client site's head-to-head bars, its shot breakdown and its Data
--  totals empty on a real channel while the seeded sample looked fine.
--
--  Column names, types and order are unchanged, which is what lets
--  this be a CREATE OR REPLACE rather than a drop. Nothing else in
--  the schema is touched.
--
--  Safe to run and re-run:  supabase db push
--                           (or paste into the SQL Editor)
-- ============================================================

create or replace view public.match_stats as
with e as (
  select
    match_id,
    team,
    -- the dictionary is user-editable, so fold case and stray spaces
    lower(trim(event_name)) as ev
  from public.events
)
select
  match_id,
  team,
  count(*) filter (where ev = 'goal')                                  as goals,
  count(*) filter (where ev in ('goal','shot on target'))               as on_target,
  count(*) filter (where ev = 'shot off target')                        as off_target,
  count(*) filter (where ev = 'blocked shot')                           as blocked,
  -- the same five SHOT_KINDS shared.js counts as a shot ('miss shot' is
  -- not in the shipped dictionary, but a tagger may add it)
  count(*) filter (where ev in ('goal','shot on target','shot off target',
                                'blocked shot','miss shot'))            as shots,
  count(*) filter (where ev in ('pass success','pass fail'))            as passes,
  count(*) filter (where ev = 'pass success')                           as passes_done,
  count(*) filter (where ev in ('cross success','cross fail'))          as crosses,
  count(*) filter (where ev = 'cross success')                          as crosses_done,
  -- 'take-on succes' is how the dictionary spells it. The corrected
  -- spelling is accepted too, so fixing the typo there does not zero
  -- this column
  count(*) filter (where ev in ('take-on succes','take-on success',
                                'take-on fail'))                        as take_ons,
  count(*) filter (where ev = 'step in')                                as step_ins,
  count(*) filter (where ev in ('tackle success','tackle fail'))        as tackles,
  count(*) filter (where ev = 'interception')                           as interceptions,
  count(*) filter (where ev = 'clearance')                              as clearances,
  count(*) filter (where ev in ('aerial duel success','aerial duel fail')) as aerial_duels,
  -- a foul conceded. 'foul throw' is a throw-in offence and is left out
  count(*) filter (where ev in ('foul','handball foul'))                as fouls,
  count(*) filter (where ev = 'offside')                                as offsides,
  count(*)                                                              as events_tagged
from e
group by match_id, team;

comment on view public.match_stats is
  'Per-team rollup of public.events for the client site. Matches the bare
   dictionary names in event_name (no leading #). Inherits row-level
   security from public.events.';
