-- ============================================================
--  APP TAGGING LƯU ĐƯỢC TRẬN TRỞ LẠI
-- ============================================================
--  Đọc docs/match-save-permission-design.md §2 và §6.1 TRƯỚC KHI CHẠY.
--
--  0023 làm `revoke update on public.matches from authenticated` rồi cấp lại
--  năm cột cho form Edit của site khách; 0024 thêm cột thứ sáu. APP TAGGING
--  CŨNG CHẠY DƯỚI VAI TRÒ `authenticated`, nên từ lúc 0023 chạy (đầu 9/2026),
--  mọi câu UPDATE của nó báo:
--
--      permission denied for table matches
--
--  Đội hình, Duration, tên hai đội và video dùng chung không tới database nữa
--  — chúng chỉ còn trong localStorage của đúng một trình duyệt. Chính 0023 đã
--  cảnh báo đúng chuyện này ở phần 3; bước kiểm số 3 ở đầu 0023 ("MỞ APP
--  TAGGING, TẠO MỘT TRẬN VÀ LƯU") đã không được làm sau khi chạy.
--
--  File này KHÔNG sửa 0023/0024 và không lấy đi thứ gì của chúng: `grant` là
--  cộng dồn, và phần 2 dựng lại `matches_update` với đúng hai vế cũ CỘNG một
--  vế thứ ba. Chạy lại lần hai an toàn.
--
--  SAU KHI CHẠY, KIỂM BỐN THỨ:
--    1. select round from public.matches limit 1;   -> null, không lỗi
--    2. đăng nhập bằng một tài khoản viewer, thử update một trận CỦA CLUB KHÁC
--       -> vẫn phải bị từ chối (lỗ hổng 0023 đóng, file này không mở lại)
--    3. mở app tagging, vào một trận MÌNH TẠO, đặt Duration
--       -> console không còn "duration save: permission denied"
--    4. select config from public.matches where code='37138';  -> khác '{}'
-- ============================================================


-- ------------------------------------------------------------
--  1. năm cột app tagging ghi SAU khi trận đã được tạo
-- ------------------------------------------------------------
-- Danh sách này đọc thẳng ra từ code, và nó đủ — không có cột thứ sáu nào:
--
--   lineups     cloud-sync.js onLineupsChanged()  + Player-Lists publishTeam()
--   config      cloud-sync.js onDurationChanged()
--   home_name   cloud-sync.js onTeamNamesChanged()
--   away_name   cloud-sync.js onTeamNamesChanged()
--   video_url   cloud-sync.js setVideoUrl()
--
-- KHÔNG cấp: home_score, away_score, published, club_id, our_side, code,
-- home_team_id, away_team_id, sport, match_date. App tagging chỉ đặt chúng lúc
-- INSERT (createMatchWithTeams), và INSERT chưa từng bị 0023 đụng tới.
--
-- Không có `revoke` ở file này. Một câu revoke đặt ở đây sẽ thu hồi luôn sáu
-- cột của 0023/0024 — đúng cái bẫy mà header của 0024 đã cảnh báo.
grant update (lineups, config, home_name, away_name, video_url)
  on public.matches to authenticated;


-- ------------------------------------------------------------
--  2. ai được sửa: thêm chính người đã tạo trận
-- ------------------------------------------------------------
-- Quyền cột ở phần 1 CHƯA ĐỦ. matches_update của 0023 đòi staff, hoặc admin
-- của channel chứa trận. Một trận app tagging vừa tạo có club_id = null —
-- club_id chỉ được gán khi Submit Analysis publish trận vào channel — nên với
-- người tagging không phải staff, cả hai vế đều false, câu update khớp 0 HÀNG,
-- và PostgREST trả 204 KHÔNG kèm lỗi.
--
-- Tức là: chạy mỗi phần 1 thì lỗi đỏ hôm nay biến mất, thao tác trông như đã
-- lưu, và dữ liệu vẫn không tới đâu. Im lặng còn tệ hơn báo lỗi, nên hai phần
-- này phải đi cùng nhau.
--
-- `created_by` có sẵn từ 0001 (`default auth.uid()`), tức đúng tài khoản đã bấm
-- tạo trận. Vế này KHÔNG mở lại lỗ hổng 0023 đã đóng: lỗ hổng đó là
-- `using (true)` — mọi tài khoản đã đăng nhập sửa được MỌI hàng. Vế này chỉ nói
-- "trận của chính anh", và nó không nói gì về trận của người khác.
--
-- `with check` vẫn giống hệt `using`, và điều đó vẫn không thừa: `using` nói
-- hàng nào được sửa, `with check` nói hàng SAU KHI SỬA phải trông thế nào.
-- Thiếu nó thì người tạo trận đổi được club_id để đẩy trận sang channel khác.
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches for update to authenticated
  using      (public.is_staff()
              or created_by = auth.uid()
              or (club_id is not null and public.is_club_admin(club_id)))
  with check (public.is_staff()
              or created_by = auth.uid()
              or (club_id is not null and public.is_club_admin(club_id)));

-- Không đụng matches_select, matches_insert, matches_delete của 0023 — chúng
-- không liên quan tới bug này và giữ nguyên. Không đụng public.events,
-- public.match_reports, public.clubs: §5.5 của design đã đo, quyền còn nguyên.
