# Film — Telestration theo THỜI GIAN — Detailed Design

**Một hình vẽ trên khung hình phải thuộc về *khoảnh khắc* nó được vẽ ra, chứ không thuộc về cả
trận đấu. Analyst đứng hình ở 3:14, kéo một mũi tên, và mũi tên đó sống ở 3:14 — trước đó không
có, sau đó không còn. Tài liệu này mô tả toàn bộ thay đổi để đạt được điều đó: mô hình dữ liệu,
cách neo thời gian, vòng đời và fade, thanh thời gian để NHÌN THẤY các cửa sổ, chọn/sửa/xoá từng
hình, đèn rọi kéo được và lăn được, con lăn để phóng to, và bốn lỗi đã đo được đang chặn đường.**

Trạng thái: **ĐÃ TRIỂN KHAI** (2026-08-18). Bản sửa 3.
**Q1 → B** (có đoạn đứng hình) · **Q2 → 4,0 s** · **Q3 → Có** · **Q4 → hiện khi trận có hình.**

Phạm vi đã làm — đúng như đã hứa, không hơn một file nào:
`client/assets/film-tools.js` (**+867 / −100**), `client/assets/film-tools.css` (**+34**),
`tests/film-tools.test.js` (**+435**), `tests/asset-versions.json` (sinh lại), và **2 ký tự**
trong `client/assets/app.js` (`?v=1` → `?v=2`).

Test: `node tests/run.js` → **1106/1106 passed**, trong đó **1074 test cũ xanh nguyên vẹn**.
Cộng thêm **40 phép kiểm trong DOM THẬT của trình duyệt** (§19.3) — không phải DOM giả.

§19 ghi lại mọi chỗ bản thi công **lệch khỏi** tài liệu này, và vì sao.

**0 dòng** ở: `Stats/stats-view.js`, `Stats/stats-view.css`, `Stats/report.js`, `shared.js`,
`shared.css`, `cloud-sync.js`, `index.html` (tagger), `Player-Lists/*`, `worker/*`, `supabase/*`,
`client/index.html`, `client/login.html`, `client/app.html`, `client/assets/app.css`,
`.github/workflows/deploy.yml`.

Nền hiện tại: `node tests/run.js` → **1074/1074 passed**. Mọi thay đổi ở đây phải giữ nguyên con
số đó và chỉ cộng thêm.

> **Một điều phải nói trước, vì nó thay đổi cách đọc cả tài liệu.**
> Tôi đã dựng lại `film-tools.js` chạy thật trong Node (phụ lục §18). **Mũi tên KHÔNG tồn tại
> xuyên suốt video.** Code hôm nay đã có cửa sổ thời gian và nó hoạt động: hình vẽ ở giây 194
> sống đúng **4,0 giây** rồi biến mất. Cái sai không phải "không có cửa sổ", mà là cửa sổ đó
> **cố định, vô hình, không sửa được**, cộng bốn lỗi đo được quanh nó — trong đó một lỗi khiến
> hình vẽ **sinh ra đã chết**. §0.1 và §0.2 nói rõ từng cái.

---

## 0. Trả lời thẳng

### 0.1 Điều đã đo: hôm nay hệ thống thực sự làm gì

| Đo | Kết quả |
|---|---|
| Vẽ spotlight / kéo mũi tên lúc `t=194` | shape lưu `in=194, out=198` |
| Số node hiển thị tại `t=194 / 195.5 / 197.9` | **2 / 2 / 2** |
| Số node hiển thị tại `t=198.1 / 200 / 400 / 2000` | **0 / 0 / 0 / 0** |

**Cửa sổ 4 giây có thật và có tác dụng.** Cảm giác "nó cứ ở đấy" đến từ ba chỗ: 4 giây là con số
**vô hình và không đổi được**; khi đứng hình thì `currentTime` không nhúc nhích nên hình nằm đó
vô thời hạn; và `restore()` nạp lại **mọi hình đã vẽ cho trận đó** mà không có chỗ nào liệt kê ra.
Cả ba đều là lỗi thiết kế thật, và cả ba được giải quyết bên dưới.

### 0.2 Bốn lỗi đã đo được

| # | Lỗi | Đo được | Xử lý |
|---|---|---|---|
| **a** | **Hình vẽ sinh ra đã chết.** `in` chốt lúc `pointerdown`, `out = in + 4`. Thao tác dài hơn 4 giây khi video đang chạy → commit với `out` đã ở quá khứ | Kéo bút từ `t=100` tới `t=106` → `in=100, out=104`; tại `t=106` lớp vẽ có **0 node** | §3.2 |
| **b** | **Phát một clip xoá bản vẽ của cả trận.** `playClip()` gán `shapes = c.shapes` | 4 hình → ▶ → còn **1** → vẽ thêm 1 → **2** hình xuống đĩa. Hình ở 600 s và 1200 s mất vĩnh viễn | §10 |
| **c** | **Dựng lại toàn bộ DOM 60 lần/giây** | `n1 === n2` → **false**; `<mask>` id mới mỗi frame: `fmtmask3…fmtmask7` | §9 |
| **d** | **Menu quảng cáo phím `S` nhưng `key()` không cài `s/S`** | `key()` có `Backspace , . [ ] h d c z l` — không có `s` | **§7.1 — nay ĐƯỢC SỬA** |

### 0.3 Năm điều chỉnh bạn yêu cầu, và chúng nằm ở đâu

| # | Yêu cầu | Mục | Đổi hành vi sẵn có? |
|---|---|---|---|
| 1 | Sửa phím `S` không hoạt động | **§7.1** | có — một phím đang chết nay sống |
| 2 | Đèn rọi: kéo được tới đúng điểm, con lăn đổi kích thước | **§6.4** | mở rộng, không phá |
| 3 | Bỏ `z`, dùng con lăn để phóng to/thu nhỏ video | **§7.2 + §8** | có — `z` bị gỡ |
| 4 | Chuột phải **không** pause, chỉ mở bảng Telestration | **§3.3** | có — gỡ `ctx.pause()` khỏi `openMenu()` |
| 5 | Giải thích rõ Q1–Q4 | **§17** | không — chỉ tài liệu |

**Cả năm đều nằm gọn trong `film-tools.js` / `film-tools.css`.** Không cái nào cần một dòng nào ở
`Stats/stats-view.js`, nên lời hứa "0 dòng" ở phần đầu vẫn đứng nguyên sau bản sửa này.

---

## 1. Vấn đề thật: cửa sổ thời gian là có, nhưng nó vô hình

Ba điều analyst không làm được hôm nay, và cả ba là *cùng một thiếu sót*:

1. **Không nhìn thấy** cửa sổ. Không gì nói mũi tên này sống từ 3:14 tới 3:18.
2. **Không đổi được** cửa sổ. `HOLD = 4` là hằng số trong file.
3. **Không chọn được** một hình đã vẽ. Chỉ có "hoàn tác nét cuối" và "xoá hết đồ hoạ".

Một hệ Telestration đúng nghĩa phải trả lời được ba câu, ngay trên khung hình:
**cái gì đang sống · sống từ bao giờ tới bao giờ · làm sao sửa nó.**

---

## 2. Mô hình dữ liệu — hình neo vào một KHOẢNH KHẮC

### 2.1 Trường mới

Giữ nguyên `in`/`out` làm **nguồn sự thật duy nhất cho việc vẽ**. Thêm bốn trường mô tả *ý định*:

```jsonc
{
  "id": "s2", "kind": "arrow", "space": "S",

  "at":   194.32,      // MỚI — khoảnh khắc hình được neo vào
  "in":   194.32,      //        cửa sổ sống, tính bằng thời gian FILE
  "out":  198.32,
  "life": "moment",    // MỚI — "moment" | "range" | "pinned"
  "fade": 0.25,        // MỚI — số giây mờ vào/mờ ra ở hai đầu (0 = tắt)
  "rev":  0,           // MỚI — tăng mỗi lần hình bị sửa; §9 dùng để đối chiếu DOM

  "from": {"x":412,"y":588}, "to": {"x":690,"y":430},
  "style": {"color":"#E0122B","width":6}
}
```

1. **`at` tách khỏi `in`.** Hôm nay chúng bằng nhau. Chúng tách ra ngay khi analyst kéo cạnh cửa
   sổ: `in` chạy, `at` **đứng yên ở frame đã vẽ**.
2. **`life` là *ý định*, không phải trạng thái.** `paint()` chỉ đọc `in`/`out` (và nhánh `pinned`).
3. **`life:"pinned"` là con đường DUY NHẤT để có hành vi "hiện suốt"** — và phải do analyst bấm.
4. **`fade` là giây, không phải cờ** — cùng con số cho màn hình và cho file xuất, qua đúng một hàm
   `alpha()` (§4.2).

| `life` | `in` / `out` | Dùng khi | Thanh thời gian hiện |
|---|---|---|---|
| `"moment"` | `at` → `at + dur` | mặc định: chỉ một thứ ở một khoảnh khắc | thanh ngắn, mỏ neo ở `at` |
| `"range"` | analyst kéo hai cạnh | đồ hoạ sống qua cả một pha bóng | thanh dài, hai cạnh kéo được |
| `"pinned"` | bỏ qua | tiêu đề clip, sơ đồ | thanh chạy hết chiều ngang, có 📌 |

### 2.2 Tương thích ngược

