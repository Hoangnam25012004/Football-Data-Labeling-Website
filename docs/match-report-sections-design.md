# Match Report (PDF) — **Goalkeeper**, **Set Pieces**, **Fouls** — Detailed Design

Nút **⭳ PDF** trên tab Stats của channel dựng ra một tập trang A4 kết thúc bằng bốn trang
gọi là *Discipline* và *Goalkeeper & Discipline*. Tài liệu này thiết kế cái đứng vào chỗ
đó: **ba mục** — Goalkeeper, Set Pieces, Fouls — mỗi mục có visualization riêng và một
trang player stats **cho mỗi đội**, cộng một **header mới trên đầu mọi trang** và một bản
sửa kích cỡ cho bảng player stats.

**Trạng thái: ĐÃ TRIỂN KHAI — 2026-09-05.** §14 đã được trả lời (Q1 không · Q2 có ·
**Q3 có, với cách khác bản thiết kế đề xuất — xem §17** · Q4 không · Q5 tay).
**§17 ghi lại năm chỗ code thật khác bản thiết kế, và vì sao.**

**Baseline trước: 1483/1483. Sau: 1510/1510** (`node tests/run.js`), 27 test mới trong
`tests/report-sections.test.js`. Không một test cũ nào phải sửa.

**Phạm vi sửa thực tế:** `Stats/report.js` (toàn bộ phần hình và số),
`client/assets/app.js` (một khối 6 dòng phủ fixture lên meta — §17.2), cộng **ba** chỗ
bump `?v=` (`Stats/index.html`, `client/assets/app.js`, `client/app.html`),
`tests/asset-versions.json` và một file test mới. **Không** đụng `shared.js`, **không**
đụng `Stats/stats-view.js`, **không** đụng `index.html`, **không** đụng `cloud-sync.js`,
**không** thêm event mới, **không** thêm counter mới, **không** đụng schema payload.
§11 liệt kê từng thứ không được đụng và lý do.

---

## 0. Yêu cầu, đọc lại thành tám việc

| # | Yêu cầu | Mục |
|---|---|---|
| 1 | Bỏ mục **Discipline** (3 trang) và trang **Goalkeeper & Discipline** | §4 |
| 2 | Mục **Goalkeeper**: 1 trang visualization mỗi đội, theo ảnh 1 | §6 |
| 3 | Mục **Set Pieces**: 1 trang **goal kicks** mỗi đội, theo ảnh 2 | §7.2 |
| 4 | Mục **Set Pieces**: 1 trang **free-kicks** mỗi đội (passes S/F, crosses S/F, shot on/off target), theo ảnh 3 | §7.3 |
| 5 | Mục **Set Pieces**: 1 trang **corners** mỗi đội, theo ảnh 3 | §7.4 |
| 6 | Mục **Fouls**: giữ 3 map cũ (foul / foul won / offside), foul phải là **total foul** = `foul` + `handball foul` + `foul throw` | §8 |
| 7 | Mỗi mục có **1 trang player stats với mỗi đội** | §9 |
| 8 | Header mỗi trang: **logo website + chữ "Match Report" + title**; và bảng player stats phải thấy hết title cột | §5, §9.3 |

Cộng thêm một ràng buộc bao trùm, do người dùng nêu và §11 trả lời trực tiếp:

> *"Đảm bảo khi hoàn thành sẽ không xảy ra bugs của các chức năng khác trong những tabs
> khác. Đảm bảo không thực hiện bất kỳ sự thay đổi của các tính năng khác khi chưa được
> cho phép."*

---

## 1. Hệ thống hiện tại — đọc ra từ code

### 1.1 Nút ⭳ PDF, và hai host của nó

`Stats/report.js` là **một IIFE, không export**, kết thúc bằng:

```js
function bind(){const b=$('expPdf'); if(b)b.onclick=exportPdf; return !!b;}
bind();
window.PTReport={buildPages,exportPdf,bind};   // report.js:1497-1499
```

Hai nơi dựng ra nút `#expPdf`, nên mọi thứ dưới đây chạy ở **cả hai**:

| Host | Nút ở đâu | Nạp report.js ở đâu |
|---|---|---|
| Trang Stats của analyst | `Stats/index.html:34`, có sẵn trong markup | `Stats/index.html:76` — `report.js?v=37` |
| **Channel của khách** | `stats-view.js:2370` dựng lúc mount → `app.js:410` gọi `PTReport.bind()` lại | `client/assets/app.js:1907` — `report.js?v=37` |

Đây là lý do §12 phải bump **hai** số, không phải một.

### 1.2 report.js lấy dữ liệu từ đâu

```js
// report.js:35-50 — sync(), chạy đầu mỗi buildPages() và mỗi exportPdf()
const d=S&&S.data&&S.data();          // S = window.PTStats
rows=d.rows; meta=d.meta; lineups=d.lineups; dur=d.dur;
…
const gone=HELPER_NAMES.filter(n=>h[n]==null);
if(gone.length)throw new Error('the Stats view is out of date — reload the page (…)');
```

Bốn giá trị + **mười hai helper** mượn qua `PTStats.helpers` (`stats-view.js:2478`):

```
matchTime, eventHalf, teamGoals, attackDir, dirArrowSVG, arcPath,
touchPoints, drawHeat, passTypeData, pdWindows, matchName, DEF_CATS
```

Ngoài ra `report.js` gọi thẳng các hàm **global của `shared.js`** — file đó được nạp
trước ở cả hai host. Những cái thiết kế này dùng, đã kiểm tra là có sẵn:

| Hàm | Ở đâu | Bản thiết kế dùng để |
|---|---|---|
| `computeStats`, `sumTeam`, `newStat`, `sortedPlayers` | `shared.js:414, 888` | mọi bảng số |
| `withSquad`, `squadNames`, `playerLabel` | `shared.js:760, 723, 755` | bảng player stats |
| `playedMinutes(lineups,dur,team,rows)` | `shared.js:799` | cột *Minutes Played* |
| `gkShirts(lineups,team)` | `shared.js:746` | **hàng thủ môn** — trả về *tất cả* số áo GK, kể cả người vào thay |
| `onPitchAt(lineups,team,t)` | `shared.js:863` | chia bàn thua cho đúng thủ môn |
| `evKey`, `EV_ALIAS` | `shared.js:349` | tra event bất kể hoa/thường |
| `SET_PIECE_EVENTS` | `shared.js:354` | nhận diện chuỗi set piece |
| `PLAYER_CATS` | `shared.js:456` | cột của ba bảng player stats mới |
| `TEAM_SECTIONS` | `shared.js:898` | ba bảng team comparison mới |
| `shotBodyPart(rows,shot)` | `shared.js:608` | cột *Body Part* trong Event List |
| `goalMouthG`, `goalMouthSVG`, `GOAL_MAP` | `shared.js:644, 677` | khung thành ở trang Goalkeeper |
| `PITCH_DIMS`, `pitchFootball` | `shared.js:65, 70` | mọi sân |
| `classifyCards` | `shared.js:692` | thẻ (đã dùng trong `cardCounts`) |

> **Không thêm tên nào vào `HELPER_NAMES`.** Mỗi tên thêm vào đó là một tên `report.js`
> bắt đầu phụ thuộc, và `sync()` sẽ *ném lỗi* nếu một `stats-view.js` cũ trong cache
> không có nó — trên **cả** trang Stats **lẫn** channel. Mọi thứ thiết kế này cần đều đã
> là global của `shared.js`, không cần cửa mới.

### 1.3 Bộ khung một trang

```js
// report.js:113-115
.rp-page{width:794px;height:1123px;box-sizing:border-box;padding:46px 50px;overflow:hidden…}
```

A4 @96dpi. Padding 46/50 ⇒ **flow box 694 × 1031 px**. `overflow:hidden` nghĩa là một
trang bị tràn **không báo gì cả** — nó chỉ cắt mất phần cuối. Đây là rủi ro chính của
mọi trang mới, và §13.2 biến nó thành một test.

`.rp-foot` (số trang + tỉ số) nằm **ngoài flow**, `position:absolute;bottom:16px`, nên
không ăn vào 1031px đó — comment ở `report.js:116-120` nói rõ lý do. Header mới ở §5 giữ
đúng nguyên tắc ấy.

`buildPages(host)` (`report.js:1387`) gom trang dưới dạng bộ ba `(sec, sub, html)`:

```js
const P=(sec,sub,pages)=>[].concat(pages).filter(Boolean).map(html=>({html,sec,sub:sub||null}));
```

`filter(Boolean)` là cách một builder **bỏ trang**: trả `null` thì trang biến mất khỏi
báo cáo *và* khỏi mục lục. `tocEntries()` (`report.js:1354`) gộp các trang liên tiếp cùng
`sec`+`sub` thành **một** dòng mục lục.

### 1.4 Bốn trang sắp bị thay

```js
// report.js:1419-1422
...P('Discipline','Foul Maps',foulMapsPage()),
...P('Discipline','Fouls Won',foulWonMapsPage()),
...P('Discipline','Offsides',offsideMapsPage()),
...P('Goalkeeper & Discipline',null,gkPage())
```

`gkPage()` (`report.js:1296-1349`) hiện in **bốn** khối trên một trang: thẻ thủ môn (vòng
save rate + 3 con số), hộp thẻ vàng/đỏ, so sánh Fouls/Fouls Won/Offsides, và so sánh 5
loại set piece.

> ⚠️ **`gkPage()` là nơi DUY NHẤT trong toàn bộ PDF in ra số thẻ vàng và thẻ đỏ.**
> Comment ở `report.js:1317` nói thẳng: *"cards belong on a page called Discipline — they
> were missing entirely before"*. Xoá nó mà không thay chỗ khác là **làm mất một chỉ số
> khỏi báo cáo**. §8.1 nhận trách nhiệm này.

---

## 2. Khảo sát dữ liệu — cái gì THỰC SỰ trả lời được

Mục quan trọng nhất tài liệu. Mọi hình ở §6–§8 rơi ra từ đây. Phần lớn đã được kiểm
chứng dòng-một-dòng trong `docs/gk-setpiece-dashboard-design.md` (bản 2026-09-03, cho
dashboard của tab Stats); ở đây **kiểm lại và chỉ ghi những gì PDF cần**.

### 2.1 Một row có gì

```js
// index.html:2708-2714 — mọi row được viết ở đây và chỉ ở đây
{t, rt, team, teamName, event, playerFrom, playerTo, action, raw,
 grp, ord, pXY, rXY, gXY}
```

| Trường | Nghĩa | Cảnh báo |
|---|---|---|
| `team` | `'home'` \| `'away'` | = `state.team` lúc gõ ⇒ **một `grp` không bao giờ trải qua hai đội** |
| `pXY` | điểm chạm đầu (%) | có ở hầu hết event có dot |
| `rXY` | điểm nhận (%) | **chỉ rơi vào một row mỗi chuỗi** — xem 2.4 |
| `gXY` | điểm bóng qua vạch, hệ toạ độ **khung thành** | **chỉ 3 event** — xem 2.3 |
| `grp` | id chuỗi | `null` khi entry chỉ có **một** event |
| `ord` | vị trí trong chuỗi | có trên mọi row, **chưa màn hình nào đọc** |

### 2.2 `evKey` — và hai chỗ trong report.js đang bỏ quên nó

Tên event là **dữ liệu do người dùng gõ**, nên `shared.js` bắt mọi lookup đi qua `evKey`
(`shared.js:349`), hàm này hạ chữ thường + gấp hai lỗi chính tả đã lên production
(`take-on succes`, `gain possesion`). Từ điển đang chạy viết ném biên là **`throw-Ins`**,
chữ I hoa.

Hai chỗ trong `report.js` so sánh **thô**, không qua `evKey`:

```js
// report.js:1164-1166
const RP_FOULS=new Set(['foul','foul throw','handball foul']);
const evs=rows.filter(r=>r.team===team&&RP_FOULS.has(r.event)&&r.pXY);
// report.js:1222
const evs=team=>rows.filter(r=>r.team===team&&r.event===eventName&&r.pXY);
```

Hôm nay chưa ai gõ `Foul` viết hoa nên chưa hỏng. Nhưng yêu cầu #6 nói **"đảm bảo foul ở
đây là total foul"** — bảo đảm đó chỉ đúng nếu lookup đi qua `evKey`. §8.2 sửa hai dòng
này, và **chỉ hai dòng này**.

> `actionMapsPage()` (`report.js:1052`) đã làm đúng — `col[evKey(r.event)]` — kèm comment
> giải thích. Bản sửa chỉ là bắt hai hàm còn lại theo cùng quy tắc đã có trong file.

### 2.3 `gXY` chỉ có trên 3 event, và cả ba thuộc về NGƯỜI SÚT

```js
// index.html:1354
const GOAL_SPOT_EVENTS=new Set(['shot on target','goal','own goal']);
```

