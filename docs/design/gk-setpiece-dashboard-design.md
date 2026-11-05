# Dashboard cho **Goalkeeper** và **Set Pieces** — Detailed Design

Hai tab cuối trên **Dashboard** hiện chỉ vẽ ra một dòng chữ: "No dashboard for Goalkeeper
yet. Its table is on the **Stats** tab." Tài liệu này thiết kế cái đứng vào chỗ đó.

**Trạng thái: CHƯA TRIỂN KHAI.** Đây là bản thiết kế để duyệt. Không một dòng code nào
được sửa cho tới khi §12 được trả lời. Baseline hiện tại: **1456/1456 test passing**
(`node tests/run.js`, đo lúc viết bản này).

**Phạm vi sửa: duy nhất** `Stats/stats-view.js` + `Stats/stats-view.css`, cộng phần bump
`?v=` bắt buộc (4 chỗ) và các test bị khoá ngược. **Không** đụng `shared.js`, **không**
đụng `Stats/report.js` (PDF), **không** đụng `client/assets/app.js`, **không** đụng
`index.html`, **không** thêm event mới, **không** thêm counter mới. §10 liệt kê từng thứ
không được đụng và lý do.

---

## 0. Bản này khác gì bản 2026-08-30

Bản trước viết ngày 30-08. Từ đó repo đã đi tiếp (`red-card-moment`, `player-season-table`,
`match-edit`). Đã kiểm tra lại **toàn bộ** dữ liệu và cả bốn dashboard đang chạy. Kết quả:

**Tám điều bản cũ nói đúng, đã xác minh lại từng dòng:**

| Khẳng định | Xác minh |
|---|---|
| `gXY` chỉ ghi trên 3 event | `index.html:1348` + `index.html:2708` ✓ |
| `goalMarks()` bỏ sót `own goal` | `SHOT_KINDS` (`shared.js:605`) không chứa `own goal` ✓ |
| Event thủ môn có `pXY`, không có `gXY` | ✓ |
| 5 event mở set piece | `SET_PIECE_EVENTS` `shared.js:354` ✓ |
| `setPieceFold` ghi công người **dứt điểm** | `shared.js:370-392` ✓ |
| Mọi map hiện có đều lọc `r.team===team` | 5/5 map ✓ |
| Nhánh `else` trần phải ở lại | `tests/stats-tabs-split.test.js:79` ✓ |
| 8 cái tên bị cấm | `tests/stats-tabs-split.test.js:93` ✓ |

**Năm điều bản cũ SAI hoặc CHƯA BIẾT — đây là phần đổi thiết kế:**

1. **Baseline không phải 1401.** Là **1456/1456**. Bản cũ ghi 1401 (số của 29-08).

2. **`GK_COLS` đã đổi HÔM NAY (2026-09-03).** Cột `Conceded` *dẫn xuất* đã bị gỡ
   (`shared.js:559-563`). §2.6 dưới đây viết lại theo trạng thái mới. Bản cũ mô tả một
   bảng không còn tồn tại.

3. **`ord` tồn tại trên mọi row và chưa màn hình nào dùng** (`index.html:2704`). Đây là
   *thứ tự trong chuỗi*. Nó cho phép phễu set piece đòi hỏi event set piece phải **mở
   đầu** chuỗi, thay vì chỉ "có mặt đâu đó trong chuỗi". Xem §2.3.

4. **⚠️ Cái bẫy `TRANSFER_EVENTS` — cái này giết ý tưởng "mũi tên đường chuyền" ngây thơ.**
   `TRANSFER_EVENTS` (`index.html:2463`) **không chứa** event set piece nào. Trong một
   nhóm phím, `rXY` chỉ rơi vào event *transfer cuối cùng*, hoặc phím cuối nhóm nếu không
   có transfer nào (`index.html:2486-2493`). Nghĩa là:
   - `7 corner-kick 14 head goal` → corner-kick **có** `rXY` (nó là phím cuối nhóm)
   - `7 corner-kick cross-success 14 head goal` → **cross success** giữ `rXY`, corner-kick
     **không**
   
   Vẽ mũi tên thẳng từ row corner-kick là vẽ một bức tranh **thủng lỗ chỗ theo thói quen
   tag**, không theo trận đấu. §5.4 giải quyết bằng `ord` thay vì bằng `rXY`.

5. **Năm cờ `*Detail` được đếm nhưng KHÔNG AI ĐỌC.** `saveDetail`, `gkTechDetail`,
   `gkCtrlDetail`, `concededDetail` (`shared.js:314`), `spDetail` (`shared.js:317`).
   Grep toàn repo: chỉ xuất hiện trong `shared.js`, không có trong `stats-view.js` cũng
   không có trong `report.js`. Chúng phân biệt **"0 vì không có gì xảy ra"** với
   **"0 vì không ai tag"** — đúng thứ hai dashboard này cần cho trạng thái rỗng. §8.

---

## 1. Vì sao hai tab này rỗng, và vì sao lần trước hỏng

Ngày 2026-08-29, commit `e3ec875` **gỡ** hai dashboard đã từng tồn tại. Chúng là
`plainEventMapHTML` + một dropdown chọn event — nghĩa là *một sân bóng, chấm ở chỗ event
được tag*. Trên dữ liệu thật, kết quả là **một sân trống dưới một hàng `0%`**.

Lý do thất bại nằm ở **dữ liệu**, không nằm ở code:

- **Thủ môn**: sự kiện của anh ta ít, và tất cả nằm gọn trong vòng 20m quanh khung thành.
  Vẽ lên sân 105×68 thì được một cụm chấm bằng đầu ngón tay ở đáy sân và ba dải đọc là
  `0% / 0% / 100%`. Bản đồ sân **trả lời sai câu hỏi**: câu hỏi về thủ môn không phải "ở
  đâu trên sân" mà là **"ở đâu trong khung thành"**.
- **Set piece**: `corner-kick` luôn ở góc sân, `goal kick` luôn ở vòng 5m50. Vẽ chúng lên
  sân là **vẽ lại định nghĩa của chính chúng**. Câu hỏi thật là **"nó dẫn tới cái gì"**,
  và câu đó đọc *chuỗi* `grp`/`ord`, không đọc toạ độ.

> **Bài học được ghi thẳng vào thiết kế này: một dashboard không phải là một bản đồ sân +
> dropdown.** Mỗi tab phải trả lời câu hỏi của riêng nó bằng hình dạng của riêng nó.

Có một hệ quả thứ hai, ít ai để ý và quan trọng hơn: **17 event thủ môn chỉ mới có từ
2026-08-28** (`docs/gk-events-and-duel-split-design.md`, `seed_gk_events.js`). Và theo cách
từ điển event hoạt động, `DEFAULT_EVENTS` chỉ được đọc ở lần mở **đầu tiên** — một máy đã
từng vào, hoặc một account đã có từ điển trên cloud, sẽ **không bao giờ** tự thấy 17 tên
mới. Nghĩa là:

> **Trên phần lớn trận đã tag, dashboard Goalkeeper sẽ RỖNG.** Trạng thái rỗng không phải
> ca biên — nó là **màn hình chính** của tab này trong nhiều tháng tới. Thiết kế nào coi
> nhẹ §8 là thiết kế sẽ hỏng lần thứ hai theo đúng cách nó đã hỏng lần thứ nhất.

Nhánh `else` trần hiện tại **ở lại nguyên chỗ** (§10.1). Nó không phải chỗ giữ chỗ cho hai
tab này; nó là lưới an toàn cho *category thứ bảy* mà ai đó thêm sau này.

---

## 2. Khảo sát dữ liệu — cái gì THỰC SỰ có

Mục quan trọng nhất tài liệu. Mọi thứ ở §4 và §5 rơi ra từ đây. Mọi khẳng định đều kèm
số dòng đã kiểm tra lại.

### 2.1 Sự kiện của thủ môn — 13 event, 0 event có `gXY`