`STORE_KEY` **giữ nguyên** `'hna.film.tools.v1'`. Bản ghi từng trận lên `v:2`, nâng cấp **lười**
trong `restore()`:

```js
function upgrade(s) {
  if (s.at   == null) s.at   = s.in;          // hình cũ: neo chính là điểm bắt đầu
  if (s.life == null) s.life = 'moment';
  if (s.fade == null) s.fade = FADE;
  if (s.rev  == null) s.rev  = 0;
  return s;
}
```

Cửa sổ `in`/`out` của dữ liệu cũ **không đổi một phần nghìn giây nào**. Thứ duy nhất đổi là hình
cũ nhận `fade` mặc định — xem §17-Q3, đó là lựa chọn của bạn.

---

## 3. Neo thời gian

### 3.1 Rút lại: **không** ép đứng hình khi bắt đầu vẽ

> Bản 1 của tài liệu này đề xuất `onDown()` gọi `ctx.pause()`. **Đề xuất đó nay bị rút lại**, vì
> nó đi ngược tinh thần yêu cầu #4 của bạn: bạn muốn thao tác của analyst **không** tự ý dừng
> video. Ép đứng hình lúc bắt đầu kéo cũng là "tự ý dừng video", chỉ khác chỗ bấm.

Và nó **không cần thiết**: chốt chặn ở §3.2 tự nó đã sửa dứt điểm lỗi 🔴 (a). Kiểm lại bằng số:
kéo bút từ `t=100` tới `t=106` → `in = 100`, `out = max(100+4, 106+1.5) = 107.5`. Tại `t=106` hình
**đang sống**. Lỗi biến mất mà không cần đụng vào quyền điều khiển video của analyst.

Ai muốn đứng hình thì vẫn có `Space`, và có `,` `.` để bước từng frame — những thứ đã có sẵn.

### 3.2 Chốt chặn, để không bao giờ có hình chết yểu

```js
var MIN_TAIL = 1.5;                  // hình vẽ xong luôn được nhìn thấy ít nhất ngần này

function commit(d, anchor) {
  d.at   = anchor;                                       // frame analyst nhắm vào
  d.life = d.life || 'moment';
  d.in   = anchor;
  d.out  = anchor + defaultDur;
  var rel = ctx.video.currentTime;                       // lúc THẢ chuột
  if (d.out < rel + MIN_TAIL) d.out = rel + MIN_TAIL;    // không bao giờ sinh ra đã chết
  addShape(d);
}
```

`anchor` được chốt **một lần** ở `pointerdown` và mang theo suốt thao tác kéo.

Cùng chốt chặn đó áp cho **chữ**, và ở đó nó còn cần hơn: `textAt()` chốt `base.in` lúc
`pointerdown` rồi **đợi analyst gõ xong** — gõ "áp sát cánh phải" mất hơn 4 giây là chuyện thường.
`done(true)` phải đi qua đúng `commit()` ở trên.

### 3.3 Chuột phải **không** pause nữa — và hệ quả phải xử lý cùng lúc

Yêu cầu #4. Hôm nay `openMenu()` có:

```js
ctx.pause();                       // the menu is about THIS moment; do not let it drift
```

**Gỡ dòng đó.** Menu mở ra, video chạy tiếp. Một dòng, và không gì khác trong `openMenu()` phụ
thuộc vào nó.

**Nhưng nó kéo theo một hệ quả bắt buộc phải sửa cùng lúc, nếu không sẽ sinh lỗi mới.** Lý do
dòng `pause()` được viết ra ngay từ đầu nằm ở chính câu chú thích của nó: menu được mở **về một
khoảnh khắc**, và nó chụp lại khoảnh khắc đó:

```js
var hit = { t: ctx.video.currentTime, p: toVideo(e.clientX, e.clientY) };
```

Nhưng mục "Rọi đèn vào đây" lại tạo hình qua `addShape()`, và `addShape()` lấy thời gian từ
`ctx.video.currentTime` **tại lúc bấm menu**, không phải `hit.t`. Khi video còn đứng thì hai giá
trị đó bằng nhau nên không ai thấy gì. **Bỏ `pause()` đi thì chúng lệch nhau**: analyst chuột phải
ở 3:14, đọc menu mất 3 giây, bấm "Rọi đèn vào đây" → đèn rọi được đặt ở **toạ độ của 3:14** nhưng
**neo vào 3:17**. Nó sẽ sáng lên ở một khung hình mà cầu thủ đã chạy đi mất.

Sửa: mọi mục menu tạo ra hình phải neo vào `hit.t`, đúng như tiêu đề menu đang hiển thị.

```js
// menuModel(hit) — mục "Rọi đèn vào đây"
run: function () {
  if (!hit.p) { toast('Bấm vào trong khung hình'); return; }
  ensureLayer();
  addShape({ kind: 'spotlight', space: 'S', at: hit.p, r: …, style: {…} },
           hit.t);                    // ← MỚI: neo vào khoảnh khắc đã chuột phải
}
```

`addShape(s, anchor)` nhận thêm một tham số tuỳ chọn; khi không truyền, nó giữ nguyên hành vi cũ
(`ctx.video.currentTime`). Các mục menu khác đã dùng `hit.t` sẵn (`Lặp A–B từ đây`,
`Chép link tới khoảnh khắc này`, tiêu đề menu) nên không phải đụng.

**Ba thứ cần kiểm lại vì video nay chạy dưới một menu đang mở** — cả ba đã kiểm và đều an toàn:

| Thứ | Có hỏng không |
|---|---|
| Vị trí menu (`menu.style.left/top`) | đặt một lần lúc mở, tính theo `ctx.box` — video chạy không dời nó |
| `frame(now)` vẫn chạy mỗi rAF | đúng như mong muốn: hình vẫn sống/tắt theo cửa sổ trong lúc menu mở |
| `filmFrame()` có thể tới cuối hiệp và tự `pause()` | hành vi sẵn có của Film, không liên quan menu |

---

## 4. Vòng đời

### 4.1 Tập hình đang sống

```js
function liveAt(now) {
  if (hidden) return [];
  return shapes.filter(function (s) {
    if (s.life === 'pinned') return true;
    var f = s.fade || 0;
    return s.in - f <= now && now <= s.out + f;         // nới hai đầu để có chỗ mờ
  });
}
```

### 4.2 Độ mờ — một hàm, dùng cho cả màn hình lẫn file xuất

```js
function alpha(s, now) {
  if (s.life === 'pinned') return 1;
  var f = s.fade || 0;
  if (!f) return 1;
  if (now < s.in)  return clamp((now - (s.in - f)) / f, 0, 1);
  if (now > s.out) return clamp(1 - (now - s.out) / f, 0, 1);
  return 1;
}
```

Đặt bằng thuộc tính `opacity` trên node `<g>`. **Không dùng CSS transition** — bản xuất rasterise
SVG qua `<img>`, nơi không transition nào chạy, nên độ mờ phải là **hàm của `now`** để hai đường
cho ra đúng một kết quả.

### 4.3 Thời lượng mặc định

`HOLD = 4` trở thành `defaultDur`, vẫn khởi tạo 4,0 s, nhưng **nhớ lựa chọn gần nhất trong phiên**,
**hiện ra trên nhãn công cụ** (`"Mũi tên · 4,0 s · phím 1–9 đổi, 0 = giữ mãi"`), và **đổi được
bằng phím số** (§7.3).

---

## 5. Thanh thời gian

### 5.1 Nó là gì

Một dải nằm ngang, chỉ có trong toàn màn hình, mỗi hình một thanh nhỏ đặt đúng cửa sổ của nó:

```
  ├──────────────────────────────────────────────────────────────────┤
  │            ▓▓▓▓▓                ▓▓        ▓▓▓▓▓▓▓▓▓▓▓            │   ← các hình
  │              ▲                                                    │   ← con trỏ hiện tại
  └──────────────────────────────────────────────────────────────────┘
    45:00        3:14                6:02      8:30
```

- **bấm một thanh** → seek tới `at` **và** chọn hình đó;
- **kéo thân thanh** → dời cả cửa sổ (kéo theo `at`);
- **kéo hai cạnh** → đổi `in` / `out`, `life` tự chuyển sang `"range"`;
- hình `pinned` là một thanh mảnh chạy hết chiều ngang, có 📌;
- hình **đang chọn** viền sáng; hình **đang sống ở `now`** tô đậm hơn.

### 5.2 Nó nằm ở đâu — **sửa so với bản 1**

> **Bản 1 đề xuất đặt thanh này trong dải đen DƯỚI. Sai, và đây là chỗ nó sai.**
> `#fmStage` có đúng hai con: `<video id="fmVideo">` và `<div class="film-cap" id="fmCap">`.
> Cái thứ hai là dòng chú thích sự kiện, `position:absolute; bottom:0`, và trong toàn màn hình
> nó cao `clamp(38px, 5vh, 54px)`. Dải đen dưới chỉ có **73,5 px**. Đặt thanh thời gian ở đó là
> **đè lên caption** — một tính năng sẵn có, và bạn đã dặn không đụng.

**Thanh thời gian đi lên dải đen TRÊN.** Nó trống — đã kiểm bằng cách đọc chính markup dựng
`#fmStage`: không con nào của stage neo vào `top`. Cùng 73,5 px, cùng phép tính, và không đụng
một tính năng nào.

