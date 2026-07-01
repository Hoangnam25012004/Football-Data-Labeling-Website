-- ============================================================
--  Per-match video source.
--  A match can either play from a hosted URL (video_url set — e.g. a
--  Cloudflare R2 public link) or be left null, in which case each viewer
--  loads a local file. Storing only the URL keeps the DB tiny (no bytes).
--  Non-destructive: add column only.
-- ============================================================
alter table public.matches add column if not exists video_url text;
