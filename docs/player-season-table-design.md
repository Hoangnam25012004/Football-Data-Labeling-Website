# Player Data — **Position + Season trên một hàng**, và cột **Conceded** — Detailed Design

Trang một cầu thủ trong channel (`#/data/player/<key>/<category>[/<role>]`) hiện xếp dọc:
thẻ **Position**, rồi thanh `TOTAL / PER 90 MINS`, rồi **sáu** card KPI đổi theo vai. Tài liệu
này thiết kế cái đứng vào chỗ đó: **Position bên trái, Season bên phải, cùng một hàng**; bốn
card đổi-theo-vai bị gỡ; `Appearances` và `Minutes` ở lại. Kèm theo là một thay đổi nhỏ và
riêng biệt trên bảng Goalkeeping: **chỉ còn một cột `Conceded`**.

Trạng thái: **ĐÃ TRIỂN KHAI** (2026-09-03). §13 được trả lời **Q1 = (b)**, Q2 = (a), Q3 = (a),
Q4 = (a); tài liệu này mô tả code đang chạy, với §3.4 và §7 đã viết lại theo Q1 = (b).

Test: `node tests/run.js` → **1418/1418 passed**.

> ### Bản 2 (2026-09-03) — hai card và dòng chú thích bị gỡ
>
> | | Bản 1 | **Bản 2 — code đang chạy** |
> |---|---|---|
> | Card `Appearances` / `Minutes` dưới bảng sân | có | **gỡ hẳn.** Hồ sơ cầu thủ giờ **không còn một tile nào**. |
> | Dòng `.note` dưới bảng Season | có | **gỡ hẳn** |
> | Cột trái của `.pl-duo` | `div.pl-duo-l` bọc bảng sân + hai card | **chính thẻ `card pl-pos`** — không còn wrapper, `.pl-duo-l` bị xoá |
> | Người không có bảng sân (thủ môn, người không đội hình nào xếp) | `.pl-duo` hai cột với nửa trái chỉ có hai card | **không dựng `.pl-duo`**; thẻ Season đứng riêng, **rộng toàn khung** |
> | `.kpis.two` | có | xoá (`.kpis.six` **ở lại** — Team Data vẫn dùng) |
>
> **§2.3 của bản 1 không còn áp dụng.** Nó lập luận rằng `Appearances`/`Minutes` xuất hiện hai
> lần là *chủ ý* — hai card là tổng, bảng Season là phần chia nhỏ. Bản 2 giải quyết trùng lặp
> đó theo cách thẳng hơn: hai con số chỉ còn ở hai cột cuối của bảng Season. Mọi đoạn nói
> "hai card" ở §0, §2.3, §3, §7, §8, §11 là mô tả bản 1; §16 liệt kê chính xác cái gì đổi.

> **Q1 = (b) đổi hai thứ so với bản duyệt đầu.** Bảng sân thành **chỉ-để-đọc**: ô là `div` chứ
> không phải `button`, không listener, không `data-role`, không `aria-pressed`, và `.pl-pz` bỏ
> `cursor:pointer` cùng `:hover`. Vai của cầu thủ luôn là nghề của **ô đầu tiên anh ta đá**
> (`who.role`), badge cạnh tên nói đúng nghề ấy, và **segment `role` biến mất khỏi URL** —
> `catTabs()` mất tham số `tail`, `renderPlayerProfile()` mất tham số `wantedRole`. Một link cũ
> dạng `#/data/player/<key>/<cat>/<role>` vẫn mở đúng cầu thủ và đúng tab; segment thứ tư chỉ
> không được đọc nữa.

**Phạm vi — bốn file runtime + một migration:**

| File | Vì sao |
|---|---|
| `client/assets/app.js` | toàn bộ bố cục trang cầu thủ; bảng Season mới |
| `client/assets/app.css` | lưới hai cột mới, `.kpis.two`, gỡ style của thanh đã chết |
| `client/assets/supa.js` | đọc hai cột mới trên `matches` |
| `shared.js` | `GK_COLS` — bỏ một cột `Conceded`, đổi tên cột còn lại |
| `client/app.html`, `client/guide.html`, `client/login.html`, `Stats/index.html`, `Player-Lists/index.html` | bump `?v=` (§12) |
| `supabase/migrations/0022_match_league_season.sql` | hai cột `league`, `season` để trống |

**Dứt khoát KHÔNG đụng:** `index.html` (tagger), `Stats/stats-view.js`, `Stats/stats-view.css`,
`Stats/report.js` (PDF), `Player-Lists/*`, `cloud-sync.js`, `client/assets/site.css`,
`client/assets/film-tools.*`, `auth.js`, `deploy.yml`. Không thêm event mới, không thêm counter
mới, không đổi `newStat()`, không đổi `EVENT_INC`, không đổi `PLAYER_CATS`, không đổi
`TEAM_SECTIONS`. §10 liệt kê từng thứ và lý do.

---

## 0. Tóm tắt một trang

| | **Hôm nay** | **Sau thay đổi** |
|---|---|---|
| Thẻ Position | một mình, `max-width:520px`, xếp dọc | **cột trái** của một lưới hai cột |
| Bảng Season | *không tồn tại* | **cột phải**, bốn cột: League · Season · Appearances · Minutes |
| Thanh `TOTAL / PER 90 MINS` | có | **gỡ** — không còn gì để chia |
| Hàng card KPI | **6** card (`Appearances`, `Minutes`, + 4 card đổi theo vai) | **2** card (`Appearances`, `Minutes`) |
| Bấm một ô trên sân | đổi bộ 4 card | **vẫn bấm được**, đổi badge cạnh tên + URL (§3.4) |
| Thẻ phạt của người không vai | nằm trong card `Cards` của `FALLBACK_KPIS` | **xuống dòng meta**, như thủ môn (§7.4 — đây là một regression phải chặn) |
| Bảng Goalkeeping | hai cột: `Conceded` (suy ra) và `Conceded (tagged)` | **một cột** `Conceded` — con số tagged |
| Cột DB mới | — | `matches.league`, `matches.season`, cả hai `null` |
| Hàm mới trong `app.js` | — | 2 (`seasonRows`, `seasonCard`) |
| Hàm bị gỡ khỏi `app.js` | — | 3 (`per90`, `share`, `playerCtl`) + 4 bảng hằng |

Bảng Season **không phụ thuộc vai**: một trung vệ, một tiền đạo và một thủ môn nhìn thấy đúng
bốn cột như nhau. Đó là điểm khác căn bản với bộ card cũ.

---

## 1. Ba quyết định đã chốt (2026-09-03)

| | Câu hỏi | Trả lời |
|---|---|---|
| **D1** | Sáu card KPI ra sao? | **Bỏ 4 card theo vai, giữ `Appearances` + `Minutes`.** Thanh `Total / Per 90` mất theo, vì bốn card nó điều khiển không còn. |
| **D2** | League/Season lấy từ đâu? | **Thêm hai cột mới, để trống.** Dữ liệu sẽ được cập nhật vào database sau. UI phải đọc được ngay và hiển thị `—` cho tới lúc đó. |
| **D3** | Hai cột `Conceded` trùng tên? | **Xoá một cột**, giữ lại cột lấy từ **data `goal conceded`** — tức con số analyst tag tay, `s.goalsConceded`. Cột suy ra từ đội hình bị gỡ **khỏi bảng**. |

