# Film — Guidelines — Detailed Design

**Dưới thanh điều khiển video ở trang Film trong channel có thêm MỘT dòng: `Guidelines`.
Bấm vào nó mở một trang tài liệu riêng, ở tab mới, dạy user và client dùng hết những gì
Film làm được — từ Space để phát, tới chuột phải để vẽ và cắt clip. Trang đó có video quay
màn hình cho từng thao tác. Tài liệu này mô tả cái link, cái trang, nội dung của trang, chỗ
để video, và bằng chứng vì sao không một tính năng nào khác đổi một pixel.**

Trạng thái: **đã triển khai** (2026-08-23). `node tests/run.js` → **1260/1260 passed**,
trong đó **1236 test cũ pass nguyên vẹn** và 24 test mới.

**Bản sửa 1 (cùng ngày, đã được cho phép):** ba việc §15 để ngỏ nay đã làm — menu công cụ
analyst **đã dịch sang tiếng Anh**, `destroy()` khi rời trang match **đã vá**, và
`Copy a link to this moment` **đã vá**. Xem §8, §9.2, §9.3 — mỗi mục ghi lại cả cái đã đổi
lẫn cái đã đo. Hệ quả cho tài liệu người dùng: §7.9 rút từ hai cột nhãn xuống **một**, vì
nhãn trên màn hình bây giờ đã là tiếng Anh.

Ba câu hỏi đã hỏi và đã được trả lời trước khi viết:

| | Câu hỏi | Đã chốt |
|---|---|---|
| **Q1** | Guidelines viết bằng ngôn ngữ nào | **English.** Toàn bộ client channel đang là tiếng Anh, và client là các LĐBĐ Saint Lucia / Barbados / Aruba / Curaçao / Haiti. Ở bản đầu, nhãn menu chuột phải còn là tiếng Việt và guide định trích nguyên văn kèm gloss; **bản sửa 1 đã dịch hẳn menu sang tiếng Anh**, nên guide chỉ còn một ngôn ngữ (§8) |
| **Q2** | Click thì mở thế nào | **Tab mới, trang tĩnh riêng** `client/guide.html`. Video đang xem giữ nguyên vị trí, không phải dừng player, và **không phải chạm vào teardown của `app.js`** (§4.3, §9.2) |
| **Q3** | Video mô tả lấy ở đâu | **Screen recording thật, host trên bucket R2 đã có.** §6 ghi spec từng clip: nội dung, độ dài, tên file, poster, cách quay, cách upload |

### Phạm vi thay đổi

| File | Thay đổi | Chạm vào code sẵn có? |
|---|---|---|
| `client/guide.html` | **mới**, ~950 dòng (trang tài liệu) | — |
| `client/assets/guide.css` | **mới**, ~380 dòng | — |
| `client/assets/guide.js` | **mới**, ~180 dòng (TOC scrollspy, manifest video, fallback) | — |
| `Stats/stats-view.js` | **+11 / −0** | **0 dòng sửa.** 1 hằng mới cạnh `filmFullOK`, 1 khối chèn vào chuỗi của `filmHTML()` |
| `Stats/stats-view.css` | **+21 / −0** | 0 — một khối `.film-guide` mới và 1 override trong `.film-full` |
| `client/assets/app.js` | **+1 / −1** | 1 dòng: thêm `guide:` vào object options của `mount()` |
| `Stats/index.html` | **+2 / −2** | **chỉ hai con số `?v=`.** Trang này cũng nạp `stats-view.js` và `stats-view.css`, nên bump phải xảy ra ở cả hai nơi — 0 dòng hành vi (§10.1) |
| `client/app.html` | **+1 / −1** | **chỉ một con số `?v=`** của `app.js` |
| `.github/workflows/deploy.yml` | **+3** | 3 dòng `cp` |
| `tests/asset-versions.test.js` | **+1** | thêm `client/guide.html` vào `PAGES` |
| `tests/asset-versions.json` | regenerate | `node tests/asset-versions.test.js --update` |
| `tests/film-guidelines.test.js` | **mới**, ~26 test | — |

**0 dòng** ở: `client/assets/film-tools.js`, `client/assets/film-tools.css`, `client/assets/app.css`,
`client/assets/site.css`, `client/index.html`, `client/login.html`, `shared.js`, `shared.css`,
`shared-page.css`, `cloud-sync.js`, `index.html` (tagger), `Stats/report.js`, `Player-Lists/*`,
`worker/*`, `supabase/*`, `auth.html`, `auth.js`.

Ba file chỉ đổi **con số `?v=`** và không đổi một dòng hành vi nào — `Stats/index.html`,
`client/app.html`, và bản thân `client/assets/app.js` ở hai dòng `loadOnce()`. Chuỗi
cache-bust là bắt buộc và có test giữ; §10.1 liệt kê đủ.

---

## 0. Trả lời thẳng ba câu hỏi ẩn trong yêu cầu

> *"Đảm bảo khi hoàn thành sẽ không xảy ra bugs của các chức năng khác trong những tabs khác."*

Thiết kế này đạt được điều đó **bằng kiến trúc, không bằng lời hứa**, qua bốn tính chất, mỗi
tính chất đều kiểm chứng được bằng một dòng test:

| Tính chất | Vì sao nó đúng | Test |
|---|---|---|
| **Không một listener nào mới** | cái link là một thẻ `<a href target="_blank">` thuần. Không `onclick`, không `addEventListener`. `filmStart()` và `filmStop()` **không đổi một dòng** | §11.2 |
| **Không tồn tại ở host không xin** | markup chỉ được sinh ra khi `opts.guide` có giá trị. Trang Stats của tagger mount bằng `{chrome:false,local:true,cloud:true}` (`Stats/index.html:70`) → chuỗi HTML **không chứa** thẻ `<a>` nào | §11.2 |
| **Không tồn tại ở tab khác của channel** | `filmHTML()` chỉ được gọi từ `renderFilm()`, mà `renderStats()` chỉ gọi `renderFilm()` khi `statView==='film'` (`Stats/stats-view.js:101`) | §11.2 |
| **Không lấy chiều cao của khung hình trong full screen** | một dòng CSS `display:none` trong `.film-full`. `display:none` cũng gỡ nó khỏi tab order, nên bàn phím trong phòng chiếu không đổi | §11.3 |

> *"Đảm bảo không thực hiện bất kỳ sự thay đổi của các tính năng khác khi chưa được cho phép."*

Có **một lỗi rò rỉ có sẵn** trong `client/assets/app.js` mà tôi tìm ra khi khảo sát: rời trang
match trong channel **không** gọi `PTStats.destroy()`, nên `filmStop()` không bao giờ chạy —
video vẫn phát ngầm, `keydown` vẫn treo trên `document`. Nó **đã có từ trước** thiết kế này
(bấm "← All matches" trong lúc video đang chạy là đủ để gặp).

Guidelines **không đi qua nó** — mở tab mới thì trang Film ở tab cũ không hề bị rời — nhưng
sau khi được cho phép, **nó đã được vá** trong bản sửa 1, cùng với một lỗi thứ hai tìm thấy
lúc soát nội dung: `Copy a link to this moment` gửi người nhận về trang chủ kênh thay vì về
khoảnh khắc. Cả hai ở §9.2 và §9.3, kèm cái đã đo trước khi áp.

> *"Trong guidelines nên thêm các video mô tả."*

13 clip, tổng ~6 phút 30, **không tiếng**, host trên bucket R2 đã có sẵn. Quan trọng:
**phát `<video>` bình thường KHÔNG cần CORS** — chỉ đọc canvas mới cần (§6.1). Nên guide chạy
được ngay hôm nay, kể cả khi `worker/r2-cors.json` chưa được áp lên bucket. Và mọi clip đều
có **bản chữ tương đương** ngay bên cạnh (§6.5): trang đọc được trọn vẹn khi video chưa kịp
quay, khi mạng chậm, và bằng trình đọc màn hình.

---

## 1. Vấn đề

Film hôm nay có **sáu vùng trên màn hình, mười lăm phím tắt và một menu chuột phải hai mươi
mục** — và không một chữ nào nói ra điều đó ở bất cứ đâu trong sản phẩm.

Đo trên chính source:

| Thứ | Ở đâu | Người dùng biết bằng cách nào (hôm nay) |
|---|---|---|
| Space phát/dừng | `Stats/stats-view.js:1822` | **không có gì nói** |
| ← → tua 2 giây | `Stats/stats-view.js:1820-1821` | **không có gì nói** |
| F vào toàn màn hình | `Stats/stats-view.js:1824` | `title="Full screen (F)"` trên nút — chỉ hiện khi rê chuột |
| Bấm một dòng trong list để nhảy tới | `Stats/stats-view.js:1530` | **không có gì nói** |
| Ba bộ lọc cộng dồn được | `Stats/stats-view.js:1371` | phải mở ra mới biết là checkbox |
| Nút ⏭ = clip kế tiếp | `Stats/stats-view.js:1451` | `title="Next clip"` |
| Toàn bộ bộ công cụ analyst | `client/assets/film-tools.js` | **chuột phải, trong full screen** — không có gì nói là nó tồn tại |

Dòng cuối là dòng đắt nhất. Cả `film-tools.js` — vẽ, rọi đèn, cắt clip, xuất PNG, xuất MP4 —
**chỉ mở được bằng chuột phải và chỉ trong toàn màn hình**. Đó là một quyết định đúng
(`docs/film-telestration-design.md` §1: mặt video cố ý không nhận click trái), nhưng nó có
cái giá của nó: **một tính năng không có cửa nhìn thấy được là một tính năng không tồn tại**
đối với người chưa được ai chỉ.

Client là các liên đoàn ở Caribbean. Họ mở channel, xem trận, và không có ai ngồi cạnh để
nói "bấm F rồi chuột phải".

## 2. Ranh giới

**Làm:**

- một dòng `Guidelines` dưới thanh transport của Film, **chỉ trong channel**
- một trang tĩnh `client/guide.html` mở ở tab mới
- nội dung tiếng Anh, đầy đủ 16 mục, phủ **mọi** thao tác Film có
- 13 video quay màn hình, host trên R2, có poster, có bản chữ tương đương
- mục lục dính bên trái + scrollspy, đọc được trên điện thoại
- bảng phím tắt đầy đủ, bảng menu chuột phải đối chiếu Việt–Anh
- mục xử lý sự cố (không có video, không tải được .mp4, ra .webm thay vì .mp4)

**Không làm** (và vì sao):

| Không làm | Vì sao |
|---|---|
| dịch menu chuột phải sang tiếng Anh | đó là **đổi một tính năng khác**. Chưa được cho phép. §8 |
| sửa rò rỉ `destroy()` trong `app.js` | đó là **đổi một tính năng khác**. Chưa được cho phép. §9.2 |
| thêm link Guidelines vào landing `client/index.html` | ngoài phạm vi yêu cầu, và landing chỉ được hứa những gì repo làm được |
| tooltip / onboarding overlay lần đầu mở Film | là một tính năng khác, có chi phí riêng, và sẽ va vào `filmStop()` |
| route `#/guide` trong app | Q2 đã chốt tab mới — và route sẽ kéo theo bản vá `destroy()` ở §9.2 |
| bản tiếng Việt của trang guide | Q1 đã chốt English. Cấu trúc §5.2 để ngỏ chỗ cho nó sau |
| video có lời thuyết minh | không tiếng: không phải lồng tiếng lại khi đổi ngôn ngữ, file nhẹ hơn, và không làm phiền phòng họp |