| Event | Counter (`EVENT_INC`) | `pXY` | `gXY` |
|---|---|---|---|
| `catch` | `saves`, `catches`, `saveDetail` | ✅ | ❌ |
| `parry` | `saves`, `parries`, `saveDetail` | ✅ | ❌ |
| `save` *(tên cũ, không retire)* | `saves` | ✅ | ❌ |
| `save standing` | `saveStanding`, `gkTechDetail` | ✅ | ❌ |
| `save diving` | `saveDiving`, `gkTechDetail` | ✅ | ❌ |
| `save collapse` | `saveCollapse`, `gkTechDetail` | ✅ | ❌ |
| `save overhead` | `saveOverhead`, `gkTechDetail` | ✅ | ❌ |
| `save kneeling` | `saveKneeling`, `gkTechDetail` | ✅ | ❌ |
| `defensive line support success/fail` | `defLineSupports(Won)`, `gkCtrlDetail` | ✅ | ❌ |
| `aerial control success/fail` | `aerialControls(Won)`, `gkCtrlDetail` | ✅ | ❌ |
| `goal conceded` | `goalsConceded`, `concededDetail` | ✅ | ❌ |
| `goal kick` | `goalKicks` | ✅ | ❌ |

`shared.js:263-279`. Cả 13 đều có trong từ điển repo (`pitchtagger_events.json`, 65 tên).

### 2.2 `gXY` — chỉ ba event, và cả ba là của NGƯỜI SÚT

```js
// index.html:1348
const GOAL_SPOT_EVENTS=new Set(['shot on target','goal','own goal']);
// index.html:2708 — spot chỉ được ghi khi event nằm trong set trên
gXY:(goalCapture&&GOAL_SPOT_EVENTS.has(ev.name))?{x:goalCapture.x,y:goalCapture.y}:null
```

> #### 2.2.1 Hệ quả: panel khung thành phải đọc dữ liệu của ĐỘI ĐỐI PHƯƠNG
>
> Để vẽ "thủ môn nhà bị sút vào đâu trong khung", với đội nhà `T` và đối thủ `O`:
>
> | Nguồn | Ý nghĩa | Màu |
> |---|---|---|
> | `O`.`shot on target` có `gXY` | cú sút bị **cản** | xanh `#39d98a` |
> | `O`.`goal` có `gXY` | **bàn thua** | đỏ `#f7506b` |
> | `T`.`own goal` có `gXY` | **cũng là bàn thua**, do người nhà | đỏ, hình **vuông** |
>
> Cả năm map trong `stats-view.js` — `shotMapHTML`, `defMapHTML`, `distMapHTML`,
> `foulMapHTML`, `plainEventMapHTML` — đều mở bằng `rows.filter(r => r.team===team && …)`.
> Panel này là **panel đầu tiên trong file** lọc theo `r.team !== team`. Bắt buộc viết rõ
> trong comment, nếu không lần đọc code sau sẽ tưởng là bug và "sửa" nó.
>
> **Hướng `own goal`:** `own goal` được tag trên đội **đưa bóng vào lưới nhà mình**
> (`TEAM_SECTIONS`, `shared.js:900`, đọc bàn thắng của một đội là goal của nó cộng own
> goal của đối thủ). Nên own goal của `T` là bàn thua của `T`, và `gXY` của nó nằm trong
> khung thành của `T` — **cùng hệ toạ độ** với các cú sút của `O`. Hai nguồn ghép được.
>
> ⚠️ **`goalMarks()` KHÔNG dùng được ở đây.** Nó lọc `SHOT_KINDS.has(evKey(r.event))`, mà
> `SHOT_KINDS` (`shared.js:605`) **không chứa** `own goal`. Một bàn phản lưới *có* `gXY`
> nhưng bị `goalMarks()` bỏ qua. Panel này cần bộ lọc riêng — `gkFaced()`, §6.1.
> **Không được sửa `goalMarks()`**: nó đang phục vụ tab Shooting *và* `Stats/report.js`.

**Quy ước một-row-một-cú-sút.** Trong `EVENT_INC`, `goal` đã tự tính là một cú sút trúng
đích (`shared.js:192` — nó bump `goals`, `totalShots` và `shotsOn`). Quy ước tag là ghi
`goal` **một mình**, không kèm `shot on target`. Nếu ai đó tag cả hai, hai row cùng mang
`gXY` và panel này đếm hai chấm cho một quả bóng — *nhưng tab Shooting hiện tại cũng đã
sai đúng như thế*, vì `goalMarks()` nhận cả hai loại. Thiết kế này **cố ý giữ nguyên hành
vi đó**: hai màn hình sai giống nhau tốt hơn hai màn hình cãi nhau. Không thêm guard mới.

### 2.3 Set piece: `grp`, `ord`, và cái row đơn độc không có `grp`

Năm event mở đầu, tra qua `evKey` (`shared.js:354`):

```js
const SET_PIECE_EVENTS=new Set(['free-kick','corner-kick','penalty kick',
  'throw-ins','throw-in','goal kick']);
```

Từ điển repo viết throw-in là **`throw-Ins`** (chữ I hoa). Mọi lookup **bắt buộc** qua
`evKey`; so sánh thô sẽ khớp con số 0 một cách im lặng.

Cách một chuỗi được ghi (`index.html:2690-2708`):

```js
const grpId = evs.length>1 ? newId() : null;   // ⚠️ MỘT event thì grp = null
…
grp:grpId, ord:k,      // ord = vị trí trong chuỗi
```

> **Hai hệ quả bắt buộc phải thiết kế quanh:**
>
> **(a) Một set piece tag một mình KHÔNG CÓ `grp`.** Một quả phạt góc tag đơn độc thì
> `grp === null`. Nó **không thể** đi vào bất kỳ phép đếm nào dựa trên chuỗi. Vì vậy tầng
> **"Taken"** của phễu phải đếm **row**, còn các tầng sau đếm **chuỗi**. Hai tầng, hai
> nguồn — không suy ra được từ nhau, và khoảng cách giữa chúng chính là thông tin (§5.3).
>
> **(b) `ord` cho phép hỏi "set piece có MỞ ĐẦU chuỗi không".** `setPieceFold` chỉ hỏi
> "có mặt đâu đó trong chuỗi" (`shared.js:377`). Một chuỗi mà quả phạt góc bị tag ở cuối,
> sau cú sút, vẫn được tính. Phễu nên đòi hỏi set piece là row có `ord` **nhỏ nhất** trong
> các row set piece của chuỗi, và chỉ tính các row có `ord` **lớn hơn** nó. Đây là thứ
> `setPieceFold` không làm được, và là lý do §6.2 cần helper riêng.

### 2.4 ⚠️ `rXY` và cái bẫy `TRANSFER_EVENTS`

```js
// index.html:2463
const TRANSFER_EVENTS=new Set(['pass success','pass fail','cross success','cross fail','substitution']);
// index.html:2486-2489 — ai trong nhóm giữ số áo người nhận
for(let i=named.length-1;i>=0;i--)if(TRANSFER_EVENTS.has(named[i].name)){ti=i;break;}
if(ti<0)ti=named.length-1;
```

**Không một event set piece nào là transfer event.** Nên `rXY` rơi vào row set piece
**chỉ khi** nó là phím cuối nhóm và không có transfer nào trong nhóm:

| Cách tag | Row giữ `rXY` |
|---|---|
| `7 corner-kick 14 head goal` | **corner-kick** ✅ |
| `7 corner-kick cross-success 14 head goal` | **cross success** — corner-kick ❌ |
| `7 corner-kick` (một mình) | không có ai ❌ |

Một bản đồ "đường tạt" vẽ thẳng từ `r.rXY` của row set piece sẽ **hiện hoặc không hiện
tuỳ thói quen gõ phím của người tag**, chứ không tuỳ trận đấu. §5.4 dùng `ord` làm nguồn
chính và chỉ dùng `rXY` làm nguồn dự phòng.

### 2.5 Năm cờ `*Detail` — tín hiệu có sẵn, chưa ai đọc

```js
// shared.js:314, 317
duelDetail:0, saveDetail:0, gkTechDetail:0, gkCtrlDetail:0, concededDetail:0,
spDetail:0
```

`saveDetail` > 0 ⟺ trận này có ít nhất một `catch`/`parry`. `gkTechDetail` > 0 ⟺ có ít
nhất một event kỹ thuật. `spDetail` được đóng dấu lên **mọi cầu thủ** khi trận có ít nhất
một chuỗi set piece (`shared.js:428`).

Grep toàn repo: năm cái tên này chỉ xuất hiện trong `shared.js`. **Không** có trong
`stats-view.js`, **không** có trong `report.js`. Chúng phân biệt hai câu trả lời hoàn toàn
khác nhau mà cùng in ra số `0`:

- "Thủ môn không cản được quả nào" — một phát biểu về **trận đấu**
- "Không ai tag chi tiết thủ môn ở trận này" — một phát biểu về **dữ liệu**

Bốn dashboard đang chạy không có gì tương đương và không cần: trận nào cũng có pass và
tackle. Hai tab này thì **không**. §8 dùng các cờ này cho toàn bộ trạng thái rỗng.

