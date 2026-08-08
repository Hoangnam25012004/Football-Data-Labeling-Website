-- ============================================================
--  Channels a client can create and run themselves.
--
--  0013 made a channel something only staff could hand out. This
--  file makes it something a signed-in person can create: whoever
--  creates a channel is its admin, and an admin invites the rest
--  of the club into it. One channel is still one club.
--
--  ADDITIVE except for the policies it replaces on public.clubs
--  and public.club_members — those two tables are read and written
--  by the client site only. Nothing here touches the policies on
--  matches, events, teams or players, so the tagging app carries
--  on exactly as before.
--
--  Safe to run and re-run:  supabase db push
--                           (or paste into the SQL Editor)
-- ============================================================

-- ---------- what a channel now carries ----------
alter table public.clubs add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table public.clubs add column if not exists sport      text not null default 'football';
alter table public.clubs add column if not exists country    text;

-- The membership row keeps its own copy of who the person is.
-- auth.users is not readable from the browser, so without this an
-- admin would see a members list of bare uuids.
alter table public.club_members add column if not exists email        text;
alter table public.club_members add column if not exists display_name text;

-- ---------- INVITES ----------
-- An invite is by email, because the person being invited may not
-- have an account yet. Nothing is emailed from here: the row sits
-- until that email signs in, and claim_club_invites() turns it into
-- a membership. The admin sends the link themselves.
create table if not exists public.club_invites (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  email       text not null,
  role        text not null default 'viewer' check (role in ('viewer','analyst','admin')),
  invited_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);

-- one open invite per address per channel; accepted ones are kept as history
create unique index if not exists club_invites_open_idx
  on public.club_invites (club_id, lower(email)) where accepted_at is null;
create index if not exists club_invites_email_idx on public.club_invites (lower(email));

-- ============================================================
--  WHO IS WHAT, ANSWERED WITHOUT RECURSION
--
--  A policy on club_members may not itself select from
--  club_members — Postgres re-enters the same policy and errors
--  out with infinite recursion. These are SECURITY DEFINER, so
--  their own reads run as the owner and skip RLS entirely.
-- ============================================================
create or replace function public.jwt_email()
returns text language sql stable as $$
  select lower(nullif(current_setting('request.jwt.claims', true)::jsonb->>'email', ''));
$$;

create or replace function public.jwt_name()
returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'full_name', '');
$$;

create or replace function public.is_club_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_members m
     where m.club_id = cid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_club_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_members m
     where m.club_id = cid and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

-- ---------- creating a channel makes you its admin ----------
-- In the same transaction as the insert, so there is never a moment
-- where a channel exists that nobody can administer.
create or replace function public.club_creator_is_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.club_members (club_id, user_id, role, email, display_name)
    values (new.id, new.created_by, 'admin', public.jwt_email(), public.jwt_name())
    on conflict (club_id, user_id) do update set role = 'admin';
  end if;
  return new;
end $$;

drop trigger if exists clubs_creator_admin on public.clubs;
create trigger clubs_creator_admin after insert on public.clubs
for each row execute function public.club_creator_is_admin();

-- ---------- a channel always keeps an admin ----------
-- Removing the last admin, or demoting them, would leave a channel
-- nobody can add anyone to and nobody can delete.
create or replace function public.club_keep_an_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare admins integer;
begin
  -- the channel itself being deleted cascades to its members; that is
  -- not the case this guards, and the parent row is already gone here
  if not exists (select 1 from public.clubs c where c.id = old.club_id) then
    return old;
  end if;

  select count(*) into admins
    from public.club_members
   where club_id = old.club_id and role = 'admin';

  if admins <= 1 then
    raise exception 'A channel must keep at least one admin.'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists club_members_keep_admin_del on public.club_members;
create trigger club_members_keep_admin_del before delete on public.club_members
for each row when (old.role = 'admin')
execute function public.club_keep_an_admin();

