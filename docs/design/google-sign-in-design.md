# Đăng nhập / đăng ký bằng **tài khoản Google** — Detailed Design

**Một nút "Continue with Google" trên cả hai màn hình đăng nhập của site — `/tagger/auth`
(analyst) và `/login.html` (club) — làm đúng việc mà mọi phần mềm phổ biến làm: không mật
khẩu, không màn hình đăng ký riêng, lần đầu một địa chỉ Gmail đi qua cửa thì tài khoản được
tạo, mọi lần sau là đăng nhập. Tài liệu này thiết kế nó sao cho **không một dòng logic nào
của các tab khác bị chạm tới** — và nói rõ chỗ duy nhất mà nó *có thể* làm hỏng tab khác,
cùng cách chặn.**

Trạng thái: **thiết kế — chưa viết một dòng code nào** (2026-09-03).
§14 là danh sách những thứ tôi cần được **cho phép** trước khi bắt đầu; §13 là thứ tự thi công.

Ba con số đo trên repo lúc viết:

| Đo cái gì | Kết quả |
|---|---|
| `node tests/run.js` (baseline, chạy lúc 2026-09-03) | **1467/1467 passed** |
| Test sẽ **đỏ** khi thêm Google | **1** — `auth-gate.test.js` › *"Google sign-in is gone, and takes every reference with it"* |
| File logic của tab khác phải sửa | **0** — `auth.js`, `index.html`, `cloud-sync.js`, `shared.js`, `Stats/*`, `Player-Lists/*`, `client/assets/app.js` = 0 dòng |

---

## 0. Tóm tắt một trang

**Làm gì.** Thêm một nút `Continue with Google` (logo G bốn màu, chữ tiếng Anh) nằm **bên
dưới cả hai form**, ngăn cách bằng một dải "or", trên `auth.html` và `client/login.html`.
Bấm → `supabase.auth.signInWithOAuth({provider:'google'})` → Google → quay về đúng trang
vừa rời đi → phiên đã nằm trong `localStorage` → vào app.

**Vì sao nó rẻ.** Cổng đăng nhập `auth.js` **đã được viết sẵn cho OAuth từ trước**: nó nhận
diện `#access_token=…` và `?code=…` rơi nhầm vào trang app và chuyển tiếp nguyên vẹn sang
trang auth (§2.3). `boot()` của cả hai trang đăng nhập đã gọi `getSession()`, mà đó chính là
chỗ supabase-js đọc token trên URL và biến nó thành phiên. Nghĩa là **đường về không phải
viết mới** — chỉ phải viết đường đi.

**Rủi ro duy nhất đáng sợ.** Không phải UI, không phải CSS. Là **`user_id`**. Nếu Supabase
tạo một tài khoản *thứ hai* cho người đã có tài khoản email+mật khẩu cùng địa chỉ, thì
`user_prefs` (hotkeys **và macros**), `pitchtagger.recent.v1` và `club_members` đều khoá theo
uuid — người đó đăng nhập bằng Google và thấy một app trắng trơn. Repo này đã mất 40 macro
một lần rồi vì một chuyện tương tự. §8 dành riêng cho nó, và nó là lý do §13 bắt client site
đi trước tagger.

**Bề mặt thay đổi** (không tạo file mới, nên `deploy.yml` không phải sửa):

| File | Kiểu thay đổi | Ai khác load file này |
|---|---|---|
| `auth.html` | markup + `<style>` + `<script>`, **thuần thêm** | không ai (nó là một trang) |
| `client/login.html` | markup + `<script>`, **thuần thêm** | không ai |
| `client/assets/supa.js` | **thêm 1 key** vào object `auth` | `client/app.html` ⚠️ → phải bump `?v=` |
| `client/assets/app.css` | **thêm 2 rule** cuối file | `app.html`, `guide.html` ⚠️ → phải bump `?v=` |
| `tests/auth-gate.test.js` | **thay 1 test**, thêm vài test | — |
| `tests/client-signup.test.js` | thêm test | — |
| `tests/asset-versions.json` | regenerate | — |
| **Supabase Dashboard + Google Cloud Console** | cấu hình, không phải code | — |

---

## 1. Mục tiêu và ranh giới

### 1.1 Trong phạm vi

1. Một nút `Continue with Google` trên `auth.html` (analyst) và `client/login.html` (club).
2. Một nút đó phục vụ **cả sign in lẫn sign up** — đúng như Gmail/Notion/Figma/Vercel làm:
   không có tab "Sign up with Google" riêng, vì với OAuth không tồn tại khái niệm đó.
3. Quay về đúng trang đã rời đi, **giữ nguyên `?next=`**, để link chia sẻ
   `…/#match=12345` vẫn mở đúng trận sau khi đăng nhập.
4. Câu chữ tiếng Anh cho mọi trạng thái lỗi Google có thể trả về (huỷ, provider chưa bật,
   state hết hạn, mạng chết).
5. Cấu hình Google Cloud Console + Supabase, viết thành checklist trong `README.md`.
6. Test khoá lại **cái bẫy lịch sử** đã từng giết cả Sign in lẫn Create account (§2.1).

### 1.2 Ngoài phạm vi — và sẽ **không** làm nếu không được yêu cầu riêng

| Thứ | Vì sao để ngoài |
|---|---|
| **Google One Tap** (`accounts.google.com/gsi/client`) | Thêm một script bên thứ ba vào trang đăng nhập, cần cấu hình nonce riêng, và §site-domain-moved đã ghi: domain còn mới, thêm script ngoài vào đúng trang có ô mật khẩu là đúng hồ sơ mà bộ lọc phishing chấm điểm. |
| Provider khác (Facebook, Apple, GitHub) | Cùng khuôn, nhưng mỗi cái là một bộ cấu hình + một vòng kiểm thử riêng. |
| Hiện **ảnh đại diện Google** trong menu ▾ Other hay header `app.html` | Đó là sửa `index.html` / `client/assets/app.js` — file của tab khác. §14-Q4. |
| Ép domain (`@club.com` mới được vào) | `hd` của Google chỉ là *gợi ý*, chặn thật phải nằm ở DB trigger — tức sửa migration. §14-Q5. |
| Gỡ đăng nhập bằng mật khẩu | Không. Tài khoản cũ phải vào được. Hai đường tồn tại song song. |
| Đổi `auth.js` | Cố ý. Xem §2.3 — nó là file mà **cả 3 trang app** load; không chạm là cách rẻ nhất để bảo đảm cổng không hồi quy. |

### 1.3 "Giống các phần mềm phổ biến" nghĩa là gì, cụ thể

| Hành vi | Thiết kế này |
|---|---|
| Một nút, không phải một form | ✅ `<button type="button">`, ngoài cả hai `<form>` |
| Logo G chính chủ, 4 màu | ✅ inline SVG, lấy lại từ `git show 909cf87^:auth.html` |
| Chữ "Continue with Google" | ✅ (Google cho phép Continue / Sign in / Sign up; "Continue" đúng vì nút này làm cả hai) |
| Có dải phân cách "or" giữa form và nút | ✅ `.or` |
| Cho chọn tài khoản khi máy đang đăng nhập nhiều Gmail | ✅ `queryParams: { prompt: 'select_account' }` |
| Lần đầu = tạo tài khoản, không hỏi thêm gì | ✅ Supabase tạo `auth.users` row ngay |
| Tên hiển thị lấy từ Google | ✅ đã chạy sẵn: `PTAuth.displayName()` đọc `user_metadata.full_name`, mà Google trả đúng khoá đó |

---

## 2. Bảy phát hiện phải đọc trước §3

### 2.1 Google sign-in **đã từng có ở đây**, và cái bẫy đã giết nó

`git log` chỉ đúng một commit:

```
909cf87  Email and password only, and the browser keeps the password
```

Lý do gỡ, chép từ chính commit message:

> *Google sign-in is gone: the button, its styling, the logo, the OAuth call and the
> pre-flight that existed only to explain a provider that was never turned on.*

Tức là **nó bị gỡ vì provider chưa bao giờ được bật trên Supabase**, không phải vì thiết kế
sai. Code cũ vẫn nằm nguyên trong git và §5 lấy lại phần lớn từ đó.

Nhưng câu quan trọng nhất là câu sau:

> *The one that would have bitten is `working()`, which disabled the Google button on EVERY
> submit — a leftover reference there would have killed Sign in and Create account outright.*