### 2.6 Hai định nghĩa "Saves", và hai định nghĩa "Conceded" *(viết lại 2026-09-03)*

**Saves — hai con số cùng tồn tại, cùng hợp lệ:**

| Nguồn | Công thức | Có gì |
|---|---|---|
| `PLAYER_CATS.goalkeeper` (`shared.js:501`) | `s.catches + s.parries` | Chỉ tên **mới**. Trận tag bằng `save` cũ đọc **0**. |
| `GK_COLS` (`shared.js:558`) + counter `saves` | `s.saves` | Cả **ba** tên: `catch`, `parry`, `save`. |

> **Quyết định thiết kế:** dải KPI (§4.3) đọc **`s.saves`** — bản rộng. Lý do: dashboard là
> chỗ đầu tiên người ta nhìn, và một trận tag bằng tên cũ mà hiện `Saves 0` bên cạnh
> `Conceded 2` là một lời nói dối trông rất giống bug. Bảng Stats giữ định nghĩa hẹp của
> nó — hai bảng trả lời hai câu hỏi khác nhau, và §4.3 phải **nói ra điều đó trên màn
> hình**, không để người đọc tự phát hiện.

**Conceded — `GK_COLS` đã đổi HÔM NAY:**

Cột `Conceded` *dẫn xuất* đã bị gỡ khỏi `GK_COLS` (`shared.js:559-563`). Con số dẫn xuất
**chưa mất** — `On Target Faced`, `Save Rate`, `Clean Sheets` vẫn đọc `g.conceded` — chỉ
là **không còn cột nào in nó ra**. Cột duy nhất tên `Conceded` bây giờ là con số **tag
tay** (`s.goalsConceded`, `shared.js:598`).

| | Dẫn xuất `g.conceded` | Tag tay `s.goalsConceded` |
|---|---|---|
| Nguồn | bàn của đối thủ khi anh ta trên sân | event `goal conceded` |
| Cần | đội hình đã nhập (`g.known`) | người tag nhớ bấm |
| Không thể quên | ✅ | ❌ |
| Có `pXY` | ❌ | ✅ |

> **Quyết định thiết kế:** KPI `Conceded` đọc **`g.conceded`** (dẫn xuất) khi `g.known`, và
> **`—`** khi không — giống hệt `GK_COLS`. Con số tag tay **không** lên dải KPI; nó chỉ
> xuất hiện như chấm trên bản đồ §4.6, đúng chỗ nó có giá trị riêng (nó mang toạ độ). Hai
> con số, một chỗ in — không bao giờ đặt cạnh nhau để mời người đọc trừ chúng cho nhau.

### 2.7 Một trận có hai thủ môn

`gkShirts(lineups,team)` (`shared.js:746`) đọc `lu.xi` **và** đi qua `lineups.history`, nên
một đội thay thủ môn cho ra **hai** số áo. Bảng Stats đã dùng đúng cái này (`catPlayers`,
`stats-view.js:131`). Dashboard phải làm y hệt, và các panel per-keeper phải vẽ **một thẻ
mỗi người**, không cộng gộp. Board không điền ô GK → tập rỗng → §8.

### 2.8 `goal kick` nằm ở CẢ HAI tab — và đó không phải lỗi

`goal kick` vừa thuộc `SET_PIECE_EVENTS` vừa là event thủ môn (`goalKicks` có trong cả
`GK_COLS` lẫn `PLAYER_CATS.setPieces`). Nó sẽ xuất hiện ở phễu §5.3 **và** ở bản đồ §4.6.
Không phải đếm hai lần — là **một sự kiện được hỏi hai câu hỏi khác nhau**: "phát bóng lên
dẫn tới cái gì" và "thủ môn phát bóng từ đâu". Phải ghi chú trên màn hình để người đọc
không tưởng là trùng lặp.

---

## 3. Ngữ pháp của bốn dashboard đang chạy — đọc ra từ code

Hai tab mới **phải** nói cùng thứ ngôn ngữ này. Đây không phải gợi ý phong cách; đây là
những gì `stats-view.css` đã có và những gì mắt người dùng đã quen.

| Tầng | Lớp CSS | Ai đang dùng |
|---|---|---|
| Hàng | `.chart-row` | cả bốn (`dashboardHTML`, `stats-view.js:163-176`) |
| Thẻ | `.chart-card` | cả bốn |
| Đầu thẻ | `.chart-head` + `.head-ctrls` | Defensive, Distribution, Fouls |
| Dropdown | `select.def-sel` | Defensive, Distribution, Fouls |
| Nút nửa hiệp | `.half-toggle` (All / 1st / 2nd) | Defensive, Distribution |
| Bản đồ | `.map-card` | Shooting, Defensive |
| Bảng xếp hạng | `.dm-flex` / `.dm-map` / `.dm-side` / `.dm-rank` | Defensive, Distribution |
| Chú giải | `.shotmap-legend` + `.sm-leg` + `.leg-dot` | cả bốn |
| Rỗng | `.stats-empty` | khắp nơi |

**Sáu quy tắc rút ra từ code, bắt buộc tuân theo (§11.2 có test khoá):**

1. **Sân luôn dựng đứng, hai hiệp được chuẩn hoá về cùng một hướng.** `attackDir(team,half)`
   (`stats-view.js:198`) suy hướng tấn công từ toạ độ trung bình các cú sút; nửa nào đá
   ngược thì lật `100-x`, `100-y`. Nhờ vậy "All" là **một** bức tranh, không phải hai bức
   sau một cái toggle.
2. **Hover một hàng trong bảng xếp hạng thì cô lập cầu thủ đó** — và **không render lại**.
   Mọi chấm đã được vẽ sẵn, mọi dải `%` của từng người đã được tính sẵn (`_defBands`,
   `_distBands`); hover chỉ lật `style.display` và `classList`. Đây là lý do các hàm
   `*Hover` phải nằm trên `window` (§6.4).
3. **Không có dữ liệu thì vẫn vẽ sân và vẫn in `0%`** — comment `// no data -> keep the
   pitch and the 0% bands, just draw no dots` xuất hiện ở cả ba map. Không bao giờ trả về
   chuỗi rỗng từ một panel.
4. **Cặp thắng/thua thì `parts[0]` là event thắng.** `defMapHTML` và `report.js` cùng đọc
   quy ước này (`succKey=cat.parts.length===2?evKey(cat.parts[0][0]):null`). Dropdown là
   **chỗ duy nhất** mô tả một category.
5. **Mọi lookup tên event đi qua `evKey`.** Tên event do người dùng tự sửa được.
6. **Đồng hạng thì chia chung thứ hạng và hạng kế tiếp bị bỏ qua** (`rk=k===prevK?'':…`).

**Bảng màu đang dùng — không được phát minh màu mới:**

| Màu | Nghĩa |
|---|---|
| `#f7b32f` vàng | Bàn thắng |
| `#39d98a` xanh lá | Thành công / trúng đích / cản được |
| `#f7506b` hồng đỏ | Thất bại / thủng lưới |
| `#2f81f7` xanh dương | Hành động trung tính (interception, block…) |
| `#8b97a7` xám | Không trúng đích / bị chặn |
| `#ff8a3d` cam | Take-on concern |
| `var(--home)` / `var(--away)` | Màu đội |

---

## 4. Thiết kế **Goalkeeper Dashboard**

> **Câu hỏi trung tâm:** *Thủ môn bị đánh bại **ở đâu trong khung thành**, và anh ta
> **cản phá bằng cách nào**?*
>
> Không phải "anh ta đứng ở đâu trên sân" — đó là câu hỏi đã làm hỏng lần thử thứ nhất.

### 4.1 Bố cục

