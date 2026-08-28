# Tách tab *Other* thành *Goalkeeper · Set Pieces · Fouls*, và thay *Ground Duel* bằng *Physical + Loose Ball* — Detailed Design

Bảng cầu thủ ở tab Stats đi từ **4 nhóm cột lên 6**. `Other` bị xoá và chia ba: **Goalkeeper**
(15 cột), **Set Pieces** (11 cột), **Fouls** (8 cột). Tab **Defensive** bỏ `Ground Duels` /
`Ground Duels Won`, giữ lại bốn cột `Physical` / `Loose Ball` đã có. Trang **Overall** tách
section `Discipline & GK` theo đúng ba nhóm mới.

Điều bất ngờ nhất khi khảo sát: *tab Goalkeeper không cần một event mới nào, cũng không cần một
counter mới nào.* Cả 15 cột đã nằm sẵn trong `newStat()` từ ngày 2026-08-28. Việc duy nhất là
bày chúng ra. Ngược lại, tab **Set Pieces** có **6 trên 11 cột không có gì đứng sau** — và đó là
mục khó duy nhất của tài liệu này (§5).

**Rủi ro lớn nhất KHÔNG nằm ở trang Stats.** Nằm ở [client/assets/app.js:321](../client/assets/app.js:321):
`TD_TABS` dùng **cùng một khoá** cho hai việc — tên section của `TEAM_SECTIONS` *và* khoá của
`PLAYER_CATS`. Xoá khoá `other` mà quên nó thì trang Data của site khách **vẽ ra bảng rỗng, không
báo lỗi, không có gì trong console**. §8.6 là mục riêng cho chuyện đó.

Trạng thái: **ĐÃ TRIỂN KHAI** (2026-08-29). Q1→bỏ hẳn, **kể cả Overall, Dashboard và PDF** ·
Q2→3 nhóm có dòng mới, nhãn `(tagged)` · Q3→**A**, ghi công **người dứt điểm** · Q4→không ·
Q5→có. **Yêu cầu thêm:** `Saves` = `catches + parries`, không đọc event `save`.

Test: `node tests/run.js` → **1400/1400 passed** (baseline 1358 + 42 test mới, 9 file test cũ sửa).

> **Có 5 câu hỏi phải trả lời trước khi code — §14.** Q1 (dữ liệu ground duel cũ đi đâu) và Q3
> (cách suy ra cột set-piece) đổi cả kiến trúc, không chỉ đổi nhãn.

---

## 0-bis. Vòng sửa sau khi bạn xem màn hình thật (2026-08-29, cùng ngày)

Ba yêu cầu sau khi nhìn tab Goalkeeper và trang Overall trên dữ liệu thật. Cả ba **đảo lại**
những quyết định của bản thiết kế, và đây là lý do mỗi cái là đúng khi nhìn màn hình:

### 0-bis.1 `—` → `0` ở **mọi** cột

