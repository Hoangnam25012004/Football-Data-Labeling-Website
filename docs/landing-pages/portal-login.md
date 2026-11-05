# Portal: Đăng nhập CLB (login)

| | |
| --- | --- |
| URL live | `https://hoangnams.com/login.html` |
| File nguồn | [`apps/portal/login.html`](../../apps/portal/login.html), JS inline từ [dòng 97](../../apps/portal/login.html#L97) |
| Script | `supabase-js@2.118.0` (CDN), [`assets/supa.js`](../../apps/portal/assets/supa.js) (`window.HNA`) |
| CSS | `assets/site.css`, `assets/app.css` |
| Người dùng | Thành viên CLB (admin/analyst/viewer của một channel) |
| Đăng nhập | Đây là cửa đăng nhập. Đã có phiên thì tự chuyển sang `app.html`. |
| Design doc | [`google-sign-in-design.md`](../design/google-sign-in-design.md) |

Trang có 2 tab dùng chung một khung: **Sign in** và **Sign up**, cộng với nút **Continue with
Google**. Tạo tài khoản **không** cho vào channel nào cả: muốn vào channel, admin của channel
phải mời email đó (xem [portal-app.md](portal-app.md), mục Channel).

## 1. Bố cục

| ID | Phần tử |
| --- | --- |
| `title`, `intro` | Tiêu đề và câu giới thiệu, đổi theo tab |
| `tabIn` / `tabUp` | Hai tab (`role="tab"`) |
| `loginForm` | `email` (`autocomplete=username`), `password` (`current-password`), `submitBtn` |
| `signupForm` | `suName`, `suEmail`, `suPassword`, `suConfirm` (`new-password`), `suBtn` |
| `googleBtn` | Continue with Google |
| `msg` | Vùng thông báo (`.err` khi lỗi) |
| `foot` | Dòng gợi ý chuyển tab |

**Hai form tách riêng là có chủ đích.** Password manager duyệt `form.elements`. Nếu
`current-password` và `new-password` nằm chung một form, Chrome sẽ hiểu đó là form đổi mật
khẩu và không tự điền.

## 2. Chức năng

### 2.1 Chuyển tab Sign in ↔ Sign up

[`setMode(m)`](../../apps/portal/login.html#L114) bật/tắt hai form, đổi tiêu đề, intro và
footer, cập nhật `aria-selected`.

- Email đã gõ ở form này được mang sang form kia nếu ô bên kia đang trống.
- Chỉ focus `suName` khi sang Sign up. Không bao giờ focus form Sign in, vì Chrome đang tự
  điền vào đó và focus có thể làm mất phần đã điền.

### 2.2 Đăng nhập bằng email + mật khẩu

Handler submit `loginForm` ([dòng 197](../../apps/portal/login.html#L197)):

1. Cờ `busy` chặn gửi trùng. [`working(true,'Signing in…')`](../../apps/portal/login.html#L180)
   khoá nút.
2. Gọi `HNA.auth.signIn(email, password)`, tức `supabase.auth.signInWithPassword`
   ([supa.js:205](../../apps/portal/assets/supa.js#L205)).
3. Thành công thì [`land(text)`](../../apps/portal/login.html#L191) hiện *"Signed in ✓"* và
   **đợi 700ms** rồi mới `location.replace('app.html')`, để password manager kịp hỏi có lưu
   mật khẩu không.
4. Lỗi thì [`explain(err)`](../../apps/portal/login.html#L160) dịch thông báo của Supabase sang
   câu dễ hiểu.

**Đăng nhập không áp quy tắc mật khẩu**, để tài khoản tạo trước khi quy tắc ra đời vẫn vào được.

### 2.3 Tạo tài khoản

Handler submit `signupForm` ([dòng 214](../../apps/portal/login.html#L214)):

1. Kiểm tra tên, email (regex `EMAIL`), quy tắc mật khẩu và hai mật khẩu có khớp nhau không.
2. Gọi `HNA.auth.signUp(email, pw, name)`. Tên được lưu vào `user_metadata.full_name`, và
   `emailRedirectTo` là `ROOT + 'login.html'` ([supa.js:217](../../apps/portal/assets/supa.js#L217)).
3. Supabase không trả session (dự án đang bật *Confirm email*) thì chuyển về tab Sign in,
   điền sẵn email/mật khẩu và báo *"open the confirmation link we just emailed you"*.
4. Có session thì `land()` chuyển vào app.

**Quy tắc mật khẩu** ([`PW_RULES`, `pwProblem`](../../apps/portal/login.html#L147)): ít nhất
6 ký tự, có một chữ hoa và một ký tự đặc biệt. Đây là cùng bộ quy tắc với `tagger/auth.html`.

### 2.4 Continue with Google

Handler click `googleBtn` ([dòng 283](../../apps/portal/login.html#L283)):

1. [`gWorking(true)`](../../apps/portal/login.html#L259) khoá nút. Nút này có công tắc riêng,
   không dùng chung với `working()`.
2. `HNA.auth.signInWithGoogle()` chỉ **trả về URL** (`skipBrowserRedirect:true`,
   `prompt=select_account`, `redirectTo = ROOT+'login.html'`).
3. [`alive(url)`](../../apps/portal/login.html#L271) hỏi trước xem provider có bật không,
   giới hạn chờ 1200ms (`PREFLIGHT_MS`). Chỉ khi nhận được câu trả lời đọc được kiểu *"provider
   is not enabled"* thì mới dừng lại.
4. Ghi breadcrumb `localStorage['hna.oauth.home']='login.html'`, rồi `location.assign(url)`.
5. Khi quay về, đoạn *on load* (mục 2.5) hoàn tất phiên.

Ghi chú: đăng nhập Google lần đầu sẽ tự tạo tài khoản. Tài khoản Google mang theo tên và ảnh
đại diện, hiện trên header của app.

### 2.5 Khi tải trang

[Dòng 304](../../apps/portal/login.html#L304):

- `HNA.auth.session()`: supabase-js đọc token trên URL (hash hoặc `?code=`) khi quay về từ
  link xác nhận hoặc từ Google. Có phiên thì `location.replace('app.html')`.
- URL có `error_description=` hoặc `error=` (link hết hạn, đã dùng, hoặc người dùng huỷ
  Google) thì hiện lý do qua `explain()`.

### 2.6 Dịch thông báo lỗi

[`explain(err)`](../../apps/portal/login.html#L160) đổi thông báo kỹ thuật sang câu cho người dùng:

| Supabase/Google trả về | Người dùng thấy |
| --- | --- |
| `invalid login` | Email và mật khẩu không khớp |
| `email not confirmed` | Hãy mở link xác nhận |
| `already registered` | Email đã có tài khoản, hãy chọn Sign in |
| `password … weak` | Mật khẩu yếu, kèm phần còn thiếu theo quy tắc |
| `failed to fetch` | Không kết nối được server |
| `rate limit` | Thử quá nhiều lần |
| `provider is not enabled` | Google chưa được bật |
| `access_denied` | Đã huỷ đăng nhập Google |
| `bad_oauth_state` | Quá lâu, hoặc đã hoàn tất ở tab khác |
| `identity is already linked` | Tài khoản Google này đã thuộc về tài khoản khác |

## 3. Dữ liệu

| Nơi | Khoá | Đọc/Ghi | Mục đích |
| --- | --- | --- | --- |
| localStorage | `sb-xtzmtdcohoixoxqusyyz-auth-token` (supabase-js) | Ghi | Phiên đăng nhập của portal |
| localStorage | `hna.oauth.home` | Ghi | Breadcrumb trước khi sang Google |
| Supabase Auth | `signInWithPassword`, `signUp`, `signInWithOAuth` | | |

Trang không đọc bảng nào. Việc nhận lời mời vào channel (`rpc claim_club_invites`) do
`app.js` làm sau khi vào app.

## 4. Cấu hình bắt buộc (dashboard Supabase)

`login.html` phải có trong **Authentication → Redirect URLs** (wildcard `https://hoangnams.com/**`).
Thiếu nó thì Supabase rơi về Site URL, và lúc đó chỉ còn mục 2.1 của
[portal-landing.md](portal-landing.md) cứu được.

## 5. Lưu ý khi sửa

- `app.css` được nạp ở login, app và guide. Bump `?v=` thì phải bump trên cả ba trang.
- Test: `tests/client-signup.test.js`, `tests/auth-gate.test.js` (quy tắc mật khẩu dùng chung).
