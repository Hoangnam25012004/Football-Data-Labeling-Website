# Tagger: Đăng nhập analyst (auth) và cổng đăng nhập

| | |
| --- | --- |
| URL live | `https://hoangnams.com/tagger/auth`. Bản sao ở `https://hoangnams.com/auth` giữ cho link trong email xác nhận cũ. GitHub Pages phục vụ `auth.html` dưới URL không đuôi. |
| File nguồn | [`apps/tagger/auth.html`](../../apps/tagger/auth.html) (trang, JS inline từ [dòng 150](../../apps/tagger/auth.html#L150)) · [`apps/tagger/auth.js`](../../apps/tagger/auth.js) (`window.PTAuth`, cổng chạy trên **mọi** trang của tagger) |
| Script | `supabase-js@2`, `auth.js?v=1` |
| Người dùng | Analyst của HoangNam Analytics |
| Design doc | [`google-sign-in-design.md`](../design/google-sign-in-design.md) |

Doc này gồm hai phần gắn liền nhau:

- **`auth.js` là cổng (gate).** Mọi trang tagger (`index.html`, `Stats/`, `Player-Lists/`) đều
  nạp nó. Chưa có tài khoản thì nó thay trang bằng màn hình đăng nhập.
- **`auth.html` là màn hình đăng nhập/đăng ký.**

Cổng chỉ phục vụ trải nghiệm người dùng, **không phải ranh giới bảo mật**, vì file của site là
public. Dữ liệu được bảo vệ bằng RLS của Supabase.

## 1. Cổng đăng nhập: `auth.js` (`window.PTAuth`)

| Function | Chức năng |
| --- | --- |
| [`config`](../../apps/tagger/auth.js#L43) | URL và key của Supabase: lấy từ `pitchtagger.cloud.cfg` nếu có, không thì dùng `CONFIG` mặc định |
| [`tokenKeys`](../../apps/tagger/auth.js#L54) / [`storedSession`](../../apps/tagger/auth.js#L63) | Đọc **đồng bộ** phiên mà supabase-js đã lưu (`sb-<ref>-auth-token`, dạng JSON thường hoặc `base64-…`), không cần chờ SDK |
| [`user`](../../apps/tagger/auth.js#L82) | Người dùng hiện tại. **Phiên anonymous không tính là tài khoản** (cloud-sync tự tạo phiên anon để chạm DB). **Không kiểm tra hạn token**, vì client sẽ tự làm mới khi tải. |
| [`displayName`](../../apps/tagger/auth.js#L86) | Tên hiển thị, dùng trong menu ▾ Other |
| [`here`](../../apps/tagger/auth.js#L97) / [`nextUrl`](../../apps/tagger/auth.js#L100) | Nhớ trang vừa bị chặn, kể cả hash (vd. `…/#match=12345`), và sau khi đăng nhập thì quay lại đúng trang đó. `next` **không được** trỏ ra ngoài site, để chống open redirect. |
| [`authCallback`](../../apps/tagger/auth.js#L121) | Token rơi vào trang app thay vì `/auth` thì chuyển chúng sang `/auth` để xử lý |
| [`requireLogin`](../../apps/tagger/auth.js#L128) | Cổng: chưa có tài khoản thì `location.replace(AUTH_URL?next=…)`. Chạy khi script tải, trừ khi đang ở chính trang auth. |
| [`watchSignOut`](../../apps/tagger/auth.js#L139) | Nghe sự kiện `storage`: tab khác đăng xuất hoặc localStorage bị xoá thì tab này cũng về trang auth |
| [`signOut`](../../apps/tagger/auth.js#L147) | `supabase.auth.signOut()`, xoá mọi khoá token rồi về trang auth. Đăng xuất ở mọi tab. **Không xoá dữ liệu đã tag.** |

`ROOT` được suy ra từ `document.currentScript.src`, nhờ vậy cổng chạy đúng khi tagger nằm dưới
`/tagger/`, khi trang con nạp nó qua `../auth.js`, và khi chạy local. Chạy local thì cổng mở
`auth.html` theo tên file, vì chỉ GitHub Pages mới hiểu `/auth`.

API công khai: `{ config, user, displayName, signOut, requireLogin, nextUrl, authUrl, appUrl }`.

## 2. Màn hình đăng nhập: `auth.html`

### 2.1 Bố cục

| ID | Phần tử |
| --- | --- |
| `tabIn` / `tabUp` | Tab Sign in / Sign up |
| `signInForm` | `siEmail` (`username`), `siPassword` (`current-password`), `siSubmit` |
| `signUpForm` | `suName`, `suEmail`, `suPassword`, `suConfirm` (`new-password`), `suSubmit` |
| `googleBtn` | Continue with Google |

Hai `<form>` tách riêng để password manager nhận ra form đăng nhập (giống `login.html` của portal).

### 2.2 Chức năng

| Chức năng | Function | Hành vi |
| --- | --- | --- |
| Supabase client | [`client`](../../apps/tagger/auth.html#L159) | Client thật duy nhất của site để đăng nhập, lưu phiên dưới khoá mặc định |
| Chuyển tab | [`setMode`](../../apps/tagger/auth.html#L225) | Form bị ẩn vẫn giữ giá trị; email được mang sang form kia |
| Thông báo | [`say`](../../apps/tagger/auth.html#L164), [`working`](../../apps/tagger/auth.html#L169) | Hiện trạng thái, khoá nút khi đang chạy |
| Quy tắc mật khẩu | [`pwProblem`](../../apps/tagger/auth.html#L186) | Ít nhất 6 ký tự, có một chữ hoa và một ký tự đặc biệt. Chỉ áp dụng khi **đăng ký**. |
| Dịch lỗi | [`explain`](../../apps/tagger/auth.html#L245) | Đổi thông báo của Supabase/Google sang câu dễ hiểu |
| Lưu mật khẩu | [`remember`](../../apps/tagger/auth.html#L206) | `navigator.credentials.store(new PasswordCredential(...))` để Chrome/Edge hỏi "Save password?" ngay |
| Nhớ email | `rememberEmail` / [`lastEmail`](../../apps/tagger/auth.html#L220) | `localStorage['pitchtagger.auth.email']`, **chỉ lưu email, không bao giờ lưu mật khẩu**. Chỉ điền lại khi trình duyệt không tự điền. |
| Vào app | [`land`](../../apps/tagger/auth.html#L417) | Kiểm tra trình duyệt có giữ được phiên không (chế độ riêng tư có thể chặn), hiện *"Signed in ✓"*, **giữ trang `SETTLE_MS` = 1200ms** rồi [`go()`](../../apps/tagger/auth.html#L175) tới `nextUrl()`. Đã có phiên sẵn thì vào luôn, không chờ. |
| Google | [`gWorking`](../../apps/tagger/auth.html#L351), [`providerEnabled`](../../apps/tagger/auth.html#L367) | Hỏi trước xem provider có bật không. Ghi breadcrumb `hna.oauth.home = 'tagger/auth'` rồi chuyển sang Google. |

**Vì sao phải giữ trang 1200ms:** đo trên trang thật, khoảng từ lúc submit tới lúc rời trang
chỉ 22ms, quá ngắn để trình duyệt kịp hỏi lưu mật khẩu.

### 2.3 Khi tải trang (`boot`, [dòng 432](../../apps/tagger/auth.html#L432))

1. `getSession()` đọc token trên URL (khi quay về từ link xác nhận hoặc Google) hoặc phiên cũ.
2. Có phiên của **tài khoản thật** thì `land()` vào luôn, không hiện màn hình đăng nhập.
3. Có phiên **anonymous** thì đăng xuất nó, cho sạch trước khi đăng nhập.
4. URL có `error_description` hoặc `error` thì hiện lý do.
5. Không gọi `focus()`. Đợi 600ms, nếu trình duyệt không tự điền thì điền email đã nhớ.

## 3. Dữ liệu

| Nơi | Khoá | Mục đích |
| --- | --- | --- |
| localStorage | `sb-xtzmtdcohoixoxqusyyz-auth-token` | Phiên. Tồn tại cho tới khi bấm ⎋ Sign out, kể cả khi đóng trình duyệt hay tắt máy. |
| localStorage | `pitchtagger.auth.email` | Email đăng nhập gần nhất |
| localStorage | `pitchtagger.cloud.cfg` | URL và key tuỳ chỉnh (nếu analyst đã nhập trong ☁ Cloud) |
| localStorage | `hna.oauth.home` | Breadcrumb OAuth |

## 4. Cấu hình bắt buộc (dashboard Supabase)

- **Redirect URLs** phải chứa `https://hoangnams.com/**`, URL github.io cũ và
  `http://localhost:8765/**`.
- *Confirm email* đang bật: tài khoản mới phải bấm link trong email mới dùng được.
- *Allow anonymous sign-ins* phải bật để cloud-sync chạy được, nhưng phiên anon không bao giờ
  mở được cổng.

## 5. Lưu ý khi sửa

- Sửa `auth.js` thì phải bump `auth.js?v=` ở `index.html`, `auth.html`, `Stats/index.html` và
  `Player-Lists/index.html`.
- `deploy.yml` copy `auth.html` và `auth.js` hai lần: vào `/tagger/` và ra gốc site.
- Test: `tests/auth-gate.test.js`. Test này kiểm tra ai được vào, phiên anon, phiên hết hạn,
  `next` không tạo open redirect, quy tắc mật khẩu, và việc trang không còn tiếng Việt.
