-- ============================================================
--  VENUE, EDITABLE FROM A CHANNEL
-- ============================================================
--  Cột public.matches.venue đã tồn tại từ 0013 — migration này KHÔNG thêm cột
--  nào. Nó chỉ mở thêm một cột cho quyền UPDATE cấp cột mà 0023 dựng lên.
--
--  Vì sao là một file riêng chứ không sửa 0023: 0023 có `create policy`, và
--  chạy lại nó lần thứ hai sẽ lỗi vì policy đã tồn tại. File này chỉ có một câu
--  `grant`, an toàn để chạy dù 0023 đã chạy hay chưa — miễn là nó chạy SAU.
--
--  PHẢI CHẠY 0023 TRƯỚC. 0023 làm `revoke update on public.matches from
--  authenticated` rồi cấp lại năm cột; nếu chạy file này trước, câu revoke của
--  0023 sẽ thu hồi luôn cả quyền vừa cấp ở đây.
--
--  SAU KHI CHẠY, KIỂM:
--    1. mở một trận từ ⋯ → Edit trên site khách, điền Venue, Save -> không lỗi
--    2. MỞ APP TAGGING, TẠO MỘT TRẬN VÀ LƯU (lý do ở 0023, phần 3)
-- ============================================================

-- `grant` cộng dồn, không thay thế: sau 0023 vai trò authenticated được phép
-- UPDATE năm cột, và câu này làm nó thành sáu. Không đụng tới matches_update —
-- policy đó vẫn là hàng rào thật, và vẫn đòi staff hoặc admin của đúng channel.
grant update (venue) on public.matches to authenticated;

-- Không policy mới, không cột mới, không view nào phải sửa.
