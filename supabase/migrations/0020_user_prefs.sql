-- ============================================================
--  Per-analyst preferences: their own keyboard, their own macros.
--
--  public.event_types stays exactly what it was: the ONE list of
--  event names the whole website shares. This table only answers a
--  different question — "given that shared list, which key do *I*
--  press for each of them, and which runs of them do I have a
--  shorthand for". Nothing here is visible to another account.
--
--  Additive only: no rename, no drop, no change to any table that
--  came before. A tab still running the previous build keeps
--  reading event_types.key and goes on working.
-- ============================================================

create table if not exists public.user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade default auth.uid(),

  -- {"football": {"pass success":"p", "recovery":""}}
  -- "" means "I deliberately left this one unbound";
  -- a MISSING key means "give me the site default from event_types.key".
  -- The two are different, and the app tells them apart.
  hotkeys    jsonb not null default '{}'::jsonb,

  -- {"football": [{"key":"qqs","events":["recovery","pass success"]}, …]}
  -- A macro points at event NAMES, never at hotkeys, so re-binding a
  -- key — mine or the site's — can never break one.
  macros     jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

create or replace function public.touch_user_prefs()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_prefs_touch on public.user_prefs;
create trigger user_prefs_touch before update on public.user_prefs
for each row execute function public.touch_user_prefs();

-- ---------- RLS ----------
-- event_types is `using (true)` — the shared dictionary is everybody's.
-- This one is the opposite: a row is readable and writable by exactly
-- the account it belongs to, and by nobody else, ever.
alter table public.user_prefs enable row level security;

drop policy if exists user_prefs_own on public.user_prefs;
create policy user_prefs_own on public.user_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- realtime ----------
-- So a second tab signed in as the same analyst picks up a key change
-- instead of drifting. The client subscribes with filter user_id=eq.<uid>;
-- RLS means it could not see anyone else's row even without the filter.
alter table public.user_prefs replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='user_prefs'
  ) then
    alter publication supabase_realtime add table public.user_prefs;
  end if;
end $$;