**Hệ quả cho trang Goalkeeper (ảnh 1):** không một event nào của thủ môn (`catch`,
`parry`, `save*`, `goal conceded`) mang `gXY`. Muốn vẽ *"thủ môn đội mình bị sút vào đâu
trong khung"* thì phải đọc **row của đội đối phương**:

| Nguồn | Nghĩa với thủ môn đội `T` | Ký hiệu trong khung |
|---|---|---|
| `O`.`shot on target` có `gXY` | cú sút bị **cản** | chấm **xanh** |
| `O`.`goal` có `gXY` | **bàn thua** | chấm **đỏ** |
| `T`.`own goal` có `gXY` | **cũng là bàn thua**, do người nhà | chấm đỏ, hình **vuông** |

> ⚠️ Đây sẽ là hàm **đầu tiên trong `report.js`** lọc `r.team !== team`. Mọi map hiện có
> trong file đều mở bằng `r.team===team`. Phải viết comment thật rõ, nếu không lần đọc
> code sau sẽ tưởng là bug và "sửa" nó.
>
> ⚠️ **`goalMarksV()` (`report.js:649`) KHÔNG dùng lại được.** Nó lọc
> `SHOT_KINDS.has(r.event)`, mà `SHOT_KINDS` (`shared.js:605`) **không chứa** `own goal` —
> một quả phản lưới *có* `gXY` nhưng bị bỏ qua. Trang Goalkeeper cần bộ lọc riêng
> (`gkFaced()`, §10.1). **Không sửa `goalMarksV`/`goalMarks`**: chúng đang phục vụ trang
> *Shots & Goals* của chính PDF này và tab Shooting.

### 2.4 ⚠️ Cái bẫy `TRANSFER_EVENTS` — và vì sao mũi tên phải vẽ từ row hệ quả

```js
// index.html:2463
const TRANSFER_EVENTS=new Set(['pass success','pass fail','cross success','cross fail','substitution']);
// index.html:2486-2489 — chỉ transfer event CUỐI trong nhóm nhận rXY
for(let i=named.length-1;i>=0;i--)if(TRANSFER_EVENTS.has(named[i].name)){ti=i;break;}
if(ti<0)ti=named.length-1;
```

**Không một event set piece nào là transfer event.** Nên:

| Cách tag | Row nào giữ `rXY` |
|---|---|
| `7 corner-kick 14 head goal` | **corner-kick** (nó là phím cuối nhóm) |
| `7 corner-kick cross-success 14 head goal` | **cross success** — corner-kick **không** |
| `7 corner-kick` (một mình) | **không ai**, và `grp` cũng `null` |
| `7 free-kick pass-success 9 pass-success 14` | **chỉ pass thứ hai** |

> **Quyết định thiết kế (§7.3, §7.4):** mũi tên trên map free-kick / corner được vẽ từ
> **row hệ quả** (`pass success`, `cross fail`, …) chứ **không** từ row set piece. Row hệ
> quả mang cả `pXY` (nơi đá) lẫn `rXY` (nơi bóng tới) khi nó là transfer cuối — đúng
> trường hợp thường gặp nhất. Hệ quả nào không có `rXY` (một cú sút, hoặc một pass giữa
> chuỗi) thì vẽ **một chấm ở `pXY`**, không vẽ mũi tên bịa ra. Bản đồ nói đúng những gì
> được tag, không hơn.

### 2.5 Chuỗi set piece: đếm cái gì được, cái gì không

`setPieceFold()` (`shared.js:370`) đã có sẵn, và nó nuôi bảng Stats *và* trang Data cả
mùa. Nó cho ta **miễn phí**, per-player, qua `computeStats`:

```
fkShotsOn, fkShotsOff, fkCrosses, fkCrossesComp, setPieceShots, setPieceGoals
```

Nó **không** cho ta:

| Cần cho | Vì sao không có |
|---|---|
| free-kick **passes** thành/bại | `setPieceFold` không đếm pass — không có counter `fkPasses` |
| **corner** dẫn tới gì | nó chỉ tách riêng `free-kick` (`fromFK`), corner gộp vào `setPieceShots` |
| **goal kick** thành/bại | như trên |
| ai **thực hiện** quả set piece | `setPieceFold` ghi công người **dứt điểm**, không phải người đá |

> **Quyết định:** ba thứ trên được tính **tại chỗ trong `report.js`**, bằng một hàm chỉ
> đọc (`spChains()`, §10.2). **Không thêm counter vào `newStat()`**: `newStat()` được cộng
> dồn cả mùa trên trang Data của channel (`client/assets/app.js`), nên thêm field là đổi
> hình dạng dữ liệu ở một nơi thiết kế này không được phép chạm. Xem §11.2.

### 2.6 `ord` cho phép hỏi "set piece có MỞ ĐẦU chuỗi không"

`setPieceFold` chỉ hỏi *"có mặt đâu đó trong chuỗi"* (`shared.js:377`). Một chuỗi mà quả
phạt góc bị gõ **sau** cú sút vẫn được tính. `spChains()` yêu cầu set piece là row có
`ord` **nhỏ nhất** trong các row set piece của chuỗi, và chỉ nhận các row có `ord` **lớn
hơn** nó làm hệ quả. Đây là điều `setPieceFold` không làm được, và là lý do §10.2 cần hàm
riêng thay vì tái dùng.

### 2.7 Khoảng cách bằng mét — đã có công thức, không phát minh lại

`passTypeData()` (`stats-view.js:749`, đã có trong `HELPER_NAMES`) quy đổi:

```js
const XM=105, YM=68;
const dxM=(bx-ax)/100*XM, dyM=(by-ay)/100*YM, dist=Math.hypot(dxM,dyM);
add(catD, dist>30?'Long Passes':dist>=15?'Medium Range Passes':'Short Passes', ok);
```

Ba dải **>30m / 15–30m / <15m** này khớp **chính xác** ba dòng `Long [> 30m] /
Medium [15 - 30m] / Short [< 15m]` ở ảnh 2. Bảng Distance ở §7.2 dùng đúng ngưỡng và
đúng hằng số, để hai màn hình không bao giờ nói hai con số khác nhau về cùng một đường
chuyền.

### 2.8 Cái payload KHÔNG có: ngày, giải, logo CLB

```js
// cloud-sync.js:535-539 — payload đóng băng lúc Submit Analysis
meta: { home, away, sport, homeTeamId, awayTeamId, matchId, matchCode }
```

Không có ngày đá, không có tên giải, không có ảnh logo CLB — dù bảng `matches` *có* các
cột đó (migration 0011, 0022, 0023, 0024) và `clubs` có `crest_text` (0013).

> **Hệ quả cho §5 (header):** header chỉ được phép mang **logo website** (SVG nội tuyến,
> luôn có), chữ **"Match Report"**, **title trang**, và **tên đội** (có trong `meta`).
> Thêm ngày hoặc logo CLB đòi đổi `buildReport()` trong `cloud-sync.js` — và **mọi báo cáo
> đã publish sẽ in ra ô trống**, vì payload của chúng đã đóng băng không có trường ấy.
> Đó là một dự án riêng, ngoài phạm vi. §14 Q3.

### 2.9 Hai thủ môn trong một trận

`gkShirts(lineups,team)` (`shared.js:746`) đọc `lu.xi` **và** duyệt `lineups.history`, nên
một đội thay người gác đền cho ra **hai** số áo. Trang Goalkeeper phải in **một hàng mỗi
người**, không cộng gộp. Bàn thua chia cho đúng người bằng `onPitchAt(lineups,team,t)`
(`shared.js:863`) tại thời điểm bàn thắng của đối phương.

Board không điền ô `pos:'GK'` ⇒ tập rỗng ⇒ rơi vào nhánh rỗng §6.5.

---

## 3. Nguyên tắc thiết kế, đọc ra từ chính `report.js`

Ba mục mới **phải** nói cùng ngôn ngữ với 20+ trang đang chạy. Đây không phải gợi ý phong
cách — đây là những gì file đã có và mắt người đọc đã quen.

| Quy tắc | Bằng chứng trong code | Ba mục mới tuân theo ở |
|---|---|---|
| Home tấn công **PHẢI**, away soi gương **TRÁI** | `crossMapSVG` `report.js:952`, `foulMapsPage` `report.js:1168` | §7.3, §7.4 |
| Map dựng đứng thì tấn công **LÊN** | `eventMapsPage` `report.js:1253`, `vUpArrowSVG` `report.js:381` | §6.3, §7.2 |
| Hình tròn = hiệp 1, hình vuông = hiệp 2 | `report.js:1246-1249` | mọi map mới |
| Xanh `#39d98a` = thành, đỏ `#f7506b` = bại | `crossMapSVG` `report.js:967` | §7.2, §7.3, §7.4 |
| Bên nào không có dữ liệu vẫn giữ **sân trống**, không bỏ trang | `report.js:1236` *"a side with no data keeps the empty pitch"* | §6.5, §7.5 |
| Bảng không có dữ liệu in **5 dòng gạch ngang**, không in bảng rỗng | `rankTable` `report.js:1023`, `eventMapsPage` `report.js:1234` | §7.2, §7.5 |
| Một chỉ số xuất hiện **một lần**, không lặp lại dưới dạng khác | `report.js:1303` *"the numbers appear ONCE here, not repeated as bars above"* | §6.2, §8.1 |
| Cột hai bên: map trái 292px, bảng phải | `.rp-sgwrap` / `.rp-sgleft` `report.js:254-256` | §6.1, §7.2 |
| Màu **literal**, không dùng CSS variable của app | `report.js:52-57` | mọi CSS mới |

---

## 4. Mục lục: trước và sau

### 4.1 Trước (`report.js:1396-1423`)

```
Match Timeline
Table of Contents
Lineups & Formation      · HOME · AWAY
Shots & Goals            · HOME · AWAY
Attacking                · Team Comparison · Player Stats
Distribution             · (9 phần)
Defensive                · Team Comparison · (các map) · Profile Radar · Player Stats
Discipline               · Foul Maps · Fouls Won · Offsides          ← BỎ
Goalkeeper & Discipline                                              ← BỎ
```

### 4.2 Sau

```
Match Timeline
Table of Contents
Lineups & Formation      · HOME · AWAY
Shots & Goals            · HOME · AWAY
Attacking                · Team Comparison · Player Stats
Distribution             · (9 phần, KHÔNG ĐỔI)
Defensive                · (KHÔNG ĐỔI)
Goalkeeper               · Team Comparison
                         · HOME                     ← ảnh 1
                         · AWAY                     ← ảnh 1
                         · Player Stats             ← 2 trang, mỗi đội một trang
Set Pieces               · Team Comparison
                         · Goal Kicks               ← ảnh 2, 2 trang
                         · Free-kicks               ← ảnh 3, 2 trang
                         · Corners                  ← ảnh 3, 2 trang
                         · Player Stats             ← 2 trang
Fouls                    · Team Comparison
                         · Foul Maps                ← giữ nguyên hình, đổi tiêu đề
                         · Fouls Won                ← giữ nguyên hình, đổi tiêu đề
                         · Offsides                 ← giữ nguyên hình, đổi tiêu đề
                         · Player Stats             ← 2 trang
```

### 4.3 `buildPages()` sau khi sửa

Bốn dòng cuối của mảng `body` (`report.js:1419-1422`) được thay bằng:

```js
    /* ---- Goalkeeper ---------------------------------------------------- */
    ...P('Goalkeeper','Team Comparison',gkComparisonPage()),
    ...P('Goalkeeper',HOME,gkSavesPage('home')),
    ...P('Goalkeeper',AWAY,gkSavesPage('away')),
    ...P('Goalkeeper','Player Stats',gkPlayerPages()),
    /* ---- Set Pieces ---------------------------------------------------- */
    ...P('Set Pieces','Team Comparison',setPieceComparisonPage()),
    ...P('Set Pieces','Goal Kicks',[goalKickPage('home'),goalKickPage('away')]),
    ...P('Set Pieces','Free-kicks',[spArrowPage('home','free-kick'),spArrowPage('away','free-kick')]),
    ...P('Set Pieces','Corners',[spArrowPage('home','corner-kick'),spArrowPage('away','corner-kick')]),
    ...P('Set Pieces','Player Stats',setPiecePlayerPages()),
    /* ---- Fouls --------------------------------------------------------- */
    ...P('Fouls','Team Comparison',foulComparisonPage()),
    ...P('Fouls','Foul Maps',foulMapsPage()),
    ...P('Fouls','Fouls Won',foulWonMapsPage()),
    ...P('Fouls','Offsides',offsideMapsPage()),
    ...P('Fouls','Player Stats',foulPlayerPages())
```

**Ghi chú về `sub`:**

- Hai trang map cùng một `sub` (ví dụ `'Goal Kicks'` cho cả home lẫn away) ⇒ `tocEntries`
  gộp thành **một** dòng mục lục, trỏ tới trang mở đầu. Đây là hành vi có sẵn
  (`report.js:1354-1362`), không phải cái gì mới.
