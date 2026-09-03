# Giao diện mobile cho `client/app.html` — Detailed Design

**Trạng thái: ĐÃ TRIỂN KHAI, 2026-09-03.** Năm câu hỏi ở §12 đã được duyệt (Q1 đồng ý,
Q2 đồng ý, Q3 đồng ý, Q4 **sửa**, Q5 40px) và bản này đã được viết vào repo. Test:
**1467/1467 passing** (baseline trước khi làm: 1456/1456; +11 test mới ở
`tests/mobile-ui.test.js`). §13 ghi lại chính xác cái gì đã đổi và kết quả đo cuối cùng.

**Những gì đã đổi:**

1. **Thêm mới** `client/assets/app-mobile.css` — toàn bộ nằm trong một khối
   `@media (max-width:720px)`, mọi selector bắt đầu `body.app`.
2. **Thêm một dòng `<link>`** vào `client/app.html`.
3. **Thêm một khối `@container`** vào cuối phần match-list của `client/assets/app.css`
   — đây là Q4, và nó **không** phải rule mobile (xem §13.2 để biết vì sao Q4 hoá ra là
   một lỗi khác hẳn với cái bản nháp đầu tiên đoán).
4. `?v=` của `app.css` 24 → 25 trên **ba** trang nạp nó, cộng `?v=1` cho file mới, cộng
   một dòng `cp` trong `deploy.yml` và manifest `tests/asset-versions.json`.
5. **Thêm mới** `tests/mobile-ui.test.js` (11 test).

**KHÔNG** sửa `client/assets/app.js` (0 dòng JS). **KHÔNG** sửa `client/assets/site.css`.
**KHÔNG** sửa `shared.css`, `Stats/stats-view.css`, `Stats/stats-view.js`,
`Stats/report.js`, `index.html`. **KHÔNG** đổi DOM, route, handler, hay bất kỳ hành vi
nào. §7 liệt kê từng thứ không được đụng và lý do.

Ở **721, 768, 1100, 1280 và 1440px**, before và after **giống nhau từng con số một** —
đã đo, §13.3. Dải 860-1000px thay đổi có chủ ý: đó là Q4.

---

## 0. Cách đo — để bản này kiểm chứng được, không phải để tin

Mọi con số dưới đây đo bằng Chrome headless qua `client/demo-cdp.js` (driver CDP đã có sẵn
trong repo, không cần npm), trên một trang tĩnh dựng trong scratchpad. Trang đó **link
thẳng bốn stylesheet thật** của repo:

```
client/assets/site.css   client/assets/app.css   shared.css   Stats/stats-view.css
```

và chứa markup đại diện của **cả bốn màn hình**: Matches (`.mlist`/`.mrow`), Data
(`.dtabs`/`.dsubs`/`.tstats`/`.kpis`/`table.stbl`), phân tích một trận (`CHROME` của
`Stats/stats-view.js` — `.pt-stats-bar`, `.sub-row`, `.stats-wrap`, `.gen-layout`,
`.chart-row`, `.hm-flex`, `.sh-grid`, `.film-grid`) và Channel (`.form-card`,
`.inv-form`). Không cần đăng nhập, không chạm mạng, không chụp màn hình.

Đo ở **7 chiều rộng**: 320, 390, 430, 720, **721**, 900, 1280. Ba mốc cuối là để chứng
minh bản thiết kế **không** với tới desktop.

> Vì sao không đo trên hoangnams.com: máy này đang bị hijack DNS (xem
> `docs/film-export-cors-design.md` và ghi chú trong `client/demo-cdp.js:32-45`), và trang
> thật cần đăng nhập mới có channel để vẽ. Trang tĩnh cho đúng CSS thật với ít biến số
> hơn. Điều trang tĩnh **không** thay được: cuộn quán tính, bàn phím ảo, thanh công cụ
> Safari — §8 xếp chúng vào phần phải kiểm bằng máy thật.

---

## 1. Bảy khiếm khuyết, đã đo

Đo ở 390×844 (iPhone 14/15) trừ khi ghi khác.

| # | Khiếm khuyết | Số đo | Nguồn |
|---|---|---|---|
| 1 | **122px chrome cố định** trước pixel nội dung đầu tiên (header 61 + dải nav 61) | `chromeTop=122` | `app.css:134` |
| 2 | **Dải nav cuộn ngang, giấu mất 95px** — "About Hoang Nam" nằm hoàn toàn ngoài màn hình (`right=465` trên viewport 390) | `side.scrollWidth-clientWidth=95` (390) · `125` (360) · `165` (320) | `app.css:134-140` |
| 3 | **Trang cuộn ngang thật ở 320px**: `documentElement.scrollWidth=331` | `.pt-views` rộng 311px trong hộp 280px, `.stats-toggle` không `flex-wrap` | `shared.css:28` |
| 4 | **Header phình lên 77px ở 320px** vì nút "Sign out" bị xuống dòng | `headerH=77` | `.btn` không có `white-space:nowrap` |
| 5 | **Một dòng trận cao 172px** — bốn trận ≈ 690px cuộn | `.m-det` cao 62px vì tên giải xuống 2 dòng rồi sân xuống dòng 3 | `app.css:297-330` |
| 6 | **Trang phân tích tràn ngang 132px** bên trong `.stats-wrap` | xem bảng §1.1 | `shared.css` + `stats-view.css` |
| 7 | **6 control cao 23px, 22 control cao 24-43px** | `.chip` 23px, `.stats-toggle button` 26px, `.exports button` 28px, `.mrow-more` 28×28, `.chan` 30px | nhiều nơi |

### 1.1 Vì sao trang phân tích tràn — bảy con số cứng viết cho màn hình desktop

`.view` ở 390px chỉ còn **350px** nội dung (390 − 2×`--gut` 20px). Bên trong nó, hai
stylesheet của app tag đặt sàn như sau:

| Khai báo | File:dòng | Rộng thật ở 390 | Thừa ra |
|---|---|---|---|
| `.gen-center{flex:1;min-width:420px}` | `Stats/stats-view.css:202` | 420 | **+72** |
| `.oth-card{flex:1;min-width:420px}` | `Stats/stats-view.css:97` | 420 | **+72** |
| `.donut-card{flex:none}` + `.donut-legend{min-width:240px}` | `shared.css:74` + `:62` | 480 | **+132** |
| `.scatter-card,.map-card{flex:1;min-width:360px}` | `shared.css:75` | 360 | **+12** |
| `.hm-flex>div:first-child{flex:1;min-width:340px}` | `Stats/stats-view.css:173` | 348 | 0 (vừa) |
| `.gen-form{flex:none;width:310px}` | `Stats/stats-view.css:204` | 310 | — (bó cạnh `.gen-center`) |
| `.gen-row{grid-template-columns:60px 1fr 150px 1fr 60px}` | `shared.css:114` | tối thiểu 302 | tràn ở ≤360 |

