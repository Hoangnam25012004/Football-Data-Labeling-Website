# GK Event Pack + Tách Duel/Save + Own Goal — Detailed Design

**Thêm **17 event mới** vào từ điển, **tách hai event cũ** (`ground duel …` → *physical* +
*loose ball*; `save` → *catch* + *parry*), thêm **`own goal`** ghi bàn cho đối phương, thêm
**4 check mới** ở Submit Analysis, và **xếp lại thứ tự** bảng *Event types*.**

**Câu hỏi khó nhất không phải "thêm event thế nào" — đó là việc vặt. Nó là: *dữ liệu cũ đi đâu khi
một event bị tách làm hai?* Câu trả lời: **không tách được, và không được giả vờ là tách được.**
§4 nói tại sao, rồi đưa ra mô hình **tổng cũ giữ nguyên + chi tiết chỉ có từ nay** — mô hình duy
nhất không bịa dữ liệu và không làm gãy lịch sử.**

**Rủi ro lớn thứ hai là bảng Macro.** §7 là một mục riêng cho nó, và §7.3 chỉ ra **một bug đang
sống sẵn trong repo**: nút `＋ Add` hôm nay phát ra mã `g`, mà `g` đang là macro *goal kick +
pass success* — nên **thêm event bằng nút ＋ sẽ giết macro đó**.

Trạng thái: **ĐÃ TRIỂN KHAI** (2026-08-28). Q1→Cột B · Q2→không · Q3→có · Q4→không · Q5→có ·
Q6→có · Q7→không · Q8→sửa · Q9→vá · Q10→không · Q11→own goal **phải** có chấm khung thành ·
Q12→chốt.

Test: `node tests/run.js` → **1333/1333 passed** (baseline 1298 + 35 test mới).

> **Còn một việc phải làm bằng tay — §6.1 + §15 bước 10.** Từ điển trên cloud có **48** event,
> `pitchtagger_events.json` chỉ có **38**; 10 event kia chỉ sống trên cloud và repo không biết
> hotkey của chúng. **[seed_gk_events.js](../seed_gk_events.js)** giải quyết chuyện đó lúc chạy:
> nó làm việc trên danh sách THẬT trong app, nên không cần biết trước 10 tên ấy. Dán vào Console
> rồi gõ `__seedGkEvents()`.

---

## 0-bis. Đã làm gì — và ba chỗ khác với bản thiết kế

**Phạm vi thật:** `index.html` · `shared.js` · `Stats/stats-view.js` · `cloud-sync.js` ·
`pitchtagger_events.json` · `seed_gk_events.js` *(mới)* · `tests/gk-events-duel-split.test.js`
*(mới, 35 test)* · 6 file test cũ · `tests/asset-versions.json` · 5 chỗ bump `?v=`.

**Đúng cam kết 0 dòng:** `Stats/report.js` · `Player-Lists/index.html` *(chỉ `?v=`)* ·
`client/assets/app.js` *(chỉ `?v=`)* · `auth.js` · `auth.html` · `shared.css` · `worker/**` ·
`supabase/migrations/**` · `.github/workflows/deploy.yml`.

### 0-bis.1 `DEFAULT_EVENTS` một mình là KHÔNG đủ — phát hiện lúc code

Bản thiết kế (§5.1) nói sửa `DEFAULT_EVENTS` là event mới sẽ tự lên cloud. **Sai.**
`loadEvents()` chỉ đọc `DEFAULT_EVENTS` ở **lần mở đầu tiên**, khi `localStorage` còn trắng; sau
đó `applyEventTypes()` ghi đè `state.events` bằng bản trên cloud. Với một máy đã từng vào — tức
mọi máy đang dùng — **17 tên mới sẽ không bao giờ tự xuất hiện.**

Nên có thêm **[seed_gk_events.js](../seed_gk_events.js)**, theo đúng khuôn mẫu
`restore_macros.js` đã có: dán vào Console, nó chạy trên `PT.state.events.football` thật.
Việc này cũng giải luôn bài toán 48-vs-38 — script không cần biết 10 tên kia là gì, và §10 (xếp
lại thứ tự) được làm cùng lúc. Script **từ chối ghi** nếu bất kỳ mã nào đụng event hoặc macro
đang có, và **chạy lại được**.

Kéo theo **một dòng ở `index.html`**: `saveEvents` được thêm vào `window.PT`.
`applyEventTypes` là đường **vào** (cloud → app) và cố tình không đẩy ngược lên; một script thêm
event cần đường **ra**. Thuần cộng thêm một tên vào object export.

### 0-bis.2 Sáu file test cũ phải sửa, không phải ba

§13.2 dự đoán 3. Thực tế 6 — ba cái phát sinh đều là **hệ quả trực tiếp của câu trả lời của
bạn**, không phải nới lỏng:

| File | Vì sao |
|---|---|
| `analysis-gate.test.js` | 7 → 11 check (R11). Thêm 1 test mới: mỗi total trỏ đúng mirror của nó. Fixture *"breaks everything"* được mở rộng để **thật sự** phá cả 4 check mới — nếu không, "không cái nào bị bỏ qua" sẽ được thoả bởi những check chưa từng chạy. |
| `events-table.test.js` | màu mới (R10) + `own goal` vào từ điển |
| `goal-spot.test.js` | **Q11** — `GOAL_SPOT_EVENTS` nay có `own goal`. Thêm 1 test mới buộc `SPOT_REQUIRED` **luôn bằng** `GOAL_SPOT_EVENTS`, để cổng không bao giờ lỏng hơn UI. |
| `player-data.test.js` | **§5.3.2** — `GK_COLS` từ 6 lên 16 cột |
| `film-slicers.test.js` | **§5.5** — `save` chuyển từ nhóm *Other* sang *Goalkeeping*, nên nó xếp trước thay vì nằm giữa. Assertion cũ được giữ nguyên ý (thứ tự **trong** nhóm Other) và thêm một assertion cho thứ tự **giữa** các nhóm. |
| `harness.js`, `submit-analysis.test.js` | chỉ comment nói "seven" |

### 0-bis.3 Hai sai sót số học trong bản thiết kế

* §5.3.2 nói "11 cột thủ môn mới" — thật ra là **10** (`GK_COLS` đi từ 6 → 16).
* §1 nói cache-bust 5 nơi; đúng 5, nhưng `Stats/stats-view.js` cũng đổi nên tổng là **7 dòng
  `?v=`** trên 5 file.

### 0-bis.4 Chuỗi *"seven"* — nhiều hơn dự kiến

§12.4 đếm 4 chuỗi + 4 comment trong `index.html`. Đúng, và còn 2 comment nữa trong
`tests/harness.js` và `tests/submit-analysis.test.js`. Nay **không còn chữ `seven` nào** trong
`index.html`, và test **T11** khoá điều đó lại: số check được **đọc từ `AN_ORDER.length`**, không
gõ tay.

---

## 0. Câu trả lời của bạn — đã chốt

| # | Câu hỏi | Bạn chọn | Hệ quả trong tài liệu này |
|---|---|---|---|
| Q1 | Tên event | **Cột B** — theo quy ước từ điển (thường, cách bằng dấu cách, `success`/`fail`) | §3 — danh sách tên đã chốt |
| Q2 | Luật chống tag-hai-lần / check "kỹ thuật = kết quả" | **Không** | §8.3 — chỉ tài liệu hoá |
| Q3 | `goal conceded` hiện thành `Conceded (tagged)`, không đụng hai dòng suy ra | **Có** | §5.3.4 — **nhưng xem Q8 mới** |
| Q4 | Màu badge riêng cho event thủ môn | **Không** | §5.4 — chỉ duel mới có màu |
| Q5 | Vá chỗ lệch giữa `shared.js` và `index.html` | **Có** | §9 — **có 4 chỗ, không phải 3** |
| Q6 | Xếp lại `ord` của bảng Event types | **Có** | §10 |
| Q7 | Thêm cột duel/save vào SQL view | **Không** | §5.9 — 0 dòng |

**Yêu cầu mới trong lượt này:**

| # | Yêu cầu | Mục |
|---|---|---|
| R9 | Event `own goal`: cầu thủ **home** ⇒ **+1 cho away**, và ngược lại | §11 |
| R10 | Màu badge cho `physical duel` và `loose ball duel`, giống cách `aerial`/`ground` có màu | §5.4 |
| R11 | 4 check mới ở Submit Analysis (loose total/mirror, physical total/mirror) | §12 |
| R12 | **Không sinh bug ở bảng Macro** | **§7 — toàn bộ mục** |

---

## 1. Tóm tắt một trang

| Việc | Chi tiết | Mục |
|---|---|---|
| **17 event mới** | 4 duel tách · 2 save tách · 5 phản xạ · 4 kiểm soát · `goal conceded` · **`own goal`** | §5.1 |
| **3 event cũ Ở LẠI** | `ground duel success`, `ground duel fail`, `save` — **không xoá, không đổi tên** | §4.4, Phụ lục B |
| **Dữ liệu cũ** | giữ nguyên trong `public.events` — **không viết lại một hàng nào** | §4 |
| **Tổng cũ** (`Ground Duels`, `Saves`) | **không đổi nghĩa, không đổi số** ở mọi trận đã tag | §4.4 |
| **Chi tiết mới** | chỉ có từ ngày ship; trận cũ hiện `—`, **không phải `0`** | §4.5 |
| **Macro** | 3 rủi ro, **1 bug đang sống sẵn** (`nextFreeKey` phát ra `g`) | **§7** |
| **`own goal`** | repo **đã hỗ trợ sẵn ở 4 nơi**; chỉ thiếu từ điển + 2 chỗ tính tỉ số | §11 |
| **Cổng Submit** | 7 → **11** check; chữ *"seven"* nằm cứng ở **4 chuỗi người dùng thấy** | §12 |
| Từ điển | 48 (cloud) → **65** event, có xếp lại thứ tự | §6.1, §10 |
| SQL | `match_stats` **không đổi** | §5.9 |
| Cache-bust | `shared.js` **và** `cloud-sync.js` đều đổi ⇒ **5 nơi** phải bump | §14 |

**Điều nguy hiểm nhất cần nhớ:** trong giai đoạn chuyển tiếp, **không được tag cả tên cũ lẫn tên
mới cho cùng một hành động**. `1x*pd` cộng `groundDuels` **hai lần** (§8.3).

