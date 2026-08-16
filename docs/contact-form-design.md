# Contact Form — Detailed Design

**Nút `Email us` trên landing page từng là một `mailto:` thuần. Trên máy không đăng ký mail
client, bấm nút **không mở gì cả**, và trang không có cách nào biết điều đó — nên những người
ấy đơn giản là không có đường liên hệ. Tài liệu này mô tả cái thay thế: một form ngay trên
trang, POST tới Cloudflare Worker, lưu lead vào `public.leads` rồi gửi email báo về hộp thư
thật. `mailto:` **được giữ nguyên**, làm đường lùi khi JavaScript hỏng.**

Trạng thái: **đã triển khai** (2026-08-16). Q1→A · Q2→A · Q3→A — chốt cả ba theo đề xuất.

Phạm vi đã làm: `supabase/migrations/0019_leads.sql` (mới), `worker/index.js` (mới),
`worker/contact.js` (mới), `worker/wrangler.toml`, `client/index.html`,
`tests/contact-form.test.js` (mới, 30 test).
**`worker/r2-presign.js` = 0 dòng thay đổi.** `shared.js` / `cloud-sync.js` / `Stats/*` /
`Player-Lists/*` / `client/app.html` / `client/login.html` / `client/assets/*` = 0 dòng.

**Không cache-bust:** CSS và script đều inline trong `client/index.html`, không đụng file nào
mang `?v=`. `deploy.yml` cũng không đổi — `client/index.html` đã có dòng `cp` từ trước.

Test: `node tests/run.js` → **1007/1007 passed**. Trong đó **977 test cũ pass mà không sửa một
dòng nào**, cộng 30 test mới.

---

## 1. Vấn đề

`mailto:` giao việc cho hệ điều hành. Nếu không có gì đăng ký nhận, cú bấm rơi vào hư không —
và `<a href="mailto:">` không có sự kiện lỗi nào để trang bắt được. Comment tại
`client/index.html` đã ghi nhận điều này từ trước, và lời giải khi ấy là in địa chỉ ra kèm nút
copy. Đó là giảm nhẹ, không phải giải quyết: người đọc vẫn phải tự mở webmail, tự dán, tự gõ.

Thêm một nửa nữa của vấn đề: site **không ghi nhận gì**. Không biết ai đã quan tâm, không có gì
để theo đuổi.

## 2. Ranh giới

Làm:
- form trên landing page, gửi được mà không cần mail client
- lead lưu vào database, không mất kể cả khi email hỏng
- email báo về `dnam2501@gmail.com`, bấm Reply là trả lời thẳng người gửi

Không làm (§9): auto-reply cho người điền form, Turnstile, UI quản lý lead, bỏ `mailto:`.

---

## 3. Kiến trúc

```
Browser (client/index.html — tĩnh, không thêm dependency nào)
   │  POST JSON
   ▼
Cloudflare Worker
   index.js (router)
     ├── /contact ──► contact.js ──► public.leads (service-role key)
     │                          └──► api.resend.com ──► dnam2501@gmail.com
     └── / và mọi path khác ──► r2-presign.js  (KHÔNG ĐỔI)
```

### 3.1 Vì sao browser không ghi thẳng vào Supabase

Anon key được commit vào repo và phục vụ công khai trong JavaScript của một static site — đúng
như cảnh báo ở đầu `0017_public_channels.sql`. Cho `anon` một policy INSERT trên `leads` là trao
cho toàn internet một bảng ghi được; cho nó SELECT là công bố mọi CLB từng liên hệ, kèm địa chỉ
email của họ.

Nên `public.leads` **không có policy nào cho `anon`, và không có policy INSERT nào cả** (§5).
Worker giữ service-role key — thứ bypass row-level security — và là cửa duy nhất.

### 3.2 Vì sao root path vẫn là presign

`cloud-sync.js` POST vào **URL trần** của Worker, không có path:

```js
R2: { workerUrl: 'https://r2-presign.hoangnam25012004.workers.dev', ... }
const resp = await fetch(R2.workerUrl, { ... });
```

Mọi bản tagging app đang nằm trong trình duyệt của người khác đều gọi như thế. Nên router để
`/contact` là **path duy nhất** được tách ra; mọi thứ khác rơi xuống presign — một path router
chưa từng nghe nhiều khả năng là client cũ hơn là tính năng mới.

`name = "r2-presign"` trong `wrangler.toml` không đổi: tên Worker **chính là** URL. Chỉ `main`
đổi từ `r2-presign.js` sang `index.js`. `r2-presign.js` được import nguyên vẹn, vẫn tự xử lý CORS
và method của nó — thêm form không sửa một dòng nào của nó, và đó là chủ ý: upload video không
thể vỡ vì một thay đổi nó không tham gia.

---

## 4. `worker/contact.js` — thứ tự xử lý