D3 cần đọc kỹ: gỡ **cột** không phải gỡ **con số**. Xem §2.2.

---

## 2. Bốn phát hiện phải đọc trước §5–§9

### 2.1 `supa.js` gọi tên cột tường minh — sai thứ tự triển khai là **mất trắng channel**

`client/assets/supa.js:485` đọc `matches` bằng một **danh sách cột**, không phải `select('*')`:

```
.select('id,code,home_name,away_name,home_score,away_score,kickoff,match_date,competition,stage,venue,our_side,published,lineups,config,home_team_id,away_team_id')
```

Chính file đó đã ghi lại bài học này hai lần trong comment: *"Asking for a column that is not
there fails the whole query, which is why this returned nothing at all."* PostgREST trả `42703`
cho **cả câu**, và `.catch(function () { return []; })` ở cuối biến nó thành **không có trận nào**
— không lỗi, không log, channel rỗng.

> **Ràng buộc cứng:** migration `0022` phải chạy trên database **TRƯỚC** khi `supa.js?v=14` lên
> production. Không phải "nên", mà là điều kiện để site còn chạy. §12 xếp đúng thứ tự đó.
>
> Nếu không muốn phụ thuộc thứ tự, phương án thay thế duy nhất là đổi cả câu sang `select('*')`
> như `clubs()` đang làm — nhưng đó là một thay đổi rộng hơn phạm vi tài liệu này. Không đề xuất.

### 2.2 Gỡ cột `Conceded` suy ra **không** gỡ con số suy ra — và ba cột còn lại vẫn đọc nó

`GK_COLS` (`shared.js:557`) có mười sáu cột. Ba trong số đó, ngoài cột sắp bị gỡ, vẫn đọc
`g.conceded` / `g.known`:

| Cột | Công thức | Còn lại sau §9? |
|---|---|---|
| `Conceded` | `g.known ? g.conceded : '—'` | **bị gỡ** |
| `On Target Faced` | `g.known ? s.saves + g.conceded : '—'` | còn |
| `Save Rate` | `g.known ? pct(s.saves, s.saves + g.conceded) : '—'` | còn |
| `Clean Sheets` | `g.known ? g.clean : '—'` | còn |
| `Conceded (tagged)` → `Conceded` | `s.goalsConceded` | còn, đổi tên |

Hệ quả **có thật** và phải biết trước: sau thay đổi, trên một trận mà bảng đội hình nói *2 bàn
lọt lưới* còn analyst chỉ tag *1* sự kiện `goal conceded`, người đọc sẽ thấy

```
Saves 4 · On Target Faced 6 · Save Rate 66.7% · … · Conceded 1
```

`4 + 1 ≠ 6`. Hai con số trả lời hai câu hỏi khác nhau và luôn khác nhau như thế; điều duy nhất
thay đổi là cột nói ra sự chênh lệch không còn trên màn hình nữa.

Đó là hệ quả trực tiếp của D3 và tài liệu này thực hiện đúng D3. §13-Q3 nêu lại một lần cuối
để bạn xác nhận, kèm hai cách xử lý nếu muốn giữ tính nhất quán số học.

Cột `Conceded` trong **bảng danh sách cầu thủ** (`PL_GK`, `app.js:1222`) là con số **suy ra**
và **không nằm trong phạm vi ảnh 3**. Nó **không đổi**. Xem §10.

### 2.3 `Appearances` và `Minutes` sẽ xuất hiện hai lần trên cùng một màn hình

D1 giữ hai card; bảng Season có hai cột cuối tên đúng như thế, đọc đúng những con số đó. Khi
channel chỉ có một mùa giải (tình trạng hôm nay, và còn kéo dài), hai card lặp lại y nguyên
hàng duy nhất của bảng bên cạnh.

Đây là **chủ ý**, không phải sót: hai card là **tổng của cả sự nghiệp trong channel**, bảng
Season là **phần chia nhỏ**. Quan hệ đó giống hệt `tfoot` của bảng trận đấu ngay bên dưới —
hàng `TOTAL` lặp lại tổng của các hàng trên nó, và không ai coi đó là lỗi.

Bố cục ở §3 đặt hai card **dưới thẻ Position, trong cột trái**, để chúng đọc như phần chân của
cột trái chứ không phải một dải rộng lặp lại bảng bên phải.

### 2.4 Gỡ `FALLBACK_KPIS` làm **mất thẻ phạt** của người không vai — phải chặn

`playerHead()` (`app.js:1508-1513`) in thẻ phạt xuống dòng meta **chỉ khi** `who.gk || role`:

```js
(who.gk || role ? ' · ' + who.cards.y + 'Y · ' + who.cards.r + 'R' : '')
```

Điều kiện đó tồn tại vì `FALLBACK_KPIS` — bộ card của người mà **không bảng đội hình nào từng
xếp chỗ** — có sẵn một card `Cards`, và comment ngay trên dòng đó nói rõ: *"A figure never
appears twice on one screen."*

Gỡ `FALLBACK_KPIS` mà để nguyên điều kiện thì người không vai **mất hoàn toàn** thẻ phạt: không
card, không dòng meta. Đó là một tính năng biến mất, không phải một thay đổi giao diện.

§7.4 sửa điều kiện thành **luôn in**. Sau khi bốn card đổi-theo-vai biến mất, không còn chỗ nào
khác trên trang in thẻ phạt, nên "không xuất hiện hai lần" tự động đúng.

---

## 3. Bố cục mới

### 3.1 Thứ tự DOM

`renderPlayerProfile()` hôm nay append theo thứ tự: `back` → `playerHead` → `positionBoard` →
`playerCtl` → `kpis(6)` → `catTabs` → `playerMatchTable`.

Sau thay đổi:

```
back                     ← All players
playerHead               tên · badge vai · Player ▼ · dòng meta
pl-duo                   ┌──────────────┬────────────────────────────┐
  ├ pl-duo-l  (cột trái) │  POSITION    │  SEASON                    │
  │   ├ card pl-pos      │   [sân]      │  League Season Apps Minutes│
  │   └ kpis two         │              │  ───────────────────────── │
  └ card pl-season       │              │   —      —      4     360' │
                         │              │                            │
                         │              │                            │
                         │              │                            │
                         └──────────────┴────────────────────────────┘
catTabs                  GOALKEEPING  DISTRIBUTION  DEFENSIVE  …
playerMatchTable         bảng từng trận
```

`playerCtl` không còn được gọi và hàm bị xoá.

### 3.2 Khi không có thẻ Position