Hệ quả cụ thể: mở một trận trên điện thoại, sang tab **Overall** hoặc **Dashboard**, phần
so sánh hai đội và biểu đồ donut **bị cắt ngang** — người dùng phải vuốt ngang bên trong
một khung cuộn lồng trong trang, và `body{overflow-x:hidden}` (`site.css:37`) khiến một
phần đơn giản là không tới được.

**Điểm mấu chốt về thứ tự nạp:** hai file này **không** nằm trong `<head>` của
`app.html`. `app.js` chèn chúng lúc chạy bằng `document.head.appendChild(n)`
(`client/assets/app.js:1854`), tức là **sau** `app.css`. Nên một rule cùng độ đặc hiệu
viết trong `app.css` sẽ **thua**. Đây là lý do §3 chọn tiền tố `body.app` chứ không phải
chỉ đặt rule ở cuối file.

---

## 2. Ràng buộc — những thứ bản thiết kế phải sống chung

### 2.1 Các khẳng định đã bị test khoá

Đây là những dòng test sẽ đỏ nếu chạm nhầm chỗ. Đã đọc từng dòng:

| Test | Khoá điều gì | Hệ quả cho thiết kế |
|---|---|---|
| `client-channels.test.js:645` | `.exec(APPCSS)[0]` — khối **`@media (max-width:820px)` ĐẦU TIÊN** trong `app.css` phải chứa `.m-away{grid-area:away}` | Không được chèn khối 820px nào **trước** khối dòng 297 |
| `client-channels.test.js:731-734` | Mọi rule `body.rail-in .side` phải nằm trong khối `@media (min-width:861px)` | Không đụng `.rail-in` |
| `client-channels.test.js:739` | `.side-grp{display:none}` phải xuất hiện sau `@media (max-width:860px){` | Giữ nguyên khối 860px |
| `client-channels.test.js:741` | `APPCSS.indexOf('.side-grp{\n  display:flex')` phải **đứng trước** `.side-grp{display:none}` | Không reformat `.side-grp` |
| `client-channels.test.js:757` | `.side-foot{…margin-left:auto…}` phải nằm sau một `@media (max-width:860px)` | **Không được xoá** rule đó — thanh dưới phải *đè* nó ở 720px, không phải *thay* nó |
| `data-page.test.js:371`, `match-edit.test.js:268`, `player-data.test.js:622` | chuỗi chính xác `@media (max-width:720px){table.stbl .c-date, table.stbl .c-opp{position:static}` | Nếu sau này muốn đóng băng lại một cột trên điện thoại (§12 Q3), phải là rule **thêm**, không phải sửa |
| `data-page.test.js:387` | `.exec(css)[0]` — khối `@media (max-width:640px)` **đầu tiên**, và `grid-template-columns` **đầu tiên** trong nó, phải là của `.rrow` | Không tạo khối 640px mới có `grid-template-columns` đứng trước |
| `client-channels.test.js:613-637` | `--m-cols` sáu track, `home == away`, tổng sàn + gap + 34 ≤ 820 | Không đụng dòng trận ở desktop |
| `stats-view.test.js:272` | `shared.css` và `Stats/stats-view.css` **không được** có selector bắt đầu bằng tag trần | File mới nên theo cùng kỷ luật đó |

**Bản thiết kế này không sửa `app.css`, nên toàn bộ bảng trên tự động an toàn.** Bảng vẫn
được liệt kê vì nó giải thích *vì sao* phương án "thêm khối media vào cuối `app.css`" bị
loại (§3.2).

### 2.2 Thứ tự nạp stylesheet lúc chạy

```
<head> lúc parse:      site.css?v=3  →  app.css?v=24  →  [app-mobile.css?v=1]   ← đề xuất
mở một trận, app.js chèn:  shared.css?v=14  →  Stats/stats-view.css?v=10  →  film-tools.css?v=4
```

Nên: rule của `app-mobile.css` **thắng** `app.css` khi hoà độ đặc hiệu (nhờ đứng sau),
nhưng **thua** `shared.css`/`stats-view.css` khi hoà. Mọi override lên hai file đó phải
cao hơn một bậc — `body.app .x` (0,2,0) so với `.x` (0,1,0). Đây vừa là kỹ thuật, vừa là
hàng rào phạm vi (§3.3).

### 2.3 Deploy whitelist

`.github/workflows/deploy.yml` chỉ `cp` từng file được liệt kê tên. File mới **không có
dòng `cp` sẽ 404 trên site thật trong khi CI vẫn xanh**. May là đã có test bắt:
`asset-versions.test.js` — *"every versioned asset is one the deploy actually copies"*.

### 2.4 Manifest phiên bản

`tests/asset-versions.test.js` băm nội dung từng asset và đối chiếu với `?v=`. File mới
phải: có `?v=1` trong `app.html`, có dòng `cp`, và được thêm vào
`tests/asset-versions.json` bằng `node tests/asset-versions.test.js --update`. Bỏ bước
này → test đỏ với thông điệp *"is newly versioned and not in the manifest yet"*.

### 2.5 Đường xuất PDF — đã kiểm, không bị ảnh hưởng

`Stats/report.js` dựng PDF bằng **html2canvas** (`report.js:1476`), tức là CSS *có thể*
chạm tới nó. Đã grep toàn bộ markup mà nó sinh ra: chỉ dùng namespace `rp-*` (và một class
`el-c`), dựng trong host `position:fixed;left:-9999px;width:794px` với `.rp-page{width:794px}`
(`report.js:113`, `report.js:1468`). **Không một selector nào trong file đề xuất chạm tới
`rp-*`.** PDF xuất từ điện thoại ra đúng như xuất từ laptop.

---

## 3. Quyết định kiến trúc

### 3.1 Một file mới, không phải sửa file cũ — **chọn**

`client/assets/app-mobile.css`. Lý do quyết định: yêu cầu số một của bản này là *"đảm bảo
không xảy ra bug ở các tab khác"*. Một file riêng cho phép một câu bảo đảm mạnh nhất có
thể nói: **xoá đúng một dòng `<link>` là app trở về y hệt hôm nay, từng byte.** Không có
phương án nào khác cho được câu đó.

### 3.2 Vì sao không thêm khối media vào cuối `app.css`

- Vẫn thua `shared.css`/`stats-view.css` khi hoà độ đặc hiệu (§2.2) — nên vẫn phải viết
  `body.app`, tức là không tiết kiệm được gì.