| # | Bước | Trượt thì sao |
|---|---|---|
| 1 | `POST` + JSON hợp lệ | 405 / 400 |
| 2 | **Honeypot** `website` rỗng | `{ok:true}` giả, **không ghi gì** |
| 3 | **Timing** `elapsed ≥ 3000ms` | `{ok:true}` giả, không ghi gì |
| 4 | **Validate** name/email/club/message | 400 + câu người đọc hiểu được |
| 5 | **Rate limit** (KV, tuỳ chọn) | 429 |
| 6 | **INSERT** `public.leads` | 502 + "email us directly" |
| 7 | **Resend** | vẫn `{ok:true}` — xem §4.3 |

### 4.1 Hai cái bẫy đều trả về thành công

Nói cho bot biết nó bị chặn ở bước nào là nói cho nó biết cần đổi gì. Và ở cả hai nhánh không có
người thật nào bị đánh lừa, vì không có người thật nào đi qua đó.

### 4.2 `elapsed` là khoảng thời gian, không phải mốc thời gian

Trang đo `Date.now() - shownAt` và gửi **hiệu số**, chứ không gửi timestamp để server so với đồng
hồ của mình. Một người có đồng hồ máy lệch vài ngày vẫn là một người.

### 4.3 Lưu trước, gửi mail sau — và mail hỏng không tính là hỏng

Một lead đáng giá hơn cái thông báo về nó.

- INSERT hỏng ⇒ **502**, người dùng được báo, và trên trang vẫn còn địa chỉ để dùng.
- Resend hỏng ⇒ **vẫn `{ok:true}`**. Enquiry đã an toàn rồi. Lý do được PATCH vào
  `leads.email_error`, `email_sent = false` — nên nó không mất trong im lặng.

Test khoá đúng thứ tự này: chỉ số của lời gọi INSERT phải nhỏ hơn chỉ số của lời gọi Resend.

### 4.4 Rate limit là tuỳ chọn

`if (!kv) return { allowed: true, mayMail: true }` — thiếu binding thì bỏ qua giới hạn thay vì
lỗi, để `npx wrangler dev` chạy được mà không cần tạo KV namespace trước.

- `rl:<ipHash>` — 5 / giờ / IP ⇒ 429.
- `rl:day:<ngày>` — 80 / ngày toàn cục. Vượt ⇒ **vẫn lưu lead**, chỉ bỏ gửi mail. Bỏ enquiry để
  bảo vệ quota mail là làm ngược.

KV nhất quán theo kiểu eventual, nên số đếm là xấp xỉ. Đủ cho việc nó làm: một cái phanh chống
lũ, không phải sổ kế toán.

### 4.5 IP được băm, không lưu

`sha-256(IP + IP_SALT)`, cắt 16 hex. Rate limit và phát hiện flood đều chỉ cần trả lời "có phải
cùng một người gọi không", mà hash trả lời được; bản thân địa chỉ là dữ liệu cá nhân không dùng
vào việc gì.

### 4.6 `reply_to`

```js
reply_to: lead.email
```
Đây là mục đích của cả cái thông báo: bấm Reply trong Gmail là trả lời thẳng CLB, không phải
trả lời Worker.

---

## 5. `0019_leads.sql`

Additive, chạy lại được. Cột đáng chú ý:

- `status` — `new | contacted | won | lost`, để theo dõi pipeline bán hàng.
- `email_sent` / `email_error` — §4.3.
- `ip_hash` — §4.5, **không phải** IP.

RLS bật. Điều quan trọng nhất của file này là thứ **không** có trong đó:

```
không có policy nào `to anon`
không có policy INSERT nào cả
```

Chỉ staff đọc, tái dùng `public.is_staff()` từ 0013 chứ không phát minh lại:

```sql
create policy leads_staff_read on public.leads for select to authenticated
  using (public.is_staff());
```

---

## 6. `client/index.html`

### 6.1 Vị trí

Form nằm ngay trong khối `.cta`, dưới hai nút và dòng địa chỉ. `mailto:` và nút copy **ở lại
nguyên chỗ cũ** — đó là toàn bộ đường đi khi JavaScript hỏng hoặc bị chặn.

### 6.2 Trường

`name` · `email` · `club` · `role` (select 6 vai trò) · `country` (tuỳ chọn) · `videoUrl`
(tuỳ chọn) · `message`.

Hai trường tuỳ chọn cố tình **không** `required`: hỏi một CLB link video mà họ chưa có là cách
làm mất enquiry.

`role` liệt kê đúng những người thực sự quyết định: Head coach · Assistant coach ·
Technical / sporting director · Performance analyst · Academy director · Other.

### 6.3 Honeypot

Ẩn bằng CSS (`position:absolute; left:-9999px`), **không** `type="hidden"`: bot bỏ qua các
trường form đánh dấu hidden, nhưng điền vào trường nó đọc được trong markup — đó chính là mẹo.
Kèm `tabindex="-1"` và `aria-hidden="true"` nên không người nào chạm tới, bằng tab hay bằng
trình đọc màn hình.

### 6.4 Handler phải nằm TRƯỚC early-return