`positionBoard()` trả `null` cho **thủ môn** và cho **người không bảng đội hình nào xếp chỗ**
(`app.js:1366`). Quy tắc đó **không đổi**. Khi đó cột trái chỉ còn hai card, cột phải vẫn là
bảng Season, và lưới vẫn hai cột. Không có nhánh nào vẽ một cột trống.

### 3.3 Xuống điện thoại

Lưới đổ thành một cột tại `max-width:820px` — cùng ngưỡng `.grid2` / `.grid-13` trong
`site.css:217` và `.sm-wrap` trong `app.css` đang dùng. Thứ tự khi đổ: Position, hai card,
rồi Season. Bảng Season tự cuộn ngang trong `.stbl-wrap` như mọi bảng khác.

### 3.4 Bấm một ô trên sân còn nghĩa gì?

Bốn card mà cú bấm từng điều khiển đã biến mất. Hai thứ vẫn còn đọc `role`:

- **badge cạnh tên** — `DEF` / `MID` / `ST`, nói vai nào đang được đọc;
- **URL** — `#/data/player/<key>/<cat>/<role>`, một đường link gửi được.

Thiết kế này **giữ nguyên** cả hai và giữ ô bấm được. Lý do: bỏ chúng là một thay đổi thứ hai
không ai yêu cầu, làm hỏng những link đã gửi đi, và xoá thêm tám test đang xanh. Bấm một ô vẫn
là câu "cho tôi đọc anh ta ở vai này", chỉ là câu trả lời bây giờ gọn hơn một badge.

§13-Q1 để bạn chọn khác nếu muốn một bảng chỉ-để-đọc.

---

## 4. Bảng Season

### 4.1 Bốn cột

| Cột | Nguồn | Hôm nay hiển thị |
|---|---|---|
| `League` | `m.league` (cột DB mới) | `—` |
| `Season` | `m.season` (cột DB mới) | `—` |
| `Appearances` | số trận trong nhóm | số thật |
| `Minutes` | tổng phút trong nhóm | số thật |

### 4.2 Một hàng là một cặp `(league, season)`

`who.matches` được gom theo khoá `String(m.league||'') + '\u0000' + String(m.season||'')`.
Ký tự **U+0000** là dấu ngăn vì không tên giải nào chứa nó — nối bằng `-` hay `/` thì
`("A/B", "C")` và `("A", "B/C")` trở thành một nhóm.

Hôm nay cả hai cột đều `null` trên mọi trận, nên mọi trận rơi vào **đúng một nhóm** và bảng có
**đúng một hàng**: `— · — · <apps> · <minutes>`. Khi bạn cập nhật database, bảng tự tách ra
thành nhiều hàng mà không cần đổi thêm dòng code nào.

Đó là lý do gom-nhóm được thiết kế ngay bây giờ thay vì hard-code một hàng: hard-code một hàng
rồi sửa lại sau là viết tính năng này hai lần.

### 4.3 Thứ tự hàng

Mới nhất trước — cùng quy ước với bảng trận đấu ngay dưới nó (`who.matches.slice().reverse()`).
Khoá sắp xếp là **ngày trận muộn nhất trong nhóm**, giảm dần; hoà thì so `league` rồi `season`
theo `localeCompare`, để thứ tự không phụ thuộc vào thứ tự chèn.

Không sắp theo chuỗi `season`: `"23/24"` và `"2023-24"` là hai cách viết mà bạn có thể nhập bất
kỳ lúc nào, và sắp chữ trên chúng cho ra thứ tự sai. Ngày trận là thứ database luôn biết.

### 4.4 Phút được in bằng **đúng** luật đang có, không phải một luật thứ hai

`minsTotal(p)` (`app.js:1057`) chỉ đọc ba trường: `p.timed`, `p.exact`, `p.min`. Vậy mỗi nhóm
dựng một object ba trường **bằng đúng ba phép rút gọn `playerIndex()` đang dùng**
(`app.js:956-958`) rồi đưa qua chính `minsTotal()`:

```js
min:   rows.reduce(function (n, r) { return n + (r.mins ? r.mins.min : 0); }, 0),
timed: rows.some(function (r) { return r.mins; }),
exact: rows.every(function (r) { return r.mins && r.mins.exact; })
```

Nhờ đó `—` (không trận nào có đội hình) và tiền tố `~` (có trận không đặt Duration) hành xử
trong bảng Season **y hệt** như trên card `Minutes`, trong cột `Minutes Played` của bảng trận,
và trong dropdown chọn cầu thủ. Một luật, một hàm, bốn chỗ đọc.

Tổng của cột `Minutes` qua mọi hàng bằng đúng card `Minutes`, vì `p.min` cũng là tổng của
`r.mins.min` — cùng một phép cộng, chia theo nhóm.

### 4.5 Hai hàm mới

```js
/* who.matches gom theo cặp (league, season) — một hàng bảng Season cho mỗi cặp.
   Cả hai trường đều là cột database chưa ai điền, nên hôm nay mọi trận rơi vào
   một nhóm và bảng có một hàng. Gom nhóm ngay từ đầu vì hard-code một hàng rồi
   tách ra sau là viết cùng một thứ hai lần. */
function seasonRows(who) { … }        // -> [{league, season, apps, min, timed, exact, last}]

/* Thẻ bên phải: bốn cột, một hàng mỗi mùa. Không nút, không listener — đây là
   thứ duy nhất trên trang này không bấm được, và không cần bấm. */
function seasonCard(who) { … }        // -> Element
```

`seasonCard()` dựng markup bằng `stbl` + `stbl-wrap`, đúng vocabulary mà `playerTable()` và
`playerMatchTable()` đang dùng, nên nó thừa hưởng cuộn ngang, `tabular-nums`, và mọi thứ khác
mà không thêm một dòng CSS bảng nào.

**Không** có `<tfoot>`: bảng một hàng thì chân bảng lặp lại chính hàng đó, và tổng đã nằm trên
hai card ngay bên trái.

### 4.6 Trạng thái rỗng

Không có. Mọi cầu thủ trong danh sách đều có ít nhất một trận (đó là điều kiện để anh ta có mặt
trong `playerIndex`), nên bảng luôn có ít nhất một hàng. `—` trong hai cột đầu là câu trả lời
đầy đủ cho "chưa ai nói trận này thuộc giải nào" — chính là dấu mà `minsTotal` và `gkCell` đã
dùng cho cùng ý nghĩa ở khắp trang.

Một dòng `.note` dưới bảng nói điều đó ra bằng chữ, cùng giọng với dòng `.note` dưới danh sách
cầu thủ:

> League và Season đến từ chính trận đấu. Một trận chưa được gán giải hoặc mùa đọc là "—", và
> mọi trận như thế được gộp thành một hàng.

---

## 5. Migration `0022_match_league_season.sql`