```
┌──────────────────────────────────────────────────────────────────────────┐
│  A   [ 1. J. Charles  90' ]  [ 13. M. Louis  ~12' ]        (thẻ thủ môn) │
├──────────────────────────────────────────────────────────────────────────┤
│  B   Save Rate 78.6%  ·  Saves 11  ·  Conceded 3  ·  OT Faced 14  · CS ✗ │
├───────────────────────────────────┬──────────────────────────────────────┤
│  C   KHUNG THÀNH                  │  D   CÁCH CỨU THUA                   │
│      ┌───────────────────────┐    │      Catch / Parry × 5 kỹ thuật      │
│      │  ○   ●      ○         │    │                                      │
│      │    ○    ○  ○   ●      │    │      ▇▇▇▇▇▇▇▇ Diving                 │
│      │  ○  ○      ○          │    │      ▇▇▇▇▇ Standing                  │
│      └───────────────────────┘    │      ▇▇ Collapse                     │
│      lưới 3×3 tô theo % thủng     │      …                               │
├───────────────────────────────────┴──────────────────────────────────────┤
│  E   LÀM CHỦ KHU VỰC — sân dựng đứng, PHÒNG NGỰ hướng LÊN                │
│      def line support · aerial control · goal kick · goal conceded       │
│      + bảng xếp hạng bên phải                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

Trong `dashboardHTML()`:

```js
}else if(statCat==='goalkeeper'){
  extra=`<div class="chart-row">${gkCardsHTML(team)}</div>`
    +`<div class="chart-row">${gkKpiHTML(team)}</div>`
    +`<div class="chart-row gk-row"><div class="gk-grid">`
    +`${gkGoalHTML(team)}${gkSaveKindHTML(team)}</div></div>`
    +`<div class="chart-row">${gkAreaHTML(team)}</div>`;
}
```

### 4.2 Panel A — Thẻ thủ môn

Một thẻ mỗi số áo trong `gkShirts(lineups,statTeam)`, theo thứ tự vào sân. Mỗi thẻ:
số áo · tên (`playerLabel`) · phút thi đấu (`playedMinutes`, cùng hàm `minsCell` dùng, kể
cả tiền tố `~` khi Duration chưa đặt).

**Không có bộ lọc theo thủ môn ở bản này.** Lý do: một trận thay thủ môn là hiếm, và một
dropdown chọn người sẽ nhân đôi số trạng thái phải test mà gần như không ai dùng. Các
panel B–E là **của cả đội** ở vị trí thủ môn. Thẻ nói rõ ai đã bắt bao lâu; đó là đủ để
đọc con số. §12 Q2 hỏi lại điều này.

Board không điền ô GK → tập rỗng → panel A in `.stats-empty` với **đúng câu bảng Stats đã
in** (`stats-view.js:145`), và B–E vẫn vẽ bình thường (chúng không cần biết tên thủ môn).

### 4.3 Panel B — Dải KPI

Năm ô, đọc **đúng công thức `GK_COLS`** để dashboard và bảng Stats không bao giờ cãi nhau:

| Ô | Công thức | Khi `!g.known` |
|---|---|---|
| **Save Rate** | `pct(s.saves, s.saves+g.conceded)` | `—` |
| **Saves** | `s.saves` *(bản rộng — §2.6)* | vẫn in |
| **Conceded** | `g.conceded` *(dẫn xuất)* | `—` |
| **On Target Faced** | `s.saves + g.conceded` | `—` |
| **Clean Sheet** | `g.clean` → `✓` / `✗` | `—` |

`s` = tổng của các thủ môn trong `gkShirts` (`computeStats` rồi cộng), `g` = cùng thứ
`GK_COLS` nhận.

**Một dòng ghi chú bắt buộc dưới dải KPI**, không phải tuỳ chọn:

> *Saves ở đây đếm cả ba tên (`catch`, `parry`, và `save` cũ). Bảng Stats chỉ đếm hai tên
> mới, nên hai con số có thể lệch nhau ở trận tag trước 28-08.*

Chỉ hiện dòng này khi thực sự lệch: `s.saves !== s.catches + s.parries`. Một chú thích
luôn hiện là một chú thích không ai đọc.

### 4.4 Panel C — Khung thành *(hình chính)*

**Đây là panel biện minh cho cả tab.** Nó trả lời câu hỏi mà không màn hình nào trong repo
đang trả lời: *bóng đi qua thủ môn ở góc nào của khung?*

**Dữ liệu** — `gkFaced(team)` (§6.1), đọc **ngược phía** (§2.2.1):

| Mark | Nguồn | Màu | Hình |
|---|---|---|---|
| Cản được | `O`.`shot on target` + `gXY` | `#39d98a` | tròn |
| Thủng lưới | `O`.`goal` + `gXY` | `#f7506b` | tròn |
| Phản lưới nhà | `T`.`own goal` + `gXY` | `#f7506b` | **vuông** |

Nhãn trên chấm = số áo **người sút** (`playerFrom`) — với phản lưới nhà thì đó là người
nhà, nên hình vuông là thứ phân biệt chúng.

**Vẽ bằng `goalMouthG()`** (`shared.js:644`) — hàm đã có, không sửa. Nó nhận
`{x,y,w,h}`, mảng `marks` `{x,y,label,color,square,cls,p}` và theme `o`. Nó tự vẽ lưới
16×8, khung gôn, và hỗ trợ sẵn `square` (đúng thứ own goal cần) và `cls`/`p` (đúng thứ
hover cần). **Dùng cùng theme tab Shooting đang dùng** để hai khung gôn trên hai tab trông
như một: `{ink:'#06281a', ring:'#000000', net:'#3b4f5c', frame:'#e6edf3', r:15}` —
nhưng **không** `noLine:true`, vì khung này đứng một mình chứ không đứng trên sân.

**Lớp phủ 3×3 — phần mới:** chia miệng gôn thành 9 ô, mỗi ô tô nền theo **tỉ lệ thủng
lưới** của ô đó:

```
rate = conceded / (conceded + saved)     // trong ô
fill = rate == null ? 'none' : `rgba(247,80,107,${(0.10 + 0.45*rate).toFixed(2)})`
```

Ô không có quả nào thì **không tô** (`none`) — không tô 0% màu nhạt, vì "chưa ai sút vào
đây" khác "sút vào đây nhưng không thủng". Mỗi ô in `n` (số quả) ở góc khi `n>0`.

Lớp phủ vẽ **dưới** các chấm, **trên** lưới. Nó là `<rect>` thường trong cùng `<svg>`, đặt
giữa `goalMouthG()` và không cần đụng vào hàm đó.

**Dòng đối chiếu bắt buộc dưới panel:**

> *12 trong 14 cú sút trúng đích đã được đặt vị trí trong khung. 2 quả chưa có vị trí
> không xuất hiện ở đây.*

Đây là chỗ dễ sinh bug nhất của cả thiết kế: **KPI ở panel B đếm event, panel C đếm
`gXY`**. Hai con số **sẽ** lệch nhau bất cứ khi nào người tag quên đặt spot. Không được im
lặng để người đọc tự trừ; phải in ra. (Tab Shooting đã có precedent cho việc này —
`stats-view.js:437`, dòng "No shot has been placed in the goal yet…".)

### 4.5 Panel D — Cách cứu thua *(phân rã, nối qua `grp`)*

Insight **đã nằm sẵn trong dữ liệu và chưa màn hình nào hiển thị**: kết quả cứu thua
(`catch`/`parry`) và kỹ thuật cứu thua (`save standing`/`diving`/…) là **hai event riêng
được tag trong CÙNG một entry**, nên chúng chia sẻ `grp`. Ghép lại được câu:

> *"Bay người thì 80% chỉ đẩy ra được; đứng bắt thì dính tay."*

**Hình dạng:** ma trận 2 hàng × 5 cột, vẽ bằng thanh xếp chồng ngang — mỗi kỹ thuật một
thanh, chia hai màu theo kết quả.

```
                Catch ▇▇▇▇▇▇▇▇   Parry ▇▇▇▇
  Diving      ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  5   (1 catch · 4 parry)
  Standing    ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇                4   (4 catch · 0 parry)
  Collapse    ▇▇▇▇▇▇                         2
  Kneeling    ▇▇▇                            1
  Overhead    —                              0
  ─────────────────────────────────────────────
  Chưa gắn kỹ thuật                          3   ← xem dưới
```

**Ba hàng "thừa" là phần quan trọng nhất, không phải phần rác:**

- **`Chưa gắn kỹ thuật`** — row `catch`/`parry` có `grp === null` (tag một mình) hoặc chuỗi
  của nó không chứa event kỹ thuật nào. Đây là hàng sẽ **to nhất** trên phần lớn trận thật.
- **`Kỹ thuật không gắn kết quả`** — row kỹ thuật mà chuỗi không có `catch`/`parry`. In
  thành một dòng phụ, không thành hàng thứ 6 trong ma trận.

**Hai bất biến đối chiếu — §11.3 khoá bằng test:**

```
tổng cột Catch                    === s.catches
tổng cột Parry                    === s.parries
tổng hàng Diving (cả 2 cột)       ≤   s.saveDiving      // ≤, vì có row kỹ thuật rời
```