`working()` là hàm bật/tắt nút khi đang gửi request. Bản cũ có dòng:

```js
$('submitBtn').disabled = on; $('googleBtn').disabled = on;   // ← bản 909cf87^
```

Nếu nút Google biến mất mà dòng này ở lại, `$('googleBtn')` là `null`, `.disabled` ném
`TypeError`, và **cả Sign in lẫn Create account chết ngay ở dòng đầu tiên của handler**.
Một lỗi ở tính năng Google giết hai tính năng không liên quan.

Bản hôm nay đã sạch:

```js
// auth.html, hiện tại
function working(on, label) {
  busy = on;
  const btn = $(mode === 'in' ? 'siSubmit' : 'suSubmit');
  btn.disabled = on;
  btn.textContent = on && label ? label : (mode === 'in' ? 'Sign in' : 'Create account');
}
```

> **Luật số 1 của thiết kế này: `working()` ở cả hai trang giữ nguyên từng byte.** Nút Google
> có hàm bật/tắt riêng (`gWorking`), không ai gọi chéo. §10 có test ghim điều đó.

### 2.2 Có **hai** site, **hai** client Supabase, **hai** storage key

Đây là thứ dễ nhầm nhất khi sửa "màn hình đăng nhập".

| | Tagging app (analyst) | Client site (club) |
|---|---|---|
| Trang đăng nhập | `auth.html` | `client/login.html` |
| Trên site thật | `https://hoangnams.com/tagger/auth` | `https://hoangnams.com/login.html` |
| Tầng dữ liệu | client tạo tại chỗ trong `auth.html` | `client/assets/supa.js` |
| `storageKey` | mặc định `sb-xtzmtdcohoixoxqusyyz-auth-token` | **`hna-client-auth`** |
| Cổng chặn | `auth.js` (mọi trang app load) | không có cổng — `app.js` tự xử lý signed-out |
| Ai còn dùng chung phiên | `cloud-sync.js` (cùng key mặc định) | `client/assets/app.js` |

Hai phiên **độc lập hoàn toàn**. Đăng nhập Google ở client site không làm gì tagger và ngược
lại. Đó là tin tốt: hai lần triển khai không thể va nhau.

### 2.3 `auth.js` — cổng — **đã sẵn sàng cho OAuth**, và vì thế không được chạm

Trong `auth.js` có sẵn:

```js
const CALLBACK_HASH  = /[#&](access_token|refresh_token|error_code|error_description)=/;
const CALLBACK_QUERY = /[?&]code=/;
function authCallback() {
  if (CALLBACK_HASH.test(location.hash || ''))    return location.hash;
  if (CALLBACK_QUERY.test(location.search || '')) return location.search;
  return '';
}
```

Nó được viết cho link xác nhận email rơi nhầm vào trang app, nhưng **hình dạng của một
OAuth callback y hệt**. Nghĩa là: nếu vì bất kỳ lý do gì Google trả token về trang app thay
vì trang auth, cổng chuyển tiếp nguyên vẹn thay vì vứt đi.

Ba thứ khác của cổng cũng đã đúng sẵn cho Google:

- `user()` loại phiên ẩn danh (`is_anonymous`) — tài khoản Google không ẩn danh → vào được.
- `displayName()` đọc `user_metadata.full_name || name` — Google trả **cả hai** khoá đó.
- `nextUrl()` chống open-redirect và từ chối chính trang auth — không cần đụng.

Và `auth.js?v=1` đang được load ở **4 chỗ**: `auth.html`, `index.html`, `Stats/index.html`,
`Player-Lists/index.html`. Sửa nó = bump 4 số + rủi ro hồi quy ở cả ba tab app.

> **Luật số 2: `auth.js` = 0 dòng thay đổi, `?v=` giữ nguyên `1`.**

### 2.4 Bundle CDN đang pin trả token về qua **hash**, không phải `?code=`

Đo trực tiếp trên đúng bundle mà cả hai trang đang load
(`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`):

```
$ curl -s https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 | grep -o "flowType[^,;)]\{0,60\}"
flowType:`implicit`}          ← giá trị mặc định
flowType===`pkce`&&([o
…
```

**`flowType` mặc định là `implicit`.** Hệ quả cụ thể:

- Đường về là `…/auth.html?next=Stats%2F#access_token=…&refresh_token=…&token_type=bearer`
- Không có `sb-…-auth-token-code-verifier` trong localStorage (thứ chỉ PKCE mới ghi)
- Lỗi từ Google cũng về qua hash: `#error=access_denied&error_code=…&error_description=…`
- `CALLBACK_HASH` bắt cả hai trường hợp trên ✓; `?next=` nằm ở query nên `nextUrl()` vẫn đọc được ✓

**Thiết kế này cố ý KHÔNG pin `flowType`.** Đổi nó sẽ đổi luôn đường đi của link xác nhận
email — một tính năng đang chạy. Ta viết code đúng cho **cả hai** flow, và cả hai đã được
`auth.js` che sẵn. Nếu jsDelivr đổi mặc định sang `pkce` vào một ngày nào đó, không có gì hỏng.

### 2.5 Password manager là **load-bearing** — nút Google phải nằm ngoài cả hai form

`README.md` và hai bộ test dành hẳn mấy chục dòng cho chuyện này. Tóm tắt: trình quản lý
mật khẩu đọc `form.elements`, **không nhìn màn hình**. Một form chứa đồng thời
`current-password` và `new-password` bị Chrome đọc là form đăng ký và **không được đổ mật
khẩu đã lưu vào**. Đó là lý do sign in và sign up là **hai `<form>` tách rời**, và
`auth-gate.test.js` đếm đúng số `<input>` trong mỗi form:

```js
eq((f.match(/<input/g)||[]).length, 2, 'exactly two inputs');   // signInForm
eq((f.match(/<input/g)||[]).length, 4, 'name, email, password, confirm');  // signUpForm
```

> **Luật số 3: nút Google là `<button type="button">` đặt SAU `</form>` của cả hai form.**
> Không thêm `<input>` nào. Bản cũ 909cf87^ cũng đặt đúng như vậy — nó nằm sau `</form>`,
> ngay dưới `<div class="or">`.

### 2.6 Điểm nối duy nhất giữa Google và các tab khác: **`user_id`**

Google không chạm vào UI của tab nào. Nó chạm vào **danh tính**, và danh tính là khoá của ba
kho dữ liệu:

| Kho | Khoá | Ở đâu | Hỏng thế nào nếu `user_id` đổi |
|---|---|---|---|
| `public.user_prefs` | `user_id` | `cloud-sync.js:initUserPrefs()` | **hotkeys + macros trống** |
| `pitchtagger.recent.v1` | `recentUser()` → `PTAuth.user().id` | `index.html:4442` | danh sách trận gần đây trống |
| `public.club_members` | `user_id` | `supa.js:clubs()` | club thấy **"No channel"** |

Có một cái giảm nhẹ đã có sẵn, đáng biết: `initUserPrefs()` khi **không tìm thấy row** thì
`pushUserPrefs(local)` — tức là gieo lại từ `localStorage` của chính máy đó. Nên trên **đúng
cái máy đang dùng**, macro không mất; nó chỉ không theo sang máy khác. Đó là đệm, không phải
lời giải. Lời giải ở §8.

### 2.7 Có đúng **một** test sẽ đỏ, và ta biết trước nó là test nào

`tests/auth-gate.test.js`:

```js
test('Google sign-in is gone, and takes every reference with it', () => {
  const html = page('auth.html');
  notOk(/signInWithOAuth|provider/i.test(html), 'no OAuth call left behind');
  notOk(/googleBtn/.test(html), 'nothing still reaches for the button');
  notOk(/\.google\b|accounts\.google/.test(html), 'and its styling and logo are gone too');
});
```

Test này **không bảo vệ tính năng khác** — nó bảo vệ đúng cái bẫy ở §2.1, bằng cách cấm cả
tính năng. Khi Google quay lại, nó phải được **thay** bằng một test bảo vệ *cùng cái bẫy đó*
mà không cấm tính năng (§10.2). Đây là thay đổi test **duy nhất mang tính xoá**; mọi thứ
khác là thêm. Vì nó nằm trong file test của chính tính năng auth, tôi coi nó thuộc phạm vi —
nhưng vẫn ghi rõ ở §14-Q1 để anh duyệt.

Ngoài ra, hai test này **sẽ tiếp tục xanh nhưng phải để mắt** vì chúng quét cả file:

