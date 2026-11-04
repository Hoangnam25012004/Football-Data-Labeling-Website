# Infra hardening — kiểm tra hệ thống & sửa không tốn tiền (2026-11-05)

## 1. Hiện trạng đo được

| Thành phần | Gói | Số đo |
|---|---|---|
| GitHub Pages (Fastly) | Free | `Cache-Control: max-age=600`, gzip; HTML/JS về trong 0,2–0,6 s |
| Supabase `xtzmtdcohoixoxqusyyz` (ap-southeast-1, PG 17) | **Free**, Nano, `max_connections` 60 | DB 22 MB / 500 MB; 9 trận, 10.720 events, 21 report; 58 request/24h |
| Cloudflare DNS `hoangnams.com` | Free, **DNS-only** (mây xám) | trỏ thẳng GitHub Pages |
| Worker `r2-presign` | Free (100k req/ngày) | `/` ký URL upload R2, `/contact` |
| R2 `football-videos` | 10 GB free, egress free | phát qua `pub-….r2.dev` — 1 MB đầu mất 1,7 s (~0,6 MB/s) |
| CI | Actions | chỉ deploy, **không chạy test** |

Lúc này hệ thống chạy mượt vì gần như không có tải; không có 5xx/429 trong 24h.

## 2. Phát hiện

**Nghiêm trọng (mất dữ liệu)**
- Anonymous sign-in đang **bật** (77/79 user là anonymous), và RLS của `events`, `teams`,
  `players`, `event_types` là `for all to authenticated using (true)`. Ai có publishable key
  (nằm công khai trong `supa.js`) đều có thể `signInAnonymously()` rồi xoá/sửa **toàn bộ** event
  của mọi trận. `matches` đọc được bởi mọi tài khoản (lỗ "Part B" mà 0017 để ngỏ).
- Worker presign chỉ kiểm `Origin` — curl gửi header nào cũng được. Không xác thực ⇒ bất kỳ ai
  cũng xin được URL PUT 1 giờ vào bucket, không giới hạn dung lượng. R2 tính tiền trên 10 GB.
- `match_stats` là view chạy bằng quyền owner: mọi tài khoản (kể cả anonymous) đọc tổng số
  của mọi trận, kể cả trận chưa publish của club khác.

**Hiệu năng / tải**
- `HNA.reports()` (tab Data) tải **mọi version** của mọi report: kênh public 4 trận ⇒ 19 payload,
  9,3 MB raw / 2,0 MB gzip; cần ~2 MB raw / ~0,4 MB gzip.
- `match_stats`/`public_match_stats` gộp lại toàn bộ event của kênh mỗi lần mở danh sách
  (~75 ms CPU cho 4 trận, tăng tuyến tính theo số trận). 30 request song song: p50 0,34 s → 1,0 s.
- Advisor: 5 policy gọi `auth.uid()` theo từng dòng; 3 bảng có 2 policy SELECT; 8 FK chưa index
  (bảng nhỏ, bỏ qua).
- Video 702 MB không "faststart" (`moov` ở cuối file): trình duyệt phải tải đuôi file trước khi
  phát được. `r2.dev` bị Cloudflare giới hạn tốc độ và không dành cho production.

**Vận hành**
- Supabase Free **tự pause sau 7 ngày không có hoạt động** ⇒ portal trống trơn với club.
- Free plan không có backup tải về được.
- `supabase-js@2` không ghim version: CDN đang trả 2.118.0, bản mới nhất 2.119.0 — một bản phát
  hành mới vào thẳng production mà không qua test.
- Không có giám sát; CI không chạy 1.589 test trước deploy; không kiểm file deploy có 404 không.
- Rate limit của `/contact` chưa bật (KV chưa bind) ⇒ có thể bị spam hết quota Resend (100/ngày).

## 3. 1000 người dùng cùng lúc?