Phép đo có sẵn: ảnh 16:9 `object-fit:contain` trong khung **1430×951** cho ảnh **1430×804**, tức
**73,5 px đen trên và 73,5 px đen dưới**. `pictureRect()` — thứ `film-tools.js` vốn đã tính và đã
đo lại ở mọi `resize`, mọi lần đổi hiệp, mọi lần ra/vào toàn màn hình — cho đúng con số đó.

| Dải đen trên | Cách đặt |
|---|---|
| ≥ 34 px | thanh nằm gọn trong dải đen, **không che ảnh**, luôn hiện |
| < 34 px | thanh đè mép trên của ảnh, nền `rgba(0,0,0,.72)`, **tự ẩn** sau 2,0 s không có chuột |

`append` vào `ctx.stage`, đúng như `.fmt-layer` hôm nay. **Không API mới nào phải xin từ
`stats-view.js`.**

### 5.3 Bật / tắt

Phím `t`/`T`, và một dòng trong menu chuột phải. Mặc định: **hiện khi và chỉ khi trận này có ít
nhất một hình vẽ** — một CLB mở channel lên xem mà chưa ai vẽ gì thì không thấy gì mới, đúng
nguyên tắc *"nó không bao giờ tự phô ra"*. `fullscreen(false)` gỡ nó xuống.

---

## 6. Chọn, sửa, xoá

### 6.1 Chọn

`.fmt-layer` có `pointer-events:none`, chỉ bật `auto` khi có công cụ đang lắp. Quy tắc đó **giữ
nguyên** — một cú bấm nhầm lên khung hình làm người xem mất chỗ đang xem. Nên việc chọn hình
**không đi qua lớp vẽ**:

- **cách chính**: bấm vào thanh của nó trên thanh thời gian (§5.1);
- **cách phụ**: menu chuột phải mọc thêm mục `"Hình ở đây…"` khi cú bấm rơi trúng một hình đang
  sống — menu **vốn đã** có `hit.p` trong hệ pixel video, nên đó là một phép so sánh, không phải
  một hệ hit-test mới.

`selected` giữ `id`, không giữ tham chiếu (hình có thể bị `restore()` thay).

### 6.2 Sửa

| Việc | Cách |
|---|---|
| dời cửa sổ | kéo thân thanh, hoặc `Shift+←` / `Shift+→` (±1 frame) |
| đổi thời lượng | phím `1`…`9` = 1…9 giây, hoặc kéo cạnh thanh |
| giữ mãi | phím `0` → `life:"pinned"` ↔ bỏ ghim |
| về frame đã vẽ | bấm đúp vào thanh (seek tới `at`) |
| đổi màu | menu chuột phải, `"Hình ở đây… › Màu"` |
| xoá | `Delete` |

Mọi thao tác `++s.rev` rồi `persist()`.

### 6.3 `undo` giữ nguyên nghĩa

Vẫn là "bỏ nét cuối". Không trở thành undo-stack đầy đủ ở bản này — §16.

### 6.4 Đèn rọi: kéo tới đúng chỗ, con lăn đổi kích thước — **yêu cầu #2**

Hôm nay đèn rọi được **đặt một lần rồi thôi**: `r` cố định `= round(layer.h * 0.075)`, tâm cố định
ở điểm chuột phải. Trượt vài chục pixel là phải xoá đi làm lại.

**Chế độ chỉnh (`adjust`).** Sau khi đặt một đèn rọi — bằng menu hoặc bằng phím `S` (§7.1) — nó
**tự vào chế độ chỉnh**, và chọn lại một đèn rọi có sẵn trên thanh thời gian cũng đưa nó vào chế
độ này.

```js
var adjust = null;         // { id } — đèn rọi đang được chỉnh, nếu có
```

| Thao tác | Kết quả |
|---|---|
| **kéo chuột trên khung hình** | tâm đèn rọi (`s.at`) chạy theo con trỏ, theo hệ pixel video |
| **lăn con lăn** | `r` đổi theo cấp số nhân: `r *= 1.08` (lăn lên) hoặc `r /= 1.08` (lăn xuống) |
| **`Backspace`, hoặc `S` lần nữa, hoặc bấm ra ngoài** | thoát chế độ chỉnh |
| **`Delete`** | xoá đèn rọi đó |

Bốn chi tiết phải làm đúng:

1. **Giới hạn `r`**: từ `0.02 × layer.h` tới `0.60 × layer.h`. Không có cận trên thì một cú lăn
   dài biến đèn rọi thành cả khung hình, và với `dim` bật thì màn hình sáng trắng.
2. **Cấp số nhân, không cộng thêm.** `r *= 1.08` cho cảm giác đều tay ở mọi cỡ; `r += 5px` thì lúc
   nhỏ nhảy giật, lúc to bò như rùa.
3. **Lỗ trên lớp làm tối phải đi theo.** `paintDim()` ở §9 dựng lại `<mask>` chỉ khi tập spotlight
   sống đổi — nên khoá so sánh phải là `id:x:y:r` **chứ không phải chỉ `id`**, nếu không kéo đèn
   rọi đi mà cái lỗ đứng yên.
4. **Lớp vẽ nhận con trỏ trong lúc chỉnh.** Thêm `.fmt-layer.fmt-adjust{pointer-events:auto;
   cursor:move}` bên cạnh `.fmt-armed` đã có. Đây là một chế độ analyst chủ động bước vào, đúng
   như lắp một công cụ — không phải một cú bấm nhầm.

Mỗi lần đổi `at` hoặc `r` thì `++s.rev` và `persist()`, để §9 dựng lại đúng node đó và ổ đĩa
không tụt lại phía sau.

---

## 7. Bàn phím

### 7.1 Sửa phím `S` — **yêu cầu #1**

Menu ghi `S` bên cạnh "Rọi đèn vào đây" từ ngày đầu, nhưng `key()` không có nhánh nào cho `s`.
Bấm S không có gì xảy ra.

Sửa được, nhưng có một câu hỏi thật phải trả lời: **menu biết đặt đèn rọi ở đâu vì nó có `hit.p`
— toạ độ cú chuột phải. Bàn phím không có toạ độ nào cả.**

Ba lựa chọn, và tôi chọn cái thứ ba:

| | Cách | Vấn đề |
|---|---|---|
| A | đặt ở giữa khung hình | gần như luôn sai chỗ; analyst phải kéo mỗi lần |
| B | đòi phải rê chuột lên hình trước | không dạy được, im lặng không làm gì khi không thoả |
| **C** | **đặt tại vị trí con trỏ hiện thời, lùi về giữa khung hình khi chưa biết** | **cần nhớ vị trí con trỏ — 3 dòng** |

```js
var ptr = null;                                  // vị trí con trỏ, hệ pixel video

// trong attach(): cùng chỗ với contextmenu / pointerdown đã đăng ký
ctx.stage.addEventListener('pointermove', onPtr);
function onPtr(e) { ptr = toVideo(e.clientX, e.clientY); }   // null khi ra ngoài ảnh

// trong key()
if (k === 's' || k === 'S') {
  if (!full) return false;
  var p = ptr || { x: layer ? layer.w / 2 : 0, y: layer ? layer.h / 2 : 0 };
  ensureLayer();
  var s = addShape({ kind: 'spotlight', space: 'S', at: p,
                     r: Math.round(layer.h * 0.075),
                     style: { color: ACCENT, width: strokeW(), pulse: true } });
  adjust = { id: s.id };                          // vào thẳng chế độ chỉnh (§6.4)
  return true;
}
```

`onPtr` phải được gỡ trong `detach()`, cùng chỗ với `contextmenu` và `pointerdown` đang được gỡ —
cặp add/remove ở đó đang cân đối và phải giữ cho nó cân đối.

Phím `S` đi thẳng vào chế độ chỉnh (§6.4) là điều làm nó **hữu dụng hơn cả mục menu**: rê chuột
tới chỗ cần, bấm `S`, lăn con lăn cho vừa cỡ, xong — không rời tay khỏi chuột lần nào.

### 7.2 Bỏ `z` — **yêu cầu #3**

Gỡ nhánh `if (k === 'z' || k === 'Z')` khỏi `key()`. Phóng to nay là việc của con lăn (§8).

Hai thứ đi kèm, để không để lại dấu vết sai:

1. **Mục menu `"Phóng to vùng này"` / `"Bỏ phóng to"` được GIỮ LẠI.** Bạn yêu cầu bỏ *phím* `z`,
   không yêu cầu bỏ mục menu, và bỏ đi là gỡ một tính năng chưa được phép gỡ. Nó vẫn có ích:
   phóng đúng vào điểm vừa chuột phải, và là đường "bỏ phóng to" bằng một cú bấm.
2. **Gợi ý phím `Z` trên mục menu đó phải bị gỡ**, thay bằng chữ nhắc con lăn. Một menu quảng cáo
   một phím không tồn tại chính là lỗi 🟡 (d) mà §7.1 vừa đi sửa — không được đẻ ra cái thứ hai
   ngay trong cùng một thay đổi.

### 7.3 Bản đồ phím đầy đủ sau thay đổi

