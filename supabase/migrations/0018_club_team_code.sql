-- ============================================================
--  Which team is the client?
--
--  Until now the answer was public.matches.our_side — a column set
--  on the tagging side, defaulting to 'home', with nothing checking
--  it against the channel the match was published to. Get it wrong
--  and the client site inverts silently: the club's own shots appear
--  under the opposition, every win reads as a loss, and every number
--  still adds up, which is what makes it so hard to notice.
--
--  This file gives the two sides something to agree on.
--
--    teams.code  a 5-digit code, generated on insert, exactly as
--                public.matches.code has worked since 0002. It is a
--                team's public name for itself — short enough to
--                read down a phone.
--
--    clubs.code  the code of the team THIS CHANNEL IS. Typed in by
--                the channel's admin, not generated: a channel is a
--                club saying "that team is us".
--
--  With both set, a published match answers the question by itself —
--  whichever of home_team_id / away_team_id carries the channel's
--  code is the client's side. our_side stays exactly where it is and
--  goes on being the answer wherever a channel has no code: nothing
--  that works today stops working because of this file.
--
--  Additive. No DROP, no DELETE, no UPDATE of anything that already
--  had a value. Safe to run and re-run:  supabase db push
--                                        (or paste into the SQL Editor)
-- ============================================================

-- ---------- teams.code ----------
alter table public.teams add column if not exists code text unique;

comment on column public.teams.code is
  'Short 5-digit code for this team (10000..99999), generated on insert.
   Quoted to a club so they can point their channel at this team — see
   public.clubs.code.';

-- The twin of gen_match_code() in 0002, against a different table. Written
-- out rather than shared: one generic function would have to take the table
-- name as text and run EXECUTE, which is a SQL-injection surface for the sake
-- of nine lines.
create or replace function public.gen_team_code()
returns trigger language plpgsql as $$
declare c text; tries int := 0;
begin
  if new.code is not null then return new; end if;
  loop
    c := (floor(random() * 90000) + 10000)::int::text;   -- always 5 digits
    exit when not exists (select 1 from public.teams where code = c);
    tries := tries + 1;
    if tries > 100 then
      raise exception 'could not allocate a unique team code';
    end if;
  end loop;
  new.code := c;
  return new;
end $$;

drop trigger if exists teams_code on public.teams;
create trigger teams_code before insert on public.teams
for each row execute function public.gen_team_code();

-- every team that existed before this file gets one too (collision-safe)
do $$
declare r record; c text;
begin
  for r in select id from public.teams where code is null loop
    loop
      c := (floor(random() * 90000) + 10000)::int::text;
      exit when not exists (select 1 from public.teams where code = c);
    end loop;
    update public.teams set code = c where id = r.id;
  end loop;
end $$;

-- ---------- clubs.code ----------
-- Deliberately NOT generated: this column does not name the channel, it
-- names the team the channel belongs to, and only a person knows that.
alter table public.clubs add column if not exists code text;

comment on column public.clubs.code is
  'The public.teams.code of the team this channel is. Set by the channel''s
   admin. Null means "not stated", and a published match then falls back to
   matches.our_side as before.';

-- A foreign key rather than a check the app performs: a code that names no
-- team is the one mistake this whole file exists to prevent, and the app is
-- not the only thing that writes here. `on update cascade` because a team's
-- code is data, not an identity — if one is ever re-issued the channels
-- pointing at it follow. `on delete set null` because deleting a team must
-- not take a channel with it; the channel simply stops knowing its side and
-- our_side answers again.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clubs_team_code_fk'
  ) then
    alter table public.clubs
      add constraint clubs_team_code_fk foreign key (code)
      references public.teams (code) on update cascade on delete set null;
  end if;
end $$;

-- Two channels naming the same team is not forbidden — a club may run more
-- than one — so no unique index here. What is forbidden is a code that is
-- not a team's, and the FK above is what says so.
create index if not exists clubs_code_idx on public.clubs (code) where code is not null;

-- ============================================================
--  WHO MAY READ A TEAM'S CODE
--
--  public.teams already carries `teams_rw ... to authenticated using (true)`
--  from 0008, so a signed-in channel admin can already look a code up and
--  this file grants nothing new. An anonymous visitor reading a public
--  channel (0017) still cannot read public.teams at all — so the client
--  site falls back to our_side there, exactly as it does for a channel
--  with no code. That is deliberate: opening public.teams would expose
--  every team in the database, not only the ones in public channels.
-- ============================================================

-- ============================================================
--  WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--  It does not touch public.matches, and it does not rewrite our_side
--  for anything already published. A channel that never sets a code
--  behaves exactly as it did before this migration ran.
-- ============================================================