- Hai trang player stats cũng vậy: một dòng `Player Stats`.
- Riêng trang Goalkeeper dùng **tên đội** làm `sub`, giống *Shots & Goals* và
  *Lineups & Formation* — vì hai trang đó khác nhau nhiều hơn là hai nửa của một hình.

**Ước lượng số trang:** bỏ 4, thêm 20 ⇒ **+16 trang**. Mục lục thêm ~14 dòng
(`TOC_H1`=31.5px, `TOC_H2`=21.5px ⇒ ~+330px), vượt `TOC_BUDGET=950` ⇒ **mục lục có thể
tăng từ 1 lên 2 trang**. `tocChunks()` (`report.js:1362`) đã xử lý sẵn và `contentsPages()`
đánh số lại đúng (`lead` + `n`) — không cần sửa gì, nhưng phải có test (§13.2).

---

## 5. Header mới trên đầu mọi trang

### 5.1 Vấn đề, và cách giải không đụng vào ngân sách trang

Hôm nay mỗi trang mở bằng:

```js
// report.js:297
const secTitle=t=>`<div class="rp-sec"><span class="rp-secbar"></span><span class="rp-sect">${t}</span></div>`;
```

Không logo, không chữ "Match Report". Yêu cầu #8 muốn cả ba.

**Cạm bẫy:** `.rp-sec` cao **50.1px** (đo được: hộp 35.1 + margin-bottom 15). Một header
hai dòng đặt vào chỗ đó cao **67.5px** — tức **mọi trang trong báo cáo mất 17px**. Mà
`CMP_FILL=840` (`report.js:341`), `TOC_BUDGET=950` (`report.js:1352`), `FIRST=25/CONT=33`
(`report.js:679`) và các mốc chia timeline **đều được chỉnh theo chiều cao đó**. Đổi
chiều cao header = đổi ngầm mọi trang trong file.

**Cách giải: header là một dải tràn viền (full-bleed), kéo lên nằm trong padding trên của
trang** — đúng nguyên tắc `.rp-foot` đã dùng ở đáy trang.

```css
.rp-head{display:flex;align-items:center;gap:11px;background:#f7f9fc;
  border-bottom:2px solid #e2e8f1;
  margin:-46px -50px 16px;padding:11px 50px 10px;box-sizing:border-box}
```

**Số đo thật (Chromium, `.rp-page` 794px, đo bằng `getBoundingClientRect`):**

| | Dải header nằm ở | Cao | Rộng | Nội dung trang bắt đầu ở y = |
|---|---|---|---|---|
| **Hôm nay** (`.rp-sec`) | y = 46 | 35.1px | 694px | **96.1px** |
| **Đề xuất** (`.rp-head`) | y = **0** | 51.4px | **794px** (tràn viền) | **65.4px** |

Header mới **trả lại ~31px cho mỗi trang** thay vì lấy đi. Nghĩa là:

- **Không một trang nào đang chạy có nguy cơ tràn thêm** — tất cả đều rộng rãi hơn trước.
- `CMP_FILL`, `TOC_BUDGET`, `FIRST`/`CONT`, các mốc timeline **giữ nguyên**. Chúng thành
  ra hơi thủ cựu (trang sẽ đầy ít hơn ~3%), và đó là hướng **an toàn**. Chỉnh chúng lên
  cho kín trang là việc *có thể làm sau*, không phải việc bản này làm. §14 Q4.
- `.rp-page{overflow:hidden}` cắt dải header đúng theo mép trang — không rò ra ngoài.

### 5.2 Markup

```js
/* Logo website — SVG NỘI TUYẾN, sao đúng từ client/app.html:19 và client/index.html:290.
   Không dùng <img>: html2canvas dựng PDF từ DOM, và một ảnh ngoài là một request nữa có
   thể hỏng, chậm, hoặc làm bẩn canvas. Chữ "N" bốn chấm này LÀ nhãn hiệu của site. */
const BRAND_SVG=`<svg width="16" height="16" viewBox="0 0 48 48" fill="#fff">`
  +`<path d="M13 39V11l22 28V11" fill="none" stroke="#fff" stroke-width="3.6" `
  +`stroke-linecap="round" stroke-linejoin="round"/>`
  +`<circle cx="13" cy="39" r="5.4"/><circle cx="13" cy="11" r="5.4"/>`
  +`<circle cx="35" cy="39" r="5.4"/><circle cx="35" cy="11" r="5.4"/></svg>`;

/* Tiêu đề được viết vào trang NGUYÊN MỘT KHỐI, không bao giờ tách quanh một thẻ: mục nào
   một trang thuộc về được đọc ngược ra từ markup này (mục lục đánh chỉ mục theo nó, và
   bộ test kiểm một trang có tên đúng danh mục nó vẽ), nên "Defensive — Tackles" phải
   sống sót đúng dạng chuỗi ký tự đó.  ← comment cũ ở report.js:294, VẪN ĐÚNG.

   `team` là tuỳ chọn: một trang nói về MỘT đội in tên đội bên phải. Mọi call site cũ
   truyền một tham số và không đổi một ký tự nào. */
const secTitle=(t,team)=>`<div class="rp-head"><span class="rp-logo">${BRAND_SVG}</span>`
  +`<span class="rp-htxt"><span class="rp-hkick">Match Report</span>`
  +`<span class="rp-htitle">${t}</span></span>`
  +(team?`<span class="rp-hteam" style="color:${TI(team)}"><em>${esc(TN(team))}</em>`
        +`<i class="rp-hchip" style="background:${TC(team)}"></i></span>`:'')
  +`</div>`;
```

> **Vì sao sửa `secTitle` chứ không thêm một hàm mới:** mọi builder trong file đã mở bằng
> `secTitle(...)`. Sửa tại đây là **một** chỗ sửa, và **mọi** trang tự động có header — kể
> cả 20 trang không thuộc phạm vi thiết kế này. Thêm hàm mới nghĩa là sửa ~25 call site
> và bỏ sót một chỗ là một trang không có logo.
>
> Chuỗi `${t}` vẫn nằm trọn trong một text node, nên mọi regex trong
> `tests/report-visuals.test.js` và `tests/stats-view.test.js` đọc tiêu đề vẫn khớp.

### 5.3 CSS mới (thêm vào `ensureCss()`, `report.js:109`)

```css
/* ---- page header: the site's mark, what this document is, and what this page is ----
   A full-bleed band pulled up into the page's top padding, for the same reason .rp-foot
   sits in the bottom one: every row budget in this file (CMP_FILL, TOC_BUDGET, the shot
   list's FIRST/CONT, the timeline chunks) is measured against the flow box, and a header
   that took height out of it would move all of them at once. Out of that box, it costs
   nothing — it in fact gives ~31px back. */
.rp-head{display:flex;align-items:center;gap:11px;background:#f7f9fc;
  border-bottom:2px solid #e2e8f1;margin:-46px -50px 16px;padding:11px 50px 10px;
  box-sizing:border-box}
.rp-logo{flex:none;width:28px;height:28px;border-radius:5px;background:#e03131;
  display:flex;align-items:center;justify-content:center}
.rp-htxt{flex:1;min-width:0;display:block}
.rp-hkick{display:block;font-size:8px;font-weight:700;letter-spacing:1.3px;
  text-transform:uppercase;color:#77839a;line-height:1.15}
.rp-htitle{display:block;font-size:16px;font-weight:800;color:#12385c;
  letter-spacing:-0.3px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}
.rp-hteam{flex:none;display:flex;align-items:center;gap:8px;font-size:12px;
  font-weight:800;max-width:250px}
.rp-hteam em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-hchip{flex:none;width:9px;height:24px;border-radius:3px}
```

`#e03131` là `--red` của site (`client/assets/site.css`), viết literal ở đây vì trang báo
cáo **không được** thừa kế biến CSS của app (`report.js:52`).

`.rp-sec`, `.rp-secbar`, `.rp-sect` **giữ nguyên trong stylesheet** dù không còn call
site: `tests/report-visuals.test.js:37` lôi `secTitle` ra chạy độc lập, và xoá CSS đi
không làm test đỏ nhưng cũng chẳng lợi gì. Xoá là việc dọn dẹp riêng, không gộp vào đây.

### 5.4 Hai trang không đi qua `secTitle`

| Trang | Hôm nay | Sau |
|---|---|---|
| Trang 1 | `.rp-mast` (`headerBlock()`, `report.js:413`), `margin:2px 0 22px` | thêm `secTitle(matchLine())` **trước** masthead; masthead đổi `margin-top` 2 → 0 |
| Mục lục | `.rp-toch` "Table of Contents" (`report.js:1383`) | thay bằng `secTitle('Table of Contents')`; `.rp-toch` giữ trong CSS |

Trang 1 vì thế mang tiêu đề `Curaçao 2 – 1 Saint Lucia` trên dải header và tỉ số lớn ở
masthead ngay dưới — hai lần cùng một thông tin. **Chấp nhận có chủ ý**: bìa của một báo
cáo được phép nhắc lại trận đấu, và quy tắc "một chỉ số một chỗ" (§3) nói về *chỉ số*,
không nói về *nhan đề*.

---

## 6. Mục **Goalkeeper**

### 6.1 Trang *Goalkeeper — Saves* (ảnh 1) — bố cục

Một trang cho mỗi đội, dùng lại nguyên bộ khung hai cột của *Shots & Goals*
(`.rp-sgwrap` / `.rp-sgleft` 292px / `.rp-sgright`, `report.js:254-256`):

```
┌──────────────────────────────────────────────────────────────────┐
│ [logo] Match Report                          Hajer U16   ▌       │  .rp-head
│        Goalkeeper — Saves                                        │
├──────────────────────────────────────────────────────────────────┤
│ Num.   Name                    Minutes  Save Rate  Goal Kick     │  .rp-gkrow
│  31    ZEYAD M. I. ALMUFTAH      90'     100.0%      100.0%      │  (một hàng mỗi GK)
├────────────────────────┬─────────────────────────────────────────┤
│ Event Map              │ Details                                 │
│  ▪ Catches  ▲ Parries  │   ╭───╮   Total            1            │
│  ● Conceded ○ Own Goals│   │100│   Catches          1            │
│  P Penalty Kicks       │   ╰───╯   Parries          0            │
│                        │  Save Rate Goals Conceded  0            │
│  ┌──────────────────┐  │           Own Goals        0            │
│  │   khung thành    │  │                                         │
│  └──────────────────┘  │ Event List                              │
│  ┌──────────────────┐  │  #  Num  Time  Opponent   Body Part     │
│  │  sân dựng đứng   │  │  1   77   01'   A. Alrakkad  Left Foot  │
│  │  PHÒNG NGỰ LÊN   │  │                                         │
│  └──────────────────┘  │                                         │
└────────────────────────┴─────────────────────────────────────────┘
```

### 6.2 Hàng thủ môn (`.rp-gkrow`)

Một hàng **mỗi số áo trong `gkShirts(lineups,team)`** (§2.9).

| Cột | Nguồn | Ghi chú |
|---|---|---|
| Num. | số áo | `pill(no,team)` — đã có, `report.js:300` |
| Name | `playerLabel(squadNames(lineups,team),no)` | rơi về `Player 31` nếu chưa đăng ký tên |
| Minutes Played | `playedMinutes(lineups,dur,team,rows)[no].min` + `'` | `null` ⇒ `–` |
| Save Rate (%) | `saves / (saves + conceded)` | xem dưới |
| Goal Kick Success Rate | `gkOk / gkAnswered` từ `spChains()` §10.2 | `–` khi chưa có quả nào **có hệ quả được tag** |

**`saves` cho một thủ môn** = `computeStats(rows,team)[no].saves` — bản **rộng** (`catch` +
`parry` + tên cũ `save`, `shared.js:262-263`). Đây là con số `gkPage()` hiện đang dùng
(`report.js:1310`, `h.saves`), nên giữ nó là **không đổi hành vi**.

> ⚠️ Bảng `PLAYER_CATS.goalkeeper` dùng định nghĩa **hẹp** (`catches+parries`,
> `shared.js:501`) và §9.1 in đúng định nghĩa hẹp đó ở trang Player Stats. Hai con số có
> thể khác nhau ở một trận tag bằng tên `save` cũ. **Đây là hai câu hỏi khác nhau, không
> phải mâu thuẫn** — nhưng phải nói ra trên trang, bằng một dòng chú thích 8px dưới bảng
> Details: *"Saves counts catch, parry and the retired `save` event."* Không sửa
> `PLAYER_CATS`; xem §11.2.

**`conceded` cho một thủ môn** = số row `goal` của đội đối phương (+ `own goal` của đội
mình) tại thời điểm `t` mà `onPitchAt(lineups,team,t).has(no)`. Đội chỉ dùng một thủ môn
thì con số này bằng `teamGoals(opp)` — đúng cái `gkPage()` in hôm nay. Lineup rỗng ⇒
`onPitchAt` trả tập rỗng ⇒ Save Rate in `–`, **không** in `0%` (một `0%` bịa ra là lời
nói dối trông giống bug).

