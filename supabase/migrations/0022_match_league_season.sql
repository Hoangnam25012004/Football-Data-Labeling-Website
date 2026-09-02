-- ============================================================
--  LEAGUE AND SEASON, ON THE MATCH
-- ============================================================
-- League và mùa giải của một TRẬN, không phải của một club: một club đá nhiều
-- giải và nhiều mùa, và bảng Season trên trang cầu thủ tách theo đúng cặp đó.
-- Cùng lý do mà 0013 đặt competition/stage lên matches.
--
-- Cả hai để null. Chúng được điền bằng tay sau; cho tới lúc đó trang cầu thủ
-- đọc "—", đúng dấu mà mọi con số chưa biết trên trang ấy đang dùng.
--
-- league KHÔNG dùng lại competition: competition đang mang tên một giải đấu cụ
-- thể của một trận ("FIFA World Cup 26 Qualifying" trên channel Saint Lucia) và
-- shape() trong client/assets/supa.js đã map nó ra m.competition cho các màn
-- hình khác đọc. Ghi đè nó sẽ đổi nghĩa một cột đang được dùng.
--
-- CHẠY MIGRATION NÀY TRƯỚC KHI client/assets/supa.js?v=14 LÊN PRODUCTION.
-- Câu select ở supa.js:485 gọi tên cột tường minh, và PostgREST trả 42703 cho
-- CẢ CÂU khi một cột không tồn tại — .catch() ở cuối biến nó thành "không có
-- trận nào", không lỗi, không log, channel rỗng.
alter table public.matches add column if not exists league text;
alter table public.matches add column if not exists season text;

-- Bảng Season gom các trận của một cầu thủ theo cặp (league, season) trong một
-- channel, nên đây là ba cột được đọc cùng nhau.
create index if not exists matches_league_season_idx
  on public.matches (club_id, league, season);

-- Không policy mới: matches_read (0013) và matches_read_public (0017) là policy
-- CẤP HÀNG, nên hai cột này tự động đọc được bởi đúng những người đã đọc được
-- hàng đó. Không view nào cần sửa: match_stats là rollup của public.events và
-- không chạm tới hai cột này; public_match_stats là `select s.*` từ match_stats.