### 4.6 Panel E — Làm chủ khu vực *(bản đồ sân, PHÒNG NGỰ hướng LÊN)*

Bản đồ sân **duy nhất** của tab này, và nó chỉ được phép tồn tại vì bốn event nó vẽ **thực
sự trải ra trên sân**: `defensive line support` có thể ở giữa sân, `goal kick` ở vòng 5m50,
`aerial control` trong vòng cấm, `goal conceded` ở chỗ bóng vào lưới.

**Khác một điểm so với mọi map khác trong file: hướng bị ĐẢO.**

Bốn map hiện có chuẩn hoá về *tấn công hướng lên*. Thủ môn thì ngược lại — khung thành anh
ta bảo vệ phải ở **trên đỉnh**, vì đó là thứ mọi hành động của anh ta quy về. Nên:

```js
// đảo lại attackDir: thủ môn phòng ngự về phía đối diện hướng tấn công
const flip = dir[eventHalf(r)] !== 'left';    // ⚠️ !== , không phải ===
```

Đây là **một ký tự khác biệt so với bốn map kia** và là chỗ chắc chắn sẽ bị "sửa nhầm" khi
đọc lại. Phải có comment dài và có test khoá (§11.2).

**Cấu trúc:** dùng nguyên khung `defMapHTML` — `.dm-flex` / `.dm-map` / `.dm-side`, dải `%`
theo phần ba dọc và ngang, bảng xếp hạng bên phải, `.half-toggle` All/1st/2nd.

**Dropdown** (`GK_AREA` — **không** đặt tên `GK_CATS`, tên đó bị cấm, §6.5), theo đúng quy
ước `parts[0]` là event thắng:

| Key | Nhãn | parts |
|---|---|---|
| `defLine` | Def. Line Support | `defensive line support success` Won `#39d98a` · `… fail` Lost `#f7506b` |
| `aerialCtrl` | Aerial Control | `aerial control success` Won `#39d98a` · `… fail` Lost `#f7506b` |
| `goalKicks` | Goal Kicks | `goal kick` Goal Kick `#2f81f7` |
| `conceded` | Goals Conceded | `goal conceded` Conceded `#f7506b` |

Bốn mục này khớp chính xác quy ước cặp thắng/thua ở §3 quy tắc 4, nên bảng xếp hạng lấy
được cột `Success` miễn phí cho hai mục đầu và không có cột đó cho hai mục sau.

---

## 5. Thiết kế **Set Pieces Dashboard**

> **Câu hỏi trung tâm:** *Một tình huống cố định **đi tới đâu**?*
>
> Không phải "nó được thực hiện ở đâu" — một quả phạt góc luôn ở góc sân. Đó là câu hỏi
> đã làm hỏng lần thử thứ nhất.

### 5.1 Bố cục

```
┌──────────────────────────────────────────────────────────────────────────┐
│  A   Corners 9 · FK 14 · Pen 1 · Throw 22 · GK 8   │  Shots 11 · Goals 2 │
├──────────────────────────────────────────────────────────────────────────┤
│  B   PHỄU — mỗi loại một hàng                                            │
│      Corner    ▇▇▇▇▇▇▇▇▇▇▇▇ 9 → ▇▇▇▇▇▇ 6 → ▇▇▇ 4 → ▇▇ 2 → ▇ 1           │
│                Taken      In chain  Shot   On tgt  Goal                  │
│      Free-kick ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 14 → …                                    │
├───────────────────────────────────┬──────────────────────────────────────┤
│  C   ĐIỂM ĐẾN — sân dựng đứng     │  D   HAI BẢNG XẾP HẠNG               │
│      mũi tên từ điểm thực hiện    │      Người thực hiện · Người dứt điểm │
│      tới điểm chạm tiếp theo      │                                      │
└───────────────────────────────────┴──────────────────────────────────────┘
```

### 5.2 Panel A — Dải KPI

Năm ô đếm loại (`s.corners`, `s.freeKicks`, `s.penalties`, `s.throwIns`, `s.goalKicks`) +
ba ô kết quả (`s.setPieceShots`, `s.setPieceGoals`, và tỉ lệ chuyển hoá
`pct(setPieceGoals, setPieceShots)`).

Tám ô này đọc **thẳng từ `computeStats`**, tức là **cùng nguồn với bảng Stats** — chúng
không thể lệch với bảng, và đó là điểm neo của cả tab. Panel B thì đếm **chuỗi**, là một
đại lượng khác; §5.3 xử lý việc đó.

### 5.3 Panel B — Phễu *(hình chính)*

**Vì sao phễu, chứ không phải bản đồ:** một set piece không có "vị trí" đáng vẽ; nó có một
**số phận**. Phễu là hình dạng của số phận.

Một hàng mỗi loại, năm tầng:

| Tầng | Đếm cái gì | Nguồn |
|---|---|---|
| **Taken** | **row** — mọi row của loại đó | đếm event; **có cả row `grp===null`** |
| **In chain** | **chuỗi** — có `grp` và có ≥1 row khác | `grp != null` |
| **Shot** | **chuỗi** có ≥1 row `SHOT_KINDS` sau nó (`ord` lớn hơn) | `ord` |
| **On target** | **chuỗi** có `shot on target` hoặc `goal` | |
| **Goal** | **chuỗi** có `goal` | |

> **⚠️ Tầng 1 đếm ROW, tầng 2–5 đếm CHUỖI. Đây là chủ ý, không phải nhầm lẫn.**
>
> §2.3(a): một set piece tag một mình không có `grp` và **không thể** vào phép đếm chuỗi.
> Nếu tầng 1 cũng đếm chuỗi, một trận tag toàn set piece đơn độc sẽ hiện phễu toàn số 0 —
> đúng cái màn hình trống đã làm hỏng lần thử trước.
>
> **Khoảng cách Taken → In chain chính là thông tin**: nó nói *độ sâu tag* của trận này,
> không nói gì về đội bóng. Nhãn dưới tầng 2 phải viết thẳng ra:
> *"6 trong 9 quả phạt góc được tag kèm chuỗi diễn biến; 3 quả tag một mình nên không thể
> lần theo."*

**Quy tắc gán chuỗi (dùng `ord`, §2.3(b)):** trong một chuỗi, lấy row set piece có `ord`
**nhỏ nhất** làm chủ chuỗi; chỉ các row có `ord` **lớn hơn** nó mới được tính là "cái nó
dẫn tới". Một chuỗi chỉ thuộc về **một** loại — không nhân đôi.

**Đối chiếu với bảng Stats (§11.3 khoá bằng test):** phễu đếm chuỗi nên nó **không** bằng
`setPieceShots`. Vì vậy dưới phễu in thêm một dòng tổng đếm-row:

```
Tổng: 11 cú sút · 2 bàn từ set piece      ← khớp CHÍNH XÁC tổng cột bảng Stats
```

Một chuỗi có 2 cú sút thì đóng góp 1 vào tầng "Shot" và 2 vào dòng tổng. Cả hai đều đúng,
và cả hai đều được in.

**Hình dạng cụ thể:** thanh ngang xếp giảm dần, mỗi tầng một sắc độ. Không dùng hình phễu
thang (trapezoid) — thanh ngang đọc chính xác hơn và tái dùng được `.dm-rank` cho phần số.
Loại có `Taken === 0` thì **ẩn cả hàng** (không in một hàng toàn số 0).

### 5.4 Panel C — Điểm đến *(sân dựng đứng, tấn công LÊN)*

> Đây là panel bản cũ thiết kế sai. Bản cũ vẽ **nơi set piece được thực hiện** — mà nơi đó
> là *định nghĩa của chính nó* (§1). Panel này vẽ **nơi nó đi tới**.

**Nguồn điểm đến, theo thứ tự ưu tiên — `rXY` KHÔNG phải nguồn chính (§2.4):**

1. **`pXY` của row có `ord` nhỏ nhất trong chuỗi mà lớn hơn `ord` của set piece, và có
   `pXY`.** Đây là *chạm bóng tiếp theo* — đầu đánh, cú sút, cú tạt. Nguồn này **không phụ
   thuộc thói quen tag** vì nó chỉ cần chuỗi tồn tại.
2. **`rXY` của chính row set piece**, nếu (1) không có. Đây là nguồn dự phòng, và nó chỉ
   tồn tại khi row set piece tình cờ là phím cuối nhóm (§2.4).
3. Không có gì → **chỉ vẽ chấm điểm xuất phát**, không vẽ mũi tên.

