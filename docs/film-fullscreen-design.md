# Film Full Screen — Detailed Design

**Film hôm nay được thiết kế để một nhà phân tích ngồi trước màn hình 14 inch đọc. Cái nó
chưa làm được là thứ CLB thực sự cần: chiếu lên máy chiếu trong phòng họp, cả đội cùng xem,
số áo phải đọc được từ hàng ghế cuối. Tài liệu này mô tả nút `⛶` trong thanh điều khiển và
chế độ toàn màn hình đằng sau nó — **cùng sáu thành phần đó, không thêm không bớt**: khung
hình, dải chú thích dưới khung, mặt sân, ba slicer, thanh tua, và bảng sự kiện.**

Trạng thái: **đã triển khai** (2026-08-17). Q1→**B** · Q2→A · Q3→A.

Phạm vi đã làm: `Stats/stats-view.js` (**+133 / −1**, dòng −1 là comment đầu file được nối
dài; 6 dòng chạm vào hàm sẵn có), `Stats/stats-view.css` (**+106 / −0** — chỉ thêm cuối file,
`git diff --numstat` xác nhận 0 dòng cũ bị xoá), `tests/film-fullscreen.test.js` (mới, 39 test),
`tests/asset-versions.json` (regenerate), `Stats/index.html` + `client/app.html` (**chỉ chữ số
`?v=`**), `client/assets/app.js` (`?v=` + một `{fullscreen:true}`).

> **Ghi chú về Q1-B.** Bản thiết kế đề nghị `opts.fullscreen!==false`. Cái đó **sai với câu
> trả lời B**: hôm nay không host nào truyền `fullscreen`, nên `!==false` sẽ bật cho cả hai.
> Đã cài ngược lại — `const filmFullOK=()=>!!opts.fullscreen`, mặc định **tắt**, và client
> channel là nơi duy nhất nói `{fullscreen:true}`. Stats page mount y như cũ và không có
> nút, không có phím, không có đường vào.

**0 dòng** ở: `shared.js`, `shared.css`, `shared-page.css`, `cloud-sync.js`, `index.html`
(tagger), `Stats/report.js`, `Player-Lists/*`, `client/index.html`, `client/login.html`,
`client/assets/app.css`, `client/assets/site.css`, `client/assets/supa.js`, `worker/*`,
`supabase/*`, `.github/workflows/deploy.yml`.

Test: `node tests/run.js` → **1046/1046 passed**. Trong đó **1007 test cũ pass mà không sửa
một dòng nào**, cộng 39 test mới.

**Đo thật trên trình duyệt ở 1920×1080** (§17), so với chính nó khi không toàn màn hình:

| | Bình thường | Toàn màn hình | |
|---|---|---|---|
| Khung hình | 1312×738 | **1430×951** | ×1.40 diện tích |
| Mặt sân | 340×220 | **442×286** | ×1.69 diện tích |
| Số dòng events thấy được | 11 | **18** | ×1.64 |
| Cỡ chữ caption / số áo | 13px / ô 20px | **20.5px / ô 32px** | ×1.58 |
| Cuộn trang | — | **không** | chỉ `.film-list` cuộn |

Cộng thêm phần chrome của trình duyệt và header+rail của site biến mất, vốn không nằm trong
bảng này vì harness đo không có chúng.

---

## 1. Vấn đề

Film được dựng cho một người. Các con số trong `stats-view.css` nói rõ điều đó:

| Thứ | Kích thước hiện tại | Đọc từ 5m |
|---|---|---|
| Số áo trong caption (`.fm-no`) | `12px` trong ô `20×20` | không |
| Tên sự kiện (`.fm-ev`) | `12.5px` | không |
| Một dòng trong bảng events (`.fm-row`) | `12px`, padding `5px 9px` | không |
| Cột phải (`.film-grid`) | **`340px` cứng** | — |
| Bảng events (`.film-list`) | **`max-height:340px`** | — |
| Khung hình (`.film-stage`) | `aspect-ratio:16/9`, rộng theo cột trái | — |

Trong phòng họp, ba thứ hỏng cùng lúc:

1. **Khung hình nhỏ.** Trên `client/app.html`, `.view` có `padding:clamp(18px,2.6vw,28px)`
   và bên trái còn rail `196px`. Trên màn 1920, khung hình thực tế rộng khoảng **1050px** —
   một nửa máy chiếu. Phần còn lại là header, rail, và khoảng trắng.
2. **Phải cuộn.** `.stats-wrap` cuộn, `.film-list` cuộn bên trong nó. Người điều khiển vừa
   phải tua video vừa phải cuộn trang để thấy bảng events — và khán giả thì thấy trang nhảy.
3. **Chrome trình duyệt chiếm chỗ.** Thanh địa chỉ, tab, header của site, rail bên trái:
   không cái nào là dữ liệu trận đấu, và tất cả đều đang được chiếu lên tường.

`F11` của trình duyệt giải quyết đúng **một** trong ba (số 3). Nó không làm khung hình to lên
tương ứng, không bỏ header của site, không sắp lại layout — `.film-grid` vẫn `340px`, `.film-list`
vẫn `340px` cao, và `.film-stage` vẫn ăn theo chiều rộng cột. Nên đây không phải "gọi
`requestFullscreen` là xong": **cái cần thiết kế là layout, và API chỉ là thứ lấy chrome đi.**

## 2. Ranh giới

**Làm:**
- một nút toggle trong `.film-bar`, phím tắt `F`, `Escape` để thoát
- chế độ toàn màn hình giữ đủ **sáu** thành phần (§8), không cái nào bị cắt hay ẩn
- fit trọn viewport: **trang không cuộn**, chỉ `.film-list` cuộn bên trong nó
- thang chữ lớn hơn, tỉ lệ theo chiều cao màn hình
- sống sót qua re-render (đổi hiệp, cloud update) — §4
- đường lùi khi trình duyệt từ chối Fullscreen API — §5.3

**Không làm (§14):** picture-in-picture, tua bằng con lăn, phóng to vùng khung hình, khoá
xoay màn hình, wake lock, nút full screen riêng cho mặt sân, đổi bất kỳ hành vi nào của Film
ngoài chế độ này.

---

## 3. Film hôm nay — cái gì đang giữ cái gì

Đây là phần phải hiểu đúng trước khi chọn phần tử nào vào fullscreen. Toàn bộ nằm trong
`Stats/stats-view.js:1177-1848`.

### 3.1 Cây DOM

```
#statsHolder                      ← renderFilm(holder) GHI VÀO, không thay thế
└── .film                         ← filmHTML() dựng lại TỪ ĐẦU mỗi lần render
    ├── .half-toggle.film-halves  ← [1st Half] [2nd Half]   (chỉ khi có 2 cửa sổ)
    └── .film-grid                  grid: minmax(0,1fr) / 340px
        ├── .film-main
        │   ├── #fmStage .film-stage      aspect-ratio:16/9
        │   │   ├── #fmVideo <video>      object-fit:contain
        │   │   └── #fmCap .film-cap      ❷ dải chú thích, absolute bottom
        │   └── .film-bar
        │       ├── #fmPlay  ▶/❚❚
        │       ├── #fmTrack (#fmRail/#fmFill/#fmKnob)
        │       └── #fmTc    "12:34 / 45:00"
        │       └── ★ #fmFull  ← NÚT MỚI, chỗ duy nhất được thêm vào markup
        └── .film-side
            ├── #fmPitch .film-pitch      ❸ pitchSVG(), có <g id="pv-dots">
            ├── .film-filters             ❹ 3 × .fm-slicer + #fmNext
            └── #fmList .film-list        ❺ max-height:340px, cuộn trong
```

### 3.2 Vòng đời — và chỗ nó sẽ cắn chế độ fullscreen

```
renderStats()
  ├── filmStop()                   ← LUÔN LUÔN, trước mọi thứ khác
  │     ├── ghi filmResume = {half, currentTime}
  │     ├── cancelAnimationFrame
  │     ├── removeEventListener('keydown', filmKeys)
  │     ├── removeEventListener('click',   filmDocClick)
  │     └── video.pause() + removeAttribute('src') + load()
  └── renderFilm(holder)
        ├── holder.innerHTML = filmHTML(...)      ← .film BỊ THAY THẾ HOÀN TOÀN
        └── filmStart(win, cues, src)             ← bind lại tất cả, seek về filmResume
```