| Phím | Ai lấy | Ghi chú |
|---|---|---|
| `Escape` | `stats-view` | thoát toàn màn hình |
| `Backspace` | `film-tools` | đóng menu → huỷ nét → thoát chỉnh đèn rọi → tháo công cụ → đóng panel |
| `,` `.` | `film-tools` | lùi/tới 1 frame |
| `[` `]` | `film-tools` | đánh dấu đầu/cuối clip |
| `h` `d` `c` `l` | `film-tools` | ẩn đồ hoạ · làm tối · panel clip · lặp A–B |
| ~~`z`~~ | — | **GỠ** (§7.2) — con lăn thay thế |
| **`s`** | **`film-tools` (sửa)** | đặt đèn rọi tại con trỏ + vào chế độ chỉnh |
| **`1`…`9`** | **`film-tools` (mới)** | đặt thời lượng 1…9 giây |
| **`0`** | **`film-tools` (mới)** | ghim / bỏ ghim |
| **`t`** | **`film-tools` (mới)** | hiện/ẩn thanh thời gian |
| **`Delete`** | **`film-tools` (mới)** | xoá hình đang chọn |
| **`Shift+←` `Shift+→`** | **`film-tools` (mới)** | dời cửa sổ ±1 frame |
| `←` `→` `Space` `f` | `stats-view` | tua · phát/dừng · toàn màn hình |

`Backspace` nay có thêm một nấc trong ngăn xếp (thoát chế độ chỉnh đèn rọi). Thứ tự các nấc là
thứ tự "cái nào mở sau thì đóng trước", đúng như nó đang làm.

### 7.4 Ràng buộc đã đo: Alt/Ctrl không bao giờ tới nơi

`Stats/stats-view.js`, `filmKeys()`, dòng đầu:

```js
if(!film||e.altKey||e.ctrlKey||e.metaKey)return;      // ← thoát TRƯỚC khi tới film-tools
```

**Mọi tổ hợp Alt / Ctrl / Cmd không bao giờ tới được `filmTools.key()`.** Một thiết kế đặt `Alt+←`
sẽ **im lặng không chạy**, và người viết nó sẽ đi sửa `stats-view.js` — đúng thứ bạn dặn không
được đụng. Vậy nên: **chỉ phím trơn và tổ hợp Shift.** Mọi phím ở §7.3 tuân thủ điều đó.

Một điểm phải cẩn thận: `key()` trả `true` là `filmKeys()` gọi `preventDefault()` **và dừng**. Nên
`1`…`9`, `0`, `t`, `Delete`, `Shift+←/→` chỉ được trả `true` **khi thật sự làm gì đó** — tức khi
có hình đang chọn hoặc công cụ đang lắp. Ngoài ra trả `false`.

---

## 8. Con lăn chuột — **yêu cầu #2 và #3**

Đã kiểm: **không có một handler `wheel` / `mousewheel` nào trong `app.js`, `film-tools.js`,
`stats-view.js` hay `shared.js`.** Con lăn đang hoàn toàn trống chỗ.

### 8.1 Trọng tài: một con lăn, hai việc

Listener đặt trên `ctx.stage` — **không** trên `document`, **không** trên `ctx.box`:

```js
ctx.stage.addEventListener('wheel', onWheel, { passive: false });

function onWheel(e) {
  if (!ctx || !full) return;              // ngoài toàn màn hình: con lăn là của trang
  if (e.ctrlKey || e.metaKey) return;     // Ctrl+lăn là phóng to của TRÌNH DUYỆT — không cướp
  var up = e.deltaY < 0;
  if (adjust) {                           // 1) đang chỉnh đèn rọi → đổi bán kính
    resizeSpot(adjust.id, up ? 1.08 : 1 / 1.08);
  } else {                                // 2) còn lại → phóng to video
    zoomBy(up ? 1.1 : 1 / 1.1, toVideo(e.clientX, e.clientY));
  }
  e.preventDefault();                     // chỉ khi ĐÃ tiêu thụ
}
```

Ba luật, và cả ba đều có lý do đo được:

1. **Ngoài toàn màn hình thì không đụng vào.** Telestration chỉ tồn tại trong toàn màn hình
   (`key()` và `openMenu()` đã chặn ở dòng đầu), và trang channel bên ngoài cuộn bình thường.
2. **`Ctrl`/`Cmd` + lăn là phóng to của trình duyệt.** Cướp nó là phá một chức năng trợ năng của
   hệ điều hành. Trả về sớm, không `preventDefault`.
3. **`preventDefault()` chỉ gọi khi đã tiêu thụ, và listener chỉ trên `ctx.stage`.** Lý do cụ
   thể: `Stats/stats-view.css` có `@media (max-width:900px){ .film-full{padding:10px;
   overflow:auto} }`, kèm chú thích rằng cuộn ở bề ngang đó là **cố ý**. Bắt con lăn trên
   `document` sẽ giết cuộn đó trên máy tính bảng. Bắt trên `ctx.stage` thì lăn trên sân nhỏ, trên
   danh sách sự kiện hay trên các slicer vẫn cuộn y như cũ.

`{ passive: false }` là **bắt buộc**, không phải trang trí: thiếu nó thì `preventDefault()` bị
trình duyệt bỏ qua và trang vẫn cuộn dưới tay analyst.

`onWheel` phải được gỡ trong `detach()`.

### 8.2 Phóng to bằng con lăn

```js
var ZMIN = 1, ZMAX = 6;

function zoomBy(f, p) {
  var k = clamp((zoom ? zoom.k : 1) * f, ZMIN, ZMAX);
  if (k <= 1.01) { zoom = null; }                       // về 1× thì GỠ HẲN transform
  else { zoom = { k: k, x: p ? p.x : (zoom ? zoom.x : layer.w / 2),
                          y: p ? p.y : (zoom ? zoom.y : layer.h / 2) }; }
  applyZoom();
  toast(zoom ? 'Phóng ' + zoom.k.toFixed(1) + '×' : 'Cỡ thật');
}
```

Ba điểm:

- **Liên tục thay vì bật/tắt 2×.** Hôm nay `zoom` là một công tắc `{k:2}`; nay `k` chạy từ 1 tới
  6. Mọi chỗ khác đọc `zoom` (`applyZoom`, mục menu, `detach`) không cần biết điều đó.
- **Về đúng 1× thì `zoom = null`, không phải `{k:1}`.** `applyZoom()` khi `zoom` là null sẽ đặt
  `transform = ''` — gỡ hẳn thuộc tính. Để lại `scale(1)` là để lại một transform vô hại về hình
  ảnh nhưng tạo một containing block và một tầng compositing không cần thiết.
- **Tâm phóng là điểm dưới con trỏ**, nên phóng to là "phóng vào chỗ tôi đang chỉ".
  `.film-stage{overflow:hidden}` đã có sẵn nên ảnh phóng to bị cắt gọn trong khung, không tràn ra
  thanh transport hay danh sách bên dưới.

### 8.3 Một lỗi trong `applyZoom()` phải sửa cùng lúc — đã đo bằng số

Yêu cầu #3 làm lộ ra một lỗi sẵn có mà công tắc 2× cũ che được. `applyZoom()` hiện dùng **một
chuỗi `transform-origin` duy nhất cho cả hai phần tử**:

```js
var o = zoom ? (zoom.x / layer.w * 100) + '% ' + (zoom.y / layer.h * 100) + '%' : '50% 50%';
ctx.video.style.transformOrigin = o;
if (layer) layer.svg.style.transformOrigin = o;
```

`layer.w/h` là **kích thước ảnh** (1920×1080). Nhưng hai phần tử có hai cái hộp khác nhau:

- `layer.svg` được JS đặt **đúng bằng ảnh** (1430×804) → phần trăm tính theo ảnh là **đúng**;
- `ctx.video` là **cả khung** (1430×951), có 73,5 px đen trên/dưới → phần trăm tính theo ảnh là
  **sai** trên đúng cái trục bị letterbox.

Bằng số, với điểm neo tại pixel video `y = 270` (¼ chiều cao ảnh):

```
transform-origin y mà code đặt :  270/1080 = 25%  ×  951 px  =  237,75 px
vị trí THẬT của y=270 trên khung:  73,5 + (270/1080) × 804  =  274,50 px
                                                        lệch =   36,75 px
```

Đo lại bằng cách dựng ma trận transform rồi cho `toVideo()` ánh xạ ngược, phóng 3× quanh điểm
`(480, 270)`, bấm đúng vào chính điểm đó:

```
3x about (480,270), click AT the origin -> {"x":480,"y":220.78}
                                              ✓ x đúng      ✗ y lệch 49px
```

Nghĩa là hôm nay **grass và đồ hoạ phóng to quanh hai điểm khác nhau** — đúng cái hỏng mà chú
thích trong chính file này cảnh báo: *"Anything else and a spotlight drifts off the player it was
put on."* Với công tắc 2× ở giữa khung (phím `z` cũ dùng `layer.w/2, layer.h/2` → 50%/50%) thì hai
cách tính trùng nhau nên không ai thấy; mục menu `"Phóng to vùng này"` thì đã sai từ đầu; và con
lăn bám con trỏ sẽ làm nó lộ ra ở mọi cú lăn.

Sửa: **hai gốc khác nhau cho hai hộp khác nhau.**