```sql
-- League và mùa giải của một TRẬN, không phải của một club: một club đá nhiều
-- giải và nhiều mùa, và bảng Season trên trang cầu thủ tách theo đúng cặp đó.
-- Cùng lý do mà 0013 đặt competition/stage lên matches.
--
-- Cả hai để null. Chúng được điền bằng tay sau; cho tới lúc đó trang cầu thủ
-- đọc "—", đúng dấu mà mọi con số chưa biết trên trang ấy đang dùng.
alter table public.matches add column if not exists league text;
alter table public.matches add column if not exists season text;

create index if not exists matches_league_season_idx
  on public.matches (club_id, league, season);
```

**Chỉ thêm, không sửa, không xoá.** Không policy mới: `matches_read` và `matches_read_public`
(0013, 0017) là policy **cấp hàng**, nên cột mới tự động đọc được bởi đúng những người đã đọc
được hàng đó. Không view nào cần sửa: `match_stats` là rollup của `events` và không chạm tới
hai cột này; `public_match_stats` là `select s.*` từ `match_stats`.

`league` **không** dùng lại `competition`. Hai cột đó trả lời hai câu khác nhau: `competition`
đang mang *"FIFA World Cup 26 Qualifying"* trên channel Saint Lucia — tên một giải đấu cụ thể
của một trận — trong khi `league` là thứ bạn sẽ điền. Ghi đè `competition` sẽ đổi nghĩa một cột
mà `shape()` đã map ra `m.competition` cho các màn hình khác đọc. §13-Q2 nêu phương án dự phòng
nếu bạn muốn `competition` làm giá trị mặc định.

---

## 6. `client/assets/supa.js`

Đúng hai thay đổi.

**6.1 — thêm hai cột vào `.select()`** (`supa.js:485`), sau `competition,stage`:

```
…,kickoff,match_date,competition,stage,league,season,venue,our_side,…
```

**6.2 — mang chúng vào object trận** trong `shape()` (`supa.js:596-620`), ngay cạnh
`competition` / `stage`:

```js
competition: m.competition || '',
stage: m.stage || '',
/* Hai cột của 0022, để trống cho tới khi được điền. Bảng Season trên trang
   một cầu thủ gom các trận theo đúng cặp này; rỗng nghĩa là "chưa ai nói", và
   trang ấy in "—". */
league: m.league || '',
season: m.season || '',
```

`|| ''` chứ không phải `|| null`: mọi trường chuỗi khác trong `shape()` đều chuẩn hoá về chuỗi
rỗng, và `seasonRows()` gom nhóm bằng `String(...)` nên hai cách viết cho ra cùng một khoá — giữ
đúng thói quen của file là điều rẻ hơn.

Đọc lại §2.1 trước khi deploy file này.

---

## 7. `client/assets/app.js`

### 7.1 Xoá

| Dòng | Thứ bị xoá | Vì sao |
|---|---|---|
| `1077-1085` | `function per90(p, n)` | sau khi bốn card đi, không còn ai gọi |
| `1104` | `var MODES` | thanh đọc số không còn |
| `1106-1131` | banner comment của bộ tile + `function share(n, d)` | `share()` chỉ được `ROLE_KPIS` dùng |
| `1132-1157` | `var ROLE_KPIS` | D1 |
| `1159-1166` | `var GK_KPIS` | D1 |
| `1167-1178` | `var FALLBACK_KPIS` | D1 — kèm §7.4 |
| `1421-1440` | `function playerCtl(who, onMode)` | không còn card nào để nó điều khiển |

`ROLES`, `ROLE_POS`, `ROLE_OF`, `ROLE_LABEL`, `ROLE_BADGE` (`1087-1100`) **ở lại nguyên vẹn**:
`positionBoard()`, `playerIndex()` và badge cạnh tên đều đọc chúng.

### 7.2 Sửa `renderPlayerProfile()` (`1279-1345`)

Biến `mode`, closure `row()`, `paint()` và toàn bộ đoạn `ctl` biến mất. Hai card được dựng một
lần, không phải hai lần, nên không cần closure nữa:

```js
body.appendChild(playerHead(who, people, cat, role));

/* Position bên trái, Season bên phải — một hàng, và trên điện thoại là hai.
   Hai card nằm DƯỚI thẻ Position trong cùng cột trái: chúng là tổng của cả
   sự nghiệp trong channel, và bảng bên phải là phần chia nhỏ của chính tổng
   ấy, đúng quan hệ mà tfoot của bảng trận đấu có với các hàng của nó. */
var duo = el('div', 'pl-duo');
var left = el('div', 'pl-duo-l');
var board = positionBoard(who, cat, role);
if (board) left.appendChild(board);
var kpis = el('div', 'kpis two');
kpis.innerHTML =
  kpi('Appearances', who.apps, who.apps === 1 ? 'match played' : 'matches played') +
  kpi('Minutes', minsTotal(who), 'on the pitch');
left.appendChild(kpis);
duo.appendChild(left);
duo.appendChild(seasonCard(who));
body.appendChild(duo);

body.appendChild(catTabs(cat, '#/data/player/' + encodeURIComponent(who.key) + '/', tabs,
                         role ? '/' + role : ''));
body.appendChild(playerMatchTable(who, cat));
```

`var role = …` ở đầu hàm **không đổi**: `positionBoard()` và `playerHead()` vẫn nhận nó (§3.4).

### 7.3 Thêm `seasonRows()` và `seasonCard()`

Đặt ngay trên `positionBoard()`, để thứ tự khai báo trong file khớp thứ tự trên màn hình.

```js
function seasonRows(who) {
  var by = {}, out = [];
  who.matches.forEach(function (r) {
    var lg = String(r.m.league || ''), sn = String(r.m.season || '');
    var k = lg + '\u0000' + sn;            // không tên giải nào chứa U+0000
    var g = by[k];
    if (!g) { g = by[k] = { league: lg, season: sn, rows: [], last: '' }; out.push(g); }
    g.rows.push(r);
    if (String(r.m.date || '') > g.last) g.last = String(r.m.date || '');
  });
  out.forEach(function (g) {
    g.apps = g.rows.length;
    /* đúng ba phép rút gọn playerIndex() dùng, nên minsTotal() in ra cùng một
       thứ ở đây và trên card bên cạnh — một luật, không phải hai */
    g.min   = g.rows.reduce(function (n, r) { return n + (r.mins ? r.mins.min : 0); }, 0);
    g.timed = g.rows.some(function (r) { return r.mins; });
    g.exact = g.rows.every(function (r) { return r.mins && r.mins.exact; });
  });
  /* mới nhất trước, như bảng trận đấu. Khoá là NGÀY, không phải chuỗi mùa:
     "23/24" và "2023-24" là hai cách viết hợp lệ và sắp chữ trên chúng sai. */
  return out.sort(function (a, b) {
    return (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) ||
           a.league.localeCompare(b.league) || a.season.localeCompare(b.season);
  });
}
```

`seasonCard()` dựng `card` + `card-h` "Season" + `stbl-wrap` + `stbl`, một `<tr>` cho mỗi hàng,
`esc(g.league || '—')`, `esc(g.season || '—')`, `g.apps`, `esc(minsTotal(g))`, rồi `.note` ở §4.6.
Không listener nào.