`renderStats()` được gọi từ **sáu** nơi, và bốn trong số đó có thể xảy ra khi Film đang trên
màn hình:

| Nguồn | Ở host nào | Xảy ra khi đang họp? |
|---|---|---|
| bấm `[2nd Half]` (`stats-view.js:1511`) | cả hai | **có, thường xuyên** |
| `postgres_changes` trên `events` (`:1965`) | Stats page (cloud mode) | **có, mỗi sự kiện được tag** |
| `postgres_changes` trên `matches` (`:1974`) | Stats page (cloud mode) | có |
| `storage` event từ tab tagging (`:1885`) | Stats page (local mode) | có |
| bấm Overall/Dashboard/Stats (`:1874`) | cả hai | không (nút nằm ngoài fullscreen) |
| `mount()` / `update()` (`:2050`, `:2061`) | client site khi mở match khác | không |

Trên **client channel** — mục tiêu của yêu cầu này — dữ liệu là một report đã đóng băng,
`cloudMode` không bao giờ bật, không có `storage` listener. Nên nguồn re-render duy nhất là
nút đổi hiệp. Trên **Stats page** thì cả bốn đều sống.

### 3.3 Ba thứ sống NGOÀI `#statsHolder`

Đây là lý do `filmStop()` tồn tại, và là ba thứ chế độ fullscreen không được làm rò rỉ thêm:

```js
document.addEventListener('keydown', filmKeys);      // ←/→/Space
document.addEventListener('click',   filmDocClick);  // bấm ngoài slicer thì đóng slicer
film.raf = requestAnimationFrame(filmLoop);          // vòng vẽ
```

Cả ba đều được gỡ bằng **đúng tên hàm** trong `filmStop()`. Bất cứ listener nào chế độ
fullscreen thêm vào phải theo đúng khuôn đó (§6.4).

---

## 4. Quyết định nền: phần tử nào vào fullscreen

Đây là quyết định quan trọng nhất của cả tài liệu. Chọn sai thì mọi thứ khác vẫn đúng mà tính
năng vẫn hỏng trong phòng họp.

### 4.1 Luật của trình duyệt

> Khi phần tử đang fullscreen **bị gỡ khỏi document**, trình duyệt tự động thoát fullscreen.

Không có sự kiện nào để hỏi lại, không có cách nào từ chối. Đây là hành vi bắt buộc của
Fullscreen API.

### 4.2 Vì sao KHÔNG phải `.film`

`.film` là thứ trực quan nhất để đưa vào fullscreen — nó chính là view. Và nó là lựa chọn
**sai**, vì `renderFilm()` làm đúng cái việc trình duyệt coi là "kết thúc fullscreen":

```js
holder.innerHTML = filmHTML(wins, win, cues, filmChoices(cues));   // .film cũ bị gỡ
```

Hệ quả cụ thể, trên Stats page ở cloud mode: **mỗi sự kiện nhà phân tích tag trong tab kia
đều đá cả phòng họp ra khỏi fullscreen.** Trên client channel thì nhẹ hơn nhưng vẫn hỏng: bấm
`[2nd Half]` là màn hình sập về trang.

Có thể chữa bằng cách gọi lại `requestFullscreen()` sau mỗi render — nhưng không: API đó đòi
**user activation**, và một lời gọi phát sinh từ WebSocket callback không có nó. Trình duyệt
sẽ từ chối, im lặng.

### 4.3 Vì sao KHÔNG phải `<video>`

`fmVideo.requestFullscreen()` là cách mọi trình phát video làm, và ở đây nó **vứt đi năm phần
sáu của tính năng**: caption, mặt sân, ba slicer, bảng events và thanh tua đều nằm ngoài phần
tử `<video>`, nên toàn màn hình sẽ chỉ còn khung hình trần. Đúng cái ngược lại với yêu cầu.

(Trên iOS, `<video>` còn có fullscreen riêng của hệ điều hành — `webkitEnterFullscreen` — vốn
luôn chỉ hiện khung hình. §13.3.)

### 4.4 `#statsHolder` — nút duy nhất sống sót

`#statsHolder` là phần tử duy nhất trong chuỗi mà `renderFilm()` **ghi vào** chứ không thay
thế. Nó được viết ra một lần, bởi host:

- `Stats/index.html:59` — `<div class="stats-wrap"><div id="statsHolder"></div></div>`
- `stats-view.js:2013` (`CHROME`) — cùng một dòng, cho client site

và bị gỡ **đúng một lần, đúng lúc**: `destroy()` gọi `root.innerHTML=''`. Nghĩa là hành vi tự
thoát của trình duyệt (§4.1) trở thành **đường lùi đúng đắn** thay vì một cái bẫy — khi client
site rời khỏi trang match, màn hình được trả lại, kể cả nếu code của ta quên.

Thêm một lợi ích không hiển nhiên: **class `.film-full` cũng sống trên nút đó**, nên nó cũng
sống sót qua re-render. Không cần lưu và khôi phục trạng thái layout ở đâu cả.

### 4.5 Bảng so sánh

| Ứng viên | Sống qua re-render | Đủ 6 thành phần | Tự thoát đúng lúc |
|---|---|---|---|
| `#fmVideo` | có | **không — chỉ khung hình** | có |
| `.film` | **không** | có | quá sớm |
| `.film-grid` | **không** (con của `.film`) | thiếu `.film-halves` | quá sớm |
| `.stats-wrap` | có | có | có, nhưng `renderStats` set `display:none` lên chính nó khi không có match → **màn hình đen** |
| **`#statsHolder`** | **có** | **có** | **có** |

> `.stats-wrap` trượt vì `stats-view.js:74`: `document.querySelector('.stats-wrap').style.display = open?'':'none'`. Một phần tử fullscreen bị `display:none` không hề thoát fullscreen — nó biến mất khỏi box tree và để lại màn hình đen. `#statsHolder` là con của nó nên vẫn dính, và §10.1 là dòng chữa việc đó.

---

## 5. Nguồn sự thật: `fullscreenchange`, không phải biến của ta

### 5.1 Vì sao không tự giữ trạng thái

Fullscreen kết thúc theo **năm** đường, và chỉ một trong số đó đi qua code của ta:

1. bấm lại nút `⛶` — của ta
2. `Escape` — của trình duyệt, và ở nhiều trình duyệt keydown còn **không được gửi tới trang**
3. `F11` / nút fullscreen của window manager
4. chuyển sang app khác trên một số OS
5. phần tử bị gỡ khỏi document (§4.1)

Một biến `filmFull` do ta tự bật/tắt sẽ tin sai ở 2–5: nút vẫn hiện icon "thoát", class
`.film-full` vẫn dính, và view trở thành một khối `position:fixed` phủ kín trang **ngoài**
fullscreen. Đây là bug kinh điển của tính năng này.

Nên: `document.fullscreenElement` là sự thật, `fullscreenchange` là cách nghe, và code của ta
chỉ **đối chiếu** theo nó.

### 5.2 Máy trạng thái

```
                    filmFullOn()                       fullscreenchange
   [ trang ] ────────────────────────► [ maximised ] ──────────────────► filmFullNative=true
       ▲                                     │
       │  filmFullSet(false)                 │  filmFullOff() | Esc | F11 | node bị gỡ
       └─────────────────────────────────────┘
```

Hai biến, và chúng trả lời hai câu khác nhau:

| Biến | Câu hỏi | Ai viết |
|---|---|---|
| `filmFull` | layout có đang ở chế độ to không? | `filmFullSet()` |
| `filmFullNative` | trình duyệt có đang giữ màn hình không? | **chỉ** `filmFullChange()` |

### 5.3 Đường lùi khi API vắng mặt hoặc bị từ chối

`requestFullscreen()` trả về Promise và Promise đó **có thể reject**: Permissions-Policy chặn,
trang đang nằm trong iframe không có `allow="fullscreen"`, hoặc trình duyệt không có API.

Thiết kế tách đôi trách nhiệm:

> **Class làm layout. API chỉ lấy chrome trình duyệt đi.**

Nên `filmFullOn()` bật class **trước**, rồi mới thử API. Nếu API hỏng, người dùng vẫn được
view to phủ kín **cửa sổ** thay vì phủ kín **màn hình** — mất thanh địa chỉ, giữ nguyên tất cả
phần còn lại. Không có nhánh nào dẫn tới "bấm nút không có gì xảy ra".