---

## 3. Kiểm kê: Film hôm nay dạy được những gì

Đây là danh sách nguồn của §7. Mỗi dòng có địa chỉ trong source, để nội dung guide không bao
giờ hứa thứ code không làm.

### 3.1 Sáu vùng trên màn hình

`filmHTML()` — `Stats/stats-view.js:1429`

| # | Vùng | Phần tử | Nó là gì |
|---|---|---|---|
| 1 | Nút chuyển hiệp | `.film-halves` | chỉ hiện khi trận có đủ hai cửa sổ (`filmWindows()`, dòng 1221) |
| 2 | Khung hình | `#fmStage` > `#fmVideo` | `object-fit:contain`, **không nhận click trái** (`stats-view.css:254`) |
| 3 | Dải chú thích | `#fmCap` | entry đang diễn ra; nhà từ mép trái, khách từ mép phải (`stats-view.css:263`) |
| 4 | Thanh transport | `.film-bar` | ▶ · thanh kéo · `mm:ss / mm:ss` · ⛶ |
| 5 | Sân thu nhỏ | `#fmPitch` | chấm ở đúng chỗ đã tag, có đường chuyền và bóng chạy |
| 6 | Bộ lọc + danh sách | `.film-filters`, `#fmList` | 3 slicer, nút ⏭, danh sách entry |

**Một điều rất dễ hiểu lầm và guide phải nói ra:** đồng hồ `mm:ss / mm:ss` là **giờ trận**,
không phải giờ của file. `matchTime()` (`Stats/stats-view.js:1127`) quy hiệp 1 về 00:00 và
hiệp 2 về 45:00. Nên hiệp 2 mở ra là thấy `45:00`, dù file video mới chạy tới phút thứ 3.

### 3.2 Bàn phím của chính Film — có ở **cả hai** host

`filmKeys()` — `Stats/stats-view.js:1795`

| Phím | Việc | Ghi chú |
|---|---|---|
| `Space` | phát / dừng | bị bỏ qua khi con trỏ đang ở trong INPUT/SELECT/TEXTAREA, và khi focus đang trong một slicer |
| `←` `→` | lùi / tới **2 giây** | `FILM_STEP=2`, dòng 1202 |
| `F` | toàn màn hình | **chỉ khi host xin** (`filmFullOK()` = `!!opts.fullscreen`, dòng 1626) |
| `Esc` | thoát toàn màn hình | ở chế độ native là của trình duyệt; ở chế độ dự phòng là của ta (dòng 1810) |

### 3.3 Bàn phím của bộ công cụ — **chỉ channel, chỉ trong toàn màn hình**

`key()` — `client/assets/film-tools.js:1643`. Dòng đầu tiên của nó là `if (!ctx || !full) return false;`
— nên **ngoài toàn màn hình, không một phím nào dưới đây tồn tại.**

| Phím | Việc |
|---|---|
| `,` `.` | lùi / tới **1 frame** |
| `S` | rọi đèn tại vị trí con trỏ |
| `D` | làm tối phần còn lại |
| `H` | ẩn / hiện toàn bộ đồ hoạ |
| `T` | ẩn / hiện thanh thời gian của các nét vẽ |
| `L` | lặp A–B, 8 giây tính từ đây |
| `[` `]` | đánh dấu đầu / cuối clip |
| `C` | mở danh sách clip |
| `1`–`9` | đặt cửa sổ thời gian (giây) cho nét đang chọn — hoặc cho nét sắp vẽ |
| `0` | ghim / bỏ ghim nét đang chọn cho cả clip |
| `Delete` | xoá nét đang chọn |
| `Shift`+`←` `→` | dời nét đang chọn đi **1 frame** |
| `Backspace` | đóng thứ trong cùng: menu → nét đang kéo → chế độ chỉnh đèn → công cụ → lựa chọn → bảng clip |

### 3.4 Chuột

| Thao tác | Ở đâu | Việc |
|---|---|---|
| click trái lên khung hình | `#fmStage` | **không làm gì** — cố ý |
| chuột phải lên khung hình | `#fmStage`, chỉ full screen | mở menu công cụ tại đúng điểm bấm |
| lăn chuột | `#fmStage`, chỉ full screen | phóng to / thu nhỏ — hoặc đổi cỡ đèn khi đang chỉnh đèn |
| `Ctrl`/`Cmd` + lăn | — | **của trình duyệt**, không bị chiếm (`film-tools.js:776`) |
| kéo trái | chỉ khi đã chọn công cụ vẽ | vẽ nét đó |
| click / kéo trên thanh | `#fmTrack` | tua |
| click một dòng | `#fmList` | nhảy tới thời điểm của entry đó |

### 3.5 Menu chuột phải — 20 mục

`menuModel()` — `client/assets/film-tools.js:1485`. Bảng đối chiếu đầy đủ ở §7.9; đây là
tóm tắt để đối chiếu phạm vi.

Đầu menu · lùi/tới 1 frame · tốc độ (0.25×…2×) · lặp A–B — rọi đèn · làm tối · phóng to ·
**Vẽ** (mũi tên, mũi tên cong, mũi tên nét đứt, bút tự do, vùng, chữ, đánh dấu cầu thủ,
hoàn tác, xoá hết) · ẩn đồ hoạ · thanh thời gian — *(chỉ khi bấm trúng một nét)* **Hình ở
đây** (chọn để sửa, cửa sổ thời gian, ghim, đứng hình khi xuất, màu, xoá) — đánh dấu đầu/cuối
clip · clip quanh event (±6s) · danh sách clip — lưu .png · tải .mp4 · chép link — thoát full
screen.

### 3.6 Cái mà tagger KHÔNG có

`client/assets/film-tools.js` được nạp bởi **duy nhất** `client/assets/app.js:1618`. Trang
Stats của tagger không nạp nó, nên ở đó không có menu chuột phải, không có nét vẽ, không có
clip, không có nút ⛶ và không có phím `F`.

**Hệ quả cho guide: guide chỉ tồn tại trong channel, và mô tả đúng cái channel có.**

---

## 4. Cái link

### 4.1 Vị trí: con thứ ba của `.film-main`, ngay sau `.film-bar`

`.film-main` hiện có đúng hai con (`Stats/stats-view.js:1430`):

```
.film-main
├── .film-stage    (khung hình + dải chú thích)
└── .film-bar      (▶ · thanh kéo · mm:ss · ⛶)
```

Dòng Guidelines thành con thứ ba. Ba lý do nó đúng chỗ đó:

1. **Yêu cầu nói "phía dưới video".** Đây là chỗ duy nhất vừa ở dưới khung hình vừa còn thuộc
   về cột của khung hình. Một link đặt dưới cả `.pt-stats` sẽ hiện ở **mọi** tab — Overview,
   Dashboard, Stats — chứ không riêng Film.
2. **`.film-main` là `display:flex; flex-direction:column`** (`Stats/stats-view.css:252`). Thêm
   con thứ ba là thêm một hàng: không đè lên gì, không cần định vị tuyệt đối, không đụng vào
   `aspect-ratio:16/9` của khung hình.
3. **Ngoài `#fmStage`.** Mọi handler của `film-tools.js` (`contextmenu`, `pointerdown`,
   `pointermove`, `wheel`) gắn trên `ctx.stage` (`client/assets/film-tools.js:1719-1723`). Một
   node **bên ngoài** stage thì không handler nào trong bộ công cụ nhìn thấy nó — kể cả khi
   đang vẽ dở một mũi tên.

### 4.2 Vì sao là một option chứ không phải luôn luôn có

Đây là quy tắc `filmFullOK()` đã đặt ra và đã có test giữ (`tests/film-fullscreen.test.js`):

> *"Only a host that asked for it: the client channel mounts with `{fullscreen:true}`, the
> Stats page mounts as it always has and gets no button, no key and no way in."*
> — `Stats/stats-view.js:1623`

Guidelines đi theo đúng khuôn đó, và **phải** đi theo, vì `guide.html` là file của site
client. Trang Stats của tagger nằm dưới `/tagger/Stats/` sau khi deploy — một href tương đối
viết cứng trong `stats-view.js` sẽ trỏ sai ở đó và 404.

Nên **href do host truyền vào**, còn `stats-view.js` không biết gì về bố cục file của site
client:

```js
const filmGuideOK=()=>!!(opts.guide&&String(opts.guide).trim());
```

`client/assets/app.js:265` đổi từ:

```js
window.PTStats.mount(holder, rep.payload, { fullscreen: true });
```

thành:

```js
window.PTStats.mount(holder, rep.payload, { fullscreen: true, guide: 'guide.html' });
```

`guide.html` là **tương đối với document** (`app.html`), không phải với script — nên nó phân
giải thành `_site/guide.html` trên site live và `client/guide.html` khi chạy cục bộ. Đúng ở
cả hai, và không cần `taggerRoot()`.

### 4.3 Vì sao mở tab mới (Q2)

| | Tab mới | Cùng tab |
|---|---|---|
| chỗ đang xem trong trận | **giữ nguyên** | mất, trừ khi viết thêm phần nhớ vị trí |
| vừa đọc vừa làm theo | được — hai cửa sổ cạnh nhau | không: đọc xong phải quay lại, rồi lại quên |
| video đang phát | vẫn ở tab cũ, **không phải dừng** | phải dừng — mà `route()` không dừng (§9.2) |
| phải sửa teardown của `app.js` | **không** | **có** — nếu không thì tiếng vẫn chạy ngầm |
| bookmark / gửi cho đồng đội | được, là một URL thật | được |
| nút "quay lại" phải tự dựng | không | có |

Cột trái thắng ở mọi hàng. Và hàng thứ tư là hàng quyết định: **tab mới là phương án duy nhất
không buộc phải sửa một tính năng khác.**

Markup phải có `rel="noopener noreferrer"`: không có nó, trang mới đọc được `window.opener`
và có thể điều hướng chính cái tab đang mở trận.

### 4.4 Vì sao ẩn trong toàn màn hình

Toàn màn hình là **phòng chiếu** — cả đội ngồi xem, `docs/film-fullscreen-design.md` §7.1
gọi viewport là ngân sách và không gì được cuộn. Một dòng chữ dẫn ra ngoài không có việc gì
ở đó, và tệ hơn: nó là một tab stop nằm chen giữa thanh transport và bàn phím.

Một dòng CSS, đặt trong khối `.film-full` sẵn có, nơi **mọi luật đều là override chứ không
phải sửa** (`Stats/stats-view.css:355`):

```css
.film-full .film-guide{display:none}
```

`display:none` gỡ luôn khỏi tab order, nên `Tab` trong phòng chiếu đi đúng như hôm nay.

Guide dạy đúng thứ tự tự nhiên: **đọc trước, rồi mới bấm F.** §7.8 của nội dung nói thẳng
điều đó.

### 4.5 Markup