---

## 2. Một tên event đi qua những đâu — khảo sát, để biết chỗ nào sẽ vỡ

Một cái tên event không nằm ở một chỗ; nó đi qua **9 trạm**, và bỏ sót trạm nào thì trạm đó **im
lặng trả về 0** chứ không báo lỗi.

| # | Trạm | Ở đâu | Khớp tên kiểu gì |
|---|---|---|---|
| 1 | **Từ điển** (nguồn sự thật) | `public.event_types` ← [cloud-sync.js:136](../cloud-sync.js:136) | `unique(sport,event_name)` — **phân biệt hoa/thường** |
| 2 | Từ điển hạt giống / fixture test | [pitchtagger_events.json](../pitchtagger_events.json) | nguyên văn |
| 3 | Từ điển lần-mở-đầu-tiên | [index.html:828](../index.html:828) `DEFAULT_EVENTS` | nguyên văn |
| 4 | **Gõ phím → hàng** | `eventForKey` → `expandKey` → `parseChain` — [index.html:2219](../index.html:2219), [:2231](../index.html:2231), [:2312](../index.html:2312) | mã khớp **chính xác** |
| 5 | **Macro** | `macroForKey`, `renderMacros`, `expandMacros` | **tên khớp chính xác, phân biệt hoa/thường** (§7.1) |
| 6 | **Lưu** | `public.events.event_name` ← [cloud-sync.js:34](../cloud-sync.js:34) | nguyên văn tên trong từ điển |
| 7 | **Đếm** | `EVENT_INC` × **2 bản**: [shared.js:191](../shared.js:191), [index.html:3706](../index.html:3706) | qua `evKey()` — thường hoá + trim + `EV_ALIAS` |
| 8 | **Hiện** | `STAT_HEADERS`/`statRow` · `PLAYER_CATS` · `GK_COLS` · `TEAM_SECTIONS` ×2 · `DEF_CATS` · `evtClass` · `FILM_EV_GROUPS` · `SUMMARY_EVENTS` · `Stats/report.js` | phần lớn qua `evKey()`; **`filmMatches`, `teamGoals`, `SUMMARY_EVENTS` thì không** |
| 9 | **Cổng Submit analysis** | `DUEL_MIRRORS` / `DUEL_TOTALS` — [index.html:2798](../index.html:2798) | qua `anKey()` (= thường hoá) |
| 10 | **SQL cho site khách** | `public.match_stats` — [0015](../supabase/migrations/0015_match_stats_event_names.sql) | `lower(trim(event_name))` |

### 2.1 Bốn chỗ lệch giữa hai bản sao của bộ đếm (Q5 = **Có**, sẽ vá — §9)

`index.html` **không nạp** `shared.js`; nó mang **bản sao riêng** của toàn bộ engine thống kê. Hai
bản đã lệch từ trước tài liệu này:

| | `shared.js` | `index.html` |
|---|---|---|
| `EVENT_INC['take-on concern']` | `['takeOns','takeOnConcerns']` ([:206](../shared.js:206)) | `['takeOns']` ([:3725](../index.html:3725)) |
| `EVENT_INC['foul won']` | có ([:224](../shared.js:224)) | **không có** |
| `STAT_GROUPS` | `Defensive 9 · Discipline 4` ([:232](../shared.js:232)) | `Defensive 8 · Discipline 3` ([:3745](../index.html:3745)) |
| `TEAM_SECTIONS` | 41 dòng, có `Take-on Concerns` ([:627](../shared.js:627)) | **40 dòng, thiếu `Take-on Concerns`** ([:3922](../index.html:3922)) |

*(Chỗ thứ tư là mới tìm thấy trong lượt này — tài liệu trước chỉ nói 3.)*

### 2.2 `evKey()` che được hoa/thường, nhưng KHÔNG che được mọi thứ

```js
const evKey=e=>{const k=String(e==null?'':e).trim().toLowerCase(); return EV_ALIAS[k]||k;};
```

Bốn chỗ **không** đi qua `evKey`, nên cách viết là quan trọng:

* `unique(sport,event_name)` của Postgres — `Catch` và `catch` là **hai hàng từ điển**;
* `filmMatches()` — so `r.event` **nguyên văn** với giá trị option (mã ghi rõ: *"the option VALUE
  stays the raw string"*);
* **`curEvents().some(o=>o.name===n)` trong `renderMacros`** — §7.1;
* `teamGoals()` ([Stats/stats-view.js:929](../Stats/stats-view.js:929)) và `SUMMARY_EVENTS`
  ([:967](../Stats/stats-view.js:967)) — so `r.event==='goal'` nguyên văn.

Đây là lý do Q1 = Cột B (toàn bộ chữ thường, cách bằng dấu cách) là lựa chọn đúng: nó xoá cả bốn
loại rủi ro trên cùng lúc.

---

## 3. Tên đã chốt (Q1 = **Cột B**)

| # | `event_name` (chốt) | Counter riêng | Nhóm |
|---|---|---|---|
| 1 | `own goal` | `ownGoals` | Shooting |
| 2 | `physical duel success` | `physicalDuels`, `physicalDuelsWon` | Defensive |
| 3 | `physical duel fail` | `physicalDuels` | Defensive |
| 4 | `loose ball duel success` | `looseBallDuels`, `looseBallDuelsWon` | Defensive |
| 5 | `loose ball duel fail` | `looseBallDuels` | Defensive |
| 6 | `catch` | `catches` | Goalkeeping |
| 7 | `parry` | `parries` | Goalkeeping |
| 8 | `save standing` | `saveStanding` | Goalkeeping |
| 9 | `save diving` | `saveDiving` | Goalkeeping |
| 10 | `save collapse` | `saveCollapse` | Goalkeeping |
| 11 | `save overhead` | `saveOverhead` | Goalkeeping |
| 12 | `save kneeling` | `saveKneeling` | Goalkeeping |
| 13 | `defensive line support success` | `defLineSupports`, `defLineSupportsWon` | Goalkeeping |
| 14 | `defensive line support fail` | `defLineSupports` | Goalkeeping |
| 15 | `aerial control success` | `aerialControls`, `aerialControlsWon` | Goalkeeping |
| 16 | `aerial control fail` | `aerialControls` | Goalkeeping |
| 17 | `goal conceded` | `goalsConceded` | Goalkeeping |

Ba điều Cột B đã sửa so với bản viết tay đầu tiên, mỗi điều là một cái bẫy thật:

* **`Supports` → `support`** — cặp success/fail nay khớp nhau. Repo đã trả giá hai lần cho đúng
  kiểu lệch này (`take-on succes`, `gain possesion`), và cái giá là `EV_ALIAS` phải mang chúng
  **vĩnh viễn** ([shared.js:245](../shared.js:245)) cộng hai dòng trong SQL view.
* **`saveStanding` → `save standing`** — camelCase đứng cạnh `pass success` trong 5 nơi người dùng
  nhìn thấy (bảng Event types, badge `#…` ở bảng Events, dòng lọc Film, dòng macro, tiêu đề xlsx).
* **`Catches`/`Parries` → `catch`/`parry`** — từ điển đặt tên theo **hành động số ít**: `save`,
  `block`, `clearance`, `interception`, `recovery`. `catch` và `parry` đứng cạnh `save` đúng chỗ.

> ⚠️ **Khoá của `EVENT_INC` phải viết THƯỜNG.** `evKey()` thường hoá vế trái của phép tra. Với Cột
> B thì tên vốn đã thường nên trùng khít — đây là lợi ích thứ tư của Cột B, và test **T4** (§13)
> vẫn canh nó.

---

## 4. Vấn đề cốt lõi — dữ liệu cũ đi đâu khi tách một event làm hai

### 4.1 Nói thẳng: không tồn tại phép biến đổi nào

Một hàng cũ trong `public.events`:

```
event_name = 'ground duel success'   team = 'home'   player_from = '4'   t = 1873.2   px,py = 61,38
```

Câu hỏi: **đây là *physical duel* hay *loose ball duel*?**

Hàng đó **không chứa câu trả lời**. Không cột nào chứa. Không suy ra được từ toạ độ, thời gian, số
áo, hay event đứng cạnh trong chuỗi. Thông tin ấy **chưa từng được ghi**, vì lúc tag người ta chưa
được hỏi.

Mọi quy tắc backfill nghĩ ra được ("trong vòng cấm thì physical", "sau clearance thì loose ball",
"chia 50/50", "gán hết vào physical") đều là **bịa dữ liệu**: nó tạo ra một con số *trông như* đo
được nhưng thực ra do một dòng `if` sinh ra, và **không có cách nào phân biệt lại về sau**.

Chính `shared.js` đã viết sẵn luật này, ngay trên `EV_ALIAS` ([shared.js:245](../shared.js:245)):

> *The rule for adding to this: only ever a rename of the SAME event. Two events that are genuinely
> different must not be folded together — the fold is invisible in the data and there would be
> nothing to un-fold it by.*

Tách là **chiều ngược lại của cùng một luật**, và chặt hơn: gộp sai thì ít nhất tổng còn đúng;
tách sai thì cả hai số con đều sai.

`save` → `catch` / `parry` **y hệt**: một hàng `save` không nói thủ môn có ôm dính bóng hay không.

### 4.2 Bốn phương án, ba bị loại

| | Phương án | Điều gì xảy ra | Phán quyết |
|---|---|---|---|
| **A** | `EV_ALIAS['ground duel success']='physical duel success'` | Mọi loose-ball duel trong lịch sử **biến thành** physical duel. Không un-fold được. Trái §4.1. | ❌ **Bịa dữ liệu** |
| **B** | `UPDATE public.events SET event_name=…` | Xoá bản ghi gốc, **vẫn phải bịa** để chọn nhánh, và làm hỏng vòng `action_code` ↔ `raw` của `✎ Edit` ([index.html:2261](../index.html:2261) `retypeForMe`). | ❌ **Phá huỷ + bịa** |
| **C** | Xoá `ground duel …` / `save` khỏi từ điển | `renderEvents()` **cố tình không có nút ×** ([index.html:2125](../index.html:2125)): *"…broke every macro pointing at it, and left the matches already tagged with it naming something the dictionary no longer has"*. Macro `xa` và `xxaa` chết ngay. | ❌ **Đã bị cấm sẵn trong mã** |
| **D** | **Roll-up cũ giữ nguyên + chi tiết mới cộng vào cùng roll-up** | Trận cũ: tổng đúng như nó vẫn luôn đúng, chi tiết là `—`. Trận mới: tổng đúng **và** chi tiết đúng. Không hàng nào bị viết lại. | ✅ **Chọn** |

### 4.3 Phương án D — cơ chế

**`groundDuels` và `saves` thôi không còn là "event ground duel / save", mà trở thành *tổng của một
họ event*.** Tên cũ là một thành viên; các tên mới là thành viên khác.

```js
// EVENT_INC — nhánh duel                                                       (▲ = dòng mới)
'ground duel success'     : ['groundDuels','groundDuelsWon'],                        // giữ NGUYÊN
'ground duel fail'        : ['groundDuels'],                                         // giữ NGUYÊN
'physical duel success'   : ['groundDuels','groundDuelsWon','physicalDuels','physicalDuelsWon'],    // ▲
'physical duel fail'      : ['groundDuels','physicalDuels'],                                        // ▲
'loose ball duel success' : ['groundDuels','groundDuelsWon','looseBallDuels','looseBallDuelsWon'],  // ▲
'loose ball duel fail'    : ['groundDuels','looseBallDuels'],                                       // ▲

// EVENT_INC — nhánh save
'save'  : ['saves'],                      // giữ NGUYÊN
'catch' : ['saves','catches'],            // ▲   kết quả — CÓ cộng vào saves
'parry' : ['saves','parries'],            // ▲   kết quả — CÓ cộng vào saves
```

### 4.4 Cái gì được bảo toàn — toàn bộ giá trị của phương án D

| Con số | Trận tag **TRƯỚC** | Trận tag **SAU** | Cộng dồn cả mùa |
|---|---|---|---|
| `Ground Duels` / `Ground Duels Won` | y như cũ | = physical + loose ball | **liền mạch** |
| `Saves` | y như cũ | = catch + parry | **liền mạch** |
| `Save Rate`, `On Target Faced` ([shared.js:329](../shared.js:329)) | y như cũ | y như cũ | **liền mạch** |
| Radar defensive + cột `Ground` của PDF ([Stats/report.js:744](../Stats/report.js:744), [:1118](../Stats/report.js:1118)) | y như cũ | y như cũ | **liền mạch** |
| `Physical Duels`, `Loose Ball Duels`, `Catches`, `Parries` | **`—`** | số thật | cộng phần biết được |

Không một hàng nào trong `public.events` bị chạm. **Không có migration dữ liệu.**

### 4.5 `—` chứ không phải `0`

Một trận tháng 5 có 34 ground duel và **0** physical duel. Nếu bảng in `0`, nó **khẳng định**
"trận này không có pha tranh chấp thể chất nào" — một lời nói dối. Sự thật là *"chưa ai hỏi câu đó
khi tag trận này"*.

Repo đã có sẵn đúng cách xử lý, ở `GK_COLS` ([shared.js:316-331](../shared.js:316)):

> *`known` counts the matches whose line-ups could answer the question at all. 0 means nothing can
> be said, and "—" is what says so — never 0, which would claim a clean sheet nobody recorded.*

**Dùng lại y hệt.** Thêm vào `newStat()` năm **cờ** — không phải số đo:

```js
duelDetail:0,  saveDetail:0,  gkTechDetail:0,  gkCtrlDetail:0,  concededDetail:0,
```

Mọi event mới của nhánh nào thì tăng cờ nhánh ấy. Cột hiển thị đọc cờ trước:

```js
['Physical Duels', s=>s.duelDetail ? s.physicalDuels : '—']
['Catches',        s=>s.saveDetail ? s.catches       : '—']
```

`sumTeam()` ([shared.js](../shared.js)) cộng **mọi khoá** của `newStat()` bằng `for(const k in t)`,
nên cờ **tự cộng dồn**: một mùa gồm 12 trận cũ + 6 trận mới cho ra chi tiết của 6 trận mới mà không
giả vờ 12 trận kia bằng 0. Đúng cách `g.known` đã hoạt động.

### 4.6 Sáu event mới KHÔNG có vấn đề dữ liệu cũ

`own goal`, `goal conceded`, 5 event phản xạ, 4 event kiểm soát là **event mới hoàn toàn**, không
tách từ đâu. Cùng cơ chế cờ ở §4.5 diễn đạt "chưa đo". Không có gì để đồng bộ.

---

## 5. Thiết kế chi tiết — theo từng file

### 5.1 Từ điển — 3 nơi

| File | Sửa gì | Ghi chú |
|---|---|---|
| [pitchtagger_events.json](../pitchtagger_events.json) | **đồng bộ với cloud (§6.1) rồi** +17 mục | đồng thời là **fixture test** ([harness.js:23](../tests/harness.js:23)) |
| [index.html:828](../index.html:828) `DEFAULT_EVENTS` | như trên | chỉ dùng cho lần mở đầu tiên khi chưa có cloud |
| `public.event_types` | +17 hàng, và **xếp lại `ord`** (§10) | **không cần migration SQL** |

**Vì sao không cần migration:** [cloud-sync.js:173-188](../cloud-sync.js:173) `pushEventTypes()` đọc
danh sách trên cloud, `insert` tên **chưa** có và `upsert` tên **đã** có. Một analyst đăng nhập mở
app một lần với `DEFAULT_EVENTS` mới → 17 hàng tự sinh, realtime bắn về mọi máy khác
([cloud-sync.js:193](../cloud-sync.js:193)).

### 5.2 Bộ đếm — `EVENT_INC` + `newStat()`, **hai bản sao**

```js
// duel (§4.3) — 4 dòng mới; 2 dòng cũ KHÔNG chạm
'physical duel success'  : ['groundDuels','groundDuelsWon','physicalDuels','physicalDuelsWon','duelDetail'],
'physical duel fail'     : ['groundDuels','physicalDuels','duelDetail'],
'loose ball duel success': ['groundDuels','groundDuelsWon','looseBallDuels','looseBallDuelsWon','duelDetail'],
'loose ball duel fail'   : ['groundDuels','looseBallDuels','duelDetail'],

// save: KẾT QUẢ (§8.2) — CÓ cộng vào saves
'catch': ['saves','catches','saveDetail'],
'parry': ['saves','parries','saveDetail'],

// save: KỸ THUẬT (§8.2) — KHÔNG cộng vào saves, nếu không sẽ đếm đôi
'save standing':['saveStanding','gkTechDetail'],   'save diving'  :['saveDiving','gkTechDetail'],
'save collapse':['saveCollapse','gkTechDetail'],   'save overhead':['saveOverhead','gkTechDetail'],
'save kneeling':['saveKneeling','gkTechDetail'],

// kiểm soát của thủ môn
'defensive line support success':['defLineSupports','defLineSupportsWon','gkCtrlDetail'],
'defensive line support fail'   :['defLineSupports','gkCtrlDetail'],
'aerial control success'        :['aerialControls','aerialControlsWon','gkCtrlDetail'],
'aerial control fail'           :['aerialControls','gkCtrlDetail'],

// bàn thua tag tay
'goal conceded':['goalsConceded','concededDetail'],

// phản lưới nhà (§11) — KHÔNG cộng vào goals / totalShots
'own goal':['ownGoals'],
```

`newStat()` thêm **17 counter + 5 cờ**, đặt **cuối object**, giá trị 0.

> `'own goal'` **không** được cộng vào `goals` hay `totalShots`. `goals` nuôi `TEAM_SECTIONS`
> *Goals* và *Goals Conceded*; cộng vào đó sẽ ghi bàn cho **nhầm đội**. §11 xử lý tỉ số ở chỗ khác.

### 5.3 Nơi các số mới hiện ra

#### 5.3.1 `PLAYER_CATS.defensive` — 4 cột duel · **cộng thêm**
[shared.js:304-310](../shared.js:304), ngay sau `Ground Duels Won`:
```js
['Physical Duels',   s=>s.duelDetail?s.physicalDuels:'—'],
['Physical Won',     s=>s.duelDetail?s.physicalDuelsWon:'—'],
['Loose Ball Duels', s=>s.duelDetail?s.looseBallDuels:'—'],
['Loose Ball Won',   s=>s.duelDetail?s.looseBallDuelsWon:'—'],
```
Hiện ở tab *Defensive* của Stats **và** trang Data của site khách — cùng một mảng
([client/assets/app.js:1009](../client/assets/app.js:1009) đọc thẳng `PLAYER_CATS`).

#### 5.3.2 `GK_COLS` — 10 cột thủ môn · **cộng thêm** (6 → 16)
[shared.js:326](../shared.js:326). Đúng chỗ cho R2/R3: `GK_COLS` chỉ vẽ cho cầu thủ được nhận là
thủ môn ([client/assets/app.js:1008](../client/assets/app.js:1008)), nên cầu thủ ngoài sân **không**
mọc thêm 11 cột số 0.
```js
['Catches',(s,g)=>s.saveDetail?s.catches:'—'],  ['Parries',(s,g)=>s.saveDetail?s.parries:'—'],
['Standing',(s,g)=>s.gkTechDetail?s.saveStanding:'—'],   // … Diving / Collapse / Overhead / Kneeling
['Def. Line Support',(s,g)=>s.gkCtrlDetail?frac(s.defLineSupportsWon,s.defLineSupports):'—'],
['Aerial Control',   (s,g)=>s.gkCtrlDetail?frac(s.aerialControlsWon,s.aerialControls):'—'],
['Conceded (tagged)',(s,g)=>s.concededDetail?s.goalsConceded:'—'],
```
> ⚠️ `GK_COLS` là hàm **hai tham số** `(s,g)`. Dòng mới chỉ dùng `s`, nhưng **phải giữ đủ hai tham
> số** để đồng dạng với 6 dòng đang có.

#### 5.3.3 `TEAM_SECTIONS` — chỉ đụng vì `own goal` (§11), xem **Q8**
Không thêm dòng duel/GK nào ở đây (P1 vẫn hoãn). Nhưng `own goal` buộc phải đụng **hai biểu thức**
— xem §11.3 và câu hỏi Q8 ở §16.

#### 5.3.4 `goal conceded` — va chạm tên (Q3 = **Có**)
App **đã có hai** con số tên gần giống, cả hai đều **suy ra**:

| Ở đâu | Công thức | Nghĩa |
|---|---|---|
| [shared.js:647](../shared.js:647) / [index.html:3942](../index.html:3942) | `(s,o)=>o.goals` | bàn thua của **đội** |
| [shared.js:328](../shared.js:328) | `g.known?g.conceded:'—'` | bàn thua **lúc thủ môn này đang trên sân** |

Event tag tay đi vào counter **riêng** `goalsConceded`, nhãn **`Conceded (tagged)`**, và **hai dòng
suy ra không bị chạm** vì lý do này. Dòng suy ra vẫn có thẩm quyền — nó đúng theo cấu trúc, không
phụ thuộc kỷ luật tag.

Giá trị thật của event tag tay: **toạ độ** từng bàn thua · **bộ lọc Film** dựng playlist trong một
cú tick · **độc lập với bảng đội hình** (`g.known` trả `—` khi đội hình chưa nhập).

### 5.4 Màu badge — `evtClass` + CSS (R10, Q4 = **không** cho GK)

[index.html:3510](../index.html:3510) hiện chỉ biết `ground` và `aerial`. Hai class mới, đặt
**trước** `ground` (phòng thủ, dù các mẫu không chồng nhau):

```js
const evtClass=n=>SHOT_EVENTS.test(n||'')?' shot'
  :/^physical duel/i.test(n||'')?' duel-physical'
  :/^loose ball duel/i.test(n||'')?' duel-loose'
  :/^ground duel/i.test(n||'')?' duel-ground'
  :/^aerial duel/i.test(n||'')?' duel-aerial':'';
```

CSS, cạnh hai dòng đang có ở [index.html:185-186](../index.html:185):

```css
.evt.duel-ground  {color:#b5713f}   /* ground duel — nâu   (giữ nguyên) */
.evt.duel-aerial  {color:#ef4444}   /* aerial duel — đỏ    (giữ nguyên) */
.evt.duel-physical{color:#d98a3f}   /* physical duel   — hổ phách, cùng họ nâu với cha nó */
.evt.duel-loose   {color:#3fb0a8}   /* loose ball duel — xanh mòng két, tách hẳn */
```

Vì sao chọn hai màu đó: `physical` giữ trong họ ấm của `ground` (nó là một loại ground duel) nhưng
sáng hơn hẳn #b5713f; `loose ball` tách sang lạnh để không lẫn với nâu/đỏ và với `--away` (#FFFF66).
Hex chỉ là đề nghị — đổi một chữ là xong.

**Không** thêm màu cho 11 event thủ môn (Q4 = Không) và **không** cho `own goal` — `own goal` đã
khớp `SHOT_EVENTS` (`/shot|^goal$|^own goal$/i`) nên tự nhận badge đen `.shot` sẵn có (§11.4).

`evtClass` cũng được **bảng Macro** dùng ([index.html:2179](../index.html:2179)) ⇒ dòng macro chứa
duel mới cũng lên đúng màu. Nhất quán, và là thay đổi duy nhất mà bảng Macro nhìn thấy (§7.4).

### 5.5 Bộ lọc Film — `FILM_EV_GROUPS`
[Stats/stats-view.js:1345](../Stats/stats-view.js:1345). Không thêm thì vẫn chạy — tên lạ rơi xuống
`FILM_EV_REST` = *"Other events"* và sắp A–Z. Nhưng 17 event mới sẽ dồn lẫn dưới đáy.

* `Shooting`: thêm `own goal` ngay sau `goal`;
* `Defensive`: chèn 4 event duel **ngay sau** `ground duel fail`;
* **nhóm mới `Goalkeeping`** (thứ 5, trước `Body part`): `catch` · `parry` · `save` *(chuyển từ
  `Other` sang)* · 5 kỹ thuật · 4 kiểm soát · `goal conceded`.

> ⚠️ Tên trong bảng này **phải viết thường** — mã ghi rõ: *"LOWER CASE, because every lookup goes
> through evKey()"*. Cột B đã thoả sẵn.

Bảng này vừa là **thứ tự** vừa là **heading** (`filmEvGroup` đọc chính nó), nên nó cũng là bản mẫu
cho thứ tự `ord` ở §10 — *"one table, two jobs"*.

### 5.6 Bản đồ Defensive — `DEF_CATS` · **hoãn (P2)**
[Stats/stats-view.js:180](../Stats/stats-view.js:180). Thêm `physical`/`looseBall` vào dropdown là
tính năng mới. PR riêng.

### 5.7 `Stats/report.js` (PDF) — **0 dòng**
`Ground Won` ([:1118](../Stats/report.js:1118)) và cột `Ground` ([:744](../Stats/report.js:744)) đọc
`groundDuelsWon`/`groundDuels`; §4.4 giữ nguyên nghĩa. `saves` cũng vậy
([:1287](../Stats/report.js:1287)). `own goal` đã được xử lý sẵn ([:486](../Stats/report.js:486),
[:512](../Stats/report.js:512)) — §11.1.

### 5.8 `client/assets/app.js` — chỉ bump `?v=`
Trang Data đọc `PLAYER_CATS`/`GK_COLS` **của `shared.js`**
([:1005-1010](../client/assets/app.js:1005)) ⇒ §5.3.1 và §5.3.2 tự hiện, **không sửa logic**.
Nhưng file này **nạp `shared.js` bằng chuỗi phiên bản cứng**
([:1623](../client/assets/app.js:1623)) ⇒ **bắt buộc bump** (§14).

### 5.9 SQL — **0 dòng** (Q7 = **Không**)
`public.match_stats` đếm `aerial_duels` nhưng **không** đếm ground duel, **không** đếm save, và
**không** đếm goal theo hướng own-goal. Không cột nào chạm thứ đang bị tách.
`tests/client-channels.test.js:850` còn khẳng định **danh sách cột của view không được đổi** vì
`CREATE OR REPLACE VIEW` từ chối — thêm cột sẽ phải `DROP`+`CREATE`.

---

## 6. Từ điển thật có 48, repo chỉ biết 38 — bước chặn

### 6.1 ⛔ Phải làm TRƯỚC khi chọn mã

Ảnh chụp nói *"synced to cloud **(48)**"*; `pitchtagger_events.json` có **38**. Đối chiếu tên mà mã
nguồn và 40 macro nhắc tới nhưng từ điển repo không có, **9 trong 10 tên thiếu đã lộ ra**:

```
goal kick · throw-Ins · right foot · left foot · head · upper body · lower body · foul won · miss shot
```

*(`throw-Ins` viết hoa chữ I — đúng như macro `t`/`tt` đang trỏ tới. Đây là bằng chứng sống cho
§2.2: tên khớp **chính xác**, không qua `evKey`.)*

Tên thứ 10 **không suy ra được từ mã nguồn**, và **hotkey của cả 10 thì hoàn toàn không biết**.
Dán đoạn này vào Console của <https://hoangnams.com/tagger/> để lấy danh sách thật:

```js
copy(JSON.stringify({
  events: PT.state.events.football.map(e => [e.key, e.name]),
  macros: (PT.state.macros.football || []).map(m => [m.key, m.events.join(' + ')])
}, null, 1))
```

Kết quả cho **hai** thứ cần thiết: 48 cặp (mã, tên) để §6.2 đối chiếu, và danh sách macro thật của
account đó để §7.2 đối chiếu.

### 6.2 Bảng mã đề nghị — đã kiểm với 38 mã event + 40 mã macro **đã biết**

| Event | mã | Event | mã |
|---|---|---|---|
| `own goal` | `og` | `save kneeling` | `vk` |
| `physical duel success` | `pd` | `defensive line support success` | `ln` |
| `physical duel fail` | `pdd` | `defensive line support fail` | `lnn` |
| `loose ball duel success` | `lo` | `aerial control success` | `ac` |
| `loose ball duel fail` | `loo` | `aerial control fail` | `acc` |
| `catch` | `ca` | `goal conceded` | `gc` |
| `parry` | `pr` | | |
| `save standing` | `vs` | `save collapse` | `vc` |
| `save diving` | `vd` | `save overhead` | `vo` |

Quy ước đã theo: **thành công = mã ngắn, thất bại = mã nhân đôi ký tự cuối** (`s`/`ss`, `a`/`aa`,
`x`/`xx`). 5 mã phản xạ dùng tiền tố `v` = mã của `save`.

**Cố ý không dùng chữ cái đơn.** `h`, `i`, `l`, `n`, `p`, `u`, `y` đang trống so với 38 mã đã biết —
nhưng 10 event chưa biết rất có thể giữ vài chữ trong đó (`head` → `h`? `lower body` → `l`?). Mã
hai ký tự trở lên giảm hẳn rủi ro. Sau khi có dump ở §6.1, chạy lại đối chiếu là xong.

### 6.3 Mã event luôn thắng macro
`expandKey()` ([index.html:2231](../index.html:2231)) tra event **trước**, macro sau. Một mã mới
trùng mã macro sẽ làm macro đó **ngừng bắn** — §7.2.

---

## 7. Bảng Macro — mục riêng cho R12

Bạn nói đúng: **thêm event là thao tác dễ làm hỏng bảng Macro nhất.** Dưới đây là toàn bộ đường
tiếp xúc giữa "thêm event" và "macro", từng cái một.

### 7.1 Macro lưu theo TÊN, và so khớp CHÍNH XÁC

[index.html:2166](../index.html:2166), trong `renderMacros()`:

```js
const known=curEvents().some(o=>o.name===n);
s.className=known?('evt'+evtClass(n)):'miss';
if(!known)s.title='This event no longer exists — the macro can\'t fire.';
```

`o.name===n` — **phân biệt hoa/thường, không qua `evKey`**. Hệ quả:

* ✅ **Thay đổi này an toàn tuyệt đối ở đây.** Chúng ta **không đổi tên** và **không xoá** event nào.
  40 macro trỏ tới `ground duel success`, `ground duel fail`, `throw-Ins`, `goal kick`,
  `take-on concern`… — **tất cả vẫn còn nguyên trong từ điển** (§4.2-C, Phụ lục B). Không macro nào
  chuyển sang `.miss`.
* ⚠️ Đây cũng là lý do thứ năm để chọn Cột B: nếu ship `Catches` (hoa) rồi sau đổi thành `catch`,
  mọi macro trỏ tới `Catches` sẽ hoá `.miss` **lặng lẽ** cho tới khi ai đó mở modal ra nhìn.

### 7.2 Rủi ro thật: mã event mới trùng mã macro

`expandKey` cho event thắng ⇒ macro **không bao giờ bắn**. Điều tốt: chuyện này **không im lặng** —
`macroKeyProblem()` ([index.html:2143](../index.html:2143)) tô đỏ ô mã và ghi tooltip:

> *The event hotkey "…" already uses this code — the macro would never fire.*

Nhưng **phải mở modal mới thấy**. Hai giới hạn cần nói thẳng:

* 17 mã ở §6.2 đã đối chiếu với **40 macro của account bạn** (`restore_macros.js`). Chúng sạch.
* Macro nay là **của riêng từng account** (`public.user_prefs.macros`,
  [user-hotkeys-macros-design.md](user-hotkeys-macros-design.md)) ⇒ **không thể kiểm macro của
  analyst khác từ repo.** Một mã mặc định mới *có thể* trùng macro của người khác. Đây là rủi ro cố
  hữu của việc thêm bất kỳ event nào, không riêng lần này.
* **Giảm thiểu:** §15 bước 11 — sau khi triển khai, mỗi analyst mở *Event types + Macro* một lần và
  tìm **ô mã màu đỏ**. Đó chính là thứ `macroKeyProblem` sinh ra để làm.

### 7.3 🐛 Bug đang sống sẵn: `nextFreeKey()` không nhìn macro

[index.html:2132](../index.html:2132):

```js
function nextFreeKey(){const used=new Set(curEvents().map(e=>e.key));return DEFAULT_KEYS.find(k=>!used.has(k))||''}
```

Nó chỉ đối chiếu **event**, **không đối chiếu macro**. Chạy thử với dữ liệu thật của bạn:

```
nextFreeKey() sẽ phát lần lượt:  g, h, l, n   (rồi trả '')
trong đó ĐANG LÀ MÃ MACRO:       g            ← macro "goal kick + pass success"
```

⇒ **Bấm `＋ Add` hôm nay, event đầu tiên nhận mã `g`, và macro `g` chết ngay lập tức.** Đây không
phải bug do thay đổi này sinh ra — nó **đang có sẵn** — nhưng thêm 17 event là lúc dễ dẫm phải nhất.

Hai cách xử lý:

| | Cách | Đánh giá |
|---|---|---|
| **a** | **Không dùng nút `＋` cho việc này.** Thêm 17 event bằng cách sửa `DEFAULT_EVENTS` + `pitchtagger_events.json` (§5.1), nên mã đi thẳng từ bảng §6.2 và `nextFreeKey()` **không bao giờ được gọi**. | ✅ **Chọn** — 0 dòng mã, rủi ro bằng 0 |
| **b** | Vá `nextFreeKey()` để loại cả mã macro | Là sửa một bug thật, nhưng **ngoài phạm vi** yêu cầu → **Q9** (§16) |

Đường triển khai ở §15 đi theo (a): **không bấm `＋` một lần nào.**

### 7.4 Ba đường tiếp xúc còn lại — đã kiểm, đều an toàn

| Đường | Kết luận |
|---|---|
| `evtClass` trong `renderMacros` (§5.4) | Dòng macro chứa `physical/loose ball duel` lên màu mới. **Chỉ là màu**, và nhất quán với bảng Events. Đây là thay đổi **duy nhất** bảng Macro nhìn thấy. |
| Xếp lại `ord` (§10) | Macro lưu theo **tên**, `renderMacros` tra theo **tên** ⇒ **đổi thứ tự không chạm macro một chút nào.** Và `pushEventTypes` upsert `seen` chỉ gửi `{sport, event_name, ord}` — **không gửi `key`** ⇒ hotkey cũng không bị đụng. |
| `addMacro()` / `expandMacros()` / `retypeForMe()` | Chỉ **thêm** mã có thể phân giải. Thuần cộng thêm, không có đường nào làm hỏng macro cũ. |
| `freeCode()` ([index.html:2288](../index.html:2288)) | Đi từ `z`, `zz`, `zzz`… 17 mã mới không có mã nào toàn chữ `z` ⇒ không đổi số bước. |

### 7.5 Tóm tắt R12

> **Thay đổi này không xoá, không đổi tên, không đổi hotkey của event nào đang có.** Ba việc đó là
> ba cách duy nhất làm hỏng một macro đang chạy — và tài liệu này không làm việc nào trong ba.
> Còn lại đúng một rủi ro (§7.2: mã mới trùng macro của account khác), nó **tự tô đỏ**, và §15
> bước 11 là lúc đi tìm màu đỏ đó.

---

## 8. Cú pháp nhập

### 8.1 Không cần ngữ pháp mới
`parseChain` cắt token bằng `[a-z*]+`, tách ở `*`, tra **khớp chính xác** ⇒ mọi mã mới hoạt động
ngay, **không sửa một dòng nào của bộ phân tích**.

### 8.2 Kết quả × Kỹ thuật là hai trục vuông góc

Một pha cứu thua có **hai câu hỏi độc lập**:

| | Câu hỏi | Event | Cộng vào `saves`? |
|---|---|---|---|
| **Kết quả** | dính hay không dính? | `catch` / `parry` | ✅ **có** |
| **Kỹ thuật** | đứng, bay, đổ, trên đầu, quỳ? | 5 event `save …` | ❌ **không** |

Ghi bằng cú pháp `*` đã có: **`1ca*vd`** = thủ môn số 1, *chụp dính*, *kỹ thuật bay người*.

**Nếu 5 event kỹ thuật cũng cộng `saves`, mỗi pha cứu thua đếm thành 2** — và `Save Rate` cùng
`On Target Faced` sai theo. Chính là lỗi mà `tests/hero-chains.test.js` (*"no entry books the same
metric twice"*) đã bắt được một lần cho `#shot on target #goal`.

Bất biến kiểm được: `standing+diving+collapse+overhead+kneeling` **=** `catch+parry`.
Q2 = **Không** ⇒ không đưa vào cổng, chỉ ghi ở đây.

### 8.3 Luật giai đoạn chuyển tiếp — cấm tag hai lần (Q2 = **Không** ⇒ chỉ tài liệu)

Vì tên cũ và tên mới **cùng cộng vào một roll-up** (§4.3):

> **`1x*pd` cộng `groundDuels` HAI lần.** Tương tự `1v*ca` với `saves`.

Một pha tranh chấp chỉ mang **một** trong ba tên: `ground duel …` **hoặc** `physical duel …`
**hoặc** `loose ball duel …`. Không có mã nào ép luật này — nhưng §12 sẽ **bắt được** nó ở cổng
Submit: nếu home tag `ground duel success` còn away tag `physical duel fail`, cả `ground-mirror`
lẫn `physical-mirror` đều **fail to** (§12.3).

---

## 9. Vá 4 chỗ lệch giữa hai engine (Q5 = **Có**)

Toàn bộ nằm trong `index.html`, đưa nó về đúng bằng `shared.js`:

| # | Chỗ | Sửa |
|---|---|---|
| 1 | `EVENT_INC['take-on concern']` [:3725](../index.html:3725) | `['takeOns']` → `['takeOns','takeOnConcerns']` |
| 2 | `EVENT_INC` [:3706](../index.html:3706) | thêm `'foul won':['foulsWon']` |
| 3 | `newStat()` [:3752](../index.html:3752) | thêm `takeOnConcerns:0, foulsWon:0` |
| 4 | `STAT_GROUPS` [:3745](../index.html:3745) | `Defensive 8→9`, `Discipline 3→4` |
| 5 | `STAT_HEADERS` [:3746](../index.html:3746) | thêm `'Take-on Concerns'` (sau `Recoveries`) và `'Fouls Won'` (sau `Fouls`) |
| 6 | `statRow()` [:3775](../index.html:3775) | thêm `s.takeOnConcerns`, `s.foulsWon` đúng vị trí |
| 7 | `TEAM_SECTIONS` [:3922](../index.html:3922) | thêm `['Take-on Concerns',(s,o)=>s.takeOnConcerns]` (sau `Ground Duels Won`, như `shared.js:645`) |

Sau bước này hai `EVENT_INC`, hai `newStat()`, hai `STAT_GROUPS`/`STAT_HEADERS`/`statRow` và hai
`TEAM_SECTIONS` **khớp nhau hoàn toàn** — và test **T12/T13/T14** (§13) khoá chúng lại để không
lệch nữa.

> Đây là **sửa số liệu đang sai**: hôm nay tab Stats của app tag báo `Take-on Concerns` và
> `Fouls Won` **không tồn tại**, trong khi trang Stats và site khách báo đúng. Đó là hành vi thay
> đổi thấy được — bạn đã đồng ý ở Q5.

---

## 10. Xếp lại thứ tự bảng Event types (Q6 = **Có**)

### 10.1 Xếp theo cái gì
Theo đúng `FILM_EV_GROUPS` (§5.5), để **một bảng làm hai việc** — thứ tự trong modal và thứ tự
trong bộ lọc Film không thể mâu thuẫn nhau:

| Nhóm | Thứ tự |
|---|---|
| **Shooting** | goal · **own goal** · assist · key pass · shot on target · shot off target · blocked shot · miss shot |
| **Distribution** | pass success · pass fail · cross success · cross fail · take-on success · take-on fail · step in |
| **Defensive** | tackle success · tackle fail · interception · clearance · block · recovery · aerial duel success · aerial duel fail · ground duel success · ground duel fail · **physical duel success** · **physical duel fail** · **loose ball duel success** · **loose ball duel fail** · take-on concern · mistake |
| **Goalkeeping** | **catch** · **parry** · save · **save standing** · **save diving** · **save collapse** · **save overhead** · **save kneeling** · **defensive line support success** · **defensive line support fail** · **aerial control success** · **aerial control fail** · **goal conceded** |
| **Set pieces & Other** | corner-kick · free-kick · penalty kick · throw-Ins · goal kick · foul · foul throw · handball foul · foul won · offside · yellow card · red card · substitution · gain possession · pause |
| **Body part** | right foot · left foot · upper body · head · lower body |

*(Mảng thật phải dựng từ dump ở §6.1 — repo chưa biết đủ 48 tên.)*

Ba event cũ bị tách (`ground duel …`, `save`) **cố ý đứng ngay trước** đám kế nhiệm của chúng: ai
mở bảng ra cũng thấy ngay cái mới nằm cạnh cái cũ, đó là hình thức "huấn luyện" rẻ nhất cho §8.3.

### 10.2 Xếp lại có an toàn không — ba câu trả lời

| Câu hỏi | Trả lời | Bằng chứng |
|---|---|---|
| Có mất hotkey không? | **Không.** `pushEventTypes` upsert nhánh `seen` chỉ gửi `{sport, event_name, ord}`, **không gửi `key`** ⇒ PostgREST chỉ `SET` những cột có trong payload, `key` giữ nguyên. | [cloud-sync.js:179-184](../cloud-sync.js:179) |
| Có hỏng macro không? | **Không.** Macro lưu theo tên; `renderMacros` tra theo tên. `ord` không tham gia. | §7.4 |
| Có mất event đang chọn không? | **Không.** `applyEventTypes` giữ `state.activeEvent` **theo tên**, chỉ đổi khi tên đó biến mất. | [index.html:2113](../index.html:2113) |

**Cái giá duy nhất:** realtime bắn thứ tự mới về mọi máy, nên bảng *Event types* của người khác
**nhảy chỗ ngay giữa lúc họ đang tag**. Không mất dữ liệu, chỉ giật mình. ⇒ §15 bước 10: làm khi
không ai đang tag, và báo trước.

---

## 11. `own goal` (R9)

### 11.1 Tin tốt: repo đã chuẩn bị sẵn cho nó ở **4 nơi**

`own goal` chưa hề có trong từ điển — nên chưa ai tag được — **nhưng bốn nơi hạ nguồn đã xử lý nó
đầy đủ, và đã có test**:

| Nơi | Đã làm gì |
|---|---|
| [Stats/stats-view.js:929](../Stats/stats-view.js:929) `teamGoals()` | *"goals scored by a team = its own 'goal' events + opponent own goals"* — **đúng luật bạn yêu cầu** |
| [Stats/stats-view.js:967](../Stats/stats-view.js:967) `SUMMARY_EVENTS` | `'own goal':'og'` — hiện trên timeline tổng kết |
| [Stats/report.js:486](../Stats/report.js:486), [:519](../Stats/report.js:519) | nhãn *"Own Goal <tên>"* và **cộng tỉ số cho phía kia** trong timeline PDF |
| [client/assets/app.js:798](../client/assets/app.js:798) `gkFigures` | own goal của đội mình **tính là bàn thua** của thủ môn |
| `tests/player-data.test.js:357`, `tests/report-visuals.test.js:111` | đã có test cho cả hai |

⇒ `Stats/report.js` và `client/assets/app.js` vẫn **0 dòng**.

### 11.2 Chỗ phải sửa #1 — bảng điểm của app tag

[index.html:1421](../index.html:1421) hiện chỉ đếm `goal`:

```js
state.rows.forEach(r=>{ if(r.event==='goal'){ r.team==='home'?home++:away++; } });
```

Sửa thành **bản sao chính xác của `teamGoals()`**, để hai chỗ không thể lệch nhau:

```js
state.rows.forEach(r=>{
  if(r.event==='goal'){ r.team==='home'?home++:away++; }
  else if(r.event==='own goal'||r.event==='own-goal'){ r.team==='home'?away++:home++; }
});
```

> **Cố ý dùng `===` chứ không dùng `evKey()`.** `teamGoals()` ở Stats dùng `===`; nếu ở đây dùng
> `evKey` thì một hàng tag `"Goal"` (viết hoa) sẽ ghi bàn trên bảng điểm nhưng **không** ghi ở
> trang Stats — tạo ra đúng loại bất đồng mà sửa lần này định xoá. Nhận diện không phân biệt
> hoa/thường là chuyện của một PR khác (§16-Q10).

### 11.3 Chỗ phải sửa #2 — `TEAM_SECTIONS` (⚠️ **xem Q8**)

`TEAM_SECTIONS` có `['Goals',(s,o)=>s.goals]` và `['Goals Conceded',(s,o)=>o.goals]`. Nếu **không**
sửa, ngay trên cùng một trang Stats sẽ có:

* dòng tiêu đề (`matchSummaryHTML` → `teamGoals`): **0 – 1** ✔
* bảng General (`TEAM_SECTIONS`): **Goals 0 – 0** ✘

Đó là **bug do chính thay đổi này sinh ra**. Sửa gọn, dùng đúng hai đối số đã có sẵn:

```js
['Goals',          (s,o)=>s.goals + o.ownGoals],
['Goals Conceded', (s,o)=>o.goals + s.ownGoals],
```

Hai bản: [shared.js:629](../shared.js:629) + [:647](../shared.js:647) và
[index.html:3924](../index.html:3924) + [:3942](../index.html:3942).

> ⚠️ Dòng `Goals Conceded` chính là dòng Q3 nói **"không đụng"**. Q3 nói vậy vì lý do *`goal
> conceded` tag tay không được ghi đè con số suy ra* — và điều đó **vẫn giữ nguyên**. Sửa ở đây là
> vì một lý do khác hẳn: own goal. Vẫn là số **suy ra**, chỉ suy ra cho đúng. → **Q8**.

### 11.4 Những chỗ `own goal` **không** đụng tới

| Chỗ | Vì sao |
|---|---|
| `EVENT_INC` → `goals` / `totalShots` | **Không** cộng. `s.goals` nuôi *Goals* và *Goals Conceded*; cộng vào đó là ghi bàn cho nhầm đội. Chỉ `ownGoals`. |
| `SHOT_KINDS` ([shared.js:334](../shared.js:334)) | `own goal` không có trong đó ⇒ không lọt vào Event List / bản đồ sút. Đúng. |
| `evtClass` | `SHOT_EVENTS = /shot\|^goal$\|^own goal$/i` **đã** khớp ⇒ badge đen `.shot` tự có. **0 dòng.** |
| `GOAL_SPOT_EVENTS` / `SPOT_REQUIRED` | **Không** thêm. Bắt buộc chấm khung thành cho own goal là **siết cổng** — không ai yêu cầu → **Q11**. |
| `attackDir()` ([Stats/stats-view.js:163](../Stats/stats-view.js:163)) | `shotKinds` cục bộ không có `own goal` ⇒ hướng tấn công không bị một pha phản lưới kéo lệch. Đúng. |

### 11.5 Chỗ phải sửa #3 — tỉ số xem trước khi join trận

[cloud-sync.js:305](../cloud-sync.js:305) `findMatchByCode()` tính tỉ số bằng truy vấn server:

```js
const { data: goals } = await sb.from('events').select('team')
  .eq('match_id', data.id).eq('event_name', 'goal');
(goals || []).forEach(g => (g.team === 'home' ? h++ : a++));
```

Không sửa thì ô xem trước trận ([index.html:4051](../index.html:4051)) hiện **1 – 0** trong khi bảng
điểm hiện **0 – 1**. Sửa:

```js
const { data: goals } = await sb.from('events').select('team,event_name')
  .eq('match_id', data.id).in('event_name', ['goal', 'own goal', 'own-goal']);
(goals || []).forEach(g => {
  const own = g.event_name !== 'goal';
  if (g.team === 'home' ? !own : own) h++; else a++;
});
```

⇒ **`cloud-sync.js` rời khỏi danh sách "0 dòng"**, và phải bump `?v=` (§14).

---

## 12. Cổng Submit Analysis: 7 → 11 check (R11)

### 12.1 Bốn check mới, đúng như bạn viết

```js
const DUEL_MIRRORS=[
  {id:'aerial-mirror',   label:'Aerial duels won ↔ lost',
   a:['aerial duel success'],      b:['aerial duel fail'],       aName:'won', bName:'lost'},
  {id:'ground-mirror',   label:'Ground duels won ↔ lost',              // legacy, giữ NGUYÊN
   a:['ground duel success'],      b:['ground duel fail'],       aName:'won', bName:'lost'},
  {id:'physical-mirror', label:'Physical duels won ↔ lost',            // ▲ mới
   a:['physical duel success'],    b:['physical duel fail'],     aName:'won', bName:'lost'},
  {id:'loose-mirror',    label:'Loose ball duels won ↔ lost',          // ▲ mới
   a:['loose ball duel success'],  b:['loose ball duel fail'],   aName:'won', bName:'lost'},
  {id:'takeon-mirror',   label:'Take-ons won ↔ take-on concerns',
   a:['take-on succes','take-on success'], b:['take-on concern'], aName:'won', bName:'concerns'}
];
const DUEL_TOTALS=[
  {id:'aerial-total',   label:'Aerial duels — the same number on both sides',
   of:['aerial duel success','aerial duel fail'],           from:'aerial-mirror',   n:2},
  {id:'ground-total',   label:'Ground duels — the same number on both sides',
   of:['ground duel success','ground duel fail'],           from:'ground-mirror',   n:4},
  {id:'physical-total', label:'Physical duels — the same number on both sides',      // ▲
   of:['physical duel success','physical duel fail'],       from:'physical-mirror', n:6},
  {id:'loose-total',    label:'Loose ball duels — the same number on both sides',    // ▲
   of:['loose ball duel success','loose ball duel fail'],   from:'loose-mirror',    n:8}
];
const AN_ORDER=['aerial-total','aerial-mirror','ground-total','ground-mirror',
                'physical-total','physical-mirror','loose-total','loose-mirror',
                'takeon-mirror','shot-spot','shirt-numbers'];
```

`n` là số thứ tự của **mirror tương ứng** trong `AN_ORDER` (1-based) — dòng
*"See check N for which half of the duel is missing"* ([index.html:2864](../index.html:2864)) trỏ
tới đó. Với thứ tự trên: 2, 4, 6, 8. ✔ *(hôm nay aerial-total n:2, ground-total n:4 — cùng quy tắc)*

`duelTally()` tự lấy tên từ `DUEL_MIRRORS` ⇒ **không cần sửa**. `sumOf()`, `totalCheck()`,
`mirrorCheck()` ⇒ **không cần sửa**.

### 12.2 Vì sao `ground-mirror` giữ nguyên chỉ-legacy (chứ không gộp cả 6 tên)

| Loại trận | ground-* | physical-* | loose-* |
|---|---|---|---|
| chỉ tên cũ | kiểm thật ✔ | 0=0, pass vô hại | 0=0, pass vô hại |
| chỉ tên mới | 0=0, pass vô hại | kiểm thật ✔ | kiểm thật ✔ |
| trộn | kiểm thật ✔ | kiểm thật ✔ | kiểm thật ✔ |

Không có ô nào "cổng ngừng kiểm mà vẫn báo ✓" — điều mà comment tại
[index.html:2781](../index.html:2781) cảnh báo (*"A gate that misses … is worse than no gate: it
reports a clean match"*). Mỗi họ tự canh mình, và mỗi check độc lập.

### 12.3 Phần thưởng kèm theo: cổng bắt luôn lỗi §8.3

Home tag `ground duel success`, away tag `physical duel fail` cho **cùng một pha**:

* `ground-mirror`: home won 1 ≠ away lost 0 → **FAIL**
* `physical-mirror`: home won 0 ≠ away lost 1 → **FAIL**

Cả hai cùng kêu, và người tag thấy ngay hai họ đang bị dùng lẫn. Đây là lý do Q2 = Không vẫn ổn:
§12 đã che phần lỗi nguy hiểm nhất của §8.3.

### 12.4 ⚠️ Chữ *"seven"* nằm cứng ở **4 chuỗi người dùng thấy**

`AN_ORDER.length` đi từ 7 lên 11, nhưng chữ "seven" được viết tay:

| Nơi | Chuỗi |
|---|---|
| [index.html:3045](../index.html:3045) | `'… '+bad.length+' of the seven analysis checks …'` |
| [index.html:4187](../index.html:4187) | `'Analysis checks — all seven passed.'` |
| [index.html:4188](../index.html:4188) | `'Analysis checks — '+pass+' of 7 passed.'` |
| [index.html:4188](../index.html:4188) | `'… blocked until all seven pass.'` |

**Sửa bằng cách suy ra, để không bao giờ nói dối nữa:**

```js
'… '+bad.length+' of the '+AN_ORDER.length+' analysis checks …'
'Analysis checks — all '+AN_ORDER.length+' passed.'
'Analysis checks — '+pass+' of '+AN_ORDER.length+' passed.  Publishing is blocked until all pass.'
```

Cộng 4 comment cũng nói "seven": [index.html:239](../index.html:239),
[:612](../index.html:612), [:2756](../index.html:2756), [:3025-3026](../index.html:3025).

**Hệ quả cho test:** `tests/analysis-gate.test.js` khẳng định con số 7 ở **8 chỗ** (dòng 125, 129,
298, 311, 312, 438, 446, 471). Chúng **sẽ phải sửa** — xem §13.2, và đó là cập nhật *số đếm*, không
phải nới lỏng hành vi.

---

## 13. Kế hoạch test

### 13.1 File mới: `tests/gk-events-duel-split.test.js`

| # | Test | Bắt lỗi gì |
|---|---|---|
| **T1** | Trận **chỉ có tên cũ**: `Ground Duels` / `Saves` **y hệt trước khi đổi** | §4.4 — hồi quy lịch sử |
| **T2** | Trận **chỉ có tên mới**: `groundDuels` = physical + loose; `saves` = catch + parry | §4.3 |
| **T3** | Trận **trộn**: roll-up = tổng đủ cả hai họ | tương thích ngược |
| **T4** | Mọi khoá `EVENT_INC` là chữ thường; mọi tên trong `pitchtagger_events.json` tra được qua `evKey` | §3 |
| **T5** | 5 event kỹ thuật **không** cộng `saves`; `catch`/`parry` **có** | §8.2 — đếm đôi |
| **T6** | Không có event chi tiết → cột ra **`'—'`**, **không phải `0`**; và cờ cộng dồn qua `sumTeam` | §4.5 |
| **T7** | `physical-mirror` / `loose-mirror` / hai total **fail** đúng khi lệch | §12.1 |
| **T8** | 3 loại trận ở bảng §12.2 cho đúng verdict (không có ô nào pass giả) | §12.2 |
| **T9** | Trận trộn họ (home ground / away physical) làm **cả hai** mirror fail | §12.3 |
| **T10** | `AN_ORDER.length === 11`; `n` của 4 total trỏ đúng mirror của nó (2/4/6/8) | §12.1 |
| **T11** | Chuỗi refusal **suy ra** từ `AN_ORDER.length`, không có chữ `seven` nào còn sót | §12.4 |
| **T12** | `evtClass` → `duel-physical`, `duel-loose`, và `duel-ground`/`duel-aerial` **không đổi** | §5.4 |
| **T13** | `filmEvGroup` xếp 17 tên mới đúng heading, **không** rơi xuống `FILM_EV_REST` | §5.5 |
| **T14** | 17 mã hotkey: không đụng nhau, không đụng mã event, **không đụng mã macro** | §6.2, §7.2 |
| **T15** | Mọi tên mà 40 macro trỏ tới **vẫn có** trong từ điển sau thay đổi (không macro nào `.miss`) | **§7.1 — R12** |
| **T16** | `EVENT_INC` / `newStat()` / `STAT_GROUPS` / `STAT_HEADERS` / `statRow` / `TEAM_SECTIONS` của `shared.js` và `index.html` **khớp nhau** | §2.1, §9 |
| **T17** | `STAT_HEADERS.length` = tổng span `STAT_GROUPS`, `statRow()` đúng số cột (cả 2 bản) | bất biến xlsx |
| **T18** | `computeScore()`: own goal của home → **+1 away**; và cho **cùng kết quả** với `teamGoals()` trên cùng bộ rows | §11.2 — R9 |
| **T19** | `own goal` **không** cộng `goals`/`totalShots`; `TEAM_SECTIONS` *Goals* / *Goals Conceded* khớp `computeScore()` | §11.3, §11.4 |
| **T20** | `findMatchByCode()` tính tỉ số xem trước bằng đúng luật của `computeScore()` | §11.5 |

### 13.2 Test cũ **sẽ phải sửa** — và vì sao mỗi cái là chính đáng

Tài liệu trước đặt tiêu chí "1298 test cũ pass không sửa một dòng". Với các yêu cầu mới thì
**không giữ được**, và nói thẳng ra chỗ nào tốt hơn là để nó nổ lúc chạy:

| File | Sửa gì | Vì sao **không phải** là nới lỏng |
|---|---|---|
| `tests/analysis-gate.test.js` (8 chỗ: 125, 129, 298, 311, 312, 438, 446, 471) | `7` → `11`, `/seven/` → số suy ra | Bạn **yêu cầu** thêm 4 check (R11). Số check đổi thì khẳng định về số check phải đổi. Nội dung từng check không nới. |
| `tests/events-table.test.js:31` | allow-list `['','shot','duel-ground','duel-aerial']` thêm `'duel-physical','duel-loose'` | Bạn **yêu cầu** màu mới (R10) |
| `tests/events-table.test.js:32-33` | mảng kỳ vọng class `shot` thêm `'own goal'` | `own goal` vào từ điển ⇒ vòng lặp `EVENTS.football` gặp nó, và `SHOT_EVENTS` **vốn đã** khớp `^own goal$`. Là **fixture rộng ra**, không phải hành vi đổi. |

### 13.3 Test cũ **không** phải sửa (đã kiểm)

* `tests/macro-hotkeys.test.js` — dùng `EVENTS` làm từ điển; thêm event không đổi kỳ vọng. **Phải
  chạy lại** vì nó là lưới an toàn chính cho R12.
* `tests/events-table.test.js:22-27` — "the duel colours are unchanged": ground → `duel-ground`,
  aerial → `duel-aerial`. §5.4 giữ nguyên hai cái đó. ✔
* `tests/client-channels.test.js:858` — ghim cách viết 17 tên; **không tên nào bị đổi**. ✔
* `tests/hero-chains.test.js` — `DICT.has()` phân biệt hoa/thường; bảng chains của landing không
  dùng tên mới. ✔
* `tests/player-data.test.js:357`, `tests/report-visuals.test.js:111` — đã test own goal từ trước,
  và §11 không đụng đường nào chúng đi qua. ✔
* `tests/asset-versions.test.js` — sẽ **fail cho tới khi** §14 làm xong. Đó là chức năng của nó.

**Tiêu chí ra:** `node tests/run.js` xanh; **đúng 3 file test cũ được sửa**, mỗi file đúng những
dòng ở §13.2 và **không dòng nào khác**. Bất kỳ test cũ nào khác phải sửa ⇒ dừng, đọc §17.

---

## 14. Cache-bust + deploy

Lần này **cả `shared.js` và `cloud-sync.js` đều đổi** ⇒ **5 nơi** (tài liệu trước là 4).

| # | File | Dòng | Từ → đến |
|---|---|---|---|
| 1 | [Stats/index.html:62](../Stats/index.html:62) | `shared.js?v=22` | → `?v=23` |
| 2 | [Player-Lists/index.html:98](../Player-Lists/index.html:98) | `shared.js?v=22` | → `?v=23` |
| 3 | [client/assets/app.js:1623](../client/assets/app.js:1623) | `shared.js?v=22` | → `?v=23` ⚠️ **nằm trong JS, không phải markup** |
| 4 | [client/app.html:81](../client/app.html:81) | `app.js?v=44` | → `?v=45` *(vì #3 vừa sửa app.js)* |
| 5 | [index.html:4293](../index.html:4293) | `cloud-sync.js?v=50` | → `?v=51` *(§11.5)* |

Vì §5.5 (`FILM_EV_GROUPS`) nằm trong phạm vi ⇒ thêm:

| # | File | Dòng | Từ → đến |
|---|---|---|---|
| 6 | [Stats/index.html:63](../Stats/index.html:63) | `stats-view.js?v=22` | → `?v=23` |
| 7 | [client/assets/app.js:1634](../client/assets/app.js:1634) | `stats-view.js?v=22` | → `?v=23` |

`index.html` không mang `?v=` cho chính nó (nó **là** trang) ⇒ không bump.

Bắt buộc, sau cùng:

```bash
node tests/asset-versions.test.js --update
```

rồi commit `tests/asset-versions.json`.

**`deploy.yml`: 0 dòng.** Không tạo file mới; `pitchtagger_events.json` đã có `cp` ở
[dòng 70](../.github/workflows/deploy.yml:70).

---

## 15. Thứ tự triển khai

| Bước | Việc | Kiểm chứng |
|---|---|---|
| 0 | **⛔ Dump từ điển + macro thật (§6.1)**, đối chiếu lại 17 mã ở §6.2 | T14 |
| 1 | Đồng bộ `pitchtagger_events.json` + `DEFAULT_EVENTS` với 48 tên thật, **rồi** thêm 17 tên mới theo thứ tự §10.1. **Không bấm `＋ Add` lần nào** (§7.3) | T4, T15 |
| 2 | Vá 4 chỗ lệch (§9) | T16, T17 |
| 3 | `EVENT_INC` + `newStat()` × **2 bản** (§5.2) | T1–T6 |
| 4 | `PLAYER_CATS` + `GK_COLS` + cờ `—` (§5.3.1–2) | T6 |
| 5 | `evtClass` + 2 dòng CSS (§5.4) | T12 |
| 6 | Cổng: 4 check + `AN_ORDER` + 4 chuỗi suy ra (§12) | T7–T11 |
| 7 | `own goal`: `computeScore` (§11.2) · `TEAM_SECTIONS` ×2 (§11.3) · `GOAL_SPOT_EVENTS`+`SPOT_REQUIRED` (Q11) · `findMatchByCode` (§11.5) | T18–T20 |
| 8 | `FILM_EV_GROUPS` (§5.5) | T13 |
| 9 | Bump 5–7 chỗ `?v=` + `--update` (§14) | `asset-versions` xanh |
| 10 | **Khi không ai đang tag**: đăng nhập một lần → 17 hàng + thứ tự mới lên cloud (§5.1, §10.2) | mở bảng Event types trên máy thứ hai |
| 11 | **Mỗi analyst mở *Event types + Macro* một lần, tìm ô mã ĐỎ** (§7.2) | không ô nào đỏ |
| 12 | Tag thử một trận ngắn: đủ 3 nhóm mới + 1 `own goal`. Mở Stats, Film, Submit Analysis, xuất xlsx + PDF | bảng điểm, General, timeline PDF đều nói cùng một tỉ số |

**Kế hoạch lùi:** không có migration dữ liệu, không hàng nào bị viết lại (§4.4) ⇒ lùi = `git revert`.
Hàng đã tag bằng tên mới sẽ trỏ vào tên từ điển không còn có: hiển thị bình thường, đếm bằng 0,
**không mất**. Đó là mức thiệt hại tệ nhất, và nó đảo ngược được.

---

## 16. Câu hỏi vòng hai — và câu trả lời đã dùng khi triển khai

| # | Câu hỏi | Mặc định nếu không trả lời |
|---|---|---|
| **Q8** | §11.3 — `own goal` buộc `TEAM_SECTIONS` *Goals* / *Goals Conceded* phải thành `s.goals+o.ownGoals` / `o.goals+s.ownGoals`. | ✅ **ĐÃ SỬA**, cả hai bản (`shared.js` + `index.html`). Test T19. |
| **Q9** | §7.3 — vá `nextFreeKey()` để nó loại cả mã macro. | ✅ **ĐÃ VÁ**. `＋ Add` không còn phát ra mã mà một macro đang giữ. Test T15b. |
| **Q10** | §11.2 — làm `computeScore`/`teamGoals` không phân biệt hoa/thường? | ❌ **Không.** `computeScore()` là bản sao **chính xác** của `teamGoals()`, kể cả phép so `===`. Sai giống hệt nhau còn hơn lệch nhau. |
| **Q11** | §11.4 — `own goal` có phải đặt chấm trong khung thành không? | ✅ **CÓ.** Thêm vào **cả** `GOAL_SPOT_EVENTS` (cổng nhập) **và** `SPOT_REQUIRED` (cổng phân tích) — một cổng lỏng hơn UI thì không phải cổng. Test T19b khoá hai `Set` bằng nhau. |
| **Q12** | §5.4 — hai mã màu `#d98a3f` (physical) và `#3fb0a8` (loose ball). | ✅ **Chốt.** Đã kiểm trong trình duyệt thật: 5 màu badge phân biệt hoàn toàn. |

---

## Phụ lục A — 17 event, bảng tra nhanh

| `event_name` | mã | counter riêng | roll-up cũ nó nuôi | nhóm |
|---|---|---|---|---|
| `own goal` | `og` | `ownGoals` | — *(tỉ số xử lý riêng, §11)* | Shooting |
| `physical duel success` | `pd` | `physicalDuels`, `physicalDuelsWon` | `groundDuels`, `groundDuelsWon` | Defensive |
| `physical duel fail` | `pdd` | `physicalDuels` | `groundDuels` | Defensive |
| `loose ball duel success` | `lo` | `looseBallDuels`, `looseBallDuelsWon` | `groundDuels`, `groundDuelsWon` | Defensive |
| `loose ball duel fail` | `loo` | `looseBallDuels` | `groundDuels` | Defensive |
| `catch` | `ca` | `catches` | **`saves`** | Goalkeeping |
| `parry` | `pr` | `parries` | **`saves`** | Goalkeeping |
| `save standing` | `vs` | `saveStanding` | — (§8.2) | Goalkeeping |
| `save diving` | `vd` | `saveDiving` | — | Goalkeeping |
| `save collapse` | `vc` | `saveCollapse` | — | Goalkeeping |
| `save overhead` | `vo` | `saveOverhead` | — | Goalkeeping |
| `save kneeling` | `vk` | `saveKneeling` | — | Goalkeeping |
| `defensive line support success` | `ln` | `defLineSupports`, `defLineSupportsWon` | — | Goalkeeping |
| `defensive line support fail` | `lnn` | `defLineSupports` | — | Goalkeeping |
| `aerial control success` | `ac` | `aerialControls`, `aerialControlsWon` | — | Goalkeeping |
| `aerial control fail` | `acc` | `aerialControls` | — | Goalkeeping |
| `goal conceded` | `gc` | `goalsConceded` | — (§5.3.4) | Goalkeeping |

## Phụ lục B — ba tên cũ ở lại, và vì sao

| Tên | Vì sao không xoá |
|---|---|
| `ground duel success` · `ground duel fail` | Hàng đã tag sẽ trỏ vào tên từ điển không còn có; **macro `xa` và `xxaa` chết** (§7.1); `renderEvents()` **cố tình không cho xoá** ([index.html:2125](../index.html:2125)) |
| `save` | Như trên, và `saves` nuôi `Save Rate` / `On Target Faced` / trang thủ môn của PDF |

## Phụ lục C — bảng "một dòng, một chỗ" để rà khi code

| Sửa gì | `shared.js` | `index.html` | `Stats/stats-view.js` | khác |
|---|---|---|---|---|
| `EVENT_INC` | [:191](../shared.js:191) | [:3706](../index.html:3706) | — | — |
| `newStat()` | [:239](../shared.js:239) | [:3752](../index.html:3752) | — | — |
| `STAT_GROUPS` / `STAT_HEADERS` / `statRow` | [:232](../shared.js:232) | [:3745](../index.html:3745) | — | — |
| `PLAYER_CATS` | [:293](../shared.js:293) | — | qua `STAT_CATS` [:57](../Stats/stats-view.js:57) | `client/assets/app.js` đọc |
| `GK_COLS` | [:326](../shared.js:326) | — | — | `client/assets/app.js` [:1008](../client/assets/app.js:1008) |
| `TEAM_SECTIONS` | [:627](../shared.js:627) | [:3922](../index.html:3922) | — | — |
| `evtClass` + CSS | — | [:3510](../index.html:3510) + [:185](../index.html:185) | — | — |
| `DUEL_MIRRORS`/`DUEL_TOTALS`/`AN_ORDER` | — | [:2798](../index.html:2798) / [:2812](../index.html:2812) / [:2822](../index.html:2822) | — | — |
| chuỗi *"seven"* | — | [:3045](../index.html:3045), [:4187-4188](../index.html:4187) | — | — |
| `computeScore` | — | [:1421](../index.html:1421) | *đối chiếu* `teamGoals` [:929](../Stats/stats-view.js:929) | — |
| tỉ số xem trước | — | — | — | `cloud-sync.js` [:305](../cloud-sync.js:305) |
| `FILM_EV_GROUPS` | — | — | [:1345](../Stats/stats-view.js:1345) | — |
| Từ điển | — | [:828](../index.html:828) | — | `pitchtagger_events.json` |
| `DEF_CATS` **(P2 — hoãn)** | — | — | [:180](../Stats/stats-view.js:180) | — |

---

## 17. Hàng rào — cái gì KHÔNG đổi

### 17.1 Cam kết **0 dòng thay đổi**

| File | Vì sao an toàn |
|---|---|
| `Stats/report.js` | đọc `groundDuels*`/`saves` (§4.4 giữ nguyên nghĩa) và **đã** xử lý `own goal` (§11.1) |
| `Player-Lists/index.html` | chỉ dùng phần lineup của `shared.js`, không dùng bộ đếm *(chỉ bump `?v=`)* |
| `auth.js`, `auth.html`, `shared.css`, `shared-page.css` | không liên quan |
| `worker/**` | không đọc tên event |
| `supabase/migrations/0001…0020` | §5.9 — Q7 = Không |
| `.github/workflows/deploy.yml` | không có file mới cần phục vụ qua web |
| `client/assets/app.js` — **logic** | đọc `PLAYER_CATS`/`GK_COLS` của `shared.js`; và `gkFigures` **đã** đúng với own goal *(chỉ bump `?v=`)* |

*(`cloud-sync.js` đã **rời** danh sách này vì §11.5.)*

### 17.2 Ba thứ **vẫn hoãn**, chờ bạn cho phép

| # | Thay đổi | Vì sao |
|---|---|---|
| **P1** | Thêm dòng duel/GK vào `TEAM_SECTIONS` (§5.3.3) | bảng so sánh đội dài ra cho **mọi trận**, cả trận cũ |
| **P2** | `DEF_CATS` — bản đồ Defensive (§5.6) | thêm mục vào dropdown |
| **P4** | Tab thứ 5 *Goalkeeping* ở Stats ([Stats/index.html:53](../Stats/index.html:53)) | UI mới. Site khách **đã có** khái niệm này ([app.js:1008](../client/assets/app.js:1008)); app tag thì chưa |

*(P3 — luật chống tag-hai-lần — đã được Q2 trả lời **Không**, và §12.3 cho thấy cổng bắt được phần
nguy hiểm nhất của nó rồi.)*
