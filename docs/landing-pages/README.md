# Landing pages: mô tả chức năng từng trang

Mỗi trang HTML mà người dùng mở được trên hoangnams.com có **một doc** trong folder này.
Doc mô tả trang đó làm được gì: mỗi chức năng người dùng thấy, function JS xử lý nó
(kèm `file:dòng`), dữ liệu nó đọc/ghi (localStorage, bảng Supabase, Worker), và những
điểm cần biết trước khi sửa.

Người đọc: dev làm việc trên repo. Tên hàm, tên bảng, ID phần tử giữ nguyên tiếng Anh.

| # | Doc | Trang | File nguồn | URL live | Ai dùng | Cần đăng nhập |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [portal-landing.md](portal-landing.md) | Trang giới thiệu | `apps/portal/index.html` | `/` | Khách, CLB tiềm năng | Không |
| 2 | [portal-login.md](portal-login.md) | Đăng nhập CLB | `apps/portal/login.html` | `/login.html` | CLB | Không (đây là cửa đăng nhập) |
| 3 | [portal-app.md](portal-app.md) | Channel app | `apps/portal/app.html` + `assets/app.js` | `/app.html` | CLB | Có. Riêng channel public thì không |
| 4 | [portal-guide.md](portal-guide.md) | Hướng dẫn dùng Film | `apps/portal/guide.html` | `/guide.html` | CLB | Không |
| 5 | [portal-privacy.md](portal-privacy.md) | Chính sách quyền riêng tư | `apps/portal/privacy.html` | `/privacy.html` | Mọi người, Google OAuth | Không |
| 6 | [tagger-auth.md](tagger-auth.md) | Đăng nhập analyst | `apps/tagger/auth.html` + `auth.js` | `/tagger/auth` (và `/auth`) | Analyst | Không (đây là cửa đăng nhập) |
| 7 | [tagger-tagging.md](tagger-tagging.md) | Tab gắn nhãn | `apps/tagger/index.html` + `cloud-sync.js` | `/tagger/` | Analyst | Có |
| 8 | [tagger-stats.md](tagger-stats.md) | Trang Stats (và tab Analysis của portal) | `apps/tagger/Stats/*` | `/tagger/Stats/` | Analyst, CLB | Có |
| 9 | [tagger-player-lists.md](tagger-player-lists.md) | Danh sách cầu thủ / đội hình | `apps/tagger/Player-Lists/index.html` | `/tagger/Player-Lists/` | Analyst | Có |

Ngoài phạm vi: `apps/portal/demo-film.html` và các script `demo-*` chỉ dùng để quay clip demo,
chạy local, bị git ignore và không được deploy.

## Hai site nối với nhau thế nào

```text
 Khách ──► / (landing) ──► login.html ──► app.html ──► #/match/<slug> ──► Analysis
                │                              ▲            (mount Stats/stats-view.js
                │ form liên hệ                 │             với payload match_reports)
                ▼                              │
        Worker /contact ─► public.leads        │  đọc match_reports (đã publish)
                                               │
 Analyst ─► /tagger/auth ─► /tagger/ (gắn nhãn) ──⇪ Submit Analysis──► rpc publish_match_report
                               │      │
                               │      └─► Stats/ (cùng stats-view.js), Player-Lists/
                               └─► Supabase realtime: matches, events, event_types, user_prefs
```

- **Tagger** ghi dữ liệu sống (`public.events`, `matches`, `teams`, `players`…).
- **Portal** không bao giờ đọc `public.events`. Nó chỉ đọc ảnh chụp đã đóng băng trong
  `public.match_reports`, do nút ⇪ Submit Analysis của tagger tạo ra.
- `Stats/stats-view.js` là **một file duy nhất** chạy ở hai nơi: trang Stats của tagger và
  tab Analysis của portal. Doc [tagger-stats.md](tagger-stats.md) mô tả nó, và
  [portal-app.md](portal-app.md) chỉ nêu phần khác biệt.

## Quy ước trong các doc

- Đường dẫn file tính từ gốc repo. Link có dạng `../../apps/...#L123`.
- **Số dòng đúng tại thời điểm viết (2026-11-05)** và sẽ lệch khi code đổi. Hãy tìm
  theo tên hàm: tên hàm ổn định hơn số dòng.
- "Design doc" là các file trong [`docs/design/`](../design/). Đó là nơi ghi *vì sao*
  chức năng được làm như vậy. Doc ở đây chỉ mô tả *hiện tại nó làm gì*.
- URL live là hợp đồng với người dùng. Repo được copy sang site bằng danh sách `cp` trong
  [`deploy.yml`](../../.github/workflows/deploy.yml). Trang mới hay file mới phải có dòng
  `cp`, không thì sẽ 404.

## Khi thêm hoặc đổi một trang

1. Viết hoặc cập nhật doc tương ứng ở đây. Một trang ứng với một doc.
2. Thêm dòng vào bảng trên.
3. Nhớ dòng `cp` trong `deploy.yml` và bump `?v=` cho asset đã sửa (xem `CLAUDE.md`).