Chèn vào `filmHTML()`, ngay sau `+'</div>'` đóng `.film-bar` (`Stats/stats-view.js:1445`):

```js
      +'</div>'
      /* Con thứ ba của .film-main, và cố ý là một <a> thuần: không onclick,
         không listener, nên filmStart()/filmStop() không phải biết nó có mặt và
         một lần redraw không để lại gì. target=_blank giữ nguyên chỗ đang xem
         trong trận — người ta đọc hướng dẫn để làm theo NGAY, chứ không phải
         để thay cho việc đang làm. Chỉ host nào xin mới có, đúng luật fmFull. */
      +(filmGuideOK()
        ?'<a class="film-guide" href="'+esc(opts.guide)+'" target="_blank"'
          +' rel="noopener noreferrer">'
          +'<span class="fg-mark" aria-hidden="true">?</span>'
          +'<span class="fg-txt">Guidelines</span>'
          +'<span class="fg-out" aria-hidden="true">&#8599;</span></a>'
        :'')
    +'</div>'
```

`esc()` đã có sẵn trong file (đến từ `shared.js`) và được dùng khắp `filmHTML`.

Chữ trên link đúng bằng chữ yêu cầu nói: **`Guidelines`**. Dấu `?` trong vòng tròn và mũi tên
`↗` là `aria-hidden`, nên trình đọc màn hình đọc đúng một từ "Guidelines"; `↗` là quy ước
"mở ở tab mới" mà người dùng web đã đọc được mà không cần giải thích.

### 4.6 CSS

Thêm vào cuối khối Film của `Stats/stats-view.css`, **trước** khối `@media` ở dòng 344:

```css
/* Dòng dẫn ra tài liệu. Một hàng thấp dưới thanh transport, đọc như chú thích
   chứ không như một nút — nó không phải là việc phải làm, nó là chỗ để hỏi.
   Chỉ có mặt khi host truyền opts.guide, nên trang Stats của tagger không có
   luật nào ở đây áp vào bất cứ thứ gì. */
.film-guide{
  display:inline-flex;align-items:center;gap:7px;align-self:flex-start;
  padding:3px 2px;color:var(--mut);text-decoration:none;
  font-size:12px;line-height:1.4;border-bottom:1px solid transparent;
}
.film-guide:hover,.film-guide:focus-visible{color:var(--ink);border-bottom-color:var(--accent)}
.film-guide .fg-mark{
  flex:none;width:15px;height:15px;border-radius:50%;display:inline-grid;place-items:center;
  border:1px solid currentColor;font-size:9.5px;font-weight:700;line-height:1;
}
.film-guide .fg-txt{font-weight:600;letter-spacing:.01em}
.film-guide .fg-out{font-size:10px;opacity:.65}

/* Phòng chiếu không đọc tài liệu: xem §4.4 của docs/film-guidelines-design.md */
.film-full .film-guide{display:none}
```

`--mut`, `--ink`, `--accent` là biến sẵn có của `stats-view.css`, nên dòng này ăn theo theme
của cả hai host mà không thêm token nào. `align-self:flex-start` giữ vùng bấm đúng bằng bề
rộng của chữ, chứ không kéo ngang cả cột — một link rộng 1300px là một cái bẫy chuột.

### 4.7 Không một listener nào mới — và vì sao đó là cả thiết kế

`filmStart()` (`Stats/stats-view.js:1471`) gắn hai loại listener, và chỉ một loại là nguy hiểm:

| Loại | Ví dụ | Ai dọn |
|---|---|---|
| gắn trên **node bên trong `.film`** | `fmPlay.onclick`, `fmTrack` pointerdown, `fmList.onclick`, `fmNext.onclick`, 4 listener trên `<video>` | **trình duyệt** — node bị `innerHTML` thay thế thì listener đi theo |
| gắn trên **`document`** hoặc sống lâu hơn node | `keydown`→`filmKeys`, `click`→`filmDocClick`, `fullscreenchange`, `webkitfullscreenchange`, vòng `requestAnimationFrame`, `src` của `<video>`, và `filmTools.attach()` | **`filmStop()`**, bằng tay, ở `Stats/stats-view.js:1591` |

Hàng thứ hai là chỗ dễ vỡ nhất của Film — `docs/film-fullscreen-design.md` §6.4 dành hẳn một
mục cho nó, và §9.2 dưới đây là chuyện xảy ra khi `filmStop()` không được gọi.

Thiết kế này **không thêm gì vào cả hai hàng.** Cái link là một `<a href>` — trình duyệt lo phần
click, phần bàn phím (`Enter`), phần middle-click, phần `Ctrl`+click, phần menu chuột phải
"Open link in new tab". Nên:

- `filmStart()`: **0 dòng đổi**
- `filmStop()`: **0 dòng đổi**
- redraw (đổi hiệp, event mới về qua cloud): link được sinh lại cùng `filmHTML()`, không có
  trạng thái nào phải khôi phục
- `destroy()`: không có gì phải dọn

Một hệ quả cần nói rõ: sau khi bấm link, **focus vẫn nằm trên thẻ `<a>`** ở tab cũ.
`filmKeys` loại trừ `INPUT`/`SELECT`/`TEXTAREA` (`Stats/stats-view.js:1806`) chứ không loại
trừ `A`, nên `Space` tiếp theo vẫn là phát/dừng — đúng như mong đợi. `Enter` sẽ mở lại link,
cũng đúng như mọi link được focus trên web.

---

## 5. Trang guide

### 5.1 Vì sao một trang tĩnh, không phải một route trong app

| | `client/guide.html` (chốt) | `#/guide` trong `app.html` |
|---|---|---|
| thời gian tới chữ đầu tiên | **ngay** — không Supabase, không auth, không đọc channel | phải chờ `boot()`: `auth.user()` → `channels.claim()` → `clubs()` → `matches()` |
| đọc được khi chưa đăng nhập | **được** — tài liệu là công khai | được, nhưng vẫn phải chạy hết vòng boot |
| kích thước `app.js` | **+0** | +~40 KB nội dung dựng bằng chuỗi JS |
| nội dung viết bằng gì | **HTML thật** — sửa một câu là sửa một câu | chuỗi JS nối, phải `esc()` từng đoạn |
| rủi ro với routing sẵn có | **0** | phải thêm nhánh vào `route()` |
| khuôn có sẵn trong repo | **có** — `client/login.html` đúng dạng này | — |

`client/login.html` đã là bằng chứng khuôn này chạy được: một trang độc lập, nạp `site.css`
+ `app.css`, có brand riêng, không cần shell của app.

### 5.2 File và bộ khung

```
client/guide.html          trang
client/assets/guide.css    chỉ trang này nạp
client/assets/guide.js     chỉ trang này nạp
```

`<head>` của `guide.html`:

```html
<link rel="stylesheet" href="assets/site.css?v=3">
<link rel="stylesheet" href="assets/app.css?v=18">
<link rel="stylesheet" href="assets/guide.css?v=1">
```

Ba dòng, đúng thứ tự đó. `site.css` mang design tokens (`--void`, `--chalk`, `--red`,
`--f-display`…), `app.css` mang thanh trên cùng, `guide.css` chỉ thêm cái gì riêng của tài
liệu. **Không sửa `site.css` và `app.css`** — đây là lý do có file thứ ba.

Bố cục:

```
<header class="app-top">            (đúng khuôn app.html: brand, và một link "Back to your channel")
<div class="guide-body">
  <nav class="guide-toc">           (dính, cuộn theo, scrollspy)
  <main class="guide-main">
    <h1> + intro
    <section id="s-quick">   … 16 section, id ổn định, deep-link được
  </main>
</div>
<footer class="guide-foot">
```

`id` của section là **hợp đồng công khai**: `guide.html#s-clips` là một link người ta gửi
cho nhau. Đổi id là làm hỏng link đã gửi — nên id được liệt kê ở §7.0 và test giữ chúng
(§11.4).

Chỗ để ngỏ cho bản tiếng Việt sau này: `guide.html` là trang thứ nhất; một `guide.vi.html`
dùng lại nguyên `guide.css` + `guide.js` là đủ, không phải sửa gì bên trong Film.

### 5.3 Điều hướng trong trang

`client/assets/guide.js` làm đúng ba việc, và không việc nào chạm ra ngoài trang này:

1. **Scrollspy** — vị trí cuộn, **không phải `IntersectionObserver`**. Đọc xuôi một trang dài
   thì hai ba mục cùng nằm trong khung hình suốt phần lớn thời gian, nên "có nhìn thấy không"
   là câu hỏi sai; câu đúng là "vừa đi xuống vào mục nào", và đó là so `getBoundingClientRect().top`
   với một vạch dưới thanh tiêu đề. Tiết lưu bằng đồng hồ (80 ms) chứ không bằng
   `requestAnimationFrame`: một trang không được vẽ thì không có frame nào, và phần tô sáng sẽ
   đứng lại ở chỗ cuối cùng nó được đặt. Mọi phép đo là đọc, mọi phép ghi xảy ra sau, nên
   không có thrash layout.

   > Đây là một quyết định **đo được chứ không đoán**: bản đầu dùng `IntersectionObserver`, và
   > khi kiểm trên trình duyệt thì nó **không phát ra một callback nào** — kể cả một observer
   > trần không rootMargin, trên 16 section thật. Cùng lý do đó `requestAnimationFrame` cũng
   > không chạy. Phiên bản theo vị trí cuộn thì kiểm được, và đã kiểm: nạp trang → `#s-quick`,
   > cuộn tới từng mục → đúng mục đó sáng, đáy trang → `#s-limits`, về đầu → `#s-quick`.
2. **Mục lục trên điện thoại** — dưới 900px mục lục thành một `<details>` gập lại ở đầu
   trang, mở ra là danh sách.
3. **Video** — §6.5.

Không cần framework, không cần build; đúng như phần còn lại của repo.

### 5.4 Trang này không chạm vào Supabase

`guide.html` **không** nạp `supa.js`, **không** nạp `supabase-js`, **không** nạp `app.js`.
Nó là tài liệu, và tài liệu không cần biết ai đang đọc. Hệ quả thực tế: nó mở được cả khi
người ta chưa đăng nhập, khi phiên hết hạn, và khi Supabase đang chết — đúng lúc người ta
cần đọc nhất.

Link "Back to your channel" ở thanh trên là `app.html` — không mang match id, vì tab kia vẫn
đang mở đúng trận đó.

---

## 6. Video mô tả (Q3)

### 6.1 Vì sao R2, và vì sao nó chạy được ngay hôm nay

Bucket công khai đã có và site đã phát video trận từ nó:
`https://pub-9cdd291bf181425b9738328ada297691.r2.dev` (`cloud-sync.js:18`,
`worker/wrangler.toml:11`).

Ba lý do:

| | |
|---|---|
| **egress miễn phí** | R2 không tính phí băng thông ra. 13 clip × 6 MB, xem 200 lần/tháng = **0 đồng** |
| **range request** | trình duyệt chỉ tải khúc nó đang phát, nên tua không phải chờ tải hết |
| **không phình repo** | GitHub Pages không phải chỗ để 80 MB video, và mỗi lần deploy sẽ phải đẩy lại toàn bộ |