- `app.css` phải bump `?v=24 → 25` và băm lại; mọi test đọc `APPCSS` (8 file, §2.1) chạy
  lại trên một file đã đổi. Rủi ro cao hơn hẳn mà không được lợi gì.
- Rollback trở thành "revert một diff giữa hai bản của file 892 dòng" thay vì "xoá một dòng".

### 3.3 Ba hàng rào, chồng lên nhau

| Hàng rào | Nội dung | Nó chặn cái gì |
|---|---|---|
| **Nạp** | file chỉ được `<link>` từ `client/app.html` | `client/index.html` (marketing, `<body>` không class), `login.html` (`body.auth-page`), `guide.html` (`body.guide`), và **toàn bộ app tag** không bao giờ tải file này |
| **Media** | **mọi** rule nằm trong đúng một `@media (max-width:720px)` | Không một pixel nào ở ≥721px bị chạm — đã đo, §6 |
| **Scope** | **mọi** selector bắt đầu bằng `body.app` | Kể cả nếu file bị nạp nhầm ở đâu đó, không trang nào ngoài `app.html` mang class `app` |

### 3.4 Vì sao mốc 720px

720 **đã là** mốc của repo này, không phải mốc mới: `app.css:53` giấu `.app-user .who`,
`app.css:586` nhả hai cột đóng băng của `table.stbl`. Dùng lại nó là theo đúng câu đã viết
trong `app.css:646` — *"the same question does not get a second answer here"*.

Hệ quả phân tầng:

- **≤720px — điện thoại dọc.** Thiết kế mới.
- **721-860px — tablet dọc (iPad 768).** Giữ nguyên hôm nay: dải nav ngang trên đầu.
- **≥861px — desktop.** Giữ nguyên: rail dọc, kéo vào/ra được.

Điện thoại xoay ngang (932×430) rơi vào ≥861px và nhận layout desktop — đúng, vì lúc đó
chiều rộng thật sự có.

---

## 4. Thiết kế, theo từng màn hình

### 4.1 Điều hướng: dải ngang trên đầu → **thanh tab dưới đáy**

```
HÔM NAY (390px)                     ĐỀ XUẤT (≤720px)
┌──────────────────────────┐        ┌──────────────────────────┐
│ N  SAINT LUCIA ▾   D [⏻] │ 61px   │ N  SAINT LUCIA ▾   D [⏻] │ 61px
├──────────────────────────┤        ├──────────────────────────┤
│ ⌂Home  #Channel  ⊪Data  →│ 61px   │                          │
│         ↑ cuộn ngang,    │        │        NỘI DUNG          │
│         giấu 95px        │        │      +61px chiều cao     │
├──────────────────────────┤        │                          │
│                          │        │                          │
│        NỘI DUNG          │        ├──────────────────────────┤
│                          │        │  ⌂     #      ⊪     ⓘ   │ 57px
│                          │        │ Home Channel Data About │ fixed
└──────────────────────────┘        └──────────────────────────┘
```

- `.side` thành `position:fixed; bottom:0` với `grid-template-columns:repeat(4,1fr)`.
  Bốn ô bằng nhau: Home, Channel, Data, About Hoang Nam. **Cả bốn đều trên màn hình** —
  đo được `left/right` của từng mục, 4/4 nằm trong viewport ở cả 320px.
- Icon trên, nhãn dưới, mỗi ô cao **56px** (trước: 40px, và ô thứ tư ở ngoài màn hình).
- Vạch đỏ trạng thái chuyển từ `border-bottom` sang `border-top` — nó vẫn phải chỉ về phía
  nội dung.
- `.view` nhận `padding-bottom:calc(74px + env(safe-area-inset-bottom,0px))` để trang kết
  thúc **trên** thanh, không phải dưới nó.
- `.menu{z-index:70}` — dropdown `⋯` của dòng trận cuối cùng phải mở **đè lên** thanh
  (thanh ở `z-index:45`, dưới header sticky 50, trên nội dung). `.film-full` ở 2000 nên
  chế độ toàn màn hình vẫn phủ tất cả.

**Rule `.side-foot{margin-left:auto}` của khối 860px được giữ nguyên**, chỉ bị đè bằng
`margin:0` ở khối 720px — nên `client-channels.test.js:757` vẫn xanh và tablet 721-860px
vẫn hành xử như cũ.

### 4.2 Thanh trên: tên channel co được, "Sign out" không xuống dòng

- `.chan-wrap{flex:1 1 auto; min-width:0}` + ellipsis cho `#chanName`: một channel tên dài
  không còn đẩy "Sign out" ra khỏi màn hình (hôm nay `.app-top` là flex không wrap và
  `body{overflow-x:hidden}` cắt phần thừa — nút đăng xuất **không bấm được**).
- `.app-top .btn{white-space:nowrap}` — sửa header 77px ở 320px.
- `.chan{min-height:44px}` — từ 30px.

### 4.3 Danh sách trận: 172px → 136px một dòng

```
HÔM NAY (172px)                            ĐỀ XUẤT (136px)
Wednesday, 12 June 2024        [D] [▸] ⋯   Wednesday, 12 June 2024      [D][▸]  ⋯
Home · Match ID 55357                      Home · Match ID 55357              (44×44)
   Saint Lucia  [2:2]  Aruba                  Saint Lucia  [2:2]  Aruba
FIFA World Cup qualification –              FIFA World Cup qualifi… │2026│Round 2
CONCACAF second round │2026│Round 2         Wildey Turf
Wildey Turf
```

`.m-det-top{flex-wrap:nowrap; flex:1 1 260px; min-width:0}` — ba mảnh (giải · mùa · vòng)
ở lại **một dòng**, tên giải dài tự ellipsis thay vì đẩy hai mảnh kia xuống dòng riêng.
Sân xuống dòng dưới. **Không mất một chữ nào**; `title` của ô vẫn mang toàn văn.

`.mrow-more` 28×28 → **44×44**, cột của nó trong `.mrow-wrap` từ 34px → 44px.

Ở 720px, dòng trận cũng **ngắn lại** 128 → 119px, không phải dài ra (đã đo — bản nháp đầu
làm nó dài thêm 8px, `flex:1 1 260px` là cách sửa).

### 4.4 Data: tab chia đều, chip cuộn ngang

- `.dtabs` → `grid-template-columns:repeat(3,1fr)`. Ba tab **luôn thấy cả ba**, bằng nhau,
  cao 44px. Hôm nay ở 320px chúng bị bóp và "Player Data" xuống hai dòng (đo được: cao
  56px).
- `.dsubs` (6 chip category) → cuộn ngang, mỗi chip cao **40px** (từ 23px). Cuộn an toàn ở
  đây vì `.dsubs` căn trái — xem §8.3 về vì sao `.sub-row` **không** được làm như vậy.