### 6.3 Panel *Event Map* (cột trái)

**Hai hình chồng nhau, hai nguồn khác nhau — phải nói rõ trên trang.**

1. **Khung thành** (`goalMouthSVG`, `shared.js:680`) — vẽ `gkFaced(team)`, tức là cú sút
   **đội đối phương** dứt điểm trúng đích, cộng own goal của đội mình (§2.3). Mỗi chấm
   mang **số thứ tự theo thời gian** — cùng số với Event List bên phải.
   Xanh `#39d98a` = cản được · Đỏ `#d93a3f` = thủng lưới · Vuông = own goal.

2. **Sân dựng đứng** (`vPitchSVG`, `report.js:374`) — vẽ **event của chính thủ môn** có
   `pXY`: `catch`, `parry`, `goal conceded`, `own goal`, và `penalty kick` của đối phương.
   **Hướng: PHÒNG NGỰ LÊN** — khung thành đội mình ở **đỉnh** sân, ngược với mọi map tấn
   công khác trong file. Đây là điều bắt buộc phải chú thích, vì nó phá quy tắc §3.
   Chuẩn hoá: `flip = attackDir(team,half)==='right'` (đảo ngược so với `normXY`).

**Nối hai hình lại:** một `catch`/`parry` được gán số của cú sút gần nhất về **thời gian**
trong cửa sổ **±8 giây**; không có thì vẽ chấm trần, không số.

> Cách ghép này **là một heuristic**, và file đã có tiền lệ đúng dạng: `foulMapsPage()`
> ghép một quả phạm lỗi với chiếc thẻ của cùng cầu thủ trong ±90 giây (`report.js:1176`).
> Cửa sổ ±8s hẹp hơn nhiều vì cả hai row được tag **ở cùng một khoảnh khắc video**.
> Không có `grp` nào nối được hai đội (§2.1), nên đây là thứ chính xác nhất dữ liệu cho
> phép. Ghi vào comment, đừng giả vờ là một liên kết chắc chắn.

### 6.4 Panel *Details* + *Event List* (cột phải)

**Details** — vòng save rate (`gkArcSVG`, `report.js:1285`, **dùng lại nguyên hàm**) cộng
bảng 5 dòng, mỗi dòng có thanh màu bên trái như ảnh 1:

| Dòng | Nguồn |
|---|---|
| Total | `catches + parries + conceded + ownGoals` |
| Catches | `s.catches` |
| Parries | `s.parries` |
| Goals Conceded | `conceded` (§6.2) |
| Own Goals | `s.ownGoals` của đội mình |

**Event List** — **một dòng mỗi cú sút trúng đích phải đối mặt**, thứ tự thời gian:

| Cột | Nguồn |
|---|---|
| # | số thứ tự, khớp chấm trong khung |
| Num | `playerFrom` của row đối phương |
| Time | `minLbl(matchTime(r.t), eventHalf(r))` — đã có, `report.js:91` |
| Opponent | `playerLabel(squadNames(lineups,opp), no)` |
| Body Part | `shotBodyPart(rows,r)` (`shared.js:608`) — `–` khi không tag |

> Cột **Opponent** và **Body Part** đọc từ row của đội đối phương, nên **luôn đúng** —
> không phải suy ra qua cửa sổ ±8s. Đó là lý do Event List lấy cú sút làm đơn vị, không
> lấy pha cứu thua: cú sút mang đủ cả ba câu trả lời, pha cứu thua thì không.

Số dòng vượt trang: dùng đúng cơ chế `FIRST`/`CONT` của `shotsAndGoalsPages`
(`report.js:679`) — trang đầu 25 dòng, trang tiếp 33 dòng, vẽ trong `.rp-sgcont` 384px để
bảng không phình ra chiều rộng trang.

### 6.5 Trạng thái rỗng

| Tình huống | Trang in ra |
|---|---|
| Không có shirt nào `pos:'GK'` | hàng thủ môn thay bằng *"No keeper in the lineup"* (câu đã dùng ở `report.js:1312`), hai hình vẫn vẽ theo dữ liệu đội |
| Đội đối phương không có cú sút nào trúng đích | khung thành trống + Event List *"No shots on target faced."* |
| Không ai tag `catch`/`parry` | sân trống; Details in số 0 thật, **không** in `–` (một trận không có pha cứu thua là một phát biểu hợp lệ về trận đấu) |

**Trang này không bao giờ trả `null`.** Một đội không có gì để nói vẫn cần trang của mình
để đọc song song với đội kia — đúng quy tắc §3 dòng 5.

### 6.6 Trang *Goalkeeper — Team Comparison*

`sectionRows(3)` + `cmpRows(r,cmpFit(r.length))`, y hệt `distributionPage()`
(`report.js:755`). `TEAM_SECTIONS[3]` là `'Goalkeeper Stats'` (`shared.js:927`) với 6
dòng: Goals Conceded · Saves · Catches · Parries · Def. Line Support · Aerial Control.

> ⚠️ **Chỉ số 3, 4, 5 của `TEAM_SECTIONS` được nối thêm vào cuối mảng**, đúng như comment
> `shared.js:922-926` cảnh báo: `report.js` với tay lấy trang so sánh **theo VỊ TRÍ** —
> `sectionRows(0)`, `(1)`, `(2)`. Bản thiết kế này chỉ **đọc thêm** chỉ số 3/4/5, không
> chèn, không đổi thứ tự. `shared.js` không bị chạm.

---

## 7. Mục **Set Pieces**

### 7.1 Một hàm đọc chuỗi, ba trang dùng chung

Cả ba trang map dựa trên **một** hàm chỉ đọc, `spChains(team,kind)` (§10.2), trả về mọi
chuỗi mà một set piece loại `kind` **mở đầu** (§2.6), kèm các row hệ quả của nó.

Vì sao không tái dùng `setPieceFold()`: nó ghi công per-player, chỉ hỏi *"có mặt đâu đó
trong chuỗi"*, không tách corner khỏi goal kick, và không đếm pass (§2.5). Nó nuôi bảng
Stats **và** trang Data cả mùa — sửa nó là đổi số của cả mùa. `spChains()` là hàm mới,
**chỉ đọc**, sống trong `report.js`, không ai khác thấy.

### 7.2 Trang *Set Pieces — Goal Kicks* (ảnh 2)

Một trang mỗi đội. Bố cục hai cột `.rp-sgwrap`, và **hàng thủ môn của §6.2 lặp lại y
nguyên ở đầu trang** — đúng như ảnh 2, và đúng vì quả phát bóng là hành động của thủ môn.

**Cột trái — Event Map:** sân dựng đứng, **tấn công LÊN** (goal kick xuất phát từ vòng
5m50 đội nhà nên mũi tên chạy từ đáy lên — đó chính là hình đúng). Mỗi quả phát bóng là
một mũi tên `pXY → rXY` của **row hệ quả** (§2.4), xanh = thành, đỏ = bại. Không có hệ
quả được tag ⇒ chỉ một chấm ở điểm phát.

**Cột phải — Details:** bảng khoảng cách, dùng đúng ngưỡng và hằng số của `passTypeData`
(§2.7):

| Distance | Success Rate | Succeeded | Total |
|---|---|---|---|
| Long `[> 30m]` | `pc0(ok,n)` | `ok` | `n` |
| Medium `[15 - 30m]` | | | |
| Short `[< 15m]` | | | |
| **Total** | | | |

> **Định nghĩa "Total" — phải in ra trên trang, không để người đọc tự đoán:**
> `Total` ở bảng này = số quả phát bóng **có hệ quả được tag** (có `grp`, có row hệ quả
> mang `rXY`). Nó **nhỏ hơn hoặc bằng** `s.goalKicks` — con số bảng Player Stats in ra.
> Một dòng chú thích 8px dưới bảng nói đúng điều đó, kèm con số thô:
> *"N goal kicks tagged, M with a tagged outcome."* Nếu không, hai bảng trong cùng một
> mục sẽ in hai con số khác nhau cho cùng một thứ và trông như bug.

**Cột phải — Player Receiving Passes:** `Rank · Player · Count`, đếm `playerTo` của row hệ
quả **thành công**. Rỗng ⇒ 5 dòng gạch ngang, đúng kiểu `rankTable` (`report.js:1023`).

### 7.3 Trang *Set Pieces — Free-kicks* (ảnh 3)

Một trang mỗi đội, dùng lại **nguyên hình dạng** của `crossMapSVG()` (`report.js:948`):
sân nằm ngang, dải % gốc theo ba cột phía trên, dải % đích theo ba hàng bên phải, home
tấn công **PHẢI** / away soi gương **TRÁI**.

**Sáu lớp ký hiệu, đúng như yêu cầu #4:**

| Hệ quả trong chuỗi | Hình | Màu |
|---|---|---|
| `pass success` | mũi tên **liền** | xanh `#39d98a` |
| `pass fail` | mũi tên **liền** | đỏ `#f7506b` |
| `cross success` | mũi tên **đứt** | xanh |
| `cross fail` | mũi tên **đứt** | đỏ |
| `shot on target` (+ `goal`) | **tam giác đặc** ở `pXY` | xanh |
| `shot off target` | **tam giác rỗng** ở `pXY` | đỏ |

Màu theo **thành/bại** (quy tắc §3), hình theo **loại** — hai chiều thông tin trên một
hình, không màu nào phải gánh hai nghĩa. `<marker>` dùng lại đúng cơ chế
`orient="auto-start-reverse"` của `crossMapSVG` (`report.js:972`), một marker mỗi màu mỗi
đội (id phải khác nhau giữa hai đội, đúng như `okId`/`noId` đã làm).

> `goal` được vẽ chung với `shot on target` vì `EVENT_INC` đã tính `goal` là một cú sút
> trúng đích (`shared.js:192`). Đây là quy ước sẵn có của repo, không phải quyết định mới.

**Dải %:** cột trên = ba phần ba chiều dài sân, tính trên **điểm xuất phát**; hàng phải =
ba phần ba chiều rộng, tính trên **điểm đích** (chỉ những hệ quả có đích). Đúng công thức
`crossMapSVG` (`report.js:958-961`), không viết lại.

**Chú giải dưới map** ghi cả sáu ký hiệu, và một dòng nói `Free-kicks: N taken · M with a
tagged outcome`.

### 7.4 Trang *Set Pieces — Corners* (ảnh 3)

**Cùng một hàm, khác một tham số:** `spArrowPage(team,'corner-kick')`. Mọi thứ ở §7.3 áp
dụng nguyên vẹn.

Điểm xuất phát của quả phạt góc luôn ở góc sân — nghĩa là dải % **cột trên** sẽ luôn đọc
`0% / 0% / 100%` và không nói gì. Vẫn giữ, vì hai trang cạnh nhau phải đọc được như một
cặp, và dải % **hàng phải** (điểm đích) mới là câu trả lời thật: bóng vào cột gần, giữa,
hay cột xa.

### 7.5 Trạng thái rỗng, và khi nào bỏ trang

| Tình huống | Xử lý |
|---|---|
| Một đội không đá quả nào loại đó | sân trống + bảng gạch ngang; **trang vẫn in** |
| **Cả hai đội** không đá quả nào | `spArrowPage` trả `null` cho cả hai ⇒ **cả mục con biến mất** khỏi báo cáo và khỏi mục lục |
| Có quả nhưng không quả nào có hệ quả tag | sân chỉ có chấm, không mũi tên; bảng in `Total 0` + dòng chú thích con số thô |

Đây là đúng luật `crossMapsPage()` đang dùng (`report.js:979`): *"page skipped only when
NEITHER team crossed"*.

### 7.6 Trang *Set Pieces — Team Comparison*

`sectionRows(4)` — `TEAM_SECTIONS[4]` `'Set Piece Stats'` (`shared.js:937`): Corners ·
Free-kicks · Penalty Kicks · Throw-ins · Goal Kicks · Set Piece Shots · Set Piece Goals.

**Đây là chỗ nhận lại khối set piece của `gkPage()` cũ** (`report.js:1327-1329`) — không
mất chỉ số nào; ngược lại còn thêm hai dòng (Set Piece Shots / Goals) mà trang cũ không có.

---

## 8. Mục **Fouls**

### 8.1 Trang *Fouls — Team Comparison* — và món nợ thẻ phạt

`sectionRows(5)` — `TEAM_SECTIONS[5]` `'Fouls & Discipline'` (`shared.js:943`):

```
Total Fouls · Fouls · Handball Fouls · Foul Throws · Fouls Won
Yellow Cards · Red Cards · Offsides
```