§4.5 của tài liệu trước lập luận rằng `0` là một lời khẳng định sai (*"trận này không có pha
tranh chấp thể chất nào"*) trong khi sự thật là *"chưa ai hỏi câu đó"*. Lập luận ấy đúng về mặt
dữ liệu và **sai về mặt bảng số**: một bảng cầu thủ 15 cột toàn dấu gạch không đọc được, và cái
"sự trung thực" ấy không tới được người đọc — họ chỉ thấy bảng hỏng.

**21 chỗ trong `shared.js`, 11 chỗ trong `index.html`, 2 chỗ trong `Stats/report.js`** bỏ cờ
bảo vệ. Cụ thể:

| Bỏ cờ | Giữ nguyên |
|---|---|
| `PLAYER_CATS` — 4 cột duel · 15 cột GK · 6 cột set piece | `GK_COLS` bốn cột đọc cờ **`known`**: `Conceded`, `On Target Faced`, `Save Rate`, `Clean Sheets` |
| `GK_COLS` — 10 cột chi tiết của thủ môn | cột **Minutes Played** (`minsCell`) |
| `TEAM_SECTIONS` — 4 dòng duel · 5 dòng GK · 2 dòng set piece | |
| `Stats/report.js` — 2 cột duel (nay là `frac()` trần, `0/0`) | |

> **Vì sao `known` ở lại:** nó hỏi một câu **khác**. `saveDetail` hỏi *"có event nào được tag
> không"*; `known` hỏi *"có đội hình nào để biết ai đứng trên sân không"*. Trận không có đội hình
> thì `Clean Sheets = 0` là bịa thật — không có gì để đếm cả. Test khoá cả hai vế.

**Sáu counter cờ (`duelDetail` … `spDetail`) ĐƯỢC GIỮ.** Không cột nào đọc chúng nữa, nhưng chúng
là bản ghi duy nhất của khác biệt giữa *"không có"* và *"chưa hỏi"*, chúng vẫn cộng dồn, và bật
lại một cột chỉ là một biểu thức. Xoá chúng thì mất thông tin vĩnh viễn.

### 0-bis.2 Bỏ chữ `(tagged)` ở `Goals Conceded` — nhưng **chỉ ở một trong hai bảng**

`PLAYER_CATS.goalkeeper` → `Goals Conceded`. Bảng này **không chứa** con số suy ra nào, nên tên
trần không đụng ai.

`GK_COLS` **giữ** `Conceded (tagged)`, vì bảng đó có **cả hai** trong cùng một hàng cột — bỏ hậu
tố ở đó sẽ cho ra **hai cột cùng tên `Conceded`** cạnh nhau. Đó không phải sự thiếu nhất quán;
đó là hậu tố làm đúng việc của nó ở đúng chỗ cần nó.

### 0-bis.3 Tab Goalkeeper chỉ liệt kê thủ môn

15 cột thủ môn là 15 số 0 vĩnh viễn trên một cầu thủ ngoài sân — màn hình bạn gửi có **14 hàng
gạch quanh 1 hàng đáng đọc**. Nay lọc theo bảng đội hình:

| Nơi | Cách làm |
|---|---|
| Bảng Stats | `catPlayers()` mới, lọc qua `gkShirts(lineups,statTeam)` |
| Sheet XLSX/CSV | `catSheet()` lọc **cùng luật**, nhưng theo `team`/`cat` của **sheet**, không theo màn hình |
| Site khách, trang cầu thủ | `OUT_TABS` mới = `TD_TABS` bỏ `goalkeeper`; `tabsFor()` trả nó cho cầu thủ ngoài sân |
| `TD_TABS` | **không đụng** — Team Data đọc nó để lấy **tên section** `TEAM_SECTIONS`, và một *đội* thì có thủ môn |

`gkShirts()` đọc cả `lineups.history`, nên đội **đổi thủ môn giữa trận có đủ hai hàng**. Đội mà
ô GK trên bảng đội hình còn trống thì hiện **một dòng nhắc**, không phải bảng rỗng có tiêu đề.

**Test:** +5 (`stats-tabs-split.test.js` ×3, `minutes-played.test.js` ×3, trừ một case cũ được
tách ra); 3 file test cũ sửa assertion `—` → `0`. Tổng **1400/1400**.

---

## 0. Đã làm gì — và bốn chỗ khác với bản thiết kế

**Phạm vi thật:** `shared.js` · `index.html` · `Stats/stats-view.js` · `Stats/stats-view.css` ·
`Stats/index.html` · `Stats/report.js` · `client/assets/app.js` · `client/index.html` ·
`client/app.html` · `Player-Lists/index.html` · `README.md` ·
`tests/stats-tabs-split.test.js` *(mới, 34 test)* · 6 file test cũ · `tests/harness.js` ·
`tests/asset-versions.json`.

### 0.1 `Stats/report.js` KHÔNG còn là 0 dòng — Q1 đã nói thế

§8.8 hứa 0 dòng. Câu trả lời Q1 (*"bỏ cả ở overall, dashboard và report PDF"*) huỷ lời hứa đó,
và đúng ra là phải huỷ: để `Ground` lại trong PDF trong khi ba nơi kia đã bỏ là để hai định nghĩa
sống cạnh nhau. Ba chỗ đổi:

| Chỗ | Đổi gì |
|---|---|
| Bảng *Defensive — Player Stats* [:742](../Stats/report.js:742) | cột `Ground` → **`Physical` + `Loose`** (12 → 13 cột) |
| Radar phòng ngự [:1124](../Stats/report.js:1124) | trục `Ground Won` → **`Physical Won` + `Loose Ball Won`** (7 → 8 trục) |
| Trang bản đồ theo loại | **0 dòng** — nó lặp `DEF_CATS`, nên hai loại mới tự thành hai trang |

Luật §2.1 vẫn được giữ nguyên vẹn: `sectionRows(0/1/2)` không đụng, ba section đầu của
`TEAM_SECTIONS` không đổi vị trí. Test **T7** khoá điều đó.

### 0.2 `frac()` in `0/0`, không in `—`

Bản thiết kế viết nhầm rằng `frac()` tự trả `—` khi mẫu số bằng 0. Nó trả `0/0`
([report.js:95](../Stats/report.js:95)). Với trận tag trước ngày tách, `0/0` **khẳng định**
"cầu thủ này không có pha tranh chấp thể chất nào" — đúng lỗi §4.5 cảnh báo. Nên hai cột mới
trong PDF đọc cờ `duelDetail` trước, y như mọi cột mới khác.

### 0.3 `Saves` = `catches + parries` — và hai chỗ **không** đổi theo

Yêu cầu thêm ở lượt này. §4.1(a) từng khuyến nghị giữ `s.saves`; bạn đã chốt khác, và đây là
phạm vi chính xác đã làm:

| Đọc `catches+parries` | Vẫn đọc `s.saves` |
|---|---|
| cột `Saves` tab **Goalkeeper** | `GK_COLS` (site khách, cả mùa) — nó nuôi **`Save Rate`** và **`On Target Faced`** |
| dòng `Saves` section **Goalkeeper Stats** ở Overall | ô `Saves` trên trang GK của **PDF** |

Counter `saves` và `EVENT_INC` **không đụng một dòng** — `save`, `catch`, `parry` vẫn cùng nuôi
nó. Cái đổi là **cột đọc gì**, không phải **event đếm vào đâu**.

> ⚠️ **Hệ quả phải biết:** trận tag **trước 2026-08-28** (chỉ có event `save`) nay đọc `—` ở cột
> `Saves` của tab Goalkeeper và ở dòng `Saves` của Overall, trong khi `GK_COLS` và PDF vẫn in số
> thật. Đó là chủ ý: một cột một nghĩa, không tự động lùi về một định nghĩa khác. Test
> *"a match with no catch or parry says so"* khoá lại.

### 0.4 `index.html` phải nhận **ba** hàm mới, không phải một

§8.3 dự đoán chép `classifyCards`. Thực tế phải chép **ba**: `classifyCards`, `setPieceFold`, và
hằng `SHOT_KINDS` — file này chưa từng có cái nào. `SET_PIECE_EVENTS` là hằng thứ tư.

### 0.5 Hai test cũ được **thay bằng test mạnh hơn**, không phải nới lỏng

* `player-data.test.js` — `notOk(/Conceded|Clean Sheet/)` trên **nhãn** sẽ vướng nhãn mới
  `Goals Conceded (tagged)`. Luật thật chưa bao giờ là chữ: nó là **một cột `PLAYER_CATS` nhận
  MỘT tham số**. Nay kiểm `c[1].length===1` cho cả 68 cột, cộng `===2` cho `GK_COLS`. Không nhãn
  nào lừa được.
* `data-page.test.js` — regex gõ cứng 4 khoá, nay đọc `TD_TABS` ra khỏi mã và kiểm **cả hai vế**
  của mỗi dòng (khoá ↔ `PLAYER_CATS`, tiêu đề ↔ `TEAM_SECTIONS`). Thêm tab không cần sửa test.

### 0.6 Một chỗ cố ý **không** đồng bộ

Bảng rộng 40 cột của tab tagging (`STAT_HEADERS` / `statRow`, [index.html:4023](../index.html:4023))
**vẫn còn `Ground Duels` / `Ground Duels Won`** và không có 23 cột mới. Đó là bảng làm việc lúc
đang tag, không phải bảng báo cáo, và §8.9 giữ nó ngoài phạm vi. Nói ra ở đây để lần sau không ai
tưởng là sót.

---

## 1. Tóm tắt một trang

| Việc | Chi tiết | Mục |
|---|---|---|
| **`PLAYER_CATS`: 4 → 6 nhóm** | `other` biến mất, chia thành `goalkeeper` · `setPieces` · `fouls` | §4 |
| **45 → 68 cột** | shooting 9 · distribution 10 · defensive **15** · goalkeeper 15 · setPieces 11 · fouls 8 | Phụ lục A |
| **Goalkeeper — 0 event mới, 0 counter mới** | cả 15 cột đã có trong `newStat()` | §4.1 |
| **Fouls — 5 counter mới, 0 event mới** | `foul` / `foul throw` / `handball foul` / `yellow card` / `red card` **đều đã là event riêng từ đầu** | §4.2 |
| **Set Pieces — 6 cột không có gì đứng sau** | phải suy ra từ `grp`, hoặc thêm 6 event | **§5** |
| **Thẻ vàng/đỏ** | qua `classifyCards()`, **không** qua `EVENT_INC` — repo đã chốt cách này rồi | §7 |
| **Bỏ Ground Duels khỏi Defensive** | trận tag **trước 2026-08-28** mất số duel mặt đất ở bảng Stats | **§6** |
| **Overall** | `Discipline & GK` → 3 section mới, **nối vào sau index 2** | §9 |
| **`Stats/report.js` (PDF)** | **0 dòng** — nhưng chỉ khi ba section đầu **không đổi vị trí** | §8.8 |
| **SQL `match_stats`** | **0 dòng** — và §10.3 nói vì sao `Total Fouls` sẽ **không** khớp với nó | §8.10 |
| **Export** | 8 → **12 sheet**, tự động, `buildSheets()` đọc `Object.keys(STAT_CATS)` | §8.5 |
| **Test cũ phải sửa** | **5 file**, mỗi cái vì một lý do chính đáng | §11.2 |
| **Cache-bust** | `shared.js` · `stats-view.js` · `app.js` · (có thể) `stats-view.css` → **9 dòng `?v=`** trên 4 file + `asset-versions.json` | §12 |
| **Chữ trên landing** | [client/index.html:432](../client/index.html:432) đang hứa *"four tables … eight sheets"* | §10.5 |

**Câu một dòng cần nhớ:** `computeStats()` hôm nay là **một vòng lặp thuần trên từng hàng**. Cả thẻ
phạt lẫn cột set-piece **đều cần nhìn nhiều hàng cùng lúc**. Đó là thay đổi kiến trúc thật sự
duy nhất của tài liệu này, và nó phải làm **hai lần** — `shared.js` và `index.html` (§8.2).

---

## 2. Một cột đi qua những đâu — khảo sát trước khi sửa

Tài liệu trước khảo sát đường đi của một **tên event**. Lần này thứ đi lang thang là một **cột**.
Nó qua **11 trạm**, và 4 trạm im lặng khi hỏng.

| # | Trạm | Ở đâu | Hỏng thì thế nào |
|---|---|---|---|
| 1 | Định nghĩa cột | [shared.js:357](../shared.js:357) `PLAYER_CATS` | — |
| 2 | Bảng trên màn hình | [Stats/stats-view.js:126](../Stats/stats-view.js:126) `statTableHTML` | ném lỗi nếu `c[1]` cần 2 tham số |
| 3 | Nút chuyển nhóm ×2 bản | [Stats/index.html:54](../Stats/index.html:54) · [stats-view.js:2303](../Stats/stats-view.js:2303) `CHROME` | **nút không tồn tại → không bấm được** |
| 4 | Dashboard cùng `statCat` | [stats-view.js:139](../Stats/stats-view.js:139) `dashboardHTML` | **im lặng vẽ rỗng** |
| 5 | Sheet XLSX | [stats-view.js:1166](../Stats/stats-view.js:1166) `buildSheets` | tự động — đọc `Object.keys(STAT_CATS)` |
| 6 | CSV | `buildCsv` | tự động, dùng chính worksheet trên |
| 7 | Site khách — Player Data | [client/assets/app.js:1007](../client/assets/app.js:1007) `catCols` | **im lặng bảng rỗng** |
| 8 | Site khách — Team Data | [app.js:321](../client/assets/app.js:321) `TD_TABS` → `TEAM_SECTIONS[title]` | **im lặng bảng rỗng** |
| 9 | Site khách — tab của thủ môn | [app.js:1017](../client/assets/app.js:1017) `GK_TABS` | trùng tab (§8.6) |
| 10 | Overall (2 bản) | [shared.js:728](../shared.js:728) · [index.html:4155](../index.html:4155) `TEAM_SECTIONS` | — |
| 11 | PDF | [Stats/report.js:349](../Stats/report.js:349) `sectionRows(si)` — **theo chỉ số** | **im lặng in nhầm section** |

### 2.1 Trạm 11 là cái bẫy tinh vi nhất

```js
function sectionRows(si){ … return TEAM_SECTIONS[si][1].map(…); }
// gọi ở: 614 → sectionRows(0)  Attacking
//        750 → sectionRows(1)  Distribution
//        983 → sectionRows(2)  Defensive
```

`report.js` gọi `TEAM_SECTIONS` **bằng số thứ tự, không bằng tên**. Chèn một section mới vào giữa
là trang *"Distribution"* của bản PDF in ra nội dung của section khác — **không lỗi, không cảnh
báo, và đọc vẫn thấy hợp lý** vì các thanh bar vẫn vẽ đẹp.

Section 3 (`Discipline & GK`) **không** được `sectionRows` đụng tới: [report.js:1311](../Stats/report.js:1311)
và [:1314](../Stats/report.js:1314) tự dựng `discRows` / `spRows` từ `h.fouls`, `h.corners`… Nên:

> **Luật của tài liệu này: mọi section mới chỉ được NỐI VÀO SAU index 2. Ba section đầu không đổi
> thứ tự, không đổi số dòng bên trong.** Đó là điều biến cam kết *"report.js: 0 dòng"* từ một lời
> hứa thành một sự thật kiểm được (test T14, §11.1).

---

## 3. Ba loại cột — và vì sao chúng khác nhau hoàn toàn

Trước khi vào chi tiết, phải tách bạch **ba nhóm cột** theo mức độ rủi ro dữ liệu. Đây là toàn bộ
xương sống của tài liệu.

| Loại | Cột nào | Dữ liệu cũ | Cần cờ `—`? |
|---|---|---|---|
| **A — đã đo, chỉ chưa bày** | 15 cột Goalkeeper | có sẵn từ 2026-08-28 (cờ `*Detail` đã có) | **cờ đã có sẵn**, dùng lại |
| **B — đã ghi, chưa từng đếm** | `Fouls`, `Handball Foul`, `Foul Throw`, `Yellow Cards`, `Red Cards` | **đầy đủ từ ngày đầu tiên** | **KHÔNG** |
| **C — chưa từng được hỏi** | 6 cột `Freekicks: …` + `Set Piece Shot/Goal` | **không tồn tại** | **CÓ** (§5.4) |

### 3.1 Loại B là tin tốt nhất trong tài liệu này

`foul`, `foul throw`, `handball foul` **luôn luôn là ba event riêng biệt** — xem
[pitchtagger_events.json](../pitchtagger_events.json) (`f`, `tf`, `hf`) và
[shared.js:226](../shared.js:226):

```js
'foul':['fouls'],'foul throw':['fouls'],'handball foul':['fouls'],
```

Ba tên, một counter. **Không có gì bị gộp mất** — mỗi hàng trong `public.events` vẫn nói rõ nó là
loại nào. Tách ra chỉ là *cộng thêm ba counter đọc lại thứ đã nằm sẵn ở đó*.

Đây là **ngược lại hoàn toàn** với vụ `ground duel` → `physical` / `loose ball` của tháng trước.
Ở đó, tách là bịa dữ liệu (§4.1 tài liệu cũ). Ở đây, tách là **đọc ra thứ chưa ai đọc**. Mọi trận
từ trước tới nay lấp đầy 5 cột này **chính xác**, không một dấu `—` nào.

`yellow card` / `red card` cũng vậy: có trong từ điển từ đầu, đã được `matchSummaryHTML()`,
`foulMapHTML()`, `classifyCards()` và trang Data của site khách đọc — chỉ là **`newStat()` chưa
bao giờ mang chúng** ([app.js:761](../client/assets/app.js:761) nói thẳng điều đó).

---

## 4. Ba nhóm cột mới — cột nào lấy số từ đâu

### 4.1 Tab **Goalkeeper** — 15 cột, **0 event mới, 0 counter mới**

Đúng thứ tự bạn viết. Cột `(s)` là hàm **một tham số**, bắt buộc — `statTableHTML` gọi
`c[1](P[no])` ([stats-view.js:133](../Stats/stats-view.js:133)); một hàm 2 tham số kiểu `GK_COLS`
sẽ **ném lỗi** ở `g.known`.

| # | Nhãn | Biểu thức | Counter đã có |
|---|---|---|---|
| 1 | `Saves` | `s=>s.saves` | ✅ |
| 2 | `Catches` | `s=>s.saveDetail?s.catches:'—'` | ✅ |
| 3 | `Parries` | `s=>s.saveDetail?s.parries:'—'` | ✅ |
| 4 | `Save Standing` | `s=>s.gkTechDetail?s.saveStanding:'—'` | ✅ |
| 5 | `Save Collapse` | `s=>s.gkTechDetail?s.saveCollapse:'—'` | ✅ |
| 6 | `Save Diving` | `s=>s.gkTechDetail?s.saveDiving:'—'` | ✅ |
| 7 | `Save Kneeling` | `s=>s.gkTechDetail?s.saveKneeling:'—'` | ✅ |
| 8 | `Save Overhead` | `s=>s.gkTechDetail?s.saveOverhead:'—'` | ✅ |
| 9 | `Def. Line Support Success` | `s=>s.gkCtrlDetail?s.defLineSupportsWon:'—'` | ✅ |
| 10 | `Def. Line Support Fail` | `s=>s.gkCtrlDetail?s.defLineSupports-s.defLineSupportsWon:'—'` | ✅ suy ra |
| 11 | `Def. Line Support %` | `s=>s.gkCtrlDetail?pct(s.defLineSupportsWon,s.defLineSupports):'—'` | ✅ |
| 12 | `Aerial Control Success` | `s=>s.gkCtrlDetail?s.aerialControlsWon:'—'` | ✅ |
| 13 | `Aerial Control Fail` | `s=>s.gkCtrlDetail?s.aerialControls-s.aerialControlsWon:'—'` | ✅ suy ra |
| 14 | `Aerial Control %` | `s=>s.gkCtrlDetail?pct(s.aerialControlsWon,s.aerialControls):'—'` | ✅ |
| 15 | `Goals Conceded` | `s=>s.concededDetail?s.goalsConceded:'—'` | ✅ |

**Ba ghi chú bắt buộc đọc:**

**(a) `Saves` của bạn = "catches + parries". Counter `saves` hiện tại thì hơn thế.**
[shared.js:254](../shared.js:254):

```js
'save' :['saves'],           // tên cũ, KHÔNG bị bỏ
'catch':['saves','catches','saveDetail'],
'parry':['saves','parries','saveDetail'],
```

Với trận tag **từ 2026-08-28 trở đi**, `s.saves` **đúng bằng** `catches + parries`. Với trận cũ,
nó là số `save` — con số duy nhất liền mạch qua cả lịch sử. Nên **giữ `s.saves`**, đừng viết
`s.catches+s.parries`: viết thế là biến mọi trận cũ thành 0 save.

> Bất biến kiểm được (test T3): `saveDetail>0 ⟹ saves ≥ catches+parries`, và
> `saves = catches+parries` khi trận không còn hàng `save` cũ nào.

**(b) Cột 10 và 13 là hiệu, không phải counter.** `defLineSupports` là **tổng**;
`defLineSupportsWon` là phần thắng. Không có counter `defLineSupportsFail`, và **không nên thêm** —
một tổng cộng một phần đã xác định phần còn lại, thêm counter thứ ba là mở cửa cho ba số không
khớp nhau.

**(c) Cột 15 va tên với hai con số đã có.** Repo có **hai** "goals conceded", cả hai đều **suy ra**:

| Ở đâu | Công thức | Nghĩa |
|---|---|---|
| `TEAM_SECTIONS` | `(s,o)=>o.goals+s.ownGoals` | bàn thua của **đội** |
| `GK_COLS` [shared.js:401](../shared.js:401) | `g.known?g.conceded:'—'` | bàn thua **lúc thủ môn này trên sân** |
| **cột 15 (mới)** | `s.goalsConceded` | **event tag tay** |

Ba nghĩa khác nhau, ba con số có thể lệch nhau. `GK_COLS` giải chuyện này bằng cách đặt nhãn
`Conceded (tagged)` bên cạnh `Conceded`. Bảng Goalkeeper mới **không có** cột `Conceded` suy ra
để đứng cạnh, nên nhãn `Goals Conceded` trần trụi sẽ bị đọc nhầm là con số có thẩm quyền.
**→ Q2 (§14).** Khuyến nghị: nhãn `Goals Conceded (tagged)`.

**(d) Tab này KHÔNG thay `GK_COLS`.** `GK_COLS` sống ở site khách, cho **cả mùa của một thủ môn**,
là hàm 2 tham số, và mang `Save Rate` / `Clean Sheets` / `On Target Faced` — ba thứ cần cả trận
xung quanh nên **không thể** vào `PLAYER_CATS`. Hai bảng cùng tồn tại, phục vụ hai câu hỏi khác
nhau. §8.6 xử lý chỗ chúng gặp nhau.

---

### 4.2 Tab **Fouls** — 8 cột, **5 counter mới, 0 event mới, 0 dấu `—`**

| # | Nhãn | Biểu thức | Nguồn |
|---|---|---|---|
| 1 | `Total Fouls` | `s=>s.fouls` | ✅ đã có (`foul`+`foul throw`+`handball foul`) |
| 2 | `Fouls` | `s=>s.foulsPlain` | 🆕 counter, event `foul` đã có |
| 3 | `Handball Foul` | `s=>s.handballFouls` | 🆕 counter, event `handball foul` đã có |
| 4 | `Foul Throw` | `s=>s.foulThrows` | 🆕 counter, event `foul throw` đã có |
| 5 | `Fouls Won` | `s=>s.foulsWon` | ✅ đã có |
| 6 | `Yellow Cards` | `s=>s.yellowCards` | 🆕 counter — **§7**, không qua `EVENT_INC` |
| 7 | `Red Cards` | `s=>s.redCards` | 🆕 counter — **§7** |
| 8 | `Offsides` | `s=>s.offsides` | ✅ đã có |

`EVENT_INC` — **cộng thêm, không sửa dòng cũ**:

```js
'foul'         : ['fouls','foulsPlain'],       // 'fouls' giữ nguyên vị trí đầu
'foul throw'   : ['fouls','foulThrows'],
'handball foul': ['fouls','handballFouls'],
```

> **Bất biến kiểm được (T5):** `fouls === foulsPlain + foulThrows + handballFouls`, **luôn luôn,
> với mọi trận, kể cả trận từ tháng 5.** Đây là thứ loại B cho không mà loại C không bao giờ có.

Tên `foulsPlain` xấu, và đó là chủ ý: `fouls` đã bị chiếm bởi **tổng**, và đổi nghĩa `fouls` sẽ
làm sai `TEAM_SECTIONS`, `report.js:1311`, `PLAYER_CATS.other` cũ và cột `Fouls` của radar PDF
cùng lúc. Một cái tên xấu ở một chỗ tốt hơn một cái tên đẹp ở sáu chỗ sai. *(Tên khác: `foulsOnly`,
`plainFouls` — thuần thẩm mỹ, không đổi thiết kế.)*

---

### 4.3 Tab **Set Pieces** — 11 cột, **6 cột không có gì đứng sau**

| # | Nhãn | Biểu thức | Nguồn |
|---|---|---|---|
| 1 | `Freekicks` | `s=>s.freeKicks` | ✅ |
| 2 | `Freekicks: Shots Off Target` | `s=>s.spDetail?s.fkShotsOff:'—'` | ❌ **§5** |
| 3 | `Freekicks: Shots On Target` | `s=>s.spDetail?s.fkShotsOn:'—'` | ❌ **§5** |
| 4 | `Freekicks: Crosses` | `s=>s.spDetail?s.fkCrosses:'—'` | ❌ **§5** |
| 5 | `Freekicks: Crosses Succeeded` | `s=>s.spDetail?s.fkCrossesComp:'—'` | ❌ **§5** |
| 6 | `Corners` | `s=>s.corners` | ✅ |
| 7 | `Penalty Kicks` | `s=>s.penalties` | ✅ |
| 8 | `Throw-Ins` | `s=>s.throwIns` | ✅ |
| 9 | `Goal Kicks` | `s=>s.goalKicks` | ✅ |
| 10 | `Set Piece Shot` | `s=>s.spDetail?s.setPieceShots:'—'` | ❌ **§5** |
| 11 | `Set Piece Goal` | `s=>s.spDetail?s.setPieceGoals:'—'` | ❌ **§5** |

Năm cột ✅ chỉ là **chuyển nhà** từ `PLAYER_CATS.other` — không đụng counter, không đụng
`EVENT_INC`. Sáu cột ❌ là toàn bộ §5.

---

## 5. Vấn đề cốt lõi — sáu cột không có event nào đứng sau

### 5.1 Nói thẳng vấn đề

Không có event nào tên `free-kick shot on target`. Có `free-kick`, có `shot on target`. Câu hỏi:
**"cú sút này đến từ quả đá phạt hay từ bóng sống?"** — hàng dữ liệu có trả lời được không?

**Có — nhưng chỉ khi analyst tag chúng trong CÙNG MỘT LƯỢT NHẬP.**

[index.html:2691](../index.html:2691):

```js
const grpId = evs.length>1 ? newId() : null;
```

Gõ `12k*dd` (đá phạt + sút trúng đích, cầu thủ 12) sinh **hai hàng chung một `grp`**. Gõ `12k`
Enter rồi `12dd` Enter sinh **hai hàng `grp=null`**. Cùng một sự việc trên sân, hai hình dạng dữ
liệu khác nhau.

`grp` **có** đi qua cloud và **có** nằm trong báo cáo đã publish:
[cloud-sync.js:40](../cloud-sync.js:40) ghi nó vào `attributes`, [:56](../cloud-sync.js:56) đọc
lại, `buildReport()` [:556](../cloud-sync.js:556) mang `rows: stored.map(dbToRow)`. Nên cách suy
ra này **chạy được ở cả ba nơi**: trang Stats, báo cáo publish, và site khách.

### 5.2 Repo đã dùng đúng thủ thuật này rồi

[shared.js:438](../shared.js:438) `shotBodyPart()`:

```js
if(shot.grp!=null){const g=rows.find(r=>r.grp===shot.grp&&bp(r)); if(g)return bp(g);}
```

*"The body part it was taken with is a separate event tagged in the SAME chain entry"* —
`"2 free-kick shot-on-target left-foot"`. **Comment trong repo dùng đúng ví dụ đá phạt.** Cơ chế
đã có, đã chạy, đã được test. §5.3 chỉ mở rộng nó.

### 5.3 Ba phương án

| | Phương án | Điều gì xảy ra | Phán quyết |
|---|---|---|---|
| **A** | **Suy ra từ `grp`** | 0 event mới · 0 rủi ro mã phím · 0 seed script · **có hiệu lực ngược** với mọi trận đã tag theo chuỗi | ✅ **Chọn** |
| **B** | Thêm 6 event (`free-kick shot on target`, `set piece goal`…) | Từ điển 65 → 71. Phải chọn 6 mã phím không đụng 65 event + macro người dùng (§7.2 tài liệu cũ). Cần seed script như `seed_gk_events.js`. **Đếm đôi**: tag cả `dd` lẫn `free-kick shot on target` là `shotsOn` +2. Trận cũ = `—` vĩnh viễn. | ❌ đắt hơn, và tệ hơn |
| **C** | Suy theo cửa sổ thời gian (*"sút trong 6s sau quả phạt"*) | Không cần chuỗi. Nhưng 6s là con số bịa; hai lần chạy trên cùng dữ liệu cho hai kết quả nếu ai đó chỉnh hằng số. | ❌ **bịa dữ liệu** |

**Phương án A thắng ở một điểm quyết định: nó không thêm gì vào việc analyst phải làm.** Chuỗi
`12k*c*z` (đá phạt + tạt thành công + đường chuyền quyết định) là cách gõ **đã được khuyến khích
từ trước** — nó vốn là cách để một lượt nhập thành một dòng trong bảng Events.

### 5.4 Luật đếm — viết ra chính xác, vì mơ hồ ở đây là bug

**Định nghĩa 1 — event set piece:**
```js
const SET_PIECE_EVENTS = new Set(['free-kick','corner-kick','penalty kick',
                                  'throw-ins','throw-in','goal kick']);
```
⚠️ **Bắt buộc tra qua `evKey()`.** Từ điển thật viết `throw-Ins` — **chữ I hoa**
([pitchtagger_events.json](../pitchtagger_events.json)). So sánh `r.event === 'throw-ins'` sẽ ra
**0, im lặng**. §10.1.

**Định nghĩa 2 — chuỗi đủ điều kiện:** một tập hàng cùng `grp` (`grp != null`), cùng `team`, chứa
ít nhất một tên trong `SET_PIECE_EVENTS`. Chuỗi chứa `free-kick` thì thêm là **chuỗi đá phạt**.

**Định nghĩa 3 — ai được ghi công:** **cầu thủ trên chính hàng mang hành động được đo** —
`playerFrom` của hàng `shot on target`, không phải của hàng `free-kick`.

> Vì sao: nó biến **mọi cột mới thành tập con chặt của một cột đã có**.
> `Freekicks: Shots On Target` ⊆ `Shots On Target`. `Set Piece Goal` ⊆ `Goals`. Đó là bất biến
> test được (T7), và nó khiến một quả phạt góc đá bởi #17 rồi #14 đánh đầu ghi bàn được tính đúng
> cho **#14**. Ghi công cho người đá phạt thì hai cột hết cộng lại được với nhau.
>
> **→ Q3 (§14)** nếu bạn muốn ghi công cho **người thực hiện quả set piece** thay vì người dứt điểm.

**Luật đếm đầy đủ, với mỗi hàng `r` trong một chuỗi đủ điều kiện, `e = evKey(r.event)`:**

| Cột | Điều kiện |
|---|---|
| `Set Piece Shot` | `SHOT_KINDS.has(e)` — cả 5 loại: goal, on/off target, blocked, miss |
| `Set Piece Goal` | `e === 'goal'` |
| `Freekicks: Shots On Target` | chuỗi có `free-kick` **và** `e ∈ {'shot on target','goal'}` |
| `Freekicks: Shots Off Target` | chuỗi có `free-kick` **và** `e === 'shot off target'` |
| `Freekicks: Crosses` | chuỗi có `free-kick` **và** `e ∈ {'cross success','cross fail'}` |
| `Freekicks: Crosses Succeeded` | chuỗi có `free-kick` **và** `e === 'cross success'` |

> `goal` **được tính là on target**, khớp với `EVENT_INC['goal']=['goals','totalShots','shotsOn']`
> và với cột `Shots On Target` ở tab Shooting. Không làm thế thì bảng tự mâu thuẫn.
>
> `own goal` **không** được tính — nó không cộng vào `goals` hay `totalShots`
> ([shared.js:272](../shared.js:272)) và bàn phản lưới từ quả phạt góc không phải "set piece goal"
> của đội đá phạt góc.

**Cờ `spDetail` — và nó KHÁC `duelDetail`:**

`duelDetail` tăng **mỗi event**. `spDetail` phải là **cờ mức TRẬN, đóng lên mọi cầu thủ**, chứ
không phải mức event. Lý do là một bug thật:

> Một tiền đạo ghi bàn từ quả phạt góc do người khác đá. Nếu `spDetail` chỉ tăng trên hàng của
> người **đá phạt**, thì tiền đạo có `setPieceGoals = 1` nhưng `spDetail = 0` → cột in **`—` trong
> khi đang cầm số 1**. Sai kiểu tệ nhất: giấu đi một con số có thật.

Nên, chạy **một lần ở cuối `computeStats`**:

```js
// "trận này có được tag theo chuỗi không" — một câu về TRẬN, đóng lên mọi cầu thủ được tag
if(anyChainedSetPiece) Object.values(P).forEach(p=>p.spDetail++);
```

Cầu thủ chưa từng bị tag không có mặt trong `P`; `withSquad()` độn họ vào sau bằng `newStat()`
(cờ = 0) → họ đọc `—`, đúng với "không có gì để nói". Cộng dồn cả mùa vẫn đúng: `spDetail` thành
"số trận có chuỗi mà anh ta có mặt", và chỉ được đọc theo tính đúng/sai như mọi cờ khác.

### 5.5 Điểm yếu của phương án A — nói ra, không giấu

**Sáu cột này đo kỷ luật tag, không chỉ đo trận đấu.** Một analyst gõ quả phạt và cú sút thành hai
lượt Enter riêng sẽ thấy `Set Piece Shot = 0` trong khi trận có 5 cú. Cờ `spDetail` bắt được
trường hợp **không bao giờ chuỗi hoá** (in `—` cho cả bảng), nhưng **không** bắt được trường hợp
*chuỗi lúc có lúc không* — ở đó số sẽ **thấp hơn sự thật, và trông vẫn hợp lý.**

Ba việc phải làm kèm theo, không phải tuỳ chọn:

1. **Trang Guide** ([client/guide.html](../client/guide.html)) thêm một dòng: sáu cột này chỉ có
   khi set piece và kết quả của nó được gõ **trong cùng một lượt** — `12k*dd`, không phải `12k` ⏎
   `12dd`.
2. **Tooltip trên `<th>`** của sáu cột, nói đúng câu ấy tại chỗ.
3. **Không** thêm check vào cổng Submit Analysis. Cổng hiện có 11 check, mỗi check là một **đẳng
   thức bắt buộc đúng** ([index.html:3000](../index.html:3000)). *"Đáng lẽ nên chuỗi hoá"* không
   phải đẳng thức — nó là thói quen, và biến nó thành cổng chặn sẽ chặn cả những trận hợp lệ.
   **→ Q4 (§14)** nếu bạn muốn một *cảnh báo* (không chặn) thay vì im lặng.

---

## 6. Bỏ `Ground Duels` khỏi tab Defensive — cái gì mất, cái gì còn

Bạn viết: *"loại bỏ ground duel tại defensive, thay bằng physical duel và loose ball duel"*.

`PLAYER_CATS.defensive` hôm nay có 17 cột, trong đó 6 cột duel mặt đất:

```js
['Ground Duels',     s=>s.groundDuels],          // ← bỏ
['Ground Duels Won', s=>s.groundDuelsWon],       // ← bỏ
['Physical Duels',   s=>s.duelDetail?s.physicalDuels:'—'],       // ← giữ
['Physical Won',     s=>s.duelDetail?s.physicalDuelsWon:'—'],    // ← giữ
['Loose Ball Duels', s=>s.duelDetail?s.looseBallDuels:'—'],      // ← giữ
['Loose Ball Won',   s=>s.duelDetail?s.looseBallDuelsWon:'—'],   // ← giữ
```

→ còn **15 cột**. Bốn cột giữ lại **đã tồn tại**, chỉ có hai cột bị xoá. Thay đổi nhỏ nhất trong
tài liệu này về mặt mã, và **lớn nhất về mặt hệ quả**.

### 6.1 Cái mất: mọi trận tag trước 2026-08-28 thành một hàng `—` toàn phần

[shared.js:372](../shared.js:372) đã viết sẵn lý do, một tháng trước, bằng chữ:

> *"They sit UNDER the total rather than replacing it, because the total is the one figure that
> means the same thing in every match ever tagged."*

Một trận tháng 5 với 34 duel mặt đất, sau thay đổi này, ở tab Defensive sẽ đọc:

| Physical Duels | Physical Won | Loose Ball Duels | Loose Ball Won |
|---|---|---|---|
| — | — | — | — |

**34 biến mất khỏi bảng.** Không sai — `—` vẫn nói thật rằng chi tiết chưa từng được hỏi — nhưng
con số **duy nhất liền mạch** không còn cửa nào để hiện ra ở tab đó nữa.

### 6.2 Nó còn sống ở đâu (đã kiểm từng chỗ)

| Nơi | Sau thay đổi | Ghi chú |
|---|---|---|
| `TEAM_SECTIONS` → **trang Overall** | ✅ **còn** `Ground Duels` / `Ground Duels Won` | §9 không đụng |
| **PDF** [report.js:742](../Stats/report.js:742) cột `Ground` | ✅ **còn** | `report.js` = 0 dòng |
| **Dashboard** → `DEF_CATS.ground` | ✅ **còn** (và §8.4 thêm hai mục mới cạnh nó) | |
| **Site khách** → Team Data / Defensive | ✅ **còn** (đọc `TEAM_SECTIONS`) | |
| **Site khách** → Player Data / Defensive | ❌ **mất** (đọc `PLAYER_CATS`) | cùng mảng, cùng số phận |
| `EVENT_INC`, `newStat()`, SQL | ✅ **không đụng một dòng** | dữ liệu nguyên vẹn |

**Không có hàng nào trong `public.events` bị chạm.** Bỏ cột là bỏ **cách hiển thị**, không phải bỏ
dữ liệu — bật lại sau này chỉ là thêm lại hai dòng. Đó là điều khiến khuyến nghị dưới đây an toàn.

### 6.3 Khuyến nghị

**Làm đúng như bạn yêu cầu** — bỏ hai cột — vì (a) dữ liệu không mất, (b) con số vẫn hiện ở Overall
và PDF, (c) tab Defensive đang có 17 cột và cần chỗ thở.

**→ Q1 (§14):** nếu bạn muốn giữ liền mạch tuyệt đối, phương án thay thế là giữ `Ground Duels` /
`Ground Duels Won` làm **hai cột cuối** của tab Defensive (17 cột, không đổi số) và hiểu chúng là
"tổng họ duel mặt đất". Bốn cột mới đứng trước, tổng đứng sau. Không có phương án thứ ba nào tránh
được `—` mà không bịa số.

---

## 7. Thẻ vàng / thẻ đỏ — repo đã trả lời câu này rồi, và câu trả lời **không** phải `EVENT_INC`

[client/assets/app.js:761](../client/assets/app.js:761) nói rõ:

> *"Cards are the one thing `newStat()` does not carry, so they are counted off the rows through
> `shared.js`'s `classifyCards()` — the same reading the match timeline and the Overview's
> `discipline()` take, so a player's two yellows and his club's card count cannot tell different
> stories."*

`classifyCards()` ([shared.js](../shared.js)) đọc **một thẻ vàng thứ hai** thành `y2`, và **bỏ**
hàng `red card` dư thừa đi kèm nó:

```js
if(e==='yellow card'){yc[k]=(yc[k]||0)+1; out.set(r, yc[k]>=2?'y2':'yc');}
else if(e==='red card'){ if((total[k]||0)<2)out.set(r,'rc'); }
```

Nếu ta thêm `'yellow card':['yellowCards']` vào `EVENT_INC`, một cầu thủ nhận hai thẻ vàng rồi bị
đuổi sẽ đọc **2 vàng / 1 đỏ** ở bảng Stats — nhưng site khách đã in **2 vàng / 1 đỏ** với `y2` cộng
cả hai. Trùng khớp? **Không**, vì hàng `red card` tường minh mà trọng tài ghi kèm sẽ khiến
`EVENT_INC` đếm **2 đỏ** còn `classifyCards` đếm **1**. Hai trang, hai con số, cùng một trận.

**Nên: hai counter mới nhưng KHÔNG qua `EVENT_INC`** — chúng được nạp ở lượt hai của `computeStats`
(§8.2):

```js
classifyCards(rows).forEach((kind,r)=>{
  if(r.team!==team)return;
  const a=(r.playerFrom||'').toString().trim(); if(!a)return;
  const p=get(a);
  if(kind==='yc')p.yellowCards++;
  else if(kind==='y2'){p.yellowCards++;p.redCards++;}   // thẻ vàng thứ hai, và cái đỏ mà nó là
  else if(kind==='rc')p.redCards++;
});
```

Đúng từng dòng với `playerCards()` của site khách — vì nó **là** `playerCards()`, chuyển vào chỗ
mà cả hai trang cùng đọc. Sau đó `playerCards()` trong `app.js` **thành thừa** và có thể trỏ về
`s.yellowCards` / `s.redCards`. **→ Q5 (§14):** dọn luôn hay để lại?

⚠️ **`classifyCards` bỏ qua hàng có `t == null`** (`.filter(r=>r&&r.t!=null)`). Một thẻ tag không
có mốc thời gian sẽ **không được đếm**. Đó là hành vi hiện tại của site khách và của timeline; ta
kế thừa nguyên vẹn, cố ý, và test T9 khoá lại.

⚠️ **Truyền `rows` đầy đủ (cả hai đội) vào `classifyCards`, không phải `mine`.** Nó khoá theo
`team + player` bên trong, và cắt trước sẽ làm sai việc đếm thẻ vàng thứ hai nếu số áo trùng nhau
giữa hai đội.

---

## 8. Thiết kế chi tiết — theo từng file

### 8.1 `shared.js` — nơi phần lớn công việc nằm

| Chỗ | Sửa gì |
|---|---|
| `EVENT_INC` [:191](../shared.js:191) | **3 dòng foul** cộng thêm counter thứ hai. Không có dòng nào bị xoá. |
| `newStat()` [:284](../shared.js:284) | **+12 khoá**: `foulsPlain, foulThrows, handballFouls, yellowCards, redCards` · `fkShotsOn, fkShotsOff, fkCrosses, fkCrossesComp, setPieceShots, setPieceGoals` · cờ `spDetail`. Đặt **cuối object**, giá trị 0. |
| `computeStats()` [:329](../shared.js:329) | **+2 lượt** (§8.2) |
| `PLAYER_CATS` [:357](../shared.js:357) | `defensive` bỏ 2 dòng · `other` **xoá** · **+3 khoá mới** |
| `TEAM_SECTIONS` [:728](../shared.js:728) | section 3 → 3 section (§9) |
| `SET_PIECE_EVENTS` | **hằng mới**, đặt cạnh `SHOT_KINDS` [:435](../shared.js:435) |
| `STAT_HEADERS` / `STAT_GROUPS` / `statRow` | **KHÔNG ĐỤNG** — §8.9 |

### 8.2 `computeStats()` — thay đổi kiến trúc duy nhất

Hôm nay nó là một vòng lặp thuần trên từng hàng. Nó phải trở thành ba lượt:

```js
function computeStats(rows,team){
  const P={}; const get=n=>{if(!P[n])P[n]=newStat();return P[n];};
  const mine=rows.filter(r=>r.team===team);
  // lượt 1 — y như cũ, không đổi một ký tự
  mine.forEach(r=>{
    const a=(r.playerFrom||'').toString().trim(); if(!a)return;
    const inc=EVENT_INC[evKey(r.event)]; if(inc){const p=get(a);inc.forEach(k=>p[k]++);}
  });
  // lượt 2 — thẻ phạt: cần thấy thẻ vàng TRƯỚC ĐÓ của cùng cầu thủ (§7)
  cardFold(rows,team,get);
  // lượt 3 — set piece: cần thấy các hàng khác trong CÙNG lượt nhập (§5)
  setPieceFold(mine,get,P);
  return P;
}
```

**Chi phí:** `cardFold` là `O(n log n)` (`classifyCards` có một `sort`); `setPieceFold` là `O(n)`
với một `Map`. Một trận đầy đủ khoảng 1.5–3k hàng — không đáng kể so với việc vẽ SVG mà mỗi lần
`renderStats()` đã làm.

**Hai lượt mới KHÔNG được đụng vào bất kỳ khoá nào của lượt 1.** Đó là điều khiến toàn bộ 45 cột
hiện có bất biến theo nghĩa đen, và là test T1 (§11.1).

### 8.3 `index.html` — **bản sao thứ hai của toàn bộ engine**

[index.html:3890](../index.html:3890) trở đi mang bản sao riêng của `EVENT_INC`, `newStat`,
`computeStats`, `TEAM_SECTIONS`. Tab tagging **không nạp `shared.js`**.

Mọi thứ ở §8.1 và §8.2 phải làm **lần thứ hai** ở đây, trừ `PLAYER_CATS` (bản `index.html` không
có — nó dùng `STAT_HEADERS`/`statRow`, xem §8.9).

Bản `index.html` phải sửa: `EVENT_INC` (3 dòng), `newStat()` (+12 khoá), `computeStats()` (+2 lượt),
`TEAM_SECTIONS` (§9), `SET_PIECE_EVENTS` (hằng mới).

> ⚠️ **`index.html` KHÔNG có `classifyCards` — đã kiểm, 0 kết quả.** Trang này chưa bao giờ cần
> đọc thẻ phạt: timeline tóm tắt trận nằm ở `stats-view.js`, không ở đây. Nên §7 kéo theo **một
> hàm thứ năm phải sao chép sang** (~10 dòng). Phương án tránh né — bỏ hai dòng `Yellow Cards` /
> `Red Cards` khỏi `TEAM_SECTIONS` của `index.html` — bị **loại**: hai bản `TEAM_SECTIONS` lệch
> nhau chính là cách chúng đã lệch 4 chỗ lần trước.

> Hai bản sao này **đã lệch nhau 4 chỗ** trước đây, và tài liệu tháng trước đã vá
> (§9 tài liệu cũ). Test T2 (§11.1) so khớp danh sách khoá của `newStat()` giữa hai bản để lần
> lệch tiếp theo bị bắt ngay chứ không phải sáu tháng sau.

### 8.4 `Stats/stats-view.js`

| Chỗ | Sửa gì |
|---|---|
| `CHROME` [:2303](../Stats/stats-view.js:2303) | 4 → **6 nút** `data-cat` |
| `statCat` mặc định [:48](../Stats/stats-view.js:48) | giữ `'shooting'` |
| `othCat` [:48](../Stats/stats-view.js:48) | đổi tên → `foulCat`, hoặc **giữ nguyên tên** để bớt nhiễu — **khuyến nghị: giữ**, chỉ đổi chỗ dùng |
| `dashboardHTML` [:139](../Stats/stats-view.js:139) | `statCat==='other'` → `'fouls'`, **+2 nhánh mới** |
| `OTH_CATS` [:591](../Stats/stats-view.js:591) | giữ nguyên 3 mục, nay thuộc tab *Fouls* |
| `DEF_CATS` [:180](../Stats/stats-view.js:180) | **+2 mục** `physical`, `looseBall` (§8.4.2) |
| `buildSheets` [:1166](../Stats/stats-view.js:1166) | **0 dòng** — tự động ra 12 sheet |
| `FILM_EV_GROUPS` [:1345](../Stats/stats-view.js:1345) | **0 dòng** — §8.7 |

#### 8.4.1 Dashboard cho ba tab mới — bắt buộc, không phải tuỳ chọn

`catToggle` do **Dashboard và Stats dùng chung** ([:92](../Stats/stats-view.js:92)
`perTeam=statView!=='overall'&&statView!=='film'`). Thêm nút mà không thêm nhánh trong
`dashboardHTML` thì **bấm Goalkeeper ở Dashboard sẽ ra một trang trắng** — không lỗi, không thông
báo. Đây là trạm số 4 ở §2.

| Tab | Dashboard vẽ gì | Chi phí |
|---|---|---|
| `fouls` | **Đúng cái `other` đang vẽ** — `foulMapHTML` + `foul won` + `offside` qua `OTH_CATS` | **0 dòng mới**, chỉ đổi tên nhánh |
| `setPieces` | `plainEventMapHTML(team, name)` + dropdown 5 mục (corner / free-kick / penalty / throw-in / goal kick) | ~8 dòng, **dùng lại hàm đã có** |
| `goalkeeper` | `plainEventMapHTML(team, name)` + dropdown (save · catch · parry · def line support · aerial control · goal conceded) | ~8 dòng, dùng lại hàm đã có |

Cả hai dropdown mới đi theo đúng khuôn `OTH_CATS` + `setOthCat` đã có, và **hai hàm setter mới
phải được thêm vào danh sách `window.*`** ở [:2403](../Stats/stats-view.js:2403) — chúng được gọi
từ `onchange="…"` nội tuyến, biên dịch trong **global scope**, nên quên là dropdown chết im lặng.
Repo đã ghi rõ cảnh báo này ngay tại đó, và có test đọc lại danh sách.

⚠️ `plainEventMapHTML` so `r.event === eventName` **nguyên văn** ([:653](../Stats/stats-view.js:653)).
Với `throw-Ins` thì hỏng. §10.1.

#### 8.4.2 `DEF_CATS` — thêm, không thay

```js
ground:    {label:'Ground Duels',    parts:[['ground duel success','Won','#39d98a'],
                                            ['ground duel fail','Lost','#f7506b']]},
physical:  {label:'Physical Duels',  parts:[['physical duel success','Won','#39d98a'],   // 🆕
                                            ['physical duel fail','Lost','#f7506b']]},
looseBall: {label:'Loose Ball Duels',parts:[['loose ball duel success','Won','#39d98a'], // 🆕
                                            ['loose ball duel fail','Lost','#f7506b']]},
```

`ground` **ở lại**: bản đồ Defensive là nơi cuối cùng người ta còn xem được vị trí của 34 duel mặt
đất trong trận tháng 5 (§6.2). Bảng thì bỏ cột, bản đồ thì giữ mục — hai câu hỏi khác nhau.

### 8.5 Export — 8 → 12 sheet, **0 dòng mã**

```js
['home','away'].forEach(team=>Object.keys(STAT_CATS).forEach(cat=>
  out.push([cat+'_'+team,catSheet(team,cat)])));
```

Đọc thẳng `Object.keys(STAT_CATS)`. Thêm nhóm vào `PLAYER_CATS` là thêm sheet, **không thể lệch**.
Thứ tự mới:

```
shooting_home · distribution_home · defensive_home · goalkeeper_home · setPieces_home · fouls_home
shooting_away · distribution_away · defensive_away · goalkeeper_away · setPieces_away · fouls_away
```

Tên sheet dài nhất `distribution_home` = 17 ký tự, dưới giới hạn 31 của Excel. `setPieces_home`
theo camelCase khớp với khoá — **→ Q phụ:** đổi khoá thành `set_pieces` để tên sheet đọc dễ hơn?
Khuyến nghị **không**: khoá cũng là mảnh hash URL của site khách (`#/data/player/…/setPieces`), và
bốn khoá hiện tại đều một từ, không dấu.

CSV: `buildCsv()` xếp chồng đúng những worksheet ấy → tự động thành 12 khối.

### 8.6 `client/assets/app.js` — **mục nguy hiểm nhất**

```js
var TD_TABS = [
  ['shooting',     'Shooting',     'Attacking Stats'],
  ['distribution', 'Distribution', 'Distribution Stats'],
  ['defensive',    'Defensive',    'Defensive Stats'],
  ['other',        'Other',        'Discipline & GK']     // ← cả hai vế đều biến mất
];
```

Cột 1 là khoá `PLAYER_CATS` (Player Data). Cột 3 là **tên** section `TEAM_SECTIONS` (Team Data).
Sau thay đổi này **cả hai đều không còn tồn tại**, và cả hai đều hỏng **im lặng**:

* `catCols('other')` → `(C && C['other']) || []` → `[]` → bảng rỗng.
* `sectionCols('Discipline & GK')` → `found ? found[1] : []` → `[]` → bảng rỗng.

Bảng mới:

```js
var TD_TABS = [
  ['shooting',     'Shooting',     'Attacking Stats'],
  ['distribution', 'Distribution', 'Distribution Stats'],
  ['defensive',    'Defensive',    'Defensive Stats'],
  ['goalkeeper',   'Goalkeeper',   'Goalkeeper Stats'],    // 🆕
  ['setPieces',    'Set Pieces',   'Set Piece Stats'],     // 🆕
  ['fouls',        'Fouls',        'Fouls & Discipline']   // 🆕
];
```

**Và `GK_TABS` — chỗ hai chữ "goalkeeper" gặp nhau:**

```js
var GK_TABS = TD_TABS.map(function (t) {
  return t[0] === 'shooting' ? ['goalkeeping', 'Goalkeeping'] : t;
});
```

Với thủ môn, `shooting` được thay bằng `goalkeeping` → `GK_COLS` (16 cột, 2 tham số). Nếu để
nguyên, một thủ môn sẽ có **cả** tab `Goalkeeping` (GK_COLS) **lẫn** tab `Goalkeeper`
(PLAYER_CATS) — hai tab tên gần giống nhau, nội dung chồng nhau 12/15 cột. Người dùng sẽ nghĩ là bug.

```js
var GK_TABS = TD_TABS
  .map(function (t) { return t[0]==='shooting' ? ['goalkeeping','Goalkeeping'] : t; })
  .filter(function (t) { return t[0]!=='goalkeeper'; });   // GK_COLS đã bao trọn nó
```

`GK_COLS` là bản đầy đủ hơn: nó có `Save Rate`, `Clean Sheets`, `On Target Faced` — ba thứ cần cả
trận xung quanh, và `PLAYER_CATS` **không thể** mang.

`TD_GROUP` (gộp tiêu đề cột của Team Data) cũng cần **5 dòng mới** cho `Yellow Cards`, `Red Cards`,
`Handball Foul`, `Foul Throw`, `Total Fouls`. Bỏ qua thì cột vẫn hiện, chỉ là không có tiêu đề
nhóm — hỏng nhẹ, hỏng thấy được. Ưu tiên thấp nhưng có trong checklist.

### 8.7 `FILM_EV_GROUPS` — **0 dòng, và đó là quyết định có chủ ý**

Bộ lọc Film đã có nhóm `Goalkeeping` riêng, và nhóm `Other` gộp set piece + foul + thẻ.

Có nên tách `Other` thành `Set Pieces` / `Fouls` cho khớp với tab mới không? **Không, ở lần này.**

Comment tại [:1319](../Stats/stats-view.js:1319) nói các nhóm ấy *"are shared.js's own
PLAYER_CATS, the four tabs the player table has always been read in"* — nên khớp là đúng tinh
thần. Nhưng: nó là **thứ tự tick trong một panel cuộn**, người dùng đã quen; đổi nhóm là đổi thứ
tự tick của mọi người; và nó **không đổi một con số nào**. Đây là thay đổi thẩm mỹ trong một thay
đổi vốn đã chạm 8 file. **Hoãn — §15.2.**

Nếu làm, chỉ là tách một mảng thành hai và sửa comment; `filmEvGroup()` / `filmEvRank()` đọc lại
chính bảng ấy nên không có chỗ nào lệch được.

### 8.8 `Stats/report.js` — **cam kết 0 dòng**

Đúng khi và chỉ khi:
1. `TEAM_SECTIONS[0..2]` **không đổi thứ tự** (§2.1);
2. mọi counter cũ **giữ nguyên nghĩa** — `s.fouls` vẫn là tổng ba loại, `s.saves` vẫn là họ save,
   `s.groundDuels` vẫn còn;
3. không nhãn nào ở section 0–2 bị đổi tên.

Cả ba đều được thiết kế này giữ. `report.js` **không đọc `PLAYER_CATS`** (đã grep: 0 kết quả), nên
việc chia tab hoàn toàn vô hình với bản PDF.

### 8.9 `STAT_HEADERS` / `STAT_GROUPS` / `statRow` — **không đụng**

Ba hằng này là bảng rộng 40 cột của **tab tagging** ([index.html:4023](../index.html:4023)) và
sheet xlsx của nó. Chúng **không** phải nguồn của tab Stats.

Bản trong `shared.js` [:277](../shared.js:277) hôm nay **không có người đọc ngoài test** — nhưng
`report-visuals.test.js:327` khoá `STAT_HEADERS.length === Σ STAT_GROUPS[i][1]` và
`statRow().length === STAT_HEADERS.length`. Đụng vào một cái là phải đụng cả ba, cho **0 lợi ích**.

> **Hệ quả có chủ ý:** bảng rộng của tab tagging sẽ **không** có 23 cột mới. Nó là bảng làm việc
> lúc đang tag, không phải bảng báo cáo. **→ Q phụ (§14):** đồng bộ nó là một việc riêng, làm sau.

### 8.10 SQL `public.match_stats` — **0 dòng**

View chỉ nuôi bảng tổng hợp của site khách; mọi thứ trong tài liệu này chạy trong trình duyệt trên
`public.events` thô. §10.3 nói về một chỗ lệch **đã có sẵn** mà tài liệu này làm nó dễ thấy hơn.

### 8.11 `Stats/stats-view.css` + `Stats/index.html`

* `Stats/index.html`: `catToggle` 4 → 6 nút. **Phải khớp từng chữ với `CHROME`** — hai bản sao, và
  test đọc cả hai.
* CSS: `.stats-toggle{display:flex;gap:6px}` ([shared.css:28](../shared.css:28)) **không có
  `flex-wrap`**. Sáu nút với nhãn dài (`Distribution`, `Set Pieces`, `Goalkeeper`) sẽ tràn ngang
  ở màn hình hẹp. Thêm `flex-wrap:wrap;justify-content:center` **chỉ cho `.sub-row`** trong
  `stats-view.css`, không đụng `shared.css` — hàng nút ở `<header>` không được xuống dòng.

---

## 9. Trang **Overall** — tách section 3

Trang Overall vẽ `TEAM_SECTIONS` ([stats-view.js:908](../Stats/stats-view.js:908)) thành các thanh
bar đối đầu. Section 4 hiện tại nhét chung 9 dòng thủ môn + set piece + kỷ luật:

```js
['Discipline & GK',[
  ['Goals Conceded',…],['Saves',…],['Fouls',…],['Offsides',…],['Corners',…],
  ['Free-kicks',…],['Throw-ins',…],['Goal Kicks',…],['Penalty Kicks',…]]]
```

Thay bằng **ba section, nối vào sau index 2** (§2.1 — luật bất di bất dịch):

```js
// index 3
['Goalkeeper Stats',[
  ['Goals Conceded',(s,o)=>o.goals+s.ownGoals],        // ⚠ GIỮ NGUYÊN biểu thức suy ra
  ['Saves',(s,o)=>s.saves],
  ['Catches',(s,o)=>s.saveDetail?s.catches:'—'],
  ['Parries',(s,o)=>s.saveDetail?s.parries:'—'],
  ['Def. Line Support',(s,o)=>s.gkCtrlDetail?s.defLineSupportsWon+'/'+s.defLineSupports:'—'],
  ['Aerial Control',(s,o)=>s.gkCtrlDetail?s.aerialControlsWon+'/'+s.aerialControls:'—']]],
// index 4
['Set Piece Stats',[
  ['Corners',(s,o)=>s.corners],['Free-kicks',(s,o)=>s.freeKicks],
  ['Penalty Kicks',(s,o)=>s.penalties],['Throw-ins',(s,o)=>s.throwIns],
  ['Goal Kicks',(s,o)=>s.goalKicks],
  ['Set Piece Shots',(s,o)=>s.spDetail?s.setPieceShots:'—'],
  ['Set Piece Goals',(s,o)=>s.spDetail?s.setPieceGoals:'—']]],
// index 5
['Fouls & Discipline',[
  ['Total Fouls',(s,o)=>s.fouls],['Fouls',(s,o)=>s.foulsPlain],
  ['Handball Fouls',(s,o)=>s.handballFouls],['Foul Throws',(s,o)=>s.foulThrows],
  ['Fouls Won',(s,o)=>s.foulsWon],
  ['Yellow Cards',(s,o)=>s.yellowCards],['Red Cards',(s,o)=>s.redCards],
  ['Offsides',(s,o)=>s.offsides]]]
```

**Bốn ràng buộc của trang Overall — khác bảng Stats:**

1. **`Goals Conceded` phải giữ biểu thức suy ra `o.goals+s.ownGoals`**, không đổi sang
   `s.goalsConceded`. Nó là bàn thua của **đội**, tính từ bàn thắng của đối phương, và
   [shared.js:425](../shared.js:425) nói rõ nó "cannot be forgotten" trong khi event tag tay thì có.
   Đây là dòng dễ sửa nhầm nhất trong toàn bộ tài liệu này.

2. **`numOf()` đọc số đầu tiên trong chuỗi** ([shared.js:753](../shared.js:753)):
   ```js
   const numOf=v=>{const m=(''+v).match(/-?\d+(\.\d+)?/);return m?+m[0]:0;};
   ```
   `'3/5'` → **3**. Nên `Def. Line Support` dạng phân số vẽ thanh bar theo **tử số**, đúng ý ("hỗ
   trợ thành công"). `'—'` → **0** → thanh bar 50/50 (vì `tot=0`). Hành vi hiện có, chấp nhận được.

3. **`teamStatsSheet()`** [index.html:4202](../index.html:4202) lặp `TEAM_SECTIONS` để dựng
   worksheet `team_stats` → tự động có 3 khối mới, **0 dòng**.

4. **Trang Overall là nơi `Ground Duels` sống sót** (§6.2). Section `Defensive Stats` **không đổi**.

**→ Q2 (§14):** ba section này có làm trang Overall dài quá không? Nó vốn đã 41 dòng trong một cột
giữa, nay thành **~50 dòng**. Phương án hẹp hơn: chỉ **tách 9 dòng cũ thành ba nhóm**, không thêm
dòng mới nào (giữ 9 dòng, đổi tiêu đề). Ít thông tin hơn, nhưng không làm trang dài thêm.

---

## 10. Sáu cái bẫy tìm thấy lúc khảo sát

### 10.1 `throw-Ins` — chữ **I hoa** trong từ điển thật

[pitchtagger_events.json](../pitchtagger_events.json): `"name": "throw-Ins"`.

`EVENT_INC` an toàn vì mọi tra cứu đi qua `evKey()` (thường hoá). Nhưng **bốn chỗ không đi qua**:

| Chỗ | Mã | Hậu quả |
|---|---|---|
| `plainEventMapHTML` [:653](../Stats/stats-view.js:653) | `r.event===eventName` | bản đồ set piece **rỗng, im lặng** |
| `foulMapHTML` [:601](../Stats/stats-view.js:601) | `FOUL_EVENTS.has(r.event)` | may mà 3 tên foul đều thường |
| `filmMatches()` | so nguyên văn — **cố ý** | không đụng |
| `unique(sport,event_name)` Postgres | phân biệt hoa/thường | không đụng |

**→ Việc bắt buộc:** `SET_PIECE_EVENTS` phải tra qua `evKey()`, và `plainEventMapHTML` phải đổi
`r.event===eventName` → `evKey(r.event)===evKey(eventName)`. Một dòng, và nó cũng **sửa luôn** một
lỗi đang tiềm ẩn cho `foul won` / `offside` nếu ai đó viết hoa tên trong bảng Event types.

### 10.2 `catToggle` có **hai bản sao** phải khớp từng chữ

[Stats/index.html:54](../Stats/index.html:54) và [stats-view.js:2303](../Stats/stats-view.js:2303)
`CHROME`. Trang Stats dùng bản đầu (`chrome:false`); site khách dùng bản sau. Sửa một, quên một →
**một trong hai site thiếu ba nút**. `tests/stats-view.test.js:166,174` đọc cả hai — và sẽ phải
sửa (§11.2).

### 10.3 SQL đã lệch với `EVENT_INC` về `foul throw` — **từ trước**

[0015_match_stats_event_names.sql:61](../supabase/migrations/0015_match_stats_event_names.sql:61):

```sql
-- a foul conceded. 'foul throw' is a throw-in offence and is left out
count(*) filter (where ev in ('foul','handball foul')) as fouls,
```

SQL: `foul + handball foul`. `EVENT_INC`: `foul + foul throw + handball foul`. **Hai định nghĩa,
hai con số**, và SQL nói rõ đó là **có chủ ý**.

Hôm nay chỗ lệch này vô hình vì cả hai đều gọi là "Fouls". Sau thay đổi này, bảng in **`Total
Fouls`** *và* **`Foul Throw`** cạnh nhau, nên phép trừ hiện ra ngay trước mắt người đọc.

**Không sửa SQL** (0 dòng — §8.10). Thay vào đó **ghi rõ trong tooltip cột `Total Fouls`**:
*"gồm cả foul throw; bảng tổng hợp của site khách thì không"*. Sự thật được nói ra thì không còn
là bug. **→ Q phụ (§14):** hay là thống nhất hai bên?

### 10.4 Cột PLAYER_CATS **phải là hàm một tham số**

`statTableHTML` gọi `c[1](P[no])`. `catSheet` cũng vậy. Chép nhầm một dòng từ `GK_COLS` (2 tham số)
vào tab Goalkeeper → `g.known` với `g === undefined` → **`TypeError`, cả bảng biến mất**.
`tests/player-data.test.js:433` đã có test đúng ý này; §11.2 mở rộng nó cho 6 nhóm.

### 10.5 Chữ trên landing đang hứa sai

[client/index.html:432](../client/index.html:432):

> *"Shooting, Distribution, Defensive and Other — the four tables you read on screen — for both
> squads, eight sheets in all."*

Sau thay đổi: **sáu bảng, mười hai sheet**. [README.md:48](../README.md:48) cũng nói *"the four
categories"*. Cả hai phải sửa **trong cùng commit** — landing chỉ được hứa thứ repo làm được.

### 10.6 `grp` sinh từ `newId()` — chỉ khi chuỗi có ≥2 event

```js
const grpId = evs.length>1 ? newId() : null;   // index.html:2691
const newId = () => crypto.randomUUID();       // index.html:1009
```

UUID, nên không có chuyện hai chuỗi vô tình chung `grp`. Nhưng `dbToRow` viết
`grp: a.grp || null` ([cloud-sync.js:56](../cloud-sync.js:56)) — chuỗi rỗng thành `null`. Với UUID
thì không bao giờ xảy ra; ghi lại đây để lần sau không ai đổi `newId()` thành số đếm từ 0.

---

## 11. Kế hoạch test

### 11.1 File mới: `tests/stats-tabs-split.test.js` (~30 test)

| # | Test | Khoá điều gì |
|---|---|---|
| T1 | 45 cột cũ cho **đúng số như trước** trên một fixture cố định | lượt 2/3 không đụng lượt 1 |
| T2 | `Object.keys(newStat())` **giống hệt nhau** giữa `shared.js` và `index.html` | hai bản không lệch |
| T3 | `saveDetail>0 ⟹ saves ≥ catches+parries`; trận chỉ tag tên mới thì **bằng** | §4.1(a) |
| T4 | 15 cột Goalkeeper là hàm **1 tham số**, gọi được với `newStat()` trần | §10.4 |
| T5 | `fouls === foulsPlain + foulThrows + handballFouls`, **mọi fixture** | §4.2 |
| T6 | Trận tag từ tháng 5 (không cờ) → 4 cột duel `—`, `Total Fouls` là **số thật** | loại B ≠ loại C |
| T7 | `fkShotsOn ≤ shotsOn` · `setPieceGoals ≤ goals` · `fkCrossesComp ≤ fkCrosses ≤ crosses` | §5.4 tập con |
| T8 | Chuỗi `k*dd` → +1 `fkShotsOn`; hai lượt riêng → **+0**; test viết rõ đó là hành vi mong muốn | §5.5 |
| T9 | Hai thẻ vàng → `yellowCards 2, redCards 1`; thêm hàng `red card` tường minh → **vẫn 1** | §7 |
| T10 | Thẻ `t == null` → **không** được đếm | §7 |
| T11 | `spDetail` đóng lên **mọi** cầu thủ được tag; người ghi bàn từ phạt góc không đọc `—` | §5.4 bug |
| T12 | `Object.keys(PLAYER_CATS)` = 6 khoá, đúng thứ tự; **không** còn `other` | §4 |
| T13 | `buildSheets()` ra **12** sheet, đúng thứ tự, mọi tên ≤ 31 ký tự | §8.5 |
| T14 | `TEAM_SECTIONS[0..2]` **giữ nguyên tên và số dòng** | §2.1 — bảo vệ PDF |
| T15 | `TEAM_SECTIONS` `Goals Conceded` vẫn là biểu thức suy ra, **không** `goalsConceded` | §9.1 |
| T16 | `TD_TABS` có 6 mục; **mọi** cột 1 tồn tại trong `PLAYER_CATS`, **mọi** cột 3 tồn tại trong `TEAM_SECTIONS` | §8.6 — đóng cả hai lỗ im lặng |
| T17 | `GK_TABS` **không** chứa `goalkeeper` | §8.6 |
| T18 | Mỗi khoá trong `PLAYER_CATS` có một nhánh trong `dashboardHTML` | §8.4.1 |
| T19 | Mọi setter mới có trong danh sách `window.*` | §8.4.1 |
| T20 | `SET_PIECE_EVENTS` tra qua `evKey`; `throw-Ins` khớp | §10.1 |

### 11.2 Test cũ **sẽ phải sửa** — và vì sao mỗi cái chính đáng

| File | Dòng | Vì sao |
|---|---|---|
| `player-data.test.js` | 432 | `deepEq(Object.keys(PLAYER_CATS),[…4 khoá])` → 6 khoá. **Chính là điều đang làm.** Dòng 435 (`notOk(/Conceded\|Clean Sheet/)`) phải sửa cẩn thận: nhãn `Goals Conceded` mới sẽ khớp regex ấy. Ý của test là *"không có cột nào cần `g`"* → đổi sang kiểm **arity**: `c[1].length === 1` (T4), mạnh hơn và đúng ý hơn regex trên nhãn. |
| `stats-export.test.js` | 4, 76–79, 105 | 8 → 12 sheet. Dòng 105 kiểm "một quả phạt góc dưới tab Other" → chuyển sang `setPieces_home`. |
| `stats-view.test.js` | 178 | `data-cat="other"` → kiểm cả 6 khoá, và **đọc từ `Object.keys(PLAYER_CATS)`** chứ không gõ tay, để lần thêm tab sau không cần sửa test. |
| `data-page.test.js` | 150–155 | regex `(?:shooting\|distribution\|defensive\|other)` và `eq(titles.length,4)` → 6. |
| `report-visuals.test.js` | — | **ĐÃ KIỂM: không phải sửa.** Nó khoá `STAT_HEADERS`/`statRow` (§8.9 không đụng) và tìm `TEAM_SECTIONS` **theo tên** — `sec[0]==='Defensive Stats'` (dòng 341), không theo chỉ số. Đây là bằng chứng cho luật §2.1: tìm theo tên thì sống sót, tìm theo chỉ số thì không. |

### 11.3 Test cũ **không** phải sửa (đã kiểm)

`gk-events-duel-split.test.js` (đọc `EVENT_INC` theo khoá, không theo độ dài) · `analysis-gate.test.js`
(11 check không đổi) · `events-table.test.js` · `goal-spot.test.js` · `film-slicers.test.js`
(§8.7 = 0 dòng) · `minutes-played.test.js` · `stats-general.test.js` · `stats-distribution.test.js` ·
**`report-visuals.test.js`** (đã kiểm — §11.2).

> Nếu bất kỳ file nào trong danh sách này **vẫn** đỏ khi code, dừng lại: đó là dấu hiệu thay đổi
> đã lan ra ngoài phạm vi tài liệu này.

---

## 12. Cache-bust + deploy

`shared.js`, `Stats/stats-view.js`, `client/assets/app.js` đều đổi ⇒ **mọi trang nạp chúng phải
bump `?v=`**, nếu không người dùng cũ chạy JS cũ với dữ liệu mới.

| File | v hiện tại | v mới | Nơi phải sửa |
|---|---|---|---|
| `shared.js` | 24 | **25** | `Stats/index.html:62` · `Player-Lists/index.html:98` · `client/assets/app.js:1623` |
| `Stats/stats-view.js` | 23 | **24** | `Stats/index.html:63` · `client/assets/app.js:1634` |
| `client/assets/app.js` | 46 | **47** | `client/app.html:81` |
| `Stats/stats-view.css` | 9 | **10** *(chỉ khi §8.11 sửa CSS)* | `Stats/index.html:12` · `client/assets/app.js:1631` |

**= 9 dòng `?v=` trên 4 file**, cộng `tests/asset-versions.json` (kiểm sha256 ↔ số v).

**Deploy:** không có file **mới** nào ⇒ **không phải đụng danh sách `cp` ở bước Assemble của
`deploy.yml`**. Đó là cái bẫy đã cắn dự án này trước đây; lần này miễn nhiễm vì mọi thay đổi nằm
trong file đã tồn tại. `docs/stats-tabs-split-design.md` không được deploy, không cần khai báo.

---

## 13. Thứ tự triển khai

1. **`shared.js` — engine trước, giao diện sau.** `newStat()` +12 khoá · `EVENT_INC` 3 dòng foul ·
   `SET_PIECE_EVENTS` · `computeStats` 3 lượt. **Chạy test — 1358 phải vẫn xanh.** Chưa cột nào
   hiện ra, nên chưa gì được đỏ. Bước này một mình đã bắt được lỗi lượt-2-đụng-lượt-1.
2. **`index.html`** — sao chép đúng bước 1. Test lại: **vẫn 1358 xanh.**
3. **Test mới `tests/stats-tabs-split.test.js`**, phần T1–T11 (chỉ engine). Viết trước khi động
   vào giao diện — đây là chỗ luật §5.4 được chốt bằng mã thay vì bằng chữ.
4. **`shared.js` — `PLAYER_CATS`.** Từ lúc này `player-data.test.js` và `data-page.test.js` đỏ,
   **đúng như dự đoán §11.2**. Sửa chúng ngay, không để dồn.
5. **`Stats/stats-view.js` + `Stats/index.html`** — `CHROME`, `catToggle`, `dashboardHTML`,
   `DEF_CATS`, `plainEventMapHTML` dùng `evKey`, `window.*`.
6. **`client/assets/app.js`** — `TD_TABS`, `GK_TABS`, `TD_GROUP`.
7. **`TEAM_SECTIONS` ×2** (§9). T14/T15 phải xanh **trước** khi mở PDF ra xem.
8. **CSS** `flex-wrap` (§8.11).
9. **Chữ:** `client/index.html:432`, `README.md:48`, tooltip §5.5 + §10.3, Guide.
10. **Cache-bust** (§12) + `tests/asset-versions.json`.
11. **`node tests/run.js`** — phải xanh toàn bộ.
12. **Kiểm bằng mắt, 6 chỗ:** (a) 6 nút ở tab Stats · (b) 6 nút ở tab **Dashboard**, mỗi nút vẽ ra
    thứ gì đó · (c) XLSX có 12 sheet · (d) trang Overall có 6 section · (e) **PDF** vẫn in đúng
    Attacking / Distribution / Defensive · (f) site khách: Data → Player → một thủ môn, và một cầu
    thủ ngoài sân.

---

## 14. Câu hỏi cần bạn trả lời trước khi code

| # | Câu hỏi | Khuyến nghị | Ảnh hưởng |
|---|---|---|---|
| **Q1** | Bỏ hẳn `Ground Duels`/`Ground Duels Won` khỏi tab Defensive (mọi trận cũ đọc `—`), hay **giữ lại làm 2 cột cuối** như tổng của họ duel? | **Bỏ hẳn, đúng như bạn viết** — số vẫn còn ở Overall + PDF + bản đồ Defensive | §6 |
| **Q2** | Trang Overall: **tách 9 dòng cũ thành 3 nhóm** (không dài thêm), hay **3 nhóm + dòng mới** (~50 dòng)? Và cột 15 của tab Goalkeeper nên là `Goals Conceded` hay `Goals Conceded (tagged)`? | 3 nhóm **có** dòng mới · nhãn **`(tagged)`** | §9, §4.1(c) |
| **Q3** | Sáu cột set piece: **suy từ `grp`** (phương án A), hay **thêm 6 event mới** (phương án B)? Và ghi công cho **người dứt điểm** hay **người thực hiện set piece**? | **A** + ghi công **người dứt điểm** | §5 |
| **Q4** | Có thêm **cảnh báo không chặn** ở Submit Analysis khi trận có set piece nhưng chưa từng chuỗi hoá? | **Không** ở lần này — cổng là nơi của đẳng thức | §5.5 |
| **Q5** | Sau khi `newStat()` mang thẻ phạt, có dọn `playerCards()` trong `app.js` để trỏ về counter mới không? | **Có** — hai bản sao là cách chúng bắt đầu lệch nhau | §7 |

**Ba câu phụ, không chặn:** (i) khoá `setPieces` hay `set_pieces`? (**setPieces**) · (ii) thống nhất
`foul throw` giữa SQL và `EVENT_INC`? (**không, chỉ ghi chú**) · (iii) đồng bộ bảng rộng 40 cột của
tab tagging với 23 cột mới? (**việc riêng, làm sau**)

---

## 15. Hàng rào — cái gì **không** đổi

### 15.1 Cam kết 0 dòng thay đổi

`Stats/report.js` · `supabase/migrations/**` · `worker/**` · `auth.js` · `auth.html` ·
`cloud-sync.js` · `pitchtagger_events.json` · `seed_gk_events.js` · `client/assets/film-tools.js` ·
`client/assets/supa.js` · `.github/workflows/deploy.yml` · `shared.css` *(§8.11 sửa
`stats-view.css`, không sửa `shared.css`)*.

### 15.2 Hoãn có chủ ý

| Việc | Vì sao hoãn |
|---|---|
| Tách `FILM_EV_GROUPS` `Other` → `Set Pieces` / `Fouls` | thẩm mỹ, đổi thứ tự tick người dùng đã quen (§8.7) |
| Đồng bộ `STAT_HEADERS`/`statRow` của tab tagging | bảng làm việc, không phải bảng báo cáo (§8.9) |
| Radar / biểu đồ PDF cho ba nhóm mới | `report.js` = 0 dòng là điều khiến thay đổi này an toàn |
| Thống nhất `foul throw` giữa SQL và `EVENT_INC` | đổi nghĩa một cột site khách đang đọc (§10.3) |

### 15.3 Bất biến dữ liệu — không một hàng nào bị viết lại

**Không có migration. Không có `UPDATE`. Không có `EV_ALIAS` mới.** Mỗi con số mới trong tài liệu
này hoặc (a) đọc lại thứ đã nằm trong `public.events` từ đầu (loại B), hoặc (b) là phép nối các
hàng đã có qua `grp` (loại C), hoặc (c) đã được đếm từ tháng trước và chỉ chưa được bày ra (loại A).

---

## Phụ lục A — 68 cột, đủ sáu nhóm

| Nhóm | Số cột | Cột |
|---|---|---|
| `shooting` | 9 | *(không đổi)* Goals · Assists · Key Passes · Total Shots · Shots On Target · Shots Off Target · Blocked Shots · Miss Shots · Shooting Accuracy |
| `distribution` | 10 | *(không đổi)* Passes · Passes Completed · Pass Accuracy · Crosses · Crosses Completed · Cross Accuracy · Take-ons · Take-ons Won · Take-on Success · Step-ins |
| `defensive` | **15** *(−2)* | Tackles · Tackles Won · Tackle Success · Interceptions · Clearances · Blocks · Recoveries · ~~Ground Duels~~ · ~~Ground Duels Won~~ · Physical Duels · Physical Won · Loose Ball Duels · Loose Ball Won · Aerial Duels · Aerial Duels Won · Take-on Concerns · Mistakes |
| `goalkeeper` 🆕 | 15 | §4.1 |
| `setPieces` 🆕 | 11 | §4.3 |
| `fouls` 🆕 | 8 | §4.2 |

## Phụ lục B — 12 khoá mới của `newStat()`

| Khoá | Nạp từ đâu | Loại (§3) |
|---|---|---|
| `foulsPlain` | `EVENT_INC['foul']` | B |
| `foulThrows` | `EVENT_INC['foul throw']` | B |
| `handballFouls` | `EVENT_INC['handball foul']` | B |
| `yellowCards` | **lượt 2** — `classifyCards` | B |
| `redCards` | **lượt 2** — `classifyCards` | B |
| `fkShotsOn` | **lượt 3** — join `grp` | C |
| `fkShotsOff` | **lượt 3** | C |
| `fkCrosses` | **lượt 3** | C |
| `fkCrossesComp` | **lượt 3** | C |
| `setPieceShots` | **lượt 3** | C |
| `setPieceGoals` | **lượt 3** | C |
| `spDetail` | **lượt 3, mức trận** — chỉ đọc theo tính đúng/sai | cờ |

## Phụ lục C — bảng rà khi code

| Đã sửa? | File | Việc |
|---|---|---|
| ☐ | `shared.js` | `EVENT_INC` ×3 · `newStat` +12 · `computeStats` 3 lượt · `SET_PIECE_EVENTS` · `PLAYER_CATS` · `TEAM_SECTIONS` |
| ☐ | `index.html` | y hệt trên, trừ `PLAYER_CATS` · **chép thêm `classifyCards`** (chưa có) |
| ☐ | `Stats/stats-view.js` | `CHROME` 6 nút · `dashboardHTML` 3 nhánh · `DEF_CATS` +2 · `plainEventMapHTML` dùng `evKey` · `window.*` +2 |
| ☐ | `Stats/index.html` | `catToggle` 6 nút · `?v=` ×3 |
| ☐ | `Stats/stats-view.css` | `.sub-row{flex-wrap:wrap}` |
| ☐ | `client/assets/app.js` | `TD_TABS` 6 · `GK_TABS` filter · `TD_GROUP` +5 · `?v=` ×4 |
| ☐ | `client/app.html` | `app.js?v=47` |
| ☐ | `Player-Lists/index.html` | `shared.js?v=25` |
| ☐ | `client/index.html` | dòng 432 — sáu bảng, mười hai sheet |
| ☐ | `README.md` | dòng 48 |
| ☐ | `client/guide.html` | luật chuỗi hoá set piece (§5.5) |
| ☐ | `tests/stats-tabs-split.test.js` | **mới**, ~30 test |
| ☐ | 4–5 file test cũ | §11.2 |
| ☐ | `tests/asset-versions.json` | 3–4 mục |