### 4.5 Trang phân tích một trận — phần sửa lớn nhất

Bảy sàn desktop ở §1.1 được nhả ra, mỗi cái một dòng, tất cả tiền tố `body.app`:

```css
body.app .gen-center{min-width:0; width:100%; flex:1 1 100%}
body.app .gen-form{width:100%; flex:1 1 100%}
body.app .oth-card{min-width:0; flex:1 1 100%}
body.app .donut-card{flex:1 1 100%; min-width:0}
body.app .donut-legend{min-width:0; flex-basis:100%}
body.app .scatter-card, body.app .map-card{min-width:0; flex:1 1 100%}
body.app .sr-card, .dl-map, .dl-side, .dm-map, .dm-side{min-width:0; max-width:none; flex:1 1 100%}
body.app .hm-flex > div:first-child{min-width:0; flex:1 1 100%}
body.app .hm-list{width:100%; flex:1 1 100%}
body.app .gen-row{grid-template-columns:36px minmax(0,1fr) 92px minmax(0,1fr) 36px; gap:6px}
```

Kết quả: **mọi thứ xếp chồng một cột**, không cắt, không cuộn ngang. Chú giải donut rơi
xuống dưới vòng tròn thay vì đứng cạnh nó và đẩy thẻ rộng 480px.

Thanh chrome của view:

- `.pt-views` (Overall/Dashboard/Stats/Film) → lưới 4 cột đều, mỗi nút **44px**. Đây là thứ
  gây cuộn ngang toàn trang ở 320px (§1 #3).
- `.pt-exports` (XLSX/CSV/PDF) → lưới 3 cột đều, 40px, bỏ `margin-left:auto`.
- `.sub-row` (Home/Away và 6 category) → **giữ nguyên hành vi wrap**, chỉ nâng nút lên
  40px. Xem §8.3.

### 4.6 Ô nhập liệu: 16px

`body.app .field input, .form-card select, .inv-form input[type=email], .inv-form select,
.rsel{font-size:16px}` — dưới 16px, iOS Safari **tự phóng to trang** khi focus và không
thu lại. Ảnh hưởng: form tạo/sửa channel, ô mời thành viên, select vai trò.

---

## 5. Toàn văn stylesheet đề xuất

Đây là file đã prototype và đã đo. 92 dòng.

```css
/* ============================================================
   client/assets/app-mobile.css — the app on a phone.

   Loaded ONLY by client/app.html, and only ever as the last sheet
   in its <head>. Three fences, one on top of the other:

     nạp     nothing else links this file;
     media   every rule is inside the one @media below;
     scope   every selector starts body.app, which no page of the
             tagging app carries.

   The body.app prefix is not decoration. app.js injects shared.css
   and Stats/stats-view.css at runtime (app.js:1854), so they land
   AFTER this file: a rule of equal specificity here would lose.
   body.app .x is (0,2,0) against their (0,1,0), which wins whatever
   the order.

   Delete the <link> in app.html and the app is byte-for-byte what
   it was before this file existed.
   ============================================================ */
@media (max-width:720px){

/* ---------- 1. the top bar ---------- */
body.app .app-top{gap:10px; padding:8px var(--gut)}
body.app .chan-wrap{min-width:0; flex:1 1 auto}
body.app .chan{min-width:0; width:100%; min-height:44px; padding:5px 8px 5px 6px}
body.app .chan > span:first-child{
  min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block;
}
body.app .app-user{flex:none; gap:8px; margin-left:0}
/* a channel with a long name used to push Sign out off a 320px screen, where
   body{overflow-x:hidden} then made it unreachable rather than merely cramped */
body.app .app-top .btn{white-space:nowrap; padding:11px 12px; min-height:44px}

/* ---------- 2. the rail becomes a bottom bar ----------
   The 860px block above turns the rail into a row across the top and scrolls
   it sideways; on a phone that row hides its last entry (95px of it at 390px).
   Four equal cells at the foot of the screen show all four, and hand the page
   back the 61px the row was costing it. Every rule here OVERRIDES the 860px
   block, never edits it — between 721 and 860px the top row is unchanged. */
body.app .side{
  position:fixed; left:0; right:0; bottom:0; top:auto; z-index:45;
  display:grid; grid-template-columns:repeat(4,minmax(0,1fr));
  gap:0; padding:0 0 env(safe-area-inset-bottom,0px);
  overflow:visible; min-height:0;
  border-top:1px solid var(--line); border-bottom:0; border-right:0;
  background:var(--carbon);
}
body.app .side-foot{margin:0; padding:0; border:0; display:flex; min-width:0}
body.app .side a{
  flex-direction:column; align-items:center; justify-content:center; gap:4px;
  padding:8px 4px; min-height:56px; width:100%; border-radius:0;
  border-left:0; border-bottom:0; border-top:2px solid transparent;
  font-size:10.5px; line-height:1.25; text-align:center; white-space:nowrap;
}
/* the lit edge points at the content, so at the foot of the screen it is the top one */
body.app .side a.on{border-bottom:0; border-top-color:var(--red)}
body.app .side a span{max-width:100%; overflow:hidden; text-overflow:ellipsis}
body.app .side a i, body.app .side a i svg{width:20px; height:20px}
/* the bar floats over the page, so the page has to end above it */
body.app .view{padding-bottom:calc(74px + env(safe-area-inset-bottom,0px))}
/* the ⋯ on the last match row opens downward: over the bar, not under it */
body.app .menu{z-index:70}

/* ---------- 3. the match list ---------- */
body.app .mrow-wrap{grid-template-columns:minmax(0,1fr) 44px}
body.app .mrow-more{width:44px; height:44px; margin:4px 0 0}
body.app .mrow{padding:12px 2px; row-gap:8px}
/* competition | season | round stay on ONE line, the long name ellipsising,
   rather than the name wrapping and pushing the other two onto a line of their
   own. Nothing is dropped: the cell still carries the whole of it in title. */
body.app .m-det{flex-wrap:wrap; gap:3px 8px}
body.app .m-det-top{flex-wrap:nowrap; min-width:0; flex:1 1 260px; gap:6px}
body.app .m-det-top b{font-size:11.5px}
body.app .m-det em{min-width:0}

/* ---------- 4. tabs and chips ---------- */
/* three tabs, three equal cells: squeezed into a flex row, Player Data went to
   two lines at 320px */
body.app .dtabs{display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0}
body.app .dtab{min-height:44px; padding:10px 6px; font-size:13px}
/* .dsubs reads left, so a scroller here cannot strand its first chip */
body.app .dsubs{flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; padding-bottom:2px}
body.app .dsubs::-webkit-scrollbar{display:none}
body.app .chip{flex:none; min-height:40px; display:inline-flex; align-items:center}

/* ---------- 5. the mounted analysis ---------- */
body.app .pt-stats-bar{gap:8px}
/* 4 buttons at 311px in a 280px box is where the 320px page got its sideways
   scroll: .stats-toggle is a flex row with no wrap */
body.app .pt-views{display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); width:100%; gap:6px}
body.app .pt-views button{min-height:44px; padding:5px 4px; font-size:11.5px}
body.app .pt-exports{margin-left:0; width:100%; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px}
body.app .pt-exports button{min-height:40px}
/* .sub-row is justify-content:center — it WRAPS rather than scrolls, because a
   centred overflow scroller strands its first items out of reach */
body.app .sub-row{row-gap:6px}
body.app .sub-row button{min-height:40px}

/* every floor the tagger's sheets set for a desktop column, released */
body.app .gen-layout{padding:10px; gap:12px}
body.app .gen-row{grid-template-columns:36px minmax(0,1fr) 92px minmax(0,1fr) 36px; gap:6px; font-size:11px}
body.app .gen-wrap{padding:2px}
body.app .gen-center{min-width:0; width:100%; flex:1 1 100%}
body.app .gen-form{width:100%; flex:1 1 100%}
body.app .oth-card{min-width:0; flex:1 1 100%}
body.app .donut-card{flex:1 1 100%; min-width:0}
body.app .donut-legend{min-width:0; flex-basis:100%}
body.app .donut-wrap{gap:14px}
body.app .scatter-card, body.app .map-card{min-width:0; flex:1 1 100%}
body.app .sr-card, body.app .dl-map, body.app .dl-side,
body.app .dm-map, body.app .dm-side{min-width:0; max-width:none; flex:1 1 100%}
body.app .hm-flex > div:first-child{min-width:0; flex:1 1 100%}
body.app .hm-list{width:100%; flex:1 1 100%}

/* ---------- 6. text boxes iOS would zoom into ----------
   Under 16px, Safari zooms the page on focus and does not zoom back. */
body.app .field input, body.app .form-card select,
body.app .inv-form input[type=email], body.app .inv-form select, body.app .rsel{font-size:16px}

}
```

Và một dòng trong `client/app.html`, ngay sau dòng `app.css`:

```html
<link rel="stylesheet" href="assets/app-mobile.css?v=1">
```

---

## 6. Kết quả đo — before / after

| Viewport | `doc.scrollWidth` | chrome trên đầu | cao 1 dòng trận | nav bị giấu | tràn ngang ngoài ý muốn | control <24px |
|---|---|---|---|---|---|---|
| **320** | 331 → **320** | 138 → **61** | 172 → **136** | 165 → **0** | 5 chỗ, tới 202px → **không** | 6 → **0** |
| **390** | 390 → 390 | 122 → **61** | 172 → **136** | 95 → **0** | 2 chỗ, tới 132px → **không** | 6 → **0** |
| **430** | 430 → 430 | 122 → **61** | 172 → **136** | 58 → **0** | 2 chỗ, tới 95px → **không** | 6 → **0** |
| **720** | 720 → 720 | 122 → **61** | 128 → **119** | 0 → 0 | không → không | 6 → **0** |
| **721** | 721 → 721 | 122 → 122 | 128 → 128 | 0 → 0 | không → không | 6 → 6 |
| **900** | 997 → 997 | 61 → 61 | 87 → 87 | 0 → 0 | `view+97` → `view+97` | 6 → 6 |
| **1280** | 1280 → 1280 | 61 → 61 | 87 → 87 | 0 → 0 | không → không | 6 → 6 |

**Ba hàng cuối: toàn bộ đối tượng đo, before và after, `JSON.stringify` bằng nhau từng ký
tự.** Đây là bằng chứng "không đổi giao diện web".

Còn lại sau khi sửa (cố ý):

- 18 control cao **40px** (chip category, nút export, `.sub-row`). Trên ngưỡng WCAG 2.5.8
  AA (24px) nhiều, dưới khuyến nghị 44px — 44px cho cả 6 chip category sẽ đẩy dải đó lên
  ~130px chiều cao. Đây là đánh đổi có chủ ý, không phải bỏ sót.
- `a.brand` 26×26 (logo, không phải control chính) — để nguyên.

**Một lỗi CÓ SẴN:** ở **900px**, `documentElement.scrollWidth = 997` — trang cuộn ngang
97px. Bản nháp đầu của tài liệu này quy tội cho `.donut-card` (480) đứng cạnh `.map-card`
trong `.chart-row`. **Đó là chẩn đoán sai.** Khi Q4 được duyệt là "sửa", chỗ này được đo
kỹ lại và thủ phạm là một thứ khác hẳn — dòng trận. §13.2 viết lại toàn bộ.

---

## 7. Hàng rào — liệt kê từng thứ KHÔNG đụng

| Không đụng | Vì sao an toàn |
|---|---|
| `client/assets/app.js` | 0 dòng sửa. Không route, handler, `matchMedia`, `localStorage` nào đổi. Toàn bộ thiết kế là CSS. |
| `client/assets/app.css` | ~~0 dòng sửa~~ → **Q4 đã được duyệt là "sửa", nên file này CÓ đổi**: thêm một khối `@container` ở cuối phần match-list, cộng một dòng `container-type` sau hàng rào `@media (min-width:721px)`. Không xoá, không sửa một rule cũ nào; 8 test đọc `APPCSS` (§2.1) vẫn xanh. Xem §13.2. |
| `client/assets/site.css` | 0 dòng sửa → `client/index.html` (marketing) và `login.html` y nguyên. |
| `shared.css`, `Stats/stats-view.css` | 0 dòng sửa → app tag (`index.html`, `Stats/`, `Player-Lists/`) y nguyên. Chúng chỉ bị *đè* bởi selector đặc hiệu hơn, và chỉ trong tài liệu nào có `body.app` **và** viewport ≤720px. |
| `Stats/stats-view.js`, `Stats/report.js` | 0 dòng. PDF dùng namespace `rp-*` riêng, không giao với file mới (§2.5). |
| `client/assets/film-tools.js/.css` | 0 dòng. Namespace `fmt-*`, không giao. |
| `.rail-in` / `#railToggle` | Chỉ sống ở `@media (min-width:861px)`. `.side-grp` (chứa nút kéo) đã `display:none` ở ≤860px từ trước; `#railToggle` vẫn trong DOM nên `app.js:2525` vẫn bind được. |
| Cấu trúc DOM | Không thêm/bớt/đổi tên một element hay class nào. |
| Bảng `table.stbl` | Không đụng (§12 Q3 hỏi có nên đụng không). |
| Tab Channel, Data, Player Data, Overview | Không một rule nào đổi logic; chỉ kích thước chạm và chiều rộng cột trên điện thoại. |
| Điều hướng ở 721px+ | Đã đo: giống hệt. |

---

## 8. Rủi ro và cách chặn

### 8.1 `position:fixed` + thanh công cụ Safari trên iOS

Thanh dưới có thể bị thanh công cụ Safari che khi cuộn. `env(safe-area-inset-bottom)` xử
lý được vạch home, **không** xử lý được thanh công cụ. Đây là hành vi của mọi bottom bar
trên iOS và người dùng đã quen. **Phải kiểm bằng iPhone thật** trước khi merge.

> Cố ý **không** thêm `viewport-fit=cover` vào `<meta name="viewport">`. Không có nó,
> iOS đã tự chừa vùng an toàn; `env()` trả 0 và fallback trong `calc()` chạy đúng. Thêm
> vào là mở thêm một biến số ở `app.html` mà không được gì.

### 8.2 Dropdown mở gần đáy trang

`.menu` được nâng `z-index:70` (thanh ở 45). Đã rà: `.chan-menu` 60 (ở đầu trang, không
giao), `.fmt-*` menu 40 (nằm trong `.film-full` ở 2000), `.mrow-more` menu 30 → 70. Menu
`⋯` của dòng cuối cùng nở ra dưới nó vẫn kéo được vì phần tử absolute vẫn cộng vào chiều
cao cuộn của tài liệu.

### 8.3 Bẫy "flex căn giữa + cuộn ngang"

`.sub-row` mang `justify-content:center` (`stats-view.css:65`). Cho nó
`overflow-x:auto; flex-wrap:nowrap` sẽ đẩy các mục đầu ra **âm** và không kéo tới được
trong nhiều trình duyệt. Vì thế thiết kế **để nó wrap** như hiện tại và chỉ nâng chiều cao
nút. `.dsubs` thì căn trái nên cuộn được an toàn.

### 8.4 `.donut-svg` rộng cố định

`.donut-svg{flex:none}` với `width` là thuộc tính SVG. `flex-basis:100%` trên
`.donut-legend` đẩy chú giải xuống dòng dưới, nên donut chỉ cần vừa một mình. Đã đo ở
320px: hết tràn. Nếu sau này donut đổi kích thước, đây là chỗ kiểm lại.

### 8.5 Deploy quên `cp`

Đã có test bắt (§2.3). Vẫn liệt kê trong checklist §10 vì đây là lỗi đã xảy ra ở repo này.

### 8.6 Cuộn quán tính / bàn phím ảo

Trang tĩnh không đo được. Đưa vào danh sách kiểm bằng máy thật (§10 bước 7).

---

## 9. Test đề xuất: `tests/mobile-ui.test.js`

Mục tiêu: khoá lại **ba hàng rào** của §3.3, để một lần sửa sau này không lặng lẽ phá chúng.

```js
const MOB = readSrc('client/assets/app-mobile.css');
const APPHTML = readSrc('client/app.html');

test('every rule in the mobile sheet is inside the one phone query', () => {
  // exactly one @media, and it is the phone one
  eq((MOB.match(/@media/g)||[]).length, 1);
  ok(/@media \(max-width:720px\)\{/.test(MOB));
  // nothing outside it
  const outside = MOB.replace(/@media \(max-width:720px\)\{[\s\S]*\n\}/,'')
                     .replace(/\/\*[\s\S]*?\*\//g,'').trim();
  eq(outside, '', 'a rule outside the query would reach the desktop');
});

test('every selector is scoped to the app shell', () => {
  selectorsOf(MOB).forEach(s =>
    ok(/^body\.app[\s>]/.test(s), s + ' could reach a page that is not app.html'));
});

test('the sheet is loaded by app.html and by nothing else', () => {
  ok(/app-mobile\.css\?v=\d+/.test(APPHTML));
  ['client/index.html','client/login.html','client/guide.html','index.html',
   'Stats/index.html','Player-Lists/index.html','client/assets/app.js']
    .forEach(f => notOk(/app-mobile/.test(readSrc(f)), f + ' must not load it'));
});

test('it overrides the tagging sheets rather than editing them', () => {
  // the seven desktop floors are still where they were
  ok(/\.gen-center\{flex:1;min-width:420px\}/.test(readSrc('Stats/stats-view.css')));
  ok(/\.scatter-card,\.map-card\{flex:1;min-width:360px\}/.test(readSrc('shared.css')));
});

test('the bottom bar keeps all four rail entries and does not delete the 860px row', () => {
  ok(/body\.app \.side\{[^}]*position:fixed/.test(MOB.replace(/\s*\n\s*/g,'')));
  ok(/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(MOB));
  // the tablet row survives — client-channels.test.js:757 depends on it
  ok(/@media \(max-width:860px\)[\s\S]*?\.side-foot\{[^}]*margin-left:auto/
      .test(readSrc('client/assets/app.css')));
});
```

Ước tính: **+5 test**, baseline 1456 → **1461**.

---

## 10. Checklist triển khai — theo đúng thứ tự

1. Tạo `client/assets/app-mobile.css` với nội dung §5.
2. Thêm vào `client/app.html` sau dòng `app.css`:
   `<link rel="stylesheet" href="assets/app-mobile.css?v=1">`
3. Thêm vào `.github/workflows/deploy.yml`, trong khối `# ---------- client site ----------`:
   `cp client/assets/app-mobile.css _site/assets/app-mobile.css`
4. `node tests/asset-versions.test.js --update` (ghi entry mới vào `tests/asset-versions.json`).
5. Viết `tests/mobile-ui.test.js` (§9).
6. `node tests/run.js` → phải là **1461/1461**. Bất kỳ test cũ nào đỏ đều là dấu hiệu đã
   chạm vào thứ không được chạm — dừng lại, đừng sửa test.
7. Kiểm bằng máy thật: iPhone Safari và Android Chrome, bốn màn hình (Matches → một trận →
   Data → Channel), kiểm riêng: thanh dưới khi cuộn, menu `⋯` ở dòng cuối, focus vào ô
   email (không được phóng to), xoay ngang, và **Film toàn màn hình**.
8. Kiểm desktop 1280px: phải không thấy khác biệt nào.

---

## 11. Rollback

Xoá một dòng `<link>` trong `client/app.html`. App trở lại y hệt hôm nay.

Rollback đầy đủ: xoá thêm file CSS, dòng `cp`, entry manifest và file test.

---

## 12. Câu hỏi — đã được trả lời 2026-09-03

> **Q1 đồng ý · Q2 đồng ý · Q3 đồng ý · Q4 sửa · Q5 40px.** Nguyên văn năm câu hỏi được
> giữ lại bên dưới để đọc lại lý do đã cân nhắc; cái gì thực sự được làm thì ở §13.

**Q1 — Thanh tab dưới đáy: đồng ý?**
Đây là thay đổi *nhìn thấy được* lớn nhất. Nó lấy lại 61px chiều cao, đưa "About Hoang Nam"
trở lại màn hình, và nâng mọi ô điều hướng lên 56px. Nhưng nó đổi *chỗ* của điều hướng trên
điện thoại. Phương án B: giữ dải trên đầu, chỉ sửa để nó không cuộn (4 ô đều nhau, nhãn
ngắn lại) — giữ được 0px chiều cao nhưng vẫn phải rút gọn "About Hoang Nam".
*Đề xuất: thanh dưới.*

**Q2 — Mốc 720px: đồng ý?**
iPad dọc (768px) sẽ **giữ nguyên** giao diện hôm nay. Nếu anh muốn iPad cũng theo layout
mới thì đổi thành 820px hoặc 860px — nhưng lúc đó phải đo lại vì `.side-foot{margin-left:auto}`
và các rule 820px khác bắt đầu chồng nhau.
*Đề xuất: giữ 720px.*

**Q3 — Bảng rộng `table.stbl` trên điện thoại: có đóng băng lại một cột không?**
Hôm nay ở ≤720px cả hai cột đóng băng đều được nhả (`app.css:586`), nên khi cuộn ngang
523px anh **không biết đang đọc dòng của trận nào**. Có thể đóng băng lại **đúng một** cột
(`.c-opp` cho bảng trận, `.c-pl` cho danh sách cầu thủ) ở `left:0`.
⚠️ Việc này **không nằm trong bản prototype đã đo** và nó đi ngược lại *ý* của comment
`app.css:583-585` (dù vẫn giữ nguyên *chữ* mà `data-page.test.js:371` kiểm). Nếu anh
đồng ý, nó cần một lượt đo riêng.
*Đề xuất: làm, nhưng tách thành bước riêng sau khi bản này merge.*

**Q4 — Lỗi có sẵn ở 861-900px (trang cuộn ngang 97px): có sửa luôn không?**
Nó nằm ngoài "mobile" theo định nghĩa của bản này, và sửa nó nghĩa là chạm vào layout ở dải
laptop nhỏ — tức là chạm vào "giao diện web" mà anh yêu cầu không đổi.
*Đề xuất: không sửa ở bản này; ghi nhận lại và làm thành một bản thiết kế riêng.*

**Q5 — 40px hay 44px cho 6 chip category?**
40px giữ dải chip gọn; 44px đúng khuyến nghị Apple/Google nhưng đẩy dải lên ~130px trên
điện thoại.
*Đề xuất: 40px.*

---

## 13. Đã triển khai — ghi lại chính xác cái gì đổi

### 13.1 Bảy file

| File | Thay đổi |
|---|---|
| `client/assets/app-mobile.css` | **mới**, 155 dòng. Một khối `@media (max-width:720px)`, mọi selector `body.app`. Nội dung §5, cộng phần Q3 (§13.2b) và một sửa lỗi tìm được lúc chụp ảnh (§13.4a). |
| `client/app.html` | `+1` dòng `<link>` cho file trên; `app.css?v=24` → `?v=25`. |
| `client/assets/app.css` | `+2` khối ở cuối phần match-list: `@media (min-width:721px){.mlist{container-type:inline-size}}` và `@container (max-width:793px){…}`. Không rule cũ nào bị sửa hay xoá. |
| `client/guide.html`, `client/login.html` | `app.css?v=24` → `?v=25`. Bắt buộc: cả ba trang nạp `app.css`, và `asset-versions.test.js` bắt trường hợp bump nửa vời. |
| `.github/workflows/deploy.yml` | `+1` dòng `cp client/assets/app-mobile.css`. |
| `tests/asset-versions.json` | regenerate. |
| `tests/mobile-ui.test.js` | **mới**, 11 test khoá ba hàng rào §3.3 cộng từng thứ bản này làm. |

### 13.2 Q4 hoá ra là một lỗi khác — chẩn đoán cũ SAI

Bản nháp đầu viết rằng trang cuộn ngang ở 900px là vì `.donut-card`/`.chart-row`. Khi Q4
được duyệt, chỗ đó được đo lại từng phần tử một, quét từ 760 tới 1140px. **Thủ phạm là
dòng trận, không phải biểu đồ.**

Số học của nó:

```
sáu sàn của --m-cols   150 + 110 + 96 + 110 + 150 + 66  = 682
năm gap 14px                                            =  70
padding trái + phải của .mrow                           =   8
                                                  .mrow cần  760
cột ⋯ trong .mrow-wrap                                  =  34
                                                  .mlist cần 794
```

Còn `.mlist` thực sự được bao nhiêu thì phụ thuộc **rail**, không chỉ cửa sổ:

```
.mlist = W − rail − 2·gut     rail = 196 (kéo ra) hoặc 56 (kéo vào)
                              gut  = clamp(20px, 5vw, 72px)
```

Ở 861px rail vừa quay lại: `.mlist` = 861 − 196 − 86 = **579**, trong khi nó cần 794.
Đo trên fixture list như đang chạy:

| Cửa sổ | 840 | 860 | 880 | 900 | 1000 | 1080 | 1100 |
|---|---|---|---|---|---|---|---|
| `.mlist` được | 756 | 774 | 596 | 614 | 704 | 776 | 794 |
| trang cuộn ngang | 0 | 0 | **116** | **97** | **2** | 0 | 0 |
| dòng tràn ra ngoài hộp của nó | 34 | 16 | **194** | **176** | **86** | 14 | 0 |

Lỗi rộng hơn cái nhìn thấy: từ 1020 tới ~1090 thanh cuộn biến mất nhưng dòng vẫn tràn —
cột Result đơn giản là vẽ vào phần padding của trang.

**Cách sửa: một container query, không phải media query.** Câu hỏi quyết định không phải
"cửa sổ rộng bao nhiêu" mà "cột danh sách rộng bao nhiêu", và cột ấy phụ thuộc cả rail.
Media query không diễn đạt được điều đó (kéo rail vào, dòng vừa từ khoảng 960px). Repo đã
dùng container query ở hai chỗ khác (`.pl-pos`, `.sh-row`), nên đây không phải kỹ thuật mới.

```css
@media (min-width:721px){ .mlist{container-type:inline-size} }
@container (max-width:793px){ …cùng bố cục ba dòng mà khối 820px vẽ… }
```

**`@media (min-width:721px)` bọc `container-type` là load-bearing, không phải trang trí.**
`container-type` kéo theo `contain:layout`, và `contain:layout` tạo ra một stacking
context. Dưới 721px `app-mobile.css` đặt một thanh `position:fixed` ở đáy màn hình tại
`z-index:45`; một menu `⋯` bị niêm trong stacking context của `.mlist` sẽ **không bao giờ**
vẽ đè lên nó, `z-index` là bao nhiêu cũng vậy. Hàng rào 721px giữ `.mlist` ở
`container-type:normal` đúng nơi có thanh đó. Đã kiểm bằng máy: ở 390px
`getComputedStyle(.mlist).containerType === 'normal'`, và `elementFromPoint` ở giữa menu
trả về `.menu-opt`.

**b) Q3, trong cùng một lượt.** `app.css:586` nhả cả hai cột đóng băng dưới 720px.
`app-mobile.css` đóng băng lại **đúng một** — cột gọi tên dòng (`.c-opp` cho bảng trận,
`.c-pl` cho danh sách cầu thủ) ở `left:0`, hẹp lại còn 124/132px, ngày để trôi đi cùng các
con số. Rule `position:static` của `app.css` bị *đè*, không bị *sửa*, nên ba test ghim
nguyên văn nó (`data-page`, `match-edit`, `player-data`) vẫn xanh. Kiểm bằng máy: cuộn
`.stbl-wrap` sang 300px, `.c-opp` đi từ offset 105 về **1** rồi đứng yên, `.c-date` trôi ra
−299, đường viền `::after` được vẽ lại.

