-- ============================================================
--  Short 5-digit human-friendly match code (10000..99999)
--  Internal PK stays UUID; `code` is just for search/sharing.
-- ============================================================

alter table public.matches add column if not exists code text unique;

-- auto-generate a unique 5-digit code on insert
create or replace function public.gen_match_code()
returns trigger language plpgsql as $$
declare c text; tries int := 0;
begin
  if new.code is not null then return new; end if;
  loop
    c := (floor(random() * 90000) + 10000)::int::text;   -- always 5 digits
    exit when not exists (select 1 from public.matches where code = c);
    tries := tries + 1;
    if tries > 100 then
      raise exception 'could not allocate a unique match code';
    end if;
  end loop;
  new.code := c;
  return new;
end $$;

drop trigger if exists matches_code on public.matches;
create trigger matches_code before insert on public.matches
for each row execute function public.gen_match_code();

-- backfill any existing matches that have no code (collision-safe loop)
do $$
declare r record; c text;
begin
  for r in select id from public.matches where code is null loop
    loop
      c := (floor(random() * 90000) + 10000)::int::text;
      exit when not exists (select 1 from public.matches where code = c);
    end loop;
    update public.matches set code = c where id = r.id;
  end loop;
end $$;