> **Đây là chỗ trả món nợ ở §1.4.** `gkPage()` là nơi duy nhất in thẻ vàng/đỏ trong PDF.
> `TEAM_SECTIONS[5]` có cả hai dòng đó, đọc qua `computeStats` → `cardFold` →
> `classifyCards` — **cùng một cách đếm** hộp thẻ cũ dùng (`cardCounts`, `report.js:721`,
> cũng gọi `classifyCards`). Nên con số **không đổi**, chỉ đổi chỗ in. Và
> `PLAYER_CATS.fouls` in thẻ **per-player** ở §9.1, thứ báo cáo cũ chưa từng có.
>
> Kiểm chứng bắt buộc: một test so *"tổng thẻ vàng ở trang Fouls — Team Comparison"* với
> *"tổng cột Yellow ở trang Fouls — Player Stats"* (§13.2).

Bảng này còn tách rõ **Total Fouls = Fouls + Handball Fouls + Foul Throws**, in cả bốn
dòng cạnh nhau — chính là điều yêu cầu #6 đòi hỏi, và trang `gkPage()` cũ chỉ in một dòng
`Fouls` gộp.

### 8.2 Ba trang map — giữ hình, sửa hai thứ

**Giữ nguyên** `foulMapsPage()` (`report.js:1165`), `foulWonMapsPage()` và
`offsideMapsPage()` (`report.js:1274-1275`). Không đụng vào một pixel nào của hình.

Đúng **hai** thay đổi:

**(a) Đổi tiêu đề** — `Discipline — …` → `Fouls — …`:

```js
const body=secTitle('Fouls — Foul Maps')+card('home')+card('away')      // report.js:1210
const offsideMapsPage=()=>eventMapsPage('offside','Fouls — Offsides');   // report.js:1274
const foulWonMapsPage=()=>eventMapsPage('foul won','Fouls — Fouls Won'); // report.js:1275
```

**(b) Cho lookup đi qua `evKey`** (§2.2) — ba dòng:

```js
// report.js:1166
const evs=rows.filter(r=>r.team===team&&RP_FOULS.has(evKey(r.event))&&r.pXY);
// report.js:1173 — hai tên thẻ cũng đang so thô
&&(evKey(c.event)==='yellow card'||evKey(c.event)==='red card')
// report.js:1222 + 1226
const want=evKey(eventName);  …  r=>evKey(r.event)===want
```

`RP_FOULS` đã chứa đủ ba tên (`'foul'`, `'foul throw'`, `'handball foul'`,
`report.js:1164`) nên **"total foul" đã đúng từ trước**; bản sửa chỉ làm nó *bảo đảm* thay
vì *tình cờ đúng*.

> Đây là **sửa lỗi**, không phải thêm tính năng, và nó nằm gọn trong phạm vi yêu cầu #6.
> Nếu người duyệt muốn để nguyên (§14 Q2), bỏ (b) đi và mọi thứ khác vẫn chạy — chỉ là
> câu "đảm bảo total foul" không còn được bảo đảm.

---

## 9. Trang **Player Stats** — một trang mỗi đội, và bản sửa kích cỡ

### 9.1 Cột của ba bảng mới — hai bảng đọc thẳng `PLAYER_CATS`, một bảng rút lại

`shared.js` **đã có sẵn** ba tập cột đúng tên ba mục (`shared.js:500, 526, 539`):
`PLAYER_CATS.goalkeeper` (16 cột), `.setPieces` (11 cột), `.fouls` (8 cột). Đây cũng chính
là ba tab bảng Stats và ba tab trang Data của channel — nên **con số trong PDF và con số
trên màn hình không thể lệch nhau**.

Nhưng nhãn của chúng viết cho màn hình rộng, không cho A4. Đo thật (§9.3) cho thấy
`PLAYER_CATS.goalkeeper` in nguyên nhãn cần **1411px** trên một khung **694px** — bất khả.

**Giải pháp: một bảng ánh xạ nhãn, chỉ dùng trong `report.js`.** Cột nào không có trong
bảng thì giữ nguyên nhãn gốc.

```js
/* Nhãn cột cho khổ A4. Chỉ là NHÃN — số vẫn do PLAYER_CATS tính, nên bảng này không thể
   làm lệch một con số nào. Một cột thêm vào PLAYER_CATS mà quên thêm vào đây vẫn in ra,
   dưới tên gốc của nó; nó chỉ xấu, không sai. */
const RPT_ABBR={
  'Save Standing':'Stand',            'Save Collapse':'Collapse',
  'Save Diving':'Diving',             'Save Kneeling':'Kneel',
  'Save Overhead':'Overhd',
  'Def. Line Support Success':'DLS ✓','Def. Line Support Fail':'DLS ✗',
  'Def. Line Support %':'DLS %',
  'Aerial Control Success':'AC ✓',    'Aerial Control Fail':'AC ✗',
  'Aerial Control %':'AC %',
  'Goals Conceded':'Conceded',
  'Freekicks':'FK',                   'Freekicks: Shots Off Target':'FK Sh Off',
  'Freekicks: Shots On Target':'FK Sh On',
  'Freekicks: Crosses':'FK Cross',    'Freekicks: Crosses Succeeded':'FK Cr ✓',
  'Penalty Kicks':'Pens',             'Throw-Ins':'Throw-in',
  'Goal Kicks':'Goal Kick',
  'Set Piece Shot':'SP Shots',        'Set Piece Goal':'SP Goals',
  'Handball Foul':'Handball',         'Yellow Cards':'Yellow',
  'Red Cards':'Red'
};
```

**Số đo, mọi bảng ở khổ 694px:**

| Bảng | Số cột | Chiều rộng nhãn cần | Cao `<thead>` | Kết luận |
|---|---|---|---|---|
| Goalkeeper — nhãn gốc | 18 | **1411px** | 56.5px (4 dòng) | bất khả |
| Goalkeeper — sau `RPT_ABBR` | 16 | **657px** | **24.6px (1 dòng)** | ✅ vừa |
| Set Pieces — nhãn gốc | 14 | **1128px** | 45.9px | bất khả |
| Set Pieces — sau `RPT_ABBR` | 14 | **661px** | **24.6px (1 dòng)** | ✅ vừa |
| Fouls — nhãn gốc | 11 | **557px** | **24.6px (1 dòng)** | ✅ vừa, không cần rút gọn |

*(Đo bằng `getBoundingClientRect` trên Chromium, font `"Segoe UI"…` 8.5px/700/uppercase/
letter-spacing 0.4px, cộng padding ngang 8px mỗi ô — tức đúng CSS `report.js:185-188`.)*

**Hai trong ba bảng dùng `PLAYER_CATS` NGUYÊN VẸN, chỉ đổi nhãn:**

| Bảng | Cột | Quan hệ với `PLAYER_CATS` |
|---|---|---|
| Set Pieces | 11 | **nguyên vẹn** `PLAYER_CATS.setPieces`, chỉ qua `RPT_ABBR` |
| Fouls | 8 | **nguyên vẹn** `PLAYER_CATS.fouls`, không cần rút gọn |
| Goalkeeper | 16 → **13** | **rút lại**, xem dưới |

**Vì sao Goalkeeper phải rút lại.** 16 cột của `PLAYER_CATS.goalkeeper` gồm ba bộ ba
`Success / Fail / %` — mà `Fail` là **phần dư của tổng** (`shared.js:510` nói đúng thế:
*"the fail side is the remainder of the total, never a third counter of its own"*). In cả
ba trên A4 là in một con số hai lần. `report.js` định nghĩa lại 13 cột:

```
Saves · Catch · Parry · Stand · Collapse · Diving · Kneel · Overhd ·
DLS · DLS % · Aer Ctrl · AC % · Conceded
```

`DLS` in `won/total` bằng `frac()` (đã có, `report.js:95`) thay cho cặp Success/Fail — đúng
cách `PLAYER_CATS.defensive` in Aerial / Physical / Loose ở bảng Defensive **hôm nay**.
Không mất thông tin: tổng và phần thắng quyết định phần thua.

> ⚠️ Đây là bảng **duy nhất** trong ba bảng mới không đọc `PLAYER_CATS` nguyên vẹn, nên nó
> là bảng duy nhất **có thể** lệch với tab Goalkeeper của bảng Stats. Cả 13 cột đều đọc
> đúng những counter `PLAYER_CATS.goalkeeper` đọc (`s.catches`, `s.defLineSupportsWon`,
> `s.defLineSupports`, …) — không counter mới, không phép tính mới. §13.3 khoá điều đó
> bằng một test đối chiếu từng cặp.

### 9.2 Một trang mỗi đội

```js
/* Yêu cầu: "1 trang player stats với mỗi đội". Khác playerStatPages() (report.js:715),
   hàm này KHÔNG bao giờ nhồi hai đội lên một trang. Ba mục mới dùng nó; ba mục cũ
   (Attacking / Distribution / Defensive) vẫn dùng playerStatPages() và không đổi hành vi
   một dòng nào. */
function teamPlayerPages(title,cols){ … }   // → [trang home, trang away] (+ trang tiếp nếu tràn)
```

`cols` là một mảng `PLAYER_CATS`; hàm tự lấy nhãn qua `RPT_ABBR` và gọi `fn(stat)` cho
từng ô. Cắt trang khi một đội có nhiều hơn **26 dòng** (đo: `<thead>` 24.6px + 26 × 27px +
header 65px = 792px, còn dư trong 1031px).

**Ba mục cũ giữ nguyên `playerStatPages()`.** Người dùng không yêu cầu đổi chúng, và đổi
là thêm ~6 trang vào một báo cáo đã dài. §14 Q1.

### 9.3 Bản sửa kích cỡ — chẩn đoán bằng số

Ảnh 6 là trang *Defensive — Player Stats*. Hai nhãn bị bẻ dòng: **`TACKLE %`** và
**`T-ON CON`**. Nguyên nhân đo được:

```
table.rpt dùng auto layout + width:100%. Khung 694px.
Tổng chiều rộng "một dòng" của 16 nhãn                        = 674.2px   ✅ vừa
NHƯNG .rpt td.rp-pl có max-width:96px (report.js:190), và ô
thân cột Player đòi tới 96px thay vì 40.7px của nhãn nó
  ⇒ tổng thực cần = 674.2 − 40.7 + 96                          = 729.5px  ❌ thiếu 35.5px
Trình duyệt lấy phần thiếu ở HAI cột có nhãn dài nhất so với số:
  "Tackle %"  cần 50.8px, được 43.7px  → bẻ 2 dòng
  "T-on Con"  cần 53.5px, được 35.9px  → bẻ 2 dòng
  ⇒ <thead> cao 35.3px thay vì 24.6px, và nhãn đọc ra như bị cắt
```

**Bản sửa — bốn dòng CSS, đã đo là đủ:**

```css
/* Wide player tables: a header is a label, not a paragraph. Auto layout was taking the
   shortfall out of the two longest labels and wrapping them, which reads as a clipped
   title. nowrap makes the label the column's minimum; the 2px trimmed off each cell's
   padding and 16px off the name column is where the room comes from. Measured: the
   Defensive table's <thead> drops 35.3px -> 24.6px with zero horizontal overflow. */
.rpt th{white-space:nowrap;letter-spacing:0.15px;padding-left:3px;padding-right:3px}
.rpt td{padding-left:3px;padding-right:3px}
.rpt td.rp-pl{max-width:80px}
```

**Kết quả đo sau khi sửa** (bảng Defensive, 16 cột, khổ 694px):

| | Trước | Sau |
|---|---|---|
| `<thead>` | 35.3px (2 dòng) | **24.6px (1 dòng)** |
| Chiều rộng bảng | 694px | **694px** |
| Tràn ngang | 0 | **0** |
| `Tackle %` | 43.7px, bẻ dòng | **49px, một dòng** |
| `T-on Con` | 35.9px, bẻ dòng | **52px, một dòng** |

Mọi cột khác nhận đủ chỗ; không nhãn nào bẻ dòng nữa.

> ⚠️ Ba selector này chạm **mọi** `table.rpt` trong PDF — kể cả bảng Event List
> (`rpt-el`), bảng Pass Types, và các `rankTable`. Tác động là **cùng chiều với mọi bảng**:
> nhãn không bẻ dòng, ô hẹp hơn 2px. Không bảng nào đang phụ thuộc vào việc nhãn *có* bẻ
> dòng. §13.2 khoá điều này bằng một test đo `scrollWidth === clientWidth` trên mọi bảng
> của mọi trang.

---

## 10. Chi tiết kỹ thuật

### 10.1 Hàm mới — Goalkeeper (5 hàm, tất cả trong `Stats/report.js`)

