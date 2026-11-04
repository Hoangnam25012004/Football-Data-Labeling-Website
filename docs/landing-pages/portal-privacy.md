# Portal: Chính sách quyền riêng tư (privacy)

| | |
| --- | --- |
| URL live | `https://hoangnams.com/privacy.html` |
| File nguồn | [`apps/portal/privacy.html`](../../apps/portal/privacy.html) (HTML thuần) |
| CSS | `site.css` |
| Script | **Không có** |
| Người dùng | Mọi người, và quy trình xác minh thương hiệu của Google OAuth |
| Đăng nhập | Không cần |

Trang tĩnh, không có JS. Nó tồn tại vì màn hình đồng ý OAuth của Google bắt buộc có link chính
sách quyền riêng tư nằm **trên domain đã được uỷ quyền**. Google kiểm tra
`https://hoangnams.com/privacy.html`, nên `deploy.yml` copy file này ra gốc site (có comment
giải thích ngay trên dòng `cp`).

## 1. Nội dung (13 mục)

Mỗi mục là một khẳng định về hành vi của code. Khi hành vi đổi thì trang phải đổi theo.

| # | Mục | Trang khẳng định | Code phải giữ đúng |
| --- | --- | --- | --- |
| 1 | Your account | Đăng nhập bằng email/mật khẩu hoặc Google. Từ Google chỉ nhận email, tên, ảnh (scope `openid email profile`). Mật khẩu được Supabase băm, site không lưu. Trình duyệt chỉ nhớ email, không nhớ mật khẩu. | `login.html`, `tagger/auth.html` (`pitchtagger.auth.email`), `supa.js` |
| 2 | Your club's channel | Mỗi thành viên lưu email, tên hiển thị, vai trò (admin/analyst/viewer). Lời mời lưu email tới khi người đó đăng nhập. | `club_members`, `club_invites`, `claim_club_invites` |
| 3 | Settings, for analysts | Hotkey và macro gắn với tài khoản. Không ghi thời gian thao tác, không log phím, không theo dõi phiên. | `user_prefs` (migration 0020) |
| 4 | The contact form | Lưu những gì khách gõ, cộng IP băm SHA-256 kèm salt và user-agent. Gửi mail qua Resend. Không có mailing list. | `services/edge-worker/contact.js`, `public.leads` |
| 5 | Match data | Event, đội hình, tên và số áo cầu thủ cả hai đội, chỉ channel của CLB đọc được. **Video trên R2 "chỉ truy cập qua link ký ngắn hạn, không có địa chỉ public"**: xem cảnh báo ở mục 3. | `events`, `matches`, `match_reports`, `clubs.is_public`, R2 |
| 6 | What is kept in your browser | Phiên đăng nhập; event, đội hình, thông tin trận đang làm; hotkey/macro; email đăng nhập gần nhất, trạng thái rail, công cụ Film | `sb-*-auth-token`, `pitchtagger.*`, `hna.rail`, `hna.film.tools.v1` |
| 7 | Who else handles the data | Supabase, Google, Cloudflare (Worker + R2), Resend, GitHub Pages, jsDelivr/cdnjs | Các CDN trong thẻ `<script>` |
| 8 | What this site does not do | Không analytics, không tracker, không cookie theo dõi, không bán dữ liệu. Các channel tách biệt nhau bằng chính DB (RLS). | Không được thêm script analytics nào |
| 9 | How long we keep it | Tài khoản, dữ liệu trận, enquiry | |
| 10 | What you can ask for | Xem, sửa, nhận bản sao, xoá. Quyền theo GDPR. Gỡ quyền Google. | |
| 11 | Children | Tài khoản dành cho người lớn. Tên cầu thủ trẻ do CLB chịu trách nhiệm. | |
| 12 | Changes to this policy | Ngày ở đầu trang đổi theo. Thay đổi lớn thì báo qua email. | |
| 13 | Contact | Hoang Nam Dang, email, domain | |

## 2. Chức năng

Chỉ có điều hướng: logo (`index.html`), **Sign in** (`login.html`) và các link `mailto:`.

## 3. Điểm lệch giữa trang và code (phát hiện 2026-11-05)

Mục 5 viết rằng video trận *"is reachable only through short-lived signed links, not from a
public address"*. Code hiện tại không làm như vậy:

- [`r2-presign.js:55`](../../services/edge-worker/r2-presign.js#L55) chỉ ký link cho **upload**
  (`uploadUrl`) và trả về `publicUrl = R2_PUBLIC_BASE + '/' + key`.
- [`cloud-sync.js:440–452`](../../apps/tagger/cloud-sync.js#L440) lưu `publicUrl` vào
  `matches.video_url`. Video được phát từ `https://pub-….r2.dev/<key>`, một địa chỉ public
  và cố định, ai có URL đều xem được.

Cần chọn một trong hai hướng: sửa câu ở mục 5 cho đúng, hoặc chuyển sang phát video qua link ký
ngắn hạn. Việc này chưa được xử lý.

## 4. Lưu ý khi sửa

- Thêm khoá localStorage mới, bên xử lý dữ liệu mới (vd. một dịch vụ email khác) hay loại dữ liệu
  mới thì phải cập nhật mục 6 và 7. `tests/privacy-page.test.js` đối chiếu một phần nội dung với
  code, ví dụ: Worker có thật sự dùng Resend không, trang có được copy ra gốc site không.
- Không xoá dòng `cp apps/portal/privacy.html _site/privacy.html`. Google sẽ báo lỗi xác minh.
