-- ============================================================
--  ROUND, AND WHO MAY EDIT A MATCH
-- ============================================================
--  Đọc phần 2 và phần 3 TRƯỚC KHI CHẠY. Phần 1 chỉ thêm một cột; phần 2 THAY
--  một policy đang tồn tại, và phần 3 thu hồi một quyền mà app tagging cũng
--  chạy dưới đó. Xem docs/match-edit-design.md §6 và §13-Q3.
--
--  SAU KHI CHẠY, KIỂM BA THỨ:
--    1. select round from public.matches limit 1;      -> null, không lỗi
--    2. đăng nhập bằng một tài khoản viewer, thử update một trận -> bị từ chối
--    3. MỞ APP TAGGING, TẠO MỘT TRẬN VÀ LƯU. Nếu nó hỏng, xem phần 3.
-- ============================================================


-- ------------------------------------------------------------
--  1. cột round
-- ------------------------------------------------------------
-- Vòng đấu của một TRẬN: "Round 3", "Matchday 12", "Quarter-final". Để null;
-- điền từ form Edit trên site khách. Cùng chỗ với league/season của 0022 vì
-- cùng lý do: một club đá nhiều giải, nên vòng đấu thuộc về trận chứ không
-- thuộc về club.
--
-- Không dùng lại matches.stage của 0013 dù nghĩa gốc của nó chính là vòng đấu:
-- channel Saint Lucia đã có chữ trong cột đó, và 0022 cũng đã chọn thêm cột mới
-- thay vì dùng lại competition. Một quy ước, không hai.
alter table public.matches add column if not exists round text;


-- ------------------------------------------------------------
--  2. siết quyền GHI xuống đúng người
-- ------------------------------------------------------------
-- 0001 đặt:
--     matches_rw  for all to authenticated  using (true) with check (true)
-- `for all` gồm cả UPDATE, và `using (true)` không lọc gì. Tức mọi tài khoản
-- đã đăng nhập UPDATE được MỌI hàng — trận của club khác, và trận chưa publish.
-- 0013 có sẵn một bản chặt hơn nhưng bị comment toàn bộ và chưa từng chạy.
--
-- Đây là lỗ hổng ĐÃ CÓ SẴN. Nút Edit trên site khách không tạo ra nó, nhưng
-- biến nó từ "phải tự gọi API" thành "bấm một cái", nên nó được đóng ở đây.
drop policy if exists matches_rw on public.matches;

-- Đọc: KHÔNG ĐỔI. using(true) là đúng bằng hành vi hôm nay. Thu hẹp quyền đọc
-- là một thay đổi khác, chưa được yêu cầu, và sẽ làm app tagging mất trận.
create policy matches_select on public.matches for select to authenticated
  using (true);

-- Tạo: KHÔNG ĐỔI. App tagging tạo trận trước khi trận thuộc về channel nào.
create policy matches_insert on public.matches for insert to authenticated
  with check (true);

-- Sửa: staff, hoặc admin của ĐÚNG channel chứa trận đó.
-- is_club_admin() là hàm của 0014, security definer, nên nó không vướng RLS của
-- chính public.club_members khi được gọi từ trong policy này.
--
-- `with check` giống hệt `using` và điều đó không thừa: `using` nói hàng nào
-- được phép sửa, `with check` nói hàng SAU KHI SỬA phải trông thế nào. Thiếu nó
-- thì một admin đổi được club_id để đẩy trận sang channel khác — nơi họ không
-- còn là admin, và không ai lấy lại được.
--
-- club_id is not null: một trận chưa publish vào channel nào không có admin nào
-- cả, nên chỉ staff chạm được. Không có nó, is_club_admin(null) trả false và kết
-- quả giống hệt — mệnh đề này nói ra ý định thay vì để nó là tình cờ.
create policy matches_update on public.matches for update to authenticated
  using      (public.is_staff() or (club_id is not null and public.is_club_admin(club_id)))
  with check (public.is_staff() or (club_id is not null and public.is_club_admin(club_id)));

-- Xoá: chỉ staff. Site khách không có nút xoá trận, và không có ý định thêm.
create policy matches_delete on public.matches for delete to authenticated
  using (public.is_staff());


-- ------------------------------------------------------------
--  3. giới hạn UPDATE xuống đúng năm cột
-- ------------------------------------------------------------
-- RLS là cấp HÀNG. Cho phép một admin sửa hàng là cho phép họ sửa cả
-- home_score, published và club_id — tức sửa được tỉ số trận đấu từ một form
-- nói rằng nó sửa ngày và giải đấu. Quyền cấp CỘT là thứ duy nhất nói được
-- "chỉ năm cột này".
--
-- Năm cột: bốn trường của form, cộng match_date. Form ghi ngày vào CẢ hai cột
-- ngày (kickoff của 0013 và match_date của 0011) vì shape() trong
-- client/assets/supa.js đọc `m.kickoff || m.match_date`, còn app tagging đọc
-- match_date — ghi một cột để site khách đúng sẽ để app tagging đọc ngày cũ.
--
-- CẢNH BÁO: revoke này áp cho vai trò `authenticated`, và APP TAGGING CŨNG CHẠY
-- DƯỚI VAI TRÒ ĐÓ. Nếu sau khi tạo trận nó còn UPDATE cột nào khác của
-- public.matches — config khi đặt Duration, home_score khi sửa tỉ số,
-- home_team_id, lineups… — cột đó phải được thêm vào grant bên dưới, nếu không
-- thao tác ấy sẽ báo "permission denied for table matches".
--
-- Đây là điều phải kiểm ngay sau khi chạy (mục 3 ở đầu file). Nếu app tagging
-- hỏng, thêm cột nó cần vào danh sách dưới đây và chạy lại chỉ hai câu cuối —
-- matches_update ở phần 2 vẫn là hàng rào thật, và nó không đổi.
revoke update on public.matches from authenticated;
grant  update (kickoff, match_date, league, season, round)
  on public.matches to authenticated;

-- Không đụng public.events, public.match_reports, public.clubs: tài liệu này
-- chỉ nói về bốn trường mô tả của một trận.