```js
/* Những cú sút trúng đích mà thủ môn ĐỘI NÀY phải đối mặt, kèm vị trí trong khung thành.
   ⚠️ Hàm DUY NHẤT trong file lọc r.team !== team — mọi map khác lọc r.team === team. Xem
   §2.3 trước khi "sửa" nó. goalMarksV() KHÔNG thay được: SHOT_KINDS không chứa 'own goal',
   nên một quả phản lưới có gXY vẫn bị nó bỏ qua. */
function gkFaced(team){ /* → [{idx,t,x,y,color,square,no,conceded}] theo thứ tự thời gian */ }

/* Một số áo GK, và mọi thứ hàng đầu trang cần về anh ta. `conceded` chia theo onPitchAt(),
   nên một trận hai thủ môn cho ra hai hàng và hai con số khác nhau. */
function gkRow(team,no){ /* → {no,name,min,saves,conceded,rate,gkOk,gkTot} */ }

function gkSavesPage(team){}       // trang ảnh 1 — không bao giờ trả null (§6.5)
function gkComparisonPage(){}      // sectionRows(3) + cmpRows

/* 13 cột cho khổ A4 — bộ DUY NHẤT không đọc PLAYER_CATS nguyên vẹn (§9.1). Mỗi fn đọc
   đúng những counter PLAYER_CATS.goalkeeper đọc; ba cặp Success/Fail gộp thành frac(),
   vì Fail là phần dư của tổng (shared.js:511) và in cả ba là in một số hai lần. */
const RPT_GK_COLS=[
  ['Saves',   s=>s.catches+s.parries],            // định nghĩa HẸP, khớp PLAYER_CATS
  ['Catch',   s=>s.catches],          ['Parry',    s=>s.parries],
  ['Stand',   s=>s.saveStanding],     ['Collapse', s=>s.saveCollapse],
  ['Diving',  s=>s.saveDiving],       ['Kneel',    s=>s.saveKneeling],
  ['Overhd',  s=>s.saveOverhead],
  ['DLS',     s=>frac(s.defLineSupportsWon,s.defLineSupports)],
  ['DLS %',   s=>pc0(s.defLineSupportsWon,s.defLineSupports)],
  ['Aer Ctrl',s=>frac(s.aerialControlsWon,s.aerialControls)],
  ['AC %',    s=>pc0(s.aerialControlsWon,s.aerialControls)],
  ['Conceded',s=>s.goalsConceded]                 // con số TAG TAY, xem shared.js:522
];
const gkPlayerPages=()=>teamPlayerPages('Goalkeeper — Player Stats',RPT_GK_COLS);
```

> Cột `Saves` ở bảng này dùng định nghĩa **hẹp** (`catches+parries`), khớp
> `PLAYER_CATS.goalkeeper`. Hàng thủ môn ở §6.2 dùng định nghĩa **rộng** (`s.saves`). Hai
> con số, hai câu hỏi — và §6.2 in một dòng chú thích nói ra điều đó. Đây là **giữ nguyên**
> hành vi đang chạy ở cả hai chỗ, không phải một mâu thuẫn mới.

### 10.2 Hàm mới — Set Pieces (4 hàm)

```js
/* Chuỗi set piece của một đội, gán theo `ord`. CHỈ ĐỌC — không đụng shared.js.
   Vì sao không dùng setPieceFold(): nó ghi công per-player, chỉ hỏi "set piece có mặt đâu
   đó trong chuỗi", không tách corner khỏi goal kick, và không đếm pass (§2.5). Và nó nuôi
   bảng Stats lẫn trang Data cả mùa — sửa nó là đổi số của cả mùa.

   Một set piece tag một mình có grp === null và KHÔNG có chuỗi. Nó vẫn được đếm ở `taken`,
   nhưng không bao giờ ở `answered` — khoảng cách giữa hai con số ấy chính là thông tin, và
   §7.2 in cả hai. */
function spChains(team,kind){
  /* → {taken:Number, chains:[{sp:row, out:[row,…]}]}   out = row có ord > ord(sp) */
}

/* Điểm đến của một row hệ quả, theo đúng thứ tự ưu tiên ở §2.4:
     1. rXY của chính nó  (chỉ có khi nó là transfer CUỐI trong nhóm)
     2. không có → null, và người gọi vẽ một chấm chứ không bịa ra mũi tên */
const spEnd=r=>r.rXY||null;

function goalKickPage(team){}          // trang ảnh 2
function spArrowPage(team,kind){}      // trang ảnh 3 — dùng cho 'free-kick' và 'corner-kick'
function setPieceComparisonPage(){}    // sectionRows(4)
const setPiecePlayerPages=()=>teamPlayerPages('Set Pieces — Player Stats',PLAYER_CATS.setPieces);
```

### 10.3 Hàm mới — Fouls (2 hàm)

```js
function foulComparisonPage(){}        // sectionRows(5) — nơi thẻ vàng/đỏ được in lại (§8.1)
const foulPlayerPages=()=>teamPlayerPages('Fouls — Player Stats',PLAYER_CATS.fouls);
```

### 10.4 Hàm mới — dùng chung (2 hàm + 1 hằng)

```js
const RPT_ABBR={…};                    // §9.1
function teamPlayerPages(title,cols){} // §9.2 — một trang mỗi đội
```

### 10.5 Hàm bị xoá

| Xoá | Vì sao an toàn |
|---|---|
| `gkPage()` (`report.js:1296-1349`) | mọi con số của nó chuyển sang §6.6 / §7.6 / §8.1, không mất chỉ số nào |
| `GK_FIT` (`report.js:1295`) | chỉ `gkPage()` dùng |
| `gkNo()` (`report.js:1278`) | thay bằng `gkShirts()` — trả **mọi** thủ môn, không chỉ một |

**Giữ lại:** `gkArcSVG()` (`report.js:1285`) — §6.4 dùng lại nguyên vẹn.
`cardCounts()` (`report.js:721`) — giữ, dù `gkPage()` là call site duy nhất hôm nay: nó
là cách đếm thẻ đúng (qua `classifyCards`) và §13.2 dùng nó để đối chiếu.

### 10.6 CSS mới

| Nhóm | Selector | Dùng ở |
|---|---|---|
| Header | `.rp-head .rp-logo .rp-htxt .rp-hkick .rp-htitle .rp-hteam .rp-hchip` | §5.3 |
| Hàng thủ môn | `.rp-gkrow .rp-gkrow-h .rp-gkrow-c` | §6.2 |
| Bảng Details | `.rp-dtl .rp-dtl-bar` | §6.4 |
| Sửa bảng | 3 dòng ở `.rpt th` / `.rpt td` / `.rpt td.rp-pl` | §9.3 |

Tất cả thêm vào `ensureCss()` (`report.js:109`), màu **literal**, không biến CSS.

---

## 11. An toàn hồi quy — cái gì **không** được đụng, và vì sao

> Mục này trả lời trực tiếp: *"đảm bảo không xảy ra bug ở các tab khác"* và *"không thay
> đổi tính năng khác khi chưa được cho phép"*.

### 11.1 `Stats/stats-view.js` — KHÔNG ĐỤNG

Không thêm/bớt/đổi thứ tự `HELPERS` (`stats-view.js:2478`). `report.js` bind chúng trong
`sync()`; một tên biến mất là `TypeError` lúc bấm ⭳ PDF — trên **cả** trang Stats **lẫn**
channel. Mọi thứ thiết kế này cần đã là global của `shared.js` (§1.2).

Bốn tab Dashboard, sáu tab bảng Stats, tab Film, tab Overall: `report.js` không được gọi
từ đó và không gọi vào đó. Không có đường nào để thay đổi ở đây rò sang.

### 11.2 `shared.js` — KHÔNG ĐỤNG

Sáu cám dỗ, không nhận cái nào:

| Cám dỗ | Vì sao KHÔNG |
|---|---|
| Thêm counter `fkPasses` / `ckShots` vào `newStat()` | `newStat()` được **cộng dồn cả mùa** trên trang Data của channel. Thêm field là đổi hình dạng dữ liệu ở một nơi ngoài phạm vi. Đếm tại chỗ trong `report.js` (§2.5). |
| Thêm `own goal` vào `SHOT_KINDS` | `SHOT_KINDS` chi phối `totalShots`, `shotList`, `goalMarks`, donut Shooting **và** trang *Shots & Goals* của chính PDF này. Một quả phản lưới sẽ thành cú sút của đội đưa bóng vào lưới nhà. **Phá dữ liệu.** |
| Sửa `goalMarks()` cho nhận own goal | Tab Shooting + PDF đang dùng. §6.3 có bộ lọc riêng. |
| Sửa `setPieceFold()` để dùng `ord` | Nó nuôi bảng Stats **và** trang Data cả mùa. `spChains()` là hàm mới, chỉ đọc. |
| Đổi `PLAYER_CATS.goalkeeper.Saves` sang `s.saves` | Định nghĩa hẹp là cố ý (`shared.js:490-497`). §6.2 chọn bản rộng cho hàng thủ môn và **nói ra** bằng chú thích, chứ không đổi bảng. |
| Chèn section mới vào giữa `TEAM_SECTIONS` | `report.js` lấy trang so sánh **theo vị trí** — `sectionRows(0/1/2)`. Comment `shared.js:922-926` cảnh báo đúng điều này. Chỉ **đọc thêm** 3/4/5. |

### 11.3 `index.html` (app tag) — KHÔNG ĐỤNG

App tag giữ **bản sao riêng** của engine thống kê và **không nạp `shared.js`**
(`docs/renaming-a-tagged-event`). Thiết kế này không thêm event, không đổi tên event,
không đổi counter — nên không có gì cần nhân đôi sang đó. Tab Stats trong app tag không
đổi một con số nào.

### 11.4 `client/assets/app.js` — chỉ đụng **một số phiên bản**

Đúng một dòng: `report.js?v=37` → `v=38` (`app.js:1907`). Không đụng `TD_TABS`
(`app.js:608`), không đụng `tabsFor`, không đụng route, không đụng trang Data, không đụng
Film. Đó là **số phiên bản, không phải hành vi** — ngoại lệ duy nhất.

### 11.5 Schema payload — KHÔNG ĐỤNG

`cloud-sync.js buildReport()` và `PTStats.schema=1` giữ nguyên. Mọi báo cáo **đã publish**
đọc được bằng code mới, và code mới không đòi trường nào payload cũ không có. Đây là lý do
§2.8 từ chối đưa ngày/logo CLB vào header.

### 11.6 Deploy whitelist — không cần đụng

Không tạo file **mới**. `Stats/report.js` đã có trong danh sách `cp` của
`.github/workflows/deploy.yml:75`. *(Nếu sau này tách CSS báo cáo ra file riêng thì phải
thêm — xem `memory/deploy-whitelist-gotcha`.)*

### 11.7 Thứ **không** đổi trong PDF

20+ trang hiện có — Timeline, Lineups & Formation, Shots & Goals, Attacking, toàn bộ
Distribution, toàn bộ Defensive — **giữ nguyên nội dung và bố cục**. Chúng chỉ nhận **hai**
thay đổi, cả hai đều là cải thiện đo được:

1. Header mới (§5) — thêm ~31px chỗ trống mỗi trang, không lấy đi.
2. Bảng `.rpt` không bẻ nhãn nữa (§9.3) — `<thead>` thấp hơn 10.7px.

---

## 12. Cache-bust — **hai** chỗ, bỏ sót một là user cũ chạy code cũ

```
Stats/index.html:76        report.js?v=37  → v=38
client/assets/app.js:1907  report.js?v=37  → v=38
```

Và `tests/asset-versions.json` giữ `{v, sha256}` cho từng file — sửa file mà không bump
`v` thì sha lệch và `tests/asset-versions.test.js` đỏ, kèm câu nói rõ phải sửa trang nào.
Regen bằng:

```bash
node tests/asset-versions.test.js --update
```

> Site này **không có build step**. `?v=` là thứ duy nhất bảo trình duyệt tải lại. Chuyện
> "sửa file, bump một chỗ, quên chỗ kia" đã xảy ra **hai lần** — comment đầu
> `tests/asset-versions.test.js` kể lại. Để cái test đó bắt.

`shared.js`, `stats-view.js`, `stats-view.css` **không đổi** ⇒ chín số `?v=` của chúng
**không** được động vào. Xem `memory/shared-js-cache-bust`.

---

## 13. Test — cái nào đỏ, và test mới nào phải viết

### 13.1 Bốn chỗ phải kiểm — một chỗ chắc chắn đỏ

| Test | Vì sao đỏ | Sửa |
|---|---|---|
| `tests/asset-versions.test.js` | sha của `report.js` đổi, `v` chưa đổi | bump 2 chỗ + `--update` |
| `tests/stats-view.test.js:337` — `report.js?v=` ≥ 30 | vẫn xanh (38 > 30) | không phải sửa |
| `tests/stats-view.test.js:228` — *"a mounted report builds every page"* | `ok(pages.length>=20)` — vẫn xanh, nhưng payload test chỉ có 3 row nên các trang mới sẽ rơi vào nhánh rỗng | **mở rộng payload** để phủ nhánh mới (§13.2), không hạ ngưỡng |
| `tests/report-visuals.test.js:37` | `grabConst('secTitle')` — `secTitle` thành arrow hai tham số, viết trên nhiều dòng | **vẫn xanh**, có điều kiện — xem dưới |