**Và điểm quan trọng nhất: phát video KHÔNG cần CORS.** `<video src>` là một request thường,
không phải `fetch`. Chỉ khi đọc pixel ra canvas mới cần `Access-Control-Allow-Origin` — đó
là lý do `exportClip()` cần nó (`client/assets/film-tools.js:1114-1125`) và guide thì không.

Nên: **guide phát được clip ngay hôm nay**, kể cả khi `worker/r2-cors.json` chưa được áp lên
bucket. Việc áp CORS là việc của tính năng xuất `.mp4`, không phải của tính năng này — và
§7.15 của nội dung nói đúng điều đó cho người dùng.

### 6.2 Bố cục trên bucket, và manifest

```
guide/01-tour.mp4          …           guide/13-export.mp4
guide/posters/01-tour.jpg  …           guide/posters/13-export.jpg
```

`client/assets/guide.js` giữ một manifest — một mảng, không phải một API call:

```js
var MEDIA = {
  base: 'https://pub-9cdd291bf181425b9738328ada297691.r2.dev/guide/',
  rev: 1,                       // tăng khi quay lại một clip, để phá cache của R2
  clips: {
    tour:    { file: '01-tour.mp4',        secs: 35 },
    play:    { file: '02-play.mp4',        secs: 28 },
    /* … 13 mục … */
  }
};
```

HTML chỉ khai tên:

```html
<figure class="g-demo" data-clip="play">
  <figcaption>Playing, pausing and moving through the match</figcaption>
</figure>
```

`guide.js` dựng `<video controls preload="none" playsinline poster="…">` vào trong. Lý do
tách như vậy: đổi tên file, đổi bucket, hay bỏ một clip là **sửa một dòng trong manifest**,
không phải sửa 13 chỗ trong HTML.

### 6.3 Spec 13 clip

Tất cả: **1920×1080, 30 fps, H.264, không có track tiếng, `-movflags +faststart`,
≤ 6 MB.** Poster: JPEG 1280×720, ≤ 120 KB, lấy từ một frame tiêu biểu (không lấy frame đầu —
frame đầu thường là màn hình chưa vẽ xong).

| # | id | file | Mục | Trong clip có gì | Dài |
|---|---|---|---|---|---|
| 1 | `tour` | `01-tour.mp4` | §7.2 | con trỏ dừng lần lượt ở 6 vùng, mỗi vùng ~5s | 0:35 |
| 2 | `play` | `02-play.mp4` | §7.3 | Space phát/dừng, ← →, kéo thanh, đồng hồ chạy | 0:28 |
| 3 | `halves` | `03-halves.mp4` | §7.4 | bấm 2nd Half, đồng hồ nhảy về 45:00, danh sách đổi | 0:18 |
| 4 | `filters` | `04-filters.mp4` | §7.5 | mở All players, tick 9 và 14, nút đổi thành "2 players", danh sách hẹp lại, bấm All để bỏ | 0:32 |
| 5 | `list` | `05-list.mp4` | §7.6 | bấm một dòng → nhảy tới; bấm ⏭ ba lần liên tiếp | 0:26 |
| 6 | `pitch` | `06-pitch.mp4` | §7.7 | chấm hiện ra, đường chuyền, bóng chạy dọc đường đó | 0:22 |
| 7 | `full` | `07-fullscreen.mp4` | §7.8 | bấm ⛶ (rồi F), bố cục lớn, Esc để ra | 0:20 |
| 8 | `menu` | `08-right-click.mp4` | §7.9 | chuột phải, đi qua từng nhóm mục, mở một submenu | 0:40 |
| 9 | `draw` | `09-draw.mp4` | §7.10 | mũi tên → cong → nét đứt → vùng → chữ → đánh dấu; rồi hoàn tác | 0:45 |
| 10 | `spot` | `10-spotlight.mp4` | §7.10 | S, kéo đèn tới đúng cầu thủ, lăn chuột đổi cỡ, D làm tối | 0:30 |
| 11 | `time` | `11-time-window.mp4` | §7.11 | T hiện thanh, bấm một thanh để chọn, 1–9, 0 ghim, Shift+← | 0:38 |
| 12 | `clips` | `12-clips.mp4` | §7.12 | [ và ], "Clip quanh event này", C mở bảng, ▶ Phát hết | 0:35 |
| 13 | `export` | `13-export.mp4` | §7.13 | lưu .png, tải .mp4 (tua nhanh phần chờ), chép link | 0:30 |

Tổng ~6:29.

### 6.4 Quy tắc khi quay

1. **Dùng một trận đã công khai trong channel demo**, không dùng trận của client thật — clip
   sẽ nằm trên một bucket công khai, và trong khung hình có tên cầu thủ và số áo.
2. **Ẩn email đang đăng nhập** ở góc phải thanh trên (hoặc cắt bỏ vùng đó) — nó là dữ liệu cá
   nhân và nó sẽ nằm trên internet.
3. **Bật hiển thị phím bấm** (Carnac, Keycastow, hoặc tương đương). Clip không tiếng thì phím
   phải nhìn thấy được, nếu không §7.14 chỉ là một bảng chữ.
4. **1920×1080 đúng bằng, không co giãn.** Quay ở tỷ lệ khác rồi resize làm chữ trên slicer
   không đọc nổi.
5. **Đi chậm.** Sau mỗi thao tác dừng ~1 giây. Người xem đang vừa xem vừa làm theo.
6. **Không cắt cảnh.** Một clip là một lần quay liền mạch của một việc.

Nén, một dòng:

```bash
ffmpeg -i raw.mkv -an -vf scale=1920:1080 -c:v libx264 -profile:v high -crf 24 -preset slow -movflags +faststart 02-play.mp4
```

Poster:

```bash
ffmpeg -ss 6 -i 02-play.mp4 -frames:v 1 -vf scale=1280:720 -q:v 4 posters/02-play.jpg
```

Upload: dùng đúng đường đã có cho video trận (`worker/r2-presign.js`), hoặc kéo thả trong
dashboard R2 vào prefix `guide/`. **Không có code mới nào cho việc upload** — đây là thao tác
một lần của con người, không phải một tính năng.

### 6.5 Cái player trong trang, và cái xảy ra khi chưa có video

Mỗi demo là một khối ba phần, **theo đúng thứ tự này**:

1. **Các bước bằng chữ** — đánh số, đọc được và làm theo được mà không cần xem video
2. **Video** — `controls preload="none" playsinline`, có poster
3. **Một câu "kết quả đúng phải là gì"**

`preload="none"` là bắt buộc: 13 clip mà preload metadata là 13 request ngay khi mở trang.
Không autoplay, không loop, không muted-autoplay — người đọc quyết định khi nào xem.

Khi file chưa có trên bucket (hoặc mạng hỏng), `guide.js` bắt `error` trên `<video>` và thay
bằng một khối chữ:

> *Demo video not available yet — the written steps above are complete on their own.*

Nghĩa là: **trang này ship được trước khi quay xong clip nào.** Chữ là nguồn sự thật; video
là thứ làm nó nhanh hơn.

---

## 7. NỘI DUNG TRANG GUIDE — bản đầy đủ (English)

Đây là **bản thảo cuối**, không phải dàn ý: chữ dưới đây đi thẳng vào `client/guide.html`.
Mỗi `§7.x` là một `<section>`; `id` in đậm là hợp đồng deep-link (§5.2).

### 7.0 Khung trang, tiêu đề, mục lục

**Tiêu đề trang (`<title>`):** `Film — how to use it · HoangNam Analytics`

**H1:** `Using Film`

**Đoạn mở:**

> Film plays your match back over the video it was tagged against — every pass, tackle and
> shot placed on the exact second it happened. This page walks through everything it can do,
> in the order you are likely to need it. Nothing here needs to be installed and nothing here
> can damage your data: Film only ever reads.
>
> **Keep this tab open beside your match.** It was opened in a new tab on purpose, so the
> video you were watching is still where you left it.

**Mục lục — 16 mục, id ổn định:**

| | Mục lục hiển thị | `id` |
|---|---|---|
| 1 | In one minute | `s-quick` |
| 2 | What is on the screen | `s-screen` |
| 3 | Playing the match | `s-play` |
| 4 | The two halves | `s-halves` |
| 5 | Showing only what you want | `s-filters` |
| 6 | The event list | `s-list` |
| 7 | The pitch map | `s-pitch` |
| 8 | Full screen | `s-full` |
| 9 | The analyst tools | `s-tools` |
| 10 | Drawing on the frame | `s-draw` |
| 11 | How long a drawing stays | `s-time` |
| 12 | Clips and playlists | `s-clips` |
| 13 | Taking work out of the app | `s-export` |
| 14 | Every keyboard shortcut | `s-keys` |
| 15 | If something does not work | `s-help` |
| 16 | What Film does not do | `s-limits` |

---

### 7.1 `s-quick` — In one minute

> If you read nothing else, read this.
>
> | Do this | And this happens |
> |---|---|
> | Press **Space** | the match plays, or pauses |
> | Press **←** or **→** | you move two seconds back or forward |
> | **Click any row** in the list on the right | the video jumps to that moment |
> | Press **F** | the match fills the screen — this is where the analyst tools live |
> | **Right-click the picture** (in full screen only) | the analyst menu opens: draw, spotlight, cut a clip, export |
> | Press **Esc** | you come back out of full screen |
>
> Everything else on this page is detail on those six lines.

*(demo: `tour` — cùng lúc dùng cho §7.2)*

---

### 7.2 `s-screen` — What is on the screen

> Film is six things arranged around one video. Here is each of them, clockwise from the top.
>
> **1. The half buttons — `1st Half` / `2nd Half`**
> Above the video. They only appear when the match has both halves marked up. See §The two halves.
>
> **2. The picture**
> The match video. **Clicking it does nothing, on purpose** — you are watching a moving
> passage of play, and a mis-click that stopped it would cost you your place. Use **Space**
> to play and pause.
>
> **3. The caption strip**
> The dark band along the bottom of the picture. It shows the entry happening right now —
> for example `18 pass success 9 pass success 14`. **The home team is written from the left
> edge, the away team from the right edge**, so you can tell which side did what before you
> have read a single word.
>
> **4. The transport bar**
> Under the picture: the play button, the scrub bar, and the clock.
>
> > **The clock is match time, not video time.** It reads `00:00` at kick-off and `45:00` at
> > the start of the second half, whatever point of the video file that actually is. So if
> > you switch to the second half and see `45:00 / 90:00`, that is correct.
>
> **5. The pitch map**
> Top right. A scale pitch showing where on the grass the current action happened. See
> §The pitch map.
>
> **6. The filters and the event list**
> Right-hand column. Three filters across the top, then every tagged entry of this half in
> time order. See §Showing only what you want and §The event list.

*(demo: `tour` — the pointer rests on each of the six areas in turn)*

---

### 7.3 `s-play` — Playing the match