```js
function applyZoom() {
  if (!ctx) return;
  var v = ctx.video, t = zoom ? 'scale(' + zoom.k + ')' : '';
  v.style.transform = t;
  v.style.transformOrigin = zoom ? originOnElement(zoom.x, zoom.y) : '50% 50%';
  if (layer) {
    layer.svg.style.transform = t;
    // lớp vẽ ĐÃ nằm đúng trên ảnh, nên ở đây phần trăm theo ảnh mới là đúng
    layer.svg.style.transformOrigin = zoom
      ? (zoom.x / layer.w * 100) + '% ' + (zoom.y / layer.h * 100) + '%' : '50% 50%';
  }
}

/* gốc phóng, tính trong hệ toạ độ của CHÍNH phần tử <video> — offsetWidth/
   offsetHeight là số đo layout nên KHÔNG bị chính transform này bóp méo */
function originOnElement(px, py) {
  var v = ctx.video, ew = v.offsetWidth, eh = v.offsetHeight;
  var ar = v.videoWidth / v.videoHeight, boxAr = ew / eh;
  var pw = ar > boxAr ? ew : eh * ar, ph = ar > boxAr ? ew / ar : eh;
  var ox = (ew - pw) / 2 + px / v.videoWidth  * pw;
  var oy = (eh - ph) / 2 + py / v.videoHeight * ph;
  return (ox / ew * 100) + '% ' + (oy / eh * 100) + '%';
}
```

**`offsetWidth`/`offsetHeight` chứ không phải `getBoundingClientRect()`** là điểm mấu chốt:
`getBoundingClientRect()` trả về hộp **đã bị transform**, nên dùng nó để tính gốc của chính
transform ấy là một vòng lặp tự tham chiếu. `offsetWidth` là số đo layout, không đổi khi phóng to.

### 8.4 Còn `toVideo()` thì vẫn đúng khi đang phóng to

Đây là thứ tôi ngờ là hỏng và đã đo để chắc: `pictureRect()` gọi `getBoundingClientRect()`, tức
đo cái hộp **đã bị transform**. Nhưng vì transform là một phép **phóng đều**, hộp đó vẫn là ảnh
đúng tỉ lệ, chỉ to hơn và dời đi — và `toVideo()` đảo ngược đúng phép đó:

```
unzoomed, click at (715,475.5) -> {"x":960,"y":540}     ← tâm ảnh 1920x1080
2x about centre, same click    -> {"x":960,"y":540}     ← không xê dịch một pixel
```

Nên vẽ khi đang phóng to vẫn rơi đúng chỗ, và §8.3 không đụng gì tới đường này.

---

## 9. Render — thôi dựng lại DOM 60 lần một giây

Sửa lỗi 🟠 (c). **Đối chiếu theo `id`:**

```js
// layer.nodes: { id -> <g> }
function paint(now, phase) {
  if (!layer) return;
  var live = liveAt(now), seen = {};
  live.forEach(function (s) {
    seen[s.id] = 1;
    var n = layer.nodes[s.id];
    if (!n || n.__rev !== s.rev) {              // rev tăng mỗi lần hình bị sửa
      if (n) layer.gShapes.removeChild(n);
      n = shapeNode(s, phase); n.__rev = s.rev;
      layer.nodes[s.id] = n; layer.gShapes.appendChild(n);
    }
    n.setAttribute('opacity', alpha(s, now));   // thứ DUY NHẤT đổi mỗi frame
    if (s.style && s.style.pulse) pulse(n, s, phase);
    n.classList.toggle('fmt-sel', s.id === selected);
  });
  Object.keys(layer.nodes).forEach(function (k) {
    if (!seen[k]) { layer.gShapes.removeChild(layer.nodes[k]); delete layer.nodes[k]; }
  });
  paintDim(live);
}
```

`paintDim(live)` dựng lại `<mask>` **chỉ khi tập đèn rọi đang sống đổi**. Khoá so sánh phải gồm
**cả tâm và bán kính** — `id:x:y:r` — vì §6.4 cho phép kéo và lăn chúng; khoá chỉ theo `id` sẽ để
cái lỗ đứng yên trong khi đèn rọi chạy đi. Với một pha bóng đứng yên: **0 lần dựng lại** thay vì
60 lần mỗi giây.

`rev` là số nguyên trên mỗi hình, `++` mỗi lần hình bị sửa. Không cần so sâu, không cần thư viện.

---

## 10. Clip — sửa lỗi phát clip xoá bản vẽ

Sửa lỗi 🔴 (b). Hôm nay `playClip()` gán `shapes = c.shapes.map(…)` — thay **toàn bộ** bản vẽ của
trận. Đo được: 4 hình → ▶ → còn 1 → vẽ thêm 1 → **2** hình xuống đĩa; hai hình ở 600 s và 1200 s
mất vĩnh viễn.

```js
function playClip(c) {
  play = { clip: c, list: play && play.list, i: play && play.i };
  ensureLayer();
  ctx.seek(c.in); ctx.play();       // bản vẽ của trận vẫn nguyên; cửa sổ thời gian
  toast('▶ ' + c.title);            // tự lo hình nào hiện trong đoạn này
}
```

Cửa sổ thời gian làm việc thay `shapes` trở nên **thừa ngay từ đầu**: trong `[c.in, c.out]` thì
đúng những hình có cửa sổ giao với khoảng đó mới sống — chính là tập `saveClip()` đã lọc (đã đo:
clip 190–200 chỉ chép hình ở 194).

`c.shapes` **giữ lại trong schema** — bản xuất `.mp4` cần nó khi analyst đã xoá hình gốc. Nó chỉ
thôi được phép **ghi đè** vào `shapes`.

---

## 11. Xuất ảnh và xuất clip

### 11.1 Đã đúng, và phải giữ đúng

`pump()` gọi `overlaySVGString(now, phase)` **mỗi frame** với `now` từ phần tử video **riêng** đang
render. Bản xuất **đã** tôn trọng cửa sổ thời gian. Với fade (§4.2), bản xuất được luôn phần mờ mà
không thêm dòng nào — vì `alpha()` là hàm của `now`.

### 11.2 Một chỗ phải tách ra

`overlaySVGString()` hiện gọi `paint(now, phase)` — tức **lái lớp đồ hoạ trên màn hình bằng đồng
hồ của bản render**. Với thanh thời gian và ô chọn ở §5–§6 thì nó thành sai rõ ràng.

```js
function overlaySVGString(now, phase) {
  var w = layer ? layer.w : ctx.video.videoWidth,
      h = layer ? layer.h : ctx.video.videoHeight;
  var g = svgEl('g', {}), live = liveAt(now);
  dimNodes(live).forEach(function (n) { g.appendChild(n); });
  live.forEach(function (s) {
    var n = shapeNode(s, phase);
    n.setAttribute('opacity', alpha(s, now));
    g.appendChild(n);
  });
  return '<svg xmlns="…" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">'
       + g.innerHTML + '</svg>';
}
```

**Vẫn đúng một bộ renderer** (`shapeNode` + `alpha`) cho màn hình và cho file. Cái tách ra chỉ là
**cái đích** của node.

Ba điều `film-tools.js` không bao giờ làm — không upload, không ghi video, không tự phô ra — đi
qua toàn bộ bản sửa này **không suy suyển**. Không `fetch`, không Blob mới, không node nào được
tạo khi trận chưa có hình vẽ. Con lăn và phím `S` cũng không đẻ ra đường mạng nào.

---

## 12. Không đụng gì của tính năng khác

### 12.1 Danh sách file

| File | Đổi | Vì sao |
|---|---|---|
| `client/assets/film-tools.js` | toàn bộ thay đổi | **chỉ channel nạp**; tagger không có nó |
| `client/assets/film-tools.css` | thanh thời gian, ô chọn, `.fmt-adjust`, fade | như trên |
| `tests/film-tools.test.js` | **+32 test** (đã làm: +435 dòng) | §13 |
| `tests/asset-versions.json` | sinh lại | `node tests/asset-versions.test.js --update` |
| `client/assets/app.js` | **2 ký tự**: `?v=1` → `?v=2` (dòng 1287, 1289) | không bump thì trình duyệt cũ chạy JS cũ, im lặng |
| `.github/workflows/deploy.yml` | **0** | dòng 54–55 đã `cp` cả hai file |
| `Stats/stats-view.js` | **0** | §12.2 |
| tất cả file còn lại | **0** | |

### 12.2 Vì sao `stats-view.js` không cần một dòng nào — kể cả sau 5 điều chỉnh

| Điều chỉnh | Cần gì từ `stats-view.js` |
|---|---|
| #1 phím `S` | không — `key(e)` đã được quyền từ chối trước |
| #2 kéo/lăn đèn rọi | không — `pointermove`/`wheel` tự đăng ký trên `ctx.stage` |
| #3 con lăn phóng to | không — cùng listener; `applyZoom()` là của `film-tools` |
| #4 chuột phải không pause | không — **gỡ** một lời gọi `ctx.pause()`, không thêm gì |
| #5 giải thích Q1–Q4 | không — chỉ tài liệu |

Bốn lời gọi hiện có là đủ và không cái nào đổi chữ ký: `attach` · `frame` · `key` · `fullscreen`
(+ `detach`). Thanh thời gian `append` vào `ctx.stage`; menu/panel/toast vào `ctx.box`. Cả hai
đường đã tồn tại và đã chạy.

### 12.3 Vì sao các tab khác không thể hỏng

| Tab / trang | Có nạp `film-tools.js`? | Rủi ro |
|---|---|---|
| Stats của tagger (`Stats/index.html`) | **không** — test cũ khoá điều này | không |
| `index.html` (tagger), `Player-Lists`, `auth` | không | không |
| `client/index.html`, `client/login.html` | không | không |
| `client/app.html` → channel, **ngoài** Film | có nạp, nhưng `attach()` chưa chạy | không |
| `client/app.html` → Film, **ngoài** toàn màn hình | có | con lăn trả về ngay ở dòng đầu (§8.1) — trang cuộn như cũ |
| `client/app.html` → Film, **trong** toàn màn hình | có | vùng thay đổi thật sự |
| Worker / Supabase | không có đường code nào | không |

