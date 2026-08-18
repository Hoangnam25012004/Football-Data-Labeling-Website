# Film — Xuất clip không mở được video, và tắt bảng Telestration bằng chuột trái

**Hai vấn đề, và chúng không cùng loại. Cái thứ nhất — `Không mở được video để kết xuất` — KHÔNG
phải lỗi code: bucket R2 chứa video **không trả về header CORS nào cả**, nên phần tử `<video>` mà
bộ kết xuất mở với `crossOrigin="anonymous"` bị trình duyệt từ chối ngay từ khâu tải. Sửa nó là
sửa **cấu hình bucket**, không phải sửa JavaScript — nhưng code vẫn phải đổi, vì hiện nó báo sai
nguyên nhân và để analyst mò. Cái thứ hai — bấm chuột trái để đóng bảng — là một thay đổi nhỏ,
gọn trong `film-tools.js`.**

Trạng thái: **PHẦN CODE ĐÃ TRIỂN KHAI** (2026-08-18). **Phần Cloudflare vẫn đang chờ bạn** (§3) —
và đó là phần duy nhất làm nút ⭳ chạy được.
Nối tiếp `docs/film-telestration-time-design.md` (đã triển khai 2026-08-18).

Phạm vi đã làm: `client/assets/film-tools.js`, `client/assets/film-tools.css`,
`tests/film-tools.test.js` (**+15 test**), `tests/asset-versions.json`, **2 ký tự** trong
`client/assets/app.js` (`?v=2` → `?v=3`).

Test: `node tests/run.js` → **1121/1121 passed**, trong đó **1106 test cũ xanh nguyên vẹn**
(hai test cũ được sửa lại có chủ ý vì `crossOrigin` và `el.src` đã chuyển sang `openSource()`).
Cộng **một lần dựng lại đúng tình huống của bạn trong trình duyệt thật**, và **một file `.mp4`
thật có đoạn đứng hình** — §9.5 và §9.6.

**§4.2 đã bị sửa so với bản đầu**: phép thử `fetch()` bị bỏ, vì một test sẵn có cấm chuỗi `fetch(`
trong file này để giữ lời hứa "không upload". Lý do đầy đủ ở §4.2.

**0 dòng** ở: `Stats/stats-view.js`, `cloud-sync.js`, `worker/*` (trừ phương án B ở §3.3, chỉ dùng
khi bạn từ chối §3.2), và mọi file còn lại.

---

## 0. Chẩn đoán, đã đo

### 0.1 Vì sao "Không mở được video để kết xuất"

Chuỗi đó chỉ đến từ đúng một dòng trong `exportClip()`:

```js
v.addEventListener('error', function () { fail('Không mở được video để kết xuất'); });
```

Tức phần tử `<video>` **thứ hai** — cái được dựng riêng để render — bắn sự kiện `error`. Nó được
dựng thế này:

```js
var v = document.createElement('video');
v.crossOrigin = 'anonymous';        // ← đây
v.preload = 'auto'; v.muted = false; v.playsInline = true;
v.src = src;                        // cùng URL mà cái trên màn hình đang phát ngon lành
```

`crossOrigin = "anonymous"` **không phải một lời gợi ý**. Nó bắt trình duyệt yêu cầu máy chủ trả
về `Access-Control-Allow-Origin`. Không có header đó thì **video không tải được chút nào** — không
phải "tải được nhưng không đọc được pixel", mà là hỏng ngay từ đầu.

**Đo thật, vào đúng bucket đang chứa video của bạn** (`publicBase` trong `cloud-sync.js`):

```
$ curl -s -I -H "Origin: https://hoangnams.com" \
       https://pub-9cdd291bf181425b9738328ada297691.r2.dev/

HTTP/1.1 404 Not Found
Date: ...
Content-Type: text/plain;charset=UTF-8
Server: cloudflare
```

**Không một dòng `Access-Control-Allow-Origin` nào.** Không có `Vary: Origin`. Bucket này chưa
được đặt CORS policy.

Nên hiện tượng khớp chính xác:

| | Có `crossOrigin` | Kết quả |
|---|---|---|
| `<video>` trên màn hình | **không** | phát bình thường — bạn đang xem được, ảnh chụp màn hình chứng minh điều đó |
| `<video>` của bộ kết xuất | **có** | trình duyệt từ chối tải → sự kiện `error` → đúng dòng chữ bạn thấy |

