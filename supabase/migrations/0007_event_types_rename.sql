-- ============================================================
--  Consistency: event_types.name -> event_types.event_name
--  so it matches events.event_name (same concept, same column name).
--  Renaming the column automatically carries the unique(sport,name)
--  constraint over to unique(sport,event_name).
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='event_types' and column_name='name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='event_types' and column_name='event_name'
  ) then
    alter table public.event_types rename column name to event_name;
  end if;
end $$;