Ba listener mới (`pointermove`, `wheel`, và các listener của thanh thời gian) đều nằm trên
`ctx.stage`, đều đăng ký trong `attach()` và **đều phải được gỡ trong `detach()`** — cặp
add/remove ở đó đang cân đối và test §13-21 khoá nó lại.

---

## 13. Kế hoạch test

Thêm vào `tests/film-tools.test.js` (28 test hiện có, giữ nguyên). Tất cả chạy trên DOM giả có sẵn.

| # | Test | Khoá điều gì |
|---|---|---|
| 1 | vẽ ở `t=194`, đếm node ở `193.9 / 194 / 197.9 / 198.1 / 400 / 2000` | **yêu cầu chính** |
| 2 | kéo bút `t=100`→`t=106`, đếm node ở `t=106` → **≥ 1** | 🔴 (a) |
| 3 | `life:"pinned"` sống ở mọi `now`, và là con đường **duy nhất** | §2.1 |
| 4 | `alpha()` ở `in-f`, `in`, giữa, `out`, `out+f` → `0, 1, 1, 1, 0` | §4.2 |
| 5 | hai `paint()` cùng `now`: node của một hình `n1 === n2` | 🟠 (c) |
| 6 | `dim` bật, tập đèn rọi không đổi: `<mask>` giữ **cùng id** qua 5 frame | 🟠 (c) |
| 7 | kéo đèn rọi → `<mask>` **được dựng lại**, lỗ đi theo | §9 (khoá `id:x:y:r`) |
| 8 | 4 hình → phát clip → vẫn **4**; vẽ thêm → **5** hình xuống đĩa | 🔴 (b) |
| 9 | hình cũ (không `at`/`life`/`fade`) nạp được, cửa sổ y hệt | §2.2 |
| 10 | thanh thời gian: một thanh mỗi hình, đúng vị trí `in`/`out` | §5.1 |
| 11 | thanh thời gian nằm ở dải đen **TRÊN**, và không giao với `#fmCap` | §5.2 |
| **12** | **`openMenu()` KHÔNG gọi `ctx.pause()`** | **#4** |
| **13** | **chuột phải ở `t=194`, video chạy tới `t=197`, bấm "Rọi đèn" → shape có `at`/`in` = 194** | **#4 — hệ quả ở §3.3** |
| **14** | **`key('s')` đặt đèn rọi tại vị trí con trỏ cuối cùng; không có con trỏ → giữa khung** | **#1** |
| **15** | **`key('s')` xong thì `adjust` được đặt** | **#1 + §6.4** |
| **16** | **`key('z')` trả `false`** (phím đã gỡ) | **#3** |
| **17** | **mã nguồn: không mục menu nào còn quảng cáo phím `Z`** | **§7.2** |
| **18** | **lăn khi `adjust` → `r` đổi theo cấp số nhân, kẹp trong `[0.02h, 0.60h]`** | **#2** |
| **19** | **lăn khi không `adjust` → `zoom.k` đổi, kẹp `[1,6]`; về 1× thì `zoom === null`** | **#3** |
| **20** | **`onWheel` trả về sớm khi `full === false` và khi `e.ctrlKey` — không `preventDefault`** | **§8.1** |
| **21** | **`originOnElement()`: neo `y=270` cho `274.5/951` chứ không phải `237.75/951`** | **§8.3** |
| 22 | `detach()` gỡ đủ `pointermove` + `wheel` (số listener về 0) | §12.3 |
| 23 | `1`…`9` đổi thời lượng; `0` ghim; `Delete` chỉ xoá hình đang chọn | §7.3 |
| 24 | `key()` trả `false` cho `1`…`9`/`Delete` khi không có hình chọn/công cụ lắp | §7.3 |
| 25 | mã nguồn **không** chứa `altKey`/`ctrlKey` trong `key()` | §7.4 |
| 26 | `overlaySVGString()` không gọi `paint()` | §11.2 |

Và **giữ nguyên** 4 test cũ khoá bốn lời hứa, cùng các test khoá số lời gọi vào `stats-view.js`.

Đạt được: `node tests/run.js` → **1106/1106**, trong đó **1074 test cũ xanh nguyên vẹn** (hai test cũ được sửa lại có chủ ý: một cái khẳng định `z` bị chiếm, một cái đọc `pump`).

---

## 14. Cache-busting & deploy

```bash
node tests/asset-versions.test.js --update
```

Sinh lại `tests/asset-versions.json` và **báo trang nào còn cầm số cũ**. Ở đây chỉ một trang:
`client/assets/app.js` dòng 1287 và 1289 — `?v=1` → `?v=2` cho cả `.js` lẫn `.css`.
`deploy.yml` **không đổi**: dòng 54–55 đã copy cả hai file.

---

## 15. Lộ trình

| Bước | Nội dung | Đổi hành vi nhìn thấy được? |
|---|---|---|
| **1** | §3.2 chốt `MIN_TAIL`; §10 sửa `playClip`; §3.3 chuột phải không pause + neo `hit.t` | sửa lỗi + yêu cầu #4 |
| **2** | §7.1 phím `S`; §7.2 gỡ `z`; §8 con lăn + §8.3 sửa gốc phóng; §6.4 kéo/lăn đèn rọi | yêu cầu #1 #2 #3 |
| **3** | §2 trường mới + `upgrade()`; §4 fade; §9 đối chiếu DOM | fade 0,25 s, hết giật DOM |
| **4** | §5 thanh thời gian; §6 chọn/sửa/xoá; phím `1`–`9`/`0`/`t`/`Delete` | phần "hệ thống" |
| **5** | §11.2 tách bản xuất khỏi lớp màn hình | không, trừ khi đang render |
| **6** | *(chỉ khi §17-Q1 trả lời là B)* đoạn **đứng hình** trong clip xuất ra | có, lớn — **chờ duyệt riêng** |

Bước 1 và 2 phủ trọn bốn yêu cầu code của bạn và có thể ship độc lập.
Bước 6 **không được làm** cho tới khi §17-Q1 có câu trả lời.

---

## 16. Không làm ở bản này

1. **Không đổi `undo()` thành undo-stack đầy đủ.**
2. **Không đụng `Stats/stats-view.js`** dù có chỗ ngứa tay (ví dụ cho `filmKeys` thả Alt/Ctrl
   xuống cho companion).
3. **Không gỡ mục menu "Phóng to vùng này"** — bạn chỉ yêu cầu gỡ *phím* `z` (§7.2).
4. **Không đưa telestration ra ngoài toàn màn hình.**
5. **Không đồng bộ lên cloud.** Vẫn `localStorage`.
6. **Không bám cầu thủ tự động.**
7. **Không đổi bốn lời gọi** giữa `stats-view.js` và `film-tools.js`.
8. **Không cho các hình khác (mũi tên, vùng, chữ) kéo/lăn được** — yêu cầu #2 nói về đèn rọi.
   Cơ chế ở §6.4 mở rộng sang chúng dễ, nhưng đó là một yêu cầu khác và cần bạn cho phép.

---

## 17. Q1–Q4 — giải thích rõ, và câu trả lời đã chốt

> **Đã trả lời (2026-08-18):** **Q1 = B** · **Q2 = 4,0 s** · **Q3 = Có** · **Q4 = theo đề nghị.**
> Nghĩa là bước 6 của lộ trình **được làm**: clip xuất ra có đoạn đứng hình. Chi tiết thi công ở
> §19.2.

Bản 1 hỏi bốn câu quá gọn. Dưới đây là từng câu: **hỏi gì · vì sao phải hỏi · chọn cái nào thì
được gì · tôi đề nghị gì.** Bạn chỉ cần trả lời `Q1=A, Q2=…` là đủ để tôi bắt tay vào code.

### Q1 — Trong video mẫu, video có **đứng hình lại** khi đồ hoạ hiện lên không?

**Hỏi gì.** Có hai kiểu telestration hoàn toàn khác nhau về kỹ thuật, và nhìn video thì phân biệt
được ngay trong 2 giây:

- **Kiểu A — đồ hoạ đè lên hình đang chạy.** Trận đấu **không dừng**. Mũi tên hiện ra, cầu thủ vẫn
  chạy dưới nó, vài giây sau mũi tên mờ đi. Giống đồ hoạ của một trận trực tiếp.
- **Kiểu B — có đoạn đứng hình.** Trận đấu **dừng lại** ở đúng frame 3:14, đứng yên ở đó khoảng
  3–5 giây trong lúc mũi tên được vẽ ra và người xem đọc nó, **rồi mới chạy tiếp**. Giống phân
  tích chiến thuật trong chương trình bình luận sau trận.

**Vì sao phải hỏi.** Tôi **không đọc được nội dung file `.mp4`** bạn gửi — tôi chỉ xác nhận được
file tồn tại. Và hai kiểu này khác nhau ở chỗ đắt nhất: **file `.mp4` xuất ra**.

- Kiểu A: bản xuất hiện tại **đã làm đúng rồi**. Clip 12 giây ra đúng 12 giây, mũi tên sống 4
  giây trong đó. Không phải viết gì thêm.