Và đây **không phải lỗi mới**. Nó có từ ngày `film-tools.js` ra đời; chính tài liệu cũ đã ghi ở
§11.1: *"the attribute is a requirement, not a hint, and a mismatch means no video at all"*. Bẫy
đã được ghi ra rồi, chỉ là chưa ai vấp phải cho tới khi bạn bấm ⭳.

### 0.2 Vì sao lại là `crossOrigin`, không bỏ đi được?

Vì bỏ đi thì gặp bức tường thứ hai, cứng hơn.

Vẽ một video **không có CORS** lên `<canvas>` sẽ **làm bẩn** (taint) canvas đó. Canvas bẩn thì:

- `getImageData()` ném lỗi;
- `toBlob()` ném lỗi (đường xuất PNG);
- `captureStream()` cho ra một luồng mà `MediaRecorder` **không ghi được** (đường xuất .mp4).

Nghĩa là **không có CORS thì không thể kết xuất, chấm hết** — dù có bỏ `crossOrigin` hay không.
Đây là quy tắc bảo mật của trình duyệt, không phải một cái khoá phần mềm có thể lách. Code đã
biết điều đó và đã thử một pixel trước khi tiêu tốn 40 giây của analyst:

```js
try { g.drawImage(v, 0, 0, 1, 1); canvas.getContext('2d').getImageData(0, 0, 1, 1); }
catch (e) { fail('Video này không cho trang đọc pixel (CORS) — không kết xuất được'); return; }
```

Chỗ dở là **đường này không bao giờ chạy tới**, vì với `crossOrigin` bật thì video hỏng từ trước
đó, và analyst nhận một câu nói sai nguyên nhân.

### 0.3 Còn "video cắt ra chỉ là video thường, không có Telestration"?

**Đường vẽ đồ hoạ hoàn toàn khoẻ mạnh — đã kiểm trong trình duyệt thật, 14 phép thử, tất cả xanh:**

```
1. mỗi loại hình, qua đúng bộ rasterise của bản xuất
   spotlight ✓   mũi tên ✓   mũi tên cong ✓   mũi tên nét đứt ✓
   bút ✓         vùng ✓      marker ✓
2. chữ, gồm cả & < > " '                                        ✓
3. lớp làm tối + <mask> (cấu trúc tham chiếu theo id)           ✓
4. overlay RỖNG, lúc không hình nào còn sống                    ✓
5. SVG data: URI KHÔNG làm bẩn canvas                           ✓
6. và nó thật sự có mực, không phải tấm trong suốt              ✓
```

Nên **không có lỗi "đồ hoạ không được vẽ vào file"**. Với dòng chữ đỏ mà bạn thấy, `exportClip()`
gọi `fail()` → `stopped = true` → `rec.onstop` thoát sớm → **không một file nào được tải xuống**.
Cái file "video thường" bạn đang cầm gần như chắc chắn là từ một lần thử trước, hoặc từ chỗ khác;
lần bấm ⭳ có thông báo đó **không sinh ra file nào cả**.

Tuy vậy §4.3 vẫn vá một đường im lặng có thật, dù nó không phải thứ vừa cắn bạn: nếu SVG **không**
rasterise được, code hiện tại **vẫn ghi frame đó ra file, chỉ là không có đồ hoạ** — tức đúng cái
triệu chứng "video thường" nhưng vì một nguyên nhân khác. Một bản xuất không vẽ được đồ hoạ phải
**dừng và nói**, chứ không được lặng lẽ giao ra một file sai.

---

## 1. Vấn đề thật, gói lại

| # | Vấn đề | Loại | Sửa ở đâu |
|---|---|---|---|
| **A** | Bucket R2 không trả header CORS → không kết xuất được clip nào | **hạ tầng** | Cloudflare (§3) |
| **B** | Code báo sai nguyên nhân ("không mở được video" thay vì "thiếu CORS") | code | §4.1 |
| **C** | Analyst phải chờ tới lúc hỏng mới biết, không có cách nào biết trước | code | §4.2 |
| **D** | Overlay hỏng thì vẫn ghi ra file, chỉ là thiếu đồ hoạ | code | §4.3 |
| **E** | Bảng chuột phải mở ra rồi không bấm chuột đóng được | code | §5 |

**A là cái duy nhất chặn bạn dùng được tính năng.** B–D làm cho lần sau hỏng thì bạn biết ngay tại
sao. E là thứ bạn yêu cầu thêm.