### 13.3 Kết quả đo cuối cùng

Cùng phương pháp §0. "before" là `app.css` lấy ra bằng `git show HEAD:` và không có
`app-mobile.css`; "after" là đúng các file đã ship, nạp theo đúng thứ tự `app.html` nạp —
`app-mobile.css` **trước** `shared.css`/`stats-view.css`, tức là trường hợp khó, đúng như
lúc chạy thật.

| vw | trang cuộn ngang | chrome trên đầu | cao 1 dòng | dòng tràn | gập? | nav | cột đóng băng | tràn ngoài ý muốn |
|---|---|---|---|---|---|---|---|---|
| 320 | 0 → 0 | 138 → **61** | 172 → **136** | — | Y→Y | 3/4 → **4/4**, cố định đáy | static → **sticky** | 5 chỗ, tới 202px → **không** |
| 360 | 0 → 0 | 122 → **61** | 172 → **136** | — | Y→Y | 3/4 → **4/4** | static → **sticky** | 4 chỗ → **không** |
| 390 | 0 → 0 | 122 → **61** | 172 → **136** | — | Y→Y | 3/4 → **4/4** | static → **sticky** | 3 chỗ, tới 132px → **không** |
| 430 | 0 → 0 | 122 → **61** | 172 → **136** | — | Y→Y | 3/4 → **4/4** | static → **sticky** | 3 chỗ → **không** |
| 720 | 0 → 0 | 122 → **61** | 128 → **119** | — | Y→Y | 4/4 → 4/4 | static → **sticky** | không → không |
| **721** | *giống hệt từng con số* | | | | | | | |
| **768** | *giống hệt từng con số* | | | | | | | |
| 860 | 0 → 0 | 122 → 122 | 87 → 128 | 16 → **0** | n → **Y** | 4/4 | sticky | không |
| 880 | **116 → 0** | 61 → 61 | 87 → 128 | 194 → **0** | n → **Y** | 4/4 | sticky | `view+116` → **không** |
| 900 | **97 → 0** | 61 → 61 | 87 → 128 | 176 → **0** | n → **Y** | 4/4 | sticky | `view+97` → **không** |
| 1000 | **2 → 0** | 61 → 61 | 87 → 128 | 86 → **0** | n → **Y** | 4/4 | sticky | `view+2` → **không** |
| **1100** | *giống hệt từng con số* | | | | | | | |
| **1280** | *giống hệt từng con số* | | | | | | | |
| **1440** | *giống hệt từng con số* | | | | | | | |