- Kiểu B: bản xuất phải **dài hơn nguồn**. Clip 12 giây với một đoạn đứng hình 4 giây phải ra file
  16 giây, trong đó có 4 giây lặp đi lặp lại đúng một frame. Nghĩa là `pump()` phải có thêm một
  nhánh: khi `now` chạm `at` của một *freeze segment*, ngừng đẩy video tới, giữ nguyên frame đó và
  bơm ~`fps × hold` frame giống hệt nhau vào MediaRecorder, rồi mới cho video chạy tiếp. Khoảng
  25 dòng, không khó — nhưng **nó đổi file mà bạn giao cho CLB khác**, nên tôi không tự quyết.

**Chọn gì thì được gì.**

| | Phải viết thêm | Clip 12 s xuất ra dài | Bước 6 của lộ trình |
|---|---|---|---|
| **A** | không gì | 12 s | bỏ |
| **B** | ~25 dòng trong `pump()` + một trường `hold` trên hình | 16 s (nếu đứng hình 4 s) | làm |

**Đề nghị:** trả lời **A** nếu bạn chỉ cần đồ hoạ đúng lúc; **B** nếu video mẫu có khoảnh khắc
hình đứng sững lại. Toàn bộ §1–§15 đúng cho cả hai — chỉ bước 6 là rẽ nhánh.

### Q2 — Một hình vẽ nên sống mặc định bao lâu?

**Hỏi gì.** Khi analyst vẽ một mũi tên mà **không** đụng gì tới cửa sổ thời gian, mũi tên đó nên
sống bao nhiêu giây? Hôm nay là 4,0 s (hằng số `HOLD`, không đổi được).

**Vì sao phải hỏi.** Đây là con số analyst gặp nhiều nhất — 90% số hình sẽ dùng đúng giá trị mặc
định. Đặt sai thì mỗi lần vẽ đều phải sửa tay.

| | Nghĩa là | Hợp khi |
|---|---|---|
| **2,0 s** | rất sát nghĩa "chỉ ở khoảnh khắc đó"; đủ để mắt bắt được, chưa đủ để đọc chữ | phân tích nhanh, nhiều mũi tên liên tiếp |
| **4,0 s** (nay) | đủ cho một phòng họp đọc xong một chú thích ngắn | trình chiếu cho cả đội |
| **8,0 s** | gần như "cả pha bóng" | ít hình, mỗi hình giải thích nhiều |

Dù chọn gì, phím `1`–`9` vẫn đổi được từng hình, và §4.3 vẫn nhớ lựa chọn gần nhất trong phiên.

**Đề nghị: 4,0 s** — giữ nguyên hôm nay, vì nó đã được dùng thật và vì bây giờ nó **hiện ra trên
nhãn công cụ và sửa được**, tức lý do khó chịu chính đã mất.

### Q3 — Các hình bạn ĐÃ vẽ hôm nay có được thêm hiệu ứng mờ không?

**Hỏi gì.** §4.2 thêm `fade` — hình mờ vào 0,25 s và mờ ra 0,25 s thay vì hiện/tắt phựt. Câu hỏi
chỉ về **những hình đã nằm sẵn trong `localStorage`** của bạn, không phải hình vẽ mới.

**Vì sao phải hỏi.** Đây là thay đổi duy nhất trong cả tài liệu **đụng vào dữ liệu đã có**, và tôi
không muốn làm lặng lẽ. Cửa sổ `in`/`out` **không đổi trong cả hai trường hợp** — chỉ khác cách
xuất hiện.

| | Hình cũ sẽ | Đổi một chữ ở |
|---|---|---|
| **Có** | mờ vào/ra 0,25 s, giống hình mới | `s.fade = FADE` |
| **Không** | hiện/tắt phựt đúng như hôm nay | `s.fade = 0` |

**Đề nghị: Có** — để bản vẽ cũ và mới trông như một, và vì 0,25 s không làm sai lệch khoảnh khắc
nào. Chọn "Không" nếu bạn có clip đã xuất ra và muốn xuất lại y hệt.

### Q4 — Thanh thời gian mặc định hiện hay ẩn?

**Hỏi gì.** Thanh ở §5 chiếm dải đen phía trên khung hình. Khi analyst vào toàn màn hình, nó nên
có sẵn hay chờ bấm `t`?

**Vì sao phải hỏi.** Nó là thứ duy nhất trong thiết kế **thêm pixel vào màn hình chiếu**. Trong một
phòng họp có cả đội, mọi thứ không phải trận đấu đều là thứ gây nhiễu.

| | Hành vi | Đánh đổi |
|---|---|---|
| **Hiện khi trận có ≥ 1 hình** | analyst thấy ngay việc mình đã làm; CLB chưa vẽ gì thì không thấy gì mới | trong buổi chiếu cho cả đội, thanh vẫn hiện nếu trận đã có hình — phải bấm `t` để tắt |
| **Luôn ẩn tới khi bấm `t`** | màn hình sạch tuyệt đối | analyst dễ quên là mình có công cụ đó; các cửa sổ thời gian lại thành vô hình như hôm nay |

**Đề nghị: hiện khi trận có ≥ 1 hình.** Nó giữ đúng nguyên tắc "không tự phô ra" với người chưa
vẽ gì, mà vẫn chữa được đúng cái bệnh gốc của tài liệu này — cửa sổ thời gian vô hình.

---

## 18. Đã đo, không đoán

Mọi con số đến từ việc **chạy thật** `client/assets/film-tools.js` trong Node với DOM giả (chính
bộ DOM giả của `tests/film-tools.test.js`), hoặc từ đọc trực tiếp markup/CSS trong repo.

### 18.1 Cửa sổ thời gian có thật và có tác dụng

```
t=194    rendered shape nodes = 2      t=198.1  rendered shape nodes = 0
t=195.5  rendered shape nodes = 2      t=200    rendered shape nodes = 0
t=197.9  rendered shape nodes = 2      t=2000   rendered shape nodes = 0
```

### 18.2 Lỗi 🔴 (a) — hình sinh ra đã chết

```
pen drawn from t=100 to t=106 ->  in=100 out=104
visible nodes at the moment the pen was released (t=106): 0
drag started at 500, released at 503 -> window 500..504  (còn 1.0 s sống)
```

### 18.3 Lỗi 🔴 (b) — phát clip xoá bản vẽ

```
shapes before: 4  →  sau khi bấm ▶: 1  →  ghi xuống đĩa: 2
```

### 18.4 Lỗi 🟠 (c) — dựng lại DOM mỗi frame

```
same DOM node across two frames? false
mask id over 5 frames: ["fmtmask3","fmtmask4","fmtmask5","fmtmask6","fmtmask7"]
```

### 18.5 Con lăn đang trống chỗ

```
grep -rn "wheel|onwheel|mousewheel|DOMMouseScroll"
      client/assets/app.js client/assets/film-tools.js Stats/stats-view.js shared.js
→ không kết quả
```

### 18.6 `#fmStage` có đúng hai con — nên dải đen TRÊN mới trống

```html
<div class="film-stage" id="fmStage">
  <video id="fmVideo" playsinline preload="metadata"></video>
  <div class="film-cap" id="fmCap"></div>          <!-- position:absolute; bottom:0 -->
</div>
```

`.film-cap` trong toàn màn hình cao `clamp(38px,5vh,54px)`, trong khi dải đen chỉ có 73,5 px →
dải **dưới** đã có chủ, dải **trên** trống. (Sửa so với bản 1 — xem §5.2.)

### 18.7 `.film-stage` có cắt, và `.film-full` có cuộn ở màn hẹp

```css
.film-stage{ … overflow:hidden}                       /* ảnh phóng to không tràn */
@media (max-width:900px){ .film-full{padding:10px;overflow:auto} }   /* cuộn là CỐ Ý */
```

Vế thứ hai là lý do listener `wheel` phải nằm trên `ctx.stage` chứ không phải `document` (§8.1).

### 18.8 Gốc phóng to đang sai trên trục bị letterbox

```
transform-origin y code đặt   : 270/1080 = 25% × 951 px = 237,75 px
vị trí THẬT của y=270         : 73,5 + (270/1080)×804   = 274,50 px
                                                   lệch =  36,75 px

3x quanh (480,270), bấm ĐÚNG vào điểm đó -> {"x":480,"y":220.78}    ✓x  ✗y
```

Và phép đảo ngược của `toVideo()` thì **vẫn đúng** khi phóng đều:

```
unzoomed, click (715,475.5) -> {"x":960,"y":540}
2x about centre, same click -> {"x":960,"y":540}
```

### 18.9 Ràng buộc bàn phím

```js
// Stats/stats-view.js — filmKeys(), dòng đầu
if(!film||e.altKey||e.ctrlKey||e.metaKey)return;
```

→ `filmTools.key()` **không bao giờ** nhận tổ hợp Alt/Ctrl/Cmd.

### 18.10 Nền hiện tại

```
node tests/run.js  →  1074/1074 passed
```

### 18.11 Chưa đo được

- **Nội dung video tham chiếu** — không đọc được file `.mp4`. §17-Q1 tồn tại vì lý do đó.
- **Cảm giác thật của fade 0,25 s và của bước lăn 1,08× / 1,1×** trên máy chiếu — phải ngồi trong
  phòng mới biết; cả ba con số đều là thứ dễ chỉnh nhất trong tài liệu.
- **Chi phí thật của đối chiếu DOM** (§9) với ~50 hình cùng sống. Dự đoán rẻ hơn hẳn hôm nay, vì
  hôm nay là dựng lại **tất cả** — nhưng đó là dự đoán, và sẽ được đo khi code xong.

---