> **The written steps**
>
> 1. Press **Space** to start. Press it again to pause.
> 2. Press **←** to go back two seconds, **→** to go forward two seconds. Hold the key down
>    to keep moving.
> 3. To jump somewhere: **click anywhere on the scrub bar**, or press and drag the round
>    handle along it.
> 4. The play button beside the bar does the same as Space, for when you would rather use
>    the mouse.
>
> **Two things worth knowing**
>
> - **You cannot leave the half you are in.** The bar covers the first half only, or the
>   second half only, and the video is held inside it. That is why the bar fills up over
>   45-odd minutes rather than over the whole file.
> - **Space works wherever your mouse is**, as long as you are not typing in a box. If you
>   have a filter panel open and your cursor is in it, Space ticks the box under it instead —
>   press **Esc** to close the panel and Space is the video's again.

*(demo: `play`)*

---

### 7.4 `s-halves` — The two halves

> The match is one video file, but Film treats each half as its own window.
>
> 1. Click **`2nd Half`** above the picture.
> 2. The video jumps to the second-half kick-off, the clock resets to **45:00**, and the
>    event list refills with the second half's entries.
> 3. Click **`1st Half`** to go back.
>
> **If you only see one button, or none:** that match was submitted without both halves
> marked. Film then plays the whole file in one window labelled `Full Match`. Everything else
> on this page still works.
>
> **What you keep and what you lose when you switch:** your three filters stay exactly as you
> set them. Your place in the half you were watching does not — switching half is a
> deliberate move to somewhere else. Any drawings you made are kept and are still on the
> frames they belong to.

*(demo: `halves`)*

---

### 7.5 `s-filters` — Showing only what you want

> Three filters sit above the event list: **`Both teams`**, **`All players`**, **`All events`**.
> They are not drop-downs — each opens a list of tick boxes, and **you can tick as many as
> you like**. That is the point: "9 and 14" is a question a drop-down cannot ask.
>
> **The written steps**
>
> 1. Click **`All players`**. A panel opens.
> 2. Tick **9**, then tick **14**. The list narrows as you tick — the panel stays open.
> 3. The button now reads **`2 players`**. Tick one only and it reads **`9`**; tick none and
>    it goes back to **`All players`**.
> 4. Click somewhere else, or press **Esc**, to close the panel.
> 5. To clear it, open it again and tick **`All players`** at the top of the list.
>
> **Rules that save you time**
>
> - **The three filters combine.** Team *and* player *and* event, all at once. `Saint Lucia` +
>   `9` + `pass fail` is one question.
> - **Ticking everything is the same as ticking nothing.** Film normalises it back to "all",
>   so the button and the list can never disagree.
> - **The options are this half's.** The player list holds the numbers that touched the ball
>   in *this* half, and the event list holds the events tagged in *this* half — plus whatever
>   you currently have ticked, so a pick is never silently dropped when you change half.
> - **An empty list is a real answer.** `No events match this filter.` means exactly that: he
>   did not do that in this half.

*(demo: `filters`)*

---

### 7.6 `s-list` — The event list

> Every tagged entry of this half, in the order it happened.
>
> **Reading a row.** The time on the left is match time. The rest is the entry as it was
> typed: `18 recovery pass success 4` is *one* thing that happened — number 18 won the ball
> and passed it to number 4 — not two separate touches. Shirt numbers are coloured by side.
>
> **Using it**
>
> 1. **Click a row** and the video jumps to that moment. The row lights up as the video
>    reaches it, so you can also just watch the list scroll itself.
> 2. **The ⏭ button** beside the filters jumps to the next entry *that matches your filters*
>    and starts playing, landing two seconds early so you see the build-up rather than the
>    result.
> 3. Filter to `9` + `shot`, then press **⏭** repeatedly, and you have a shot reel for number
>    9 without cutting anything.
>
> **Why an entry holds the screen for longer than an instant:** a pass has a beginning and an
> end, and Film shows it for its whole flight. A clearance or an aerial duel has no span at
> all, so it is held on screen for about a second instead. That is why some captions linger
> and others flick past.

*(demo: `list`)*

---

### 7.7 `s-pitch` — The pitch map

> The pitch in the top right is a scale drawing of the real one, and every dot is where the
> action actually happened — the position the analyst marked while tagging, not an estimate.
>
> - **A dot** is a touch. Its colour is the side that made it.
> - **A line between two dots** is a pass or a cross: where it was struck, and where it
>   arrived.
> - **The moving dot** is the ball, travelling between the two along that line, in step with
>   the video.
>
> The pitch does not move with the camera. The camera pans and zooms; the pitch stays a
> pitch. That is what makes it readable — a wide switch of play looks like a wide switch of
> play, even when the broadcast cannot fit both touchlines in the frame.

*(demo: `pitch`)*

---

### 7.8 `s-full` — Full screen

> **This is the important section on this page**, because it is the door to everything in the
> three sections after it.
>
> 1. Click the **⛶** button at the right-hand end of the transport bar, or just press **F**.
> 2. The match fills the screen. Everything is still there — the picture, the caption, the
>    pitch, the filters and the list — just bigger, sized so a shirt number can be read from
>    the back of a meeting room.
> 3. Press **Esc**, or **F** again, to come back.
>
> **Two things only exist in full screen:**
>
> - the **right-click analyst menu**, and everything it opens
> - the **frame-by-frame, drawing, clip and export keys** (`,` `.` `S` `D` `H` `T` `L` `[` `]` `C`)
>
> Outside full screen those keys do nothing at all. That is deliberate: at normal size the
> picture is about 1300 pixels wide, and drawing an accurate offside line across a player 40
> pixels tall is not serious work.
>
> > This `Guidelines` link is hidden while you are in full screen — the projector room is not
> > for reading. Read here first, then press **F**.

*(demo: `full`)*

---

### 7.9 `s-tools` — The analyst tools

> **Go full screen, then right-click anywhere on the picture.** A menu opens at the point you
> clicked — and that matters, because half of what is in it means "do something *here*".
>
> **The video does not stop when the menu opens.** That is on purpose, and it is why every
> drawing you create from the menu is anchored to the frame you right-clicked on, not to
> wherever the match has run on to while you were reading.
>
> #### The menu, item by item
>
> The menu is written in Vietnamese. The exact words are in the left-hand column below so you
> can find the line; the middle column says what it does.
>
> | On the menu | What it does | Key |
> |---|---|---|
> | *(top line)* `12:34 · 1st Half` | the moment you right-clicked — not a button | |
> | `Bước lùi 1 frame` | one frame back | `,` |
> | `Bước tới 1 frame` | one frame forward | `.` |
> | `Tốc độ` ▸ | playback speed: `0.25×` `0.5×` `1×` `1.5×` `2×` | |
> | `Lặp A–B từ đây` | loop the next 8 seconds over and over. Choose `Bỏ lặp A–B` to stop | `L` |
> | `Spotlight here` | put a spotlight on this spot and darken nothing else | `S` |
> | `Làm tối phần còn lại` | darken everything except the spotlights. `Bỏ làm tối` undoes it | `D` |
> | `Phóng to vùng này` | zoom into this spot. `Bỏ phóng to` returns to full size. The mouse wheel does the same | |
> | `Vẽ` ▸ | the drawing tools — see §Drawing on the frame | |
> | `Ẩn đồ hoạ` | hide every drawing without deleting any. `Hiện lại đồ hoạ` brings them back | `H` |
> | `Ẩn thanh thời gian` | hide the drawing timeline. `Hiện thanh thời gian` shows it | `T` |
> | `Hình ở đây: …` ▸ | **only appears if you right-clicked on top of a drawing** — see §How long a drawing stays | |
> | `Đánh dấu ĐẦU clip` | mark the start of a clip here | `[` |
> | `Đánh dấu CUỐI clip` | mark the end of a clip here — the clip is saved as soon as both ends exist | `]` |
> | `Clip quanh event này (±6s)` | save a 12-second clip centred on the nearest tagged event. Fastest way to cut a goal | |
> | `Danh sách clip…` | open the clip list | `C` |
> | `Lưu khung hình (.png)` | save this frame as a picture, with your drawings on it | |
> | `Tải đoạn đã đánh dấu (.mp4)` | render the marked section to a video file on your computer | |
> | `Chép link tới khoảnh khắc này` | copy a link to this second | |
> | `Thoát toàn màn hình` | leave full screen | `Esc` |
>
> **Backing out of anything: press `Backspace`.** It closes the innermost thing first — the
> menu, then a half-drawn shape, then the spotlight you are positioning, then the armed tool,
> then the selected drawing, then the clip list. Press it a few times and you are back to
> plain playback.

*(demo: `menu`)*

---

### 7.10 `s-draw` — Drawing on the frame

> **Choose a tool from `Vẽ`, then drag on the picture.** The tool stays armed until you
> press `Backspace`, so you can draw several arrows without going back to the menu each time.
>
> | On the menu | What you get | How to draw it |
> |---|---|---|
> | `Mũi tên` | a straight arrow | drag from start to end |
> | `Mũi tên cong` | a curved arrow | drag; the curve is drawn for you |
> | `Mũi tên nét đứt (chạy không bóng)` | a dashed arrow — the convention for **a run without the ball** | drag |
> | `Bút tự do` | freehand line | draw as if with a pen |
> | `Vùng (half-space, pocket)` | a shaded area — a half-space, a pocket, a zone left open | drag out a box |
> | `Chữ` | a text label | click, type, press **Enter** |
> | `Đánh dấu cầu thủ` | a ring around a player | click on him |
>
> Two more entries at the bottom of the same submenu: **`Hoàn tác nét cuối`** undoes the last
> shape, **`Xoá hết đồ hoạ`** clears them all.
>
> #### The spotlight — the one you will use most
>
> 1. Press **`S`** (or choose `Spotlight here`). A circle of light appears.
> 2. **Drag it** onto the player you mean. It stays in positioning mode, so you do not have
>    to start again.
> 3. **Roll the mouse wheel** to make it bigger or smaller.
> 4. Press **`D`** to darken everything outside it. Press `D` again to lift the darkness.
>
> #### Changing a drawing after you have made it
>
> Right-click on top of it. A new group appears at the top of the menu, `Hình ở đây: …`,
> holding everything about that one shape: select it, set how long it lasts, pin it, freeze
> the frame on it when exporting, change its colour (`Đỏ` red · `Trắng` white · `Vàng`
> yellow), or delete it.
>
> With a drawing selected: **`Delete`** removes it, **`Shift`+`←`/`→`** slides it one frame
> earlier or later.
>
> > **Where your drawings are kept.** In this browser, on this computer, against this match.
> > They survive closing the tab and coming back. They are **not** uploaded and **not**
> > shared — a colleague opening the same match on their own machine sees a clean picture.
> > To hand a drawing to somebody, export it: a **.png** of the frame, or an **.mp4** of the
> > clip with the graphics burned in.

*(demos: `draw`, `spot`)*

---

### 7.11 `s-time` — How long a drawing stays