```js
test('the sign-in screen is in English, all of it', …)   // regex tiếng Việt trên auth.html
test('and so is the rest of the site, file by file', …)  // 10 file, có auth.html
```

> **Luật số 4: mọi chữ mới trong `auth.html`, `login.html`, `supa.js` — kể cả comment —
> phải là tiếng Anh.** Tài liệu này tiếng Việt; code thì không.

---

## 3. Luồng — từ cú bấm đến khi vào app

```
                         TAGGER                                    CLIENT SITE
  ┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
  │ /tagger/auth?next=Stats%2F           │        │ /login.html                          │
  │  [Sign in][Sign up]                  │        │  [Sign in][Sign up]                  │
  │  ──────────── or ───────────         │        │  ──────────── or ───────────         │
  │  [ G  Continue with Google ]  ← bấm  │        │  [ G  Continue with Google ]  ← bấm  │
  └──────────────┬───────────────────────┘        └──────────────┬───────────────────────┘
                 │ signInWithOAuth({provider:'google',           │
                 │   redirectTo: <chính trang này, kèm ?next=>,  │
                 │   queryParams:{prompt:'select_account'},      │
                 │   skipBrowserRedirect:true})  → data.url      │
                 │                                               │
                 │ ── pre-flight (§5.4): data.url có sống không? │
                 ▼                                               ▼
        location.assign(data.url)
                 │
                 ▼
   https://xtzmtdcohoixoxqusyyz.supabase.co/auth/v1/authorize?provider=google&…
                 │
                 ▼
   accounts.google.com  ── người dùng chọn tài khoản, bấm Continue ──┐
                                                                     │
                 ┌───────────────────────────────────────────────────┘
                 ▼
   https://xtzmtdcohoixoxqusyyz.supabase.co/auth/v1/callback   ← URI khai trong Google Console
                 │  (Supabase đổi code của Google lấy phiên của MÌNH)
                 ▼
   …/tagger/auth.html?next=Stats%2F#access_token=…&refresh_token=…
                 │
                 │  boot() → getSession()  ← supabase-js đọc hash, ghi localStorage,
                 │                            replaceState xoá hash. KHÔNG PHẢI VIẾT MỚI.
                 ▼
   land()  (không tham số → không remember(), không đợi SETTLE_MS)
                 │
                 ▼
   location.replace(PTAuth.nextUrl())  →  /tagger/Stats/     ✓
```

Nhánh sai duy nhất, và nó đã có lưới:

```
   Nếu redirectTo KHÔNG nằm trong Redirect URLs của Supabase
                 │
                 ▼
   Supabase im lặng rơi về Site URL  →  …/tagger/#access_token=…
                 │
                 ▼
   auth.js: authCallback() thấy CALLBACK_HASH  →  location.replace(AUTH_URL + hash)
                 │
                 ▼
   …/tagger/auth.html#access_token=…   →  boot() nhặt được  ✓ (mất ?next=, vào trang chủ app)
```

⚠️ **Lưới này chỉ có ở tagger.** Client site không có `auth.js`; nếu token rơi về
`https://hoangnams.com/` thì đó là `client/index.html`, mà trang đó **không load `supa.js`**
(đã kiểm: nó chỉ có `site.css?v=3` và một `<script>` inline) → token bị mất **không một lời
báo**. Đó là lý do §7 coi Redirect URLs là bước bắt buộc, không phải bước "nên làm", và
§14-Q3 hỏi có muốn thêm lưới cho client site không.

---

## 4. Thiết kế giao diện

### 4.1 Vị trí

Cả hai trang có cùng bố cục dọc. Nút chèn vào đúng một chỗ: **sau `</form>` thứ hai, trước
ô thông báo `#msg`**.

```
  brand / h1 / intro
  [ Sign in | Sign up ]        ← tabs, không đổi
  <form id="signInForm">  …    ← không đổi, 2 input
  <form id="signUpForm">  …    ← không đổi, 4 input
  ─────────── or ───────────   ← MỚI
  [ G  Continue with Google ]  ← MỚI
  #msg                          ← không đổi (dùng lại, không thêm ô thông báo thứ hai)
  #foot                         ← không đổi
```

Nút **không đổi vị trí khi bấm tab** — nó phục vụ cả hai chế độ. `setMode()` giữ nguyên từng
byte; nó chỉ đụng `signInForm` / `signUpForm` / tiêu đề / chân trang.

### 4.2 Hình thức

Lấy lại nguyên bản của `909cf87^` — nút trắng, chữ `#1f1f1f`, bo tròn hết cỡ, logo G 4 màu
17px. Đây là biến thể "light" trong hướng dẫn nhận diện của Google, hợp lệ trên nền tối, và
tương phản đủ mạnh trên nền `#000` của cả hai site.

`auth.html` — thêm vào `<style>` sẵn có (trang này không dùng file CSS ngoài, nên **không có
`?v=` nào phải bump**):

```css
  .or{display:flex;align-items:center;gap:10px;color:var(--mut);font-size:11px}
  .or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}

  .google{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;
          background:#fff;color:#1f1f1f;border:0;border-radius:999px;padding:11px 0;
          font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .google:hover{filter:brightness(.94)}
  .google[disabled]{opacity:.6;cursor:progress}
  .google svg{width:17px;height:17px;flex:none}
```

`client/assets/app.css` — thêm **cuối file**, dùng token của site (`--line`, `--ash`,
`--f-body`), đặt cạnh khối `.auth-card` đang có:

```css
/* ---- Continue with Google, on login.html ----
   Outside both forms on purpose: a password manager reads form.elements, and an
   extra control inside the sign-in form is one more thing for it to misread. The
   twin of this markup is in auth.html; keep the two in step. */
.auth-or{display:flex; align-items:center; gap:10px; margin:18px 0;
         color:var(--ash-dim); font-size:12px}
.auth-or::before,.auth-or::after{content:""; flex:1; height:1px; background:var(--line)}
.btn-google{width:100%; justify-content:center; gap:10px;
            background:#fff; color:#1f1f1f; border-color:#fff}
.btn-google:hover{background:#f2f2f2; border-color:#f2f2f2; color:#1f1f1f}
.btn-google svg{width:17px; height:17px; flex:none}
```

`.btn-google` chồng lên `.btn` đã có trong `site.css:86` (padding, bo tròn, transition), nên
nó thừa hưởng hình dạng nút của site và chỉ đổi màu. `.btn[disabled]` cũng đã có sẵn.

### 4.3 Markup (giống hệt nhau ở hai trang, khác class)

```html
<div class="or"><span>or</span></div>

<button type="button" class="google" id="googleBtn">
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
  Continue with Google
</button>
```

Lấy nguyên từ `git show 909cf87^:auth.html` (dòng 97–107) — không gõ lại, không sợ sai path
data. Trên `login.html` đổi `class="google"` → `class="btn btn-google"` và `.or` → `.auth-or`.

### 4.4 Câu chữ đi kèm