| Lớp | 1000 người cùng lúc | Ghi chú |
|---|---|---|
| Static (GitHub Pages) | **Ổn** | ~200 KB/người ⇒ 200 MB; hạn mềm 100 GB/tháng |
| Supabase REST (danh sách trận) | **Trước sửa: nghẽn** — 1000 × 75 ms CPU trên Nano ⇒ hàng chục giây | Sau 0026: tra index, ~1 ms |
| Supabase egress | **Giới hạn thật sự**: 5 GB/tháng | Trước: ~2 MB gzip/người mở tab Data ⇒ ~2.500 lượt là hết. Sau: ~0,4 MB ⇒ ~12.000 lượt |
| Realtime | Ổn | Portal không dùng realtime; free 200 kết nối, chỉ analyst dùng |
| Video qua r2.dev | **Không ổn** | 1000 × ~5 Mbit/s từ endpoint bị rate-limit, không cache. Cần custom domain (mục 5) |
| Worker | Ổn | Chỉ analyst gọi |

Kết luận: 1000 người **rải trong ngày** thì chạy được; 1000 người **cùng một phút** thì trước khi
sửa sẽ nghẽn ở Postgres và đốt hết egress tháng; video là điểm yếu nhất cho tới khi có custom domain.

## 4. Đã sửa trong repo (nhánh `infra-hardening`)

1. `0026_staff_writes_and_read_path.sql`
   - events/players: chỉ staff. teams/event_types: ai cũng đọc, staff ghi. matches: staff, người
     tạo, admin của kênh, member khi đã publish. Có guard: `public.staff` rỗng thì dừng, không đổi gì.
   - `(select auth.uid())`, tách policy `for all`, thu `EXECUTE` của anon, cố định `search_path`.
   - `match_reports_latest` (security_invoker): mỗi trận một dòng.
   - `private.match_stats_mv` + pg_cron mỗi phút (chỉ refresh khi `events` đổi);
     `match_stats` thêm bộ lọc dòng. Số trên danh sách có thể trễ tối đa ~1 phút.
2. `supa.js` đọc `match_reports_latest`, thiếu view thì quay về bảng cũ (deploy được trước migration).
3. Worker presign đòi `Authorization: Bearer <token>` của tài khoản staff không-anonymous;
   `matchId` phải là uuid; thiếu secret Supabase thì từ chối hết. `cloud-sync.js` gửi token.
4. Ghim `supabase-js@2.118.0` trên 6 trang.
5. CI: job `test` chạy trước `deploy`; sau deploy curl mọi file trong `_site/` theo đường dẫn live.
6. `health.yml` (mỗi giờ): probe Pages, Supabase REST + Auth, Worker — kiêm keep-alive.
7. `backup.yml` (hằng tuần): pg_dump → gpg AES256 → artifact 30 ngày (repo public nên bắt buộc mã hoá).

Test khoá: `tests/infra-hardening.test.js`, `tests/upload-auth.test.js`, `tests/data-page.test.js`.

## 5. Thứ tự triển khai

1. Thêm analyst vào `public.staff` (SQL ở đầu 0026).
2. Chạy 0026 trong SQL editor. Kiểm bốn bước ở đầu file.
3. `cd services/edge-worker && npx wrangler deploy` (Worker mới cho phép header `authorization`).
4. Merge vào `main` ⇒ CI test ⇒ deploy ⇒ smoke test.
   Giữa 3 và 4 vài phút, tab tagger cũ chưa gửi token sẽ upload lỗi 401 — tải lại trang là xong.
5. Việc trên dashboard (không làm được từ code):
   - Cloudflare → R2 → bucket → **Custom domain** `videos.hoangnams.com` (zone đã ở Cloudflare, free),
     rồi đổi `R2_PUBLIC_BASE` (wrangler.toml) và `CONFIG.R2.publicBase` (cloud-sync.js). URL r2.dev
     cũ trong `matches.video_url` vẫn chạy.
   - Trước khi upload video: `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4` (không mã hoá lại).
   - `npx wrangler kv namespace create CONTACT_KV`, bỏ comment block `[[kv_namespaces]]`, deploy lại.
   - GitHub → Settings → Secrets: `SUPABASE_DB_URL` (Session pooler), `BACKUP_PASSPHRASE`.
   - Supabase → Authentication: tắt anonymous sign-in khi chắc không analyst nào còn dùng.