Đó cũng là lý do CSS dùng **class chứ không dùng `:fullscreen`**:

- `:fullscreen` không hoạt động ở đường lùi;
- Safari < 16.4 cần `:-webkit-full-screen`, và trong CSS **một selector không hiểu được trong
  danh sách phân tách bởi dấu phẩy sẽ vô hiệu hoá cả rule** — nên `:fullscreen .film, :-webkit-full-screen .film{…}`
  là một quả mìn: trình duyệt nào không hiểu vế sau sẽ bỏ luôn vế trước. Muốn an toàn phải
  nhân đôi cả khối CSS. Repo này không có build step, không có autoprefixer;
- class thì test được từ stub DOM (§12), pseudo-class thì không.

### 5.4 Code

Đặt ngay sau `filmStop()` (`stats-view.js:1551`), trước khối `/* ---- the slicers ---- */`:

```js
/* ---- full screen ----

   Một CLB xem cái này bằng máy chiếu, trong một phòng, với cả đội. Thứ họ cần
   ở đó không phải một view khác: vẫn đúng sáu thứ ấy — khung hình, dải chữ
   dưới nó, mặt sân, ba slicer và bảng events — với chrome của trình duyệt bỏ
   đi và mọi thứ đủ to để đọc từ hàng cuối.

   Phần tử vào fullscreen là #statsHolder, KHÔNG phải .film. renderStats() dựng
   lại .film từ đầu mỗi lần đổi hiệp, và trên Stats page thì thêm một lần nữa
   cho mỗi sự kiện về qua cloud; mà phần tử fullscreen BỊ GỠ khỏi document
   chính là cách trình duyệt được báo rằng fullscreen đã xong. Nửa tá sự kiện
   vào một cuộc họp là màn hình rơi ra. #statsHolder là nút duy nhất trong
   chuỗi mà renderFilm() GHI VÀO chứ không thay thế, nên nó sống qua mọi lần
   vẽ lại — và nó bị gỡ đúng lúc Film thật sự kết thúc (destroy() dọn root),
   là đúng lúc màn hình nên được trả lại. */
let filmFull=false;        // layout đang to (bằng API, hoặc bằng đường lùi)
let filmFullNative=false;  // và trình duyệt có đang thật sự giữ màn hình không

const filmFullBox=()=>$('statsHolder');

/* Bốn góc chỉ ra ngoài để vào, bốn góc chỉ vào trong để ra. Là <path> chứ không
   phải ký tự: ⛶ (U+26F6) không có trong nhiều font hệ thống và rơi ra ô vuông
   trắng — mà đây là nút DUY NHẤT trong view không có chữ đi kèm. */
const FM_FULL_D={
  in:'M2.5 6.5v-4h4M13.5 2.5h4v4M17.5 13.5v4h-4M6.5 17.5h-4v-4',
  out:'M6.5 2.5v4h-4M17.5 6.5h-4v-4M13.5 17.5v-4h4M2.5 13.5h4v4'
};
const filmFullIcon=on=>'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"'
  +' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  +'<path d="'+(on?FM_FULL_D.out:FM_FULL_D.in)+'"/></svg>';

/* Layout trước, API sau. Nếu API vắng mặt hoặc bị từ chối thì cái đã bật ở dòng
   đầu CHÍNH LÀ đường lùi: view phủ kín cửa sổ thay vì phủ kín màn hình, và
   không nhánh nào kết thúc bằng "bấm nút, không có gì xảy ra". */
function filmFullOn(){
  const box=filmFullBox(); if(!box||filmFull)return;
  filmFullSet(true);
  const req=box.requestFullscreen||box.webkitRequestFullscreen;
  if(!req)return;
  try{
    const p=req.call(box);
    if(p&&p.catch)p.catch(()=>{});     // bị từ chối — ở lại đường lùi, không nói gì
  }catch(e){}
}

function filmFullOff(){
  if(!filmFull)return;
  filmFullSet(false);
  const box=filmFullBox();
  const on=document.fullscreenElement||document.webkitFullscreenElement;
  if(on&&on===box){
    if(document.exitFullscreen){const p=document.exitFullscreen(); if(p&&p.catch)p.catch(()=>{});}
    else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
  }
}

const filmFullToggle=()=>filmFull?filmFullOff():filmFullOn();

/* Class, nút, và bất cứ thứ gì được đo theo cái hộp. Tách ra vì có ba đường
   khác nhau dẫn tới đây: hai lời gọi của ta ở trên, và fullscreenchange của
   trình duyệt — Escape, F11, window manager, hay phần tử bị gỡ khỏi document. */
function filmFullSet(on){
  const box=filmFullBox(); if(!box)return;
  filmFull=!!on;
  box.classList.toggle('film-full',filmFull);
  const b=$('fmFull');
  if(b){
    const lbl=filmFull?'Exit full screen (Esc)':'Full screen (F)';
    b.setAttribute('aria-pressed',filmFull?'true':'false');
    b.setAttribute('aria-label',lbl);
    b.title=lbl;
    b.innerHTML=filmFullIcon(filmFull);
  }
  // một panel được cắt theo chỗ trống dưới nút NGAY LÚC nó mở, và chỗ trống đó
  // vừa đổi — đóng lại rẻ hơn và trung thực hơn là đo lại một panel đang mở
  filmSlicerOpen(null,false);
}

/* Câu trả lời của trình duyệt, không phải của ta. Escape, F11 và việc phần tử
   rời khỏi document đều kết thúc fullscreen mà không hỏi ai, và một trạng thái
   ta tự giữ sẽ tiếp tục tin ngược lại — để lại một khối position:fixed phủ kín
   trang NGOÀI fullscreen, đúng cái bug kinh điển của tính năng này. */
function filmFullChange(){
  const on=(document.fullscreenElement||document.webkitFullscreenElement)===filmFullBox();
  if(filmFullNative&&!on)filmFullSet(false);
  filmFullNative=on;
}
```

---

## 6. Nút

### 6.1 Vị trí: cuối `.film-bar`

```
┌─ .film-bar ────────────────────────────────────────────────────┐
│  ▶   ──────●────────────────────   12:34 / 45:00   [ ⛶ ]      │
└────────────────────────────────────────────────────────────────┘
     #fmPlay      #fmTrack              #fmTc        #fmFull ★
```

Đây là chỗ mọi trình phát video trên đời để nút này, nên không ai phải học. Và về mặt kỹ
thuật `.film-bar` là hàng duy nhất trong Film **an toàn để thêm phần tử**:

- `.film-bar{display:flex}` với `.fm-track{flex:1}` — mọi thứ khác `flex:none`. Thêm một nút
  `flex:none` ở cuối chỉ lấy đi chiều rộng của thanh tua, không đổi thứ tự, không đổi wrap.

Vì sao **không** đặt vào `.film-filters` (cạnh `#fmNext`): hàng đó có ba con số đã được đo tay
và ghi lại trong comment — `.fm-slicer{flex:1 1 92px}`, `FILM_SL_MAX=230`, và luật lật panel
`.film-filters .fm-slicer:last-of-type .fm-sl-panel{left:auto;right:0}`. Thêm một nút nữa vào
đó là đụng vào bài toán đã giải xong. (`:last-of-type` xét theo *tên thẻ*, nên một `<button>`
mới sẽ không phá luật lật panel — nhưng nó **sẽ** đổi `flex-basis` còn lại của ba slicer và
điểm mà hàng wrap xuống dòng ở màn hẹp. Không đáng.)

Vì sao **không** đặt overlay lên góc khung hình: `.film-stage` cố tình không nhận click
(comment ở `stats-view.css:254`: *"no cursor:pointer — the surface takes no click"*). Một nút
nổi trên khung hình mở lại đúng cánh cửa đó.

### 6.2 Markup

Một dòng thêm vào `filmHTML()`, ngay sau `#fmTc` (`stats-view.js:1434`):

```js
+'<span class="fm-tc" id="fmTc">00:00 / 00:00</span>'
+`<button type="button" class="fm-full" id="fmFull" aria-pressed="false"`
  +` aria-label="Full screen (F)" title="Full screen (F)">${filmFullIcon(false)}</button>`
```