drop trigger if exists club_members_keep_admin_upd on public.club_members;
create trigger club_members_keep_admin_upd before update of role on public.club_members
for each row when (old.role = 'admin' and new.role <> 'admin')
execute function public.club_keep_an_admin();

-- ---------- turning invites into memberships ----------
-- Called by the client site on every load. It is the only way a row
-- appears in club_members without an admin writing it, and it can
-- only ever add the caller — the email it matches on is the one in
-- the caller's own token.
create or replace function public.claim_club_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  mail text := public.jwt_email();
  nm   text := public.jwt_name();
  n    integer := 0;
begin
  if uid is null or mail is null then return 0; end if;

  insert into public.club_members (club_id, user_id, role, email, display_name)
  select i.club_id, uid, i.role, mail, nm
    from public.club_invites i
   where lower(i.email) = mail and i.accepted_at is null
  on conflict (club_id, user_id) do nothing;

  with done as (
    update public.club_invites
       set accepted_at = now(), accepted_by = uid
     where lower(email) = mail and accepted_at is null
    returning 1
  )
  select count(*) into n from done;

  return n;
end $$;

grant execute on function public.claim_club_invites() to authenticated;
grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.is_club_admin(uuid)  to authenticated;

-- ============================================================
--  ROW-LEVEL SECURITY
--  Replaces the staff-only write policies from 0013 on these two
--  tables (and adds the invites table). Reading is unchanged in
--  spirit: you see a channel because you are in it.
-- ============================================================
alter table public.clubs        enable row level security;
alter table public.club_members enable row level security;
alter table public.club_invites enable row level security;

-- ---------- clubs ----------
drop policy if exists clubs_read on public.clubs;
create policy clubs_read on public.clubs for select to authenticated
  using (public.is_staff() or public.is_club_member(clubs.id));

-- 0013 had a single staff-only `for all` policy; it becomes three,
-- so that creating is open and changing stays with the channel's admins
drop policy if exists clubs_write  on public.clubs;
drop policy if exists clubs_insert on public.clubs;
create policy clubs_insert on public.clubs for insert to authenticated
  with check (public.is_staff() or created_by = auth.uid());

drop policy if exists clubs_update on public.clubs;
create policy clubs_update on public.clubs for update to authenticated
  using       (public.is_staff() or public.is_club_admin(clubs.id))
  with check  (public.is_staff() or public.is_club_admin(clubs.id));

drop policy if exists clubs_delete on public.clubs;
create policy clubs_delete on public.clubs for delete to authenticated
  using (public.is_staff() or public.is_club_admin(clubs.id));

-- ---------- club_members ----------
drop policy if exists club_members_read on public.club_members;
create policy club_members_read on public.club_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_staff()
    or public.is_club_member(club_members.club_id)
  );

drop policy if exists club_members_write  on public.club_members;
drop policy if exists club_members_modify on public.club_members;
create policy club_members_modify on public.club_members for all to authenticated
  using      (public.is_staff() or public.is_club_admin(club_members.club_id))
  with check (public.is_staff() or public.is_club_admin(club_members.club_id));

-- ---------- club_invites ----------
-- The person invited may read their own pending invite before they
-- have any membership at all — otherwise they could not be told why
-- a channel is about to appear.
drop policy if exists club_invites_read on public.club_invites;
create policy club_invites_read on public.club_invites for select to authenticated
  using (
    public.is_staff()
    or public.is_club_admin(club_invites.club_id)
    or lower(club_invites.email) = public.jwt_email()
  );

drop policy if exists club_invites_modify on public.club_invites;
create policy club_invites_modify on public.club_invites for all to authenticated
  using      (public.is_staff() or public.is_club_admin(club_invites.club_id))
  with check (public.is_staff() or public.is_club_admin(club_invites.club_id));

-- ============================================================
--  WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--  Part B of 0013 — the policies that stop one signed-in account
--  reading another club's matches and events — is still commented
--  out there, and still needs you to put every analyst into
--  public.staff before it is run. Creating channels does not
--  depend on it, so it stays a separate, deliberate decision.
-- ============================================================