`#foot` hiện đổi theo tab. Thêm một câu chung cho cả hai chế độ, bên dưới nút — **không**
thay câu đang có (tránh làm đỏ test `client-signup.test.js` › *"a new account is told it
still needs an invitation"*, vốn tìm chuỗi `invitation to its club`):

- `auth.html` — nút không cần chú thích: analyst vào là tag được ngay.
- `login.html` — thêm một dòng nhỏ dưới nút:
  `Signing in with Google creates your account the first time. It still waits for an
  invitation to your club's channel.`
  Câu này giữ nguyên cụm `invitation to` nên test hiện tại vẫn xanh, và nó trả lời đúng câu
  hỏi mà một club sẽ hỏi ngay sau khi bấm nút.

---

## 5. `auth.html` — thay đổi từng phần

Tổng: **+3 khối CSS, +2 phần tử markup, +1 hàm, +1 handler, +4 dòng trong `explain()`.**
Không sửa dòng nào đang có, trừ `explain()` (chỉ *chèn thêm* nhánh `if`).

### 5.1 `gWorking()` — hàm bật/tắt của riêng nút Google

```js
  /* The Google button has its own busy switch, and working() is never told about it.
     That is not tidiness: working() used to disable this button on EVERY submit, so
     when the button was removed the leftover $('googleBtn') killed Sign in and Create
     account outright (see 909cf87). Two switches that do not know about each other
     cannot do that to each other. The forms already refuse to run while `busy`, so a
     click here during a password sign-in is turned away by that flag alone. */
  function gWorking(on) {
    busy = on;
    $('googleBtn').disabled = on;
  }
```

### 5.2 Handler

```js
  $('googleBtn').onclick = async function () {
    if (busy) return;
    const c = client();
    if (!c) return say('Supabase could not be loaded — check your connection and reload the page.', 'bad');

    gWorking(true);
    say('Opening Google…', 'info');
    try {
      /* Come back to THIS page, ?next= and all, so the session is stored where the gate
         reads it and the redirect leftovers never reach the app's own #match= hash.
         location.origin + pathname + search is the address as it is actually served —
         never a guess, so it cannot drift from what Supabase's Redirect URLs allow. */
      const back = location.origin + location.pathname + location.search;
      const { data, error } = await c.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: back,
          skipBrowserRedirect: true,
          /* Every popular app lets you pick which Google account. Without this, a
             browser signed into exactly one is sent straight through it. */
          queryParams: { prompt: 'select_account' }
        }
      });
      if (error) throw error;
      if (!await providerEnabled(data.url)) throw { message: 'Unsupported provider: provider is not enabled' };
      location.assign(data.url);
    } catch (err) {
      gWorking(false);
      say(explain(err), 'bad');
    }
  };
```

### 5.3 Đường về: **không sửa gì cả**

`boot()` hiện tại đã là:

```js
let session = null;
try { ({ data: { session } } = await c.auth.getSession()); } catch (e) {}
if (session && session.user && !session.user.is_anonymous) return land();
```

`getSession()` chờ client đọc xong URL — đó chính là chỗ hash `#access_token=` biến thành
phiên. `land()` gọi **không tham số** ⇒ nhánh `if (email)` không chạy ⇒ không
`navigator.credentials.store()` (không có mật khẩu để lưu), không đợi `SETTLE_MS`
(1200ms để trình duyệt hỏi "Save password?" — vô nghĩa với Google), đi thẳng
`go()` → `nextUrl()`.

Và nhánh lỗi cũng đã có:

```js
if (/error_description=|[?&]error=/.test(location.hash + location.search)) { … }
```

Google trả `#error=access_denied&error_description=…` khi người dùng bấm huỷ → khớp.

> Đây là phần đẹp nhất của thiết kế: **một nửa tính năng đã tồn tại và đang được test.**

### 5.4 `providerEnabled()` — lấy lại, và thêm một cái đồng hồ

Lý do nó tồn tại (comment gốc, giữ nguyên): `signInWithOAuth` chỉ *dựng URL*, nên một project
chưa bật Google trả lời **sau khi đã rời trang** — người dùng đứng nhìn
`{"code":400,"msg":"Unsupported provider…"}` không có đường về.

Bản lấy lại thêm một hàng rào mà bản cũ không có:

```js
  /* signInWithOAuth only builds a URL and sends the browser to it, so a project that has
     not turned Google on yet answers AFTER we have gone — leaving the visitor staring at
     a raw {"code":400,"msg":"Unsupported provider…"} page with no way back. Ask first:
     that 400 comes back with CORS headers and is readable, while an enabled provider
     answers with a redirect to accounts.google.com that CORS makes this fetch throw on.
     So only a readable "not enabled" stops us — anything else goes ahead as before.

     The race is new. This check is insurance, not the feature: on a slow connection it
     must not be the reason nothing happens, so after 1.2s we stop waiting and go. */
  const PREFLIGHT_MS = 1200;
  async function providerEnabled(url) {
    const ask = (async () => {
      try {
        const r = await fetch(url, { headers: { accept: 'application/json' } });
        const body = await r.text();
        if (!r.ok && /provider is not enabled|unsupported provider/i.test(body)) return false;
      } catch (e) {}
      return true;
    })();
    return Promise.race([ask, new Promise(r => setTimeout(() => r(true), PREFLIGHT_MS))]);
  }
```

### 5.5 `explain()` — thêm 4 nhánh, không sửa nhánh nào

Chèn **trước** dòng `return msg;` cuối hàm:

```js
    if (/unsupported provider|provider is not enabled/i.test(msg))
      return 'Google sign-in is not enabled on this Supabase project yet.\nEnable it in Authentication → Providers → Google (see README).';
    if (/access_denied|user denied|cancelled|canceled/i.test(msg))
      return 'Google sign-in was cancelled. Nothing has changed.';
    if (/bad_oauth_state|invalid state|flow ?state|state not found/i.test(msg))
      return 'That sign-in took too long, or was finished in a different tab.\nPress Continue with Google again.';
    if (/identity is already linked|already linked to another user/i.test(msg))
      return 'That Google account is already attached to a different account here.\nSign in with your email and password instead.';
```

Nhánh `redirect|not allowed` + `url` đã có sẵn và nói đúng điều cần nói cho Google.

---

## 6. Client site — `login.html`, `supa.js`, `app.css`

### 6.1 `client/assets/supa.js` — thêm **đúng một key**, không sửa key nào

Đặt ngay sau `signUp`, trước `signOut`, trong object `API.auth`:

```js
      /* Google, and one door for both tabs: with an OAuth provider there is no separate
         "sign up" — the first time an address arrives it becomes an account, and every
         time after that it signs in. It joins no channel either way; which club someone
         belongs to stays an admin's decision (see channels.invite / claim).

         Returns the URL to send the browser to rather than going itself: navigating is
         the page's job, and login.html checks the URL is alive before it leaves (a
         project with Google switched off answers only after we have gone).

         redirectTo is read off ROOT, not off location, for the same reason
         emailRedirectTo is — app.html loads this file too. It MUST be in Supabase's
         Redirect URLs: falling back to the Site URL lands on index.html, which loads no
         Supabase client at all and would drop the tokens without a word. */
      signInWithGoogle: function () {
        var c = client();
        if (!c) return Promise.reject(new Error('Sign-in is unavailable: the Supabase client did not load.'));
        return c.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: ROOT + 'login.html',
            skipBrowserRedirect: true,
            queryParams: { prompt: 'select_account' }
          }
        }).then(function (r) {
          if (r.error) throw r.error;
          return (r.data && r.data.url) || '';
        });
      },
```

`ROOT` đã tồn tại và đã được test (`client-signup.test.js` › *"the site root is read off this
script"*). Không có biến mới ở scope module.

> **Vì sao vào `supa.js` chứ không inline trong `login.html`:** `app.js` không gọi hàm này,
> nên bề mặt chạy của `app.html` không đổi — nhưng bytes của `supa.js` thì đổi, nên
> `app.html` **bắt buộc** phải bump `?v=`. Nếu anh muốn bán kính nổ bằng 0 tuyệt đối cho
> `app.html`, phương án B là viết thẳng 8 dòng đó trong `<script>` của `login.html` và không
> đụng `supa.js`. Xem §14-Q2.

### 6.2 `client/login.html`

```js
  /* Its own busy switch — working() is never told about this button. See auth.html for
     the bug that rule exists to prevent. */
  function gWorking(on) {
    busy = on;
    $('googleBtn').disabled = on;
  }

  $('googleBtn').addEventListener('click', function () {
    if (busy) return;
    gWorking(true);
    show('Opening Google…', false);
    window.HNA.auth.signInWithGoogle().then(function (url) {
      if (!url) throw new Error('Google sign-in did not return a destination.');
      return alive(url).then(function (ok) {
        if (!ok) throw new Error('Unsupported provider: provider is not enabled');
        location.assign(url);
      });
    }).catch(function (err) {
      gWorking(false);
      show(explain(err), true);
    });
  });
```

`alive(url)` là bản `providerEnabled` của §5.4 viết theo phong cách `var`/`function` của file
này. `explain()` nhận thêm đúng 4 nhánh như §5.5, chữ nghĩa hợp với người đọc là club.

Đường về: `boot()` đã có

```js
window.HNA.auth.session().then(function (s) { if (s) location.replace('app.html'); });
```

⇒ **không sửa**. Và nhánh `error_description=` cũng đã có ⇒ **không sửa**.

### 6.3 `client/assets/app.css`

Hai rule ở §4.2, thêm cuối file, cạnh khối `.auth-card`. Không sửa rule nào đang có.

---

## 7. Cấu hình — Google Cloud Console + Supabase

**Không có bí mật nào vào repo.** Client secret của Google chỉ tồn tại trong Supabase
Dashboard. Client ID cũng không cần xuất hiện trong code — `signInWithOAuth` gọi tới endpoint
`/auth/v1/authorize` của Supabase, Supabase mới là bên cầm ID/secret.

### 7.1 Google Cloud Console

1. Tạo project (hoặc dùng project sẵn có) → **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name: `HoangNam Analytics`; support email; logo (tuỳ chọn)
   - Authorized domains: `hoangnams.com` **và** `supabase.co`
   - Scopes: chỉ `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` — **không
     thêm scope nào khác**, vì scope thừa là thứ đẩy app vào diện phải verification.
   - Trạng thái: **Testing** thì chỉ ~100 test users vào được, nhưng **không hiện màn hình
     "unverified app"** cho họ. **Publish → In production** để ai cũng vào được; với 3 scope
     cơ bản này Google **không** bắt verification.
2. **Credentials → Create credentials → OAuth client ID → Web application**
   - **Authorized JavaScript origins**
     ```
     https://hoangnams.com
     https://www.hoangnams.com
     ```
   - **Authorized redirect URIs** — đúng **một** dòng, và nó là của Supabase, không phải của site:
     ```
     https://xtzmtdcohoixoxqusyyz.supabase.co/auth/v1/callback
     ```
3. Chép **Client ID** và **Client secret**.

### 7.2 Supabase Dashboard

1. **Authentication → Providers → Google** → bật, dán Client ID + Secret → Save.
   - *Skip nonce check*: **để tắt**. Nó chỉ dành cho One Tap, mà ta không dùng.
2. **Authentication → URL Configuration** — bước hay cắn nhất (README đã cảnh báo cho email):
   - **Site URL:** `https://hoangnams.com/`
   - **Redirect URLs:** phải phủ **cả hai** trang đăng nhập, cả domain cũ (vì
     `hoangnam25012004.github.io/**` vẫn 301 về đây và email cũ còn trỏ tới nó), và cả local:
     ```
     https://hoangnams.com/**
     https://www.hoangnams.com/**
     https://hoangnam25012004.github.io/Football-Data-Labeling-Website/**
     http://localhost:8000/**
     http://localhost:8765/**
     ```

   ⚠️ **Kiểm tra hai ô này trước tiên.** `README.md §Supabase setup` vẫn ghi URL `github.io`
   — theo memory `site-domain-moved`, site đã chuyển sang `hoangnams.com` từ 2026-08-15 và
   README là tài liệu **cũ, không phải nguồn sự thật**. Nếu Site URL còn trỏ github.io thì
   Google sẽ trả token về đó, và với client site đó là mất token không báo (§3).

3. **Authentication → Providers → Email**: giữ nguyên. Không đụng.
4. **Allow anonymous sign-ins**: giữ **bật** — `cloud-sync.js` dựa vào nó.

### 7.3 Cập nhật `README.md`

Thêm một mục con dưới `### Supabase setup for accounts`, và sửa **đúng một câu** đang sai
sau khi thi công:

```
Sign-in is by email and password only; there is no third-party provider.   ← câu này phải đổi
```

Theo memory `landing-claims-match-code`: câu chữ trên trang phải khớp code. Câu này nằm ở
README chứ không phải trang public, nhưng luật vẫn thế.

---

## 8. Rủi ro số 1: **hai tài khoản cho một con người**

### 8.1 Chuyện gì xảy ra

Một analyst đã dùng `dnam2501@gmail.com` + mật khẩu từ tháng 8. Hôm nay họ bấm
**Continue with Google** với đúng địa chỉ đó. Hai kịch bản:

| | Supabase **nối** danh tính | Supabase **tạo user mới** |
|---|---|---|
| `auth.users` | 1 row, 2 identities | **2 rows** |
| `user_id` trong JWT | như cũ | **uuid mới** |
| Hotkeys + macros (`user_prefs`) | nguyên vẹn | **trống** (rồi bị gieo lại từ localStorage máy đó) |
| Trận gần đây (`pitchtagger.recent.v1`) | nguyên vẹn | trống |
| Club: `club_members` | nguyên vẹn | **"No channel"** |
| `claim_club_invites()` | không cần | vô dụng — invite cũ đã `accepted_at`, không claim lại |

Cột phải là kịch bản phải chặn.

### 8.2 Supabase làm gì theo mặc định

Supabase Auth có **automatic identity linking**: một identity mới được nối vào user đang có
khi **email trùng và email đó đã được xác minh**. Google luôn trả `email_verified: true` cho
tài khoản Gmail. Nên đường đi bình thường là cột **trái**.

Nhưng có một mép mà tôi **không dám khẳng định mà không đo**: tài khoản email+mật khẩu **chưa
bấm link xác nhận**. Project này đang bật *Confirm email* (README §2), nên hoàn toàn có
những row `auth.users` với `email_confirmed_at IS NULL`. Nối một identity đã xác minh vào một
tài khoản chưa xác minh là đúng cái lỗ mà nối tự động phải phòng, và hành vi của GoTrue ở đây
đã đổi qua các bản.

> **Không đoán. Đo.** §8.3.

### 8.3 Quy trình kiểm chứng (phải chạy trước khi bật cho tagger)

Chạy trên **client site** trước, vì ở đó hậu quả xấu nhất là "No channel" — admin mời lại là
xong. Ở tagger hậu quả là macro.

| # | Bước | Kết quả phải thấy |
|---|---|---|
| T1 | Tạo tài khoản email+mật khẩu bằng một Gmail thật chưa từng dùng, **bấm link xác nhận**. Ghi lại `user.id` (Console: `(await window.HNA.auth.user()).id`). | có id, gọi là `A` |
| T2 | Sign out. Bấm Continue with Google với **đúng** địa chỉ đó. | vào được |
| T3 | Đọc lại `user.id` | **phải bằng `A`** ← đây là toàn bộ bài kiểm tra |
| T4 | Đọc `(await window.HNA.auth.user()).identities.map(i=>i.provider)` | `['email','google']` |
| T5 | Lặp T1–T3 với một Gmail **không bấm link xác nhận** | ghi lại kết quả — đây là mép chưa biết |
| T6 | Ngược chiều: tài khoản tạo **bằng Google trước**, rồi thử Sign up email+mật khẩu cùng địa chỉ | phải bị từ chối bằng câu tiếng Anh dễ hiểu, không phải mã lỗi thô |
| T7 | Trên tagger: đăng nhập Google trên tài khoản đã có macro, mở ⚙ Event | **macro và hotkey còn nguyên** |

T3 và T7 là hai cái chốt. Nếu T3 ra uuid khác, **dừng lại** và quay về §8.4 trước khi bật
cho tagger.

Có thể chạy an toàn ở đâu: `docs/uat-environment-design.md` đã thiết kế một môi trường thứ
hai (Supabase khác, origin khác) đúng cho loại kiểm tra này — nhưng nó **chưa triển khai**
(trạng thái ghi trong chính tài liệu đó). Nên trước mắt: chạy trên production bằng **tài
khoản Gmail vứt đi**, không dùng tài khoản của anh, không dùng tài khoản của khách.

### 8.4 Nếu không nối được thì làm gì

Theo thứ tự ưu tiên, và **cả ba đều cần anh cho phép** vì đều chạm ra ngoài phạm vi:

1. **Chỉ cho Google trên client site, không cho trên tagger.** Rẻ nhất, an toàn nhất, và
   vẫn trả đúng thứ khách hàng nhìn thấy. Analyst là người trong nhà, họ đã có mật khẩu.
2. **Một câu cảnh báo trên trang đăng nhập:** *"Already signed up with a password? Keep
   using it — Google will create a separate account."* Trung thực, tốn 1 dòng.
3. **Migration cho phép claim lại invite đã accepted** khi email trùng nhưng `user_id` khác.
   Đây là **sửa hàm SQL của tính năng channel** — tôi sẽ không đề xuất trừ khi 1 và 2 không đủ.

### 8.5 Một thứ Google **không** phá được

Bảng `event_types`, `matches`, `events`, `lineups`, `teams`, `players`, `match_reports`
**không khoá theo `user_id`** — RLS của chúng là `to authenticated`. Nên dù danh tính có
nhân đôi, **không một sự kiện đã tag, một đội hình, một trận nào bị mất hay bị ẩn**. Cái
duy nhất khoá theo người là `user_prefs` (hotkeys/macros) và `club_members` (quyền xem
channel). Biết được ranh giới này là biết được rủi ro dừng ở đâu.

---

## 9. Không đụng tới — và vì sao

Đây là câu trả lời trực tiếp cho yêu cầu *"đảm bảo không xảy ra bugs của các chức năng khác
trong những tabs khác"*.

### 9.1 Tagging app

| Tab / chức năng | Hàng rào |
|---|---|
| ▾ Other (Cloud, Submit Analysis, Sign out) | `index.html` = 0 dòng. Menu đọc `PTAuth.user()`/`displayName()`, mà `auth.js` không đổi. |
| ⚙ Event + hotkeys + macros | `shared.js`, `cloud-sync.js` = 0 dòng. Rủi ro duy nhất là `user_id` → §8. |
| 🎞 Video, ⧉ Open window, ⏱ Duration | Không liên quan đến auth. 0 dòng. |
| ⚽ Match, 👥 Player lists | 0 dòng. |
| 📊 Stats (6 tab) + `Stats/report.js` | 0 dòng. |
| `Player-Lists/` | 0 dòng. |
| Cổng chặn (`auth.js`) | **0 dòng, `?v=1` giữ nguyên** (§2.3). Không có cách nào cổng hồi quy. |
| Phiên ẩn danh của `cloud-sync.js` | `boot()` của `auth.html` vẫn signOut phiên ẩn danh y như cũ — dòng đó không bị chạm. |
| Trình quản lý mật khẩu nhớ login | Nút nằm **ngoài** cả hai form; số `<input>` trong mỗi form không đổi (§2.5). |

### 9.2 Client site

| View / chức năng | Hàng rào |
|---|---|
| Home / Channel / Data | `client/assets/app.js` = **0 dòng**. |
| Film tools | `film-tools.js/css` = 0 dòng. |
| Channel switcher, invite, claim | `supa.js` chỉ **thêm** một key; `clubs()`, `invite()`, `claim()` không bị chạm. |
| Landing `client/index.html` | 0 dòng (nó thậm chí không load `supa.js` — §3). |
| `guide.html` | 0 dòng nội dung; chỉ bump `?v=` của `app.css` cho khớp manifest. |
| Mobile (`app-mobile.css`) | 0 dòng. `mobile-ui.test.js` cấm `login.html` nhắc tới file này — thiết kế này không nhắc. |

### 9.3 Backend

| | |
|---|---|
| `supabase/migrations/*` | **0 file mới, 0 file sửa.** Google không cần schema nào. |
| RLS | không đụng. |
| Cloudflare Worker (`contact.js`, `r2-presign.js`) | không đụng. `ALLOW_ORIGIN` không liên quan — Google redirect là điều hướng trang, không phải `fetch` chéo origin. |
| `deploy.yml` | **không sửa** — thiết kế cố ý không tạo file mới, nên không có dòng `cp` nào phải thêm (memory `deploy-whitelist-gotcha`). |

---

## 10. Test

### 10.1 Cái sẽ đỏ nếu không làm gì

| Test | File | Vì sao đỏ | Xử lý |
|---|---|---|---|
| *"Google sign-in is gone, and takes every reference with it"* | `auth-gate.test.js` | Nó cấm `signInWithOAuth`, `googleBtn`, `.google` | **Thay** bằng §10.2 |
| *"every versioned asset is served at the version its content is at"* | `asset-versions.test.js` | `supa.js` và `app.css` đổi bytes | Chạy **không cờ** trước để đọc số phải bump, bump xong mới `--update` (memory `shared-js-cache-bust`) |

Chỉ hai. Cơ sở: grep `google|oauth|signInWithOAuth` trên toàn repo (2 file test khớp, cả hai ở trên), cộng grep `auth.html|login.html` qua cả 59 file `tests/*.test.js` — ngoài hai file auth ra chỉ còn `client-channels.test.js`, `mobile-ui.test.js` và `asset-versions.test.js` chạm tới hai trang này, và không test nào trong đó đọc phần thân trang.

### 10.2 Test mới — tagger (`tests/auth-gate.test.js`)

Thay test cũ bằng chùm này. Tên viết theo giọng của file (câu kể, tiếng Anh):

```js
test('Google is back, and it cannot kill the two forms with it', () => {
  const html = page('auth.html');
  ok(/signInWithOAuth/.test(html) && /provider: 'google'/.test(html), 'the OAuth call is there');
  ok(/id="googleBtn"/.test(html), 'and a button to start it');
  // THE bug, pinned: working() disabled this button on every submit, so removing the
  // button once killed Sign in and Create account outright (909cf87).
  const working = /function working\(on, label\)[\s\S]*?\n  \}/.exec(html)[0];
  notOk(/googleBtn/.test(working), 'working() knows nothing about it');
  ok(/function gWorking\(on\)/.test(html), 'the Google button has a switch of its own');
});

test('the Google button is outside both forms, and adds no field to either', () => {
  const html = page('auth.html');
  const formOf = id => new RegExp('<form id="' + id + '"[\\s\\S]*?</form>').exec(html)[0];
  notOk(/googleBtn/.test(formOf('signInForm')), 'not in the sign-in form');
  notOk(/googleBtn/.test(formOf('signUpForm')), 'nor in the sign-up form');
  eq((formOf('signInForm').match(/<input/g) || []).length, 2, 'still exactly two inputs');
  eq((formOf('signUpForm').match(/<input/g) || []).length, 4, 'still exactly four');
  ok(/id="googleBtn"[^>]*type="button"|type="button"[^>]*id="googleBtn"/.test(html),
     'and it is type=button, so it can never submit one of them');
});

test('the trip to Google comes back to this page, ?next= and all', () => {
  const h = /\$\('googleBtn'\)\.onclick[\s\S]*?\n  \};/.exec(page('auth.html'))[0];
  ok(/location\.origin \+ location\.pathname \+ location\.search/.test(h),
     'the address as served, not a guess — Redirect URLs has to match it exactly');
  ok(/redirectTo: back/.test(h), 'and that is what is sent');
  ok(/prompt: 'select_account'/.test(h), 'the account chooser, as every popular app shows');
});

test('a project with Google switched off is a sentence, not a JSON page', () => {
  const html = page('auth.html');
  ok(/async function providerEnabled/.test(html), 'the pre-flight is back');
  ok(/PREFLIGHT_MS/.test(html) && /Promise\.race/.test(html),
     'and it is capped, so a slow network is not the reason nothing happens');
  ok(/provider is not enabled/.test(html), 'and explained in words');
});

test('coming back from Google is not made to wait for a password prompt', () => {
  // land() with no email skips remember() and SETTLE_MS. That is already how boot()
  // calls it; this pins that nothing new was added in front of it.
  const html = page('auth.html');
  ok(/return land\(\);/.test(html), 'boot still lands with no arguments');
  notOk(/googleBtn[\s\S]{0,200}credentials\.store/.test(html), 'no password is stored for an OAuth sign-in');
});

test('the messages Google can send back are all in plain words', () => {
  const ex = /function explain\(err\)[\s\S]*?\n  \}/.exec(page('auth.html'))[0];
  ['unsupported provider', 'access_denied', 'bad_oauth_state', 'already linked']
    .forEach(k => ok(ex.includes(k), 'it handles ' + k));
});
```

Bốn test đang có **phải tiếp tục xanh không sửa** — chúng là bằng chứng rằng form không hỏng:

- *"the sign-in form holds a username and a password, and nothing else"*
- *"the sign-up form asks for all four, and never offers the old password"*
- *"each form reads its own fields, and only its own"*
- *"the sign-in screen is in English, all of it"*

### 10.3 Test mới — client (`tests/client-signup.test.js`)

```js
test('supa.js can start a Google sign-in, and joins no channel doing it', () => {
  const fn = /signInWithGoogle: function \(\)[\s\S]*?\n      \},/.exec(SUPA)[0];
  ok(/provider: 'google'/.test(fn));
  ok(/ROOT \+ 'login\.html'/.test(fn), 'home is this site’s own sign-in page, not the tagger’s');
  ok(/skipBrowserRedirect: true/.test(fn), 'the page navigates, not the library');
  notOk(/club_members|clubs|insert/.test(fn), 'it writes to no channel table');
});

test('the Google button is outside both forms here too', () => {
  const signIn = /<form id="loginForm"[\s\S]*?<\/form>/.exec(LOGIN)[0];
  const signUp = /<form id="signupForm"[\s\S]*?<\/form>/.exec(LOGIN)[0];
  [signIn, signUp].forEach(f => notOk(/googleBtn/.test(f)));
  const working = /function working\(on, label\)[\s\S]*?\n  \}/.exec(SCRIPT)[0];
  notOk(/googleBtn/.test(working), 'working() is untouched — auth.html learned this the hard way');
});

test('a club is told what Google does about their channel', () => {
  ok(/invitation to your club|invitation to its club/.test(LOGIN),
     'signing in with Google still does not put them in a channel');
});

test('the two sign-in pages offer the same provider, worded for their own reader', () => {
  ok(/Continue with Google/.test(LOGIN) && /Continue with Google/.test(AUTH_HTML),
     'one label, two pages');
});
```

Và một test styling, theo đúng khuôn mục *"styling"* đang có ở cuối file:

```js
test('the Google button is styled with the site-s own tokens', () => {
  const css = APPCSS.replace(/\s*\n\s*/g, '');
  ok(/\.auth-or\{[^}]*display:flex/.test(css), 'the divider is a rule, not a one-off');
  ok(/\.btn-google\{[^}]*background:#fff/.test(css), 'Google’s own light button, on our dark card');
});
```

### 10.4 Cái test **không** làm được, và phải kiểm bằng tay

`docs/uat-environment-design.md §1.2` đã liệt kê đúng ranh giới này. Với Google, phần nằm
ngoài sandbox là:

| Phải kiểm bằng tay | Cách |
|---|---|
| Redirect URLs có đúng không | Bấm nút thật, xem có về đúng trang không |
| Nối danh tính | §8.3 T1–T7 |
| Màn hình đồng ý của Google có hiện "unverified app" | Mở bằng một tài khoản không phải test user |
| `?next=` sống sót qua vòng Google | Mở `/tagger/Stats/` khi chưa đăng nhập → Google → phải về `/tagger/Stats/` |
| Hai tab: đăng xuất tab này, tab kia có đóng không | `watchSignOut()` — không đổi, nhưng đáng xác nhận một lần |

---

## 11. Cache-bust và deploy

### 11.1 Bảng bump — **đủ và đúng**

| File đổi bytes | `?v=` hiện tại | Mới | Phải sửa ở những trang nào |
|---|---|---|---|
| `client/assets/supa.js` | 16 | **17** | `client/login.html:76`, `client/app.html:83` |
| `client/assets/app.css` | 25 | **26** | `client/login.html:8`, `client/app.html:9`, `client/guide.html:9` |
| `auth.html` | — | — | trang, không có `?v=` của riêng nó |
| `client/login.html` | — | — | trang |
| `auth.js` | 1 | **1** | không đổi bytes ⇒ không bump |
| `client/assets/app.js` | 54 | **54** | không đổi bytes ⇒ không bump |
| `site.css` | 3 | **3** | không đụng |

`guide.html` không dùng nút Google nhưng **vẫn phải bump** `app.css`: `asset-versions.test.js`
có một test riêng bắt cùng một file mang hai số khác nhau ở hai trang.

Không có bump tầng hai lần này: `app.js` phát `?v=` cho `Stats/stats-view.js` và
`../shared.js` khi mở một trận, mà cả hai đều không đổi.

### 11.2 Thứ tự đúng (memory `shared-js-cache-bust`)

```bash
node tests/asset-versions.test.js
```

Chạy **không cờ** trước — nó in ra đúng file nào đổi mà chưa bump. Sửa 5 chỗ trong bảng
trên, rồi mới:

```bash
node tests/asset-versions.test.js --update
```

### 11.3 Deploy

`.github/workflows/deploy.yml` — **không sửa**. Thiết kế không tạo file mới, và cả 5 file
đụng tới đều đã nằm trong danh sách `cp`. `auth.html` được `cp` **hai lần** (`_site/tagger/`
và `_site/`) — cả hai bản sẽ có nút Google, và cả hai đường dẫn cần nằm trong Redirect URLs
(dấu `**` ở §7.2 phủ cả hai).

Kiểm sau khi push, đọc **đường dẫn đích** chứ không phải đường dẫn repo:

```bash
curl -s "https://api.github.com/repos/Hoangnam25012004/Football-Data-Labeling-Website/actions/runs?per_page=3"
```

---

## 12. Trường hợp biên

| Tình huống | Xảy ra gì | Đã che chưa |
|---|---|---|
| Người dùng bấm **Cancel** trên màn Google | Về `#error=access_denied&error_description=…` | ✅ nhánh error của `boot()` đã có; `explain()` thêm câu tiếng Anh |
| Google bật nhưng Supabase chưa cấu hình | Pre-flight đọc được 400 → câu chỉ đường tới Dashboard | ✅ §5.4 |
| Mạng chết ngay lúc bấm | `fetch` ném → race trả `true` sau 1.2s → vẫn `location.assign`, Chrome báo offline | ✅ chấp nhận được: người dùng thấy trang lỗi của trình duyệt, bấm back là về |
| Cửa sổ ẩn danh chặn `localStorage` | `land()` đã có nhánh *"this browser is not keeping the session"* | ✅ 0 dòng thêm |
| Token rơi vào trang app (Redirect URLs sai) | `auth.js` chuyển tiếp nguyên vẹn | ✅ tagger. ❌ client site → §14-Q3 |
| Hash `#match=12345` bị nhầm là callback | `CALLBACK_HASH` không khớp `match=` | ✅ đã có test riêng cho đúng chuyện này |
| Bấm nút Google lúc đang Sign in | `if (busy) return;` | ✅ |
| Bấm Sign in lúc đang chờ Google | `working()` không tắt nút Google, nhưng handler form cũng `if (busy) return;` | ✅ (đánh đổi có chủ ý — §5.1) |
| Bấm Back sau khi đã vào app | Về trang auth, `boot()` thấy phiên → `land()` → vào lại app | ✅ 0 dòng thêm |
| Hai tab cùng mở, đăng xuất ở một tab | `watchSignOut()` nghe `storage` | ✅ 0 dòng thêm |
| State OAuth hết hạn (mở tab để cả tiếng rồi mới bấm) | `bad_oauth_state` | ✅ `explain()` |
| Tài khoản Google không có email (không tồn tại với Gmail) | `jwt_email()` trả null → `claim_club_invites()` trả 0, không nổ | ✅ hàm SQL đã thủ sẵn `if mail is null then return 0` |
| Trình duyệt chặn cookie bên thứ ba | Không ảnh hưởng: cả vòng là điều hướng first-party + `localStorage` | ✅ |

---

## 13. Thứ tự triển khai

| Giai đoạn | Việc | Kiểm xong mới đi tiếp |
|---|---|---|
| **0** | §7 — Google Console + Supabase, **chưa đụng code**. Xác nhận Site URL/Redirect URLs đã là `hoangnams.com`. | Mở `https://xtzmtdcohoixoxqusyyz.supabase.co/auth/v1/authorize?provider=google` trong tab mới → phải thấy màn Google, không phải JSON 400 |
| **1** | `client/login.html` + `supa.js` + `app.css` + bump ?v= + test §10.3 | `node tests/run.js` xanh; bấm nút thật trên `login.html` |
| **2** | **§8.3 T1–T6** trên client site, tài khoản Gmail vứt đi | **T3 phải trả về cùng `user.id`.** Không đạt ⇒ dừng, quay lại §8.4 |
| **3** | `auth.html` + test §10.2 | `node tests/run.js` xanh; **§8.3 T7: macro còn nguyên** |
| **4** | `README.md` — sửa câu *"no third-party provider"*, thêm checklist §7 | — |

Giai đoạn 1 và 3 là hai commit riêng, đẩy riêng. Nếu giai đoạn 3 có vấn đề, revert nó không
chạm gì tới client site.

---

## 14. Cần anh cho phép trước khi tôi viết code

Tôi **không sửa gì** cho tới khi có câu trả lời cho Q1–Q3. Q4–Q6 có thể trả lời sau.

**Q1 — Thay test *"Google sign-in is gone"*.** Đây là thay đổi mang tính xoá duy nhất trong
toàn bộ kế hoạch. Nó nằm trong file test của chính tính năng auth, và được thay bằng 6 test
chặt hơn (§10.2) bảo vệ đúng cái bẫy mà nó sinh ra để bảo vệ. **Đồng ý thay?**

**Q2 — `signInWithGoogle` đặt ở đâu?**
- **(a) `client/assets/supa.js`** — đúng nếp nhà (mọi lời gọi auth đều ở đó), test được qua
  harness sẵn có, nhưng buộc bump `?v=` của `supa.js` trên `app.html` — tức file dữ liệu của
  app channel được tải lại. *Đề xuất của tôi.*
- **(b) inline trong `client/login.html`** — `supa.js` không đổi một byte, `app.html` không
  bị chạm gì cả, đổi lại là lệch nếp và không dùng được harness test hiện có.

**Q3 — Lưới an toàn cho client site (§3, §12).** Nếu Redirect URLs bị sai, token rơi vào
`client/index.html` và mất im lặng. Có muốn tôi thêm ~4 dòng vào `client/index.html` để nó
phát hiện `#access_token=` / `?error=` và chuyển tiếp sang `login.html` không? Đây là **sửa
trang landing** — file của tính năng khác — nên tôi hỏi. (Không có nó thì cấu hình đúng ở §7
là đủ; có nó thì sai cấu hình cũng không mất phiên.)

**Q4 — Ảnh đại diện Google.** Google trả `user_metadata.avatar_url`. Hiện `app.html` hiện
chữ cái đầu của email, `index.html` hiện tên trong ▾ Other. Có muốn hiện ảnh không? Việc này
sửa `client/assets/app.js` và/hoặc `index.html`. **Mặc định của tôi: không.**

**Q5 — Chặn theo domain email.** Có muốn giới hạn ai đăng nhập Google được vào **tagger**
không (ví dụ chỉ một số địa chỉ)? `hd` của Google chỉ là gợi ý, không chặn thật; chặn thật
phải là trigger/policy trong Supabase — tức migration mới. **Mặc định của tôi: không, giữ
nguyên như hiện tại** (hôm nay ai cũng có thể tự đăng ký tagger bằng email+mật khẩu, nên
Google không mở rộng thêm cửa nào).

**Q6 — Có làm cả hai site không, hay chỉ client site?** §13 làm cả hai, client trước. Nếu
anh chỉ muốn khách hàng có Google còn analyst giữ mật khẩu, dừng ở giai đoạn 2 là xong và
rủi ro macro (§8) biến mất hoàn toàn.

---

## 15. Ước lượng

| Việc | Dòng |
|---|---|
| `auth.html` | ~75 (CSS 12, markup 12, script 50) |
| `client/login.html` | ~45 |
| `client/assets/supa.js` | ~22 (18 comment/code, 4 chỗ khác 0) |
| `client/assets/app.css` | ~12 |
| `?v=` bump | 5 chỗ |
| `tests/auth-gate.test.js` | −7 / +55 |
| `tests/client-signup.test.js` | +35 |
| `README.md` | ~30 |
| **Code không phải test** | **~155 dòng, 4 file, 0 file mới, 0 migration** |

Cấu hình Console + Dashboard (§7): ~20 phút, không có gì rollback được bằng git — nên nó là
giai đoạn 0 và có bước xác nhận riêng.

---

## 16. Ghi chú cho người đọc sau

Ba điều tài liệu này muốn còn lại kể cả khi mọi thứ khác quên hết:

1. **`working()` không được biết về nút Google.** Một lần rồi: nút biến mất, tham chiếu ở
   lại, và Sign in lẫn Create account chết cùng lúc. Hai công tắc không biết nhau thì không
   giết được nhau.
2. **Nút nằm ngoài `<form>`.** Không phải vì đẹp. Vì trình quản lý mật khẩu đọc
   `form.elements` chứ không nhìn màn hình.
3. **Cái Google có thể phá không phải giao diện, mà là `user_id`.** Và thứ khoá theo
   `user_id` trong repo này chỉ có ba: `user_prefs` (hotkeys + macros), `pitchtagger.recent.v1`,
   `club_members`. Sự kiện đã tag, đội hình, trận đấu thì không — RLS của chúng là
   `to authenticated`. Biết ranh giới đó là biết lo đúng chỗ.

---

## 17. Đã triển khai — 2026-09-04

Sáu câu §14 đã chốt: **Q1 đồng ý · Q2 (a) · Q3 có · Q4 có · Q5 không · Q6 có (cả hai site)**.
Thi công theo §13, một lượt, test **1483/1483** (baseline 1467 + 16 test mới).

### 17.1 Đã sửa gì

| File | Thay đổi | Ghi chú |
|---|---|---|
| `auth.html` | `.or` + `.google` CSS; nút ngoài hai form; `gWorking()`, `providerEnabled()` + `PREFLIGHT_MS`, handler; 4 nhánh `explain()`; breadcrumb | `working()` **không đổi một byte** |
| `client/login.html` | như trên, class `.auth-or` / `.btn-google`; `alive()` thay `providerEnabled()` theo phong cách `var` của file | |
| `client/assets/supa.js` | `+ signInWithGoogle` (Q2a) | không sửa key nào đang có |
| `client/assets/app.css` | `.auth-or`, `.btn-google`, `.avatar img`, `.avatar.has-photo` | thêm cuối file |
| `client/index.html` | **Q3** — nhánh forward sẵn có đổi *đích* theo breadcrumb | regex nhận diện giữ nguyên |
| `client/assets/app.js` | **Q4** — `showAvatar()` | `renderShell()` đổi 2 dòng |
| `index.html` | **Q4** — ảnh trong ▾ Other + 3 rule CSS | |
| `README.md` | mục *Continue with Google — the dashboard half* | câu "no third-party provider" đã bỏ |

`auth.js` = **0 dòng**, `?v=1` giữ nguyên. `cloud-sync.js`, `shared.js`, `Stats/*`,
`Player-Lists/*`, `film-tools.*`, migrations, `deploy.yml` = **0 dòng**.

Bump: `supa.js` 16→17 (2 trang), `app.css` 25→26 (3 trang), `app.js` 54→55 (1 trang),
manifest regenerate. Không có file mới ⇒ `deploy.yml` không phải sửa.

### 17.2 Một sai lệch so với §3 — và vì sao tốt hơn

§3 giả định lưới cho client site là "thêm mấy dòng vào `client/index.html`". Khi vào code
mới thấy trang đó **đã có sẵn** một nhánh forward (viết cho link xác nhận email), và nó
gửi **mọi thứ** tới `tagger/auth`. Với Google, tokens của một club gửi sang trang đăng nhập
của tagger là sai cửa: hai site giữ phiên dưới hai `storageKey` khác nhau.

Hash không nói được nó từ đâu tới — một OAuth callback **không mang `type=`**. Nên đường đi
để lại **breadcrumb** `localStorage['hna.oauth.home']` ngay trước khi rời trang; landing page
đọc một lần rồi xoá. Không có breadcrumb ⇒ là link xác nhận email ⇒ đích **y như cũ**.
Cùng origin nên `/` và `/tagger/` dùng chung localStorage.

### 17.3 Đã kiểm bằng trình duyệt thật (localhost:8765)

| Kiểm | Kết quả |
|---|---|
| Provider Google trên project, lúc ship | `{"code":400,…"provider is not enabled"}` — **chưa bật** |
| Bấm nút trên `auth.html` | không điều hướng; hiện đúng câu *"…not enabled on this Supabase project yet"*; nút bật lại |
| **Sign in / Create account sau cú bấm đó** | vẫn enabled — cái bẫy 909cf87 **không tái hiện** |
| Bấm nút trên `login.html` | như trên, câu dành cho club; breadcrumb `null` (chỉ ghi sau khi pre-flight qua) |
| Số `<input>` mỗi form, hai trang | 2 và 4 — không đổi |
| Nút nằm trong form? | `document.querySelector('form #googleBtn')` = `null`, cả hai trang |
| Landing + breadcrumb `login.html` | → `/client/login.html#access_token=…` nguyên hash, breadcrumb đã xoá |
| Landing không breadcrumb | → `tagger/auth#…` — mặc định cũ giữ nguyên |
| ▾ Other, tài khoản có ảnh | `<img …><span>Hoang Nam</span>`, title vẫn là email |
| ▾ Other, tài khoản mật khẩu | `<span>Ada Coach</span>`, `imgCount: 0` |
| App tagging sau thay đổi | 11 nút header đủ, bảng render, `window.PT` đủ 23 export |
| `app.html`, tài khoản có ảnh | `.avatar.has-photo` + `<img>`; rail Home/Channel/Data nguyên |

### 17.4 Còn lại

Toàn bộ là việc trên dashboard, không phải code: §7 (Google Console + Supabase), rồi §8.3
T1–T7. Nút đã sống trên site và sẽ tự nói "chưa bật" cho tới khi §7 xong.