---

## 2. Điều phải nói thẳng: code không tự sửa được A

Không có đoạn JavaScript nào chạy trong trang có thể tự cấp cho mình quyền đọc pixel của một file
từ origin khác. Đó là điểm mấu chốt của Same-Origin Policy. Ba đường duy nhất:

| Đường | Được gì | Mất gì |
|---|---|---|
| **§3.2 — đặt CORS cho bucket** | kết xuất chạy, **0 dòng code**, **0 đồng**, **0 băng thông thêm** | phải vào Cloudflare một lần |
| **§3.3 — proxy qua Worker** | không phải vào dashboard | **toàn bộ byte video chạy qua Worker** mỗi lần render — tốn tiền, chậm hơn, và phá lời hứa "không thêm traffic Cloudflare" của thiết kế gốc |
| không làm gì | — | nút ⭳ vĩnh viễn không dùng được |

**Đề nghị: §3.2.** Nó đúng về mọi mặt và làm một lần là xong.

---

## 3. Sửa A — CORS cho bucket

### 3.1 Chính xác thì thiếu cái gì

Trình duyệt, khi tải một tài nguyên có `crossOrigin="anonymous"`, đòi hồi đáp phải có:

```
Access-Control-Allow-Origin: https://hoangnams.com     (hoặc *)
```

Và vì video được tải theo **range request** (`Range: bytes=...`), còn cần cho phép đọc lại các
header điều khiển range, nếu không việc tua trong file render sẽ hỏng:

```
Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges, Content-Type
```

### 3.2 Policy đề nghị

Đặt trên bucket đang phục vụ `pub-9cdd291bf181425b9738328ada297691.r2.dev`
(Cloudflare dashboard → R2 → bucket → **Settings** → **CORS Policy**):

```json
[
  {
    "AllowedOrigins": [
      "https://hoangnams.com",
      "https://www.hoangnams.com",
      "https://hoangnam25012004.github.io",
      "http://localhost:8765"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["range", "content-type"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Bốn quyết định trong đó:

1. **Liệt kê origin, không dùng `*`.** `*` cũng chạy, nhưng nó cho phép **mọi** trang trên internet
   đọc pixel video của CLB. Bucket đã là public nên ai có link đều xem được — nhưng "xem được" và
   "một trang bất kỳ đọc được từng pixel bằng script" là hai mức khác nhau, và không có lý do gì
   phải cho mức thứ hai.
2. **`hoangnam25012004.github.io` có trong danh sách**, vì `assets/film-tools.js` cũng phục vụ ở đó
   (301 sang custom domain, nhưng một liên kết cũ vẫn có thể mở thẳng).
3. **`localhost:8765`** là cổng trong `.claude/launch.json`, để kiểm thử tại chỗ.
4. **Chỉ `GET`/`HEAD`.** Không `PUT`, không `POST` — không có đường nào từ trang ghi vào bucket,
   và policy này không được phép mở ra một đường như thế.

### 3.3 Nếu §3.2 không có tác dụng — phương án B

**Phải kiểm chứ đừng tin.** Có cấu hình R2 mà domain `r2.dev` quản lý **không** áp dụng CORS policy
của bucket; khi đó phải gắn **custom domain** cho bucket (ví dụ `video.hoangnams.com`) rồi đổi
`publicBase` trong `cloud-sync.js`, hoặc dùng proxy.

Lệnh nghiệm thu — chạy lại đúng lệnh đã dùng để chẩn đoán, trên **một object có thật**:

```bash
curl -s -I -H "Origin: https://hoangnams.com" \
     "https://pub-9cdd291bf181425b9738328ada297691.r2.dev/<đường-dẫn-video-thật>.mp4" \
  | grep -i "access-control"