`filmHTML()` luôn vẽ icon "vào". Nếu một lần re-render xảy ra **trong khi** đang fullscreen,
nút mới sẽ nói sai — nên `filmStart()` kết thúc bằng một lời gọi đồng bộ lại (§6.4).

### 6.3 Bàn phím

| Phím | Hôm nay | Sau thay đổi |
|---|---|---|
| `Space` | play/pause | **không đổi** |
| `←` `→` | ±2s | **không đổi** |
| `Escape` (focus trong slicer) | đóng slicer | **không đổi** |
| `F` / `f` | — | toggle fullscreen |
| `Escape` (ngoài slicer, đang ở đường lùi) | — | thoát |
| `Escape` (ngoài slicer, đang native) | — | **để nguyên cho trình duyệt** |

Dòng cuối là điều quan trọng: ở native fullscreen, `Escape` là hành vi của UA và **không huỷ
được bằng `preventDefault()`** — ở một số trình duyệt keydown còn không tới trang. Cố giành nó
chỉ tạo ra hai đường thoát chạy đua nhau. Ở đường lùi thì ngược lại: không có hành vi nào của
trình duyệt để dựa vào, nên `Escape` phải là của ta.

Sửa trong `filmKeys()` (`stats-view.js:1646`), **sau** nhánh slicer đã có, giữ nguyên nhánh đó:

```js
  if(t&&t.closest&&t.closest('.fm-slicer')){                    // ← không đổi
    if(e.key==='Escape'){filmSlicerOpen(null,false);e.preventDefault();}
    return;
  }
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||(t&&t.isContentEditable))return;
  /* Escape ở native fullscreen là của trình duyệt và không huỷ được — đường lùi
     thì không có ai làm hộ, nên nó là của ta. Chỉ một trong hai, không bao giờ cả hai. */
  if(e.key==='Escape'){
    if(filmFull&&!filmFullNative){filmFullOff();e.preventDefault();}
    return;
  }
  if(e.key==='ArrowRight')filmSeekBy(FILM_STEP);
  else if(e.key==='ArrowLeft')filmSeekBy(-FILM_STEP);
  else if(e.key===' '||e.key==='Spacebar')filmToggle();
  else if(e.key==='f'||e.key==='F')filmFullToggle();             // ← thêm
  else return;
  e.preventDefault();
```

`f` phát sinh từ keydown, mà keydown **là** user activation hợp lệ cho `requestFullscreen()`.
Nhánh slicer nằm trước nên gõ `f` khi con trỏ đang trong panel checkbox không toggle gì cả —
đúng như `Space` hôm nay.

### 6.4 Bind và gỡ

Trong `filmStart()`, cạnh các dòng bind sẵn có (`stats-view.js:1516-1537`):

```js
  $('fmFull').onclick=()=>{filmFullToggle();$('fmFull').blur();};
  document.addEventListener('fullscreenchange',filmFullChange);
  document.addEventListener('webkitfullscreenchange',filmFullChange);
  ...
  document.addEventListener('keydown',filmKeys);      // ← đã có
  // một lần vẽ lại DƯỚI fullscreen nhận một cái nút mới tinh đang nói sai
  filmFullSet(filmFull);
```

Trong `filmStop()`, cạnh hai dòng gỡ sẵn có (`stats-view.js:1547-1548`):

```js
  document.removeEventListener('fullscreenchange',filmFullChange);
  document.removeEventListener('webkitfullscreenchange',filmFullChange);
```

`.blur()` theo đúng khuôn `#fmPlay` và `#fmNext` đang dùng: trả focus lại để `Space` tiếp theo
là play/pause chứ không phải bấm lại cái nút vừa bấm.

**Add và remove bằng cùng một tên hàm** — đây là khuôn bắt buộc của file này, và có test cho
nó. `filmFullSet(filmFull)` ở cuối `filmStart()` là **vô điều kiện**: khi `filmFull===false`
nó tắt một class đã tắt, viết lại một nút đã đúng, và đóng những slicer vừa được dựng ra đang
đóng sẵn. Không nhánh nào, nên không có nhánh nào để sai.

---

## 7. Layout toàn màn hình

### 7.1 Nguyên tắc

> **Viewport là ngân sách. Không có gì cuộn, trừ `.film-list`.**

Trong phòng họp, thứ bị cuộn ra khỏi màn hình là thứ không tồn tại — và người điều khiển
không nên phải cuộn khi đang nói.

### 7.2 Grid

```
┌── #statsHolder.film-full ─ position:fixed inset:0 ─ overflow:hidden ────────────┐
│  padding:14px 16px                                                              │
│  ┌─ .film-halves ─────────────────────────────────────────────┐                 │
│  │            [ 1st Half ]  [ 2nd Half ]                      │  flex:none      │
│  └────────────────────────────────────────────────────────────┘                 │
│  ┌─ .film-grid ─ flex:1 min-height:0 align-items:stretch ───────────────────────┐│
│  │ ┌─ .film-main ────────────────────────┐ ┌─ .film-side ──────────────────────┐││
│  │ │ ┌ .film-stage  flex:1 min-height:0 ┐│ │ ┌ .film-pitch  flex:none ────────┐│││
│  │ │ │        ❶ <video> contain         ││ │ │        ❸ mặt sân + dots       ││││
│  │ │ │ ┌ ❷ .film-cap ─────────────────┐ ││ │ └───────────────────────────────┘│││
│  │ │ │ │ 9 #pass success 18 │ 2 #clear│ ││ │ ┌ ❹ .film-filters ──────────────┐│││
│  │ │ └─┴──────────────────────────────┴─┘│ │ │ [teams▾][players▾][events▾][⏭]││││
│  │ │ ┌ ❺ .film-bar ─────────────────────┐│ │ └───────────────────────────────┘│││
│  │ │ │ ▶ ───●────── 12:34/45:00  [⛶]  ││ │ ┌ ❻ .film-list  flex:1 ─────────┐│││
│  │ │ └──────────────────────────────────┘│ │ │  00:00  9 #pass success 18   ││││
│  │ └─────────────────────────────────────┘ │ │  00:02 18 #pass success  9   ││││
│  │       minmax(0,1fr)                     │ │  ⋮ cuộn TRONG khối này       ││││
│  │                                         │ └───────────────────────────────┘│││
│  │                                         │   clamp(320px, 23vw, 460px)      │││
│  │                                         └──────────────────────────────────┘││
│  └──────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Cấu trúc DOM không đổi một dòng nào.** Toàn bộ sơ đồ trên là cùng cây ở §3.1 với các thuộc
tính CSS bị ghi đè. Đây là lợi ích lớn nhất của việc thiết kế fullscreen như một *lớp override*
thay vì một *layout thứ hai*: không có markup thứ hai để hai bên lệch nhau.

### 7.3 Khung hình: từ `aspect-ratio` sang `flex`

Comment ở đầu khối Film trong CSS ghi lý do khung hình đang được cỡ theo tỉ lệ:

> *"The stage is sized by aspect ratio rather than by height: this view is mounted inside two
> different shells and neither can be asked for a viewport height without upsetting the other."*

Fullscreen là **cái shell thứ ba, và là cái duy nhất mà chiều cao là đại lượng đã biết**. Nên ở
đó, và chỉ ở đó, quan hệ bị đảo:

```css
.film-full .film-stage{aspect-ratio:auto; flex:1; min-height:0}
```

Video giữ nguyên `object-fit:contain`, nên nó tự căn giữa trong khoảng còn lại và không bao giờ
bị méo.

Một hệ quả **có lợi** đáng ghi lại: trên màn 16:9, sau khi trừ cột phải, khung hình thường bị
giới hạn bởi **chiều rộng**, nên `contain` để lại dải đen trên/dưới. `.film-cap` được ghim vào
đáy của `.film-stage` chứ không phải đáy của video — nên trong fullscreen dải chú thích rơi vào
**dải đen ngay dưới hình**, đọc rõ hơn, và không còn che mất một dải cỏ như khi xem nhỏ.

*Đo thật trên 1920×1080:* stage **1430×951**, mà một khung 16:9 rộng 1430 chỉ cần 804 chiều
cao — nên còn **147px** dải đen chia đôi trên/dưới, và `.film-cap` (cao 54px ở cỡ này) nằm
gọn trong 73px phía dưới, ngay dưới mép hình chứ không đè lên cỏ.

### 7.4 Thang chữ

Dùng `clamp()` neo theo `vh`, vì đại lượng quyết định "đọc được từ hàng cuối" là **chiều cao
màn chiếu**, không phải chiều rộng cửa sổ. Cận dưới giữ cho laptop 768px không bị phồng chữ,
cận trên giữ cho màn 4K không thành áp phích.

| Phần tử | Bình thường | Fullscreen | Ở 1080p |
|---|---|---|---|
| `.fm-no` (số áo) | `12px` / ô `20px` | `clamp(14px,1.7vh,19px)` / ô `clamp(24px,3vh,32px)` | 18px / 32px |
| `.fm-ev` (tên sự kiện) | `12.5px` | `clamp(14px,1.8vh,20px)` | 19px |
| `.film-cap` | `13px`, cao ≥30 | `clamp(15px,1.9vh,21px)`, cao `clamp(38px,5vh,54px)` | 20px / 54px |
| `.fm-row` | `12px`, pad `5/9` | `clamp(13px,1.5vh,16px)`, pad `7/12` | 16px |
| `.fm-t` (đồng hồ) | `11px` | `clamp(12px,1.35vh,15px)` | 14px |
| `.fm-sl-btn` / `.fm-sl-opt` | `11.5px` | `13.5px` | 13.5px |
| `.fm-tc` | `11.5px` | `15px` | 15px |
| `.film-halves button` | `12px` | `15px`, pad `7/20` | 15px |

Ba thứ **cố ý không phóng to**: slicer (là công cụ của người điều khiển, không phải nội dung
khán giả đọc), `#fmNext`, và các nút chuyển hiệp — đủ to để bấm, không tranh chỗ với dữ liệu.