Control cao dưới 24px: **6 → 0** ở mọi bề rộng điện thoại; **6 → 6** ở 721px trở lên
(không đụng, đúng như thiết kế).

Đánh đổi phải nói rõ: **dải 860-1000px giờ vẽ dòng trận ở dạng gập ba dòng** thay vì sáu
cột. Đấy chính là cái giá của Q4, và ở bề rộng đó nó dễ đọc hơn — bản sáu cột tại 596px
phải ellipsis tên giải xuống còn 150px trong khi tràn 194px ra ngoài trang.

### 13.4 Ba lỗi tìm ra trong lúc làm, và đã sửa

**a) Ba dấu ba chấm ở chỗ chỉ cần một.** `flex-wrap:nowrap` trên `.m-det-top` khiến cả ba
mảnh co đều nhau, ra `FIFA World Cup qualification – CONCACAF… | 2… | Rou…`. Mùa giải và
vòng đấu ngắn, và là hai thứ đáng đọc nguyên. Sửa: `b{flex:none}` cộng
`b:first-child{flex:0 1 auto; min-width:0}` — chỉ tên giải nhường chỗ.

**b) Sai 8px trong ngưỡng gập.** `@container` đặt ở 789px, tính theo `682 + 70 + 34 = 786`.
Padding hai bên của `.mrow` (2 × 4px) bị bỏ quên, nên con số đúng là **794** và ngưỡng
phải là 793. `tests/mobile-ui.test.js` bắt được: nó tự đọc `--m-cols` **và** padding của
`.mrow` ra khỏi CSS rồi so, nên một lần đổi track sau này cũng không trượt được.

**c) Bump nửa vời.** `app.css` được ba trang nạp, không phải một. Bump mỗi `app.html` làm
`asset-versions.test.js` đỏ ngay, với đúng tên hai trang còn lại trong thông điệp lỗi.

### 13.5 Còn phải kiểm bằng máy thật

Trang tĩnh + Chrome headless không đo được ba thứ, và chúng vẫn là điều kiện trước khi
merge:

1. **Thanh công cụ Safari trên iOS** che thanh dưới khi cuộn. `env(safe-area-inset-bottom)`
   lo được vạch home, không lo được thanh công cụ.
2. **Bàn phím ảo** khi focus vào ô email trong tab Channel — kiểm luôn rằng 16px đã chặn
   được cú phóng to của Safari.
3. **Film toàn màn hình** trên điện thoại: `.film-full` ở `z-index:2000`, trên thanh (45),
   nhưng chỉ máy thật mới trả lời được Fullscreen API trên iOS.