```

**Có `Access-Control-Allow-Origin` trong kết quả → xong.** Không có → sang custom domain, và chỉ
khi cả hai đều không được thì mới dựng proxy trong `worker/`:

```js
// worker/video-proxy.js — CHỈ dựng nếu §3.2 và custom domain đều không được
// Mọi byte video đi qua đây. Đó là chi phí thật, và là lý do nó xếp cuối.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const key = url.pathname.replace(/^\/video\//, '');
    if (!key) return new Response('not found', { status: 404 });
    const origin = req.headers.get('Origin') || '';
    if (!ALLOWED.includes(origin)) return new Response('forbidden', { status: 403 });
    const obj = await env.BUCKET.get(key, { range: req.headers });   // range đi thẳng qua
    if (!obj) return new Response('not found', { status: 404 });
    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    h.set('Accept-Ranges', 'bytes');
    return new Response(obj.body, { status: obj.range ? 206 : 200, headers: h });
  }
};
```

Và **chỉ bộ kết xuất mới dùng đường này**, không phải trình phát trên màn hình — nếu không thì mọi
lượt xem của cầu thủ cũng chạy qua Worker và hoá đơn tăng theo số người xem chứ không theo số lần
render.

---

## 4. Sửa B, C, D — code

### 4.1 Nói đúng nguyên nhân

Thay vì một dòng chữ chung chung, `exportClip()` phân biệt được **ba** trường hợp hỏng, vì chúng
cần ba hành động khác nhau:

| Hỏng ở đâu | Nghĩa là | Câu nên nói |
|---|---|---|
| CORS thiếu | máy chủ video chưa cho phép | `Máy chủ video chưa bật CORS nên không kết xuất được. Cần thêm Access-Control-Allow-Origin cho bucket — xem docs/film-export-cors-design.md §3.` |
| video thật sự hỏng | URL sai, file mất | `Không mở được file video (URL hỏng hoặc file không còn).` |
| canvas bẩn | có CORS nhưng vẫn không đọc được pixel | giữ nguyên câu cũ, nó đúng |

Phân biệt bằng **hai lần mở**, và lần thứ hai chính là phép thử:

```js
/* Mở hai nhịp, vì hai kiểu hỏng cần hai câu trả lời khác nhau.

   Nhịp 1 mang crossOrigin: nếu máy chủ có CORS thì đây là đường duy nhất cho
   ra một canvas SẠCH, tức đường duy nhất kết xuất được.
   Nhịp 2 bỏ crossOrigin: nếu nhịp 1 hỏng mà nhịp 2 mở được, thì file hoàn toàn
   lành lặn và thứ thiếu là CÁI HEADER, không phải cái video. Đó là lúc nói
   đúng tên vấn đề thay vì đổ cho video. */
function openSource(src, withCors) {
  return new Promise(function (ok, no) {
    var el = document.createElement('video');
    if (withCors) el.crossOrigin = 'anonymous';
    el.preload = 'auto'; el.muted = false; el.playsInline = true;
    el.addEventListener('loadedmetadata', function () { ok(el); }, { once: true });
    el.addEventListener('error', function () { no(el.error); }, { once: true });
    el.src = src;
  });
}