### 7.5 Mặt sân — không cần một dòng JS nào

Đây là chỗ thiết kế cũ đã làm sẵn phần việc. `pitchSVG()` trả về SVG có `viewBox` và
`style="width:100%;height:100%"`, còn `filmDot()` tính bán kính trong **đơn vị user của SVG**:

```js
const d=PITCH_DIMS[meta.sport]||PITCH_DIMS.football;   // football: 1050×680
const R=Math.round(d.h*0.028);                         // = 19 user units, luôn luôn
```

Nên chấm, số áo, đường chuyền nét đứt và quả bóng đều **tự phóng to theo SVG**. Cột phải rộng
hơn ⇒ mặt sân to hơn ⇒ mọi thứ trên nó to hơn, cùng tỉ lệ. **`filmDot`, `filmDraw`, `filmBall`:
0 dòng thay đổi.**

`.film-pitch` giữ `aspect-ratio:105/68` (đúng bằng `PITCH_DIMS.football`), chỉ thêm `flex:none`
để nó không bị flex column bóp lại khi bảng events dài.

### 7.6 Dưới 900px

`stats-view.css:344` đã có `@media (max-width:900px)` xếp `.film-grid` thành một cột. Khối
fullscreen có **specificity cao hơn** (`.film-full .film-grid` = 0,2,0 so với `.film-grid` =
0,1,0) nên nó sẽ **thắng cả trong media query đó** — tức là một cái tablet dựng đứng vào
fullscreen sẽ bị ép hai cột nếu ta không nói gì. Nên phải nói:

```css
@media (max-width:900px){
  .film-full{padding:10px; overflow:auto}          /* ở đây cuộn là câu trả lời đúng */
  .film-full .film-grid{grid-template-columns:minmax(0,1fr)}
  .film-full .film-stage{aspect-ratio:16/9; flex:none}
  .film-full .film-pitch{max-width:520px; margin:0 auto}
  .film-full .film-list{flex:none; max-height:42vh}
}
```

`overflow:auto` thay vì `hidden` ở nhánh này là **cố ý** — và nó vẫn giữ đúng tính chất mà §9
dựa vào (`auto` cũng không phải `visible`).

### 7.7 CSS đầy đủ

Thêm vào **cuối** `Stats/stats-view.css`, sau khối `@media (max-width:900px)` hiện có:

```css
/* ============================================================
   Film, toàn màn hình — vẫn sáu thứ ấy, trên một máy chiếu.

   Không rule nào ở đây tồn tại ngoài .film-full, và .film-full
   được filmFullSet() đặt lên #statsHolder rồi gỡ ra bởi chính
   fullscreenchange của trình duyệt. Mỗi rule là một OVERRIDE của
   một rule phía trên, không bao giờ là một sửa đổi: ngoài chế độ
   này, file cư xử y hệt như trước khi khối này được thêm vào.

   Class làm LAYOUT, API chỉ lấy chrome trình duyệt đi — nên một
   trình duyệt từ chối API (policy, iframe, iPad cũ) vẫn nhận
   được view to, phủ kín cửa sổ thay vì phủ kín màn hình.

   Class chứ không phải :fullscreen, vì ba lý do: :fullscreen chết
   ở đường lùi; Safari cũ cần :-webkit-full-screen và một selector
   lạ trong danh sách phẩy sẽ giết cả rule; và một class thì test
   được từ stub DOM, một pseudo-class thì không.
   ============================================================ */
.film-full{
  position:fixed; inset:0; z-index:2000; box-sizing:border-box;
  background:var(--bg); padding:14px 16px; overflow:hidden; display:flex;
}
/* Không tổ tiên nào của #statsHolder ở hai host đặt transform / filter /
   perspective / contain, nên `fixed` được tính theo viewport ở cả hai. Trên
   client site .app-top và .side là sticky ở z-index:50 — sticky không tạo
   containing block, và 2000 vượt qua chúng. */
.film-full .film{flex:1; min-height:0; gap:10px}
.film-full .film-grid{
  flex:1; min-height:0; align-items:stretch; gap:16px;
  grid-template-columns:minmax(0,1fr) clamp(320px,23vw,460px);
}
.film-full .film-main{min-height:0}
.film-full .film-side{min-height:0}
/* Ngoài kia khung hình được cỡ theo tỉ lệ, vì không host nào hỏi được chiều
   cao viewport. Fullscreen là chỗ DUY NHẤT chiều cao là đại lượng đã biết, nên
   khung hình lấy phần còn lại và video letterbox bên trong — thứ cũng tặng cho
   .film-cap một dải đen của riêng nó để được đọc trên đó, thay vì đọc đè lên
   chính cái nó đang mô tả. */
.film-full .film-stage{aspect-ratio:auto; flex:1; min-height:0}
.film-full .film-pitch{flex:none}
.film-full .film-list{flex:1; min-height:0; max-height:none}

/* ---- thang chữ: neo theo vh, vì đại lượng quyết định "đọc được từ hàng cuối"
        là chiều cao màn chiếu, không phải chiều rộng cửa sổ ---- */
.film-full .film-halves button{font-size:15px; padding:7px 20px}
.film-full .film-cap{
  min-height:clamp(38px,5vh,54px); padding:8px 16px; gap:22px;
  font-size:clamp(15px,1.9vh,21px);
}
.film-full .fm-no{
  min-width:clamp(24px,3vh,32px); height:clamp(24px,3vh,32px);
  padding:0 7px; border-radius:6px; font-size:clamp(14px,1.7vh,19px);
}
.film-full .fm-ev{font-size:clamp(14px,1.8vh,20px)}
.film-full .film-bar{padding:8px 14px; gap:14px}
.film-full .fm-play{width:38px; height:32px; font-size:14px}
.film-full .fm-track{height:22px}
.film-full .fm-rail,.film-full .fm-fill{top:9px; height:5px}
.film-full .fm-knob{top:11px; width:14px; height:14px}
.film-full .fm-tc{font-size:15px}
.film-full .fm-sl-btn{font-size:13.5px; padding:7px 9px}
.film-full .fm-sl-opt{font-size:13.5px; padding:6px 8px}
.film-full .fm-sl-opt input{width:15px; height:15px}
.film-full .fm-next{width:40px; font-size:14px}
/* Bảng events. Hai dòng .fm-row .fm-no / .fm-ev phải được viết LẠI ở đây: base
   có `.fm-row .fm-no{...18px}` cùng độ đặc hiệu (0,2,0) với `.film-full .fm-no`
   ở trên, và khi hoà thì rule ĐỨNG SAU thắng — tức là không có hai dòng này,
   số áo trong bảng sẽ nhảy lên cỡ của caption. */
.film-full .fm-row{font-size:clamp(13px,1.5vh,16px); padding:7px 12px; gap:10px}
.film-full .fm-row .fm-no{min-width:22px; height:22px; font-size:13px}
.film-full .fm-row .fm-ev{font-size:13.5px}
.film-full .fm-t{font-size:clamp(12px,1.35vh,15px)}
.film-full .fm-none{padding:22px; font-size:14px}

/* ---- nút: phần tử mới duy nhất, ở cuối thanh tua, chỗ mọi trình phát
        video trên đời để nó ---- */
.fm-full{
  flex:none; width:30px; height:26px; display:inline-flex;
  align-items:center; justify-content:center; padding:0;
  background:var(--panel); border:1px solid var(--line); color:var(--ink);
  border-radius:6px; cursor:pointer;
}
.fm-full:hover{border-color:var(--accent)}
.fm-full svg{width:15px; height:15px; display:block}
.film-full .fm-full{width:40px; height:32px}
.film-full .fm-full svg{width:19px; height:19px}

/* Khối fullscreen thắng cả @media ở trên nhờ độ đặc hiệu, nên một tablet dựng
   đứng sẽ bị ép hai cột nếu không nói gì ở đây. overflow:auto thay vì hidden là
   CỐ Ý — và vẫn giữ đúng tính chất §9 dựa vào (auto cũng không phải visible). */
@media (max-width:900px){
  .film-full{padding:10px; overflow:auto}
  .film-full .film-grid{grid-template-columns:minmax(0,1fr)}
  .film-full .film-stage{aspect-ratio:16/9; flex:none}
  .film-full .film-pitch{max-width:520px; margin:0 auto}
  .film-full .film-list{flex:none; max-height:42vh}
}
```

