-- ============================================================
--  Submit Analysis — the border between the two apps.
--
--  Realtime stops at the tagging app. What crosses over to the
--  client site is not a stream of events but ONE signed-off row:
--  the match, frozen at the moment an analyst said it was done.
--
--  That is what lets the client site read a match report without
--  ever being granted read access to public.events, and without
--  paging eighteen hundred rows to draw a table.
--
--  The payload is the four things Stats renders from — rows, meta,
--  lineups, dur — which is also exactly what tests/harness.js
--  injects to run those renderers. The shape is not invented here;
--  it is the contract that already exists.
--
--  Additive. Nothing existing is dropped or altered.
--  Safe to run and re-run:  supabase db push
--                           (or paste into the SQL Editor)
-- ============================================================

create table if not exists public.match_reports (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.matches(id) on delete cascade,
  club_id      uuid references public.clubs(id) on delete set null,

  -- append-only: publishing again adds version 2, it does not overwrite
  -- version 1. A report signed off in error can be pointed away from,
  -- and there is a record of what the club was shown and when.
  version      integer not null,

  -- the payload's own shape version. A renderer must go on reading
  -- schema 1 for as long as a schema 1 row exists, which is forever.
  schema       integer not null default 1,

  payload      jsonb not null,
  event_count  integer,                      -- shown at publish time, so a short report is obvious

  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) default auth.uid(),

  unique (match_id, version)
);

create index if not exists match_reports_latest_idx
  on public.match_reports (club_id, match_id, version desc);
create index if not exists match_reports_match_idx
  on public.match_reports (match_id, version desc);

-- ---------- who may read one ----------
alter table public.match_reports enable row level security;

drop policy if exists match_reports_read on public.match_reports;
create policy match_reports_read on public.match_reports for select to authenticated
  using (
    public.is_staff()
    or (club_id is not null and public.is_club_member(club_id))
  );

-- Writing goes through publish_match_report() below, but a direct write by
-- staff or a channel admin is allowed too — the function is a convenience,
-- not a privilege boundary.
drop policy if exists match_reports_write on public.match_reports;
create policy match_reports_write on public.match_reports for all to authenticated
  using      (public.is_staff() or (club_id is not null and public.is_club_admin(club_id)))
  with check (public.is_staff() or (club_id is not null and public.is_club_admin(club_id)));

-- ============================================================
--  PUBLISHING
--
--  Two things have to happen together: the report is written, and
--  the match is pointed at the channel and marked published. One
--  without the other is a channel showing a fixture it cannot open,
--  or a report nobody can reach. A function is one transaction, so
--  either both land or neither does.
--
--  SECURITY DEFINER with the check written out: under Part B of
--  0013, changing public.matches is staff-only, and a channel admin
--  publishing their own club's match should not need to be staff.
-- ============================================================
create or replace function public.publish_match_report(
  p_match_id    uuid,
  p_club_id     uuid,
  p_payload     jsonb,
  p_event_count integer default null,
  p_schema      integer default 1
)
returns public.match_reports
language plpgsql security definer set search_path = public as $$
declare
  next_version integer;
  saved        public.match_reports;
begin
  if not (public.is_staff() or public.is_club_admin(p_club_id)) then
    raise exception 'Only staff, or an admin of this channel, may publish a match report.'
      using errcode = '42501';
  end if;

  if p_payload is null or p_payload = 'null'::jsonb then
    raise exception 'A report with no payload is not a report.' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
    from public.match_reports where match_id = p_match_id;

  insert into public.match_reports (match_id, club_id, version, schema, payload, event_count)
  values (p_match_id, p_club_id, next_version, coalesce(p_schema, 1), p_payload, p_event_count)
  returning * into saved;

  update public.matches
     set club_id   = p_club_id,
         published = true
   where id = p_match_id;

  return saved;
end $$;

grant execute on function public.publish_match_report(uuid, uuid, jsonb, integer, integer) to authenticated;

-- ---------- what the client reads ----------
-- The newest report for a match, and nothing else. Written as a function
-- rather than a view so the client cannot accidentally pull every version
-- of every report in one query.
create or replace function public.latest_match_report(p_match_id uuid)
returns public.match_reports
language sql stable security invoker set search_path = public as $$
  select * from public.match_reports
   where match_id = p_match_id
   order by version desc
   limit 1;
$$;

grant execute on function public.latest_match_report(uuid) to authenticated;

comment on table public.match_reports is
  'Signed-off snapshot of one match, as Submit Analysis froze it. The client
   site reads these instead of public.events. Append-only: publishing again
   adds a version.';