> A drawing belongs to the **moment** it was made on, not to the whole match. Draw an arrow
> on the 12th minute and it is not still hanging there in the 60th.
>
> **Press `T`** and a thin lane appears above the picture, with one bar per drawing sitting
> at the stretch of time it is alive for. That lane is the whole feature made visible.
>
> **The written steps**
>
> 1. Press **`T`** to show the lane.
> 2. **Click a bar** to select that drawing. (Right-clicking the drawing itself and choosing
>    `Chọn để sửa` does the same.)
> 3. Press a number **`1`–`9`** to set how many seconds it lasts. Do this with nothing
>    selected and it becomes the default for the next shape you draw.
> 4. Press **`0`** to pin it — pinned, it stays up for the whole clip. Press `0` again to
>    release it.
> 5. **`Shift`+`←`/`→`** slides it one frame at a time until it sits exactly on the touch you
>    mean.
> 6. Press **`T`** again to hide the lane. Hiding the lane does not change any drawing.
>
> **`Đứng hình khi xuất clip`** (in the `Hình ở đây` group) is a different kind of duration:
> it holds the *video* still on that drawing for 2 to 5 seconds **in the exported file only**,
> so the coach watching the .mp4 gets time to read it. It changes nothing about how the clip
> plays here.

*(demo: `time`)*

---

### 7.12 `s-clips` — Clips and playlists

> A clip is a start time and an end time. Nothing is copied and nothing is re-encoded until
> you actually ask for a file, so making clips costs nothing.
>
> #### Three ways to make one
>
> | | How | Best for |
> |---|---|---|
> | **Mark the ends** | press **`[`** where it should start, **`]`** where it should end | a passage you are watching now |
> | **Around an event** | right-click ▸ `Clip quanh event này (±6s)` | goals, shots, turnovers — anything already tagged |
> | **From the list** | click the row, then press `[`, play on, press `]` | working down a filtered list |
>
> The clip saves itself the moment both ends exist. Press `[` and `]` the wrong way round and
> Film swaps them for you.
>
> #### The clip list
>
> Press **`C`**. A drawer opens showing `Clip (n)` and one row per clip:
>
> | Control | What it does |
> |---|---|
> | `▶ Phát hết` | play every clip in order, back to back — your team meeting, in one press |
> | **▶** on a row | play that clip |
> | **⭳** on a row | render that clip to an **.mp4** on your computer, graphics included |
> | **✕** on a row | remove that clip from the list |
> | **✕** in the header | close the drawer |
>
> Press **`C`** again, or `Backspace`, to close it.
>
> > **Clips are kept the same way drawings are:** in this browser, against this match, not
> > uploaded and not shared. To give somebody a clip, download it with **⭳** and send them
> > the file.

*(demo: `clips`)*

---

### 7.13 `s-export` — Taking work out of the app

> #### A picture — `Lưu khung hình (.png)`
>
> Saves the frame you are on, at the video's own resolution, with your drawings on it.
> Instant. This is the one to use for a slide, a WhatsApp message, or a report.
>
> #### A video — `Tải đoạn đã đánh dấu (.mp4)`
>
> Renders the marked section — or the ⭳ button renders one clip from the list — into a real
> video file with the graphics burned in, saved to your computer.
>
> - **It is not instant.** Rendering runs at roughly real time: a 12-second clip takes about
>   12 seconds. Only one clip renders at a time.
> - **Nothing is uploaded.** The file is built in your browser and written straight to your
>   disk. It never touches our servers, and it costs nothing to store.
> - **Keep the tab visible while it renders.** Some browsers slow hidden tabs down.
> - **Use Chrome or Edge for .mp4.** Firefox can only produce **.webm**, and Film will tell
>   you so before it starts. A .webm plays fine on a computer but is awkward to put into
>   PowerPoint.
>
> #### A link — `Copy a link to this moment`
>
> Copies a web link pointing at the exact second you are on. Whoever opens it lands on this
> match, on the Film tab, at that second. Paste it into an email or a message the way you
> would any other link.

*(demo: `export`)*

---

### 7.14 `s-keys` — Every keyboard shortcut

> **Anywhere in Film**
>
> | Key | Does |
> |---|---|
> | `Space` | play / pause |
> | `←` `→` | back / forward two seconds |
> | `F` | full screen on / off |
> | `Esc` | leave full screen |
>
> **In full screen only** — the analyst tools
>
> | Key | Does |
> |---|---|
> | `,` `.` | one frame back / forward |
> | `S` | spotlight where the mouse is |
> | `D` | darken everything else |
> | `H` | hide / show all drawings |
> | `T` | show / hide the drawing timeline |
> | `L` | loop the next 8 seconds |
> | `[` `]` | mark clip start / end |
> | `C` | open / close the clip list |
> | `1`–`9` | how many seconds the selected drawing lasts |
> | `0` | pin / unpin the selected drawing |
> | `Delete` | delete the selected drawing |
> | `Shift` + `←` `→` | move the selected drawing one frame |
> | `Backspace` | close the innermost thing that is open |
>
> **Mouse**
>
> | Action | Does |
> |---|---|
> | left-click the picture | nothing — deliberately |
> | right-click the picture *(full screen)* | open the analyst menu here |
> | wheel over the picture *(full screen)* | zoom in and out — or resize the spotlight you are positioning |
> | `Ctrl`/`Cmd` + wheel | your browser's own zoom, untouched |
> | drag on the picture | draw, once a tool is chosen |
> | click or drag the scrub bar | jump there |
> | click a row in the list | jump to that entry |

---

### 7.15 `s-help` — If something does not work

> | What you see | Why | What to do |
> |---|---|---|
> | **`No video for this match.`** | the match was tagged against a file on the analyst's own computer, so there is no shared video to play | everything else — Overview, Dashboard, Stats, the report — still works. Ask your analyst to publish the video with the match |
> | **Right-click does nothing** | you are not in full screen | press **`F`** first. The analyst tools only exist in full screen |
> | **`Space` scrolls instead of playing** | your cursor is in a filter panel | press **`Esc`** to close it |
> | **The clock says `45:00` and I expected `00:00`** | that is match time, and you are in the second half | correct behaviour — see §What is on the screen |
> | **`Right-click on the picture itself`** | you right-clicked on the black bar, not the picture | right-click on the grass |
> | **`This browser can only make .webm`** | Firefox cannot write MP4 | use Chrome or Edge for `.mp4` |
> | **`The video host has not enabled CORS…`** on export | the video host is not yet sending the header the renderer needs | tell us — it is a one-line setting on our side, not something you can fix. `.png` export and everything else are unaffected |
> | **A drawing I made yesterday is gone** | drawings live in the browser you made them in | they do not follow you between computers, or into a private window |
> | **A demo video here will not play** | it may not be recorded yet | the written steps beside each video are complete on their own |
>
> Anything not on this list: send us the match, the half, and the clock reading.

---

### 7.16 `s-limits` — What Film does not do

> Said plainly, so nobody spends an afternoon looking for it.
>
> - **It does not follow players by itself.** Every dot, every spotlight, every arrow is
>   somewhere a person pointed. Automatic tracking is a different class of product and needs
>   tracking data, not a feature.
> - **It does not share your drawings or clips.** They are kept in your own browser. Export
>   is how work leaves.
> - **It does not change the match.** Film only reads. Nothing you do here can alter a tagged
>   event, a line-up or a score.
> - **It does not edit the video.** No trimming the source, no joining two matches, no
>   re-ordering a playlist yet.
> - **It does not work on a phone for the analyst tools.** Playback, filters and the list are
>   fine on a tablet; drawing needs a mouse and a real screen.

---

## 8. Vấn đề ngôn ngữ: menu tiếng Việt, guide tiếng Anh

Đây là chỗ khó chịu nhất của thiết kế, và nó phải được nói ra chứ không giấu đi.

**Sự thật đo được:**

| Bề mặt | Ngôn ngữ | Bằng chứng |
|---|---|---|
| `client/index.html`, `login.html`, `app.html`, `app.js` | **English** | 0 chuỗi tiếng Việt hiển thị |
| `Stats/stats-view.js` (Film: `Both teams`, `All players`, `1st Half`…) | **English** | `Stats/stats-view.js:1376-1381` |
| `client/assets/film-tools.js` (menu chuột phải, toast, bảng clip) | **tiếng Việt** | 96 dòng, ví dụ `menuModel()` ở dòng 1485 |

Nên client ở Saint Lucia mở channel: mọi thứ tiếng Anh — cho tới lúc bấm chuột phải, và gặp
`Spotlight here`.

**Ba lựa chọn — và cái đã làm là A, sau khi được cho phép:**

| | Cách | Kết cục |
|---|---|---|
| **A** | **Dịch `film-tools.js` sang tiếng Anh** | **ĐÃ LÀM.** 94 nhóm chuỗi, 0 ký tự tiếng Việt còn lại trong file |
| B | Viết guide bằng tiếng Việt cho khớp menu | bỏ — lệch với toàn bộ phần còn lại, và client không đọc được |
| C | Guide tiếng Anh, trích nguyên văn nhãn tiếng Việt kèm gloss | là phương án dự phòng nếu A không được phép; không cần đến |

### 8.1 Đã dịch những gì

Toàn bộ **chuỗi hiển thị** — 20 mục menu và các menu con, tên công cụ (`toolName()`), mọi
`toast()`, bảng clip (`renderPanel()`), và các thông báo lỗi của export. Cộng hai comment gọi
tên chuỗi vừa đổi.

**KHÔNG đổi:** một dòng logic nào. Đây là phép thay chuỗi thuần — không hàm nào đổi chữ ký,
không nhánh nào đổi điều kiện, không key nào đổi. Dữ liệu người dùng (`hna.film.tools.v1`
trong `localStorage`) mang `kind: 'arrow'`, `life: 'pinned'` … tức là **mã chứ không phải
nhãn**, nên bản vẽ và clip lưu từ trước vẫn đọc được nguyên vẹn.

### 8.2 Cách nó được làm, và cách nó được kiểm

Thay chuỗi **chính xác từng literal, kèm cả dấu nháy**, để một nhãn ngắn không thể lọt vào
giữa một nhãn dài — `'Arrow'` không được phép chạm tới `'Curved arrow'`. Hai cặp chia chung
một literal với chỗ khác (`'📌 Giữ suốt clip'` ở toast và ở menu; `'Hiện thanh thời gian'` ở
toast và ở menu) được xử lý trước bằng cả dòng, nên chúng nhận hai bản dịch khác nhau đúng
như ngữ cảnh: *Kept for the whole clip* (đã xong) và *Keep for the whole clip* (lời mời).

Mọi cặp đều bắt buộc khớp ít nhất một lần, nếu không script dừng — một lần trượt im lặng sẽ
để lại menu dịch một nửa.

`tests/film-tools.test.js` bám vào 12 chuỗi trong số đó. **Chỉ chuỗi được tìm kiếm đổi**; không
một assertion nào đổi thứ nó khẳng định, và không test nào bị bỏ. Thêm một canary ở
`tests/film-guidelines.test.js`:

```js
notOk(VIETNAMESE.test(TOOLS),'no Vietnamese left in the toolkit the client sees');
```

Cùng dạng với test đã có sẵn ở `tests/auth-gate.test.js:365`, nơi cùng luật này đã được áp cho
nút đăng xuất — nên đây là đi tiếp một hướng repo đã chọn, không phải mở một hướng mới.

---

## 9. Không đổi gì của tính năng khác

### 9.1 Ma trận hồi quy

Mọi bề mặt của sản phẩm, và lý do **cấu trúc** khiến nó không thể đổi.

