-- ============================================================
--  Shared match video via Supabase Storage (object storage).
--  Video BYTES live in the bucket, NOT in the database — only the
--  public URL is stored on the match row.
-- ============================================================

-- public bucket so any viewer can stream the video by URL
insert into storage.buckets (id, name, public, file_size_limit)
values ('match-videos', 'match-videos', true, 524288000)        -- 500 MB/file cap
on conflict (id) do update set public = true, file_size_limit = 524288000;

-- policies on storage.objects for this bucket
drop policy if exists match_videos_read   on storage.objects;
create policy match_videos_read   on storage.objects
  for select using (bucket_id = 'match-videos');

drop policy if exists match_videos_insert on storage.objects;
create policy match_videos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'match-videos');

drop policy if exists match_videos_update on storage.objects;
create policy match_videos_update on storage.objects
  for update to authenticated using (bucket_id = 'match-videos') with check (bucket_id = 'match-videos');

drop policy if exists match_videos_delete on storage.objects;
create policy match_videos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'match-videos');

-- store only the link (not the bytes) on the match
alter table public.matches add column if not exists video_url  text;
alter table public.matches add column if not exists video_path text;
