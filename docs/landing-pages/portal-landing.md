# Portal: Trang giới thiệu (landing page)

| | |
| --- | --- |
| URL live | `https://hoangnams.com/` |
| File nguồn | [`apps/portal/index.html`](../../apps/portal/index.html), toàn bộ JS nằm inline trong một IIFE ở cuối file ([dòng 717](../../apps/portal/index.html#L717)) |
| CSS | `assets/site.css?v=3` |
| Script ngoài | Không có. Trang không nạp Supabase, không nạp `app.js`. |
| Người dùng | Khách vãng lai, CLB và học viện đang tìm hiểu dịch vụ |
| Đăng nhập | Không cần |
| Design doc | [`contact-form-design.md`](../design/contact-form-design.md) |

Trang marketing một trang, cuộn dọc, gồm 7 khu vực. Ngoài nội dung tĩnh, nó có 7 chức năng
chạy bằng JS: chuyển tiếp token đăng nhập, menu mobile, copy email, form liên hệ, hiệu ứng
xuất hiện, bộ đếm số và bảng chiến thuật động.

## 1. Bố cục và điều hướng

| Khu vực | Anchor | Nội dung |
| --- | --- | --- |
| Thanh nav | `#top` | Logo, link tới 5 khu vực, **Log in** (`login.html`), **Book a demo** (`#contact`) |
| Hero | `#top` | Tiêu đề *"Every touch is a row of data"*, 2 CTA: **Open your channel** (`app.html`) và **Talk to us** (`#contact`). Có 3 con số đếm, bảng tỉ số giả *Saint Lucia 2–1 Barbados*, canvas chiến thuật và *Event feed*. Dải "Working with" có logo Hanley Town FC (link LinkedIn). |
| Process | `#process` | 3 bước: gửi video, analyst tag, nhận lại trong channel trong vòng 24h |
| Product | `#product` | 6 thẻ: Match report, Shot map, Passing network, Player profile, Defensive map, Exports |
| Platform | `#platform` | "One channel per club", demo dữ liệu thật của Saint Lucia (**Open the channel** dẫn tới `app.html`) và thẻ **Sign in** cho CLB đã là khách |
| Data | `#data` | Mẫu CSV `shooting_home`, 18 trên 38 event của từ điển, bảng các cột mà mỗi dòng mang theo |
| Pricing | `#pricing` | Một gói đầy đủ, 2 cách mua: Per match và Per season. Cả hai nút **Request a quote** dẫn tới `#contact`. |
| Contact | `#contact` | Ưu đãi "phân tích trận đầu miễn phí", nút **Email us** (`mailto:`), nút copy địa chỉ email và form liên hệ |
| Footer | | Link Product/Platform/Company, **Tagging app** (`tagger/`), **Privacy** (`privacy.html`) |

> Theo quy tắc trong `CLAUDE.md`, mọi khẳng định trên trang (số metric, tên event, nội dung
> export) phải khớp với code. Trước khi sửa copy, hãy grep `data/definitions/pitchtagger_events.json`,
> `PLAYER_CATS` và `TEAM_SECTIONS` trong `shared.js`, và `secTitle(...)` trong `Stats/report.js`.

## 2. Chức năng

### 2.1 Chuyển tiếp token đăng nhập sang đúng trang

Nếu Supabase quay về Site URL (trang này) với token trong hash (`#access_token=`,
`#error_code=`, `#type=`), trang không hiển thị gì mà `location.replace` sang trang đăng nhập
đã khởi tạo chuyến đi đó:

- Đọc breadcrumb `localStorage['hna.oauth.home']`, do `login.html` hoặc `tagger/auth` ghi
  trước khi chuyển sang Google, rồi xoá nó.
- Không có breadcrumb (tức là link xác nhận email kiểu cũ) thì mặc định về `tagger/auth`.
- Giữ nguyên `location.search` và `location.hash` để trang đích tự hoàn tất phiên.

Code: [dòng 736–744](../../apps/portal/index.html#L736). Nhánh này chạy trước mọi thứ khác
và `return` luôn.

Lý do tồn tại: Redirect URLs của Supabase có thể thiếu, khi đó token rơi về Site URL.
Xem README phần *Continue with Google*.

### 2.2 Menu mobile

Nút `#navToggle` bật/tắt class `open` trên `.nav-in`, cập nhật `aria-expanded` và `aria-label`.
Bấm một link trong menu thì menu tự đóng. Code: [dòng 746–760](../../apps/portal/index.html#L746).

### 2.3 Copy địa chỉ email

Nút `#mailCopy` (có `data-mail`) dùng cho trường hợp máy khách không có mail client, nên
`mailto:` không mở được gì.

- `navigator.clipboard.writeText()` thành công thì gọi `say('copied —')`.
- Bị từ chối (không có quyền, hoặc origin không an toàn) thì `selectAddress()` bôi đen địa
  chỉ để người dùng tự bấm Ctrl+C, và hiện gợi ý *"press Ctrl+C —"*.
- Phản hồi hiện ở `#mailHint` chứ không đổi chữ trên nút, để không làm mất vùng đang bôi đen.
  Gợi ý tự trở lại sau 2,4 giây.

Function: [`say`](../../apps/portal/index.html#L771), [`selectAddress`](../../apps/portal/index.html#L779),
handler click ở [dòng 784](../../apps/portal/index.html#L784).

### 2.4 Form liên hệ (Contact form)

Form `#contactForm` gửi enquiry tới Cloudflare Worker, không cần mail client.

**Các trường:**

| ID | Trường | Bắt buộc |
| --- | --- | --- |
| `cfName` | Full name | Có |
| `cfEmail` | Work email | Có (regex email) |
| `cfClub` | Club or academy | Có |
| `cfRole` | Your role (select: Head coach, Assistant coach, Technical/sporting director, Performance analyst, Academy director, Other) | Có |
| `cfCountry` | Country | Không |
| `cfVideo` | Link to the match | Không |
| `cfMessage` | Message | Có |
| `cfWebsite` | Honeypot "Leave this empty", ẩn với người thật | Phải để trống |

**Luồng** (handler submit ở [dòng 827](../../apps/portal/index.html#L827)):

1. Kiểm tra sơ bộ phía client: tên, email, CLB, vai trò, nội dung. Thiếu trường nào thì
   `cSay(msg, true)` báo lỗi ngay.
2. Payload gồm các trường trên, cộng `website` (honeypot) và `elapsed = Date.now() - shownAt`
   (thời gian điền form, gửi dưới dạng khoảng thời gian chứ không phải timestamp).
3. `POST` JSON tới `CONTACT_ENDPOINT = https://r2-presign.hoangnam25012004.workers.dev/contact`.
4. Thành công (`res.ok && data.ok`) thì ẩn `.cf-head`, `.cf-grid`, `.cf-actions` (tránh gửi
   trùng) và hiện *"Thank you — that reached us…"*.
5. Thất bại thì `cFail(text)` hiện lỗi **kèm địa chỉ email để liên hệ thay thế**, rồi bật lại nút.

Function: [`cSay`](../../apps/portal/index.html#L812), [`cFail`](../../apps/portal/index.html#L821).

**Phía server** ([`services/edge-worker/contact.js`](../../services/edge-worker/contact.js)):

| Bước | Hành vi |
| --- | --- |
| Kiểm tra origin | Chỉ chấp nhận `ALLOW_ORIGIN`. Sai origin trả 403. Không phải POST trả 405. |
| Honeypot | `website` có nội dung thì trả `{ok:true}` giả và không lưu gì |
| Tốc độ | `elapsed < 3000ms` (`MIN_FILL_MS`) cũng trả `{ok:true}` giả |
| Kiểm tra lại | Name, email, club, message. Cắt độ dài theo `MAX` (vd. message tối đa 4000 ký tự). |
| Rate limit | Giới hạn 5 lần/giờ/IP (băm IP với `IP_SALT`), quá thì trả 429. Trên 80 lần/ngày thì vẫn lưu lead nhưng không gửi mail. Chỉ áp dụng khi có KV `CONTACT_KV`. |
| Lưu | `POST /rest/v1/leads` bằng service-role key. Lỗi thì trả 502 kèm câu báo người dùng. |
| Gửi mail | Resend API gửi tới `CONTACT_TO`, với `reply_to` là email của khách. Kết quả ghi vào lead qua `markMailed`. |

Bảng `public.leads` (migration [`0019_leads.sql`](../../supabase/migrations/0019_leads.sql))
**không có policy cho anon** và trình duyệt không bao giờ ghi trực tiếp vào đó.

### 2.5 Hiệu ứng xuất hiện khi cuộn

Một `IntersectionObserver` gắn class `in` cho `.reveal` và `.stagger` khi chúng vào khung
nhìn, rồi bỏ theo dõi phần tử đó. Code: [dòng 872–875](../../apps/portal/index.html#L872).

### 2.6 Bộ đếm số ở hero

Các phần tử `[data-count]` (60+ metric/cầu thủ, 3000+ event/trận, 24h) đếm từ 0 lên trong
1,1 giây với easing cubic khi hiện 60% trên màn hình. `data-dec` là số chữ số thập phân,
`data-suffix` là hậu tố. Nếu người dùng bật `prefers-reduced-motion` thì hiện thẳng số cuối.
Function: [`countUp`](../../apps/portal/index.html#L877).

### 2.7 Bảng chiến thuật động (hero board) và Event feed

Canvas `#pitch` (1000×620) vẽ lại **từng chạm bóng** của một pha bóng, đúng như cách tagger
ghi nhận: mỗi số áo một chấm, pass hỏng có thêm chấm nơi đối phương lấy bóng. Song song với
đó, `#feedList` hiện từng dòng event như bảng event của tagger (`8 → 6 #recovery #pass success`).

- **Dữ liệu:** `CHAINS` ([dòng 931](../../apps/portal/index.html#L931)) gồm 3 pha mẫu: một bàn
  thắng, một cú sút ra ngoài và một pha mất bóng. Mỗi pha có `touches` (chấm) và `entries`
  (dòng event, với `carry`, `shot`, `dead`, `goal`).
- **Dựng timeline:** [`buildChain`](../../apps/portal/index.html#L974) biến một pha thành các
  đoạn bóng di chuyển (`legs`) và các dòng feed (`rows`) có mốc thời gian.
- **Chạy:** [`startChain`](../../apps/portal/index.html#L1016) và [`advance`](../../apps/portal/index.html#L1024)
  xoay vòng các pha. [`pushRow`](../../apps/portal/index.html#L1005) chèn dòng feed, giữ tối
  đa 5 dòng (3 dòng trên màn hẹp).
- **Vẽ:** [`drawPitch`](../../apps/portal/index.html#L1073), [`drawHeat`](../../apps/portal/index.html#L1090)
  (vùng nhiệt mờ), [`drawPast`](../../apps/portal/index.html#L1110) (các chạm cũ),
  [`drawTouch`](../../apps/portal/index.html#L1124), [`drawChain`](../../apps/portal/index.html#L1141).
  [`loop`](../../apps/portal/index.html#L1213) gọi chúng qua `requestAnimationFrame`.
- **Màu:** [`readPalette`](../../apps/portal/index.html#L1047) đọc biến CSS `--chalk`, `--red`, `--ember`.
- **Kích thước:** [`resize`](../../apps/portal/index.html#L1055) co canvas theo `devicePixelRatio`
  (tối đa 2) và chạy lại khi `resize`.
- **Đồng hồ** `#sbClock` tăng mỗi giây từ 67:14.
- **Reduced motion:** chỉ vẽ một pha đã hoàn tất và đứng yên, không chạy vòng lặp.

Quy tắc nội dung (comment ở [dòng 926](../../apps/portal/index.html#L926)): không có hai event
nào trong một entry được tính trùng một metric. Ví dụ không dùng `#shot on target #goal`,
vì `#goal` đã tự tính là shot on target.

## 3. Dữ liệu

| Nơi | Khoá / endpoint | Đọc/Ghi | Mục đích |
| --- | --- | --- | --- |
| localStorage | `hna.oauth.home` | Đọc rồi xoá | Breadcrumb của chuyến OAuth (mục 2.1) |
| Worker | `POST …/contact` | Ghi | Form liên hệ, dẫn tới `public.leads` và email |

Trang không tạo Supabase client và không đặt cookie.

## 4. Liên kết ra

`app.html` (Open your channel, Open the channel, Your channel) · `login.html` (Log in, Sign in)
· `tagger/` (Tagging app) · `privacy.html` · `mailto:dnam2501@gmail.com`
· LinkedIn của Hanley Town FC.

## 5. Lưu ý khi sửa

- Asset mới (ảnh, CSS) cần dòng `cp` trong `deploy.yml` và `?v=` khi được tham chiếu.
- Hằng `CONTACT_ENDPOINT` trùng host với `CONFIG.R2.workerUrl` trong `apps/tagger/cloud-sync.js`.
  Đổi Worker thì phải đổi cả hai.
- Test liên quan: `tests/contact-form.test.js`, `tests/hero-chains.test.js`, `tests/privacy-page.test.js`,
  `tests/favicon.test.js`, `tests/mobile-ui.test.js`.