| Bề mặt | Có đổi? | Vì sao |
|---|---|---|
| Tagger — trang tag (`index.html`) | **không** | không nạp `stats-view.js` |
| Tagger — Player Lists | **không** | không nạp |
| Tagger — **Stats → Film** | **không** | mount `{chrome:false,local:true,cloud:true}` (`Stats/index.html:70`) → `opts.guide` là `undefined` → `filmGuideOK()` false → chuỗi HTML không chứa thẻ `<a>` |
| Tagger — Stats → Overall / Dashboard / Stats | **không** | `filmHTML()` không được gọi |
| Channel — Home / Channel / Data / Players | **không** | đường render khác hẳn |
| Channel — match → Overview / Dashboard / Stats | **không** | `renderStats()` chỉ gọi `renderFilm()` khi `statView==='film'` (`Stats/stats-view.js:101`) |
| Channel — match → **Film** | **có, đúng 1 hàng mới** | dưới `.film-bar`, cao ~18px, `align-self:flex-start` |
| Channel — Film **toàn màn hình** | **không** | `.film-full .film-guide{display:none}` — 0 chiều cao, 0 tab stop |
| Bàn phím của Film | **không** | không listener mới; `filmKeys` không loại `A` nên `Space` vẫn là phát/dừng |
| Bộ công cụ `film-tools.js` | **không** | file không bị sửa; link nằm **ngoài** `#fmStage` nên `contextmenu`/`pointerdown`/`pointermove`/`wheel` không bao giờ thấy nó |
| Vẽ / clip / xuất file | **không** | không đụng |
| Xuất PDF (`Stats/report.js`) | **không** | `report.js` không có một chữ `film` nào — đã grep |
| Xuất XLSX / CSV | **không** | không liên quan |
| `filmStart()` / `filmStop()` / `destroy()` | **không** | 0 dòng đổi (§4.7) |
| Đăng nhập, channel, invite | **không** | `guide.html` không nạp `supa.js` |

**Bài kiểm tra một câu:** xoá `guide: 'guide.html'` khỏi lời gọi `mount()` ở
`client/assets/app.js` và toàn bộ tính năng biến mất sạch, không để lại dấu vết nào. Đó là
định nghĩa của một thay đổi có thể lùi lại.

### 9.2 Lỗi có sẵn #1 — rời trang match không dọn Film · **ĐÃ VÁ**

`client/assets/app.js` **không bao giờ gọi `window.PTStats.destroy()`**. `route()` chỉ làm:

```js
var view = $('#view');
view.innerHTML = '';
```

Còn `filmStop()` (`Stats/stats-view.js:1591`) — thứ gỡ 4 listener trên `document`, huỷ vòng
`requestAnimationFrame`, và gỡ `src` khỏi thẻ `<video>` — chỉ được gọi từ `renderStats()` và
từ `destroy()`. `renderStats()` chỉ chạy khi đổi tab **bên trong** trang match.

**Tái hiện:** mở channel → một trận → tab Film → bấm phát → bấm `← All matches`.

**Hệ quả:**

| | |
|---|---|
| thẻ `<video>` bị gỡ khỏi DOM nhưng `src` còn nguyên | **tiếng vẫn chạy** trên một trang không còn video |
| `document.addEventListener('keydown', filmKeys)` còn treo, `film` vẫn khác `null` | bấm `Space` ở trang Data → `filmToggle()` + `preventDefault()` |
| `filmDocClick`, `fullscreenchange`, `webkitfullscreenchange` còn treo | tích luỹ thêm một bộ nữa mỗi lần mở trận |
| vòng `requestAnimationFrame` không bị huỷ | chạy mãi |

**Đây là lỗi có từ trước**, không phải do thiết kế này gây ra — và Guidelines cũng không đi
qua nó, vì `target="_blank"` nghĩa là trang Film ở tab cũ không hề bị rời.

**Bản vá đã áp** — trong `route()`, ngay trước `view.innerHTML=''`:

```js
    if (window.PTStats && window.PTStats.destroy && $('.pt-stats')) window.PTStats.destroy();
```

`filmStop()` đã luôn làm đúng việc; `destroy()` đã luôn gọi nó. Chỗ thiếu chỉ là **người gọi**,
và đây là nó.

Ba điều đã kiểm trước khi áp:

| Câu hỏi | Trả lời |
|---|---|
| `destroy()` có xoá mất tab đang xem không? | **không.** Nó reset `rows`/`meta`/`lineups`/`dur`/`videoSrc`/`filmHalf`/`filmFilter`, nhưng **không** động vào `statView` — nên đang ở Film rồi mở trận khác thì vẫn vào Film |
| Có làm mất bộ lọc của trận đang xem không? | **không có gì để mất.** `setData()` đã reset `filmHalf`/`filmFilter`/`filmResume` cho mỗi trận từ trước (`Stats/stats-view.js:2200`) |
| Rời trang trước khi report về thì sao? | an toàn. Lúc đó `.pt-stats` có nhưng chưa mount: `filmStop()` thấy `film` null và trả về, `filmFullOff()` bị chặn bởi `if(!filmFull)return`, `if(root)` bỏ qua |

Guard đặt trên `$('.pt-stats')` chứ không trên một cờ, đúng vì trường hợp thứ ba.

### 9.3 Lỗi có sẵn #2 — `Copy a link to this moment` không về đúng chỗ · **ĐÃ VÁ**

Phát hiện khi soát nội dung §7.13.

`client/assets/film-tools.js:1576` dựng link như sau:

```js
var u = location.href.split('?')[0] + '?t=' + t.toFixed(2);
```

Trong channel, URL là hash route (`app.html#/match/SLB01`, có thể kèm `?club=`). Hai đường,
cả hai đều sai:

| URL đang mở | Link sinh ra | Mở ra thì |
|---|---|---|
| `app.html#/match/SLB01` | `app.html#/match/SLB01?t=742.10` | `route()` cắt hash thành `['match','SLB01?t=742.10']`, slug không khớp trận nào → **`#/home`** |
| `app.html?club=slu#/match/SLB01` | `app.html?t=742.10` | mất luôn cả hash → **trang chủ channel** |

`?t=` **được đọc đúng** ở phía `film-tools.js` (`attach()`, dòng 1729) — vấn đề nằm ở
`route()` của `app.js`, nơi không có gì tách query ra khỏi slug.

**Bản vá đã áp — và nó hoá ra nhỏ hơn dự đoán: `route()` không phải sửa một dòng nào.**

Chỗ sai không phải ở người đọc URL mà ở người viết nó. `t` thuộc về **query string thật, đứng
trước dấu `#`**. Đặt đúng chỗ đó thì mọi người đọc đều thấy đúng thứ họ vẫn thấy: `route()`
nhận một hash sạch, `?club=` chọn kênh vẫn còn, `#match=` của tagger vẫn còn, và regex
`/[?&]t=/` trong `attach()` vẫn khớp.

`client/assets/film-tools.js` có thêm `momentLink()`, viết bằng thao tác chuỗi thuần (không
`URL`, không `URLSearchParams`) nên không có phụ thuộc nào phải stub, và chép link hai lần thì
**thay** `t` cũ chứ không chồng thêm một cái nữa:

| URL đang mở | Trước | Sau |
|---|---|---|
| `app.html#/match/SLB01` | `…#/match/SLB01?t=742.10` → `#/home` | `app.html?t=742.10#/match/SLB01` |
| `app.html?club=slu#/match/SLB01` | `app.html?t=742.10` → trang chủ kênh | `app.html?club=slu&t=742.10#/match/SLB01` |

Còn một nửa nữa của "về đúng chỗ": Film **không phải tab mặc định** (`statView='overall'`),
nên một link `?t=` mở ra sẽ nằm ở Overall. `client/assets/app.js` xử lý bằng cách **bấm cái
nút mà `mount()` vừa vẽ**, chứ không thò tay vào trong view:

```js
if (/[?&]t=\d/.test(location.search)) {
  var film = document.getElementById('viewFilmBtn');
  if (film) film.click();
}
```

Nhờ vậy `Stats/stats-view.js` **0 dòng** cho cả bản vá này: không thêm option cho `mount()`,
không thêm người đọc URL vào một file cố ý không biết gì về URL.

§7.13 của nội dung guide vì thế đã bỏ dòng "Known limitation" và nói thẳng cái nó làm được:
*"Whoever opens it lands on this match, on the Film tab, at that second."*

---

## 10. Chuỗi cache-bust và deploy

Site này không có build step. `tests/asset-versions.test.js` là thứ giữ cho chuỗi đó không
gãy, và nó **sẽ đỏ** nếu làm thiếu bất kỳ bước nào dưới đây.

### 10.1 Bump

| File | `?v=` | Phải sửa ở **mọi** nơi dưới đây |
|---|---|---|
| `Stats/stats-view.js` | `18` → **`19`** | `client/assets/app.js:1611` **và** `Stats/index.html:63` |
| `Stats/stats-view.css` | `7` → **`8`** | `client/assets/app.js:1608` **và** `Stats/index.html:12` |
| `client/assets/app.js` | `39` → **`40`** | `client/app.html` |
| `client/assets/guide.css` | **`1`** (mới) | `client/guide.html` |
| `client/assets/guide.js` | **`1`** (mới) | `client/guide.html` |

> **Hai dòng đầu là cái bẫy.** `Stats/stats-view.js` và `stats-view.css` được nạp bởi **hai**
> nơi: `client/assets/app.js` cho channel, và `Stats/index.html` cho trang Stats của tagger.
> Bump một nơi mà quên nơi kia thì test *"a file carries the SAME version everywhere it is
> loaded"* đỏ ngay — và thông điệp của nó nói đúng câu này: *"Half a bump is worse than none:
> the pages that were not bumped keep serving the old copy."* Theo chính comment ở đầu
> `tests/asset-versions.test.js`, chuyện đó **đã xảy ra hai lần** trong repo này.
>
> Bump `Stats/index.html` **không** đưa tính năng nào vào tagger: nó chỉ đổi con số trên URL.
> `filmGuideOK()` vẫn false ở đó vì trang ấy mount không có `guide:` (§9.1).

`client/guide.html` **không** nạp `guide.css`/`guide.js` từ `app.html` — nó tự nạp. Nên
`client/app.html` không có dòng nào cho hai file mới, và đó là lý do §"Phạm vi" ghi
`client/app.html` là 0 dòng.

Sau khi bump:

```bash
node tests/asset-versions.test.js --update
```

### 10.2 `deploy.yml` — 3 dòng `cp`

Nếu thiếu, file **404 trên site live trong khi build vẫn xanh** — và
`tests/asset-versions.test.js` có hẳn một test cho việc đó
(*"every versioned asset is one the deploy actually copies"*).

Thêm vào khối `# ---------- client site (the root) ----------`:

```yaml
          cp client/guide.html  _site/guide.html
          cp client/assets/guide.css _site/assets/guide.css
          cp client/assets/guide.js  _site/assets/guide.js
```

### 10.3 `tests/asset-versions.test.js` — 1 dòng

`guide.html` là một trang mang `?v=` nên nó phải nằm trong danh sách trang được quét:

```js
const PAGES=['index.html','auth.html','Stats/index.html','Player-Lists/index.html',
             'client/index.html','client/app.html','client/login.html','client/guide.html'];
```

### 10.4 Bucket R2

