-- ============================================================
--  Shared event dictionary (event name + hotkey) synced live.
--  Replaces the per-browser localStorage list when cloud-connected.
-- ============================================================

create table if not exists public.event_types (
  id          uuid primary key default gen_random_uuid(),
  sport       text not null default 'football',
  name        text not null,
  key         text,                       -- hotkey
  ord         int  not null default 0,    -- display order
  updated_at  timestamptz not null default now(),
  unique (sport, name)
);

create index if not exists event_types_sport_ord_idx on public.event_types (sport, ord);

-- RLS: any signed-in (incl. anonymous) user can read/write the shared dictionary
alter table public.event_types enable row level security;
drop policy if exists event_types_rw on public.event_types;
create policy event_types_rw on public.event_types
  for all to authenticated using (true) with check (true);

-- realtime
alter table public.event_types replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='event_types'
  ) then
    alter publication supabase_realtime add table public.event_types;
  end if;
end $$;
