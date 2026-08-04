-- Where the ball crossed the goal line, for a shot on target / goal.
--
-- Normalised to the goal MOUTH, not the pitch, so the numbers mean the same thing
-- whatever size the panel was drawn at:
--   goal_x   0 = left post    -> 100 = right post
--   goal_y   0 = crossbar     -> 100 = the goal line
-- Both are clamped to the frame by the app (a shot on target is inside it by definition),
-- and both stay null for every other event.
--
-- Safe to re-run. Existing rows keep null.
alter table public.events add column if not exists goal_x real;
alter table public.events add column if not exists goal_y real;

-- shots that were placed, for the analysis queries:
--   select player_from, goal_x, goal_y from public.events
--   where match_id = '…' and goal_x is not null order by t_seconds;
create index if not exists events_goal_idx on public.events (match_id)
  where goal_x is not null;