---

## 8. Sáu thành phần bắt buộc — đối chiếu

| # | Yêu cầu | Phần tử | Trong fullscreen |
|---|---|---|---|
| ❶ | video trận đấu | `#fmVideo` trong `#fmStage` | **to nhất có thể**: chiếm toàn bộ chiều cao còn lại, `contain` nên không méo |
| ❷ | bảng event dưới video | `#fmCap` `.film-cap` | giữ nguyên vị trí (đáy khung hình), chữ `13px → ~20px`, và rơi vào dải đen dưới hình nên dễ đọc hơn (§7.3) |
| ❸ | mặt sân | `#fmPitch` + `<g id="pv-dots">` | cột rộng `340px → tới 460px`; chấm/số/bóng tự phóng theo SVG, **0 dòng JS** (§7.5) |
| ❹ | 3 slicer teams/players/events | `.film-filters` × `.fm-slicer` | nguyên hành vi: panel checkbox, All, đóng-khi-bấm-ngoài, `filmSlicerFit` (§9) |
| ❺ | thanh tua + play/pause | `.film-bar` | to hơn, và là nhà của nút `⛶` mới |
| ❻ | bảng events | `#fmList` `.film-list` | bỏ trần `340px`, ăn hết chiều cao còn lại của cột — **340px → 672px**, tức **11 → 18 dòng** thấy được ở 1080p *dù chữ đã to hơn*; tự cuộn theo playhead như cũ |

Cộng thêm `.film-halves` (`[1st Half] [2nd Half]`) — không nằm trong danh sách yêu cầu nhưng
giữ lại là bắt buộc: không có nó thì trong cuộc họp không đổi được hiệp mà không thoát ra.

> **Giả định đã chốt về ❷.** "Bảng event dưới video" được hiểu là **dải chú thích `.film-cap`**
> — dải đen ghim ở đáy khung hình, viết đội nhà từ mép trái và đội khách từ mép phải, nói
> đang xảy ra chuyện gì. Nếu ý bạn là **đưa `.film-list` xuống dưới video** (thay vì để nó ở
> cột phải), đó là một biến thể của đúng khối CSS trên và không đụng vào JS — xem Q2 ở §15.

---

## 9. `filmSlicerFit()` — vì sao KHÔNG phải sửa

`filmSlicerFit()` (`stats-view.js:1580`) cắt chiều cao panel checkbox theo chỗ trống thật sự
có dưới nút, bằng cách đi ngược lên cây tìm **tổ tiên gần nhất có cắt nội dung**:

```js
let edge=window.innerHeight||0;
for(let n=sl.parentNode;n&&n.nodeType===1&&n!==document.body;n=n.parentNode){
  if(getComputedStyle(n).overflowY!=='visible'){
    edge=Math.min(edge,n.getBoundingClientRect().bottom);
    break;
  }
}
p.style.maxHeight=Math.max(FILM_SL_MIN,Math.min(FILM_SL_MAX,edge-b.bottom-10))+'px';
```

Đây chính xác là loại hàm mà một tính năng fullscreen thường làm hỏng. Ngoài fullscreen, tổ
tiên cắt gần nhất là `.stats-wrap` (`overflow:auto`, `shared.css:39`). Trong fullscreen,
`.stats-wrap` **vẫn nằm trên cây, vẫn được layout ở vị trí cũ trong trang, và vẫn không được
vẽ** — `getBoundingClientRect().bottom` của nó là một con số của một trang đang không hiển
thị. Panel sẽ bị cắt còn `FILM_SL_MIN=96px` ngay giữa một màn 1080.

Nhưng chuỗi tổ tiên đi từ `.fm-slicer` lên là:

```
.film-filters (visible) → .film-side (visible) → .film-grid (visible)
→ .film (visible) → #statsHolder.film-full  ← overflow:hidden ✔ DỪNG Ở ĐÂY
```

`.film-full` đặt `overflow:hidden` (§7.7), nên **nó chính là tổ tiên cắt gần nhất**, và vòng
lặp dừng ở nó trước khi tới `.stats-wrap`. Mà `getBoundingClientRect()` của phần tử fullscreen
**đúng bằng viewport** — đó là định nghĩa của việc nó đang fullscreen.

Nên: **`filmSlicerFit()` tự đúng, 0 dòng thay đổi.** Điều này chỉ đúng chừng nào `.film-full`
còn `overflow` khác `visible`. Nó không hiển nhiên, nên §12 có một test khoá riêng nó lại.

Ở nhánh `<900px`, `.film-full` là `overflow:auto` — cũng khác `visible`, nên tính chất giữ
nguyên.

---

## 10. Không đổi gì của tính năng khác

### 10.1 Sáu dòng chạm vào hàm sẵn có

| Hàm | Dòng | Thay đổi | Ảnh hưởng ngoài Film |
|---|---|---|---|
| `filmHTML()` | `:1434` | +1: nút sau `#fmTc` | không — hàm chỉ dựng markup Film |
| `filmStart()` | `:1516` | +4: onclick, 2 listener, `filmFullSet(filmFull)` | không |
| `filmStop()` | `:1548` | +2: gỡ 2 listener | không |
| `filmKeys()` | `:1657` | +4: nhánh `Escape` + nhánh `f` | không — hàm chỉ chạy khi `film` khác null |
| `renderStats()` | `:67` | **+1 (dòng duy nhất trong hàm dùng chung)** | xem dưới |
| `destroy()` | `:2066` | +1: `filmFullOff()` | không |

Dòng trong `renderStats()`, đặt ngay sau `filmStop()`:

```js
function renderStats(){
  filmStop();
  /* Fullscreen thuộc về Film. Bất cứ thứ gì khác sắp được vẽ vào cái hộp đó —
     một view khác, hay thông báo "no match" vốn set display:none lên chính
     .stats-wrap và sẽ để lại một màn hình đen không có gì trên đó — trả màn
     hình lại trước. Là no-op khi fullscreen không bật, tức là mọi lần gọi
     renderStats() mà Film không tham gia. */
  if(statView!=='film'||!meta.matchId)filmFullOff();
  const open=!!meta.matchId;
  ...
```

`filmFullOff()` mở đầu bằng `if(!filmFull)return;`. Với Overall / Dashboard / Stats, `filmFull`
luôn `false` (không có đường nào bật nó ngoài nút trong `.film-bar`), nên dòng này là **một
phép so sánh boolean rồi return** — không đọc DOM, không đụng layout, không thay đổi thứ tự
bất kỳ thao tác nào phía dưới.

### 10.2 Ma trận hồi quy

