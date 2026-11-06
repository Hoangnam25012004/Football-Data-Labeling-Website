-- ============================================================
--  Film: tags, playlists and code buttons.
--
--  What an analyst says about a stretch of video: a code, a few
--  labels, a note, a playlist it belongs to. This is text about the
--  video, never video, and it never touches public.events or
--  public.match_reports. Design: docs/design/film-analyst-toolkit-design.md.
--
--  Additive. Nothing existing is dropped or altered.
-- ============================================================

create table if not exists public.film_playlists (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists film_playlists_name_uq
  on public.film_playlists (club_id, lower(name));
create index if not exists film_playlists_created_by_idx on public.film_playlists (created_by);

create table if not exists public.film_codes (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 40),
  color      text not null default '#6C6164' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists film_codes_name_uq
  on public.film_codes (club_id, lower(name));
create index if not exists film_codes_created_by_idx on public.film_codes (created_by);

create table if not exists public.film_tags (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  match_id    uuid not null references public.matches(id) on delete cascade,
  -- the FILE's clock, the same one r.t uses
  t_in        double precision not null check (t_in >= 0),
  t_out       double precision not null,
  code        text check (code is null or length(code) <= 40),
  color       text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  team        text check (team is null or length(team) <= 80),
  outcome     text check (outcome is null or length(outcome) <= 40),
  zone        text check (zone is null or length(zone) <= 40),
  players     text check (players is null or length(players) <= 200),
  note        text check (note is null or length(note) <= 2000),
  -- deleting a playlist must not delete the analysis filed under it
  playlist_id uuid references public.film_playlists(id) on delete set null,
  visibility  text not null default 'private' check (visibility in ('private','channel')),
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (t_out > t_in)
);
create index if not exists film_tags_match_idx on public.film_tags (club_id, match_id, t_in);
create index if not exists film_tags_match_id_idx on public.film_tags (match_id);
create index if not exists film_tags_playlist_idx on public.film_tags (playlist_id);
create index if not exists film_tags_created_by_idx on public.film_tags (created_by);

-- ---------- who may share ----------
-- A viewer may keep private notes. Saying something to the whole channel is
-- the analyst's and the admin's.
create or replace function public.is_club_analyst(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_members m
     where m.club_id = cid and m.user_id = auth.uid() and m.role in ('admin','analyst')
  );
$$;

-- A tag must point at a match of the channel it is filed under. Security
-- definer, because public.matches is not readable by every member's RLS path.
create or replace function public.film_match_in_club(mid uuid, cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m where m.id = mid and m.club_id = cid);
$$;

revoke execute on function public.is_club_analyst(uuid)         from public, anon;
revoke execute on function public.film_match_in_club(uuid, uuid) from public, anon;
grant  execute on function public.is_club_analyst(uuid)         to authenticated;
grant  execute on function public.film_match_in_club(uuid, uuid) to authenticated;

-- ---------- row level security ----------
alter table public.film_playlists enable row level security;
alter table public.film_codes     enable row level security;
alter table public.film_tags      enable row level security;

drop policy if exists film_playlists_select on public.film_playlists;
drop policy if exists film_playlists_insert on public.film_playlists;
drop policy if exists film_playlists_update on public.film_playlists;
drop policy if exists film_playlists_delete on public.film_playlists;
create policy film_playlists_select on public.film_playlists for select to authenticated
  using (public.is_club_member(club_id));
create policy film_playlists_insert on public.film_playlists for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_club_member(club_id));
create policy film_playlists_update on public.film_playlists for update to authenticated
  using (created_by = (select auth.uid()) or public.is_club_admin(club_id))
  with check (public.is_club_member(club_id));
create policy film_playlists_delete on public.film_playlists for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_club_admin(club_id));

drop policy if exists film_codes_select on public.film_codes;
drop policy if exists film_codes_insert on public.film_codes;
drop policy if exists film_codes_delete on public.film_codes;
create policy film_codes_select on public.film_codes for select to authenticated
  using (public.is_club_member(club_id));
create policy film_codes_insert on public.film_codes for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_club_analyst(club_id));
create policy film_codes_delete on public.film_codes for delete to authenticated
  using (public.is_club_admin(club_id));

drop policy if exists film_tags_select on public.film_tags;
drop policy if exists film_tags_insert on public.film_tags;
drop policy if exists film_tags_update on public.film_tags;
drop policy if exists film_tags_delete on public.film_tags;
create policy film_tags_select on public.film_tags for select to authenticated
  using (public.is_club_member(club_id)
         and (visibility = 'channel' or created_by = (select auth.uid())));
create policy film_tags_insert on public.film_tags for insert to authenticated
  with check (created_by = (select auth.uid())
              and public.is_club_member(club_id)
              and public.film_match_in_club(match_id, club_id)
              and (visibility = 'private' or public.is_club_analyst(club_id)));
create policy film_tags_update on public.film_tags for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid())
              and public.is_club_member(club_id)
              and public.film_match_in_club(match_id, club_id)
              and (visibility = 'private' or public.is_club_analyst(club_id)));
create policy film_tags_delete on public.film_tags for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_club_admin(club_id));

-- ---------- grants ----------
-- RLS decides which rows; these decide whether the verb is allowed at all.
-- Nothing for anon: a signed-out reader of a public channel has no tags.
revoke all on public.film_playlists from anon;
revoke all on public.film_codes     from anon;
revoke all on public.film_tags      from anon;
grant select, insert, update, delete on public.film_playlists to authenticated;
grant select, insert, delete         on public.film_codes     to authenticated;
grant select, insert, update, delete on public.film_tags      to authenticated;