**Vẽ:** mũi tên từ `pXY` (set piece) tới điểm đến, dùng nguyên cơ chế `<marker>` của
`distMapHTML` (`stats-view.js:558-561`) — `orient="auto-start-reverse"`, một marker mỗi
màu. Màu theo **loại set piece**, không theo thành/bại:

| Loại | Màu |
|---|---|
| Corner | `#f7b32f` |
| Free-kick | `#2f81f7` |
| Penalty | `#f7506b` |
| Throw-in | `#8b97a7` |
| Goal kick | `#39d98a` |

Có `.half-toggle` All/1st/2nd và dropdown lọc loại (`SET_KINDS`, **không** đặt tên
`SP_CATS` — tên bị cấm, §6.5), thêm một mục `all` mặc định.

**Chuẩn hoá hướng:** tấn công hướng **LÊN**, giống bốn map kia (`flip = dir[half]==='left'`)
— **không** đảo như §4.6. Set piece là hành động tấn công. Trừ `goal kick`, vốn xuất phát
từ sân nhà; nó sẽ vẽ ra một mũi tên dài từ đáy lên, và đó chính là hình đúng.

### 5.5 Panel D — Hai bảng xếp hạng

Đặt cạnh nhau trong `.dm-side`, vì set piece có **hai** vai và hiện chưa màn hình nào tách
được chúng:

| Bảng | Đếm | Nguồn |
|---|---|---|
| **Người thực hiện** | số set piece của loại đang chọn | `playerFrom` trên row set piece |
| **Người dứt điểm** | `setPieceShots` / `setPieceGoals` | `computeStats` — **thẳng từ bảng Stats** |

> `setPieceFold` ghi công cho **người dứt điểm** (`shared.js:363-366`), nên bảng phải thứ
> hai lấy được miễn phí và **luôn khớp bảng Stats**. Bảng thứ nhất là con số **duy nhất
> trong repo chưa ai đếm**: không có counter nào cho "ai đá phạt góc". Nó được tính tại
> chỗ trong `stats-view.js`, không thêm counter vào `shared.js` (§10.2).

Hover một hàng ở **bảng người thực hiện** cô lập mũi tên của anh ta trên panel C, theo đúng
cơ chế `shotHover`/`defHover` (§3 quy tắc 2). Bảng người dứt điểm **không** hover — các cú
sút của anh ta không phải mũi tên trên bản đồ này, nên không có gì để cô lập.

---

## 6. Chi tiết kỹ thuật

### 6.1 Hàm mới — Goalkeeper (6 hàm, tất cả trong `Stats/stats-view.js`)

```js
// Các cú sút trúng đích mà thủ môn ĐỘI NÀY phải đối mặt, kèm vị trí trong khung.
// ⚠️ Hàm DUY NHẤT trong file lọc r.team !== team. Xem §2.2.1 trước khi "sửa".
// goalMarks() KHÔNG thay được: SHOT_KINDS không chứa 'own goal'.
function gkFaced(team){ /* → [{x,y,label,color,square,cls,p,conceded}] */ }

// Tỉ lệ thủng lưới theo 9 ô của miệng gôn. null khi ô chưa có quả nào.
function gkZones(marks){ /* → [{i,n,conceded,rate}] × 9 */ }

function gkCardsHTML(team){}      // Panel A — thẻ mỗi thủ môn trong gkShirts()
function gkKpiHTML(team){}        // Panel B — 5 ô, công thức GK_COLS
function gkGoalHTML(team){}       // Panel C — goalMouthG() + lớp phủ 3×3
function gkSaveKindHTML(team){}   // Panel D — ma trận kết quả × kỹ thuật, nối qua grp
function gkAreaHTML(team){}       // Panel E — bản đồ sân, PHÒNG NGỰ hướng LÊN
```

### 6.2 Hàm mới — Set Pieces (5 hàm)

```js
/* Chuỗi set piece của một đội, gán theo `ord`. CHỈ ĐỌC — không đụng shared.js.
   Vì sao không dùng setPieceFold(): nó ghi công per-player và chỉ hỏi "set piece có
   mặt đâu đó trong chuỗi", không hỏi "nó có MỞ ĐẦU chuỗi". Xem §2.3(b).
   → [{kind, taker, grp, ord, from:pXY, to:pXY|rXY|null, shots, onTarget, goals, half}] */
function setPieceChains(team){}

function spKpiHTML(team){}        // Panel A — 8 ô, thẳng từ computeStats
function spFunnelHTML(team){}     // Panel B — phễu: tầng 1 đếm row, tầng 2-5 đếm chuỗi
function spTargetHTML(team){}     // Panel C — mũi tên tới điểm chạm tiếp theo
function spRankHTML(team){}       // Panel D — hai bảng: người thực hiện · người dứt điểm
```

### 6.3 Sửa `dashboardHTML()` — chỗ sửa DUY NHẤT trong luồng render

```js
  }else if(statCat==='fouls'){
    …                                     // giữ nguyên
  }else if(statCat==='goalkeeper'){       // ← MỚI
    …
  }else if(statCat==='setPieces'){        // ← MỚI
    …
  }else{
    // ← nhánh else trần Ở LẠI NGUYÊN VẸN. §10.1
  }
```

Hai nhánh mới chèn **trước** `else`, không thay `else`. Không đụng `renderStats()`, không
đụng `statTableHTML()`, không đụng `catPlayers()`.

### 6.4 Sáu tên mới trên `window` — và cái test khoá cả hai chiều

Handler inline được biên dịch trong **global scope**, không phải trong closure của module.
Sáu tên mới:

```js
window.setGkArea=setGkArea;   window.setGkHalf=setGkHalf;
window.setSetKind=setSetKind; window.setSetHalf=setSetHalf;
window.gkHover=gkHover;       window.spHover=spHover;
```

`tests/stats-view.test.js:146-155` khoá **cả hai chiều**:
- mọi tên bị handler inline gọi **phải** có trên `window` (nếu không → nút chết, không lỗi)
- mọi tên trên `window` **phải** nằm trong whitelist **và** vẫn tồn tại

Whitelist đi từ 11 → **17** tên. Đây là sửa test hợp lệ, không phải nới lỏng test.

### 6.5 ⚠️ Tám cái tên **BỊ CẤM** — có test đang chủ động chặn

`tests/stats-tabs-split.test.js:93` khẳng định tám tên này **không xuất hiện ở bất cứ đâu**
trong `Stats/stats-view.js`:

```js
['SP_CATS','GK_CATS','spHead','gkHead','setSpCat','setGkCat','spCat','gkCat']
```

Chúng là tàn tích của hai dashboard đã bị gỡ. Dùng lại bất kỳ tên nào → test đỏ, và **đúng
ra phải đỏ**: nó nói "bạn vừa dựng lại thứ đã bị gỡ có chủ đích".

| Bị cấm | Dùng tên này |
|---|---|
| `GK_CATS` | `GK_AREA` |
| `SP_CATS` | `SET_KINDS` |
| `setGkCat` | `setGkArea` |
| `setSpCat` | `setSetKind` |
| `gkCat` | `gkArea` |
| `spCat` | `setKind` |
| `gkHead` / `spHead` | dựng inline như `othHead()` |

Test này **giữ nguyên**, không sửa. Nó vẫn còn giá trị sau khi thiết kế này lên.

### 6.6 Biến trạng thái mới (4)

```js
let gkArea='defLine', gkHalf=0;     // Panel E
let setKind='all',    setHalf=0;    // Panel C
```

Đặt cạnh `distCat`/`distHalf` (`stats-view.js:50`). **Không** lưu vào localStorage — bốn
biến của bốn tab kia cũng không lưu.

---

## 7. CSS mới — `Stats/stats-view.css`

Chỉ **thêm**, không sửa và không xoá selector nào đang có. Mọi lớp mới mang tiền tố `gk-`
hoặc `sp-` nên không thể va vào lớp đang dùng.

| Lớp | Việc |
|---|---|
| `.gk-grid` | grid 2 cột cho Panel C + D, đổ dọc dưới 900px |
| `.gk-cards` / `.gk-card` | thẻ thủ môn (Panel A) |
| `.gk-kpi` / `.gk-kpi-box` | dải KPI 5 ô |
| `.gk-note` | dòng chú thích khác biệt Saves / spot |
| `.gk-mx` / `.gk-mx-bar` | ma trận cách cứu thua |
| `.sp-kpi` | dải KPI 8 ô |
| `.sp-funnel` / `.sp-stage` | phễu |
| `.sp-ranks` | hai bảng cạnh nhau |