| Nơi | Có thể hỏng vì | Vì sao không |
|---|---|---|
| **Overall / Dashboard / Stats** (cả hai host) | selector CSS mới, dòng mới trong `renderStats` | mọi selector mới đều bắt đầu bằng `.film-full` hoặc `.fm-full`, không selector cũ nào bị sửa; dòng mới là no-op |
| **Bốn tab category** (Shooting/Distribution/Defensive/Other) | dùng chung `#statsHolder` | không đụng markup của chúng; `.film-full` chỉ tồn tại khi `statView==='film'` và bị gỡ trước khi vẽ thứ khác (§10.1) |
| **Nút chuyển hiệp trong Film** | re-render giết fullscreen | `#statsHolder` không bị gỡ ⇒ fullscreen sống; class sống cùng nó; `filmResume` giữ nguyên vị trí video (§4.4) |
| **Ba slicer** | panel bị cắt sai trong fullscreen | §9 — không sửa, và có test |
| **`←`/`→`/`Space`** | nhánh `Escape`/`f` mới chen vào | hai nhánh mới nằm **sau** cả nhánh slicer lẫn nhánh `INPUT`, và trước ba nhánh cũ là một `if(e.key==='Escape'){...;return;}` không đụng phím nào khác |
| **Xuất XLSX / CSV / PDF** | `report.js` đọc DOM? | không: `report.js` dựng trang từ `PTStats.data()`, không đọc `.film`. Và 3 nút export nằm ngoài fullscreen nên không bấm được khi đang chiếu. **`Stats/report.js`: 0 dòng** |
| **Cloud realtime trên Stats page** | mỗi event = một re-render | fullscreen sống qua nó (§4.4). Client channel không có realtime |
| **Rời khỏi trang match trên client** | `destroy()` | gọi `filmFullOff()` tường minh, và `root.innerHTML=''` là đường lùi của trình duyệt (§4.1) |
| **Tabs Home / Channel / Data** (client) | `.film-full{position:fixed}` sót lại | không có đường nào để sót: `destroy()` và `renderStats()` đều tắt, `fullscreenchange` đối chiếu lại, và class nằm trên một node bị router xoá |
| **Player-Lists, tagging app** | — | không load `stats-view.*`. 0 dòng |
| **Landing page** (`client/index.html`) | quảng cáo tính năng chưa có | **không sửa** trong lần này. Nếu muốn thêm dòng về full screen thì là một thay đổi riêng, sau khi tính năng đã live |

---

## 11. Chuỗi cache-bust

Bắt buộc, và là chỗ dễ trượt nhất — `tests/asset-versions.test.js` sẽ đỏ nếu làm nửa vời:

| File | v hiện tại | v mới | Phải sửa ở |
|---|---|---|---|
| `Stats/stats-view.js` | 15 | **16** | `Stats/index.html:63` **và** `client/assets/app.js:1277` |
| `Stats/stats-view.css` | 6 | **7** | `Stats/index.html:12` **và** `client/assets/app.js:1274` |
| `client/assets/app.js` | 31 | **32** | `client/app.html:81` |

Dòng thứ ba là hệ quả của hai dòng đầu: sửa số `?v=` **bên trong** `app.js` làm đổi nội dung
`app.js`, nên chính nó cũng phải được bump ở nơi nạp nó.

Rồi:

```bash
node tests/asset-versions.test.js --update
```

`Stats/report.js` **không** đổi ⇒ giữ `v=31` ở cả hai nơi. `deploy.yml` **không** đổi: không có
file mới nào cần `cp` (`stats-view.js` / `stats-view.css` đã có dòng `cp` từ trước, dòng 67–68).

---

## 12. Test — `tests/film-fullscreen.test.js` (39 test, tất cả xanh)

Theo đúng khuôn `film-slicers.test.js`: stub DOM hẹp đúng bằng những selector được dùng, cộng
các assertion về **hình dạng source** cho những thứ không chạy được trong `vm`.

**A0. Cái gate của Q1-B** (thêm sau khi chốt B)
- Stats page không có nút, `filmFullOn()` từ chối chạy, và `f` **không bị nuốt** ở đó
- channel thì có cả ba

**A. Markup (`filmHTML` thật)**
1. có đúng một `id="fmFull"`, `type="button"`, nằm **trong** `.film-bar` và **sau** `#fmTc`
2. mang `aria-pressed="false"` và `aria-label` lúc khởi tạo
3. icon là `<svg>` với `<path>`, **không phải ký tự** — một regex chặn `⛶`/`&#9974;` quay lại
4. `.film-filters` **không** có nút mới nào (hàng slicer không bị đụng)

**B. Máy trạng thái (chạy thật trong `vm`)**
5. `filmFullOn()` bật class `.film-full` trên `#statsHolder` **trước** khi gọi `requestFullscreen`
6. `requestFullscreen` reject ⇒ class **vẫn còn** (đường lùi) và không throw
7. không có `requestFullscreen` ⇒ vẫn maximised
8. `filmFullOff()` gỡ class và gọi `exitFullscreen` **chỉ khi** `fullscreenElement` đúng là hộp của ta
9. `filmFullChange()` với `fullscreenElement=null` sau khi đã native ⇒ tự gỡ class (đường `Escape`/`F11`)
10. `filmFullChange()` khi đang ở đường lùi ⇒ **không** đụng gì (nó chưa từng native)
11. `filmFullSet()` cập nhật `aria-pressed`, `title`, `aria-label` và `d` của path
12. `filmFullSet()` đóng mọi slicer đang mở

**C. Vòng đời**
13. `filmStart` bind `fmFull.onclick`, add `fullscreenchange` + `webkitfullscreenchange` **bằng tên hàm**
14. `filmStop` remove **đúng hai** listener đó, **bằng cùng tên hàm** (khuôn bắt buộc của file)
15. `filmStart` kết thúc bằng `filmFullSet(filmFull)` — một lần vẽ lại dưới fullscreen không để lại nút nói sai
16. `renderStats` gọi `filmFullOff()` **trước** `const open=` và điều kiện có cả `statView!=='film'` lẫn `!meta.matchId`
17. `destroy()` gọi `filmFullOff()`

**D. Bàn phím (`filmKeys` thật)**
18. `f` và `F` toggle; `Space`/`←`/`→` giữ nguyên hành vi cũ
19. `Escape` khi `filmFull && !filmFullNative` ⇒ thoát + `preventDefault`
20. `Escape` khi `filmFullNative` ⇒ **không** `preventDefault` (để cho trình duyệt)
21. `Escape` khi focus trong `.fm-slicer` ⇒ vẫn chỉ đóng slicer (nhánh cũ nguyên vẹn)
22. `f` khi focus trong `.fm-slicer` hoặc `INPUT` ⇒ không toggle

**E. CSS**
23. mọi selector mới đều chứa `.film-full` hoặc `.fm-full` — **không rule nào ngoài Film bị định nghĩa lại**
24. `.film-full` khai báo `overflow` khác `visible` — **đây là test giữ cho §9 đúng**, và là test dễ mất nhất nếu ai đó "dọn dẹp" CSS sau này
25. `.film-full` khai báo `position:fixed` + `inset` + `background` (đường lùi phải che được trang bên dưới)
26. khối `@media (max-width:900px)` của fullscreen viết lại `grid-template-columns` (nếu không, tablet bị ép hai cột)
27. tồn tại `.film-full .fm-row .fm-no` (bẫy độ đặc hiệu ở §7.7)
28. `stats-view.test.js` sẵn có — "nothing reaches for a bare html, body or header" — vẫn xanh
29. bốn rule gốc bị override (`.film-grid`, `.film-stage`, `.film-list`, `.fm-row .fm-no`)
    vẫn đọc **đúng từng ký tự** như trước — "0 dòng cũ bị sửa", nói bằng test chứ không bằng lời

**F. Kiểm tra bằng trình duyệt** — §17.

---

## 13. Rủi ro đã biết