IIFE của trang kết thúc bằng `if (!cv) return;` rồi mới tới phần canvas chiến thuật. Đăng ký
handler dưới dòng đó thì form chết trên bất kỳ trang nào không có canvas — và chết trong im
lặng. Có một test khoá riêng thứ tự này.

### 6.5 Mọi thất bại đều nêu địa chỉ

```js
function cFail(text) { cSay(text + ' You can write to us at ' + MAIL + ' instead.', true); ... }
```

Cả mục đích của thay đổi này là không ai rơi vào ngõ cụt, mà một cái form đang hỏng **là** ngõ
cụt trừ khi nó nói đi đâu bây giờ. Nút được bật lại để thử tiếp.

Ngược lại, một trường người dùng chưa điền **không** đi qua `cFail` — nói "email us instead" ở
đó là vô nghĩa. Nó chỉ nói cần sửa gì.

### 6.6 CSS inline, không vào `site.css`

`site.css` được cả ba trang client load (`index` / `app` / `login`, đều `?v=3`), nên sửa nó buộc
phải bump `?v=` ở cả ba chỗ rồi regenerate manifest. Form này chỉ landing page dùng, nên CSS đi
vào khối `<style>` inline sẵn có — nơi `.cta` / `.mail-copy` đang nằm.

Hệ quả: **không file nào mang `?v=` bị đụng tới**, `tests/asset-versions.test.js` không cần đổi.

Lưu ý: `.field` / `.msg` trong `app.css` không dùng lại được — landing page không load `app.css`.
Nên class mới, nhưng dùng chung token màu của `site.css` để hai bên nhìn như một hệ.

---

## 7. Không đổi gì của tính năng khác

| File | Thay đổi |
|---|---|
| `worker/r2-presign.js` | **0 dòng** — được import nguyên vẹn |
| `cloud-sync.js`, `shared.js`, `index.html` (tagger) | 0 dòng |
| `Stats/*`, `Player-Lists/*` | 0 dòng |
| `client/app.html`, `client/login.html`, `client/assets/*` | 0 dòng |
| `.github/workflows/deploy.yml` | 0 dòng |
| `wrangler.toml` | chỉ `main` + vars mới; `name` không đổi |

Test riêng khoá điều này: `r2-presign.js` vẫn export `fetch` của nó, vẫn tự trả lời preflight,
vẫn trả `uploadUrl`, và không có chữ `contact` / `leads` / `resend` nào lọt vào.

---

## 8. Test — `tests/contact-form.test.js`, 30 test

- **Trang** — form thật, đủ 7 trường, `type=email`, honeypot đúng kiểu và ẩn đúng cách,
  `mailto:` + nút copy còn nguyên, handler nằm trước early-return, endpoint cùng host với
  `CONFIG.R2.workerUrl`, nút disable khi gửi và bật lại khi lỗi.
- **Router** — `/contact` là path duy nhất tách ra, `r2-presign.js` không bị sửa,
  `name = "r2-presign"` không đổi.
- **`contact.js` được chạy thật** trong vm với stub `fetch`/`crypto`: lưu trước rồi mới mail,
  honeypot không ghi gì, timing không ghi gì, 4 trường bắt buộc bị từ chối ở phía server, sai
  origin/method/JSON bị chặn, DB hỏng ⇒ 502 và không gửi mail, mail hỏng ⇒ vẫn `ok:true` và
  `email_error` được ghi, `reply_to` là người gửi, **không phản hồi nào chứa secret**.
- **Migration** — additive, RLS bật, không policy `anon`, không policy INSERT.

> Ghi chú kỹ thuật: các test chạy Worker được đăng ký **bên trong** `done.then()`. `tiny-test`
> lên lịch chạy ở lần `test()` đầu tiên nó thấy, và một test đăng ký sau khi vòng chạy đã bắt
> đầu sẽ bị bỏ qua trong im lặng — trông hệt như đang pass.

---

## 9. Không làm trong lần này

- **Auto-reply cho người điền form.** Resend chưa verify domain thì chỉ gửi được tới chính địa
  chỉ chủ tài khoản — mà đó đúng là `CONTACT_TO`, nên luồng hiện tại chạy được. Mail xác nhận
  cho người ngoài thì chưa. Mở được ngay khi verify một domain.
- **Cloudflare Turnstile.** Sẽ thêm script bên thứ ba vào một trang cố tình không có external
  JS. Honeypot + timing + rate limit đủ cho lưu lượng hiện tại.
- **UI quản lý lead trong `app.html`.** Đọc bảng qua SQL Editor trước đã.
- **Bỏ `mailto:`.** Giữ lại làm đường lùi.

---

## 10. Vận hành

Xem `worker/README.md` cho các bước setup (secrets, KV, deploy). Tóm tắt:

```bash
cd worker
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY     # service_role, KHÔNG phải anon
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put IP_SALT
npx wrangler deploy
```

Đọc lead:

```sql
select created_at, name, club, role, country, email, status, email_sent, message
from public.leads order by created_at desc;
```