Tái dùng **nguyên trạng**, không sửa: `.chart-row`, `.chart-card`, `.chart-head`,
`.head-ctrls`, `.half-toggle`, `.map-card`, `.dm-flex`, `.dm-map`, `.dm-side`, `.dm-rank`,
`.shotmap-legend`, `.sm-leg`, `.sm-sub`, `.leg-dot`, `.stats-empty`, `select.def-sel`.

---

## 8. Rỗng, thiếu, và các trường hợp biên

**Đây là màn hình chính của tab Goalkeeper trong nhiều tháng tới, không phải ca biên**
(§1). Mỗi trạng thái rỗng phải nói **vì sao** rỗng, dùng cờ `*Detail` (§2.5) để phân biệt
"không xảy ra" với "không ai tag".

| Tình huống | Phát hiện bằng | Màn hình |
|---|---|---|
| Board không có ô GK | `gkShirts()` rỗng | Panel A in đúng câu bảng Stats đang in (`stats-view.js:145`). B–E vẫn vẽ. |
| Không có event thủ môn nào | `saveDetail+gkTechDetail+gkCtrlDetail+concededDetail === 0` | *"Trận này chưa tag chi tiết thủ môn. Mười ba event thủ môn có từ 28-08; từ điển cũ không tự nhận chúng — xem `seed_gk_events.js`."* |
| Có `save` cũ, không có `catch`/`parry` | `s.saves>0 && saveDetail===0` | Panel D in: *"Trận này tag bằng tên `save` cũ, không nói được cản bằng cách nào."* Panel B **vẫn có số** (§2.6). |
| Có kết quả, không có kỹ thuật | `saveDetail>0 && gkTechDetail===0` | Ma trận chỉ còn hàng "Chưa gắn kỹ thuật" — và điều đó **là** câu trả lời. |
| Không cú sút nào có `gXY` | `gkFaced()` rỗng | Panel C vẫn vẽ khung gôn trống + dòng: *"Chưa cú sút nào được đặt vị trí trong khung."* (§3 quy tắc 3) |
| Không đội hình | `!g.known` | Save Rate / Conceded / OT Faced / Clean Sheet in `—`, **không** in `0` (§2.6) |
| Không chuỗi set piece nào | `spDetail === 0` | Phễu in tầng **Taken** (vẫn đếm được!) và nói: *"Chưa quả nào được tag kèm chuỗi diễn biến."* |
| Một loại có `Taken===0` | | Ẩn cả hàng, không in hàng toàn 0 |
| Không có match mở | `meta.matchId` rỗng | `renderStats()` đã chặn từ trước — không đụng tới |

---

## 9. Hai host, một implementation

### 9.1 Channel (site khách) — **không sửa gì**

Channel mount `PTStats` với nguyên payload (`client/assets/app.js:377`), và
`dashboardHTML()` là **nơi duy nhất** quyết định tab nào vẽ gì. Nên hai dashboard mới xuất
hiện trên channel **mà không sửa một dòng nào** trong `app.js`.

> ⚠️ **`tabsFor` ở `app.js:1332` KHÔNG liên quan.** Nó thuộc trang **Player Data** (bảng
> per-player cả mùa), không thuộc Dashboard của một trận. Đừng đụng vào nó — nó vừa được
> sửa hôm nay bởi commit `player-season-table`.

### 9.2 Trang Stats của analyst

`Stats/index.html` mount cùng module. Không sửa markup — mọi id đã có (`statsHolder`,
`catToggle`…) và test `tests/stats-view.test.js:169-174` kiểm cả danh sách id đó.

### 9.3 PDF — **ngoài phạm vi, và đây là quyết định có chủ ý**

`Stats/report.js` (97KB) dựng PDF riêng, lấy 12 helper qua `HELPERS`
(`stats-view.js:2478`). Nó **không** gọi `dashboardHTML()`, nên hai panel mới **sẽ không**
vào PDF, và **không có gì hỏng** vì chúng không vào.

Không thêm gì vào `HELPERS`: mỗi tên thêm vào đó là một tên `report.js` có thể bắt đầu phụ
thuộc, và đưa GK/Set Pieces vào PDF là một dự án riêng với ngân sách trang riêng. §12 Q5.

---

## 10. An toàn hồi quy — cái gì **không** được đụng, và vì sao

> Đây là mục trả lời trực tiếp yêu cầu: *"đảm bảo không xảy ra bug ở các tab khác"* và
> *"không thay đổi tính năng khác khi chưa được cho phép"*.

### 10.1 Nhánh `else` trần trong `dashboardHTML()` — GIỮ

Nó **không** phải chỗ giữ chỗ cho hai tab này. Nó là lưới an toàn cho *category thứ bảy*.
Dashboard và Stats **dùng chung `statCat`**, nên một category mà chuỗi if/else không xử lý
sẽ render **trang trắng: không lỗi, không gì trong console, không cách nào phân biệt với
bug**. Hai nhánh mới chèn **trước** nó (§6.3).

### 10.2 `shared.js` — KHÔNG ĐỤNG

Bảy thứ ở đây sẽ *cám dỗ* sửa. Không sửa cái nào:

| Cám dỗ | Vì sao KHÔNG |
|---|---|
| Thêm `own goal` vào `SHOT_KINDS` | `SHOT_KINDS` chi phối `totalShots`, `shotList`, `goalMarks`, donut Shooting, và PDF. Một own goal sẽ thành cú sút của đội ghi vào lưới nhà. **Đây là thay đổi phá vỡ dữ liệu.** |
| Sửa `goalMarks()` cho nhận own goal | Tab Shooting + `report.js` đang dùng. Panel C có bộ lọc riêng (`gkFaced`). |
| Thêm counter "ai đá phạt góc" | `newStat()` được cộng dồn cả mùa trên Data page; thêm field là đổi hình dạng dữ liệu ở nơi khác. Đếm tại chỗ trong `stats-view.js`. |
| Sửa `setPieceFold()` để dùng `ord` | Nó nuôi bảng Stats **và** Data page cả mùa. Đổi nó là đổi số cả mùa. `setPieceChains()` là hàm mới, chỉ đọc. |
| Đổi `PLAYER_CATS.goalkeeper.Saves` sang `s.saves` | Vừa được cố ý định nghĩa hẹp (`shared.js:490-495`). Dashboard chọn bản rộng và **nói ra**, chứ không đổi bảng. |
| Thêm cột vào `GK_COLS` | Vừa bị gỡ một cột **hôm nay**. Đụng vào là đảo commit của hôm nay. |
| Đọc/reset cờ `*Detail` | Chỉ **đọc**. Chúng đã được đếm sẵn. |

### 10.3 `Stats/report.js` — KHÔNG ĐỤNG

Không thêm/bớt/đổi thứ tự `HELPERS`. `report.js` bind chúng trong `sync()` của nó; một tên
biến mất là một `TypeError` lúc bấm ⭳ PDF — **trên cả trang Stats lẫn site khách**.

### 10.4 Bảng Stats — KHÔNG ĐỤNG

`statTableHTML()`, `catPlayers()`, `STAT_CATS`, `GK_COLS` giữ nguyên. Dashboard và Stats là
hai nửa của cùng một view; thiết kế này chỉ chạm nửa Dashboard.

### 10.5 Film / Overall — KHÔNG ĐỤNG

`renderStats()` gọi `filmStop()` và `filmFullOff()` trước mọi lần vẽ (`stats-view.js:69-76`).
Hai nhánh mới nằm trong `dashboardHTML()`, tức là **sau** chỗ đó, nên không thể làm rò rỉ
video/listener. Không đụng `renderGeneral()`, `matchSummaryHTML()`, `filmMatches()`.

### 10.6 Cache-bust — **bốn** chỗ, bỏ sót một là user cũ chạy code cũ

```
Stats/index.html:12           stats-view.css?v=10  → v=11
Stats/index.html:67           stats-view.js?v=26   → v=27
client/assets/app.js:1874     stats-view.css?v=10  → v=11
client/assets/app.js:1877     stats-view.js?v=26   → v=27
```

Và `tests/asset-versions.json` giữ `{v, sha256}` cho từng file — sửa file mà không bump
`v` thì sha lệch và test đỏ. Đây là cơ chế đã bắt đúng lỗi này trước đây; để nó bắt.

> Sửa `app.js` ở hai dòng này là **ngoại lệ duy nhất** với "không đụng `app.js`". Đó là số
> phiên bản, không phải hành vi.

### 10.7 Deploy whitelist — không cần đụng