### 7.4 Sửa `playerHead()` — thẻ phạt luôn được in

`app.js:1508-1513`, đây là §2.4:

```js
      /* Thẻ phạt luôn ở đây. Trước kia dòng này im lặng với người không vai vì
         FALLBACK_KPIS mang sẵn một card Cards, và một con số không xuất hiện hai
         lần trên một màn hình. Bộ card ấy đã đi; giờ đây là chỗ duy nhất trên
         trang in ra thẻ phạt, nên nó in cho tất cả mọi người. */
      ' · ' + who.cards.y + 'Y · ' + who.cards.r + 'R'));
```

Không còn nhánh ba ngôi. Thủ môn và người có vai đọc y như trước; người không vai **lấy lại**
thứ suýt mất.

---

## 8. `client/assets/app.css`

### 8.1 Thêm

```css
/* ---------- one player: where he stood, beside what he has played ----------
   Position bên trái, Season bên phải. Cột trái hẹp hơn vì nó là một hình vẽ có
   tỉ lệ cố định (PITCH_DIMS), còn cột phải là một bảng muốn mọi bề rộng nó lấy
   được. Ngưỡng 820px là ngưỡng .grid2 / .grid-13 / .sm-wrap đã dùng — trang này
   không thêm một breakpoint thứ hai cho cùng một câu hỏi. */
.pl-duo{
  display:grid; grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);
  gap:14px; align-items:start; margin-bottom:14px;
}
.pl-duo-l{display:flex; flex-direction:column; gap:14px; min-width:0}
@media (max-width:820px){ .pl-duo{grid-template-columns:minmax(0,1fr)} }

/* hai tile, nên chúng chia đôi cột trái thay vì bị auto-fit kéo thành một dải */
.kpis.two{grid-template-columns:repeat(2,minmax(0,1fr)); margin-bottom:0}
```

### 8.2 Sửa

```css
.pl-pos{max-width:520px; margin-bottom:14px}   →   .pl-pos{margin-bottom:0}
```

Bề rộng bây giờ do lưới quyết định, và khoảng cách dưới do `gap` của `.pl-duo-l`.

### 8.3 Xoá

```css
.pl-ctl{…}  .pl-grp{…}  .pl-grp.right{…}  .pl-ctl .chip[disabled]{…}
```

Bốn rule của thanh đọc số, cùng banner comment của chúng (`app.css:577-583`).

### 8.4 KHÔNG đụng

`.kpis.six` và hai media query của nó (`app.css:306-308`) **ở lại**: `renderTeamData()`
(`app.js:532`) vẫn dựng một hàng sáu tile bằng đúng class đó. Xoá chúng làm hỏng tab Team Data.
Một test đang canh đúng điều này (`tests/data-page.test.js:362`).

---

## 9. `shared.js` — `GK_COLS`

Đúng hai dòng, theo D3.

**9.1 — xoá cột suy ra** (`shared.js:559`):

```js
['Conceded',       (s,g)=>g.known?g.conceded:'—'],     ← xoá cả dòng
```

**9.2 — đổi tên cột tagged** (`shared.js:582-586`), và viết lại comment vì lý do cũ không còn:

```js
  /* Con số analyst tag tay, từ sự kiện `goal conceded`. Đây là cột Conceded duy nhất
     trong bảng này kể từ 2026-09-03: cột suy ra từ bảng đội hình đã được gỡ, nên hậu tố
     "(tagged)" không còn phân biệt với gì nữa và cái tên trần là tên đúng.
     Con số suy ra CHƯA biến mất — On Target Faced, Save Rate và Clean Sheets ngay bên
     trái vẫn đọc nó, và chúng vẫn nói "—" khi không bảng đội hình nào trả lời được.
     Nghĩa là Saves + Conceded có thể không bằng On Target Faced; hai con số trả lời hai
     câu hỏi khác nhau, và bảng này giờ chỉ in một trong hai. */
  ['Conceded',(s,g)=>s.goalsConceded]
```

Chữ ký `(s,g)` **giữ nguyên** dù `g` không được dùng: `tests/player-data.test.js:445` canh mọi
cột trong `GK_COLS` nhận đúng hai tham số — đó là thứ phân biệt `GK_COLS` với `PLAYER_CATS`, và
đổi arity sẽ làm hỏng một quy tắc kiến trúc để đổi lấy con số không.

**Thứ tự cột sau thay đổi** (15 cột, giảm từ 16):

```
Saves · On Target Faced · Save Rate · Clean Sheets · Goal Kicks · Catches · Parries ·
Standing · Diving · Collapse · Overhead · Kneeling · Def. Line Support · Aerial Control · Conceded
```

`Conceded` **ở nguyên cuối bảng** — nó chỉ mất hậu tố, không đổi chỗ. Đưa nó lên vị trí thứ hai
(chỗ cột vừa bị gỡ) đọc mượt hơn, nhưng lại đặt nó ngay cạnh `On Target Faced` và mời người đọc
cộng hai số không cộng được với nhau (§2.2). §13-Q4 để bạn chọn.

`PLAYER_CATS.goalkeeper` giữ nguyên cột `Goals Conceded` của nó — bảng đó không chứa con số suy
ra nào, nên chưa bao giờ có xung đột tên để giải quyết.

---

## 10. Không đụng tới — và vì sao

| Thứ | Vì sao đứng yên |
|---|---|
| `Stats/stats-view.js`, `Stats/stats-view.css` | tab Stats của **một trận**. Nó không đọc `GK_COLS` (`grep`: `GK_COLS` chỉ xuất hiện trong `shared.js`, `client/assets/app.js` và tests) và không vẽ trang cầu thủ. |
| `Stats/report.js` (PDF) | thẻ thủ môn trong PDF (`report.js:1314`) tự tính `gc` từ bàn thua của đối phương. Không đi qua `GK_COLS`. |
| `PL_GK` — cột `Conceded` của **danh sách** cầu thủ (`app.js:1222`) | ảnh 3 là bảng **Goalkeeping trong hồ sơ một người**. Danh sách là màn hình khác, ở đó chỉ có một cột Conceded và nó là con số suy ra. Không có gì để sửa. |
| `gkCell()` (`app.js:1229`) | `PL_GK` vẫn gọi. Sau khi `GK_KPIS` đi, đây là người dùng duy nhất còn lại — hàm vẫn sống. |
| `.kpis.six` trong `app.css` | Team Data dùng (§8.4). |
| `positionBoard()`, `posFigures()`, `FORMATION_GRID`, `PITCH_DIMS`, `pitchSVG` | bảng sân không đổi một pixel; nó chỉ chuyển chỗ đứng. |
| `catTabs()`, `tabsFor()`, `GK_TABS`, `OUT_TABS`, `catCols()` | dải tab và bảng dưới nó không nằm trong phạm vi. |
| `playerMatchTable()` | các cột của nó đến từ `catCols()`; nó tự động đọc `GK_COLS` mới mà không sửa gì. |
| `newStat()`, `EVENT_INC`, `computeStats()` | không counter nào được thêm, gỡ hay đổi nghĩa. `goalsConceded` vẫn được `goal conceded` tăng đúng như cũ. |
| `matches.competition` / `matches.stage` | §5. |
| `deploy.yml` | không có file runtime mới; `docs/*.md` không được deploy. |