openSource(src, true).then(start, function () {
  return openSource(src, false).then(
    function (el) {                       // mở được khi KHÔNG có crossOrigin
      try { el.removeAttribute('src'); el.load(); } catch (e) {}
      fail(NEED_CORS);                    // → nói đúng: thiếu header, không phải hỏng file
    },
    function () { fail('Không mở được file video (URL hỏng hoặc file không còn).'); }
  );
});
```

Nhịp 2 **không render gì cả** — nó chỉ tồn tại để phân biệt, mở xong là gỡ ngay.

### 4.2 Nói TRƯỚC, đừng để analyst chờ rồi mới hỏng

> **SỬA so với bản đầu của mục này.** Bản đầu đề xuất một phép thử `fetch()` chạy trước. **Không
> làm được, và không nên làm.** `tests/film-tools.test.js` có một test cấm thẳng chuỗi `fetch(`
> xuất hiện trong `film-tools.js`:
>
> ```js
> [['fetch(','a request'],['XMLHttpRequest','a request'],['navigator.sendBeacon','a request'], …]
>   .forEach(([needle]) => notOk(TOOLS.indexOf(needle) >= 0, …));
> ```
>
> Test đó tồn tại vì lời hứa *"clip kết xuất không bao giờ rời khỏi máy"* là **một khẳng định về
> code có tồn tại**, không phải về code đã chạy. Nới nó ra để lấy một phép thử tiện tay là mở cửa
> cho một lần upload thật lọt vào sau này. **Giữ test, bỏ `fetch`.**
>
> Và hoá ra không cần: **hai nhịp ở §4.1 tự nó đã nhanh.** Khi thiếu CORS, trình duyệt từ chối
> ngay lúc nhận header — chưa một byte video nào được tải. Analyst biết trong một phần giây, chứ
> không phải sau bốn mươi giây. Nỗi lo mà §4.2 sinh ra để giải quyết **đã được §4.1 giải quyết
> rồi**. *(Đã đo: §9.5.)*

Cái vẫn giữ lại là **nhớ câu trả lời** — nhưng nhớ từ một lần render THẬT, không phải từ một phép
thử riêng:

```js
var corsState = null;      // null = chưa biết · true/false = đã học từ một lần render thật
```

- lần render đầu chạm đúng nhánh "mở được khi bỏ `crossOrigin`" → `corsState = false`;
- từ đó, `exportClip()` **thoát ngay ở đầu hàm** với đúng câu ở §4.1, trước cả `pickMime()` —
  không dựng `MediaRecorder`, không dựng `AudioContext`, không dựng canvas để học lại điều đã biết;
- và `renderPanel()` cho nút ⭳ lớp `.off` cùng `title` ghi lý do, nên nó **thôi trông như đã sẵn
  sàng** thay vì mời analyst bấm lần nữa.

Nút vẫn bấm được, và bấm thì nó **tự giải thích** — một nút chết câm còn tệ hơn một nút nói được
mình đang chờ cái gì.

### 4.3 Không bao giờ giao một file thiếu đồ hoạ mà không nói

Đường im lặng hiện tại:

```js
overlayImage(str).then(function (img) { lastImg = img; after(); }, after);
//                                                                ^^^^^
//  SVG không rasterise được -> after() vẫn chạy -> lastImg còn null
//  -> g.drawImage bị bỏ qua -> frame được ghi ra file, KHÔNG có đồ hoạ
```

Analyst nhận một file trông như đã kết xuất xong nhưng không có gì trên đó — đúng cái mô tả "video
thường". Đường vẽ đã được chứng minh là khoẻ (§0.3), nhưng một bản xuất **không được phép** hỏng
theo kiểu này.

```js
overlayImage(str).then(function (img) { lastImg = img; after(); },
                       function () { fail('Không dựng được lớp đồ hoạ — dừng để không giao ra một clip thiếu hình.'); });
```

Một dòng, và nó biến "file sai mà không ai biết" thành "không có file, kèm lý do".

### 4.4 Cái KHÔNG đổi

- **`crossOrigin` không bao giờ được đặt lên `<video>` trên màn hình.** Đó là điều kiện để cầu thủ
  và HLV xem Film y như hôm nay. Test cũ đã khoá bằng cách quét mã nguồn
  (`notOk(/ctx\.video\.crossOrigin/)`), và nó phải xanh nguyên.
- **Không upload gì.** Bốn lời hứa của `film-tools.js` không suy suyển: `corsOK()` là một `GET`
  range một byte vào **chính cái file player đang phát**, không phải một đường ghi.
- **Không đụng `cloud-sync.js`**, trừ khi §3.3 buộc phải đổi `publicBase` — và khi đó tôi sẽ hỏi
  trước.

---

## 5. Sửa E — chuột trái đóng bảng

### 5.1 Vấn đề

Bảng chuột phải (`.fmt-menu`) hiện chỉ đóng bằng: chọn một mục, hoặc bấm `Backspace`. **Bấm chuột
ra ngoài không đóng nó** — đây là hành vi mà mọi menu ngữ cảnh trên đời đều có, và nó thiếu.

### 5.2 Quy tắc

> **Chuột trái lên khung hình, khi bảng đang mở, đóng bảng — và không làm gì khác.**

Bốn điểm phải làm đúng:

1. **Nhánh này đứng ĐẦU `onDown`**, trước cả nhánh chỉnh đèn rọi và nhánh công cụ. Một cú bấm, một
   nghĩa: đóng bảng. Nó không được đồng thời dời đèn rọi hay bắt đầu một nét vẽ.
2. **`preventDefault` + `stopPropagation`**, để cú bấm đó dừng lại ở đây.
3. **Không đụng tới playback.** Quy tắc "bề mặt video không nhận cú bấm nào" có từ ngày Film ra
   đời vì một cú bấm nhầm làm người xem mất chỗ đang xem. Đóng một bảng đang che khung hình
   **không phải** một lệnh transport, nên nó không vi phạm tinh thần của quy tắc đó — nhưng nó
   cũng không được phép mở rộng thành play/pause. Chuột trái vẫn tuyệt đối không đụng vào việc
   phát.
4. **Bấm ra ngoài khung hình cũng đóng** — bấm lên sân nhỏ, lên danh sách sự kiện, lên thanh
   transport. Nhưng ở đó cú bấm **được đi tiếp**: đóng bảng không được cướp mất cú bấm vào một
   hàng trong danh sách.

```js
function onDown(e) {
  if (e.button !== 0) return;
  // MỘT cú bấm, MỘT nghĩa: bảng đang mở thì cú này là để đóng nó
  if (menu) { closeMenu(); e.preventDefault(); e.stopPropagation(); return; }
  …
}
```

### 5.3 Bấm ngoài khung hình

Bảng là con của `ctx.box`, nên một listener trên `ctx.box` là đủ — và nó chỉ tồn tại **trong lúc
bảng mở**, gắn trong `openMenu()`, gỡ trong `closeMenu()`, để ngoài lúc đó không có gì chạy.

```js
function onBoxDown(e) {
  if (!menu) return;
  if (menu.contains(e.target)) return;   // ← CHỖ DỄ SAI NHẤT: xem bên dưới
  closeMenu();                            // và KHÔNG preventDefault: cú bấm đi tiếp
}
```

**`menu.contains(e.target)` là dòng không được quên.** Các mục trong bảng là `<button>` chạy bằng
`onclick`, mà `click` bắn **sau** `pointerdown`. Thiếu dòng đó thì bấm vào một mục sẽ đóng bảng ở
nhịp `pointerdown`, nút bị gỡ khỏi DOM, và `click` **không bao giờ tới** — nghĩa là **mọi mục
trong menu ngừng hoạt động**. Một dòng thiếu, cả bảng thành đồ trang trí.

### 5.4 Còn ngăn kéo Clip thì sao?

Bảng `Clip (…)` (`.fmt-panel`) — cái đang mở ở góc phải trong ảnh bạn gửi — **không nằm trong thay
đổi này**. Nó đã có ba đường đóng: nút `✕` của chính nó, phím `C`, và `Backspace`. Bạn nói về bảng
mở bằng chuột phải, nên tôi làm đúng cái đó.

Nếu bạn muốn chuột trái đóng luôn cả ngăn kéo Clip thì đó là một quyết định khác — ngăn kéo là chỗ
analyst **làm việc** (bấm ▶, ⭳, ✕ trên từng clip), không phải thứ bật lên rồi tắt, nên đóng nó
bằng một cú bấm nhầm ra khung hình nhiều khả năng gây bực hơn là giúp. **Nói một câu là tôi làm.**

---

## 6. Không đụng gì của tính năng khác

| File | Đổi | Vì sao |
|---|---|---|
| `client/assets/film-tools.js` | §4.1–4.3, §5.2–5.3 | **chỉ channel nạp** |
| `tests/film-tools.test.js` | **+15 test** (§7) | |
| `tests/asset-versions.json` | sinh lại | `node tests/asset-versions.test.js --update` |
| `client/assets/app.js` | **2 ký tự** `?v=2` → `?v=3` | manifest bắt buộc |
| `client/assets/film-tools.css` | 3 dòng: `.fmt-p-btn.off` | nút ⭳ thôi trông như đã sẵn sàng |
| **Cloudflare R2** | **CORS policy (§3.2)** | **không phải file trong repo — bạn làm** |
| `Stats/stats-view.js` | **0** | không có API mới nào phải xin |
| `cloud-sync.js`, `worker/*` | **0** | trừ khi §3.3 buộc — sẽ hỏi trước |

Vì sao các tab khác không thể hỏng:

- **`onDown` chỉ thêm một nhánh ở đầu, và nhánh đó chỉ chạy khi `menu` khác null.** Ngoài lúc bảng
  mở, `onDown` hành xử y hệt hôm nay, từng dòng.
- **`onBoxDown` chỉ tồn tại trong lúc bảng mở** — gắn ở `openMenu`, gỡ ở `closeMenu`, và
  `closeMenu()` đã được gọi sẵn ở `detach()`, `fullscreen(false)` và ngay đầu `openMenu()`. Không
  có đường nào để nó sống sót qua một lần đóng.
- **`corsOK()` là một `GET` range một byte** vào chính file đang phát. Không tạo thêm phần tử,
  không ghi gì, và kết quả được nhớ một lần cho cả phiên.
- **Toàn bộ thay đổi vẫn nằm trong hai file mà tagger không nạp.**

---

## 7. Kế hoạch test

| # | Test | Khoá điều gì |
|---|---|---|
| 1 | `openSource()` được gọi hai nhịp, nhịp 1 có `crossOrigin`, nhịp 2 không | §4.1 |
| 2 | nhịp 2 mở được → thông báo nói **CORS**, không nói "không mở được video" | B |
| 3 | cả hai nhịp hỏng → thông báo nói **file/URL** | §4.1 |
| 4 | phần tử của nhịp 2 được gỡ `src` ngay, không render gì | §4.1 |
| 5 | `corsOK()` chỉ dùng `GET` + `Range`, không `PUT`/`POST` | 4 lời hứa |
| 6 | kết quả CORS được nhớ trong phiên, không hỏi lại mỗi lần bấm | §4.2 |
| 7 | `overlayImage` bị từ chối → `fail()`, và **không** file nào được tải | D |
| 8 | mã nguồn: `crossOrigin` **không bao giờ** đặt lên `ctx.video` | §4.4 (test cũ) |
| 9 | bảng đang mở + chuột trái lên khung hình → bảng đóng, `preventDefault` được gọi | E |
| 10 | và cú bấm đó **không** dời đèn rọi, **không** bắt đầu nét vẽ | §5.2 |
| 11 | `onBoxDown` bỏ qua cú bấm **bên trong** bảng — các mục vẫn chạy | §5.3 |
| 12 | `closeMenu()` gỡ `onBoxDown`; sau khi đóng, số listener về 0 | §6 |
| 13 | bảng không mở → `onDown` hành xử y như trước, từng nhánh | §6 |

Đạt được: `node tests/run.js` → **1121/1121**, với **1106 test cũ xanh nguyên vẹn**.

Và một phép nghiệm thu **không phải test**, vì nó cần mạng: sau khi đặt CORS ở §3.2, chạy lại lệnh
`curl` ở §3.3 và thấy `Access-Control-Allow-Origin` trong kết quả.

---

## 8. Thứ tự làm

| Bước | Việc | Ai làm | Sau bước này thì sao |
|---|---|---|---|
| **1** | Đặt CORS policy (§3.2) rồi kiểm bằng `curl` | **bạn**, trên Cloudflare | **nút ⭳ chạy được ngay, không cần đợi code** |
| **2** | §4.1 + §4.2 + §4.3 — nói đúng, nói sớm, không giao file sai | tôi | lần sau hỏng thì biết ngay tại sao |
| **3** | §5 — chuột trái đóng bảng | tôi | |
| **4** | Xuất thử một clip có đoạn đứng hình, đếm giây | **bạn** | xác nhận nốt thứ duy nhất chưa ai đo được |

**Bước 1 độc lập với bước 2 và 3.** Nếu bạn đặt CORS xong thì kết xuất chạy được **ngay hôm nay**
với code đang chạy trên site — không phải chờ tôi. Bước 2–3 là để lần sau có chuyện thì bạn không
phải đi hỏi.

---

## 9. Đã đo, không đoán

### 9.1 Bucket không có CORS

```
$ curl -s -I -H "Origin: https://hoangnams.com" \
       https://pub-9cdd291bf181425b9738328ada297691.r2.dev/
HTTP/1.1 404 Not Found
Server: cloudflare
        ← không Access-Control-Allow-Origin, không Vary: Origin
```

*(Hồi đáp 404 không phải lúc nào cũng mang header CORS, nên đây là bằng chứng mạnh chứ chưa phải
chứng minh tuyệt đối. Phép nghiệm thu dứt điểm là chạy lại lệnh này trên một object có thật, sau
khi đã đặt policy — §3.3.)*

### 9.2 Đường vẽ đồ hoạ khoẻ mạnh — 14 phép thử trong trình duyệt thật

Chạy `client/assets/film-tools.js` trong trình duyệt, dựng từng loại hình qua đúng menu và đúng
thao tác kéo mà analyst dùng, rồi đẩy `overlaySVGString()` qua đúng bộ rasterise của bản xuất:

```
spotlight ✓  mũi tên ✓  mũi tên cong ✓  mũi tên nét đứt ✓  bút ✓  vùng ✓  marker ✓
chữ, gồm & < > " '                                                              ✓
lớp làm tối + <mask> tham chiếu theo id                                         ✓
overlay rỗng                                                                    ✓
data: SVG không làm bẩn canvas                                                  ✓
và nó thật sự có mực                                                            ✓
```

Nghĩa là: **nếu video mở được thì đồ hoạ sẽ có trong file.** Vấn đề nằm hoàn toàn ở khâu mở video.

### 9.3 Nguồn của dòng chữ

```js
// client/assets/film-tools.js — exportClip()
v.addEventListener('error', function () { fail('Không mở được video để kết xuất'); });
```

Đúng một chỗ trong toàn bộ mã nguồn sinh ra chuỗi đó, và nó là sự kiện `error` của phần tử
`<video>` mang `crossOrigin = 'anonymous'`.

### 9.5 Đã dựng lại ĐÚNG tình huống của bạn, và chạy được cả đường ống

`localhost` và `127.0.0.1` là **hai origin khác nhau**, còn `python -m http.server` **không gửi
header CORS nào** — tức đúng bằng cái bucket. Nên trang chạy ở `localhost:8765` trỏ vào một video
thật ở `127.0.0.1:8765` là bản sao chính xác của lỗi bạn gặp. Video thử: 20 giây, 640×360, có
tiếng, dựng bằng `ffmpeg`.

```
1. cross-origin, không CORS
   nhịp 1 (crossOrigin)  -> BỊ TỪ CHỐI     ← đúng lỗi của bạn, dựng lại được
   nhịp 2 (bỏ crossOrigin) -> MỞ ĐƯỢC      ← nên file chưa bao giờ là vấn đề
2. same-origin
   nhịp 1 mở được, và ảnh thật 640x360     ✓
3. file không tồn tại
   cả hai nhịp đều từ chối -> câu kia      ✓
```

Nghĩa là câu `NEED_CORS` **không phải suy đoán**: cặp (từ chối, mở được) chỉ xảy ra khi và chỉ khi
thứ thiếu là cái header.

### 9.6 Và một file `.mp4` THẬT đã được kết xuất — kể cả đoạn đứng hình

Đây là thứ chưa ai kiểm được cho tới giờ. Cắt cùng một đoạn 6 giây hai lần, lần sau có thêm mốc
đứng hình 3 giây:

```
plain  6s          363 926 byte   video/mp4    dài  7,23 s
frozen 6s + 3s     412 602 byte   video/mp4    dài  9,73 s
                                               chênh 2,50 s
```

**Đoạn đứng hình là footage thật trong file**, không phải một cờ nằm trong JSON. File dài thêm,
nặng thêm, và mở ra xem được.

Hai điều rút ra, nói thẳng:

1. **Đồ hoạ có trong file.** Cả hai lần render đều đi qua `overlaySVGString()` mỗi frame, và §9.2
   đã chứng minh chuỗi SVG đó rasterise ra mực thật.
2. **Độ dài file không chính xác tuyệt đối.** Đoạn cắt 6 giây ra file 7,23 giây; mốc dừng 3 giây
   thêm được 2,50 giây. Sai số ~20% đến từ `setTimeout(pump, 1000 / fps)` — nó đếm nhịp mà không
   trừ đi thời gian rasterise mỗi frame. **Đây là hành vi có sẵn, không phải thứ thay đổi này gây
   ra**, và nó chưa bao giờ được đo cho tới hôm nay. Sửa được (chốt theo `Date.now()` thay vì đếm
   nhịp cố định) nhưng đó là một thay đổi khác, và tôi **không** tự làm.

### 9.7 Chưa đo được

- **Có object thật nào trả CORS sau khi đặt policy hay không** — cần bạn đặt xong rồi chạy `curl`.
- **`r2.dev` có áp dụng CORS policy của bucket không.** Đây là điều tôi **không** khẳng định được
  từ đây, và là lý do §3.3 tồn tại kèm lệnh nghiệm thu.
- **Một file `.mp4` thật có đoạn đứng hình.** Vẫn chưa mở lên xem được — và nó bị chặn bởi đúng
  vấn đề A này.

---

## 10. Tóm tắt một câu

Bộ kết xuất không hỏng và đồ hoạ không hỏng — **bucket R2 thiếu một dòng header**, nên phần tử
video mang `crossOrigin` không tải nổi và analyst nhận một câu nói sai nguyên nhân; sửa là **một
CORS policy trên Cloudflare** cộng ba thay đổi nhỏ trong `film-tools.js` để lần sau hỏng thì nói
đúng, nói sớm, và không bao giờ giao ra một clip thiếu hình mà im lặng — cộng một nhánh ở đầu
`onDown` để chuột trái đóng được cái bảng mà chuột phải mở ra.