> **`grabConst` đọc được `secTitle` mới, với một ràng buộc.** Nó khớp
> `/(?:^|\n)[ \t]*(?:const|let) secTitle\s*=/` rồi quét tới dấu `;` đầu tiên ở **depth 0**
> (`tests/harness.js:63-70`). Số dòng không quan trọng; dấu ngoặc phải cân, và `skipQuoted`
> (`harness.js:26`) nhảy từ backtick mở tới backtick đóng **mà không phân tích `${…}`**.
>
> ⇒ **Ràng buộc bắt buộc: không được có template literal lồng trong `${…}` của `secTitle`.**
> Bản đề xuất ở §5.2 không có — mọi `${…}` chỉ chứa tên biến hoặc một lời gọi hàm. Giữ
> đúng thế.
>
> ⚠️ Điểm mù đã biết: *"unbalanced source while scanning"* nghĩa là một regex literal có
> dấu nháy bên trong, **không** phải một chỗ sửa hỏng. Xem
> `memory/grabconst-regex-blindspot`. `secTitle` mới không chứa regex nào.

### 13.2 Test mới phải viết — `tests/report-sections.test.js`

Dùng đúng khuôn `makeReport()` của `tests/report-visuals.test.js` (sandbox + stub cho
`vPitchSVG`/`hPitchSVG`/`dirArrowSVG`), vì file này về **con số**, không về SVG.

**Nhóm A — cấu trúc**

1. `Discipline` và `Goalkeeper & Discipline` **không còn** trong bất kỳ tiêu đề trang nào.
2. Ba `sec` mới có mặt, đúng thứ tự: `Goalkeeper` → `Set Pieces` → `Fouls`.
3. Mỗi mục có **đúng hai** trang `Player Stats`, và trang 1 mang tên home, trang 2 mang tên
   away — không bao giờ hai đội trên một trang.
4. `tocEntries()` gộp hai trang cùng `sub` thành một dòng; mục lục hai trang vẫn đánh số
   đúng (dựng 40 entry giả và kiểm `contentsPages` với `lead`).

**Nhóm B — không mất chỉ số** *(đây là nhóm quan trọng nhất)*

5. Tổng thẻ vàng ở `Fouls — Team Comparison` **=** tổng cột `Yellow` ở
   `Fouls — Player Stats` **=** `cardCounts()` cộng lại. (Món nợ §8.1.)
6. `Total Fouls` = `Fouls` + `Handball` + `Foul Throw`, trên cả hai đội.
7. Mọi dòng `gkPage()` cũ in ra đều tìm thấy chỗ mới: Saves/Conceded/Catches/Parries ở
   `Goalkeeper — Team Comparison`, 5 loại set piece ở `Set Pieces — Team Comparison`,
   Fouls/Fouls Won/Offsides + thẻ ở `Fouls — Team Comparison`.

**Nhóm C — dữ liệu**

8. `gkFaced()` đọc **đội đối phương**: tag một `shot on target` có `gXY` cho away ⇒ nó xuất
   hiện ở trang Goalkeeper của **home**, không phải của away.
9. `own goal` của home xuất hiện ở khung thành của **home** (bàn thua), hình vuông.
10. `spChains()` bỏ chuỗi mà set piece **không** mở đầu (`ord` lớn hơn cú sút).
11. Một set piece tag một mình (`grp:null`) đếm vào `taken`, không đếm vào `answered`.
12. Mũi tên chỉ vẽ khi row hệ quả **có** `rXY`; không có thì chỉ ra một chấm.
13. Ba dải khoảng cách goal kick khớp ngưỡng của `passTypeData` (30m / 15m) trên cùng bộ
    toạ độ.
14. Map foul tìm thấy `Foul` viết hoa, `Handball Foul` viết hoa (bản sửa `evKey`, §8.2).

**Nhóm D — khổ trang** *(cái `overflow:hidden` đang giấu đi)*

15. Với một payload **đầy** (2 × 23 cầu thủ, 400 row), **mọi** trang phải có
    `scrollHeight === clientHeight`. Đây là test duy nhất bắt được lỗi cắt trang, vì
    `.rp-page{overflow:hidden}` không báo gì.
16. Mọi `table.rpt` phải có `scrollWidth === clientWidth` (không tràn ngang).
17. `<thead>` của bảng Defensive cao **một dòng** (bản sửa §9.3).

> ⚠️ **Nhóm D không chạy được trong sandbox `vm`** — nó cần layout thật. Hai lựa chọn:
> (a) chạy trong `jsdom` **có** `cssom` (không đo được layout — không đủ), hoặc
> (b) một script thủ công dựng `buildPages()` vào một trang tĩnh dưới `_site/` và đo bằng
> Browser pane, chạy **tay** trước khi merge. Bản này chọn **(b)** và ghi lại số đo vào
> tài liệu, đúng cách §5.1 và §9.3 đã đo. §14 Q5.

### 13.3 Test giao thoa — con số phải khớp bảng Stats

Một test mượn `loadStats()` (`tests/harness.js:198`) để dựng cùng bộ row hai lần:

- **Set Pieces**: cả 11 cột PDF **=** cả 11 cột tab Set Pieces (bảng dùng `PLAYER_CATS`
  nguyên vẹn, nên đây là so sánh từng cột một)
- **Fouls**: cả 8 cột PDF **=** cả 8 cột tab Fouls
- **Goalkeeper** — bảng duy nhất rút lại (§9.1), nên phải so **từng cặp**:

  | Cột PDF | Phải bằng, trên tab Goalkeeper |
  |---|---|
  | `Saves` | `Saves` |
  | `Catch` / `Parry` / `Stand` / `Collapse` / `Diving` / `Kneel` / `Overhd` | cột cùng tên |
  | `DLS` = `won/total` | `Def. Line Support Success` **và** `= total − Success` cho `Fail` |
  | `DLS %` | `Def. Line Support %` |
  | `Aer Ctrl`, `AC %` | y hệt, cho Aerial Control |
  | `Conceded` | `Goals Conceded` (con số **tag tay**, không phải con số dẫn xuất) |

Vì cả hai đọc `computeStats`, test này chỉ đỏ khi ai đó bắt đầu tính lại bằng tay trong
`report.js` — chính là thứ §11.2 cấm.

### 13.4 Baseline sau khi xong

`1483 + ~25 test mới`, và **1483 test cũ phải xanh không sửa một dòng nào** ngoài
`asset-versions.json` và payload mở rộng ở `stats-view.test.js:228`.

---

## 14. Năm câu hỏi phải trả lời **TRƯỚC** khi viết code

| # | Câu hỏi | Mặc định bản này đề xuất |
|---|---|---|
| **Q1** | Ba mục **cũ** (Attacking / Distribution / Defensive) có đổi sang "một trang mỗi đội" như ba mục mới không? | **KHÔNG.** Người dùng chỉ yêu cầu cho ba mục mới. Đổi cả sáu thêm ~6 trang. |
| **Q2** | Có nhận bản sửa `evKey` cho ba map foul (§8.2b) không? Đây là **sửa lỗi**, hôm nay chưa hỏng. | **CÓ** — nếu không, câu "đảm bảo total foul" không được bảo đảm. |
| **Q3** | Header có cần **ngày đá / tên giải / logo CLB** không? Cần đổi `buildReport()` trong `cloud-sync.js`, và **mọi báo cáo đã publish sẽ in ô trống**. | **KHÔNG** trong bản này. Dự án riêng. |
| **Q4** | Header trả lại ~31px mỗi trang. Có chỉnh `CMP_FILL` / `TOC_BUDGET` / `FIRST`/`CONT` lên cho kín trang không? | **KHÔNG** trong bản này — để nguyên là hướng an toàn; chỉnh sau khi đã nhìn PDF thật. |
| **Q5** | Nhóm test D (§13.2) chạy **tay** qua Browser pane, hay đầu tư một harness đo layout tự động? | **Tay**, có ghi số đo. Harness tự động là việc riêng. |

---

## 15. Thứ tự triển khai

Mỗi bước để lại một cây **xanh**. Không bước nào phụ thuộc bước sau.

| # | Việc | Chạm | Xong khi |
|---|---|---|---|
| 1 | **Header** (§5) — `BRAND_SVG`, `secTitle(t,team)`, CSS, trang 1 + mục lục | `report.js` | 1483/1483 vẫn xanh; đo lại `contentTop` = 65.4px |
| 2 | **Sửa bảng** (§9.3) — 3 dòng CSS | `report.js` | `<thead>` Defensive về 1 dòng, không tràn ngang |
| 3 | **`teamPlayerPages` + `RPT_ABBR`** (§9.1-9.2) | `report.js` | ba bảng mới in được, chưa nối vào `buildPages` |
| 4 | **Mục Fouls** (§8) — đổi tiêu đề, `evKey`, `foulComparisonPage`, player pages | `report.js` | nhóm test B đủ 3 test |
| 5 | **Mục Goalkeeper** (§6) — `gkFaced`, `gkRow`, `gkSavesPage`, comparison, player pages; xoá `gkPage`/`GK_FIT`/`gkNo` | `report.js` | nhóm C test 8-9 |
| 6 | **Mục Set Pieces** (§7) — `spChains`, `goalKickPage`, `spArrowPage`, comparison, player pages | `report.js` | nhóm C test 10-13 |
| 7 | **Nối vào `buildPages`** (§4.3) — bỏ 4 dòng cũ, thêm 14 dòng mới | `report.js` | nhóm A đủ 4 test |
| 8 | **Bump `?v=`** (§12) — 2 chỗ + `--update` | `Stats/index.html`, `client/assets/app.js`, `tests/asset-versions.json` | asset-versions xanh |
| 9 | **Đo khổ trang bằng tay** (§13.2 nhóm D) trên payload đầy | — | mọi trang `scrollHeight === clientHeight`; xuất một PDF thật và xem |

---

## 16. Ghi chú cho người đọc sau

- Tài liệu này nối tiếp `docs/gk-setpiece-dashboard-design.md` (2026-09-03), bản đã ghi
  *"PDF — ngoài phạm vi, và đây là quyết định có chủ ý"* ở §9.3 của nó. Đây **là** dự án
  riêng ấy. Toàn bộ khảo sát dữ liệu ở §2 được kiểm lại từ code, không chép niềm tin.
- Hai thứ trong bản này là **số đo thật**, không phải ước lượng: chiều cao header (§5.1) và
  chẩn đoán bảng player stats (§9.3). Cả hai đo bằng `getBoundingClientRect` trên Chromium
  với đúng CSS lấy ra từ `ensureCss()`. Nếu ai đó đổi font hoặc padding, **đo lại** — đừng
  tin lại con số cũ.
- Điều nguy hiểm nhất trong file này là `.rp-page{overflow:hidden}`: một trang tràn **không
  báo gì**. Mọi trang mới đều phải qua bước 9.
- `gkFaced()` sẽ là hàm duy nhất trong `report.js` lọc `r.team !== team`. Comment của nó
  phải nói rõ, hoặc lần đọc sau sẽ "sửa" nó thành bug.

---

## 17. Bản triển khai khác bản thiết kế ở đâu — 2026-09-05

Năm chỗ. Bốn cái đầu là quyết định mới; cái cuối là một lỗi bản thiết kế bỏ sót.

### 17.1 Q3 — fixture đọc **live** từ channel, không đóng băng vào payload

Bản thiết kế §2.8 nói muốn Date/League/Season/Round/Venue thì phải sửa `buildReport()`
trong `cloud-sync.js`. Đã thử, và **`tests/submit-analysis.test.js:41` chặn lại**:

```js
notOk(/home_score|kickoff|competition/.test(fn),'nothing already on the match row is copied in');
```

Cái test đó không phải chướng ngại — nó là **một quyết định thiết kế cũ đang được canh
giữ**: những cột này sống trên `public.matches`, trang channel *đã* đọc chúng, và đóng
băng thêm một bản là mời hai bản cãi nhau.

Nên cách làm là ngược lại: `client/assets/app.js` phủ fixture **hiện tại** lên `meta`
ngay trước khi mount. Kết quả tốt hơn cách bản thiết kế đề xuất ở ba điểm:

| | Đóng băng vào payload | Phủ live (đã làm) |
|---|---|---|
| Báo cáo đã publish trước đây | in ô trống, phải publish lại | **in đủ ngay** |
| Sửa venue bằng ⋯ Edit sau khi publish | không thấy | **thấy** |
| `cloud-sync.js` | phải sửa | **không đụng** |

Một trường live rỗng **không** xoá trường đã đóng băng; `rep.payload` được thay bằng bản
sao chứ không sửa tại chỗ. Trang Stats của analyst (localStorage) không có năm trường này
và **không in khối fixture** — đúng, vì phiên đó thật sự không biết trận thuộc giải nào.