---

## 11. Test

Nền hiện tại: **1409/1409 passed** (`node tests/run.js`, chạy 2026-09-03).

### 11.1 Test phải sửa

| File | Số test | Việc phải làm |
|---|---|---|
| `tests/player-role-cards.test.js` | ~24 trong 54 | xem 11.2 |
| `tests/player-data.test.js` | 3 | `GK_COLS` labels + hai `slice()` (§11.3); test "a keeper-s six tiles…" viết lại |
| `tests/gk-events-duel-split.test.js` | 2 | `'Conceded (tagged)'` → `'Conceded'`; T6c viết lại (§11.4) |
| `tests/stats-tabs-split.test.js` | 1 | test dòng 343 viết lại (§11.4) |
| `tests/data-page.test.js` | 0 | `.kpis.six` vẫn còn, vì Team Data vẫn dùng |
| `tests/asset-versions.json` | — | `node tests/asset-versions.test.js --update` |

### 11.2 `tests/player-role-cards.test.js` chi tiết

| Nhóm | Test | Số phận |
|---|---|---|
| map ô → nghề (3) | 93, 108 | **giữ nguyên** |
| | 103 `'the goalkeeper is not one of the three'` | **sửa** — bỏ vế `notOk(A.ROLE_KPIS.goalkeeper)` |
| bảng tile (5) | 118, 124, 130, 145 | **xoá** — không còn bảng tile nào |
| | 162 `'Shots On Target is the same sum…'` | **sửa** — giữ nửa kiểm `PLAYER_CATS.shooting`, bỏ nửa đọc `ROLE_KPIS.striker` |
| `posFigures` (6) | 173-207 | **giữ nguyên** cả sáu |
| vai qua một mùa (9) | 221-284 | **giữ nguyên** cả chín |
| hai cách đọc số (5) | 296, 302, 309, 314 | **xoá** — `per90` không còn |
| | 322 `'Appearances and Minutes are the divisor…'` | **sửa** — hai card vẫn dựng thẳng, nhưng không còn "divisor" nào; đổi thành "hai card là thứ duy nhất còn lại và không đi qua bảng nào" |
| cái được vẽ (12) | 330, 338, 354, 422 | **xoá** — đọc `playerCtl` / `mode` |
| | 347 `'a keeper gets the two readings and no board'` | **sửa** — giữ vế `positionBoard` trả `null`, bỏ vế thanh đọc số |
| | 393 `'nothing on this bar prints a shirt number'` | **sửa** — chuyển phép kiểm sang `seasonCard` + `playerHead` |
| | 398 `'the new markup brings its own styles…'` | **sửa** — `.pl-ctl` / `.pl-grp` đổi thành `.pl-duo` / `.pl-duo-l` / `.kpis.two` |
| | 361, 372, 381, 388, 407 | **giữ nguyên** |
| hồ sơ được vẽ thật (14) | 523, 532, 643 | **xoá** — đọc bốn card / `repaint` |
| | 544 `'a keeper draws his own four…'` | **sửa** — thành "hai card, không thanh, có bảng Season" |
| | 555 `'a man no board placed draws the page he had…'` | **sửa** — thành "hai card, và thẻ phạt của anh ta ở dòng meta" (§2.4) |
| | 567-635 (8 test bảng sân) | **giữ nguyên** |

**Harness `paintProfile()` (dòng 429-510) phải sửa:** `NAMES` bỏ `per90`/`playerCtl`, thêm
`seasonRows`/`seasonCard`; `kpis six` → `kpis two`; bỏ `bar` và `repaint`; thêm
`season = body.kids…` để đọc bảng mới. `ROLEBLOCK` (dòng 53) đang neo vào
`c: 'yellow and red' }\n  ];` — chuỗi đó biến mất, nên regex phải neo lại vào dòng cuối của
`ROLE_POS` / `ROLE_OF`. **Cùng một `ROLEBLOCK` được `tests/player-data.test.js:53` dùng lại** —
sửa cả hai, nếu không cả hai file cùng ném "unbalanced source while scanning".

### 11.3 `tests/player-data.test.js` chi tiết

Dòng 414-431, test `'the keeper columns are shared.js-s…'`:

```js
deepEq(A.GK_COLS.map(c=>c[0]),
       ['Saves','On Target Faced','Save Rate','Clean Sheets','Goal Kicks',
        'Catches','Parries','Standing','Diving','Collapse','Overhead','Kneeling',
        'Def. Line Support','Aerial Control','Conceded']);          // 16 → 15
deepEq(v.slice(0,5),[4,5,'80.0%',0,9]);                             // slice(0,6) → slice(0,5)
deepEq(v.slice(5),[0,0,0,0,0,0,0,'0/0','0/0',0]);                   // slice(6) → slice(5)
deepEq(unknown.slice(0,5),[4,'—','—','—',9]);                       // bỏ một '—'
```

Dòng 48 `LIFT`: bỏ `'per90'`. Dòng 70-71: bỏ `MODES,` và `ROLE_KPIS,GK_KPIS,FALLBACK_KPIS,`.

Test dòng 545 `'a keeper-s six tiles are about the goal, and his cards are not lost'` **viết
lại thành** `'a keeper-s two tiles, and nobody-s cards are lost'`: kiểm dòng meta in thẻ phạt
**cho tất cả** (§7.4) — đây là test chặn regression 2.4 và là test quan trọng nhất trong đợt này.

### 11.4 Hai test về `Conceded`

`tests/gk-events-duel-split.test.js` T6b (dòng 209, 217): đổi chuỗi `'Conceded (tagged)'` thành
`'Conceded'`. T6c (dòng 220) `'Conceded (tagged) stands beside the derived Conceded, never
instead of it'` — mệnh đề đó **không còn đúng**. Viết lại thành:

> `'the derived Conceded left the table, and the three columns built on it did not'` — kiểm
> `GK_COLS` chỉ còn **một** cột tên `Conceded` và nó đọc `s.goalsConceded`; kiểm `On Target
> Faced` / `Save Rate` / `Clean Sheets` vẫn trả `'—'` khi `known:0` và vẫn đọc `g.conceded`
> khi `known:1`. Đó chính là §2.2, khoá lại bằng test.

`tests/stats-tabs-split.test.js:343`: bỏ vế `gk.indexOf('Conceded (tagged)')>=0`, đổi thành
"đúng một cột tên `Conceded` trong `GK_COLS`, và đúng một cột khớp `/Conceded/` trong
`PLAYER_CATS.goalkeeper`".

### 11.5 Test mới — `tests/player-season-table.test.js`

Khoảng 22 test, cùng kiểu với các file khác trong `tests/` (đọc source thật + chạy thật trong
`vm`):

