-- ============================================================
--  0011: match date (ngày/tháng/năm diễn ra trận đấu) — shown on
--  the create-match dialog and the match-ID preview card.
--  Drop-free, safe to re-run.
-- ============================================================
alter table public.matches add column if not exists match_date date;