Không có file **mới** nào được tạo. `deploy.yml` chỉ 404 file mới chưa có trong danh sách
`cp`; `stats-view.js`/`.css` đã ở đó. *(Nếu sau này tách file riêng thì phải thêm.)*

---

## 11. Test — cái nào đỏ, và test mới nào phải viết

### 11.1 Ba chỗ sẽ đỏ, và cách sửa **đúng**

**(a) `tests/stats-tabs-split.test.js:85-86`** — đang khẳng định hai tab **không** có chart:

```js
['goalkeeper','setPieces'].forEach(k=>
  notOk(fn.includes("statCat==='"+k+"'"),k+' has no chart branch yet, by design'));
```

→ chuyển hai key này sang danh sách `ok(...)` bên trên, thành 6/6 category có nhánh riêng.
**Giữ nguyên** `ok(/\}else\{/.test(fn))` — §10.1.

**(b) `tests/stats-view.test.js:151`** — whitelist `window`, 11 → 17 tên (§6.4).

**(c) `tests/asset-versions.json`** — bump `v` cho `Stats/stats-view.js` và
`Stats/stats-view.css`, cập nhật sha256 (§10.6).

**Ba chỗ này là toàn bộ.** Không test nào khác chạm `dashboardHTML`.

> **`tests/stats-tabs-split.test.js:93` (tám tên bị cấm) KHÔNG được sửa.** Nếu nó đỏ,
> nghĩa là bạn đã đặt tên trùng tên cũ — sửa **tên**, không sửa test. §6.5.

### 11.2 Test mới phải viết

**Goalkeeper**

1. `gkFaced()` lấy `shot on target` + `goal` của **đối thủ** và `own goal` của **đội mình**
2. …và **bỏ qua** row không có `gXY`
3. `own goal` được đánh dấu `square:true`, không lẫn với cú sút của đối thủ
4. `gkZones()`: ô không có quả nào → `rate === null`, **không** phải 0
5. Panel D nối `catch` + `save diving` **cùng `grp`** thành một ô ma trận
6. …`catch` có `grp === null` rơi vào hàng "Chưa gắn kỹ thuật", **không** bị bỏ
7. **Panel E đảo hướng**: cùng bộ row, `gkAreaHTML` cho toạ độ y **đối xứng** với `defMapHTML`
8. KPI in `—` (không phải `0`) khi `!g.known`

**Set Pieces**

9. Tầng **Taken** đếm cả row `grp === null`; tầng **In chain** thì không
10. Chuỗi có set piece ở `ord` **cuối** (sau cú sút) **không** được tính là dẫn tới cú sút đó
11. Chuỗi có hai set piece → thuộc về loại có `ord` nhỏ hơn, đếm **một** lần
12. `throw-Ins` (chữ I hoa) khớp — qua `evKey`
13. Điểm đến lấy `pXY` của chạm tiếp theo theo `ord`; **`rXY` chỉ là dự phòng** (§2.4)
14. Loại có `Taken===0` không in hàng

**Chung**

15. Sáu tên mới có mặt trên `window`, và không tên nào ngoài whitelist
16. Tám tên bị cấm vẫn không xuất hiện
17. `dashboardHTML()` vẫn kết thúc bằng `else` trần
18. Bốn tab cũ render **y hệt trước** — so chuỗi HTML trước/sau trên cùng bộ row

### 11.3 Test giao thoa — con số phải khớp bảng Stats

Đây là loại test đắt nhất và đáng nhất: nó bắt đúng loại bug "hai màn hình nói hai con số".

```
tổng cột Catch (Panel D)            === PLAYER_CATS.goalkeeper 'Catches'
tổng cột Parry (Panel D)            === PLAYER_CATS.goalkeeper 'Parries'
KPI Saves (Panel B)                 === GK_COLS 'Saves'
KPI Save Rate                       === GK_COLS 'Save Rate'
dòng tổng dưới phễu: shots          === Σ PLAYER_CATS.setPieces 'Set Piece Shot'
dòng tổng dưới phễu: goals          === Σ PLAYER_CATS.setPieces 'Set Piece Goal'
bảng "người dứt điểm" (Panel D)     === PLAYER_CATS.setPieces per-player
```

Và **một khẳng định ngược, cố ý**:

```
tầng "Shot" của phễu               ≠  Σ 'Set Piece Shot'    khi có chuỗi 2 cú sút
```

Phễu đếm **chuỗi**, cột đếm **cú sút**. Test phải khẳng định điều này để lần đọc sau không
ai "sửa" cho chúng bằng nhau (§5.3).

### 11.4 Baseline

`node tests/run.js` → **1456/1456** trước khi bắt đầu. Sau khi xong: 1456 + số test mới,
và **không một test cũ nào đỏ** ngoài ba chỗ ở §11.1.

---

## 12. Năm câu hỏi phải trả lời **TRƯỚC** khi viết code

1. **Panel C có đúng là hình chính của tab Goalkeeper không?** Nó là panel duy nhất trả lời
   câu hỏi chưa ai trả lời, nhưng nó **hoàn toàn** phụ thuộc việc người tag đặt spot trong
   khung. Nếu trong thực tế bạn hiếm khi đặt spot, panel này sẽ trống và Panel D nên lên
   làm hình chính.

2. **Có cần bộ lọc theo từng thủ môn không?** (§4.2) Bản này nói *không* — thẻ hiện phút
   thi đấu, các panel là của cả vị trí. Nếu bạn thường xuyên thay thủ môn thì cần.

3. **Phễu có đúng 5 tầng không?** `Taken → In chain → Shot → On target → Goal`. "In chain"
   là tầng về *dữ liệu*, không về bóng đá. Có muốn giấu nó đi và chỉ hiện 4 tầng không?
   (Khuyến nghị: **giữ** — nó là thứ giải thích vì sao các tầng sau nhỏ.)

4. **`goal kick` có nên nằm trong phễu Set Pieces không?** (§2.8) Về kỹ thuật nó là set
   piece; về đọc hiểu nó là phát bóng của thủ môn. Bỏ nó ra thì phễu còn 4 hàng sạch hơn.

5. **PDF có cần hai trang mới không?** (§9.3) Bản này nói *không*, và đó là một dự án riêng.

---

## 13. Thứ tự triển khai

Mỗi bước chạy được và test xanh trước khi sang bước sau.

| # | Việc | Test |
|---|---|---|
| 1 | `setPieceChains()` + `gkFaced()` + `gkZones()` — **chỉ helper, chưa UI** | test mới 1–6, 9–13 |
| 2 | Nối `statCat==='setPieces'` vào `dashboardHTML`, chỉ Panel A (KPI) | §11.1(a) chuyển `setPieces` |
| 3 | Panel B phễu | test 14 + §11.3 |
| 4 | Panel C điểm đến + Panel D xếp hạng | test 13, hover |
| 5 | Nối `statCat==='goalkeeper'`, Panel A + B | §11.1(a) chuyển `goalkeeper`, test 8 |
| 6 | Panel C khung thành | test 1–4 |
| 7 | Panel D cách cứu thua | test 5–6, §11.3 |
| 8 | Panel E bản đồ **đảo hướng** | test 7 |
| 9 | CSS, trạng thái rỗng (§8) | mắt thường + test 18 |
| 10 | Bump `?v=` bốn chỗ + `asset-versions.json` | §11.1(c) |

Bước 1 không đụng UI, nên nếu dừng lại ở đó thì **không có gì đổi trên màn hình**. Bước 2
là commit đầu tiên người dùng nhìn thấy.

---

## 14. Ghi chú cho người đọc sau

Ba chỗ trong thiết kế này trông **giống bug** và không phải bug. Nếu bạn định "sửa" một
trong ba, hãy đọc mục tương ứng trước:

1. **`gkFaced()` lọc `r.team !== team`** — hàm duy nhất trong file làm thế. §2.2.1.
2. **Panel E đảo `flip`** (`!==` chứ không `===`) — thủ môn phòng ngự, không tấn công. §4.6.
3. **Tầng 1 của phễu đếm row, tầng 2–5 đếm chuỗi** — set piece tag đơn độc không có `grp`.
   §2.3(a), §5.3.

Và một chỗ **thật sự** là hạn chế đã biết, không phải lựa chọn: nếu người tag ghi cả
`goal` lẫn `shot on target` cho cùng một quả, Panel C đếm hai chấm. Tab Shooting đã sai
đúng như vậy từ trước. Sửa thì phải sửa cả hai cùng lúc, và đó là một thay đổi riêng.