**`seasonRows()` — gom nhóm (7)**
1. mọi trận `league`/`season` rỗng → **đúng một hàng**, `apps` bằng `who.apps`
2. hai mùa trên cùng một giải → hai hàng, mỗi hàng đếm đúng số trận của nó
3. hai giải trong cùng một mùa → hai hàng
4. `("A/B","C")` và `("A","B/C")` là **hai** hàng — dấu ngăn U+0000 làm đúng việc
5. tổng `apps` qua mọi hàng bằng `who.apps`; tổng `min` bằng `who.min`
6. mới nhất trước, theo ngày trận muộn nhất — không theo chuỗi `season`
7. một trận không ngày không làm hỏng thứ tự và không ném

**Phút (4)**
8. một nhóm không trận nào có đội hình → `'—'`, không phải `0'`
9. một nhóm có trận thiếu Duration → tiền tố `~`
10. mọi trận exact → không tiền tố
11. `minsTotal(nhóm)` và `minsTotal(who)` cho cùng chuỗi khi chỉ có một nhóm

**Cái được vẽ (6)**
12. bốn `<th>`: `League`, `Season`, `Appearances`, `Minutes` — đúng thứ tự
13. hai cột đầu in `—` khi rỗng
14. `seasonCard` không gắn listener nào (`notOk(/addEventListener/)`)
15. hồ sơ vẽ ra `.pl-duo` chứa **đúng hai** con: `.pl-duo-l` và `.card.pl-season`
16. thủ môn → không `.pl-pos`, nhưng `.pl-duo` vẫn hai cột và `.kpis.two` vẫn ở cột trái
17. `.kpis.two` có **đúng hai** tile, nhãn `Appearances` và `Minutes`

**Cái phải biến mất (3)**
18. `app.js` không còn `pl-ctl`, `MODES`, `per90`, `ROLE_KPIS`, `GK_KPIS`, `FALLBACK_KPIS`
19. `app.css` không còn `.pl-ctl{`, `.pl-grp{` — nhưng **vẫn còn** `.kpis.six{` (Team Data)
20. `.pl-duo` đổ một cột tại `820px`, cùng ngưỡng `.grid2` dùng

**Thẻ phạt (2)** — chặn §2.4
21. người **không vai** có `0Y · 0R` ở dòng meta
22. thẻ phạt xuất hiện **đúng một lần** trên toàn hồ sơ, với cả ba loại cầu thủ

### 11.6 Kỳ vọng

Đếm theo §11.2–§11.4: **15 test bị xoá** (4 nhóm bảng tile, 4 nhóm hai-cách-đọc-số, 4 nhóm
cái-được-vẽ, 3 trong nhóm hồ-sơ-được-vẽ-thật), **11 test bị sửa** — sửa không đổi tổng — và
**~22 test mới**.

`1409 − 15 + 22 = 1416`, tất cả xanh. Con số chính xác chốt lúc triển khai.

---

## 12. Thứ tự triển khai và cache-bust

**Phải theo đúng thứ tự này** — đọc §2.1 để hiểu vì sao bước 1 không thể đổi chỗ với bước 4.

1. Chạy `supabase/migrations/0022_match_league_season.sql` trên database production.
2. Kiểm bằng một câu: `select league, season from public.matches limit 1;` phải trả về hai cột
   `null` chứ không phải lỗi.
3. Sửa code (§6-§9), chạy `node tests/run.js` cho tới khi xanh hết.
4. `node tests/asset-versions.test.js --update`, rồi bump `?v=` ở **mọi** trang tải file đã sửa:

| File | `v` hôm nay | `v` mới | Trang phải sửa |
|---|---|---|---|
| `client/assets/app.js` | 48 | **49** | `client/app.html:81` |
| `client/assets/app.css` | 18 | **19** | `client/app.html:9`, `client/guide.html:9`, `client/login.html:8` |
| `client/assets/supa.js` | 13 | **14** | `client/app.html:80` |
| `shared.js` | 26 | **27** | `Stats/index.html:66`, `Player-Lists/index.html:98` |

`shared.js` là chỗ dễ quên nhất: nó được **hai** trang ngoài `client/` tải, và cả hai đều không
liên quan gì tới thay đổi này. Bỏ sót một trong hai thì `tests/asset-versions.test.js` bắt được
và nói tên trang.

5. Deploy. Không file runtime mới nên không cần sửa danh sách `cp` trong `deploy.yml`.
6. Sau khi lên, mở một hồ sơ thủ môn và xác nhận: cột `Conceded` xuất hiện **một lần**, và bảng
   Season đọc `— · — · <n> · <phút>`.

---

## 13. Bốn câu hỏi, và câu trả lời đã chốt

| | Câu hỏi | Chốt |
|---|---|---|
| **Q1** | Bấm một ô trên sân còn nghĩa gì? | **(b)** — bảng sân **chỉ-để-đọc**. Ô là `div`, không listener, không `data-role`/`aria-pressed`, không `cursor:pointer`, không `:hover`. `role` biến mất khỏi URL; badge luôn là nghề của ô đầu tiên anh ta đá. |
| **Q2** | `league` có fallback về `competition`? | **(a)** — chỉ đọc `m.league`. Để trống tới khi database được điền. `competition` không bị đụng. |
| **Q3** | Chấp nhận `Saves + Conceded ≠ On Target Faced`? | **(a)** — chấp nhận. Test `T6c` trong `tests/gk-events-duel-split.test.js` khoá lại đúng điều đó, kèm lý do. |
| **Q4** | Cột `Conceded` đứng đâu? | **(a)** — nguyên cuối bảng. |

---

## 14. Những gì lệch khỏi bản thiết kế lúc triển khai

Bốn điều, tất cả đều nhỏ và đều được test canh lại.

1. **`align-items:stretch` thay vì `start`** trên `.pl-duo` (§8.1 viết `start`). Nhìn thật trên
   trình duyệt thì bảng Season ngắn hơn thẻ Position khá nhiều, để lại một mảng trống bên phải
   đọc như thứ gì đó chưa tải xong. Cho hai cột cao bằng nhau thì hàng đọc như **một** hàng, và
   giống ảnh 2 hơn.

2. **`client/login.html` cũng tải `supa.js`** (dòng 76) — §12 chỉ liệt kê `client/app.html`.
   `tests/asset-versions.test.js` bắt được và nói tên trang.

3. **`client/assets/app.js` tự tải `shared.js?v=` lúc chạy** (dòng 1576, khi ai đó mở một trận).
   Đó là chỗ thứ ba của `shared.js` và §12 không liệt kê nó; test bắt được với thông điệp
   *"shared.js is loaded as v26 and v27"*. Sửa dòng đó rồi chạy lại `--update` là xong —
   `app.js` vẫn ở `v=49`, chỉ là hash trong manifest được ghi lại sau lần sửa thứ hai.