**13.1 `position:fixed` và containing block.** Một tổ tiên có `transform` / `filter` /
`perspective` / `will-change` / `contain:paint` sẽ biến `fixed` thành "cố định theo tổ tiên đó",
và đường lùi sẽ nằm sai chỗ. Đã kiểm tra cả hai host: `client/assets/app.css` chỉ có `transform`
trên `.tgl-knob` (`:73`), `.side-pull svg` (`:170`) và `@keyframes spin` (`:288`) — không cái nào
là tổ tiên của `.view`; `.app-top`/`.side` là `sticky`, mà `sticky` **không** tạo containing
block, và không chỗ nào dùng `filter` / `perspective` / `contain`. Trên Stats
page chuỗi là `body > .page > .stats-wrap`, sạch. **Rủi ro hiện tại: không** — và §17 đã xác
nhận trên trình duyệt: hộp đo được đúng `1920×1080` tại `(0,0)`, phủ cả header sticky
z-index 50. Nhưng nó là thứ một thay đổi tương lai ở shell có thể phá âm thầm.

**13.2 Video re-buffer khi re-render.** Đổi hiệp (và trên Stats page, mỗi cloud event) dựng lại
thẻ `<video>`, nên có một nháy đen và một lần buffer lại. **Đây là hành vi đã có từ trước, không
phải do thay đổi này**, và trên client channel chỉ xảy ra khi bấm đổi hiệp. Không chữa ở đây.

**13.3 iOS.** Safari trên iPhone chỉ cho `<video>` vào fullscreen của hệ điều hành
(`webkitEnterFullscreen`), không cho div. Ở đó `requestFullscreen` trên div không tồn tại ⇒ rơi
xuống đường lùi (§5.3): phủ kín cửa sổ, giữ đủ sáu thành phần, mất thanh địa chỉ thì không.
Với một tính năng dành cho phòng họp có máy chiếu, đây là đánh đổi đúng. iPadOS 16.4+ có
`requestFullscreen` đầy đủ.

**13.4 `Escape` khi đang mở slicer trong native fullscreen.** Một lần nhấn sẽ vừa đóng slicer
vừa thoát fullscreen, vì hành vi của UA không huỷ được. Chấp nhận: `Escape` nghĩa là "ra", và
ra hẳn thì nhất quán hơn là ra nửa vời.

**13.5 Con trỏ chuột không tự ẩn** khi video chạy toàn màn hình. Trình duyệt tự ẩn con trỏ ở
fullscreen sau vài giây không di chuyển ⇒ không cần làm gì.

**13.6 Đường NATIVE chưa được chạy thật ở đây.** Trình duyệt nhúng dùng để verify (§17) từ chối
`requestFullscreen()` — `document.fullscreenElement` vẫn `null`, `screen` là `0×0`. Nghĩa là
**đường lùi đã được kiểm chứng đầu-cuối bằng một lời từ chối thật**, còn nhánh native chỉ được
phủ bằng unit test (`filmFullChange` với `fullscreenElement` đặt tay). Ba dòng chưa chạy trên
trình duyệt thật là `requestFullscreen` / `exitFullscreen` / `fullscreenchange` nối vào nhau —
nên mục đầu tiên cần thử trên máy thật là: bấm nút trên Chrome desktop và xem thanh địa chỉ có
biến mất không. Nếu không, cái nhìn thấy vẫn là view to phủ kín cửa sổ, không phải một lỗi.

---

## 14. Không làm lần này

- **Picture-in-picture.** Khác bài toán: PiP chỉ mang được khung hình đi, mà cả điểm của Film
  là năm thứ còn lại.
- **Nút full screen riêng cho mặt sân.** Hợp lý cho việc phân tích chiến thuật, nhưng là một
  chế độ thứ hai với một layout thứ hai — mở riêng khi có ai đó thật sự cần.
- **Wake Lock API.** Trình duyệt đã tự giữ màn hình sáng trong lúc video đang phát.
- **Ẩn hai nút chuyển hiệp / gộp vào thanh tua.** Chúng ở đúng chỗ.
- **Nhớ trạng thái fullscreen giữa các lần mở match.** Fullscreen là một hành động, không phải
  một thiết lập; và `requestFullscreen` cần user activation nên không tự khôi phục được.
- **Quảng cáo tính năng trên landing page.** Chỉ sau khi đã live, và là commit riêng.

---

## 15. Ba quyết định — đã chốt

**Q1 → B. Chỉ client channel.** `const filmFullOK=()=>!!opts.fullscreen` — mặc định **tắt**
(không phải `!==false` như bản thiết kế đề nghị; xem ghi chú ở đầu file). Gate đóng ở **cả ba
cửa**, vì tắt ở một cửa thì không phải là tắt:

| Cửa | Cách đóng |
|---|---|
| markup | `filmHTML()` chỉ in nút khi `filmFullOK()` |
| lối vào | `filmFullOn()` return ngay khi `!filmFullOK()` |
| bàn phím | nhánh `f` mang thêm `&& filmFullOK()`, nên Stats page **không nuốt phím đó** |

Trang Stats mount đúng như trước (`{chrome:false, local:true, cloud:true}`) và ra khỏi thay
đổi này không có gì mới. Có 2 test khoá riêng điều đó.

**Q2 → A.** "Bảng event dưới video" là dải chú thích `.film-cap`; bảng events ở cột phải,
340px → 672px ở 1080p.

**Q3 → A.** `F` toggle, cả hoa lẫn thường. Không nhận khi focus đang trong một slicer hoặc một
ô nhập liệu — đúng như `Space` hôm nay.

---

## 16. Checklist triển khai — đã xong

```
[x] Chốt Q1 / Q2 / Q3 (§15)
[x] Stats/stats-view.js — khối full screen sau filmStop() (§5.4)
[x] Stats/stats-view.js — 6 dòng ở filmHTML/filmStart/filmStop/filmKeys/renderStats/destroy
[x] Stats/stats-view.css — khối mới ở CUỐI file, không sửa dòng nào phía trên (§7.7)
[x] tests/film-fullscreen.test.js — 39 test (§12)
[x] Bump ?v=: stats-view.js 15→16, stats-view.css 6→7 (× 2 nơi mỗi cái), app.js 31→32 (§11)
[x] node tests/asset-versions.test.js --update
[x] node tests/run.js  → 1046/1046, trong đó 1007 test cũ pass NGUYÊN VẸN
[x] git diff --numstat Stats/stats-view.css  → 106 / 0  (không một dòng nào bị xoá)
[x] git diff --numstat Stats/stats-view.js   → 133 / 1  (dòng −1 là comment header nối dài)
```

## 17. Đã verify trên trình duyệt

Harness cục bộ (server tĩnh + một trang dựng lại shell của client channel: header sticky
z-index 50, rail 196px, `.view` có padding) mount `PTStats` **đúng như `client/assets/app.js`
mount** — `{fullscreen:true}`, một report tổng hợp 2 hiệp × 160 entry, 23 số áo. Harness nằm
ngoài repo (scratchpad), không có file nào lọt vào `git status`.

| Kiểm tra | Kết quả |
|---|---|
| Nút render là con **cuối** của `.film-bar`, có `<svg><path>` | ✔ |
| Accessibility tree đọc ra `button "Full screen (F)"` | ✔ |
| Vào chế độ to: hộp = `1920×1080` tại `(0,0)`, `position:fixed`, `z-index:2000`, `overflow:hidden` | ✔ |
| **Trang không cuộn**; chỉ `.film-list` cuộn bên trong | ✔ |
| Đủ 6 thành phần (video, cap, sân+SVG, 3 slicer, bar, 160 dòng) | ✔ |
| Header sticky của shell bị phủ | ✔ |
| **§9**: mở cả 3 slicer trong chế độ to → panel được **230px đầy đủ**, không bị cắt còn 96px, cả 3 nằm trong màn hình | ✔ |
| `aria-pressed` / `title` / icon đảo chiều theo trạng thái | ✔ |
| `Escape` (đường lùi) → gỡ class | ✔ |
| `f` → vào lại | ✔ |
| Bấm **Overall** khi đang to → class biến mất, Overall vẽ bình thường (dòng §10.1) | ✔ |
| Vào lại Film → về đúng cỡ thường, `#statsHolder` không còn class | ✔ |
| **760×900**: một cột, side xếp dưới main, stage về `16/9`, sân cap 520px căn giữa, holder `overflow:auto` cuộn trong, panel slicer cuối mở sang trái và vẫn trong màn hình | ✔ |
| Đường **native** | **không chạy được ở đây** — xem §13.6 |

Con số ở đầu tài liệu (×1.40 khung hình, ×1.69 mặt sân, 11→18 dòng) là đo từ chính harness
này, không phải ước lượng.