## 19. Đã triển khai — và mọi chỗ bản thi công lệch khỏi tài liệu

### 19.1 Tám chỗ lệch, không chỗ nào lặng lẽ

| # | Tài liệu nói | Code làm | Vì sao |
|---|---|---|---|
| 1 | mốc thời gian của hình là **`at`** | là **`s.t`** | **`at` đã có chủ**: nó là **toạ độ** của spotlight / marker / text (`s.at = {x,y}`) từ bản đầu. Dùng lại tên đó là ghi đè lên vị trí của chính những hình ấy. `in`/`out`/`life`/`fade`/`rev` giữ nguyên tên |
| 2 | chuột phải trúng đèn rọi thì trúng **vành tròn** | trúng **cả mặt đĩa** | analyst chỉ vào cầu thủ được rọi là chỉ vào **giữa** vòng tròn. Đo bằng số: tâm cách vành 81 px, dung sai 54 px → bấm đúng giữa đèn rọi lại **trượt**. `distTo` cho spotlight thành `max(0, dist − r)` |
| 3 | bề rộng thanh = đúng tỉ lệ cửa sổ | có **sàn 0,4 %** | một mốc 4 giây trong hiệp 45 phút là 0,13 % — khoảng **2 pixel**, không nhìn thấy và không bấm trúng |
| 4 | — | `.fmt-strip` thêm `box-sizing:border-box` | **chỉ DOM thật mới lộ ra**: JS đặt `width` bằng bề rộng ẢNH, viền 1 px mỗi bên đẩy thanh **rộng hơn khung hình 2 px**. Đo được: 1432 px thay vì 1430 |
| 5 | `zoomBy()` cần có lớp vẽ | không cần | phóng to là chuyện của **video**, không phải của bản vẽ. Bản đầu `return` sớm khi `layer` null → **lăn chuột trên một trận chưa vẽ gì thì không phóng được** |
| 6 | `paintDim` xoá bằng `textContent = ''` | xoá bằng `empty()` | tương đương trong DOM thật; nhưng `empty()` là thứ **kiểm được**, và chính chỗ này che mất một lỗi khi chạy trên DOM giả |
| 7 | — | `paint()` gỡ node ra **trước** khi xếp lại thứ tự | `appendChild` một node đã là con thì **dời** nó — nhưng chỉ trong DOM thật. Gỡ trước rồi gắn lại là đúng ở cả hai chỗ và không tốn gì |
| 8 | — | `textAt()` thêm chốt `shut` | **đây là chỗ duy nhất tôi đụng vào hành vi sẵn có ngoài 5 yêu cầu — xem §19.4** |

### 19.2 Đoạn đứng hình (Q1 = B) — thi công thế nào

Một hình mang `freeze: <giây>` (đặt trong menu `Hình ở đây… › Đứng hình khi xuất clip`). Khi
`exportClip()` chạy:

- gom mọi hình có `freeze > 0` nằm trong `[a, b]`, sắp theo thời gian;
- **gộp các mốc cách nhau dưới 0,25 giây và lấy thời lượng dài nhất** — một khung hình thường có
  mũi tên + vùng + chú thích cùng lúc, không gộp thì phim dừng ba lần liên tiếp;
- `pump()` có thêm một nhánh: chạm mốc thì `v.pause()`, giữ nguyên khung hình đó và tiếp tục bơm
  frame vào MediaRecorder cho tới khi **đồng hồ tường** hết hạn, rồi `v.play()`;
- `total = dur + holdTotal`, nên phần trăm tiến độ nói đúng độ dài **file** chứ không phải độ dài
  đoạn nguồn. Clip 12 giây với một mốc đứng hình 4 giây ra file **16 giây**.

Nhịp đập của đèn rọi vẫn đập trong lúc đứng hình: `drawOne(t, ph, cb)` tách **thời điểm** khỏi
**pha**, nên ảnh đứng yên mà đồ hoạ vẫn sống.

Âm thanh **im trong đoạn đứng hình**, vì phần tử nguồn đang dừng. Đó là câu trả lời đúng chứ
không phải thiếu sót: bình luận nói tiếp trên một khung hình đứng còn khó chịu hơn.

**Không làm bản xem trước trên màn hình.** §15 bước 6 nói "đoạn đứng hình **trong clip xuất ra**",
và chỉ thế. Cho `frame()` tự dừng video khi chạy qua một mốc là đúng thứ yêu cầu #4 vừa cấm. Nếu
bạn muốn xem trước mà không phải render, đó là một yêu cầu riêng — thanh thời gian đã hiện sẵn
`❚❚ 4s` trên tooltip của hình có đứng hình.

### 19.3 Đã đo trong DOM THẬT, không phải DOM giả

Bộ test dùng DOM giả, và **DOM giả đã hai lần che mất lỗi** (chỗ lệch #6 và #7 ở trên). Nên toàn
bộ module còn được chạy trong trình duyệt thật, trên một trang dựng riêng, với một `<video>` thật
và `videoWidth/videoHeight` gắn qua `defineProperty` — **40 phép kiểm, tất cả xanh**:

```
1.  khung hình trong stage letterbox    ảnh 1430x804, 73,3 px đen phía trên      ✓
2.  cửa sổ thời gian                    193.5→0 · 194→1 · 197.9→1 · 198.4→0
                                        · 400→0 · 2000→0 node                    ✓
3.  đối chiếu DOM                       cùng một node qua 2 frame, không nhân đôi ✓
4.  độ mờ                               opacity ghi mỗi frame, mờ dần ở đuôi      ✓
5.  classList trên <g> của SVG          .fmt-sel bám đúng hình đang chọn          ✓
6.  mask làm tối                        id giữ nguyên khi đứng yên, đổi khi
                                        đèn rọi to ra, KHÔNG để lại mask cũ       ✓
7.  innerHTML trên <g> RỜI              <svg> đầy đủ, có <circle>, có opacity,
                                        và KHÔNG động tới lớp trên màn hình       ✓
8.  zoom                                video và SVG có transformOrigin KHÁC nhau,
                                        y = 274,5/951 chứ không phải 237,75/951   ✓
9.  thanh thời gian                     nằm trên ảnh, rộng đúng 1430 px,
                                        mỗi hình một thanh, thanh bấm được        ✓
10. lớp vẽ nhận con trỏ                 none → auto khi chỉnh → none khi thoát    ✓
11. detach                              không còn layer, không còn thanh,
                                        không còn transform trên video            ✓
```

Ba điều chỉ DOM thật mới nói được, và cả ba đều đã được xác nhận là **chạy**: `classList` trên
phần tử SVG, `innerHTML` trên một `<g>` **chưa gắn vào tài liệu** (nếu nó trả về chuỗi rỗng thì
bản xuất sẽ lặng lẽ không có đồ hoạ), và `getComputedStyle` xác nhận đúng luật `pointer-events`.

### 19.4 Một chỗ tôi đụng ngoài 5 yêu cầu — nói rõ để bạn quyết

`textAt()` — ô nhập chữ — có sẵn một lỗi: `done()` được gọi từ **cả** `Enter` **lẫn** `blur`.
Enter gỡ ô nhập rồi tạo hình; nếu trình duyệt sau đó vẫn bắn `blur` trên node vừa bị gỡ thì
`done(true)` chạy **lần thứ hai** và tạo **hình thứ hai giống hệt**. Và `Escape` thì không huỷ
được: nó gọi `done(false)`, xong `blur` gọi `done(true)` và chữ vẫn được tạo.

Tôi thêm một cờ `shut` để `done()` chỉ chạy một lần. **Lý do tôi không để nguyên:** hàm này là
hàm tôi *bắt buộc* phải sửa (neo thời gian), và để lại một đường có thể gọi `commit()` hai lần
ngay dưới thay đổi của mình thì không ổn.

**Nếu bạn muốn giữ nguyên hành vi cũ, xoá 2 dòng** (`var shut = false;` và `if (shut) return;`)
là xong — không gì khác phụ thuộc vào nó.

### 19.5 Cái vẫn chưa đo được

- **Cảm giác thật trên máy chiếu**: fade 0,25 s, bước lăn 1,08× / 1,1×, sàn 0,4 % của thanh. Cả
  bốn con số đều nằm một chỗ ở đầu file và đổi trong một phút.
- **Một lần xuất clip thật có đoạn đứng hình.** `MediaRecorder` không có trong môi trường test, và
  trang kiểm tra không có video thật để render. Đường ống đứng hình được khoá bằng test đọc mã
  nguồn (§13-27) chứ **chưa phải bằng một file `.mp4` mở lên xem**. Đây là thứ đầu tiên nên thử
  khi bạn mở app: cắt một clip ngắn, đặt `Đứng hình khi xuất clip = 3 s`, tải về và đếm giây.
- **Chi phí đối chiếu DOM với ~50 hình cùng sống** — vẫn là dự đoán, không phải số đo.

---

## 20. Tóm tắt một câu

Cửa sổ thời gian đã có và đã chạy — **4 giây, cố định, vô hình, không sửa được**; tài liệu này biến
nó thành thứ analyst **nhìn thấy, chọn được, sửa được**, cộng năm điều chỉnh bạn yêu cầu — phím `S`
sống lại, đèn rọi kéo và lăn được, con lăn thay `z`, chuột phải thôi dừng video — và làm tất cả
**bên trong hai file mà chỉ channel nạp**, với **0 dòng** chạm vào `Stats/stats-view.js`.