### 17.2 Giá trị fixture **xuống dòng**, không cắt bằng ellipsis

Bản thiết kế cho `.rp-fixi b` `white-space:nowrap` + ellipsis. Đo trên tên giải thật —
*"FIFA World Cup qualification – CONCACAF Second Round"* — một phần năm của 694px cắt mất
hai phần ba cái tên. Cắt ở đây chính là lỗi mà §9.3 vừa sửa cho bảng player stats. Đổi
thành `overflow-wrap:anywhere` ở 10.5px; trang 1 có chỗ vì bên dưới là timeline.

### 17.3 Bảng **Goalkeeper — Player Stats** chỉ liệt kê thủ môn

Bản thiết kế cho `teamPlayerPages` chạy trên cả đội hình. Trên dữ liệu thật đó là **22
dòng toàn số 0** — và `shared.js:497` đã nói trước điều này: *"On an outfield player every
one of these is a zero that says nothing, which is a whole tab of noise."* Tab Stats lọc
đúng như vậy (`catPlayers`, `stats-view.js:131`).

`teamPlayerPages(title,cols,only)` nhận thêm tham số thứ ba, và chỉ bảng thủ môn truyền
nó: `gkShirts()`, rơi về "những áo số thật sự được tag việc thủ môn" khi board không điền
ô GK. Hai bảng kia không truyền gì và vẫn liệt kê cả đội hình.

### 17.4 `RP_CARDS` — bản sửa `evKey` rộng hơn ba dòng §8.2 dự tính

`foulMapsPage` còn một chỗ thứ ba so tên thô: vòng thẻ quanh chấm phạm lỗi
(`c.event==='yellow card'||c.event==='red card'`), và `best=c.event` truyền tên **thô** ra
ngoài để so tiếp. Cả hai đi qua `evKey` nay, qua một `RP_CARDS` mới. Bỏ sót chỗ này thì
một `Yellow Card` viết hoa vẫn vẽ đúng chấm nhưng **mất vòng vàng**.

### 17.5 `gkArcSVG()` suýt bị xoá

§10.5 ghi "Giữ lại `gkArcSVG()`" nhưng nó nằm ngay giữa khối `gkPage()` bị cắt, và đã bị
cắt theo. `tests/stats-view.test.js` bắt ngay ở lần chạy đầu — *"a mounted report builds
every page of the PDF: ReferenceError: gkArcSVG is not defined"*. Đã chép lại nguyên vẹn
vào đầu mục Goalkeeper mới.

---

## 18. Số đo cuối, trên code đã ship

Đo bằng `getBoundingClientRect` trên Chromium, dựng **cả 57 trang** từ `buildPages()` với
một trận đầy — 2 × 23 cầu thủ, hai thủ môn mỗi đội, ~460 row, đủ set piece / phạm lỗi /
thẻ / cú sút có `gXY`.

| Đo | Trước | Sau |
|---|---|---|
| Số trang | 40 | **57** |
| Trang bị tràn (`scrollHeight > clientHeight`) | — | **0 / 57** |
| Bảng tràn ngang | — | **0** |
| Nhãn cột bị bẻ dòng | 2 (`TACKLE %`, `T-ON CON`) | **0** |
| `<thead>` bảng Defensive | 35.3px (2 dòng) | **24.6px (1 dòng)** |
| Dải header | không có | **top 0 · cao 51.4px · rộng 794px** |
| Nội dung trang bắt đầu ở | y = 96.1px | **y = 65.4px** (dôi ra ~31px/trang) |

Harness dựng ra file đo nằm ngoài repo (scratchpad). Muốn chạy lại: dựng `buildPages()`
trong một sandbox `vm` với DOM giả, ghi `innerHTML` từng trang vào một file HTML kèm CSS
mà `ensureCss()` sinh ra, rồi mở bằng trình duyệt và đo.

> ⚠️ Một cái bẫy trong harness, mất một vòng mới thấy: DOM giả tự tạo node cho mọi id, nên
> `document.getElementById('rpCss')` trả về node **trước khi** stylesheet được thêm,
> `ensureCss()` `return` sớm, và **toàn bộ số đo vòng đầu là số của trang không CSS**.
> Riêng id `rpCss` phải trả `null` cho tới khi style thật sự được append.

---

## 19. Sửa lần hai — 2026-09-05 (sau khi xem bản PDF thật)

Năm điều chỉnh, sau khi người dùng đọc bản in ra. Không cái nào đổi con số nào; tất cả là
**bớt đi**, và mỗi cái bớt đều là bớt một thứ đang nói hai chuyện cùng lúc.

### 19.1 Fixture trên trang 1: năm cái thẻ → một khối căn giữa

Năm thẻ có nhãn cho mọi phần **cùng một trọng lượng và cùng một chiều rộng**, nên một tên
giải ba dòng ngồi trong ô to bằng ô chứa "2026/27", và mỗi phần phải có nhãn riêng mới đọc
được. Xếp chồng căn giữa thì **thứ tự đọc chính là nhãn**:

```
FIFA World Cup qualification – CONCACAF Second Round   ← navy 13px, đậm
Matchday 4 · 2026/27                                   ← 11.5px
15 Aug 2026                                            ← xám 10px
Stade Sylvio Cator, Port-au-Prince                     ← xám 10px
```

Phần nào rỗng thì **không thành một dòng**, không phải một ô trống. `.rp-fixi` biến mất
khỏi CSS cùng với năm cái nhãn.

### 19.2 Bỏ cột: Attacking mất 3, Defensive mất 2

| Bảng | Bỏ | Cột đó **vẫn được in**, ở |
|---|---|---|
| Attacking — Player Stats | Offsides | `Fouls — Player Stats` |
| | Freekicks, Corners | `Set Pieces — Player Stats` |
| Defensive — Player Stats | Fouls, F.Won | `Fouls — Player Stats` (và Fouls tách ra ba loại, thứ cột cũ chỉ tổng được) |

Không mất chỉ số nào — chỉ là mỗi con số nay in ở **một** chỗ, cạnh những cột giải thích
nó, nên hai trang không thể nói khác nhau. Test khoá cả hai chiều: cột đã đi khỏi bảng cũ
**và** có mặt ở bảng mới.

### 19.3 Bỏ "No outcome tagged" — và bỏ luôn cái chấm xám

Bỏ mỗi cái nhãn thì để lại một chấm xám không ai giải thích. Nên **chấm xám cũng đi**:
`spSegments()` không còn nhánh dự phòng, `spCol` chỉ còn xanh/đỏ.

Không mất gì. Với một quả phạt góc hay một quả phát bóng, chấm đó đánh dấu **định nghĩa
của chính nó** (góc sân, vòng 5m50) chứ không phải một sự kiện của trận. Và số lượng vẫn
chính xác tuyệt đối: `spChains().taken` đếm đủ, tagged hay không, và bảng player stats in
đúng con số đó.

### 19.4 Bỏ mọi chú thích giải thích cách tag

Bốn khối `rp-note` đi hẳn: "Total counts the goal kicks whose entry…", "An arrow is drawn
from the row that says what happened…", "The goal shows where the ball crossed the line…",
"Saves counts catch, parry and the retired save event…". Cộng dòng
`N taken · M tagged outcomes` trên tiêu đề map.

**Đây là tài liệu một CLB đọc, không phải sổ tay tag.** Lý do kỹ thuật vẫn còn nguyên —
trong comment của code và trong §2.4, §6.2, §7.2 của tài liệu này — chỗ người sửa code đọc,
chứ không phải chỗ người đọc báo cáo đọc.

### 19.5 Một hình cho cả hai hiệp

Marker `circle = 1st half` / `square = 2nd half` mang **hai** thông tin cùng lúc — chuyện
gì xảy ra, và lúc nào — trong khi **màu đã trả lời cái thứ nhất** và phút thì đã in trên
dòng Event List ngay cạnh bản đồ. Gộp về một hình tròn, bỏ hai cái nhãn.

Đã đổi ở: `shotDotsV` + `goalMarksV` (Shots & Goals), `actionMapsPage` (mọi map Defensive
và Distribution — Take-ons & Step-ins), và `gkPitchDots` (Goalkeeper — Saves).

> ⚠️ **Ba trang CÒN chia hình theo hiệp**, có chủ ý: `Fouls — Foul Maps`,
> `Fouls — Fouls Won`, `Fouls — Offsides`. Người dùng nêu đích danh ba mục shooting /
> distribution / defensive, và mục Fouls không nằm trong đó. Trang Foul Maps còn có vòng
> thẻ vàng/đỏ quanh chấm, tức chú giải của nó vốn đã dày hơn. Muốn gộp nốt thì nói một
> tiếng — `foulMapsPage` (`f.half===1`) và `eventMapsPage` (`eventHalf(r)===1`), mỗi chỗ
> hai dòng.

**Sau lần sửa này:** 1514/1514 test (thêm 4 test mới, và
`tests/shooting-goal-map.test.js` đổi hai dòng vì hành vi nó khoá chính là hành vi vừa
được yêu cầu đổi). Đo lại cả 57 trang: **0 tràn dọc, 0 tràn ngang, 0 nhãn cột bẻ dòng.**

---

## 20. Sửa lần ba — 2026-09-06

Bốn điều chỉnh nữa sau khi đọc bản in. Ba cái đầu tiếp tục nguyên tắc của §19 — **bớt thứ
đang nói hai lần** — cái thứ tư thì thêm, và là thêm đúng thứ bản đồ vốn thiếu.

### 20.1 Bỏ cột `Tackle %` khỏi Defensive — Player Stats

`3/5` **đã là** tỉ lệ, viết bằng hai ký tự, và một cột phần trăm bên cạnh là đọc lại đúng
một sự thật. Hàng `Tackle Success` trên **Defensive — Team Comparison** giữ nguyên: ở đó
không có phân số nào bên cạnh để làm nó thừa. Test khoá cả hai chiều.

### 20.2 Ba map Fouls gộp về một hình tròn

Chỗ §19.5 đã nêu là còn sót, nay được cho phép: `foulMapsPage` (`f.half===1`) và
`eventMapsPage` (`eventHalf(r)===1`). Bỏ luôn hai chú giải.

**Vòng thẻ ở lại.** Nó là thứ *duy nhất* marker của foul map còn nói hai lần — nhưng cái
nó nói thêm là **một chiếc thẻ**, không phải một cái đồng hồ, và chú giải "Led to yellow /
Led to red" vẫn ở đó giải thích nó.

Sau lần này **không còn trang nào** trong báo cáo chia ký hiệu theo hiệp — đã kiểm bằng
cách quét cả 57 trang.

### 20.3 Bỏ bảng thủ môn khỏi Set Pieces — Goal Kicks

Nó in đúng năm thứ đã in ở đầu **Goalkeeper — Saves**, và `Save Rate (%)` không phải một
sự thật về quả phát bóng. Con số của nó *thật sự* nói về phát bóng —
`Goal Kick Success Rate` — chính là hàng **Total** của bảng Distance ngay trên cùng trang
đó. Trang Goalkeeper — Saves giữ nguyên bảng, vì đó mới là chỗ người đọc hỏi về thủ môn.

### 20.4 Mọi dot trên map set piece mang số áo

`spSegments()` nay trả thêm `from` — số áo của **row hệ quả**, không phải của row set
piece. Trên quả phát bóng hai cái là một người; trên quả phạt góc tạt vào rồi đánh đầu thì
**không**, và cái chấm đánh dấu chỗ bóng được chạm, nên số phải là người chạm.

Ba thay đổi hình để chứa được con số:

| | Trước | Sau |
|---|---|---|
| Chấm trên map Goal Kicks | `r=12`, không số | **`r=15`, số 15px** |
| Chấm trên map Free-kick / Corner | `r=9`, không số | **`r=13`, số 14px** |
| Tam giác (cú sút) | cao 25, rộng 28 | **cao 32, rộng 36**, số ở 60% chiều cao — chỗ tam giác rộng bằng hình tròn |

Và **vẽ toàn bộ đường trước, marker sau**. Trước đây mỗi segment vẽ liền một mạch
(đường + chấm), nên đường của quả này nằm đè lên số của quả bên cạnh — thấy rõ nhất ở
Goal Kicks, nơi mọi quả xuất phát cách nhau vài mét.

> ⚠️ Một cái bẫy mất một vòng test mới thấy: `spArrowSVG` chiếu lại toàn bộ segment qua
> `F()` để đổi sang toạ độ pixel, và phép `.map()` đó **liệt kê từng trường một** — nên
> `from` bị rơi im lặng và một nửa số marker không có số. Test đếm `số marker === số chữ`
> là cái bắt được. Thêm trường vào `spSegments()` thì phải thêm cả ở đó.

**Sau lần sửa này:** 1520/1520 test (thêm 6). Đo lại cả 57 trang: **0 tràn dọc, 0 tràn
ngang, 0 nhãn cột bẻ dòng, 0 trang còn chia ký hiệu theo hiệp.**
