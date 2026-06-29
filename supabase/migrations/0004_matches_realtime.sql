-- ============================================================
--  Enable realtime on matches so team-name changes (home_name /
--  away_name) sync live between clients viewing the same match.
-- ============================================================

alter table public.matches replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end $$;