4. **Ba rule CSS nhỏ không có trong §8.1** — `.pl-season .stbl-wrap{margin-bottom:11px}`,
   `table.stbl .c-lg,table.stbl .c-sn{text-align:left}` và `.pl-season .note{margin:0}`. `League`
   và `Season` là chữ giữa các cột số; mọi cột chữ khác của trang này (`.c-date`, `.c-opp`) đều
   đọc trái, nên hai cột này cũng vậy.

**Đã xác minh trên trình duyệt thật** (không chỉ test đọc source): trang được dựng bằng chính
`renderPlayerProfile()` chạy thật rồi serialize ra HTML tĩnh, tải đúng `site.css` + `app.css`.

| Kiểm tra | Kết quả |
|---|---|
| Position bên trái, Season bên phải, cùng một hàng | 441px / 597px tại viewport 1280, `sameRow: true`, cao bằng nhau |
| Đổ một cột tại 820px | tại 700px: một cột 578px, xếp chồng, không cuộn ngang |
| Tỉ lệ sân | 1.54 ≈ 1050/680 |
| Ô trên sân | `DIV`, `cursor: auto`, LW + RW sáng, LM tối |
| Thủ môn | không có bảng sân, hai card đứng một mình cột trái, badge `GK`, tab `Goalkeeping` đầu tiên |
| Bảng Goalkeeping | `Saves · On Target Faced · Save Rate · Clean Sheets · … · Conceded` — **một** cột Conceded |
| Người không vai | không badge, và `3Y · 1R` **có** trên dòng meta (§2.4) |
| Thanh `TOTAL / PER 90` | không còn trên trang |

---

## 15. Còn lại phải làm: chạy migration

Code đã lên. **`supabase/migrations/0022_match_league_season.sql` chưa chạy trên production** —
xem §2.1 và §12: đó là điều kiện để `client/assets/supa.js?v=14` không làm channel rỗng.

```sql
alter table public.matches add column if not exists league text;
alter table public.matches add column if not exists season text;
create index if not exists matches_league_season_idx on public.matches (club_id, league, season);
```

Kiểm sau khi chạy: `select league, season from public.matches limit 1;` phải trả hai cột `null`
chứ không phải lỗi. Sau đó điền dữ liệu vào hai cột là bảng Season tự tách hàng.

---

## 16. Bản 2 — gỡ hai card và dòng chú thích

Yêu cầu: bỏ hai card `Appearances` / `Minutes` dưới bảng sân, và bỏ dòng `.note` dưới bảng
Season. Kết quả là hồ sơ một cầu thủ **không còn một tile nào**.

### 16.1 `client/assets/app.js`

- `renderPlayerProfile()` — bỏ khối `var kpis = el('div', 'kpis two')` và cả `div.pl-duo-l`.
  Bảng sân giờ là **chính cột trái** của lưới. Và vì lưới chỉ có nghĩa khi có hai thứ để xếp:

  ```js
  var board = positionBoard(who);
  if (board) {
    var duo = el('div', 'pl-duo');
    duo.appendChild(board);
    duo.appendChild(seasonCard(who));
    body.appendChild(duo);
  } else {
    body.appendChild(seasonCard(who));
  }
  ```

  Thủ môn và người không đội hình nào xếp chỗ đều nhận `null` từ `positionBoard()`. Trước đây
  nửa trái của họ là hai card; giờ hai card không còn, nên dựng lưới hai cột sẽ để lại **một
  nửa trống 0.85fr** — đọc như thứ gì đó hỏng. Vì thế họ không có lưới, và thẻ Season rộng
  toàn khung. Đã xác minh: card rộng 1052px trên viewport 1280.

- `seasonCard()` — bỏ `card.appendChild(el('p', 'note', …))`. Thẻ giờ đúng hai thứ:
  `card-h` "Season" và `stbl-wrap`. Dấu `—` trong hai cột đầu tự nói điều dòng chú thích nói.

`kpi()` **không** bị xoá: `renderTeamData()` và `renderOverview()` vẫn dựng tile bằng nó.

### 16.2 `client/assets/app.css`

| | |
|---|---|
| xoá | `.pl-duo-l{…}` — không còn wrapper cột trái |
| xoá | `.kpis.two{…}` — không còn hàng hai tile |
| xoá | `.pl-season .note{margin:0}` |
| đổi | `.pl-season .stbl-wrap{margin-bottom:11px}` → `margin-bottom:0` — bảng là thứ cuối trong thẻ, lề dưới của nó nằm trong padding của thẻ và đọc như một khoảng hở thừa |
| thêm | `.pl-season{margin-bottom:14px}` + `.pl-duo > .pl-season{margin-bottom:0}` — đứng riêng thì thẻ tự mang lề của hàng; nằm trong hàng thì `.pl-duo` đã mang rồi |

`.kpis.six` và hai media query của nó **ở lại** — Team Data vẫn vẽ hàng sáu tile bằng đúng
class đó, và `tests/data-page.test.js:362` canh điều này.

### 16.3 Test

`1419 → 1418` (một test bị gộp): `'a defender-s profile draws…'` và `'the row holds exactly
two things…'` nhập làm một, vì cái đầu chỉ còn kiểm được bảng Season.

| File | Đổi |
|---|---|
| `tests/player-role-cards.test.js` | harness `paintProfile` bỏ `left`/`kpis`/`labels`/`values`, thêm `tiles` (phải luôn rỗng) và đọc `season` từ `.pl-duo` **hoặc** thẳng từ `body`; 5 test viết lại |
| `tests/player-data.test.js` | `'two tiles now…'` → `'no tiles at all now, and NOBODY-s cards are lost'` — đếm `kpi(` trong profile phải bằng **0** |
| `tests/player-season-table.test.js` | `'…carries the note under it'` → `'the card is a title and a table, and nothing else'` |

Ba test mới/đã đổi khoá lại đúng ba điều bản 2 khẳng định: **không tile nào**, **không note
nào**, và **không lưới khi không có bảng sân**.

### 16.4 Cache-bust

`app.css` **19 → 20**, `app.js` **49 → 50**. Cả hai số cũ đã được push lên `main` ở bản 1, nên
sửa nội dung mà giữ nguyên số sẽ để trình duyệt của người đã ghé phục vụ bản cũ. `supa.js`
(v=14) và `shared.js` (v=27) **không đổi** ở bản 2.

### 16.5 Đã xác minh trên trình duyệt

| Kiểm tra | Kết quả |
|---|---|
| Tile bất kỳ trên hồ sơ | `0` |
| Dòng `.note` dưới bảng Season | `0` |
| Tiền đạo | `.pl-duo` = `[card pl-pos, card pl-season]`, 441px / 597px, cùng hàng, cao bằng nhau 327px |
| Thủ môn · người không được xếp chỗ | không `.pl-duo`; thẻ Season đứng riêng rộng 1052px |
| 700px | xếp chồng một cột 578px, khoảng cách dưới hàng 14px, không cuộn ngang |
| Dòng meta | vẫn `2Y · 0R` / `0Y · 1R` / `3Y · 1R` cho cả ba loại cầu thủ |