Không phải code, nhưng là một bước triển khai:

```
guide/01-tour.mp4 … guide/13-export.mp4
guide/posters/01-tour.jpg … guide/posters/13-export.jpg
```

Không cần đổi `worker/r2-cors.json` cho việc này (§6.1).

---

## 11. Test — `tests/film-guidelines.test.js` (24 test, tất cả xanh)

Repo này không có build step và không có jsdom; các test Film hiện có đọc **source thật** và
kiểm hình dạng của nó, cộng một DOM giả hẹp đúng bằng những selector được dùng
(`tests/film-fullscreen.test.js` mở đầu bằng đúng câu đó). File mới đi theo khuôn ấy, và ở chỗ
kiểm được thì **chạy thật**: `filmHTML()` và `momentLink()` đều được nạp vào một `vm` và gọi.

Vì tính năng này cố ý là thứ nhỏ nhất có thể chạy được, phần lớn file là **chứng minh sự
VẮNG MẶT** của thứ khác.

### 11.1 Cái link chỉ tồn tại khi host xin (7 test)

| Test | Khẳng định |
|---|---|
| *a host that did not ask gets no link at all* | `opts={}` → chuỗi không có `film-guide`, và **không có thẻ `<a>` nào** |
| *the tagging app is exactly one of those hosts* | `Stats/index.html` mount không có `guide:` |
| *the channel asks, and keeps what it was already asking for* | `app.js` có `guide:`, và `fullscreen: true` còn nguyên |
| *asked for, it is one anchor that says Guidelines* | đúng **một** `class="film-guide"`, chữ là `Guidelines` |
| *an empty or blank guide is the same as no guide* | `''`, `'   '`, `null` đều không sinh link |
| *the href is escaped…* | `guide:'g.html?a="b"&c=<d>'` không thoát ra khỏi thuộc tính |
| *it opens a tab of its own…* | luôn có `target="_blank"` **và** `rel="noopener noreferrer"` |

### 11.2 Và không gì khác dịch chuyển (4 test)

| Test | Khẳng định |
|---|---|
| *it sits under the transport bar, outside the picture* | thứ tự chỉ số: `#fmStage` < `.film-bar` < `.film-guide` < `.film-side` |
| *nothing binds it, so nothing has to release it* | `filmStart`, `filmStop` và cả `film-tools.js` **không chứa** chuỗi `film-guide` |
| *filmStop still lets go of everything it always let go of* | canary: vẫn gỡ đủ `keydown`, `click`, `fullscreenchange`, `webkitfullscreenchange`, vẫn huỷ vòng rAF, vẫn `filmTools.detach()` |
| *the line is a row of the column…* | CSS không có `position:absolute/fixed` hay `float`, và có `align-self:flex-start` |

### 11.3 Toàn màn hình (1 test)

*full screen never shows it, and never lands on it with Tab* — luật `.film-full .film-guide{display:none}`
tồn tại **và** nằm sau chỗ mở khối `Film, full screen`, tức là một override chứ không phải
một sửa đổi.

### 11.4 Trang guide (5 test)

16 section đúng id · mục lục và trang khớp nhau **hai chiều** · `preload='none'`, có
`controls`, có `poster`, **không** `autoplay`, **không** `loop` · mọi `data-clip` có trong
manifest **và** ngược lại · trang **không** nạp `supa.js`/`app.js`/`supabase`.

### 11.5 Ba việc của bản sửa 1 (7 test)

| Test | Khẳng định |
|---|---|
| *the analyst menu is in the language the rest of the channel is in* | 0 ký tự tiếng Việt trong `film-tools.js`, và các nhãn tiếng Anh có mặt |
| *leaving a match tears the player down…* | `route()` gọi `PTStats.destroy()`, **trước** `view.innerHTML=''`, có guard `.pt-stats` |
| *t goes in the query string, ahead of the hash* | hai hình dạng URL của kênh, so từng ký tự |
| *the menu item asks for the link instead of assembling one* | mục menu gọi `momentLink(t)` và không còn `split('?')` |
| *copying twice does not stack a second t* | `t` cũ bị thay, và chỉ `t` bị thay |
| *a page with no hash and no query…* | `app.html` trần vẫn ra link dùng được |
| *the moment a ?t= link names is opened on Film…* | `renderMatchStats` đọc `?t=`, bấm `viewFilmBtn`, **sau** `mount()` |

`tests/film-tools.test.js` cũng được sửa: **chỉ chuỗi mà mỗi assertion đi tìm** đổi theo bản
dịch. Không assertion nào đổi thứ nó khẳng định, không test nào bị bỏ.

### 11.6 Chạy toàn bộ

```bash
node tests/run.js
```

**1260/1260 passed** — 1236 test cũ pass nguyên vẹn, cộng 24 test mới.

---

## 12. Checklist triển khai — đã xong

- [x] **1.** `Stats/stats-view.js` — `filmGuideOK()` cạnh `filmFullOK()`, và khối `<a>` chèn vào `filmHTML()` (**+18 / −0**, 0 dòng sửa)
- [x] **2.** `Stats/stats-view.css` — khối `.film-guide` + override `.film-full` (**+25 / −0**)
- [x] **3.** `client/assets/app.js` — `guide: 'guide.html'` vào `mount()`; `?t=` mở tab Film; `PTStats.destroy()` trong `route()`
- [x] **4.** `client/assets/film-tools.js` — dịch 94 nhóm chuỗi sang tiếng Anh, thêm `momentLink()`
- [x] **5.** `client/assets/guide.css` — mới
- [x] **6.** `client/assets/guide.js` — mới (manifest, poster probe, scrollspy, mục lục cho điện thoại)
- [x] **7.** `client/guide.html` — mới, 16 section theo §7
- [x] **8.** `tests/film-guidelines.test.js` — mới, 24 test
- [x] **9.** `tests/film-tools.test.js` — 12 chuỗi assertion đi theo bản dịch
- [x] **10.** Bump `?v=`: `stats-view.js` 18→19 và `stats-view.css` 7→8 **ở cả `client/assets/app.js` lẫn `Stats/index.html`**; `film-tools.js` 3→4; `app.js` 39→40 ở `client/app.html`
- [x] **11.** `tests/asset-versions.test.js` — thêm `client/guide.html` vào `PAGES`
- [x] **12.** `node tests/asset-versions.test.js --update`
- [x] **13.** `.github/workflows/deploy.yml` — 3 dòng `cp`
- [x] **14.** `node tests/run.js` → **1260/1260**
- [x] **15.** Kiểm bằng trình duyệt — §13
- [ ] **16.** Quay 13 clip theo §6.3–6.4 và upload lên `guide/` trên R2 *(việc của con người; trang không chờ nó — §15.1)*

---

## 13. Kiểm tra trên trình duyệt — đã chạy

Chạy trên `python -m http.server 8765`, đọc bằng công cụ chữ chứ không bằng ảnh chụp (máy này
hay treo khi chụp màn hình — xem `browser-verify-via-upload` trong memory).

**Trang guide** — `client/guide.html`

| Đo | Kết quả |
|---|---|
| section / mục lục / khối demo | **16 / 16 / 13** |
| lỗi console | **không có** |
| cuộn ngang của trang | **không** |
| mục lục dính | `position: sticky`, đứng ở 76px |
| scrollspy | nạp → `#s-quick`; tới `s-play`/`s-tools`/`s-clips`/`s-keys` → **đúng mục đó** sáng; đáy → `#s-limits`; về đầu → `#s-quick`; **luôn đúng một mục** |
| clip chưa có trên bucket | **13/13 hiện khối chữ** "Demo video not available yet", không có ô đen nào |
| 375×812 | thanh bên ẩn, mục lục `<details>` hiện với đủ 16 link, **không cuộn ngang**, 9 bảng cuộn trong hộp của chính nó |

**Dòng Guidelines** — dựng đúng markup `filmHTML()` sinh ra, dưới `stats-view.css` thật

| Đo | Kết quả |
|---|---|
| hiển thị | `flex`, cao 24px, cách thanh transport **8px** |
| bề rộng vùng bấm | **98px trên một cột 302px** — đúng bằng bề rộng của chữ, không phải cả cột |
| màu / gạch chân | `rgb(156,143,146)` (`--mut`), `text-decoration: none` |
| dấu `?` | `border-radius: 50%` |
| chữ đọc được | `? Guidelines ↗` |
| thêm `.film-full` | **`display: none`, cao 0** |
| bỏ `.film-full` | trở lại `flex` |

---

## 14. Rủi ro đã biết

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Trình chặn popup chặn `target="_blank"` | thấp | click của người dùng là user gesture; không trình chặn nào chặn. Không dùng `window.open()` chính vì lý do này |
| Guide lệch với code khi Film đổi | **trung bình** | mỗi mục §7 ghi rõ nguồn ở §3; test 24 giữ manifest video khớp HTML. Không có test nào giữ *chữ* khớp *code* — đây là rủi ro thật, và cách giảm là §3 làm bảng kiểm kê có địa chỉ dòng |
| Menu tiếng Việt làm client bối rối | **trung bình** | §8 cách C giảm được, không xoá được. Xoá hẳn cần một câu cho phép để dịch `film-tools.js` |
| Video chưa quay xong khi merge | thấp | §6.5 — trang đầy đủ bằng chữ |
| 13 clip làm trang nặng | thấp | `preload="none"`: 0 byte video cho tới khi bấm phát. Trang chỉ tải 13 poster |
| Bump `?v=` sót một chỗ | thấp | `tests/asset-versions.test.js` bắt được, có sẵn |
| Ai đó bấm Guidelines rồi rời trang match ở tab cũ | thấp | rơi vào lỗi §9.2 — **đã có từ trước**, không phải do thiết kế này gây ra, và không nằm trên đường đi của nó |

---

## 15. Không làm lần này — và cái gì cần một câu cho phép

Ba việc đứng đầu bảng này ở bản đầu đã **được cho phép và đã làm** trong bản sửa 1:
dịch `film-tools.js` (§8), vá `destroy()` (§9.2), vá `Copy a link to this moment` (§9.3).

Còn lại, và vẫn chưa làm:

| Việc | Vì sao chưa làm |
|---|---|
| Bản tiếng Việt `guide.vi.html` | Q1 chốt English; khung đã để ngỏ (§5.2) |
| Link Guidelines từ landing page | ngoài phạm vi được giao |
| Onboarding overlay lần đầu vào Film | tính năng khác, chi phí riêng, và sẽ va vào `filmStop()` |
| Tìm kiếm trong trang guide | 16 mục thì `Ctrl`+`F` là đủ |
| Phụ đề / transcript cho 13 clip | clip không tiếng, và mỗi clip đã có bản chữ tương đương |

Năm dòng này là **tính năng mới**, không phải lỗi cần vá — nên chúng ở lại đây cho tới khi có
một câu nói rõ là muốn.

### 15.1 Việc còn lại của con người

Quay 13 clip theo §6.3–6.4 và upload lên `guide/` trên bucket R2. Cho tới lúc đó mỗi khối demo
hiện một dòng chữ nói thẳng là clip chưa có, và **phần chữ hướng dẫn đã đầy đủ mà không cần
clip nào** — đó là lý do trang ship được trước máy quay.



